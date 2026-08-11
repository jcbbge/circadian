# AGNT (coder, gpt-5.6) — implement pending-sleep self-heal

Read `briefs/pending-sleep-selfheal/BRIEF.md` (root cause + facts) and
`CONTRACT.md` (rules) first. You own ONLY: `src/sleep.ts`, `src/doctor.ts`,
`src/sleep.test.ts`. Do not commit.

## Do
1. Create ONE source of truth for the "stuck" thresholds and predicate:
   `PENDING_ATTEMPTS_CAP` (8), `PENDING_STALE_HOURS` (24), and
   `isPendingEntryStuck(entry, nowMs)` returning true when
   `attempts >= cap` OR `queued_at older than stale hours`. Export it; make
   `src/doctor.ts` import it and delete its duplicate constants at `:64-65`.
   Choose the module home to avoid a circular import; state your choice in a
   one-line comment.
2. In `drainPendingSleep` (`src/sleep.ts`): when an entry is still failing after
   this drain pass AND `isPendingEntryStuck` is true, DEAD-LETTER it — append
   the raw line to `logs/pending-sleep.dead.jsonl` and remove it from
   `pending-sleep.jsonl`, emitting a loud `fail`/`degraded` event
   (`phase: "drain-deadletter"`, include session_id, attempts, queued_at,
   last_error). Keep the existing cap drop working (it becomes a subset of this).
3. Non-stuck failing entries keep ratcheting attempts exactly as today.

## Test (`src/sleep.test.ts`, real tmpdir, no mocks)
- A queue line with `queued_at` 3+ days ago that fails to draft → after a drain
  pass, it is gone from `pending-sleep.jsonl` and present in
  `pending-sleep.dead.jsonl`.
- A queue line queued "just now" that fails → retained in
  `pending-sleep.jsonl`, attempts ratcheted, NOT in the dead file.

## Verify before you report (paste output into your DONE)
- `bun test src/sleep.test.ts`  → green
- `bun build src/sleep.ts && bun build src/doctor.ts`  → both OK
- Confirm no `8`/`24` stuck-threshold literals remain duplicated across
  `src/sleep.ts` and `src/doctor.ts`.

## Report
Tower CLAIM at start, DONE at finish (topic `circadian/pending-sleep`), then
write `briefs/pending-sleep-selfheal/done/agnt-coder.done` and idle.

## ORCH addendum — re-verified live 2026-08-11 (trust these, don't re-derive)

1. **The cap does NOT drop — it halts.** `src/sleep.ts:1006` sets
   `capHit = entry` and **`break`s out of the whole loop**, leaving the entry
   queued; `fail()` fires after the merge with `code: 1`. So there is no
   existing "drop at cap" to preserve — and worse, a cap-hit entry blocks
   every entry behind it from being processed at all. The only current drop
   path (`phase: "drain-drop"`, `dropped += 1`) is for a **missing
   transcript**. Your dead-letter must therefore *replace* the halt-at-cap
   behavior with an eviction that lets the loop continue, not sit alongside a
   drop that isn't there. Keep a loud `fail`/`degraded` event either way.
2. **A deterministic no-mock failure exists — use it.** `DraftResult`
   (`src/sleep.ts:762-765`) has status `"empty-transcript"`, and the drain's
   `else` branch turns it into `last_error: "transcript yielded no
   user/assistant text"` and ratchets attempts. So a **real transcript file
   that exists but contains no user/assistant text** fails the draft
   deterministically, with no LLM call and no mock. That is the fixture for
   both test cases — do NOT try to coax the live LLM into failing.
   Watch `isBenchSession(sessionId, transcriptPath)` (`:788`): it short-circuits
   before drafting, so keep your fixture's session id and tmpdir path
   clear of bench/eval markers or your entry will be skipped, not failed.
3. **Baseline verified this session.** doctor is `✗ FAIL pending sleep queue
   2 stuck ... (3 episode(s) awaiting sleep re-run, oldest 3.8d ago)`; the
   queue holds the two `019fdd2e` lines at attempts 4 / age ~91h (stale, under
   cap) and `17e06db7` at attempts 2 / age ~13.5h (not stuck). Note both
   `019fdd2e` lines share one session_id with different `queued_at` —
   `pendingKey(entry)` is what distinguishes them, so make sure dead-lettering
   keys off the same identity the queue rewrite uses.
4. `CIRCADIAN_HOME` is the root for `logs/` (`src/sleep.ts:71`), so your
   tmpdir test drives the queue by setting `CIRCADIAN_HOME` — confirm how the
   module reads it (import-time constant vs per-call) before designing the
   test, and say which in your DONE.
