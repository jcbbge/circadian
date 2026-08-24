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
//   CIRCADIAN_LLM_MAX_CONCURRENT    (default: 1 — cross-process concurrency
//                                   cap against the shared local LLM; see the
//                                   "concurrency cap" section below)
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
// rem-storm hardening (2026-08-23): a thundering herd cooked the operator's
// laptop by treating "connection refused because our own load exhausted the
// server's backlog/workers" identically to "the service is dead" — both were
// worded "unreachable" and both were retried on the same fixed, unjittered
// schedule, so every failed caller retried in lockstep. Two fixes below:
// (1) DOWN (nothing listening, ECONNREFUSED) now stops immediately instead
//     of retrying into the ground; BUSY (server alive but refusing/erroring
//     under load) backs off with jitter so callers desynchronize; (2) a
//     cross-process concurrency cap (see below) bounds how many circadian
//     calls may be in flight against the shared endpoint at once, because an
//     in-process semaphore cannot see the wake.ts and circadian-mind.ts
//     fan-outs, which are separate processes.
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

import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE_URL =
  process.env.CIRCADIAN_LLM_BASE_URL || process.env.LOCAL_LLM_BASE_URL || "http://127.0.0.1:10240/v1";
// 2026-07-27: default moved 4B → 30B-A3B (same Instruct-2507 family/template,
// MoE with 3B ACTIVE params — 4B-class speed and heat, ~16 GB resident).
// Head-to-head on the replay bench: counterfeit quotes 3→1, malformed grammar
// lines 1→0 vs the 4B. The dense-32B ban above still stands; this is not that.
const MODEL = process.env.CIRCADIAN_LLM_MODEL || "mlx-community/Qwen3-30B-A3B-Instruct-2507-4bit";
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
// Herd-desync jitter applied to every backoff sleep: +/-40% of the
// configured base delay. A fixed, unjittered backoff is a herd amplifier —
// every caller that failed at the same moment retries at the same moment.
const BACKOFF_JITTER_FACTOR = 0.4;
// Preflight must fail fast: 5s probing /models beats burning a 15-minute
// generation timeout against a dead service.
const PREFLIGHT_TIMEOUT_MS = 5000;

