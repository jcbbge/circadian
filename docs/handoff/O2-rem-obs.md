# O2 — REM onto the obs spine + backfill onto obs (core already proven; make it auditable)

Repo /Users/jrg/circadian (TypeScript, bun). Do NOT use emojis anywhere. You OWN ONLY: src/rem.ts, src/backfill.ts. Peers own sleep/graze (O1) and wake/status/doctor/MIND-SPEC (O3). Ignore uncommitted changes to files you don't own.

MISSION: rem's LOGIC is verified and must NOT be redesigned (digested ledger, AIMD waves, pruneCompost all proven). Your job is to make rem AUDITABLE by migrating it onto obs.ts so nothing it does is silent, and to do the same for the one-shot importer backfill.ts. Study src/sleep.ts (commit d21e47c) as the reference migration.

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
1. Migrate src/rem.ts onto obs, using a single correlation() id per invocation so all waves of one run tie together. Map outcomes precisely: LLM call failure = fail() (service down is NOT back-pressure; cause + next_action: check :10240); validation failure at batch>1 = degraded (cause=the validation error, next_action=AIMD halving) then retry; give-up at batch=1 = fail(); each committed wave = ok context {absorbed,shed,worldview_tokens,backlog_remaining,pass,batch}; pruneCompost dropping sections = a degraded-or-ok event context {dropped_sections,before_tokens,after_tokens}; nothing-to-digest = idle. Remove every bare console.error-then-exit and replace with fail(). — done when: bun build passes AND a real rem run shows a full correlated wave trail in logs/circadian.events.jsonl (paste it).
2. Preserve ALL verified behavior byte-for-byte in logic: do not alter the digested-ledger hashing, selectMeal, the AIMD loop math, or pruneCompost's window rule. This is a telemetry migration, not a redesign. — done when: after your changes, a real drain still reaches episodes-remaining=0 and mind/digested.jsonl grows by the number absorbed.
3. Migrate src/backfill.ts onto obs (it currently prints plain text): each processed transcript = ok/degraded event; final summary = ok context {written,skipped,source_counts}. Keep its resume manifest. — done when: a --limit 3 real run emits 3 per-item events + 1 summary event to the ledger.

## Out of scope
- Do NOT redesign rem's metabolism. Do NOT touch sleep/graze/wake/status/doctor/MIND-SPEC.
## Constraints
- rem committing the mind/ repo is EXPECTED and correct (its job). Do not commit the SOURCE repo. NO MOCKS: real LLM, real episodes. Respect MIND-SPEC laws (shrink-unless-justified, digestion-completeness).
