# W2 — LLM resilience: preflight, bounded retry, fallback

**Model tier: default (judgment required).** Circadian repo (/Users/jrg/circadian), Bun + TypeScript, no package.json. Overnight on 2026-07-23 the local LLM service returned empty content for ~4.5 hours (00:46–05:04) and aborted a REM pass at 15:37 — every caller failed immediately with no retry, no fast preflight, no fallback. Your job: make src/llm.ts resilient without changing its contract. Do NOT use emojis anywhere.

## Pre-Verified Facts (coordinator verified all of these personally this session)

- src/llm.ts (137 lines) exports `complete(prompt, opts: {timeoutMs, maxTokens, temperature?}): Promise<string>` and `stripThink(text)`. It POSTs `${BASE_URL}/chat/completions` with `Accept: text/event-stream`, parses SSE `data:` lines, accumulates `choices[0].delta.content`.
- Config (top of file): `BASE_URL = process.env.CIRCADIAN_LLM_BASE_URL || process.env.LOCAL_LLM_BASE_URL || "http://127.0.0.1:10240/v1"`; `MODEL = process.env.CIRCADIAN_LLM_MODEL || "mlx-community/Qwen3-4B-Instruct-2507-4bit"`; `API_KEY = ... || "local"`; `/no_think` prepend unless CIRCADIAN_LLM_THINK=1.
- Current throw behavior (keep these semantics): non-2xx/transport → throw; empty accumulated content → `throw new Error("local LLM returned empty content")`; `finish_reason === "length"` → throw truncation error mentioning maxTokens; only a reasoning trace → throw.
- Callers (do NOT change them): src/sleep.ts (`draftViaLLM` catches all throws → null → retry-at-drafting-layer → queue per W1), src/rem.ts (LLM failure → `fail()` exit 1 — the loud behavior that produced the launchctl exit-1 fossil), src/graze.ts (catch → degraded, offset not advanced, self-healing).
- The service is LIVE right now: `curl -s -m 5 http://127.0.0.1:10240/v1/models` returns 200 with a model list (doctor verifies this exact probe at 16:52 today).
- Dead-endpoint drill: `http://127.0.0.1:9/v1` (port 9 = discard; connection refused immediately).
- Evidence trail in logs/circadian.events.jsonl: 00:46, 00:54, 01:03, 04:58 graze "local LLM returned empty content"; 03:00 rem failed "local LLM call failed; no mind files were modified"; 15:37 rem failed "The operation was aborted." (timeout 900000ms).

## Parallel Work Notice

W1 owns src/sleep.ts + src/backfill.ts + src/rem.ts (pending-queue; your `complete()` signature is FROZEN — they code against it as-is). W3 owns src/doctor.ts. Touch nothing but src/llm.ts. Post your CLAIM to the tower board per the worker contract before editing.

## Tasks

1. **Preflight liveness probe** — done when: before any generation, `complete()` GETs `${base}/models` with a 5s timeout; non-200/transport failure → throw `Error("LLM preflight failed: <base> unreachable (<reason>)")` WITHOUT attempting generation. Failing fast in <6s beats burning a 15-minute timeout against a dead service.
2. **Bounded retry with backoff** — done when: transport errors, aborts/timeouts, non-2xx, and empty-content throws are retried up to 3 total attempts with delays 2s → 10s → 30s (env-tunable: `CIRCADIAN_LLM_RETRIES` default 3, `CIRCADIAN_LLM_RETRY_BACKOFF_MS` default "2000,10000,30000"). `finish_reason === "length"` truncation is NEVER retried (it is a budget bug; retrying burns 15 min for the same result). Each retry logs ONE stderr line `llm: attempt N failed (<reason>); retrying in Xms` — the events ledger belongs to callers; llm.ts stays a library.
3. **Fallback endpoint** — done when: `CIRCADIAN_LLM_FALLBACK_BASE_URL` (optional, unset by default). If the primary preflight fails (after its retries are exhausted on preflight-failure), preflight the fallback; if it passes, use it for this call and log one stderr line `llm: primary unreachable, using fallback <url>`. If both fail, throw the primary's error with `fallback also unreachable` appended. Model/API-key envs apply to both endpoints.
4. **Contract frozen** — done when: signature, streaming behavior, /no_think prepend, stripThink, and all four existing throw semantics are unchanged; callers compile and behave identically on the happy path.

## Constraints

- Touch ONLY: src/llm.ts. Do not commit or stage.
- No mocks: verify against the real service (success legs) and a real dead port (failure legs). Never stub fetch.
- Total worst-case added latency on a dead service: preflight (5s × attempts) + backoff — keep full failure under ~90s, not 15 minutes. Document the arithmetic in a comment.
- The abort/timeout path uses AbortController (existing) — retries must create a fresh controller per attempt (no reused aborted signal).

## Verification (run exactly these as a /tmp bun script or inline bun -e, paste tails)

1. Happy path: real `complete("Reply with exactly: CIRCADIAN_OK", {timeoutMs: 60000, maxTokens: 50})` → returns containing CIRCADIAN_OK.
2. Dead primary, no fallback: BASE_URL=http://127.0.0.1:9/v1 → throws in <90s; message names the URL; retry stderr lines visible.
3. Dead primary + live fallback: BASE_URL=dead, CIRCADIAN_LLM_FALLBACK_BASE_URL=http://127.0.0.1:10240/v1 → succeeds; fallback stderr line visible.
4. Truncation: real service, maxTokens: 5, prompt asking for a long paragraph → throws truncation error, NO retry lines (verify by absence of retry stderr).
5. Regression: `CIRCADIAN_HOME=/tmp/circ-w2-mind bun src/graze.ts --help`-style smoke is NOT required — instead: `bun src/rem.ts --dry-run` against the real home (read-only dry run) → completes its normal path (LLM live) exactly as before your change.

## Report back with

Diff summary line-level; full tails of verification 1-5 (including wall-clock timings for step 2); deviations with reasons; every file created/modified. Write logs/fleet/circadian-W2-llm-resilience.done per the worker contract.
