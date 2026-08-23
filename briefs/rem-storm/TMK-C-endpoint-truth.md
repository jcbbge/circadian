# WAVE 1 — CRITERIA FIRST. You are a TEST-MAKER, not an implementer.

**House law, enforced by a hard gate at the spawn door:** *the test agent is NOT
the implementation agent; criteria come BEFORE code.* Implementation for this
unit is REFUSED by the door until your criteria are authored and recorded. You
are the reason the next wave can start.

## What you deliver

1. **Executable tests** in your `*.test.ts` file that encode **each done-when in
   your task section** as real assertions.
2. **A criteria file** at `briefs/rem-storm/criteria-<your-letter>.md`: one line
   per done-when, naming the test that proves it and the exact command to run it.

## What you must NOT do

- **You may not touch ANY `.ts` source file.** You own your `*.test.ts` and your
  criteria file. Nothing else. The implementer owns the source.
- Do not implement the fix. Do not "make the test pass."

## Your tests are EXPECTED TO FAIL (red). That is the deliverable.

They encode behavior that does not exist yet. **The 519/0 floor gate applies at
the end of WAVE 2, not to you.** Report your red tests with their real output —
a red test that fails *for the right reason* (asserting the missing behavior,
not a typo or a bad import) is your done-when. **Prove the reason**: paste the
assertion failure, and confirm the rest of the suite is otherwise unaffected.

## Zero live-LLM calls in this wave

Wave 1 makes **no** calls to `:10240` — not one, whatever your task section says
about the live grant (that grant belongs to wave 2). Any test needing a live
endpoint must be written to **skip unless `CIRCADIAN_LIVE_LLM=1`** so the
default suite stays deterministic and load-free.

---
# Unit: rem-storm-hardening — shared prefix (byte-identical across all workers)

Parent: `orch-rem-storm-hardening` (ORCH). Report to it. Not to CORD, not to the
concierge, not to the operator. Binding.

## Why this unit exists

Circadian's memory-consolidation pass (REM) saturated the machine's shared
local-LLM service and cooked the operator's laptop. Containment already stopped
the heat and is NOT yours to touch. This unit is the structural fix so
containment can be lifted.

The failure was a **thundering herd**, not a resource shortage: one
un-extractable document, a due-check that cannot tell "failed" from "never
ran", and two uncapped per-session fan-outs (`src/wake.ts:409` REM catch-up,
`src/circadian-mind.ts:239` sleep workers) all aimed at ONE shared service that
graphiti, colgrep and pickbrain also depend on.

## Pre-Verified Facts — measured by ORCH 2026-08-23, do NOT re-derive

1. **TEST FLOOR:** `bun test` -> **519 pass / 0 fail / 3745 expect() / 25 files
   / 36.85 s**. Re-verified by ORCH this session. Below this is a NO-GO. Run the
   WHOLE suite, never just your file.
2. **`fail()` (`src/obs.ts:125`) is typed `: never` and calls
   `process.exit(code)`.** Any `fail()` on a per-episode path does not abort one
   episode — it KILLS THE WHOLE REM PASS. This is the mechanism behind the
   storm. `ok()`/`idle()`/`degraded()` (`src/obs.ts:133-136`) emit without
   exiting.
3. **There are THREE per-episode process-killing exits inside `stackEpisode`,
   not one:** `src/stack.ts:758` (`read-episode`), `:785` (`parse-episode`),
   `:805` (`extract-llm`). The original CORD brief named only `extract-llm`;
   ORCH measured all three. Any one of them wedges a pass.
4. **`recordDigested` is called AFTER the episode loop** —
   `src/rem-popmem.ts:1072`, loop at `1060-1071`. Because `fail()` exits
   mid-loop, **no episode from a failed pass is ever recorded as digested**, so
   every re-fire re-ran EXTRACT from scratch for every episode ahead of the
   poison one. This is the multiplier that turned one bad document into hundreds
   of LLM calls.
5. **`StackEpisodeResult` today** (`src/stack.ts:747-750`):
   `{ skipped: boolean; counts?: StackCounts }`. `StackCounts` at `:730-745`.
