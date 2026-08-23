# Task B — quarantine the poison, then find out why it is poison

**You are `agnt-poison-quarantine`.**
**You own exactly: `src/stack.ts`, `src/stack.test.ts`.** Nothing else.

**LIVE-LLM GRANT: **YES — and you are the only worker who has it.** Granted by CORD,
serialized by ORCH: one worker at a time makes live calls, and that is you.
Two conditions, non-negotiable, because the operator's hardware is the stake:
1. **Measure before AND after every live-LLM run:**
   `ps -p 1054 -o pid,pcpu,pmem` (PID 1054 = mlx-omni-server; it was 51.7%
   during the storm and 0.1% idle at 13:36). Report the numbers.
2. **Abort threshold: if it exceeds 60% sustained, STOP** the live diagnosis,
   report to ORCH, and continue with everything that does not need a live call.
   **Do not push through it.**
Use the grant once, deliberately.**

## The invariant

**One un-extractable episode can never block the pipeline.**

## Work items

1. **Convert ALL THREE per-episode killing exits** (fact 3) —
   `src/stack.ts:758` `read-episode`, `:785` `parse-episode`, `:805`
   `extract-llm` — from `fail()` (which exits the whole process, fact 2) into a
   **returned failure result** per the contract in fact 6: set `failed: true`,
   `failurePhase`, `failureCause`, and emit a `degraded()` event so nothing is
   silent. **Do not** call `fail()` anywhere on a per-episode path. The
   `usage` exit at `:969` is CLI-argv validation, not per-episode — leave it.
2. **Read commit `85ed43b` before you start** (fact 13). Same class of bug,
   same shape of fix: `break` -> `continue` plus a dead-letter.
3. **Make the CLI corpus loop continue.** `main()` at `:985-987` loops over
   several filenames; it must process every remaining episode after a failure
   and report the skipped one(s) in its summary. **Exit code 0 with a reported
   skip is the correct outcome** for a corpus where one episode is poison.
4. **PARTITION NOTE:** durable dead-lettering and the digested record are
   **Task A's**, in A's file. You produce the result fields and the event; you
   do not write the dead-letter. Do not edit `src/rem-popmem.ts`.
5. **Then diagnose the actual file.** Copy
   `mind/quarantine/2026-08-21-freeze-stale-design-pause.md` into a temp
   `CIRCADIAN_HOME` — **never back into `mind/episodes/`** — and reproduce the
   EXTRACT failure. Bisect its content: the two long double-quoted transcript
   passages, any embedded `{...}` JSON, the `user-observed:` and
   `what-changed:` sections. Fact 11 already excludes size and token limits.
   Sibling episodes fail *shape/quote validation* frequently in the same log
   (`cause="N candidate(s) failed shape/quote validation"`) — quote handling is
   a **live suspicion, not a conclusion**. Report the cause **as a fact**, or
   `[UNKNOWN]` with an explicit list of what you ruled out. **Do not invent a
   cause.**

## Done-when (each needs evidence — command + real output)

- A test in `src/stack.test.ts` proving a corpus containing a
  **deterministically un-extractable** episode still processes **every other
  episode**, and the bad one is skipped-and-reported. Demonstrated with the
  **actual poison file**, not a synthetic stand-in. Prove it through the CLI
  over a multi-episode corpus (`bun src/stack.ts <tmpHome> good1 poison good2`)
  and assert both the exit code and that `good2` was processed.
- The poison episode's failure cause reported as a fact, or `[UNKNOWN]` + what
  was ruled out.
- `bun test` full suite >= **519 pass / 0 fail**.
- Committed on your own branch off `fix/rem-storm-containment-2026-08-23`,
  staged explicitly.

---

Before you begin, answer these three to ORCH:

1. Do you understand the intent and purpose?
2. What questions do you have?
3. What details are ambiguous?
