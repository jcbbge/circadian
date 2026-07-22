# O1 — Ingestion & the Missing Organ (in-session metabolism + whole-meal digest)

Repo /Users/jrg/circadian (TypeScript, bun). Do NOT use emojis anywhere. You own ONLY: src/graze.ts, src/sleep.ts, install.sh, ~/.claude/settings.json, mind/meals/. Ignore uncommitted changes to any other file — do not investigate/revert/fix them; peers own rem.ts, wake.ts, status.ts, doctor.ts, MIND-SPEC.md.

MISSION: A session is a meal. Build the middle layer the forest session foresaw but never grew: metabolize the transcript WHILE the session happens (graze checkpoints every ~15 min), then at SessionEnd digest the WHOLE meal — full transcript PLUS the accumulated graze notes — into one episode + NOW.md rewrite. Excretion stays REM's job.

## Pre-Verified Facts (coordinator verified all of these personally this session)
- Repo: /Users/jrg/circadian — bun 1.3.14 at /Users/jrg/.bun/bin/bun. Four processes in src/: wake, sleep, rem, status (+ new: obs, doctor, graze, backfill).
- FOUNDATION IS LIVE (commit 9d7b900): src/obs.ts exports emit/ok/idle/degraded/fail/correlation. docs/OBSERVABILITY.md is the binding doctrine. Smoke-tested: all three surfaces fire (stderr + logs/circadian.events.jsonl + ~/.tower/board.jsonl for degraded/failed); degraded/failed without cause+next_action self-annotate a DOCTRINE VIOLATION.
- YOU MUST READ docs/OBSERVABILITY.md BEFORE WRITING CODE. Every failure path uses fail(); no bare process.exit(1); no empty catch{}; every guard/early-return emits an event; happy path emits ok at phase boundaries.
- LLM backend: local, OpenAI-compatible, http://127.0.0.1:10240/v1 (verified reachable: 3 models incl mlx-community/Qwen3-4B-Instruct-2507-4bit). src/llm.ts exports complete(prompt,{timeoutMs,maxTokens}). NOT a cloud CLI.
- The mind repo is a SEPARATE git repo at mind/ (gitignored from the source repo). REM is its only committer.
- Lineage context (do not violate): anima=persistence of pattern across instantiation-death; alembic=substrate≠memory, the corpse-lesson (491/521 shards never read); circadian=metabolism not storage, finite body, excretion, greeting as trust test. A silent failure = a discontinuity event = the one thing the lineage exists to prevent. MIND-SPEC.md (templates/) is the design authority.
- Verify with: bun build src/<file>.ts (must compile); run the process and confirm an event lands in logs/circadian.events.jsonl.

## Tower (mid-run communication)
- Board topic: "circadian-rebuild". board_read before touching a shared surface; board_post your file claims + any finding that changes a peer's plan.
- Deliverables the user must see verbatim (final report, a drained-count, a green doctor): mcp__tower__send_to_user kind=deliverable, from="<your-orchestrator-name>". Urgent/blocking: kind=alert.
- Progress at real checkpoints with numbers: kind=progress.
- A decision only the user can make: mcp__tower__ask_user, then poll mcp__tower__check_inbox while doing unblocked work.

## Report back with
- Per-file diff summary (every file created/modified, including config/dotfiles).
- Proof of observability: paste 3-5 lines from logs/circadian.events.jsonl produced by your code.
- Compile + run evidence (command + tail of output).
- Any deviation from this brief with the reason.

## Tasks
1. Finish src/graze.ts (a draft exists — audit it against docs/OBSERVABILITY.md and the meal model). Hook mode must be FAST (throttle via per-session state, spawn detached worker, exit) and MUST emit obs events (idle when not-yet-time, ok when checkpoint digested, degraded/failed with cause+next_action on LLM failure — never a silent return). Worker reads only the transcript DELTA since last checkpoint (byte offset) and appends 2-4 bullet notes to mind/meals/<session_id>.md. — done when: a simulated 3-checkpoint run appends notes and every checkpoint emits an event visible in logs/circadian.events.jsonl.
2. Wire graze into Claude Code as PostToolUse + UserPromptSubmit hooks in ~/.claude/settings.json (idempotent merge; back up first; DO NOT remove the 20+ existing hooks — verify count before/after). — done when: python3 -c json load shows graze on both events exactly once and all pre-existing hooks intact.
3. Migrate src/sleep.ts fully onto obs.ts (replace the ad-hoc logs/sleep.log slog with emit(); every one of its 5 silent-return/catch points becomes a context-bound event). Preserve the env-var event handoff (CIRCADIAN_SLEEP_EVENT) — it is a real fix (stdin race). — done when: a real transcript run produces an episode AND a full event trail in the ledger.
4. At SessionEnd, sleep MUST consume mind/meals/<session_id>.md if present (fold the graze notes into the digest prompt) and then delete that meal file (the episode supersedes it; meals/ is working memory, never committed — add to mind/.gitignore). — done when: a run with a pre-seeded meal file folds it in and removes it, emitting ok with context {meal_notes_used:true}.
5. Update install.sh so a fresh install wires wake(SessionStart)+sleep(SessionEnd)+graze(PostToolUse,UserPromptSubmit) automatically and idempotently. — done when: running the hook-merge block twice is a no-op and prints the resulting wiring.

## Constraints
- Touch ONLY your owned files. Do not commit the source repo (coordinator commits after review) UNLESS you complete and want it checkpointed — if so, use the AGENTS.md commit convention and stage explicitly, never git add -A.
- NO MOCKS: test against real transcripts under ~/.claude/projects and ~/.pi/agent/sessions and the real LLM at :10240.
- meals/ is per-session working memory: never committed, cleaned by sleep.
