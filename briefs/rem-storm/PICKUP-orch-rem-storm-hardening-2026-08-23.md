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

## NO DANGLING CLAIMS — every ref and lock named, verified not assumed

**Branches I created or merged:**
- `spine/rem-storm-impl-w1` (Task A, `4ae0264`) — merged (`8ddbd10`), then
  **deleted by the reap door**.
- `spine/rem-storm-impl-w2` (Task B, `a161002`) — merged (fast-forward), then
  **deleted by the reap door**.
- `spine/rem-storm-impl-w3` (Task C, `802bff8`) — merged (`f729e9c`), then
  **deleted by the reap door**.
- `tmk-rem-slot-guard-tests` / `tmk-poison-quarantine-tests` — wave-1 artifacts of
  the shared-checkout incident; both were at `882f67c` with no unique commits;
  renamed/deleted by me. Gone, nothing lost.
- **`fix/rem-storm-hardening` — THE ONE LIVE REF. Pushed, tracking
  `origin/fix/rem-storm-hardening`.** This is what the gate-holder reviews.
- `git branch --list 'spine/rem-storm*' 'tmk-*'` -> **empty**.

**Worktrees — reaped through the DOOR, not `rm`.** Confirmed: I called
`~/muster/bin/muster-spawn reap <abs-path>` on each, and each returned
`{"removed": true, "branch": "spine/rem-storm-impl-wN", "preserved": false}`.
Before reaping I verified each was clean (`git status --porcelain` -> 0 lines)
and that its branch was an ancestor of HEAD (`git merge-base --is-ancestor` ->
MERGED). `preserved: false` is correct *because* the work was already merged —
the door had nothing to rescue. `git worktree list` -> only `/Users/jrg/circadian`.
Paths that no longer exist: `/Users/jrg/.spine/worktrees/circadian/rem-storm-impl-w{1,2,3}`.

**Locks and claim files on disk — checked individually:**
| Path | State |
|---|---|
| `logs/.rem-popmem.ifdue.lock` | **absent** — no stale REM lock. Re-check after any future live run; a killed pass leaves one, and pid-liveness + the shipped 30-min `maxAgeMs` (`src/rem-popmem.ts:127`) should reclaim it — confirm rather than trust. |
| `logs/pending-sleep.lock` | **absent** |
| `logs/pending-sleep.jsonl` | **EXISTS, 127 entries, 43,562 bytes** — NOT mine; the sleep-drafting queue. Relevant to the open duplicate-drafting lane. |
| `logs/pending-sleep.dead.jsonl` | absent |
| `logs/sleep-claims/` | **119 entries** — NOT mine; other lanes' runtime claims, gitignored (`.gitignore`). I did not touch or clear them. |
| `logs/llm-cap/` | **0 entries** — Task C's new cross-process cap dir, clean, no stale slots. **NOTE: not yet gitignored**, unlike `logs/sleep-claims/`; worker C flagged this and correctly did not edit `.gitignore` (outside its partition). Small loose end for whoever owns `.gitignore`. |

**Panes:** all 6 closed. `herdr agent list | grep -c 'rem-storm-criteria\|rem-storm-impl'` -> **0**.
**Verify-gate marks** (records, not locks): `d76715263688d95d` (A),
`9852fce711037141` (B), `6457dc70545b5236` (C).

**I hold nothing.** No lock, no claim, no worktree, no branch anyone else needs.

## THE NESTED `mind/` REPO — COMMITTED ON CORD'S ORDER, AND IT HAS NO REMOTE

`~/circadian/mind/` is a **separate nested git repo, gitignored by circadian**
(`.gitignore:7: mind/`) with **NO REMOTE**. I had initially declined to commit it
— it was 115 untracked episodes of *other lanes'* work and committing another
lane's tree is how 2026-08-21 happened. **CORD explicitly ordered it committed in
the stand-down, and that was the right call**: committing *preserves*, cleaning
destroys, and on a repo with no remote history is the only durability there is.

