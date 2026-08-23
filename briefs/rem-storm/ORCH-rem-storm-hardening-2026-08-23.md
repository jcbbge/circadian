# ORCH [rem-storm-hardening] — make the REM retry storm structurally impossible

Parent: `cord-circadian`. Report to it, not to the operator, not to the concierge.
Binding. Everything in Pre-Verified Facts was measured by CORD this session
(2026-08-23, 13:36–13:45 local) — do NOT re-derive it, and do not contradict it
without your own measurement to show.

## Purpose and intent

Circadian's memory-consolidation pass (REM) saturated the machine's shared
local-LLM service this morning and cooked the operator's laptop. CORD has already
stopped the heat — that is done, recorded, and out of your scope. **Your unit is
the structural fix: make it impossible for this to happen again**, so the
containment can be lifted and memory consolidation runs normally.

The failure was not a resource shortage and not a broken pipeline. It was a
**thundering herd**: one document that would not extract, a due-check that
treats "failed" as "never ran", and two uncapped per-session fan-outs pointed at
one shared service. Every piece of that has to change.

## Vocabulary (use these words to mean these things)

| Term | Meaning |
|---|---|
| **local LLM server** | `mlx-omni-server`, always-on at `http://127.0.0.1:10240/v1`. A **shared system service** — graphiti, colgrep and pickbrain depend on it too. `~/dotfiles/launchagents/com.localllm.server.plist`. |
| **REM** | The twice-daily memory-consolidation pass, `src/rem-popmem.ts`. Scheduled 09:00 / 21:00 via `com.circadian.rem`. |
| **slot** | The 09:00 or 21:00 window a REM pass belongs to. `isDue()` decides whether the current slot is still owed. |
| **EXTRACT** | The per-episode LLM call that distils one episode file into memory atoms. `src/stack.ts:807`, phase `extract-llm`. |
| **preflight** | `GET /models` liveness probe before every LLM call. `src/llm.ts:89`. |
| **the poison episode** | `2026-08-21-freeze-stale-design-pause.md`. Fails EXTRACT every time. CORD moved it to `mind/quarantine/`. |
| **thundering herd** | Many clients retrying a shared service simultaneously, so the retries — not the original load — are what keep it down. |

## Pre-Verified Facts (CORD, this session — every one measured)

1. **Test baseline is the floor: `bun test` -> 519 pass / 0 fail, 25 files,
   34.92 s.** Any regression below this is a NO-GO. Run the whole suite, not
   your file.
2. **`src/wake.ts:409-425` spawns `bun run src/rem-popmem.ts --if-due`
   detached on EVERY session start.** This — not launchd — is the multiplier.
   `com.circadian.rem-catchup` is `RunAtLoad` and fires **once per login**.
   The brief CORD received suspected the catchup slot guard of double-running;
   that suspicion is **wrong**, and you should not spend time on it.
   `rem-popmem.ts:1014-1023` **does** hold a real single-flight lock for
   `--if-due`.
3. **THE ROOT.** `rem-popmem.ts:207-214` — `isDue()` returns true iff no run
   has **COMPLETED** since the slot opened. The source comment at `:118` says
   it outright: *"The scoreboard due-check only guards on COMPLETED slots"*.
   A run that **fails** records no completion, so the slot stays due
   **forever**, and every subsequent session re-fires it. **Failure is
   indistinguishable from never-having-run.** That is the bug that turned one
   bad document into an all-day storm.
4. **There is a second, independent fan-out.** `src/circadian-mind.ts:239`
   spawns `src/sleep.ts --worker` per session event. Five were live
   concurrently this morning (PIDs 44829/44887/45310/45383/45480, elapsed
   01:00–01:14, all holding ESTABLISHED sockets to :10240). Two uncapped
   per-session fan-outs, one shared endpoint.
5. **The preflight is honest about transport; its wording and handling are
   not.** `src/llm.ts:89-110` reports `timeout after 5000ms` for an
   AbortError and `err.message` otherwise. The log says `(Unable to connect.
   Is the computer able to access the url?)` — a **real transport refusal**,
   not a timeout. So under concurrent load the server **refuses new
   connections while still LISTENING** (backlog / worker exhaustion). Meanwhile
   `curl -m 8 .../v1/models` returns **HTTP 200 in 2.9 ms** when idle. The
   defects are: the message says "unreachable" (operator reads "server down"),
   and a refusal caused by *our own* load is handled as a dead service.
