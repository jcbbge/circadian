# O1 — GRAZE: the missing in-session organ (highest-risk, net-new)

Repo /Users/jrg/circadian (TypeScript, bun). Do NOT use emojis anywhere. You OWN ONLY: src/graze.ts, and the graze-specific additions to src/sleep.ts's SessionEnd path (folding meal notes), install.sh hook-wiring for graze, ~/.claude/settings.json (graze hooks only), mind/meals/, mind/.gitignore. Peers own rem.ts (O2) and wake/status/doctor/MIND-SPEC (O3). Ignore uncommitted changes to files you don't own.

MISSION: A session is a meal. Build the middle layer the forest session foresaw but never grew: metabolize the transcript WHILE the session happens. A draft src/graze.ts EXISTS (audit it hard — it has NEVER been run, 0 events, not wired). graze fires from cheap frequent Claude Code hooks (PostToolUse + UserPromptSubmit), self-throttles to one real checkpoint per ~15min, reads only the transcript DELTA since last checkpoint (byte offset in a per-session state file), digests it via the local LLM into 2-4 bullet notes, appends to mind/meals/<session_id>.md. At SessionEnd, sleep folds those meal notes into its whole-meal digest, then deletes the meal file (episode supersedes it; meals/ is working memory, never committed).

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

## Tasks
1. Migrate src/graze.ts fully onto obs.ts (mirror sleep.ts exactly). Hook mode MUST be fast: emit idle when not-yet-time (throttled), spawn detached worker, exit. Worker emits ok on checkpoint-digested, degraded (cause+next_action) on LLM failure or empty delta — NEVER a silent return. — done when: bun build passes AND a simulated multi-checkpoint run appends notes to a meal file AND every checkpoint emits an event visible in logs/circadian.events.jsonl (paste them).
2. In src/sleep.ts SessionEnd worker: if mind/meals/<session_id>.md exists, fold its notes into the digest prompt (as pre-chewed context) and delete it after the episode is written; emit ok context {meal_notes_used:true, checkpoints:N}. Add mind/meals/ to mind/.gitignore. — done when: a run with a pre-seeded meal file folds it in, removes it, and the ok event shows meal_notes_used:true.
3. Wire graze into ~/.claude/settings.json as PostToolUse + UserPromptSubmit hooks. IDEMPOTENT merge; back up first; there are 20+ existing hooks — verify count before/after, remove none. — done when: python3 json-load shows graze on both events exactly once and every pre-existing hook intact.
4. Update install.sh so a fresh install wires wake(SessionStart)+sleep(SessionEnd)+graze(PostToolUse,UserPromptSubmit) idempotently. — done when: running the hook-merge block twice is a no-op and prints the wiring.

## Out of scope
- Do NOT touch rem.ts, wake.ts, status.ts, doctor.ts, MIND-SPEC.md (peers own them).
## Constraints
- Do not commit the source repo (coordinator commits after verifying). meals/ never committed. NO MOCKS: real transcripts + real LLM at :10240.