**Landed: `f44c68b`** — 116 files added + 4 modified (`CONSTITUTION.md`, `NOW.md`,
`USER.md`, `scoreboard.jsonl`). **This CANNOT be pushed — the repo has no remote,
so it lives on exactly one disk.** That is a standing durability risk for the
machine's whole memory substrate, not something I introduced.

**`mind/scoreboard.jsonl` will re-dirty immediately and by design** — it is
append-only and every live wake/graze/REM writes to it. I committed it once; a
permanently clean `mind/` tree is not achievable while any session runs. Do not
read a dirty `scoreboard.jsonl` as unlanded work.

**DANGER for whoever picks this up:** the poison episode at
`mind/quarantine/2026-08-21-freeze-stale-design-pause.md` was untracked,
single-copy, unrecoverable evidence. CORD committed it mid-flight (mind
`1bca449`, 14:08) on my finding, so it is now in mind's history — but with no
remote, still one disk. **Never run a git command inside `mind/`**, least of all
a forced recursive clean.

## CONTAINMENT — CORD HAS RULED: **DO NOT LIFT IT.** (2026-08-23)

I recommended a two-step lift. **CORD overruled me and the ruling stands.**
Containment stays exactly as it is:
- `com.circadian.rem` and `com.circadian.rem-catchup` stay **booted out**.
- The poison episode stays in `mind/quarantine/`.

CORD's reasoning, which is correct and which I am recording so no one relitigates
it: my fix is **unmerged to main and verified by no one but me**, and *the actor
is not the scorer*. **Whoever resumes lifts it, after an INDEPENDENT gate — not
the agent that wrote it.**

**DO NOT HELPFULLY BOOTSTRAP THOSE LAUNCHD JOBS.** If you are reading this note
and a green test suite tempts you to re-enable the schedule: that temptation is
the thing the ruling exists to stop. Restore commands are in
`CONTAINMENT-2026-08-23-rem-storm.md` — they are for whoever holds the gate,
after review, and not before.

When an independent gate-holder *does* lift it, do it in **two steps, never one**,
because nothing here is proven end-to-end against the real endpoint under load:
- STEP 1, schedule still OFF: `bun run src/rem-popmem.ts` on the real mind with
  `ps -p 1054 -o pid,pcpu,pmem` sampled throughout. Proves, in order: the pass
  COMPLETES; pcpu stays under 60% with the N=1 cap live; `digested.jsonl` grows
  **incrementally during** the pass, not at the end (the fact-4 multiplier being
  dead); the scoreboard records a completion; `isDue()` flips false so no session
  re-fires. This also settles U1/R2 for free — restore the quarantined episode
  into a **temp** `CIRCADIAN_HOME` (never back into `mind/episodes/`) and see
  whether it extracts cleanly on an idle endpoint.
- STEP 2, only if step 1 is clean: bootstrap `com.circadian.rem`, let ONE
  scheduled slot fire, confirm exactly ONE pass runs (the whole-entry-path lock
  means the per-session catch-up at `src/wake.ts:409` can no longer stack — that
  was the original fact-2 multiplier).
- **Abort either step above 60% sustained CPU on PID 1054.**

## CORD'S MEASUREMENT — THIS REFRAMES THE WHOLE PROBLEM

CORD measured this **with REM fully contained and not running at all**, and it
belongs in this note because it outlives the session:

> Nine concurrent circadian workers (**8x `sleep.ts --worker` + 1x
> `graze.ts --worker`**, one spawning every ~7 s) drove `mlx-omni-server`
> PID 1054 to **52.7% -> 56.3% CPU for ~60 s**, then drained to 0.1%.

Brief fact 1 attributed **51.7%** to the REM retry storm. **The sleep/graze
per-session fan-out reaches the same amplitude entirely on its own, with REM
switched off.** Two consequences, and neither is a footnote:

1. **Task C (`src/llm.ts`, the cross-process cap) is the LOAD-BEARING fix of this
   whole unit** — not Task A or B. A and B stop REM from wedging and re-firing;
   only C bounds what circadian can do to a service that graphiti, colgrep and
   pickbrain share. CORD's N=1 ruling over my recommended N=2 looks better in
   hindsight than it did at the time, and I was wrong to argue for 2.
