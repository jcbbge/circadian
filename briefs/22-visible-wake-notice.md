# Task

Making: a visible circadian startup notice for the operator in both harnesses, so every session tells the operator in one line that memory loaded (scope, parts delivered) or loudly that it did not; plus two small truth fixes in the strip.

Out of scope: who refreshes a scope's NOW when all work there runs as lanes (arc's NOW has been frozen since 2026-09-25; REM scores propagation against a frozen global NOW, which is where "verdict bad×1" comes from). That is a design decision the operator will make; do not touch NOW writing, REM scoring, verdict code, or mind/ content. Also out: ~/.claude/settings.json, install.sh hook wiring (the existing `status.ts --line` SessionStart hook stays the command; you change what it prints), the statusLine path (bin/circadian-statusline and `--write-cache` must behave exactly as today), the wake payload itself and its part-splitting.

Done when: (1) `status.ts --line` run as a Claude Code SessionStart hook (stdin JSON with hook_event_name "SessionStart") prints one JSON object {"systemMessage": NOTICE, "hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": STRIP}}, where STRIP is today's one-line strip unchanged and NOTICE is `circadian · memory loaded · scope <scope> · <n> of <n> parts · <strip minus its leading "circadian · ">` when this session's spool is found, or `circadian · WAKE NOT DELIVERED this session · see logs/circadian.events.jsonl` when it is not; every other invocation of `--line` (no stdin, statusLine JSON without hook_event_name, `--write-cache`) prints exactly what it prints today. (2) The Pi extension src/circadian-mind.ts calls ctx.ui.notify once per session_start, guarded by ctx.hasUI, with the same NOTICE shape ("info" when delivered, "error" when wake gave no output). (3) `logs/wake-parts/` is in .gitignore. (4) A SessionEnd whose transcript file does not exist and whose session left no graze state (mind/meals/.<session_id>.state.json absent) records an ok event "no transcript: session was never prompted; nothing to sleep on" instead of degraded; with graze state present it stays degraded. (5) New tests in src/status.test.ts, src/circadian-mind.test.ts and src/sleep-hook.test.ts pin each of (1)–(4) against real files and functions, no mocks. (6) A real interactive Claude Code session in a scratch tmux window, launched with a test hook via `claude --settings <file>`, shows NOTICE on screen: the `tmux capture-pane` text is pasted in your report. (7) The full gate is green and the output summary is in your last commit message.

Waits on: nothing.

## Why this exists

The operator asked why they never see circadian at session start. Circadian is wired and delivering: this box session woke in 3 parts (scope global) and the concierge in 6 parts (scope concierge); the spools are in logs/wake-parts/. But Claude Code adds plain SessionStart stdout to the model's context only (docs: https://code.claude.com/docs/en/hooks-guide, "For UserPromptSubmit, ... SessionStart ... hooks, Claude Code adds stdout ... to Claude's context"). The only thing the operator sees is the statusLine strip under the input. The comment at src/status.ts:474-477 says the SessionStart strip is "visible at the top of every session"; that belief is wrong on current Claude Code. Correct the comment.

## Ground first (read these before your first change)

- mind/MIND-SPEC.md: design authority. If your change conflicts with it, the change is wrong. Law 7: wake always delivers; nothing here may delay or withhold the wake.
- src/wake.ts:58-101 (hook event parse, `--part k` slots, PART_WAIT_MS=8000, SPOOL_SKEW_MS=10000), :385-430 (spool publish and part 1 print), :293 (scope).
- src/wake-parts.ts (Spool type, spoolPath, writeSpool, waitForSpool, readFreshSpool).
- src/wake-payload.ts:22-26 (HOOK_OUTPUT_LIMIT=10000, WAKE_PARTS=8).
- src/status.ts:474-500 (sessionIdFromStdin, reads stdin once), :502-528 (degraded count), :700-760 (renderLine, writeStatuslineCache, main `--line`).
- src/circadian-mind.ts:117-215 (Pi session_start spawns wake.ts, before_agent_start injects it with display:true).
- src/sleep.ts:436-452 (the transcript stat that currently emits degraded).
- The existing tests next to each file, for the no-mock pattern.
- Pi's notify API: the pi-coding-agent package's dist/core/extensions/types.d.ts:76 `notify(message: string, type?: "info" | "warning" | "error"): void`; usage in its docs/extensions.md:67.

## How to build it (the settled design; follow it)

1. Spool carries scope. Add an optional `scope?: string` to Spool; writeSpool takes it; wake.ts passes the resolved scope. Readers must accept spools without it (older files): then NOTICE says `scope unknown`.
2. The notice in status.ts. Parse stdin once into the whole event (keep session_id for the existing logic). When hook_event_name is "SessionStart": wait for this session's spool with the existing waitForSpool (notBefore = start - SPOOL_SKEW_MS, bounded to 6000 ms so the hook finishes inside install.sh's 10 s timeout), build NOTICE from spool.scope and spool.outputs.length, print the JSON object on one line, exit 0. SessionStart hooks run in parallel (docs, same page), so waiting on the spool is required; part 1 may not have written it yet.
3. Pi. In session_start, after wake.ts returns, build the same NOTICE from its stdout (scope from the payload's first line `Resolved scope: <scope>`; parts = 1) and call ctx.ui.notify when ctx.hasUI. Keep the existing before_agent_start injection as is.
4. Sleep. In the catch at sleep.ts:442, when the error is ENOENT and mind/meals/.<session_id>.state.json does not exist, emit ok (same process/phase, the summary above) and exit 0; everything else keeps today's degraded.
5. .gitignore: add `logs/wake-parts/` beside the other logs/ patterns. These files hold mind content; never commit one.

## Proving the notice on screen (step 6 of Done when)

The docs list `systemMessage` as a universal output field but do not say how it renders; your screen capture is the proof. Write a settings file outside the worktree (e.g. in the session's scratch directory) whose SessionStart hooks run your worktree's code against the live mind: `CIRCADIAN_HOME=$CIRCADIAN_HOME bun <your worktree>/src/wake.ts` and `CIRCADIAN_HOME=$CIRCADIAN_HOME bun <your worktree>/src/status.ts --line`. The machine's own hooks fire too; that is expected. Launch with `tmux new-window -d -t workers -n circ-notice-proof "cd <your worktree> && CIRCADIAN_LANE=circ-notice-proof CIRCADIAN_ROLE=AGNT claude --settings <file>"` (the worktree is already trusted, and the lane stamp keeps that throwaway session's SessionEnd from rewriting any NOW), wait about 10 s, `tmux capture-pane -p -t workers:circ-notice-proof`, then kill that window. Do not edit ~/.claude/settings.json. If NOTICE does not appear on screen, try `"suppressOutput": false` once; if it still does not appear, report blocked with both captures. Do not invent another display channel.

## Rules specific to this repo

- Never `cd` into the project's main checkout: it has its own TASKS.md that the task hook will pick up. Work only in your worktree.
- No mocks in tests. Never print, log or commit a secret; the endpoint key lives in ~/.config/circadian/env and you do not need it.
- The gate is `bun test`, run through the machine lock as your brief's Setup says. The concierge is running Arc gates on this box; the lock queues you, so wait for it.
- Commit format per the global instructions (ACT/DONE/NEXT). In the report, say plainly what failed or what you did not verify.
- Record: in your first commit, save this Task text verbatim as briefs/22-visible-wake-notice.md, so the work stays documented in the repo after your worktree is gone.
