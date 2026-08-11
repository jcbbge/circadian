# BRIEF — pending-sleep queue self-heal (ORCH: opus)

## Mission
The `circadian doctor` verdict is **NOT HEALTHY** on exactly one FAIL: the
pending-sleep queue has stuck dead-letter entries that can never drain and are
never dropped. Make the queue self-heal, clear the current stuck entries, and
land the fix **green on main** (committed + pushed). This is the last red.

## Root cause (PRE-VERIFIED — do not re-derive, verify then build)
Two components disagree on what "stuck" means — a one-source-of-truth split
(Josh's constitution, Art. 6):

- **Doctor** (`src/doctor.ts:761-779`, constants `:64-65`) flags an entry stuck
  when `attempts >= PENDING_ATTEMPTS_CAP (8)` **OR** `queued_at older than
  PENDING_STALE_HOURS (24h)`.
- **Drain** (`src/sleep.ts` `drainPendingSleep`, ~`:985-1094`; drop check at
  `:1006`) only **drops** an entry when `attempts >= PENDING_ATTEMPTS_CAP (8)`.
  A stale entry that never reaches the cap is retained forever — flagged red by
  doctor, never evicted by the drain.

Constants live in `src/sleep.ts:73`-ish (`DRAFT_ATTEMPTS=2`, and the cap) and
are **duplicated** in `src/doctor.ts:64-65`. The duplication IS the bug's
enabling condition.

## Current queue state (PRE-VERIFIED — `logs/pending-sleep.jsonl`, 3 lines)
1. session `019fdd2e-42ec-708c-8bb6-0b0854667377`, attempts 4, queued
   2026-08-07 (~3.8d ago), error "LLM output did not parse into an episode
   (25154 chars)". **STUCK (stale, under cap) → dead letter.**
2. session `019fdd2e-...` (same id, different queued_at), attempts 4, queued
   2026-08-07, error "...(3111 chars)". **STUCK → dead letter.**
3. session `17e06db7-ff71-40bb-bbab-0fb41d913dc6`, attempts 2, queued
   2026-08-11 (~today), error "...(30868 chars)". **NOT stuck — retain.**

`logs/` is gitignored; the queue file is local-only and never enters the public
repo. Do NOT commit anything under `logs/`.

## The fix (policy — implement in `src/sleep.ts`)
1. **Unify the threshold as one source of truth.** Export `PENDING_ATTEMPTS_CAP`
   and `PENDING_STALE_HOURS` (and a predicate `isPendingEntryStuck(entry, now)`)
   from ONE module, and have `src/doctor.ts` import them instead of redefining
   its own `:64-65` copies. Pick the home that avoids a circular import
   (a small shared module, or `sleep.ts` if doctor already depends on it — the
   coder decides and states why).
2. **Make the drain evict dead letters, loudly, not silently.** When a drain
   pass leaves an entry still failing AND the entry is stuck by the unified
   predicate (stale OR at cap), **dead-letter** it: append the line to
   `logs/pending-sleep.dead.jsonl` (auditable archive) and remove it from
   `pending-sleep.jsonl`, emitting a loud `fail`/`degraded` event (never a
   silent drop — Art. 9). Preserve the existing cap-based drop behavior; this
   generalizes it to cover stale-under-cap dead letters too.
3. Non-stuck failing entries (like #3 above) keep ratcheting attempts as today.

## Done-when (EXACT, all must hold — verified by evidence, not feeling)
- [ ] `src/sleep.ts` + `src/doctor.ts` share ONE definition of the stuck
      thresholds/predicate (no duplicated `8`/`24` literals across the two).
- [ ] The drain dead-letters stale-and-still-failing entries to
      `logs/pending-sleep.dead.jsonl` with a loud event.
- [ ] `src/sleep.test.ts` has a test proving: a stale persistently-failing
      entry is dead-lettered; a fresh failing entry (under thresholds) is
      retained. Real files in a tmpdir — NO mocks.
- [ ] `bun test src/sleep.test.ts` and `bun test src/janitor.test.ts` (touching
      nothing else) are green; `bun build src/sleep.ts` and `bun build
      src/doctor.ts` succeed.
- [ ] Running `bun src/sleep.ts --drain` (local LLM is up at :10240) clears the
      two `019fdd2e` stuck lines from `logs/pending-sleep.jsonl` into the dead
      file, and retains `17e06db7`.
- [ ] `CIRCADIAN_HOME=$PWD bun src/doctor.ts` shows the **pending sleep queue**
      check is NOT `FAIL` (IDLE/OK/WARN-non-stuck acceptable).

Coordinator (CORD, me) owns the final commit + push to origin/main and the
green re-verification. The ORCH gates its workers; **workers never commit**.

## Sub-fleet the ORCH must spawn (herdr, per control-flow.md)
- **AGNT coder (gpt-5.6):** implements the fix + test in `src/sleep.ts`,
  `src/doctor.ts`, `src/sleep.test.ts`.
  `spine-spawn worker --label pending-sleep-code --profile coder:luna
  --kind cursor --brief briefs/pending-sleep-selfheal/AGNT-coder.md`
- **SAGT reviewer (sonnet):** reviews the diff against Done-when, runs the
  tests + doctor, posts findings. NO writes.
  Spawn direct: `herdr agent start sagt-pending-sleep-review --kind cursor
  --pane <id> -- --model claude-sonnet-5-thinking-high --trust --yolo
  --sandbox disabled --approve-mcps`, stamp `--token role=4-SAGT`.

## Report contract
Post to the Tower board (project topic `circadian/pending-sleep`) a CLAIM at
start and a DONE at finish (role + human work name + outcome). Final action:
write `briefs/pending-sleep-selfheal/done/<agent>.done`. Idle after DONE —
status is not mail; the coordinator collects on the board.
