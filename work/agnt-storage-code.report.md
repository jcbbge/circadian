# agnt-storage-code report

DID: Implemented native Pi session acquisition repair in `src/circadian-mind.ts`. Shutdown now trusts only `SessionManager.getSessionFile()` plus `isPersisted()`: non-persisted sessions are affirmative ephemeral emptiness; persisted sessions with missing/unreadable/non-file/empty/malformed/header-mismatched native history emit degraded evidence and skip sleep. Native JSONL header identity is checked against the active session ID. No latest/unrelated fallback or transcript store was added. Claude/Codex equivalents were inspected: no Claude/Codex production paths exist in this repo; `src/circadian-opencode.ts` exports API messages to an explicitly session-ID-named file and does not perform native Pi acquisition.

UNMET: None.

Changed files: `src/circadian-mind.ts`; this report.

Native source evidence: `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/sessions.md` documents `~/.pi/agent/sessions/` and explicit `--session <path|id>`; `docs/session-format.md` documents JSONL session headers and `SessionManager.getSessionFile()` (undefined for in-memory) plus `isPersisted()`; installed `dist/core/session-manager.d.ts` confirms signatures. Existing implementation falsely treated absent path and missing file as successful empty session.

Commands/results: `bun test` — 543 pass, 1 skip, 0 fail. `git status --short` baseline showed only pre-existing untracked `slate.json` and `work/`; no unrelated files touched.

UNPROVEN: Whether Pi can emit a persisted session path before its first native entry is written remains [UNKNOWN]; runtime lifecycle evidence that would prove it is a real Pi session exercising shutdown before/after first entry with observed `getSessionFile()`/`isPersisted()` values. Claude Code/Codex native storage behavior is [UNKNOWN] because no corresponding implementation or native payload documentation is present in this repository; proving it requires their installed hook/runtime source and lifecycle payloads.

RULINGS: Missing persisted native history is degradation, never empty success. Empty success is legal only when Pi explicitly reports an in-memory/ephemeral session. Header identity is required before sleep may consume the file.

Remaining resources: none provisioned.