// ---------------------------------------------------------------------
// cross-process concurrency cap (rem-storm hardening, work item 3)
//
// The endpoint at BASE_URL is shared with graphiti, colgrep and pickbrain,
// which sit in an operator's interactive loop; circadian is a background
// metabolism with no latency SLA. This cap exists to leave headroom on the
// shared service, not to make circadian fast — CORD ruled N=1 for exactly
// that reason (ORCH recommended 2 and was overruled).
//
// An in-process semaphore cannot see this: wake.ts's REM catch-up and
// circadian-mind.ts's sleep workers are separate OS processes, so the cap
// has to live on disk. One file per slot under CIRCADIAN_HOME/logs/llm-cap/,
// created with the atomic O_EXCL flag used by the sleep-claims and
// acquireIfDueLock patterns elsewhere in this codebase (src/sleep.ts,
// src/rem-popmem.ts:127) — same shape, same reason: a live PID holds the
// slot, a dead or stale one is reclaimed.
// ---------------------------------------------------------------------
const CIRCADIAN_HOME = process.env.CIRCADIAN_HOME || join(homedir(), "circadian");
const CAP_DIR = join(CIRCADIAN_HOME, "logs", "llm-cap");
// Escape hatch, deliberate, house style (mirrors CIRCADIAN_LLM_RETRIES
// above). Raising this above 1 must be a one-line change justified by a
// MEASUREMENT of REM pass duration against the shared endpoint's actual
// headroom — never a guess that "more concurrency is faster."
// 2, not 1 (revised 2026-08-23). N=1 was set when the statusline was booting
// a runtime 459 times an hour and graze fired on every tool call; circadian
// genuinely had to be throttled to one in-flight call to stop starving
// graphiti/colgrep/pickbrain. Both of those sources are now gone
// (bin/circadian-statusline, bin/circadian-graze-gate), so strict
// serialization is over-correction: it made every background call queue
// behind every other for no measured benefit. 2 keeps real headroom on the
// shared endpoint while letting a sleep draft and a graze checkpoint overlap.
const MAX_CONCURRENT = Math.max(
  1,
  Number.parseInt(process.env.CIRCADIAN_LLM_MAX_CONCURRENT || "2", 10) || 2,
);
// A wedged background process (dead mid-hold) is worse than a deferred pass:
// a deferred pass retries at the next REM slot, a wedged one holds a lock
// forever. Same ceiling as acquireIfDueLock's maxAgeMs (src/rem-popmem.ts),
// reused deliberately rather than inventing a second timeout.
const CAP_SLOT_STALE_MS = 30 * 60 * 1000;
// On saturation: wait, jittered, up to this ceiling, then classify the
// deferral as busy-not-failure and hand control back to the caller. Chosen
// for the same reason as CAP_SLOT_STALE_MS's reuse above: a caller that
// waits forever for the cap is itself a wedge; one that gives up and is
// retried at the next slot is not.
// 5s, NOT 120s (fixed 2026-08-23). A 120s ceiling meant one slow call could
// stall every other circadian LLM call for two minutes, and every caller here
// is BACKGROUND metabolism with a natural retry:
//   - a graze checkpoint that defers re-checkpoints in <= 15 min
//   - a sleep draft that defers goes to logs/pending-sleep.jsonl and drains
//   - a REM pass that defers runs at the next slot
// So queueing for 2 minutes buys nothing any of them needed and costs
// everything behind it. 5s absorbs genuine brief contention (one call
// finishing) and then gets out of the way. Deferral is cheap here BY DESIGN;
// blocking is not.
const CAP_WAIT_CEILING_MS = Math.max(
  100,
  Number.parseInt(process.env.CIRCADIAN_LLM_CAP_WAIT_MS || "5000", 10) || 5000,
);

/** Thrown when the local concurrency cap could not be acquired within
 * CAP_WAIT_CEILING_MS. This is NOT an endpoint failure — the endpoint may be
 * perfectly healthy; circadian's own cap is what is saturated. Callers MUST
 * treat this as a deferral (retry at the next natural opportunity), never as
 * a processing failure: feeding it to a failure/dead-letter budget would
 * rebuild the storm this cap exists to prevent, one layer up. */
export class LlmSaturatedError extends Error {}

interface CapSlot {
  pid: number;
  ts: number;
}

function readSlot(slotPath: string): CapSlot | null {
  try {
    const raw = JSON.parse(readFileSync(slotPath, "utf8"));
    return { pid: Number(raw.pid) || 0, ts: Number(raw.ts) || 0 };
  } catch {
    return null;
  }
}

