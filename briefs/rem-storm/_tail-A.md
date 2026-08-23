# Task A — the slot guard, the singleton, and the failure budget

**You are `agnt-rem-slot-guard`.**
**You own exactly: `src/rem-popmem.ts`, `src/rem-popmem.test.ts`.** Nothing else.

**LIVE-LLM GRANT: NO.** You may make zero calls to `:10240`. Inject failure
through content or a stub payload. If you believe a done-when requires a live
call, `need-help` to ORCH — do not take the grant yourself.

## The invariant

**At most ONE REM pass in flight, ever**, and **a failed run must never present
as a missed slot forever.**

## Work items

1. **THE ROOT (fact 8).** `isDue` (`:208`) returns true iff no run has
   *completed* since the slot opened, so a failed run is indistinguishable from
   one that never ran and every subsequent session re-fires it. Make a failed
   run **record its attempt against the slot**, so `isDue` can tell "never ran"
   from "tried and failed", and a failed slot stops being re-offered.
   **RULING (CORD): (a) with K=1, ruled by CORD. A failure **BURNS the slot immediately** —
   no session ever retries within a slot. The consecutive-failure counter
   **spans slots**; N=3 is the ~1.5-day backstop. Max 2 REM attempts per day is
   the number that actually kills the herd: **a retry is the disease, not the
   cure.****
2. **Extend the single-flight lock to the WHOLE entry path**, not just
   `--if-due` (fact 7). Two REM passes must not overlap by any route. Preserve
   the existing pid-liveness + shipped `maxAgeMs`; invent no new timeout. If the
   stale-lock question cannot be answered honestly, mark it `[UNKNOWN]` and
   report — do not guess.
3. **Consecutive-failure budget, N = 3** (CORD's ruling; precedent
   `PENDING_ATTEMPTS_CAP` at `src/sleep.ts:83`). After three consecutive failed
   passes: stop attempting, emit a **loud `degraded()` event naming the blocking
   episode**, and stay stopped. Use `degraded()`, **not** `fail()` — the pass
   must finish its non-LLM work and exit cleanly (fact 2). No TTL, no auto-reset
   timer: a stuck state a human must clear is the correct behavior.
   Clearing surface (ORCH ruling): a durable stop-state file, cleared by a
   successful **manual** (non-`--if-due`) run.
4. **CONSUME the failure contract (fact 6).** In the episode loop
   (`:1060-1071`), a `StackEpisodeResult` with `failed: true` must **`continue`**
   — not abort the pass — and must be recorded as held-aside rather than
   `disposition: "absorbed"`. **You own the durable dead-letter and the
   digested record; Task B only produces the result fields.** A human must be
   able to see which episode is held aside and why, and it must not be retried
   on every pass.
5. **Fix the multiplier (fact 4).** `recordDigested` at `:1072` runs only after
   the loop, so a pass that dies mid-loop records nothing and the next pass
   re-EXTRACTs everything ahead of the poison. Record digested **incrementally**,
   per episode, as it succeeds.

## Done-when (each needs evidence — command + real output)

- A test in `src/rem-popmem.test.ts`, real subprocess against a real temp
  `CIRCADIAN_HOME` (fact 12), proving:
  (a) a pass starts, and **a second concurrent pass refuses to start**;
  (b) **three consecutive failed PASSES, across three slots, stop the fourth
      from starting**, with the degraded event naming the blocking episode.
      CORD amended this wording so it is expressible: **drive it with
      scoreboard / stop-state fixtures, not a real 36-hour wait.** Test the
      state machine, not the calendar;
  (c) an episode-level failure **no longer wedges the pass** — the remaining
      episodes still process and the successful ones are recorded digested.
- `bun test` full suite >= **519 pass / 0 fail**.
- Committed on your own branch off `fix/rem-storm-containment-2026-08-23`,
  staged explicitly.

---

Before you begin, answer these three to ORCH:

1. Do you understand the intent and purpose?
2. What questions do you have?
3. What details are ambiguous?
