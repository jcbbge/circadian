# PICKUP — CORD [circadian], REM retry storm. Stood down 2026-08-23 ~17:00 local.

Seat: CORD, registration `orch-circadian-rem-storm` (pane w8X:p2 — the registration
name does NOT match the role; see DANGLING #5). Parent: claude-concierge.
Brief: `~/agent-core/briefs/house/CORD-circadian-rem-storm-2026-08-23.md`.
Stood down on an operator order to regroup the fleet to a single concierge. **Not an
abort.** The unit LANDED; what is missing is an independent gate, not work.

My ORCH's note is beside this one and is the more detailed technical record:
`briefs/rem-storm/PICKUP-orch-rem-storm-hardening-2026-08-23.md` (217 lines).
**Read that one second. Read this one first for what is DECIDED and what is OPEN.**

---

## 1. COMPLETED, with evidence

### Containment (task 1) — mine, done, reversible, still in force
- `b098598` — `CONTAINMENT-2026-08-23-rem-storm.md` at repo root. Restore commands
  for every action are in that file. Read it before touching launchd.
- Booted out `com.circadian.rem` and `com.circadian.rem-catchup`.
  `com.circadian.doctor` LEFT LOADED deliberately — it is the observability mouth.
- Quarantined the un-extractable episode to `mind/quarantine/`, committed inside the
  nested mind repo as `1bca449` so it is recoverable (mind has NO remote).
- Measured, not inferred: mlx-omni-server PID 1054 went 51.7% (brief) -> 0.1%
  (`ps -p 1054`, re-verified at stand-down). Zero circadian workers, zero
  ESTABLISHED on :10240, `/v1/models` HTTP 200 in 2.9 ms.
- **HONEST QUALIFIER, do not let this be lost:** the acute storm burned itself out
  ~2 h before I arrived (`logs/rem.error.log` last write Aug 23 11:43). My
  containment prevented RECURRENCE. It did not bring the CPU down. I did not fix the
  fire; I stopped it relighting.

### The structural fix (tasks 2–5) — ORCH's work, gated and pushed
Branch **`fix/rem-storm-hardening`**, head **`4dbfbc0`**, PUSHED to
`origin/fix/rem-storm-hardening` (verified: local HEAD == remote sha).
Off `fix/rem-storm-containment-2026-08-23` (`882f67c`, also pushed).
- `bfbfe03` wave-1 criteria, 9 deliberately-red tests
- `a161002` Task B — `src/stack.ts`, per-episode failures never wedge the corpus
- `802bff8` Task C — `src/llm.ts`, down-vs-busy, jittered backoff, cross-process cap
- `4ae0264` Task A — `src/rem-popmem.ts`, whole-path lock, failure budget
- `8ddbd10`, `f729e9c` merges; `700ff65` wave-2 addenda; `4dbfbc0` ORCH pickup note

**Suite verified BY ME on the merged tree, not on the worker's report:**
`bun test` -> **531 tests, 530 pass, 1 skip, 0 fail, 3937 expect(), 26 files,
59.04s.** Floor was 519/0. This is the gate measurement.

### Root cause — verified from source, and it is NOT what the brief said
The brief I was given blamed `com.circadian.rem-catchup` for double-running a slot.
That is **wrong** and I want the correction to survive:
1. `rem-catchup` is `RunAtLoad` — once per login. It cannot produce five runs.
   `rem-popmem.ts:1014-1023` **does** hold a real single-flight lock.
2. The multiplier was **`src/wake.ts:409-425`**, which spawns `rem-popmem --if-due`
   detached on EVERY SESSION START. ~10 live claude panes = ~1 run/min.
3. **THE ROOT:** `rem-popmem.ts:207-214` — `isDue()` is true iff no run *COMPLETED*
   since the slot opened. The source comment at `:118` says it outright. A FAILED run
   records no completion, so the slot stayed due FOREVER. Failure was
   indistinguishable from never-having-run.
4. **The ORCH found a bigger amplifier than my brief had, and it corrected MY
   drawings:** `fail()` (`src/obs.ts:126`) is `: never` -> `process.exit()`, so the
   EXTRACT catch killed the whole REM process mid-loop; and `recordDigested()` was
   called AFTER the loop (`rem-popmem.ts:1072`). So NO episode from a failed pass was
   ever recorded digested, and every re-fire re-extracted every episode ahead of the
   poison one — against a newEpisodes set that kept GROWING. That is how one
   2,410-byte document became hundreds of LLM calls.
5. **The preflight was never lying.** `src/llm.ts:89-110` emits `timeout after
   5000ms` for an AbortError and `err.message` otherwise. The log said "Unable to
   connect" — a real transport REFUSAL. Under load the server refuses new connections
   while still LISTENING. The defects were the WORDING ("unreachable" reads as
   "server down") and the HANDLING (self-inflicted refusal treated as a dead
   service). Both fixed in `802bff8`.

---

## 2. UNFINISHED, and exactly where it stopped

1. **`fix/rem-storm-hardening` is NOT merged to `main`.** It is pushed and green.
   The merge is the CORD gate and I did not take it — I have not run the unit
   end-to-end against the real endpoint, and a green suite is not a safe laptop.
   Stopped at: pushed, un-merged, no PR opened.
2. **CONTAINMENT IS NOT LIFTED, and that is a DECISION, not an oversight.** See §4.
3. **The poison episode's root cause is [UNKNOWN]** and the premise may be inverted.
   See §5 — this is the most important open item in the whole unit.
4. **Three items the ORCH raised that I ruled on but nobody executed:**
   - **R1.** The live-gated poison test has no per-test timeout override, so bun's
     default 5000 ms kills it before its own 120 s `spawnSync` timeout can elapse.
     That is the `1 skip` in the suite. Needs a one-line `timeout` arg on that
     `test()` call, **by someone who is not its implementer.** Unassigned.
   - **R2.** Is the poison episode actually poison? Needs a controlled live re-run on
     an idle endpoint. Decides whether the quarantine stays.
   - **R3.** **`zoom.test.ts` is flaky and it undermines the floor.**
     `collectEpisodes()` runs at describe-time (`zoom.test.ts:61`) while `readdirSync`
     runs inside the test (`:64`), so an episode written by ANY other agent session in
     that window is live-but-unrecorded and `expect(rec).toBeDefined()` fails.
     **The 519/0 (now 530/0) floor is NOT reproducible while other lanes write to
     `mind/episodes/`.** Fix this before this suite gates anything else.

---

## 3. DANGLING CLAIMS — exact paths and refs

1. **Branches, all pushed, none merged:**
   `fix/rem-storm-hardening` @ `4dbfbc0` (the work) and
   `fix/rem-storm-containment-2026-08-23` @ `882f67c` (containment record).
   Worker branches `spine/rem-storm-impl-w1/w2/w3` were merged by the ORCH and its
   worktrees are gone — `git worktree list` shows only the main checkout. Ask the
   ORCH's note whether reaping went through `muster-spawn reap` or an `rm`.
2. **No locks left on disk.** Verified absent: `logs/.rem-popmem.ifdue.lock`,
   `logs/pending-sleep.lock`.
3. **`logs/sleep-claims/` holds 120 entries** (39 when I started, 120 at stand-down)
   — live runtime state from other sessions, not mine. I added it to `.gitignore` in
   `882f67c`; it was left untracked by `85ed43b`. Do not commit it.
4. **THE NESTED `mind/` REPO IS DIRTY AND I LEFT IT THAT WAY ON PURPOSE.**
   ` M CONSTITUTION.md NOW.md USER.md scoreboard.jsonl` plus **67 untracked
   episodes**. That is the agent's living memory being written RIGHT NOW by ~10 other
   live sessions. Committing it would mean staging another lane's in-flight writes —
   the exact class of act that permanently destroyed a lane's uncommitted work on
   2026-08-21. I did not force the tree clean and I do not think whoever resumes
   should either.
   **Insurance I did take:** tarball of all 67 untracked files at
   `/private/tmp/claude-501/-Users-jrg-circadian/a45286fa-3a88-4de1-88c9-1ce015589178/scratchpad/mind-untracked-backup-2026-08-23.tgz`
   (34 KB, 67 entries verified). **That path is a session scratchpad and WILL be
   reaped.** If the mind repo still matters, copy it somewhere durable first.
   `mind/` has NO REMOTE by design (privacy boundary, MIND-SPEC.md), so its own git
   history is the only protection that exists.
5. **My own registration name is wrong and it cost a round-trip.** My brief told me
   to report as `cord-circadian`; **no such registration exists.** My pane w8X:p2 is
   registered `orch-circadian-rem-storm` with role `1-CORD`. My first deposits went to
   a name nothing was listening on, and my ORCH caught it and told me. If you resume
   this seat, deposit as `orch-circadian-rem-storm` or fix the registration.

---

## 4. MY RULING ON THE LIFT — do not lift containment. Reason, so you can overrule.

The ORCH recommended a two-step lift and its reasoning is sound. **I still say no,
and the reason is not caution, it is rank:** every invariant is proven BY TEST, and
nothing is proven end-to-end against the real endpoint under real load. The one live
window I granted was aborted at 65% CPU before it finished. **The actor is not the
scorer** — the ORCH cannot gate its own unit, and I did not run an independent
verification either. So the honest state is "green, unverified in production."

When someone resumes, the ORCH's two-step plan is the right plan and I endorse it:
- **STEP 1**, schedule still OFF: `bun run src/rem-popmem.ts` on the real mind with
  `ps -p 1054 -o pid,pcpu,pmem` sampled throughout. Prove, in order: the pass
  COMPLETES; pcpu stays under 60% with the N=1 cap live; `digested.jsonl` grows
  INCREMENTALLY during the pass rather than at the end (that is the amplifier being
  dead); the scoreboard records a completion; `isDue()` flips false afterward.
- **STEP 2**, only if step 1 is clean: `launchctl bootstrap gui/$(id -u)
  ~/Library/LaunchAgents/com.circadian.rem.plist`, let ONE slot fire, confirm exactly
  one pass runs.
- **ABORT either step if pcpu exceeds 60% sustained.**

**My recommendation on `com.circadian.rem-catchup`: leave it booted out permanently.**
It is redundant — `wake.ts:409-425` already fires `--if-due` on every session start,
so the first session after opening the laptop covers the missed-slot case catchup
exists for. Restoring it re-adds a spawn path for zero coverage. **This needs the
concierge's or operator's assent; I never got it.**

---

## 5. [UNKNOWN]s I never closed

**U1 — THE BIG ONE. The poison document may never have been poison, and if so the
whole framing I was handed is inverted.**
The ORCH spent the single live grant and reported honestly instead of papering over
it: **the episode EXTRACTED SUCCESSFULLY** — `stacked poison.md: 5 new, 0 rejected`
— and PID 1054 hit **65.0%** at t+5s, over my 60% threshold, so the run was killed
immediately per my condition. It never got a clean end-to-end pass.
So on that one observation the file is **NOT deterministically un-extractable**,
which is the premise my brief and my own ORCH brief both rest on.
**HYPOTHESIS, explicitly NOT a fact:** the EXTRACT failure was **load-induced, not
content-induced** — the episode fails only when the endpoint is already saturated. If
that is right, the causal story reverses: a busy endpoint produced an EXTRACT
failure; `fail()` exited the pass mid-loop; nothing was recorded digested; the slot
stayed due forever; every session re-fired and re-extracted from scratch, saturating
the endpoint further. **The herd was self-sustaining and the document was a symptom
of it, not the cause.**
CAVEATS I will not bury: ONE partial observation, from a run aborted at 65% CPU, log
read before the kill, no clean end-to-end pass. **Enough to invalidate
"deterministically un-extractable" as a premise. NOT enough to assert the load
hypothesis as a fact.** Whoever resumes: settle this first (it is R2), because it
decides whether the quarantine should exist at all.
**Reassuring either way: the structural fix does not depend on which is true.** A
pass now survives any per-episode failure whatever its cause.

**U2 — Dead-claimant recovery is UNKNOWN** across this whole stack (no TTL, no decay,
no heartbeat on the stigmergic bus). I invented nothing here. Do not either.

**U3 — I never identified what was actually heating the laptop at 13:36.** See §6.

---

## 6. NOT OBVIOUS FROM THE DIFF — the things that cost real time

**L1 — A THIRD AMPLIFIER, still running, measured with REM fully contained.**
`lsof -nP -iTCP:10240` showed **9 concurrent circadian workers** (8x
`sleep.ts --worker` + 1x `graze.ts --worker`), one spawning every ~7 seconds. I
sampled mlx CPU: **4.0% -> 52.7% -> 52.4% -> 56.3% -> 52.4% -> 0.1%** over 90 s.
**The sleep/graze per-session fan-out ALONE reaches the same ~55% amplitude that
fact 1 attributed to the REM retry storm — with REM not running at all.** It DRAINED
rather than pinning, which is what containment bought. Consequence: **task C
(the cross-process cap) is the load-bearing fix, not the third-priority cleanup the
brief's ordering implied.** It also means the fleet investigating the storm was
feeding the storm — nine separate processes cannot be capped by a semaphore inside
one of them, which is exactly why the cap had to be cross-process.

**L2 — A FOURTH DEFECT, deliberately kept out of scope: duplicate episode drafting.**
Those 67 untracked mind files are largely NUMBERED DUPLICATES of the same arc:
`2026-08-23-gate-live-w2-closure.md` plus `-2` through `-10` (nine of them),
`deny-truncates-oracle` plus `-2/-3/-4`, `pack-list-freeze` plus `-2` through `-7`.
Each is a separate LLM draft call for substantially the same content. And
`logs/pending-sleep.jsonl` is **127 lines deep**. So: duplicate drafting enlarges the
newEpisodes set, which the missing watermark made REM re-chew, which saturated the
endpoint, which (per U1) may be what made EXTRACT fail in the first place. **Four
defects compound. This unit fixed two of them.** Duplicate drafting needs its own
unit; I kept it out rather than let this one sprawl.

**L3 — The 13:36 heat was NOT circadian, and I never found out what it was.**
At 13:36 circadian was ~0.1% CPU while `coraline sync --quiet` was at 84.6%,
`WebKit.WebContent` 77.6%, `WebKit.GPU` 68.9%, `llmtrim serve` 16.4%, and ten
`claude` panes were live; load average 4.23. Circadian caused the 11:43 storm. It was
not causing the 13:36 fans. **Routed to the concierge twice; as far as I know still
unplaced.** If the operator's laptop is still hot, this is the lead, not circadian.

**L4 — Enforcement by filesystem beat enforcement by instruction, and I learned it
the expensive way.** `muster-spawn fanout --profile test-maker` does NOT create
worktrees. All three wave-1 workers landed in the shared `~/circadian` checkout and
HEAD moved TWICE in two minutes as two of them ran `git checkout -b` under each
other. **Damage: none** — verified by reflog (branch-pointer moves only, both at
`882f67c`) and an empty `git status --short src/`, not assumed. **That was MY defect:
I wrote "workers commit their own units on their own branches" into a binding brief
for a repo I had never checked for worktree isolation.** I then ruled wave 2 into
worktrees (`--profile coder`, which the spawn door FORCES) and the problem vanished
structurally. Circadian has zero dependencies and no `node_modules`, so a worktree
costs nothing here — there was never a reason not to.

**L5 — Two spawn-door gotchas that each cost a failed spawn.**
`muster-spawn` does not quote `--workspace`, so a label containing spaces fails
`workspace_not_found` — pass the workspace id (`w8X`). And `--thinking <level>`
passed to a `claude` kind kills agent startup (timeout, empty pane); the flag is
pi-only. Omit it.

**L6 — Contract-first beat re-partitioning.** The partitions were NOT disjoint as I
wrote them: fixing "skip and continue" needed both `stack.ts` (return a failure
result) and `rem-popmem.ts` (handle it). The ORCH resolved it by specifying the
`StackEpisodeResult` extension as a pre-verified fact byte-identical in both briefs —
B produced it, A consumed it, neither touched the other's file, and the merge was
clean with no conflict. Reuse that move.

**L7 — The verify gate's own hint names a command that does not exist.** It says
`spine-spawn make <slug> ...`; `muster-spawn` exposes only
`{orch,worker,fanout,prompt,desk,verify-mark,verify-status,verify-migrate,reap}`.
An agent obeying the hint literally gets a usage error and is then tempted at the
audited break-glass — a good gate converted into a bypassed one. The working verb is
`verify-mark <brief> [--criteria <file>]`. **Outside my fence; routed to the
concierge twice; not fixed.**

---

## 7. QUESTIONS I AM STILL HOLDING, and who answers them

1. **Merge `fix/rem-storm-hardening` to `main`, and who gates it?** — concierge, or
   whoever inherits this seat. I did not take my own gate.
2. **Lift containment, and does `rem-catchup` come back at all?** — concierge /
   operator. My recommendation is in §4; I never got assent.
3. **Is the poison document actually poison (R2)?** — needs an executor, not a
   decider. One controlled live run on an idle endpoint settles it.
4. **Who owns R1 (the 5000 ms test timeout) and R3 (the `zoom.test.ts` flake that
   makes the floor non-reproducible)?** — unassigned. R3 matters most: **the suite
   cannot honestly gate anything else until it is fixed.**
5. **Who owns the duplicate-drafting lane (L2) and the 127-deep pending queue?** —
   unassigned, needs its own unit.
6. **What is actually heating the laptop (L3)?** — concierge. Still unplaced.

---

## 8. THE NEXT THREE MOVES for whoever resumes

1. **Fix `zoom.test.ts` (R3) before trusting the floor.** Make `collectEpisodes()`
   and `readdirSync` see the same snapshot. Until then 530/0 is not reproducible while
   other lanes write to `mind/episodes/`, and every gate downstream is soft.
2. **Settle U1/R2 with ONE controlled live run on an idle endpoint** — restore
   `mind/quarantine/2026-08-21-freeze-stale-design-pause.md` into a TEMP
   `CIRCADIAN_HOME` (never back into `mind/episodes/`), extract it, and sample
   `ps -p 1054 -o pcpu` throughout with a 60% abort. That single run tells you whether
   the quarantine should exist and whether the "poison document" was ever real.
3. **Then run the ORCH's STEP 1 lift** (§4): one manual `bun run src/rem-popmem.ts`
   on the real mind, watched, proving incremental `digested.jsonl` growth and a
   scoreboard completion that flips `isDue()` false. Only after that clean, bootstrap
   `com.circadian.rem` and let one slot fire.

Do NOT bootstrap the launchd jobs as a first move. Do NOT force the `mind/` tree
clean. Do NOT trust the floor until move 1 is done.

---

## 9. State at stand-down, measured

- `~/circadian`: **clean.** On `fix/rem-storm-hardening` @ `4dbfbc0`, pushed
  (local sha == `origin/fix/rem-storm-hardening`).
- `~/circadian/mind`: **dirty on purpose** (§3.4). Own commit `1bca449` landed. No
  remote exists.
- Containment: **in force.** `launchctl list | grep circadian` -> only
  `com.circadian.doctor`. `mind/quarantine/` intact.
- `mlx-omni-server` PID 1054: **0.1% CPU**, 26.5% MEM.
- Suite: **531 tests, 530 pass, 1 skip, 0 fail, 26 files.**
- Fleet: ORCH rem-storm-hardening absorbed under the same order, its own pickup note
  committed at `4dbfbc0`. Its three implementers were reaped and their worktrees
  removed before the order arrived. Nothing of mine is still running.
