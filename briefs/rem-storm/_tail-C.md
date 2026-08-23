# Task C — tell the truth about the endpoint, and stop starving it

**You are `agnt-endpoint-truth`.**
**You own exactly: `src/llm.ts`, and a NEW `src/llm.test.ts`.** Nothing else.
There is no `src/llm.test.ts` today — you create it.

**LIVE-LLM GRANT: NO.** Classification and cap behavior are provable against a
local throwaway HTTP server you control (one that refuses, one that 503s, one
that is absent) — that is stronger evidence than the shared endpoint anyway, and
it is deterministic. Do not point your tests at `:10240`.

## The invariant

**Circadian must not be able to starve a service that graphiti, colgrep and
pickbrain also depend on.**

## Work items

1. **Distinguish DOWN from BUSY, and handle them differently.** Today
   `preflight()` (`:89`) reports `timeout after 5000ms` for an AbortError and
   `err.message` otherwise, and wraps everything in the wording
   `<base> unreachable (...)`. A **connection refusal while the server is still
   LISTENING** (backlog / worker exhaustion under our own load, fact 10) is
   currently reported as "unreachable" — which is what made a self-inflicted
   storm look like a service outage to the operator.
   - **down** -> stop; do not retry into the ground.
   - **busy / refusing under load** -> back off with jitter under a cap.
   - **Fix the wording.** "unreachable" must not be emitted for a
     refused-under-load condition. The message an operator reads must say which
     of the two it was.
2. **Add jitter and a cap to the backoff** (fact 9: `RETRIES` `:58`,
   `BACKOFF_MS` `:59`, currently `2000,10000,30000` with **no jitter**, and with
   RETRIES=3 only 2 s and 10 s are ever used). Unjittered backoff is a herd
   amplifier.
3. **Add a CROSS-PROCESS concurrency cap** for circadian's calls against
   `:10240`. An in-process semaphore is **not enough** — the two fan-outs
   (`src/wake.ts:409`, `src/circadian-mind.ts:239`) are **separate processes**.
   Keep it as simple as it can be and still be true; a lock/counter directory
   under `logs/` in the spirit of `logs/sleep-claims/` is an acceptable shape.
   **RULING (CORD): **N = 1**, ruled by CORD (ORCH recommended 2 and was overruled — the
   reasoning is yours to have, not just to comply with). The cap's job is not to
   make circadian fast; it is to leave headroom on a service that graphiti,
   colgrep and pickbrain also depend on and that gets **no share** under
   circadian's cap. Circadian is a background metabolism with no latency SLA;
   those three sit in an operator's interactive loop. When the stake is the
   operator's hardware and the cost is latency nobody observes, take the latency.
   - **Held per-call and released immediately after — NEVER held across calls.**
     A process must not hold the cap while it thinks.
   - **Escape hatch, deliberate:** one named constant with an env override in the
     house style (see `CIRCADIAN_LLM_RETRIES`, `src/llm.ts:58`). Raising it to 2
     must be a one-line change justified by a **measurement** of REM pass
     duration, never a guess. Say exactly that in a comment.
   - **On saturation: WAIT** — jittered polling, **ceiling 120 s** — then
     classify **"busy, deferred" as a state DISTINCT from failure.** A deferral
     must never feed Task B's dead-letter or Task A's failure budget. Why 120 s
     and not unbounded: a wedged background process is worse than a deferred
     pass — a deferred pass is retried at the next slot, a wedged one holds a
     lock.**
4. **FENCE — hard.** You may NOT touch the LLM server's own config
   (`~/dotfiles/...`), and may NOT provision a second LLM. If you conclude the
   server itself is at fault, that is a **finding you report to ORCH**, who
   routes it to CORD. It is not a fix you make.

## Done-when (each needs evidence — command + real output)

- Tests in a new `src/llm.test.ts` proving:
  (a) a **refusing** endpoint is classified **busy** and backed off **with
      jitter** — and is NOT reported as unreachable (assert the message);
  (b) a **genuinely absent** endpoint is classified **down** and does **not**
      retry to exhaustion;
  (c) the concurrency cap **holds across processes** — prove it with real
      separate subprocesses, not one process with two promises.
- `bun test` full suite >= **519 pass / 0 fail**.
- Committed on your own branch off `fix/rem-storm-containment-2026-08-23`,
  staged explicitly.

---

Before you begin, answer these three to ORCH:

1. Do you understand the intent and purpose?
2. What questions do you have?
3. What details are ambiguous?
