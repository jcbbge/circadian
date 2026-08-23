# Criteria — Task A (slot guard, singleton lock, failure budget)

Partition: `src/rem-popmem.ts` (implementer) / `src/rem-popmem.test.ts` (this
file, test-maker). All tests below are new, appended to the end of
`src/rem-popmem.test.ts` inside `describe("wave-2 hardening: slot guard,
singleton lock, failure budget", ...)`. All RED today (2026-08-23), for the
reasons documented inline in the test file.

Run: `bun test src/rem-popmem.test.ts` (this file only) or `bun test` (full
suite, floor >= 519 pass / 0 fail plus this wave's wave-1 red tests).

## Done-when (a) — a pass starts, and a second concurrent pass refuses to start

- **Test:** `single-flight lock — whole entry path (work item 2) > a live
  --if-due lock also blocks a concurrent MANUAL (non---if-due) run`
- **Command:** `bun test src/rem-popmem.test.ts -t "blocks a concurrent MANUAL"`
- **Proves:** the `--if-due` half of this already works (fact 7,
  `acquireIfDueLock`, pre-existing). The RED half is work item 2: a manual
  invocation must also see the lock and bail with the same
  `phase: "schedule-guard"` idle event naming `lock_path`. Today the lock
  check lives entirely inside `if (ifDue)` (rem-popmem.ts ~1015-1036), so a
  manual run never looks at it.

## Done-when (b) — three consecutive failed PASSES, across three slots, stop the fourth; degraded event names the blocking episode

- **Test 1 (the slot-burn precondition, work item 1):**
  `consecutive-failure budget & slot-burn (work items 1 and 3) > a failed
  pass burns its slot: isDue must not re-offer within the same slot after a
  failure`
  **Command:** `bun test src/rem-popmem.test.ts -t "burns its slot"`
  **Proves:** a failed pass must record its attempt against the slot (a
  scoreboard `type: "rem"` entry, however implemented) so `isDue()` reads
  "tried and failed" instead of "never ran." Today a per-episode `fail()`
  kills the process before the scoreboard is ever touched (fact 4), so
  `isDue` is unconditionally `true` after a failure — the exact thundering
  herd.
- **Test 2 (the cross-slot budget + clearing surface, work item 3):**
  `consecutive-failure budget & slot-burn (work items 1 and 3) > three
  consecutive failed passes across three slots stop the fourth from
  starting; a clean manual run clears the stuck state`
  **Command:** `bun test src/rem-popmem.test.ts -t "stop the fourth"`
  **Proves:** with 3 synthetic failed-rem scoreboard fixtures at 3 distinct
  slots (CORD's amendment: state machine, not the calendar), a 4th
  `--if-due` call — even though its slot is otherwise due — must refuse to
  start and emit a `degraded` event whose `context.failure_episode` names
  the blocking episode; `digested.jsonl` must stay untouched (proves the
  block happens BEFORE absorb). Then a successful manual (non---if-due) run
  must clear the stuck state, so a subsequent `--if-due` call is no longer
  blocked by the stale failure count. **Fixture schema this test defines as
  the spec** (no prior convention exists — proposed by this wave, open to
  ORCH override): a failed-pass scoreboard entry is
  `{ ts, type: "rem", failed: true, failure_episode: "<filename>" }`; the
  stop-state's degraded event carries `context.failure_episode` with the
  same value. The implementer may choose any internal file/counter
  mechanism as long as this externally observable contract holds.

## Done-when (c) — an episode-level failure no longer wedges the pass

- **Test:** `episode-level failure no longer wedges the pass (work items 4
  and 5) > one malformed episode is held aside; the remaining episodes still
  process and successes are recorded digested`
- **Command:** `bun test src/rem-popmem.test.ts -t "held aside"`
- **Proves:** 3 episodes, alphabetical order good/bad/good. The bad one
  fails deterministically at parse-episode (no frontmatter, no LLM
  reached). Both good ones take the real "already-stacked" ledger
  idempotence path (also no LLM). Asserts: (1) the process exits 0 — the
  pass no longer dies mid-loop (work item 4: `continue`, not abort); (2)
  BOTH good episodes' hashes land in `digested.jsonl` (work item 5:
  `recordDigested` must run incrementally, not once after the whole loop —
  today it's called once at rem-popmem.ts:1072, after a loop that never
  finishes, so even the episode that succeeded BEFORE the poison one is
  lost). Today: exit code 1, `digested.jsonl` empty.

## Full-suite floor

`bun test` on this branch: **521 pass / 9 fail** (2026-08-23, this worktree).
9 fail = this unit's 4 new RED tests + 5 RED tests from sibling units B/C
(also wave-1, also expected red). Pre-existing 519/0 floor is unaffected by
this file's changes — verified by running `src/rem-popmem.test.ts` alone
(73 pass / 4 fail, all 4 new) and the full suite (no pre-existing test
regressed).

## Notes for the implementer (agnt-rem-slot-guard)

- No mocks anywhere in these tests. Episode failures are real content
  (missing frontmatter) or a real ledger idempotence hit. The LLM is never
  mocked — `CIRCADIAN_LLM_BASE_URL` is pointed at a closed port
  (`127.0.0.1:19999`) so `complete()` really attempts a connection and
  really fails fast (connection refused), which the existing propagation
  and greeting call sites already degrade gracefully on (verified: neither
  crashes today when the LLM is unreachable).
- `makeCliHome()` (top of the new `describe` block) pre-seeds `SELF.md`,
  `render-manifest.json`, `digested.jsonl`, `scoreboard.jsonl`, `greeting.md`
  as empty placeholders and git-inits `mind/`. This is NOT masking a bug in
  your partition — it's because `git add <path>` (rem-popmem.ts's MIND
  COMMIT step) throws hard on a missing pathspec, and a genuinely first-ever
  mind/ (zero prior runs) can leave `greeting.md`/`digested.jsonl` absent
  when nothing new was stacked / the LLM is unreachable. **Flagging this as
  an out-of-partition finding, not fixing it**: a fresh `mind/` with an
  unreachable LLM on its very first cycle would hit this today outside any
  test harness too. Routed to ORCH per the fence rule.
