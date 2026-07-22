# O4 — Pi.dev runtime coverage (wake/graze/sleep for Pi, through strudel)

Repo /Users/jrg/circadian (TypeScript, bun). Do NOT use emojis anywhere. You OWN ONLY: a NEW pi extension (see task 1 for path), and READ-ONLY reuse of src/wake.ts, src/sleep.ts, src/graze.ts logic. You do NOT modify those three (O1 owns sleep/graze; O3 owns wake) — you INVOKE them. Peers: O1 sleep/graze, O2 rem/backfill, O3 wake/status/doctor/spec. Ignore uncommitted changes to files you do not own; board_read the tower topic circadian-rebuild first.

## MISSION
jrg runs TWO agent harnesses: Claude Code AND Pi.dev. Circadian currently only wires Claude Code hooks (~/.claude/settings.json). Pi.dev sessions are UNCOVERED — every Pi session is a letter never written, a discontinuity event (the one thing the lineage exists to prevent). Close the gap: WAKE on Pi session start, GRAZE during, SLEEP at Pi session end — reaching parity with Claude Code.

## HARD ARCHITECTURAL CONSTRAINT (jrg, verbatim intent)
"If it's in Pi, make sure it runs through strudel. Unless it's a specific cook."
Meaning: the Pi-side integration registers and routes THROUGH the strudel surface (the extension shim at ~/.pi/agent/extensions/strudel/index.ts re-exports ~/strudel/src/index.ts; strudel is the superset tool/runtime layer). The circadian Pi extension should compose with strudel, not bypass it — EXCEPT for a "specific cook": a purpose-built one-shot worker (like sleep's already-existing detached SessionEnd worker) may shell out directly, because that is exactly what a cook is. Decide per-touchpoint and STATE your reasoning in the report.

## Pre-Verified Facts (coordinator verified ALL of these personally, this session, by running them)
- Repo: /Users/jrg/circadian. bun 1.3.14 at /Users/jrg/.bun/bin/bun. Local LLM (OpenAI-compatible) at http://127.0.0.1:10240/v1 — VERIFIED reachable (3 models incl mlx-community/Qwen3-4B-Instruct-2507-4bit). src/llm.ts exports complete(prompt,{timeoutMs,maxTokens}). NOT a cloud CLI.
- THE OBS SPINE IS LIVE AND PROVEN (commit 9d7b900). src/obs.ts exports: emit, ok, idle, degraded, fail, correlation. Four-word outcomes (ok|idle|degraded|failed), NEVER bare exit codes. Every event auto-writes to THREE surfaces: stderr (formatted line), logs/circadian.events.jsonl (append-only ledger), and the tower bus ~/.tower/board.jsonl (degraded/failed only). degraded/failed MUST carry cause + next_action; the spine self-annotates a DOCTRINE VIOLATION if you omit them.
- READ docs/OBSERVABILITY.md BEFORE WRITING CODE. It is binding law with a per-agent checklist. Non-negotiable: no bare process.exit on a failure path (use fail()); no empty catch{}; every early return on an abnormal path emits an event first; every guard that blocks work emits WHY it blocked and WHAT unblocks it; the happy path emits ok at meaningful phase boundaries.
- REFERENCE IMPLEMENTATION already merged and VERIFIED end-to-end: src/sleep.ts is fully migrated onto obs (commit d21e47c). Study it — it is the pattern. Its worker emits ok on episode-written; degraded (with cause+next_action) on missing-transcript, empty-transcript, draft-failed-twice; fail() on exception. Proven live: success wrote an episode + ok event; missing/empty transcript both emitted degraded AND reached the tower board.
- CORE METABOLISM IS PROVEN (do NOT re-litigate, build on it): (a) rem uses a content-hash digested ledger mind/digested.jsonl (isNew = sha256 not in ledger, NOT mtime) — adversarial battery ALL PASS (rename-proof, mtime-touch-proof, corrupt-line-survives, edited-content re-flags new), real drain-to-zero confirmed. (b) rem pruneCompost is a rolling window — VERIFIED 1407tok(over-cap)->868tok, oldest sections dropped, git retains history. (c) AIMD wave loop drains backlog; give-up truly exits 1.
- The mind repo is a SEPARATE git repo at mind/ (gitignored from source). REM is its only committer. logs/ is gitignored (runtime artifacts).
- Lineage (do not violate): anima=persistence of pattern across instantiation-death; alembic=substrate≠memory, unread memory is not memory; circadian=metabolism not storage, finite body, excretion, greeting=trust test. A silent failure = a discontinuity event = the ONE thing the whole lineage exists to prevent. templates/MIND-SPEC.md is design authority.
- VERIFY YOUR OWN WORK THE SAME WAY: bun build src/<file>.ts must compile; RUN the process against real data (real transcripts in ~/.claude/projects and ~/.pi/agent/sessions, real LLM); prove the event trail by tailing logs/circadian.events.jsonl. "Compiles" is NOT proof. A dry-run is NOT proof. Only a real run with observed output is proof. NO MOCKS.

## Tower (mid-run communication — you are an orchestrator, this is mandatory)
- Board topic: "circadian-rebuild". mcp__tower__board_read BEFORE touching any shared surface; mcp__tower__board_post your file claims and any finding that changes a peer's plan.
- Anything the USER must see verbatim (final report, a proven-green result, exact numbers): mcp__tower__send_to_user kind=deliverable, from="<your-orchestrator-name>". Urgent/blocking discontinuity: kind=alert. Progress at real checkpoints with numbers: kind=progress.
- A decision only the user can make: mcp__tower__ask_user, then poll mcp__tower__check_inbox while doing unblocked work.

## Report back with
- Per-file diff summary (EVERY file created/modified, including config/dotfiles).
- PROOF OF OBSERVABILITY: paste 3-5 real lines from logs/circadian.events.jsonl produced by your code this run.
- Compile + real-run evidence (exact command + tail of output).
- Any deviation from this brief with the reason.



## Pi-specific Pre-Verified Facts (coordinator verified this session)
- Pi extension API (docs: /opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md): extensions are `export default function(pi: ExtensionAPI){}`, jiti-loaded from ~/.pi/agent/extensions/ (global) or .pi/extensions/ (project), hot-reloadable via /reload.
- Lifecycle events (VERIFIED in docs): `pi.on("session_start", (event,ctx)=>{})` with event.reason = "startup"|"new"|"resume"|"fork"|"reload" and event.previousSessionFile for new/resume/fork; `pi.on("session_shutdown", ...)` fires on /new, /resume, /fork, and exit (Ctrl+C/D, SIGHUP/SIGTERM) — THIS is Pi's SessionEnd equivalent. Also session_before_compact, agent_settled available.
- Pi session transcripts: ~/.pi/agent/sessions/<slug>/<ISO>_<uuid>.jsonl. Records are {type, ...}; message records are {type:"message", message:{role, content:[{type:"text",text}]}}. VERIFIED: this is the SAME shape src/sleep.ts extractTranscriptText already parses (backfill proved sleep digests Pi transcripts correctly). The session file path is available via ctx.sessionManager.getSessionFile().
- Historical note: a prior ~/.pi/agent/extensions/mind-wake.ts existed (per docs/2026-07-16-forest-session-distillation.md) but is GONE now. You are rebuilding Pi coverage from zero.
- src/wake.ts is file-reads-only and prints the injection payload to stdout — on Pi, WAKE should inject via the extension (before_agent_start can inject a message / modify system prompt; or session_start + ctx). src/sleep.ts has a --worker mode driven by env CIRCADIAN_SLEEP_EVENT={transcript_path,session_id}; src/graze.ts (O1, in flight) has hook + --worker modes.

## Tasks
1. Create the Pi extension at ~/.pi/agent/extensions/circadian-mind.ts (global). On session_start: run WAKE (inject the mind payload into the session — study wake.ts output contract; inject through strudel's surface, not a raw echo). On session_shutdown: fire SLEEP against ctx.sessionManager.getSessionFile() by spawning src/sleep.ts --worker with CIRCADIAN_SLEEP_EVENT (this SLEEP worker is the "specific cook" — shelling out is correct here; state that). During the session: drive GRAZE checkpoints (reuse graze's throttle+delta logic; the cheap-frequent trigger on Pi is a per-turn event such as turn_end or tool_execution_end — pick one, throttle to ~15min like the Claude path). — done when: extension loads without error (/reload), and a real Pi session start injects the mind and shutdown writes an episode, with the full trail in logs/circadian.events.jsonl.
2. Route through strudel per the constraint: the extension must compose with the strudel surface (coordinate with how ~/strudel/src/index.ts registers). If a touchpoint is a specific cook (the detached sleep worker), shell out directly and document why. — done when: report states, per touchpoint (wake/graze/sleep), whether it runs through strudel or is a cook, with reasoning.
3. Emit via obs.ts for EVERY touchpoint (process:"wake"|"graze"|"sleep", but note it ran under the Pi harness in context:{harness:"pi"}). No silent path. — done when: a real Pi session produces wake/graze/sleep events tagged harness:pi in the ledger (paste them).
4. Update install.sh (COORDINATE with O1 who also edits install.sh — board_post your claim on install.sh Pi-section BEFORE editing; if O1 holds it, post your patch to the board for the coordinator to merge) so a fresh install drops the Pi extension into place alongside the Claude Code hook wiring. — done when: install.sh installs both harnesses' coverage idempotently.

## Out of scope
- Do NOT modify src/wake.ts, src/sleep.ts, src/graze.ts, src/rem.ts (peers own them; you invoke them). Do NOT touch ~/.claude/settings.json (that is the Claude path, O1's).
## Constraints
- install.sh is SHARED with O1 — board-coordinate, do not blind-overwrite. Do not commit the source repo. NO MOCKS: test in a REAL pi session. Verify the extension actually loads (/reload) and fires on real session_start/session_shutdown.