6. **Backoff is a herd amplifier.** `src/llm.ts:58-63`: `RETRIES` default 3,
   `BACKOFF_MS` default `2000,10000,30000` — **no jitter**, and with RETRIES=3
   only 2 s and 10 s are ever used before the call dies.
7. **The poison episode is 2,410 bytes / 12 lines** — among the smallest in a
   corpus of 380 episodes. **Size and token limits are excluded as causes.**
   Why it fails is `[UNKNOWN]` and is task B's job to find out. Its content is
   two long double-quoted transcript passages plus `user-observed:` and
   `what-changed:` sections; note that sibling episodes fail *shape/quote
   validation* frequently in the same log (`cause="N candidate(s) failed
   shape/quote validation"`) — quote handling is a live suspicion, not a
   conclusion.
8. **CORD's containment, already done — do not redo, do not undo:**
   `com.circadian.rem` and `com.circadian.rem-catchup` booted out; poison
   episode moved to `mind/quarantine/`. Restore commands are in
   `CONTAINMENT-2026-08-23-rem-storm.md` at the repo root. Branch
   `fix/rem-storm-containment-2026-08-23`, commit `b098598`, pushed.
9. `src/llm.ts` 283 lines · `src/stack.ts` 990 · `src/rem-popmem.ts` 1496 ·
   `src/wake.ts` 445. Existing tests include `rem-popmem.test.ts`,
   `stack.test.ts`, `wake.test.ts`. **There is no `src/llm.test.ts`** — task C
   creates it.

## Tasks — three disjoint file partitions, safe to run in parallel

Assign one worker per partition. **No two workers may touch the same file.**
If a fix seems to need a file outside your partition, that is a `need-help` to
the ORCH, not a reach across the line.

### Task A — the slot guard, the singleton, and the failure budget
**Owns: `src/rem-popmem.ts`, `src/rem-popmem.test.ts`**

The invariant: **at most ONE REM pass in flight, ever**, and **a failed run must
not present as a missed slot forever.**

- Make a *failed* run record its attempt against the slot, so `isDue()` can tell
  "never ran" from "tried and failed". A failed slot must stop being re-offered.
- Extend the single-flight lock to cover the **whole** entry path, not just
  `--if-due`. Two REM passes must not be able to overlap by any route.
- Add a **consecutive-failure budget**. CORD's ruling: **N = 3** — after three
  consecutive failed passes, stop attempting, emit a loud degraded/failed event
  naming the blocking episode, and stay stopped until a human or a successful
  manual run clears it. Do not invent a TTL or an auto-reset timer; a stuck
  state that a human must clear is the correct behavior here, and matches the
  `PENDING_ATTEMPTS_CAP` precedent already in `src/sleep.ts:83`.
- The stale-lock question is real: a run killed mid-flight leaves a lock. Handle
  it with evidence (e.g. pid liveness), and if you cannot resolve it honestly,
  mark it `[UNKNOWN]` and report — **do not guess a timeout**.

**Done-when:** a test in `rem-popmem.test.ts` that (a) starts a pass, (b) proves
a second concurrent pass refuses to start, and (c) proves three consecutive
failures stop the fourth attempt. Real subprocesses against a real temp
`CIRCADIAN_HOME`, no mocks — follow the pattern already in `src/sleep.test.ts`.
Full suite still >= 519 pass / 0 fail.

### Task B — quarantine the poison, then find out why it is poison
**Owns: `src/stack.ts`, `src/stack.test.ts`**

The invariant: **one un-extractable episode can never block the pipeline.**

- At the `extract-llm` step (`src/stack.ts:807`), a per-episode EXTRACT failure
  must **skip that episode, mark it, report it, and continue** with the rest.
  There is an exact precedent to follow: commit `85ed43b` fixed the same class
  of bug in the pending-sleep queue, where a cap branch `break`-ed the loop and
  wedged every entry behind the bad one — it became `continue` plus a
  dead-letter. Do the same shape here. Read that commit before you start.
- Mark the skipped episode durably enough that it is not retried on every pass,
  and that a human can see which episode is held aside and why.
- **Then diagnose the actual file.** Restore it from `mind/quarantine/` into a
  temp `CIRCADIAN_HOME` (do **not** move it back into `mind/episodes/`) and
  reproduce the EXTRACT failure with the real local LLM. Bisect its content:
  the quoted transcript passages, the embedded `{...}` JSON, the
  `user-observed:` / `what-changed:` sections. Fact 7 already excludes size.
  Report the cause as a fact, or report `[UNKNOWN]` with what you ruled out.
  **Do not invent a cause.**

