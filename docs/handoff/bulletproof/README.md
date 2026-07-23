# Bulletproof Circadian — Coordinator Partition Map
**Date:** 2026-07-23 · **Coordinator:** pi session 019f8fe5 · **Mandate:** jrg — "make this fucking bulletproof; every piece confirmed, tested; fix what you find, don't flag it"

## Defect ledger (all evidence-verified this session)

| # | Defect | Evidence | Fix | Owner |
|---|--------|----------|-----|-------|
| D1 | Sleep episodes lost permanently when LLM drafting fails | events ledger 2026-07-23T05:04: two sessions degraded "episode draft failed twice; this session leaves no episode" | durable pending-queue + drain | W1 |
| D2 | backfill manifest counts FAILED transcripts as done (failures can never be retried) | src/backfill.ts: `done.add(JSON.parse(line).path)` ignores `status` | resume skips only status=="ok" | W1 |
| D3 | No REM-side recovery path for lost episodes | rem.ts main() has no queue drain | REM drains queue before batch loop | W1 |
| D4 | llm.ts has no retry/preflight/fallback; one dead service stretch = data loss | 00:46–05:04 empty-content failures; 15:37 abort | preflight + bounded backoff retry + fallback URL | W2 |
| D5 | doctor blind to queue depth and launchd exit fossils | doctor.ts has 10 checks, none for these | two new checks | W3 |
| D6 | launchctl `com.circadian.rem` last exit = 1 | fossil of the 03:00 loud failure — correct behavior (fail() exits 1), surfaced by W3's new check, cleared by next healthy scheduled run | W3 surfaces; no code change |
| D7 | logs/*.jsonl untracked but not gitignored | `git status` shows `?? logs/backfill.jsonl`, `?? logs/circadian.events.jsonl` | .gitignore `logs/*.jsonl` | coordinator (inline, done) |
| D8 | Fleet agent defs reference RETIRED tools (strudel_prep/strudel_bake) and stale models | markarian.md, procyon.md et al. — retired 2026-07-10 per AGENTS.md | sweep frontmatter + markarian Tool Reality section | coordinator (inline) |

## Partition map (disjoint files)

| Worker | Files it owns | Files it must NOT touch |
|--------|---------------|-------------------------|
| W1 sleep-durability | src/sleep.ts, src/backfill.ts, src/rem.ts (drain hook only) | src/llm.ts, src/doctor.ts, mind/ |
| W2 llm-resilience | src/llm.ts only | everything else |
| W3 doctor-deepening | src/doctor.ts only | everything else |

Workers do NOT git commit or stage. The coordinator gates everything.

## Fixed contracts (both W1 and W3 code against these)

- Pending queue: `$CIRCADIAN_HOME/logs/pending-sleep.jsonl` — JSON lines:
  `{"ts","session_id","transcript_path","transcript_chars","attempts","last_error","queued_at"}`
- Queue cap: attempts >= 8 → stays queued + loud `fail()`.
- Drain entry points: `bun src/sleep.ts --drain` (manual) + REM main() drains before batch loop.
- Lockfile: `$CIRCADIAN_HOME/logs/pending-sleep.lock` (O_EXCL, stale after 15 min).

## Verification gate (coordinator, after all workers done)

1. `bun src/doctor.ts` — all checks green (or WARN explained)
2. LLM-kill drill in sandboxed CIRCADIAN_HOME: dead LLM → queue → restore → drain → episode
3. REAL recovery: drain the two lost Arc sessions
   - c93ec9ae-c37f-40e9-b8de-1b4825108df2 (850KB transcript)
   - a40e6c7a-80a1-4788-a057-1ef1fe3c5ab9 (601KB transcript)
   both at ~/.claude/projects/-Users-jrg-infinity-arc/
   NOTE: NOW.md will be re-drafted from those transcripts during recovery — expected churn; this session's own SLEEP rewrites it fresh tonight.
4. `bun src/backfill.ts --dry-run` — manifest semantics sane
5. `bun src/status.ts` — verdicts/vitals render
6. Commit: explicit adds, PHASE/DONE/TODO convention
