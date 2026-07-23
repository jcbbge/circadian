# W1 — Sleep durability: no episode is ever lost again

**Model tier: default (judgment required).** Circadian repo (/Users/jrg/circadian), Bun + TypeScript, no package.json. Overnight on 2026-07-23 the local LLM died and two real sessions left NO episode — the exact "letter never written" discontinuity this system exists to prevent. Your job: make episode loss structurally impossible via a durable pending-queue with drain, and fix backfill's manifest which currently makes failures un-retryable. Do NOT use emojis anywhere.

## Pre-Verified Facts (coordinator verified all of these personally this session)

- src/sleep.ts (493 lines): hook mode spawns detached `--worker`; worker drafts via `complete()` from src/llm.ts, 2 attempts. On final failure it emits `degraded({process:"sleep", phase:"llm-draft", ...})` with summary "episode draft failed twice; this session leaves no episode" and `return`s — the episode is gone forever. The `runWorker()` function is the drafting path; it reads the event from `process.env.CIRCADIAN_SLEEP_EVENT` or stdin.
- Evidence: logs/circadian.events.jsonl 2026-07-23T05:04:39 and 05:04:40 — sessions c93ec9ae-c37f-40e9-b8de-1b4825108df2 (transcript_chars 24393) and a40e6c7a-80a1-4788-a057-1ef1fe3c5ab9 (22607), cause "LLM returned nothing (call failed or timed out)". Both transcripts still exist at ~/.claude/projects/-Users-jrg-infinity-arc/<session-id>.jsonl (850KB and 601KB).
- src/backfill.ts (213 lines): resume reads MANIFEST (logs/backfill.jsonl) and does `done.add(JSON.parse(line).path)` for EVERY line — including lines with `status: "no-episode"`. A failed transcript is therefore skipped forever on re-runs. Manifest line shape: `{ts, path, source, status}` where status is "ok" or "no-episode".
- src/rem.ts (1188 lines): `main()` at ~line 855. After the `--if-due` schedule guard and BEFORE the AIMD batch loop (`let batch = REM_BATCH_DEFAULT;`). Entry points: scheduled launchd 09:00/21:00 (unconditional) and opportunistic `--if-due` callers.
- src/obs.ts API: `ok/idle/degraded({process, phase, correlation_id, summary, context?, cause?, next_action?})`, `fail({...same, code?})` exits non-zero, `correlation(prefix)`. degraded/failed REQUIRE cause+next_action (enforced in emit()).
- CIRCADIAN_HOME env override threads through every file (default ~/circadian); logs dir is $CIRCADIAN_HOME/logs; episodes at $CIRCADIAN_HOME/mind/episodes; BUN_BIN pattern: `process.env.CIRCADIAN_BUN_BIN || join(homedir(), ".bun/bin/bun")` (see backfill.ts).
- The local LLM is currently HEALTHY (doctor OK at 16:52). A dead-endpoint drill uses `CIRCADIAN_LLM_BASE_URL=http://127.0.0.1:9/v1` (port 9 = discard, connection refused).
- FIXED CONTRACT (W3 codes against this too): queue file `$CIRCADIAN_HOME/logs/pending-sleep.jsonl`, JSON lines `{"ts","session_id","transcript_path","transcript_chars","attempts","last_error","queued_at"}`. Lockfile `$CIRCADIAN_HOME/logs/pending-sleep.lock`. Attempts cap 8.
- There is no test framework in this repo. Verification = live behavioral drills (see below). Sandbox with `CIRCADIAN_HOME=/tmp/circ-w1` containing a copied mind/ scaffold — real state, real LLM, zero risk to the real mind.

## Parallel Work Notice

W2 owns src/llm.ts (retry/preflight/fallback — its signature stays `complete(prompt, {timeoutMs, maxTokens, temperature?})`, so your call sites are unaffected). W3 owns src/doctor.ts (read-only against your queue path). Do not touch src/llm.ts, src/doctor.ts, mind/, or docs/. Post your CLAIM to the tower board per the worker contract before editing.

## Tasks