2. **The duplicate-drafting defect is a REAL OPEN LANE.** I verified it
   independently and it is worse than when CORD measured: **115 untracked
   episodes** (CORD saw 67 earlier today — it is still growing), largely
   *numbered duplicates of the same arc*: **22x**
   `2026-08-23-spawn-door-verification(-N).md`, **12x**
   `spawn-door-criteria`, **10x** `spawn-door-gate`, **10x**
   `gate-live-w2-closure`. `logs/pending-sleep.jsonl` holds **127** queued
   entries. Something is drafting the same episode over and over. **Nobody owns
   this lane.** It is the most likely next storm and it is not in my unit.

## NEXT THREE CONCRETE MOVES

1. **Independent gate on `fix/rem-storm-hardening`** (`4dbfbc0`, pushed).
   Someone who is not me confirms `bun test` -> 530 pass / 1 skip / 0 fail and
   reviews the three source diffs, then merges to
   `fix/rem-storm-containment-2026-08-23`. **Containment stays on regardless
   until that gate passes.**
2. **Open the duplicate-drafting lane** (see CORD's measurement above). 115
   duplicate episodes and 127 pending-sleep entries, growing, unowned, and
   pointed at the same shared endpoint that cooked the laptop. This is the
   highest-value unclaimed work I am aware of.
3. **Close R1 and R3** — the one-line per-test timeout, and the `zoom.test.ts`
   describe-time/test-time race. **R3 first** if this suite is going to gate
   anything, because the 519/0 floor is currently not reproducible.

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

8. **A "premise" and a "finding" are different things and the difference is
   load-bearing.** The brief handed me fact 11 as measured truth; one live run
   contradicted it. Had I written "the poison episode extracts fine" as a finding,
   a later reader would have pulled the file out of quarantine on my authority.
   See U1 — it is deliberately written as an assessed premise with its caveats
   attached, and it should stay that way until someone re-runs it clean.
9. **CORD's overrule on the cap (N=1 over my N=2) was right, and the measurement
   proved it after the fact.** I argued for headroom on latency grounds. The
   sleep/graze fan-out measurement shows circadian can reach storm amplitude with
   REM entirely off, so the tighter cap was the correct call. Worth remembering
   the shape of that mistake: I optimized for the process I was looking at
   instead of the service everything shares.

## WHAT WENT WELL — recorded because CORD asked, and because underselling it wastes it

Stated plainly, not modestly:
- **The nQ loop closed in ONE round.** Three questions, three rulings, zero
  questions remaining at dispatch, no pass 2 manufactured. The gated values
  (Q1 slot-burn K=1, Q2 cap N=1 + 120 s jittered wait, Q3 serialized live grant)
  went into the briefs as substituted text rather than as prose a worker had to
  interpret.
- **Two findings corrected CORD's own drawings**, and CORD credited them as its
  defect rather than my overreach: (a) `fail()` is `: never` -> `process.exit`, so
  **all three** per-episode exits kill the pass, not just the one the brief named;
  (b) `recordDigested` sits *after* the loop, so a pass that dies mid-loop records
  nothing and the next re-fire re-EXTRACTs everything ahead of the poison — the
  real multiplier that turned one 2,410-byte document into hundreds of LLM calls.
  Skip-and-continue alone would not have stopped the load.
- **The shared-checkout HEAD move was caught in ~2 minutes and verified by
  reflog, not assumed.** Two workers branched under each other; I proved zero
  damage (both branches at `882f67c`, clean tree, reflog showing only pointer
  moves) instead of asserting it, then corrected all three panes.
- **Contract-first held across a partition that was not actually disjoint** — B
  produced the `StackEpisodeResult` fields, A consumed them, neither touched the
  other's file, and the three-branch merge was clean with zero conflicts.

The honest counterweight: the isolation-model defect was mine, twice, and it came
from asserting a fact from flag documentation instead of measuring it. That is the
lesson with the highest cost-per-word in this note (see item 3).
