# O2 — Metabolism Core (rem: kill the cap defect, finalize wave digestion, drain backlog)

Repo /Users/jrg/circadian (TypeScript, bun). Do NOT use emojis anywhere. You own ONLY: src/rem.ts, src/digest-batches.ts (DELETE it), src/backfill.ts (decide its fate, see below). Ignore uncommitted changes to any other file; peers own sleep.ts, graze.ts, wake.ts, status.ts, doctor.ts.

MISSION: REM is the excretory + consolidation organ and it currently jams. Two structural defects: (a) compost.md is append-only under a hard 1000-token cap — an excretory organ that cannot excrete; after a few composts it throws OVER-CAP and the whole metabolism stalls. (b) it shoved the entire episode corpus into ONE all-or-nothing LLM prompt. Partial fixes already exist in rem.ts (selectMeal, pruneCompost, an AIMD wave loop, deferred-mtime bump) — AUDIT them, finish them, prove them.

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
1. Audit the in-progress edits in src/rem.ts (functions selectMeal, pruneCompost, runOnePass, the AIMD while-loop in main). Confirm the design: digest at most N new episodes/pass (default 4), oldest first; on validation failure halve N and retry (back-pressure); drain backlog wave-by-wave; deferred episodes get mtime-bumped so they stay "new". — done when: bun build src/rem.ts compiles and a dry-run prints a bounded meal (not the whole corpus).
2. compost.md rolling window: pruneCompost must drop OLDEST dated sections until under 90% cap, preserving the header. git history is the permanent archive (MIND-SPEC Compost Rules) so dropped lines are never lost. — done when: a compost.md seeded over-cap is pruned under cap and the drop is emitted as an obs event with context {dropped_sections,before_tokens,after_tokens}.
3. Migrate rem.ts fully onto obs.ts: LLM failure = fail() with cause+next_action (service unreachable is NOT back-pressure); validation failure = degraded event then AIMD retry; each committed wave = ok with context {absorbed,shed,worldview_tokens,backlog_remaining}; nothing-to-digest = idle. Remove any bare process.exit and console.error-then-exit. — done when: the event ledger shows a full wave trail.
4. Drain the current backlog: 7 episodes are waiting in mind/episodes/. Run rem once and let the AIMD loop drain them to zero, committing the mind repo per wave. — done when: mind/episodes/ has only .gitkeep, git -C mind log shows absorbed>0, and the ledger shows the waves.
5. Delete src/digest-batches.ts (a bolted-on driver the rhythm now obsoletes). For src/backfill.ts: it is a legitimate one-shot historical importer — KEEP it but migrate it onto obs.ts (it currently prints plain text). — done when: digest-batches.ts is gone and backfill emits events.

## Constraints
- Touch ONLY your owned files. The mind/ repo IS committed by rem (that is its job) — that is expected and correct. Do NOT commit the source repo.
- NO MOCKS: real LLM at :10240, real episodes.
- Respect MIND-SPEC laws: shrink-unless-justified on SELF.md, digestion-completeness on compost (what-it-taught + where-it-lives).