function slotIsLive(slot: CapSlot): boolean {
  if (slot.pid <= 0) return false;
  if (Date.now() - slot.ts >= CAP_SLOT_STALE_MS) return false;
  try {
    process.kill(slot.pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Try once to claim any free slot (stale or never-held slots count as
 * free). Returns a release function on success, or null if every slot is
 * live-held by another process right now. */
function tryAcquireCapSlot(): (() => void) | null {
  try {
    mkdirSync(CAP_DIR, { recursive: true });
  } catch {
    // FS trouble creating the cap dir must not be the reason a background
    // metabolism call is refused outright; treat as "no free slot", the
    // caller's poll loop will retry.
    return null;
  }
  for (let i = 0; i < MAX_CONCURRENT; i++) {
    const slotPath = join(CAP_DIR, `slot-${i}`);
    try {
      writeFileSync(slotPath, JSON.stringify({ pid: process.pid, ts: Date.now() }), { flag: "wx" });
      return releaseFnFor(slotPath);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") continue; // unexpected FS error -> try next slot
      const existing = readSlot(slotPath);
      if (existing && slotIsLive(existing)) continue; // genuinely held -> try next slot
      try {
        unlinkSync(slotPath); // stale or unparseable -> reclaim
        writeFileSync(slotPath, JSON.stringify({ pid: process.pid, ts: Date.now() }), { flag: "wx" });
        return releaseFnFor(slotPath);
      } catch {
        continue; // lost the reclaim race -> try next slot
      }
    }
  }
  return null;
}

function releaseFnFor(slotPath: string): () => void {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    try {
      const slot = readSlot(slotPath);
      if (slot && slot.pid === process.pid) unlinkSync(slotPath);
    } catch {
      // already gone / not ours — fine
    }
  };
}

/** Blocks (via jittered polling, never a busy-loop) until a concurrency
 * slot is free or CAP_WAIT_CEILING_MS elapses. Held per-call and released
 * immediately after — never across separate complete() calls, and never
 * while sleeping between retry attempts (see attemptLoop): a process must
 * not hold the cap while it thinks. */
async function acquireCapSlot(): Promise<() => void> {
  const deadline = Date.now() + CAP_WAIT_CEILING_MS;
  for (;;) {
    const release = tryAcquireCapSlot();
    if (release) return release;
    if (Date.now() >= deadline) {
      throw new LlmSaturatedError(
        `llm busy, deferred: all ${MAX_CONCURRENT} concurrency slot(s) against ${BASE_URL} held for >= ${CAP_WAIT_CEILING_MS}ms`,
      );
    }
    const pollDelay = Math.min(deadline - Date.now(), jitteredDelay(500));
    await sleep(Math.max(50, pollDelay));
  }
}

/** Distinguishes preflight failures internally — the fallback trigger and
 * the required error message both key off this class. Callers still see a
 * plain Error with the documented message. */
class PreflightError extends Error {}
/** The endpoint is genuinely DOWN: nothing is listening (ECONNREFUSED). Stop
 * — retrying into the ground against a dead service is exactly the failure
 * mode this hardening removes. */
class PreflightDownError extends PreflightError {}
/** The endpoint is alive but refusing/erroring under load (backlog or
 * worker exhaustion — including OUR OWN concurrent load, fact 10). Back off
 * with jitter and retry; never word this "unreachable" — that wording is
 * what made a self-inflicted storm look like a dead service. */
class PreflightBusyError extends PreflightError {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** +/-BACKOFF_JITTER_FACTOR spread around `baseMs`, so callers that failed
 * at the same instant desynchronize instead of retrying in lockstep. */
function jitteredDelay(baseMs: number): number {
  const spread = baseMs * BACKOFF_JITTER_FACTOR;
  return Math.max(0, Math.round(baseMs + (Math.random() * 2 - 1) * spread));
}

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

/** Liveness probe: GET /models with a hard 5s ceiling. Classifies failures
 * as DOWN (nothing listening — ECONNREFUSED) or BUSY (server accepted the
 * connection, or responded, but errored/reset/timed out — alive under
 * load). Only DOWN causes attemptLoop to give up without retrying. */
async function preflight(base: string): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PREFLIGHT_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
      signal: controller.signal,
    });
    if (res.status !== 200) {
      throw new PreflightBusyError(
        `LLM busy: ${base} responded HTTP ${res.status} — alive but refusing/overloaded, not down`,
      );
    }
  } catch (err) {
    if (err instanceof PreflightError) throw err;
    const code = err instanceof Error ? (err as NodeJS.ErrnoException).code : undefined;
    const isTimeout = err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
    // ConnectionRefused/ECONNREFUSED: the OS itself refused the SYN — nothing
    // is listening, genuinely down (fact 10). Everything else (ECONNRESET
    // from a connection accepted-then-reset, our own preflight timeout, any
    // other transport error) means the process is alive enough to touch the
    // socket, or is merely slow — busy, not down.
    if (code === "ConnectionRefused" || code === "ECONNREFUSED") {
      throw new PreflightDownError(`LLM down: ${base} refused the connection (${code}) — nothing is listening`);
    }
    const reason = isTimeout
      ? `timeout after ${PREFLIGHT_TIMEOUT_MS}ms`
      : err instanceof Error
        ? `${code ?? err.name}: ${err.message}`
        : String(err);
    throw new PreflightBusyError(`LLM busy: ${base} refused/reset under load (${reason})`);
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
        // The final chunk carries `usage` — the only honest truncation signal
        // this server gives (see the ceiling check below).
        stream_options: { include_usage: true },
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
    let completionTokens: number | null = null;
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
          const ct = chunk?.usage?.completion_tokens;
          if (typeof ct === "number") completionTokens = ct;
        } catch {
          // tolerate keep-alive/comment lines and partial JSON
        }
      }
    }

    if (!acc.trim()) throw new Error("local LLM returned empty content");
    // TRUNCATION. finish_reason is the OpenAI-contract signal, but this
    // machine's local server LIES: probed 2026-08-14 against
    // http://127.0.0.1:10240/v1, a generation cut off mid-word by max_tokens
    // still reports finish_reason "stop" (max_tokens 10/30/64 all returned
    // "stop" on a hard cut). The usage block requested above is the honest
    // number, and on a cut the server's own count lands exactly one under the
    // ceiling (10 -> 9, 30 -> 29, 64 -> 63), so the ceiling test is
    // `>= maxTokens - 1`. A false positive here costs one loud "raise the
    // budget"; a false negative hands the parser a half-written block, which
    // is precisely how the REM propagation judgment silently flatlined for
    // three runs (2026-08-12..14) and drove the R7 kill switch to 905
    // (audit 2026-08-14 §P0-1). Never retried (see nonRetryable): retrying
    // burns a full timeout for the same truncated result.
    const hitCeiling = completionTokens !== null && completionTokens >= opts.maxTokens - 1;
    if (finish === "length" || hitCeiling) {
      throw new Error(`local LLM output truncated at max_tokens (${opts.maxTokens}); raise the budget`);
    }

    const stripped = stripThink(acc);
    if (!stripped) throw new Error("local LLM produced only a reasoning trace, no answer");
    return stripped;
  } finally {
    clearTimeout(timer);
  }
}