6. **THE INTERFACE CONTRACT (specified by ORCH — identical in the A and B
   briefs; neither worker may redefine it, and neither may edit the other's
   file):**
   ```ts
   export interface StackEpisodeResult {
     skipped: boolean;
     counts?: StackCounts;
     /** set when this episode could not be processed; the pass MUST continue */
     failed?: boolean;
     /** the phase that failed: "read-episode" | "parse-episode" | "extract-llm" */
     failurePhase?: string;
     /** human-readable cause, surfaced to the operator */
     failureCause?: string;
   }
   ```
   **Task B produces these fields. Task A consumes them.** Both code to this
   shape as written.
7. **Single-flight lock:** `acquireIfDueLock` at `src/rem-popmem.ts:127`, lock
   path `logs/.rem-popmem.ifdue.lock` (`:121`). It ALREADY does real pid-liveness
   plus `maxAgeMs = 30 * 60 * 1000`. That shipped timeout is not a violation of
   "do not guess a timeout" — reuse it, invent no new one.
8. **The due-check:** `isDue` at `src/rem-popmem.ts:208`, `mostRecentSlot` at
   `:181`, `REM_SLOT_HOURS = [9, 21]` at `:179`.
9. **`src/llm.ts` landmarks:** `BASE_URL` `:46`, `RETRIES` `:58` (default 3),
   `BACKOFF_MS` `:59` (default `2000,10000,30000`, **no jitter**;
   with RETRIES=3 only 2 s and 10 s are ever used), `PREFLIGHT_TIMEOUT_MS` `:66`
   (5000), `class PreflightError` `:71`, `nonRetryable()` `:80`, `preflight()`
   `:89`.
10. **The endpoint is LIVE and idle right now:** `GET
    http://127.0.0.1:10240/v1/models` -> **HTTP 200 in 3.7 ms**. So a
    connection refusal under load is backlog/worker exhaustion, NOT a dead
    service.
11. **The poison episode** is at `mind/quarantine/2026-08-21-freeze-stale-design-pause.md`,
    2410 bytes, 12 lines. Size and token limits are EXCLUDED as causes.
    **Leave it in quarantine.** Copy it into a temp `CIRCADIAN_HOME` if you need
    it; never back into `mind/episodes/`.
12. **House test pattern — real subprocess, real temp home, no mocks:**
    `src/sleep.test.ts:136-138` —
    `spawnSync(process.execPath, [join(import.meta.dir, "<script>.ts"), "<flag>"],
    { env: { ...process.env, CIRCADIAN_HOME: home } })`. Follow it.
13. **Precedent to read before you start:** commit `85ed43b`
    *"fix(circadian/sleep): self-heal the pending-sleep queue — dead-letter
    stuck entries"* — same class of bug: a `break` wedged every queue entry
    behind a bad one; it became `continue` plus a dead-letter. Same shape here.
    Stuck-policy precedent: `PENDING_ATTEMPTS_CAP = 8` at `src/sleep.ts:83`.
14. **Branch base:** `fix/rem-storm-containment-2026-08-23` at `882f67c`.

## Constraints — all binding

- **Fence: `~/circadian` only.** Anything outside it is a finding you REPORT to
  ORCH, never an edit. Do not touch `~/dotfiles`, the LLM server's own config,
  or another project's tree. Do not provision a second LLM. On 2026-08-21 an
  agent reached outside its fence to tidy a shared checkout and permanently
  destroyed another lane's uncommitted work. Non-destructive intent is not a
  defense.
- **Stay in your partition.** No two workers may touch the same file. If a fix
  seems to need a file outside your partition, that is a `need-help` to ORCH —
  never a reach across the line. (Fact 6 exists precisely so A and B never have
  to.)
- **Do not undo containment.** Launchd jobs stay booted out; the poison episode
  stays in `mind/quarantine/`. CORD lifts containment at the gate.
- **Real tests, no mocks of the LLM.** A deterministic failure injected through
  *content* beats a mock.
- **LIVE-LLM CALLS ARE RATIONED.** The endpoint is shared and it is what cooked
  the laptop. You may make live calls to `:10240` only when your task section
  explicitly grants it, and only one worker holds that grant at a time. If you
  need it and do not have it, `need-help` to ORCH and keep working on
  everything else.
