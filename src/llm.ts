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
//   CIRCADIAN_LLM_BASE_URL  (default: LOCAL_LLM_BASE_URL, then :10240/v1)
//   CIRCADIAN_LLM_MODEL     (default: Qwen3-4B-Instruct-2507-4bit)
//   CIRCADIAN_LLM_API_KEY   (default: LOCAL_LLM_API_KEY, then "local"; unused by mlx)
//   CIRCADIAN_LLM_THINK     ("1" to allow the reasoning trace; default off)
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
 */
export async function complete(prompt: string, opts: CompleteOptions): Promise<string> {
  const content = ALLOW_THINK ? prompt : `/no_think\n${prompt}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
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
      throw new Error(`local LLM HTTP ${res.status} at ${BASE_URL}: ${body.slice(0, 300)}`);
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
      // loud rather than hand a half-written block to the parser.
      throw new Error(`local LLM output truncated at max_tokens (${opts.maxTokens}); raise the budget`);
    }

    const stripped = stripThink(acc);
    if (!stripped) throw new Error("local LLM produced only a reasoning trace, no answer");
    return stripped;
  } finally {
    clearTimeout(timer);
  }
}
