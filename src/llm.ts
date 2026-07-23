// llm.ts — the single LLM client for the Circadian metabolism.
//
// SLEEP and REM used to shell out to `claude -p`. They now call the system
// local-LLM service instead: mlx-omni-server, OpenAI-compatible, on
// 127.0.0.1:10240 (see ~/dotfiles/launchagents/LOCALLLM.md — the machine's
// single source of truth for local inference). No cloud, no API key that
// matters, no per-session Claude Code subprocess (so the CIRCADIAN_INTERNAL
// recursion guard that existed only to tame `claude -p` is no longer
// load-bearing for the LLM call itself).
//
// Everything is env-overridable so the same code runs on another machine or
// against a different endpoint without edits:
//   CIRCADIAN_LLM_BASE_URL          (default: LOCAL_LLM_BASE_URL, then :10240/v1)
//   CIRCADIAN_LLM_MODEL             (default: Qwen3-4B-Instruct-2507-4bit)
//   CIRCADIAN_LLM_API_KEY           (default: LOCAL_LLM_API_KEY, then "local"; unused by mlx)
//   CIRCADIAN_LLM_THINK             ("1" to allow the reasoning trace; default off)
//   CIRCADIAN_LLM_FALLBACK_BASE_URL (default: unset — no fallback endpoint)
//   CIRCADIAN_LLM_RETRIES           (default: 3 total attempts per call)
//   CIRCADIAN_LLM_RETRY_BACKOFF_MS  (default: "2000,10000,30000" — delay before
//                                   attempt 2, 3, 4...; the last value repeats
//                                   if RETRIES exceeds the list length)
//
// Resilience (added after the 2026-07-23 outage, when the service returned
// empty content for ~4.5h and every caller failed immediately, then a REM
// pass burned a full 15-minute timeout against a dead service):
// every complete() call preflights GET /models before generating, retries
// retryable failures with bounded backoff, and can fail over to a fallback
// endpoint. Worst-case added latency against a DEAD service (unresponsive
// host, preflight burning its full 5s each time):
//   primary:   3 attempts x 5s preflight + 2s + 10s backoff      = 27s
//   fallback:  + one fallback preflight (5s) if configured       = 32s
// — far better than the old 15-minute generation timeout, and well under
// the 90s budget. (A refused connection fails in ~12s: backoff only.)
//
// Model choice: this is a summarize-and-format job (read a transcript, emit
// strict delimited markdown blocks) — it does NOT need a frontier model.
// Circadian defaults to Qwen3-4B-Instruct: an INSTRUCT model (no <think>
// reasoning trace to strip) that runs ~19x faster and far cooler than the
// 32B reasoning model this used to point at (which pinned the GPU for ~6 min
// per pass and cooked the laptop). It is deliberately NOT tied to
// LOCAL_LLM_CHAT_MODEL: the system default there is the heavy 32B, and
// Circadian must not drag that in. The /no_think prepend + <think> stripping
// below are harmless belt-and-suspenders in case the model is ever
// overridden to a reasoning one.

const BASE_URL =
  process.env.CIRCADIAN_LLM_BASE_URL || process.env.LOCAL_LLM_BASE_URL || "http://127.0.0.1:10240/v1";
const MODEL = process.env.CIRCADIAN_LLM_MODEL || "mlx-community/Qwen3-4B-Instruct-2507-4bit";
const API_KEY = process.env.CIRCADIAN_LLM_API_KEY || process.env.LOCAL_LLM_API_KEY || "local";
const ALLOW_THINK = process.env.CIRCADIAN_LLM_THINK === "1";
const FALLBACK_BASE_URL = process.env.CIRCADIAN_LLM_FALLBACK_BASE_URL || "";
// Total attempts per call (1 = no retries); clamped to >= 1 so the call
// itself can never be configured away.
const RETRIES = Math.max(1, Number.parseInt(process.env.CIRCADIAN_LLM_RETRIES || "3", 10) || 3);
const BACKOFF_MS = (process.env.CIRCADIAN_LLM_RETRY_BACKOFF_MS || "2000,10000,30000")
  .split(",")
  .map((s) => Number.parseInt(s.trim(), 10))
  .filter((n) => Number.isFinite(n) && n >= 0);
if (BACKOFF_MS.length === 0) BACKOFF_MS.push(2000);
// Preflight must fail fast: 5s probing /models beats burning a 15-minute
// generation timeout against a dead service.
const PREFLIGHT_TIMEOUT_MS = 5000;

/** Distinguishes preflight failures internally — the fallback trigger and
 * the required error message both key off this class. Callers still see a
 * plain Error with the documented message. */
class PreflightError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Errors where retrying burns another full generation timeout for the same
 * result: truncation is a budget bug (raise maxTokens), and a
 * reasoning-trace-only reply at finish=stop is a prompt/model mismatch, not
 * a service-health problem. Everything else (transport, abort/timeout,
 * non-2xx, empty content) is retryable. */
function nonRetryable(message: string): boolean {
  return (
    message.startsWith("local LLM output truncated") ||
    message.startsWith("local LLM produced only a reasoning trace")
  );
}

/** Liveness probe: GET /models with a hard 5s ceiling. Throws PreflightError
 * naming the base URL on non-200 or any transport failure. */
