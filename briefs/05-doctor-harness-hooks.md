# QUICK — Make doctor's session-hook check harness-aware (pi + Claude Code)

> Mode: QUICK — small focused `doctor.ts` edit. No conversation nuance.

## 1. Objective
`doctor.ts`'s `checkHooks` should verify the hook registration for the harness(s) actually in use (Claude Code **and** pi), not just Claude Code. Today it passes by luck when run from a pi session.

## 2. Context
- `src/doctor.ts` `checkHooks` reads **only** `~/.claude/settings.json` and checks for `"wake.ts"` / `"sleep.ts"` / `"graze.ts"` substrings.
- pi registers Circadian via an extension at `~/.pi/agent/extensions/circadian-mind.ts` (confirmed to exist; it writes meal/state at line 166 and is the pi hook surface).
- The obs ledger shows `harness:"pi"` wake/sleep/graze events firing correctly this session, so pi **is** wired — but `checkHooks` doesn't look, so it cannot tell if the pi extension goes missing.

## 3. Reuse / What Already Exists
- **REUSE / EXTEND** — `src/doctor.ts` `checkHooks` (extend the existing function); `src/doctor.ts` `findRecentTranscripts` (already probes `~/.claude/projects` AND `~/.pi/agent/sessions` — reuse to know which harness(s) have recent session evidence); the pi extension path `~/.pi/agent/extensions/circadian-mind.ts` (read it first to find the actual marker/symbol that proves it registers wake/sleep/graze).
- **BUILD NEW** — a harness-detection branch in `checkHooks`: verify CC (settings.json) and/or pi (extension file exists + references the three processes) depending on which harness(s) have session evidence.
- **DO NOT REBUILD** — the hook registration itself (CC `settings.json` or the pi extension). Only the **check**.

## 4. Scope
- Detect active harness(s) from session evidence (reuse `findRecentTranscripts`'s dirs).
- Verify the relevant registration per harness:
  - CC → `~/.claude/settings.json` contains `wake.ts` / `sleep.ts` / `graze.ts`.
  - pi → `~/.pi/agent/extensions/circadian-mind.ts` exists and references the three processes (read it; cite the real marker).
- Report per-harness (e.g., `session hooks — CC: ok, pi: ok`).

## 5. Requirements
- A harness with recent session evidence but missing/incomplete registration → WARN (match existing `checkHooks` severity; do not escalate to FAIL).
- Neither harness has evidence → current behavior (WARN, "no session evidence").
- Do not hard-code a single harness; both can be live simultaneously.

## 6. Constraints
- **DEPENDENCY: this brief edits `src/doctor.ts` `checkHooks`. Brief 04 (semantic-stutter check) ALSO edits `src/doctor.ts`. Sequence them or merge the edits — do not run in parallel against the same file.**
- Do not modify `~/.claude/settings.json` or the pi extension.
- Do not assume the pi extension's internal structure beyond "references wake/sleep/graze" — **read it first** and cite the actual marker.

## 7. Assumptions / Ambiguities
- Assumes the pi extension `circadian-mind.ts` IS the hook registration (not a separate pi hooks config). **Verify by reading the extension before implementing.**
- Ambiguity: are there other harnesss to support? (Only CC and pi are in scope per the global AGENTS.md.)

## 8. Open Questions
- Should the check distinguish "extension file present" from "extension actually loaded" (pi `/reload` state)? Probably out of scope — file presence is the cheap probe.

## 9. Acceptance Criteria
- [ ] `bun src/doctor.ts` run from a pi session reports the pi hook registration as OK (and CC if present).
- [ ] Temporarily renaming the pi extension makes the check WARN for pi (manual test, then restore).
- [ ] CC-only environments still pass.
- [ ] `bun src/doctor.ts` exits 0 with both harnesss healthy.

## 10. Clarification Check
Do you understand the intent and purpose? What ambiguous details remain? — Unresolved: whether to probe "loaded" vs "file present" for pi.