1. **Pending queue in sleep.ts** — done when: on final draft failure (after the existing 2 attempts), the worker appends one queue line to logs/pending-sleep.jsonl BEFORE emitting the degraded event, and the degraded event's context gains `queued: true`. Queue write must be atomic (tmp+rename or append — append is fine for JSONL) and must never throw (queue-write failure gets its own `fail()` loud event; it must not be swallowed).
2. **`--drain` mode in sleep.ts** — done when: `bun src/sleep.ts --drain` processes the queue oldest-first: (a) transcript file gone → drop line + `degraded` event (unrecoverable, human-visible); (b) transcript present → run the SAME drafting path inline (refactor runWorker's core into a callable function; do not spawn subprocesses for this) — success drops the line + `ok` event, failure keeps it and increments `attempts`; (c) `attempts >= 8` → leave queued and `fail()` loud (human decision required). Ends with one summary `ok` event {drained, remaining, dropped}. Lockfile (O_EXCL create; stale >15min broken with a stderr note) prevents concurrent drains; lock held for the whole drain, released in finally.
3. **REM drain hook in rem.ts** — done when: in main(), after the if-due guard and before the batch loop, if the queue file exists and is non-empty, REM runs `spawnSync(BUN_BIN, ["run", sleepTsPath, "--drain"], {stdio: "ignore", env: process.env})` and emits one `ok` event {phase:"pending-drain", queued_before}. Empty/absent queue → no event, no spawn (silence is correct for the common case). Minimal, surgical edit; do not refactor rem.ts.
4. **backfill.ts manifest fix** — done when: resume only adds a path to `done` when the manifest line's `status === "ok"`; the header usage comment documents that re-running now retries previously-failed transcripts. Behavior preserved otherwise (flags, ordering, manifest appends unchanged).

## Constraints

- Touch ONLY: src/sleep.ts, src/backfill.ts, src/rem.ts. Do not commit or stage.
- No mocks: drills hit the real LLM for the success leg and a dead port for the failure leg.
- Sandbox drill pattern: `mkdir -p /tmp/circ-w1 && cp -R mind /tmp/circ-w1/` then run everything with `CIRCADIAN_HOME=/tmp/circ-w1`. NEVER run drills against the real ~/circadian/mind.
- Keep runWorker's existing behavior byte-identical on the success path (episode format, NOW.md write, meal fold-and-delete, scoreboard append).

## Verification (run exactly these, paste tails into your report)

1. Synthetic fixture: write a >10KB synthetic transcript JSONL (user/assistant turns, `{"message":{"role":"user","content":[{"type":"text","text":"..."}]}}` shape — read extractTranscriptText in sleep.ts for the exact parse shape) at /tmp/circ-w1-fixture.jsonl.
2. Dead-LLM leg: `CIRCADIAN_HOME=/tmp/circ-w1 CIRCADIAN_LLM_BASE_URL=http://127.0.0.1:9/v1 CIRCADIAN_SLEEP_EVENT='{"transcript_path":"/tmp/circ-w1-fixture.jsonl","session_id":"w1-drill"}' bun src/sleep.ts --worker` → expect degraded event, queue file with 1 line (attempts: 2).
3. Drain-dead leg: `CIRCADIAN_HOME=/tmp/circ-w1 CIRCADIAN_LLM_BASE_URL=http://127.0.0.1:9/v1 bun src/sleep.ts --drain` → line kept, attempts incremented, summary event remaining:1.
4. Drain-live leg: `CIRCADIAN_HOME=/tmp/circ-w1 bun src/sleep.ts --drain` → episode file created in /tmp/circ-w1/mind/episodes/, queue empty, ok events. Inspect the episode — real LLM output, sane markdown.
5. REM integration smoke: `CIRCADIAN_HOME=/tmp/circ-w1 CIRCADIAN_LLM_BASE_URL=http://127.0.0.1:9/v1 timeout 120 bun src/rem.ts --dry-run` → must not hang or crash on the drain step (dead LLM: drain keeps line, REM proceeds to "nothing to digest" or digests sandbox episodes). Note: rem.ts reads its scoreboard from the sandbox mind — copying mind/ gives it real state; --dry-run guarantees no writes to SELF.md.
6. Backfill dry-run against REAL home: `bun src/backfill.ts --dry-run` → exits 0, prints candidate counts.

## Report back with

Per-file diff summary (what changed and why, line-level); full tails of drill steps 2-5; any deviations with reasons; list every file you created or modified including temp fixtures. Write logs/fleet/circadian-W1-sleep-durability.done per the worker contract.
