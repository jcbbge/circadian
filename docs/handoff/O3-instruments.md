# O3 — Instruments & Spec (wake/status/doctor onto the spine; doctor as the one true health surface; spec update)

Repo /Users/jrg/circadian (TypeScript, bun). Do NOT use emojis anywhere. You own ONLY: src/wake.ts, src/status.ts, src/doctor.ts, templates/MIND-SPEC.md. Ignore uncommitted changes to any other file; peers own sleep.ts, graze.ts, rem.ts.

MISSION: Make the instruments honest and agent-forward, and update the design authority to match the new physiology (meal tempo, rolling compost, observability law).

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
1. Migrate src/wake.ts and src/status.ts onto obs.ts. wake is file-reads-only and must stay non-blocking, but every read failure / staleness / OVER-CAP must be a context-bound event (degraded/failed with cause+next_action), never a silent skip. status emits ok with the vitals as context. — done when: running each appends events to the ledger.
2. Rebuild src/doctor.ts as the single honest health surface. It must READ logs/circadian.events.jsonl (the obs ledger) and report per-process liveness: when did wake/graze/sleep/rem last emit, what was the last outcome, is anything failed/degraded and unacknowledged. Keep OK/IDLE/WARN/FAIL verdicts and --json (exit 1 on any FAIL) and --alert (post to tower). Add a check: "a process that should have run but produced NO event" = FAIL (silent operation is the cardinal sin). — done when: bun run src/doctor.ts renders a verdict sourced from the ledger; --json exits nonzero when a failed event is unacked.
3. Update templates/MIND-SPEC.md to encode the corrected physiology WITHOUT breaking its existing law structure: (a) add the in-session GRAZE phase to The Cycle (WAKE, LIVE+GRAZE, SLEEP, REM) — LIVE is no longer "nothing"; describe graze checkpoints and mind/meals/ working memory. (b) Fix the compost.md contract: it is a ROLLING WINDOW under its cap, not append-only; git history is the archive; REM prunes oldest. (c) Add an Observability Law: nothing silent, every signal context-bound (cite docs/OBSERVABILITY.md). — done when: MIND-SPEC.md reflects all three and remains internally consistent (no contradicting the append-only removal elsewhere).
4. Confirm the twice-daily REM launchd job (com.circadian.rem) still makes sense as the SLOW consolidation pass now that per-meal digestion is primary; document in MIND-SPEC.md the two tempos (per-meal fast path vs twice-daily worldview consolidation). — done when: the spec states both tempos and their division of labor.

## Constraints
- Touch ONLY your owned files. Do not commit the source repo.
- doctor must not DUPLICATE logic from the processes — it reads their emitted events, it does not re-derive health by re-running them (except cheap liveness probes like the LLM curl).
- Keep status.ts --greet-ok/--greet-bad verdict flags working (the kill-switch trust mechanism).