**Done-when:** a test proving a corpus containing a deterministically
un-extractable episode still processes every other episode, and the bad one is
skipped-and-reported. Demonstrated with the **actual** poison file, not a
synthetic stand-in. Full suite still >= 519 pass / 0 fail.

### Task C — tell the truth about the endpoint, and stop starving it
**Owns: `src/llm.ts`, new `src/llm.test.ts`**

The invariant: **circadian must not be able to starve a service that graphiti,
colgrep and pickbrain also depend on.**

- Distinguish **"server down"** from **"server busy / refusing under load"** and
  handle them differently: down -> stop, do not retry into the ground;
  busy -> back off with jitter under a cap. Fact 5 gives you the exact
  signatures. Fix the message wording too — "unreachable" for a
  connection-refused-under-our-own-load is what made a self-inflicted storm
  look like a service outage to the operator.
- Add **jitter** to the backoff and a cap. Fact 6 is the current shape.
- Add a **concurrency cap** for circadian's calls against `:10240` — an
  in-process semaphore is not enough, because the fan-outs in facts 2 and 4 are
  **separate processes**. Cross-process is the requirement. Keep it as simple as
  it can be and still be true; a lock/counter directory under `logs/` in the
  spirit of `logs/sleep-claims/` is an acceptable shape.
- **Fence:** you may NOT touch the LLM server's own config and may NOT provision
  a second LLM. If you conclude the server itself is at fault, that is a finding
  you report to the ORCH, who routes it to CORD. It is not a fix you make.

**Done-when:** tests proving (a) a refusing endpoint is classified as busy and
backed off with jitter, not reported as unreachable, (b) a genuinely absent
endpoint is classified as down and does not retry to exhaustion, (c) the
concurrency cap holds **across processes**. Full suite still >= 519 pass / 0 fail.

## Tower

TOWER-WAIVED: this unit is a bounded three-partition code fix inside one repo
with a green test suite as its gate; findings route ORCH -> CORD via muster.

## Constraints

- **Fence: `~/circadian` only.** Anything outside it is a routed finding, never
  an edit. Do not touch `~/dotfiles`, the LLM server config, or another
  project's tree. On 2026-08-21 an agent reached outside its fence to tidy a
  shared checkout and permanently destroyed another lane's uncommitted work.
  Non-destructive intent is not a defense.
- **Do not undo CORD's containment.** Leave the launchd jobs booted out and the
  poison episode in `mind/quarantine/`. CORD lifts containment at the gate,
  after verifying your work.
- **Real tests, no mocks of the LLM.** The house pattern is a real subprocess
  against a real temp `CIRCADIAN_HOME` (`src/sleep.test.ts`). A deterministic
  failure injected through *content* beats a mock.
- **Workers commit their own units on their own branches** (operator law
  2026-08-21). Branch from `fix/rem-storm-containment-2026-08-23`. Stage
  explicitly — **never `git add -A`**; the mind repo has ~15 untracked episodes
  and `git add -A` would swallow them. CORD gates the merge, not the commit.
- Commit message format: the house handoff block
  (`PHASE:` / `DONE:` / `TODO:` / `BLOCKED:`).
- Mark anything you cannot verify `[UNKNOWN]`. A confident guess is a lie with
  good posture.
- Briefs name **profiles/roles only** — never a provider, model, or `--kind`.

## Report back with

To `cord-circadian`, via
`~/muster/bin/muster-deposit deposit --from orch-rem-storm-hardening --to cord-circadian --kind report|done|need-help --body "<evidence>"`:

1. Per task A/B/C: PASS/FAIL against each done-when, with the **evidence** —
   commands run and their real output, not a narrative.
2. `bun test` full-suite result (must be >= 519 pass / 0 fail).
3. The cause of the poison episode's EXTRACT failure, as a fact or as
   `[UNKNOWN]` with what was ruled out.
4. Branch names and commit SHAs per worker.
5. Your recommendation on lifting containment: is it safe to bootstrap
   `com.circadian.rem` again, and what measurement would prove it.
6. Anything you found outside the fence, as a routed finding.

`report` is not `done`. Two stopping states only: every done-when met with
evidence, or `need-help` naming the owner **after** finishing everything that
did not depend on it. An empty inbox is not a stop.

---

Before you begin, answer these three:

1. Do you understand the intent and purpose?
2. What questions do you have?
3. What details are ambiguous?