/** Run preflight+generate against `base` up to RETRIES times with jittered,
 * capped backoff. The concurrency-cap slot is acquired fresh for each
 * attempt and released immediately after it (success or failure) — never
 * held across the backoff sleep between attempts, and never across separate
 * complete() calls: a process must not hold the cap while it thinks.
 * Retryable failures (transport, abort/timeout, non-2xx, empty content,
 * busy-preflight) log ONE stderr line per failed attempt — the events
 * ledger belongs to callers; llm.ts stays a library. A DOWN classification
 * or a cap saturation stops immediately, without spending a retry. Throws
 * the last error when attempts are exhausted. */
async function attemptLoop(base: string, prompt: string, opts: CompleteOptions): Promise<string> {
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    let release: (() => void) | null = null;
    try {
      release = await acquireCapSlot();
      await preflight(base);
      const out = await generate(base, prompt, opts);
      release();
      return out;
    } catch (err) {
      if (release) release();
      const e = err instanceof Error ? err : new Error(String(err));
      // Cap saturation is a deferral, not a retryable endpoint failure —
      // hand it straight back to the caller (see LlmSaturatedError).
      if (e instanceof LlmSaturatedError) throw e;
      // Down: stop, do not retry into the ground.
      if (e instanceof PreflightDownError) throw e;
      if (!(e instanceof PreflightError) && nonRetryable(e.message)) throw e;
      lastErr = e;
      if (attempt < RETRIES) {
        const baseDelay = BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)];
        const delay = jitteredDelay(baseDelay);
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
    // Fail over only when the primary is UNREACHABLE (a DOWN or BUSY
    // preflight failure after its retries were exhausted) — generation
    // failures against a live service are the model's problem, not the
    // endpoint's, and cap saturation (LlmSaturatedError) is never a reason
    // to fail over to a second endpoint that shares the same cap concern.
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