async function preflight(base: string): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PREFLIGHT_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
      signal: controller.signal,
    });
    if (res.status !== 200) {
      throw new PreflightError(`LLM preflight failed: ${base} unreachable (HTTP ${res.status})`);
    }
  } catch (err) {
    if (err instanceof PreflightError) throw err;
    const reason =
      err instanceof Error
        ? err.name === "AbortError" || err.name === "TimeoutError"
          ? `timeout after ${PREFLIGHT_TIMEOUT_MS}ms`
          : err.message
        : String(err);
    throw new PreflightError(`LLM preflight failed: ${base} unreachable (${reason})`);
  } finally {
    clearTimeout(timer);
  }
}

/** Remove any <think>...</think> reasoning blocks a reasoning model emits. */
export function stripThink(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

export interface CompleteOptions {
  /** hard wall-clock ceiling for the request */
  timeoutMs: number;
  /** response token budget — must comfortably exceed the largest expected
   * artifact, or the model will be cut off mid-block and the parser will
   * (correctly, loudly) reject the truncated output */
  maxTokens: number;
  /** low by default for format-faithful structured output */
  temperature?: number;
}

/**
 * One-shot chat completion, STREAMED. Returns the assistant text with any
 * reasoning trace stripped. Throws on transport error, non-2xx, truncation,
 * or empty content — the callers treat a throw/empty as "drafting failed"
 * and write nothing (fail loud, never a partial mind).
 *
 * Why streaming: the local model generates at only a few tokens/sec, so a
 * full REM/SLEEP artifact takes many minutes. A non-streaming fetch sends
 * zero bytes until the whole generation completes, which trips the runtime's
 * ~300s socket idle-timeout long before the answer is ready. Streaming keeps
 * bytes flowing, so the only ceiling is our own AbortController (timeoutMs).
 *
 * Single attempt against `base` — the retry/preflight/fallback policy lives
 * in complete() below; a fresh AbortController is created here per attempt
 * because an aborted signal can never be reused.
 */
async function generate(base: string, prompt: string, opts: CompleteOptions): Promise<string> {
  const content = ALLOW_THINK ? prompt : `/no_think\n${prompt}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content }],
        max_tokens: opts.maxTokens,
        temperature: opts.temperature ?? 0.3,
        stream: true,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`local LLM HTTP ${res.status} at ${base}: ${body.slice(0, 300)}`);
    }
    if (!res.body) throw new Error("local LLM returned no response body for a streamed request");

    let acc = "";
    let finish: string | null = null;
    let buf = "";
    const decoder = new TextDecoder();
    const reader = res.body.getReader();

    // Parse Server-Sent Events: lines beginning "data: ", terminated by
    // "data: [DONE]". Each data payload is a chat.completion.chunk whose
    // choices[0].delta.content carries the next token(s).
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? ""; // keep the last, possibly-partial line
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const payload = t.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const chunk = JSON.parse(payload);
          const delta = chunk?.choices?.[0]?.delta?.content;
          if (typeof delta === "string") acc += delta;
          const fr = chunk?.choices?.[0]?.finish_reason;
          if (fr) finish = fr;
        } catch {
          // tolerate keep-alive/comment lines and partial JSON
        }
      }
    }

    if (!acc.trim()) throw new Error("local LLM returned empty content");
    if (finish === "length") {
      // Output hit max_tokens — almost certainly a truncated artifact. Fail
      // loud rather than hand a half-written block to the parser. Never
      // retried (see nonRetryable): retrying burns a full timeout for the
      // same truncated result.
      throw new Error(`local LLM output truncated at max_tokens (${opts.maxTokens}); raise the budget`);
    }

    const stripped = stripThink(acc);
    if (!stripped) throw new Error("local LLM produced only a reasoning trace, no answer");
    return stripped;
  } finally {
    clearTimeout(timer);
  }
}

/** Run preflight+generate against `base` up to RETRIES times with bounded
 * backoff. Retryable failures (transport, abort/timeout, non-2xx, empty
 * content, preflight) log ONE stderr line per failed attempt — the events
 * ledger belongs to callers; llm.ts stays a library. Throws the last error
 * when attempts are exhausted. */
async function attemptLoop(base: string, prompt: string, opts: CompleteOptions): Promise<string> {
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      await preflight(base);
      return await generate(base, prompt, opts);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      if (!(e instanceof PreflightError) && nonRetryable(e.message)) throw e;
      lastErr = e;
      if (attempt < RETRIES) {
        const delay = BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)];
        process.stderr.write(
          `llm: attempt ${attempt} failed (${e.message.replace(/\s+/g, " ")}); retrying in ${delay}ms\n`,
        );
        await sleep(delay);
      }
    }
  }
  throw lastErr ?? new Error("local LLM call failed before any attempt ran");
}

export async function complete(prompt: string, opts: CompleteOptions): Promise<string> {
  try {
    return await attemptLoop(BASE_URL, prompt, opts);
  } catch (primaryErr) {
    // Fail over only when the primary is UNREACHABLE (preflight failure
    // after its retries were exhausted) — generation failures against a live
    // service are the model's problem, not the endpoint's.
    if (!FALLBACK_BASE_URL || !(primaryErr instanceof PreflightError)) throw primaryErr;
    try {
      await preflight(FALLBACK_BASE_URL);
    } catch {
      throw new Error(`${primaryErr.message}; fallback also unreachable`);
    }
    process.stderr.write(`llm: primary unreachable, using fallback ${FALLBACK_BASE_URL}\n`);
    return await attemptLoop(FALLBACK_BASE_URL, prompt, opts);
  }
}
