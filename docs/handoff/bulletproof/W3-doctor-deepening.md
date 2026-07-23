# W3 — Doctor deepening: see the queue, see launchd

**Model tier: default (judgment required).** Circadian repo (/Users/jrg/circadian), Bun + TypeScript, no package.json. Doctor is the single honest health surface (10 checks, reads logs/circadian.events.jsonl + cheap probes). Two blind spots allowed last night's episode loss to look healthy by morning: doctor cannot see the new pending-sleep queue, and it cannot see that launchd's last `com.circadian.rem` exit was status 1. Your job: two new checks, zero regression to the existing ten. Do NOT use emojis anywhere.

## Pre-Verified Facts (coordinator verified all of these personally this session)

- src/doctor.ts (546 lines): check functions push `{name, level, detail}` via `add(name, level, detail)`; levels OK|IDLE|WARN|FAIL; main() calls checkLedger, checkProcess×4 (wake/graze/sleep/rem), checkLLM, checkHooks, checkMindRepo, checkCaps, checkEpisodes, then renders (human / `--quiet` / `--json`), `--alert` posts FAILs to ~/.tower/board.jsonl, exits 1 iff any FAIL.
- checkLLM already probes `${LLM_BASE_URL}/models` via curl (WARN when down) — leave it exactly as is.
- FIXED CONTRACT from W1 (being implemented in parallel — code against the path, not the implementation): pending queue at `$CIRCADIAN_HOME/logs/pending-sleep.jsonl`, JSON lines `{"ts","session_id","transcript_path","transcript_chars","attempts","last_error","queued_at"}`; attempts cap 8. The file will NOT exist until W1 lands and a failure occurs — absent means IDLE, not error.
- launchd state: `launchctl list | grep com.circadian` → three agents: com.circadian.rem (last exit status 1 — fossil of the 03:00 loud LLM failure), com.circadian.rem-catchup (0), com.circadian.doctor (0). Output columns: PID (or `-`), Status, Label.
- CIRCADIAN_HOME env override threads the whole repo (default ~/circadian) — all checks must honor it (existing checks already do).
- Doctor doctrine (header comment): READS the ledger + cheap probes; NEVER re-invokes wake/sleep/graze/rem. Your checks are file reads + one launchctl parse — keep it that way.

## Parallel Work Notice

W1 owns src/sleep.ts, src/backfill.ts, src/rem.ts. W2 owns src/llm.ts. Touch nothing but src/doctor.ts. Post your CLAIM to the tower board per the worker contract before editing.

## Tasks

1. **"pending sleep queue" check** — done when: reads $CIRCADIAN_HOME/logs/pending-sleep.jsonl. Absent/empty → IDLE ("no queued episodes; nothing awaiting recovery"). ≥1 parseable line → WARN with count + oldest queued_at age (use the existing hoursSince/fmtAge helpers). Any line with attempts ≥ 8 OR queued_at older than 24h → FAIL (it has survived multiple REM drains; human decision required — name the session_id in the detail). Unparseable lines → count them and WARN (queue corruption is a fact worth surfacing).
2. **"launchd agents" check** — done when: parses `launchctl list` (via the existing tryExec) for labels com.circadian.rem, com.circadian.rem-catchup, com.circadian.doctor. Any label MISSING → WARN (name it). Any label with non-zero last-exit Status → WARN `label last exit N — fossil of a loud failure; clears on next healthy scheduled run` (never FAIL on this alone: the ledger's unaddressed-failure logic already owns FAIL semantics — double jeopardy would cry wolf). All present + zero → OK.
3. **Zero regression** — done when: all 10 existing checks, the render formats (human/quiet/json), --alert behavior, exit-code semantics (1 iff any FAIL), and the doctor's own `ok` event emission are unchanged. Check ORDER: append your two after checkEpisodes; the summary counts line must reflect 12 checks.

## Constraints

- Touch ONLY: src/doctor.ts. Do not commit or stage.
- No mocks: sandbox via CIRCADIAN_HOME=/tmp/circ-w3 with seeded fixture state (a hand-written pending-sleep.jsonl IS input data, not a mock — the LLM is not involved in this check at all).
- launchctl parsing must tolerate: PID `-`, extra whitespace, labels absent entirely (Linux/WSL dev machines have no launchctl — tryExec failure → single WARN "launchctl unavailable", not a crash).

## Verification (run exactly these, paste tails)

1. Real home: `bun src/doctor.ts` → exits 0 (or explains any WARN), shows 12 checks including your two; pending queue = IDLE; launchd = WARN naming com.circadian.rem status 1.
2. `bun src/doctor.ts --json` → valid JSON, `"checks": 12` in the emitted summary event context, exit 0.
3. Sandbox: `mkdir -p /tmp/circ-w3/logs && cp -R mind /tmp/circ-w3/`; seed /tmp/circ-w3/logs/pending-sleep.jsonl with (a) one fresh line attempts:1 → `CIRCADIAN_HOME=/tmp/circ-w3 bun src/doctor.ts --quiet` shows WARN with count+age; (b) add one line with attempts:8 → FAIL + exit 1; (c) corrupt one line → WARN mentions unparseable.
4. `bun src/doctor.ts --alert` in the FAIL sandbox state → a line lands in ~/.tower/board.jsonl (verify with `tail -2 ~/.tower/board.jsonl`).

## Report back with

Diff summary line-level; tails of verification 1-4; deviations with reasons; every file created/modified. Write logs/fleet/circadian-W3-doctor-deepening.done per the worker contract.