- **Commit your own unit on your own branch** off
  `fix/rem-storm-containment-2026-08-23`. **Stage explicitly — NEVER
  `git add -A`**; the mind repo has ~15 untracked episodes and `git add -A`
  would swallow them. ORCH verifies; CORD gates the merge.
- Commit message = the house handoff block (`PHASE:` / `DONE:` / `TODO:` /
  `BLOCKED:`).
- **Mark anything you cannot verify `[UNKNOWN]`** and report it. Do not invent a
  cause, a policy, or a value. A confident guess is a lie with good posture.

## Report back with

To ORCH via
`~/muster/bin/muster-deposit deposit --from <your-name> --to orch-rem-storm-hardening --kind report|done|need-help --force --body "<evidence>"`
(`--force` is required: this fleet's registrations are not in the door's party
list — ORCH verified that):

1. PASS/FAIL against **each** done-when, with **evidence** — the commands you
   ran and their real output, not a narrative.
2. Full-suite `bun test` result (must be >= 519 pass / 0 fail).
3. Your branch name and commit SHA.
4. Anything you found outside your partition or outside the fence, as a routed
   finding.

Post a CLAIM deposit before you start, findings as you go, `.done` last.
`report` is not `done`. Two stopping states only: every done-when met with
evidence, or `need-help` naming what you need and who owns it, **after**
finishing everything that did not depend on it. An empty inbox is not a stop.

---

## Rulings that bind every worker (CORD, dep-82fafaa9bb5b)

- **`doctor.ts` is nobody's partition — do not touch it.** "doctor.ts reports the
  REM stop-state" is carried as a follow-on finding, not a task in this unit.
- **`src/sleep.ts` is nobody's partition — do not touch it.** CORD verified that
  none of the three tasks requires an edit there. If you conclude you DO need
  one, that is a `need-help` to ORCH, not a reach.
- **A deferral is NOT a failure.** Anything deferred because circadian's own
  concurrency cap was busy must never be recorded as an episode failure — it
  must not feed the dead-letter or the consecutive-failure budget. Marking a
  good episode failed because our own cap was busy would rebuild this bug one
  layer up.
- **Spawn/tooling gotchas (measured by CORD, so you don't repeat them):**
  `muster-spawn` does not quote `--workspace` — pass the workspace **id**.
  `--thinking` is pi-only and kills a claude-kind startup — omit it.

---

## Your working tree (ORCH-measured — read this before your first command)

- **You run in a git WORKTREE, not the primary checkout. Your worktree is your
  fence.** Three workers hold three branches; that is why you are isolated.
- **Zero dependencies. No `node_modules`, no install step** — the repo has no
  `dependencies` block and `node_modules/` is gitignored and absent. `bun test`
  runs directly in a fresh worktree. Verified by ORCH.
- **`mind/` IS NOT IN YOUR WORKTREE.** It is a **separate nested git repo**,
  gitignored by circadian (`.gitignore:7: mind/`). Tests use a temp
  `CIRCADIAN_HOME`, so this costs you nothing.
- **DANGER — the poison file is UNTRACKED evidence.**
  `mind/quarantine/2026-08-21-freeze-stale-design-pause.md` is **untracked**
  (`?? quarantine/`) inside that gitignored nested repo. It exists in exactly one
  place on this machine: `/Users/jrg/circadian/mind/quarantine/`. There is no
  commit to recover it from.
  **NEVER run any git command inside `mind/`** — least of all a forced recursive
  clean, which would destroy the poison evidence AND ~15 untracked episodes.
  Task B may **read-copy** that absolute path into a temp `CIRCADIAN_HOME`;
  **nobody writes to `mind/`, and nobody runs git there.**
- Corollary, so nobody is misled: staging everything in your worktree would NOT
  swallow the mind episodes (`mind/` is gitignored). The staging rule stands
  anyway — **stage explicitly** — but the real hazard is git inside `mind/`.

---
# Task C — tell the truth about the endpoint, and stop starving it

**The implementer for this partition will be `agnt-endpoint-truth`.**
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
