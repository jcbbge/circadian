# PICKUP — ORCH rem-storm-hardening (stood down 2026-08-23)

Unit: make the REM retry storm structurally impossible.
Brief: `briefs/rem-storm/ORCH-rem-storm-hardening-2026-08-23.md`
Parent (CORD): `orch-circadian-rem-storm`, pane `w8X:p2`.
Branch: **`fix/rem-storm-hardening`** — pushed, tracking
`origin/fix/rem-storm-hardening`, tip `700ff65`.

## STATE IN ONE LINE

The unit is **functionally COMPLETE and GREEN**; what is unfinished is the
**gate**, not the work. `bun test` -> **530 pass / 1 skip / 0 fail / 3907
expect() / 26 files / 43.34s** (floor was 519/0). Nothing is half-edited.

## WHAT LANDED, WITH EVIDENCE

All on `fix/rem-storm-hardening`, branched off
`fix/rem-storm-containment-2026-08-23`:

| SHA | What |
|---|---|
| `bfbfe03` | wave-1 criteria — 9 red tests (criteria-first, per the door's verify gate) |
| `a161002` | Task B — `src/stack.ts`: per-episode failures never wedge the corpus |
| `802bff8` | Task C — `src/llm.ts`: down vs busy, jittered backoff, cross-process cap |
| `4ae0264` | Task A — `src/rem-popmem.ts`: slot guard, whole-path lock, failure budget |
| `8ddbd10` | merge Task A |
| `f729e9c` | merge Task C |
| `700ff65` | docs — wave-2 addenda, both worktree corrections recorded |

Verified in the artifacts, not from worker claims:
- `src/stack.ts:774` / `:803` / `:825` each now **return**
  `{ skipped: true, failed: true, failurePhase, failureCause }` instead of
  calling `fail()`. The only `fail()` left in that file is `:981`, the CLI usage
  exit, which is correctly not per-episode. **All three** per-episode killing
  exits are converted — the original brief named only `extract-llm`.
- `src/rem-popmem.ts`: single-flight lock now covers the whole entry path (a live
  `--if-due` lock also blocks a concurrent MANUAL run — that was the hole);
  `consecutiveFailedSlotStreak()` over `scoreboard.jsonl`'s trailing failed "rem"
  events implements CORD's N=3 with **no new stop-state file**; digested is
  recorded **incrementally per-episode** (kills the fact-4 multiplier); failed
  episodes are held aside under a new `"held-aside"` disposition.
- `src/llm.ts`: `CIRCADIAN_LLM_MAX_CONCURRENT` (default **1**, CORD's ruling),
  held per-call and released immediately, 120 s jittered wait ceiling, and
  **"busy, deferred" as a state DISTINCT from failure** so a deferral cannot feed
  A's budget or B's dead-letter.

## WHAT IS UNFINISHED, AND EXACTLY WHERE IT STOPPED

1. **The merge to `fix/rem-storm-containment-2026-08-23` never happened.** By
   design — CORD gates the merge. Branch is pushed and green; it stopped at
   "waiting for CORD's gate."
2. **Containment was never lifted.** `com.circadian.rem` and
   `com.circadian.rem-catchup` are **still booted out** (CORD's containment,
   `CONTAINMENT-2026-08-23-rem-storm.md`), and the poison episode is still at
   `mind/quarantine/2026-08-21-freeze-stale-design-pause.md`. Correct as-is —
   do NOT restore either without doing the two-step below.
3. **End-to-end behavior against the real endpoint under real load is NOT
   proven.** Every invariant is proven *by test*. The single live-LLM grant was
   spent and then aborted at 65% CPU (over CORD's 60% threshold). A green suite
   does not prove the laptop is safe. This is the real gap.
4. **The `1 skip`** is the live-gated poison test, blocked by R1 below.

## [UNKNOWN] I NEVER CLOSED

**U1 — Why the "poison" episode fails EXTRACT. Still [UNKNOWN], and the premise
itself is contradicted.** The brief's Pre-Verified Fact 11 frames the file as
deterministically un-extractable. It is not, on the one observation we got: it
**extracted successfully** — `stacked poison.md: 5 new (0 superseding), 0
stacked, 0 bumped, 0 rejected, 0 dropped-over-cap`.

HYPOTHESIS, explicitly **not** a fact: the failure is **load-induced, not
content-induced** — it fails only when the endpoint is already saturated. If so
the causal story inverts: a busy endpoint caused an EXTRACT failure, `fail()`
exited the pass mid-loop, nothing was recorded digested, the slot stayed due
forever, every new session re-fired and re-extracted from scratch, which
saturated the endpoint further. **The document was a symptom, not the cause.**

Ruled out: size and token limits (2410 bytes / 12 lines, among the smallest of
~380). NOT ruled out: quote/shape validation, and the load hypothesis itself.
Caveats I will not bury: ONE partial observation, log read *before* the run was
killed, no clean end-to-end pass. Enough to invalidate the premise; **not** enough
to assert the replacement.

**The structural fix does not depend on which is true** — a pass now survives any
per-episode failure whatever its cause.

## HELD QUESTIONS — 3, all owned by CORD `orch-circadian-rem-storm`

- **R1. The live-gated poison test has no per-test timeout override.** bun's
  default 5000 ms kills it before its own internal 120 s `spawnSync` timeout can
  elapse; the first live invocation returned `run.status === null` ("killed 1
  dangling process") — not a real pass/fail signal. Needs a one-line `timeout`
  arg on that `test()` call, **by someone who is not its implementer** (the
  verify gate forbids the implementer editing it; worker B correctly refused).
  This is why the suite reports `1 skip`.
- **R2. Is the poison episode actually poison?** = U1. Needs a controlled live
  re-run on an **idle** endpoint. Decides whether the quarantine stays.
- **R3. `src/zoom.test.ts` flakes against live shared state.**
  `collectEpisodes()` runs at describe-time (`zoom.test.ts:61`) while
  `readdirSync` runs inside the test (`:64`), so an episode written by ANY other
  agent session in that window is live-but-unrecorded and
  `expect(rec).toBeDefined()` fails. Hit once in my runs; passes in isolation
  (`bun test src/zoom.test.ts` -> 16 pass / 0 fail). **Consequence: the 519/0
  floor is not reproducible while other lanes write to `mind/episodes/`.** In
  nobody's partition. Worth fixing before this suite gates anything else.

Also routed and still open, **outside the fence** (spine/muster tooling, not
`~/circadian`): the verify gate's own remediation hint names a command that does
not exist — `spine-spawn make <slug> ...`. The real verb is
`verify-mark <brief> [--criteria <file>]`. An agent obeying the hint literally
gets a usage error and is then tempted at the audited break-glass. Filed in
`dep-92ca69822e79`.

## NO DANGLING CLAIMS — verified, not assumed

- **Panes:** none. All 6 workers reaped (`herdr pane close` on w8X:p5–p9, pA);
  `herdr agent list | grep -c 'rem-storm-criteria\|rem-storm-impl'` -> **0**.
- **Worktrees:** none. `git worktree list` -> only `/Users/jrg/circadian`. All
  three (`/Users/jrg/.spine/worktrees/circadian/rem-storm-impl-w{1,2,3}`) reaped
  through the door after verifying each was clean (`dirty-files=0`) and merged.
- **Branches:** none held. `spine/rem-storm-impl-w{1,2,3}` deleted by the reap
  door **after** merging; the intermediate `tmk-*` branches are gone. Only
  `fix/rem-storm-hardening` remains, and it is pushed.
- **Locks:** no stale REM lock — `logs/.rem-popmem.ifdue.lock` does not exist.
  Worth re-checking after any future live run, since a killed pass leaves one
  (pid-liveness + the shipped 30-min `maxAgeMs` at `src/rem-popmem.ts:127` should
  reclaim it, but confirm rather than trust).
- **Verify-gate marks** recorded (records, not locks):
  `d76715263688d95d` (A), `9852fce711037141` (B), `6457dc70545b5236` (C).

## THE ONE THING I DID NOT CLEAN, DELIBERATELY

`~/circadian/mind/` is a **separate nested git repo, gitignored by circadian**
(`.gitignore:7: mind/`) and it has **119 dirty entries** — modified
`CONSTITUTION.md` / `NOW.md` / `USER.md` / `scoreboard.jsonl` plus ~15+ untracked
`2026-08-23-*.md` episodes. **Almost none of that is mine.** It is circadian's own
metabolism plus other lanes' sessions writing episodes, live, right now.

I did not commit it and I am not going to. Committing another lane's uncommitted
work is exactly the 2026-08-21 failure mode. Whoever owns the mind repo should
land it; a stand-down order to *me* is not authority over *their* tree.

**DANGER for whoever picks this up:** the poison episode at
`mind/quarantine/2026-08-21-freeze-stale-design-pause.md` was untracked,
single-copy, unrecoverable evidence. CORD committed it mid-flight (mind
`1bca449`, 14:08) on my finding, so it is now recoverable from mind's history —
but mind has **no remote**, so it lives on one disk. **Never run a git command
inside `mind/`**, least of all a forced recursive clean.

## NEXT THREE CONCRETE MOVES

1. **Gate and merge.** CORD reviews `fix/rem-storm-hardening` (`700ff65`,
   pushed), confirms `bun test` -> 530/1 skip/0 fail, merges to
   `fix/rem-storm-containment-2026-08-23`.
2. **Lift containment in TWO steps, never one.**
   STEP 1, schedule still OFF: `bun run src/rem-popmem.ts` on the real mind with
   `ps -p 1054 -o pid,pcpu,pmem` sampled throughout. Proves, in order: the pass
   COMPLETES; pcpu stays under 60% with the N=1 cap live; `digested.jsonl` grows
   **incrementally during** the pass, not at the end (fact-4 multiplier dead);
   the scoreboard records a completion; `isDue()` flips false so no session
   re-fires. This also settles U1/R2 for free — restore the quarantined episode
   into a **temp** `CIRCADIAN_HOME` (never back into `mind/episodes/`) and see if
   it extracts cleanly on an idle endpoint.
   STEP 2, only if step 1 is clean: bootstrap `com.circadian.rem`, let ONE
   scheduled slot fire, confirm exactly ONE pass runs (the whole-entry-path lock
   means the per-session catch-up at `src/wake.ts:409` can no longer stack — that
   was the original fact-2 multiplier). **Abort either step above 60% sustained.**
3. **Close R1 and R3** — the one-line test timeout, and the `zoom.test.ts`
   describe-time/test-time race. R3 first if this suite is going to gate anything,
   because the floor is currently not reproducible.

## WHAT I LEARNED THAT THE DIFF DOES NOT SHOW

1. **The verify gate forces two waves, and it is right to.** Implementation is
   refused until an independent agent authors criteria. Six workers (3 test-makers
   -> `verify-mark` -> 3 implementers), not three. Plan for it; do not discover it
   at dispatch like I did. There is a `test-maker` profile for exactly this.
2. **Contract-first beat re-partitioning.** The stated partitions were NOT
   disjoint: `fail()` is `: never` (`src/obs.ts:125`), so B's fix needed A's
   caller loop. Instead of re-cutting, I specified the `StackEpisodeResult`
   extension as a pre-verified fact **byte-identical in both briefs** — B
   produced the fields, A consumed them, neither touched the other's file, and
   the merge was clean with zero conflicts. I would do this again over a
   cleaner-looking partition that lies.
3. **`--profile` silently decides your isolation model, and I got it wrong
   twice.** `fanout --profile test-maker` creates **no** worktree (all workers
   share one checkout); `--profile coder` creates **one per worker**. I asserted
   "you run in a worktree" from flag documentation instead of measuring, so wave 1
   got a false fact and two workers branched under each other — HEAD moved twice
   in two minutes. Cost was zero (verified: both branches at `882f67c`, clean
   tree, reflog showed only pointer moves) but that was luck. Then I carried the
   stale text into wave 2, which *did* get worktrees, so the correction had to run
   in both directions. **Measure `cwd` and `git worktree list` immediately after
   every fanout, before the first correction is needed.**
4. **`muster-spawn prompt` reports "delivered" when it has not delivered.** It
   said `submitted: true` for a pane whose input buffer was empty — twice.
   Verified path when a pane is mid-turn: `herdr pane send-text`, then
   `herdr pane read` to confirm the text is in the box, then
   `herdr pane send-keys <pane> Enter`, then read again to confirm the buffer
   cleared. A send without evidence is a non-send.
5. **This fleet's registrations are not in the muster door's party list** — every
   deposit needs `--force`. Also: the brief told me to report to `cord-circadian`,
   which **does not exist**; the real parent is `orch-circadian-rem-storm`
   (`herdr agent list` is the authority, not the brief).
6. **The test suite is coupled to live shared state** via `zoom.test.ts` reading
   the real `mind/episodes/`. Any "floor" measured while other lanes run is
   approximate. See R3.
7. **The hook matches command strings inside prose.** A brief *documenting* a
   dangerous command was refused as if it were executing one. Rephrase the
   documentation; do not reach for the break-glass.

## STOPPING STATE

Stood down clean: work committed and pushed, subtree fully absorbed before the
order arrived (all 6 workers reaped, 3 worktrees removed, 3 branches merged then
deleted), nothing held, nothing dirty that is mine. Three questions open, all
owned by CORD, none blocking the merge.
