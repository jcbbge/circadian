# QUICK — Janitor for meals/ and .state.json working-memory leak

> Mode: QUICK — one focused new module; no conversation nuance.

## 1. Objective
Stop `mind/meals/` from accumulating orphaned meal notes and throttle-state files. Add a cleanup pass that removes files for sessions that have **ended**, so working memory doesn't accrete.

## 2. Context
- GRAZE writes `mind/meals/<sessionId>.md` (notes) and `.<sessionId>.state.json` (throttle state — `src/graze.ts` `statePath:92-94`). The **pi extension also writes its own state** at the same naming (`~/.pi/agent/extensions/circadian-mind.ts:166`).
- SLEEP deletes the meal `.md` **best-effort** (`src/sleep.ts:925-932`, in a try/catch that swallows errors — "not fatal — the episode is already written") and **never** deletes the `.state.json`.
- Sessions that end **without** SLEEP running (crash, `quit`, lid-close — the obs ledger shows `shutdown_reason:"quit"`) orphan the meal too.
- Result (measured this session): **25 `.md` meals + ~150 `.state.json`** files accumulated, oldest 2026-07-22.
- Nothing in `src/` cleans `.state.json` at all (confirmed by grep: no `janitor|sweep|cleanup` over MEALS_DIR exists).

## 3. Reuse / What Already Exists
- **REUSE / EXTEND** — `src/graze.ts` `statePath` (the `.{sessionId}.state.json` naming) and `MEALS_DIR`; `src/sleep.ts`'s meal-delete pattern (`unlinkSync` in try/catch); `src/obs.ts` (emit a janitor event — Law 9); `src/doctor.ts` `findRecentTranscripts` (already probes `~/.claude/projects` + `~/.pi/agent/sessions` — reuse its dirs as the "is this session live?" probe); REM's twice-daily schedule (`src/rem-popmem.ts` `REM_SLOT_HOURS = [9, 21]`) as the natural janitor slot.
- **BUILD NEW** — a janitor function (new file `src/janitor.ts`, or a phase added to `rem-popmem.ts` / `doctor.ts`) that sweeps `meals/*.md` and `.*.state.json` for ended sessions.
- **DO NOT REBUILD** — the meal/state creation logic, the throttle logic, the SLEEP delete. Only **add** cleanup.

## 4. Scope
- Sweep `mind/meals/*.md` and `mind/meals/.*.state.json`.
- Delete a file only when its producing session has **ended** (no live transcript for that `session_id`) AND the file is older than a safety window.
- Cover **both** harnesses' state files (graze.ts and circadian-mind.ts use the same `.{sessionId}.state.json` naming).
- Emit one obs event (`process: "janitor"`, `phase: "sweep"`) with counts — Law 9 ("nothing silent").

## 5. Requirements
- "Session ended" heuristic: the session's transcript is not live. **[UNKNOWN — needs input: define "ended" — transcript file mtime older than N hours? Session id absent from any active herdr pane? A session in `logs/pending-sleep.jsonl` is NOT ended (SLEEP still owed).]**
- Safety window: never delete a file newer than N hours even if the session looks ended, to avoid racing a slow SLEEP. **[UNKNOWN — needs input: N — suggest 6h default.]**
- Never delete a meal `.md` whose session has a `logs/pending-sleep.jsonl` entry (SLEEP hasn't run — the meal is still owed).
- Idempotent; transcript-mtime probe only (cheap, like `findRecentTranscripts`).

## 6. Constraints
- Must not race SLEEP: if a session is mid-SLEEP (`logs/pending-sleep.lock` exists), skip its files.
- Must not delete files for the currently-running session.
- On unreadable transcript dir → emit `degraded` (not `failed`); never crash the host (REM/doctor) if the janitor throws.
- **[UNKNOWN — needs input: run site — inside REM (`rem-popmem.ts`, twice daily, natural since REM already commits) or as a `doctor.ts` phase?]**

## 7. Assumptions / Ambiguities
- Assumes the `session_id` in the filename maps to a transcript under `~/.pi/agent/sessions/` or `~/.claude/projects/` (doctor.ts already probes both — reuse).
- Ambiguity: should the janitor also reap `logs/*.state.json` if any appear there, or only `mind/meals/`?

## 8. Open Questions
- "Session ended" definition and safety window N?
- Run site: REM phase or doctor phase?
- Sweep scope: `mind/meals/` only, or also `logs/`?

## 9. Acceptance Criteria
- [ ] After one run on the current repo, `meals/*.md` count drops to ≤ sessions still owed a SLEEP; `.*.state.json` count drops to ≤ live sessions.
- [ ] No file newer than N hours is deleted.
- [ ] No file for a session in `logs/pending-sleep.jsonl` is deleted.
- [ ] One obs event emitted: `{deleted_meals, deleted_states, skipped_live, skipped_pending}`.
- [ ] `bun src/doctor.ts` exits 0; `bun test` passes.

## 10. Clarification Check
Do you understand the intent and purpose? What ambiguous details remain? — Unresolved: "ended" heuristic, safety window N, run site, sweep scope.
