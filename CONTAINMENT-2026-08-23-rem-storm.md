# CONTAINMENT RECORD — REM retry storm, 2026-08-23

Actor: cord-circadian (CORD). Authority: brief
`~/agent-core/briefs/house/CORD-circadian-rem-storm-2026-08-23.md` task 1.
Everything below is REVERSIBLE. Nothing was deleted.

## What was disabled

| # | Action | Exact restore command |
|---|---|---|
| 1 | `launchctl bootout gui/$(id -u)/com.circadian.rem` | `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.circadian.rem.plist` |
| 2 | `launchctl bootout gui/$(id -u)/com.circadian.rem-catchup` | `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.circadian.rem-catchup.plist` |
| 3 | Moved the un-extractable episode out of the REM input set: `mind/episodes/2026-08-21-freeze-stale-design-pause.md` -> `mind/quarantine/` | `mv mind/quarantine/2026-08-21-freeze-stale-design-pause.md mind/episodes/` |

`com.circadian.doctor` was deliberately LEFT LOADED — it is the observability
mouth (09:05 / 21:05, one LLM probe) and is not a storm contributor.

## Measurements (real, not inferred)

- `mlx-omni-server` PID 1054: brief-reported **51.7% CPU** -> measured
  **0.1% CPU** at 13:36 and 13:38 local (`ps -p 1054 -o pid,pcpu,pmem`).
  MEM steady at 26.5% (~17 GB resident — model weights, expected).
- Live circadian workers: **0** (`pgrep -fl "rem-popmem|sleep.ts --worker|graze.ts --worker"`).
- Port 10240: **LISTEN only**, zero ESTABLISHED (`lsof -nP -iTCP:10240`).
- `curl -m 8 http://127.0.0.1:10240/v1/models` -> **HTTP 200 in 2.9 ms**.
- `~/circadian/logs/rem.error.log` last write **Aug 23 11:43** — the acute
  storm had already burned out ~2 h before containment. Containment prevents
  RECURRENCE (next scheduled slot 21:00, plus every new session's wake
  catch-up), it did not itself end the storm.
- Load average 4.23 at 13:36 is NOT circadian: WebKit.WebContent 77.6%,
  WebKit.GPU 68.9%, `coraline sync` 84.6%, `llmtrim serve` 16.4%, and ~10
  `claude` panes. See ROUTED FINDING below.

## Mechanism, as verified from code + log text (not the brief's hypothesis)

1. `src/wake.ts:409-425` spawns `bun run src/rem-popmem.ts --if-due`
   **detached on EVERY session start**. That — not `com.circadian.rem-catchup`
   (which is `RunAtLoad` and fires once per login) — is the multiplier that
   produced five distinct run ids. The brief's suspicion that the catchup slot
   guard "double-runs" is **not supported**: `rem-popmem.ts:1014-1023` does hold
   a real single-flight lock.
2. `rem-popmem.ts:207-214` — `isDue()` is true iff no run **COMPLETED** since
   the slot opened. The source comment at `:118` states it outright: "The
   scoreboard due-check only guards on COMPLETED slots". A run that **fails**
   never records completion, so the slot stays due **forever**, and every
   subsequent session re-fires it. That is the actual root: failure is
   indistinguishable from never-ran.
3. The five stacked `sleep.ts --worker` processes are a **second, independent**
   load source (`circadian-mind.ts` spawns one per session event) sharing the
   same endpoint. Two uncapped per-session fan-outs against one shared service.
4. **The preflight is not lying about transport.** `src/llm.ts:89-110` reports
   `timeout after 5000ms` for an AbortError and `err.message` otherwise. The
   log says `(Unable to connect. Is the computer able to access the url?)` —
   an actual transport refusal, not a timeout. So fact 6's *second* branch is
   the true one: under concurrent load the server **refuses new connections
   while still LISTENING** (backlog/worker exhaustion). The defect is the
   *wording* ("unreachable" -> operator reads "server down") and the
   *handling* (a refusal under self-inflicted load is treated as a dead
   service), not the probe.
5. The poison document is **2,410 bytes / 12 lines** — the smallest class of
   episode in the corpus. Size and token limits are **excluded** as causes.
   Why it fails is still **[UNKNOWN]** and is task 3's investigation.

## ROUTED FINDING (outside my fence — for the concierge, not fixed here)

The fans the operator is hearing **right now** are not circadian's. At 13:36
circadian's total CPU was ~0.1% while `coraline sync --quiet` was at 84.6%,
two WebKit processes at 77.6% + 68.9%, `llmtrim serve` at 16.4%, and ten
`claude` panes were live. Circadian was the cause of the 11:43 storm; it is
not the cause of the 13:36 load. Someone should look at `coraline sync` and
the pane count. Outside `~/circadian` — routed, not touched.
