# FEATURE — On-demand read surface: search, read, history, status, request-change over MCP (graft from `mem`)

> Mode: FEATURE — one server module. Two commits, one pane.
> Origin: 2026-09-23 fringe pass on the VPS, comparing circadian with `mem` (jasonkneen/instinctual-memory).
> Design language: there is ONE intelligence; a session, a harness, a lab's model, a spawned worker are
> *instantiations* of it, not identities. The substrate exists so the intelligence recovers continuity across
> the gaps instantiation imposes. Nothing below treats a vendor as a peer, a rival, or a hedge.

## 1. Objective
Let an instantiation *ask* the mind mid-session, not only receive what wake pushed. Push stays primary
(Law 2); this adds a pull door for the moment the work needs more than the greeting carried.

## 2. Context
- circadian has hooks and no query surface. `mem` ships an MCP server (`mcp.rs`) with `memory_search`,
  `memory_read`, `memory_history`, `memory_status`, `memory_request_change`, plus a loopback HTTP form.
- `relindex.ts` already answers relevance queries deterministically; it only lacks a caller.

## 3. Reuse / What Already Exists
- REUSE `relindex.ts` (search), `zoom.ts` (read/history), `status.ts`, and `publish` (brief 18) for
  request-change. BUILD `src/serve.ts`: MCP over stdio with those five tools; `request_change` writes an
  intent only — the stacker decides, the model never writes an atom directly (mem's trust model, and MIND-SPEC
  sentence 5).

## 4. Scope
- Commit 1: server + tools + tests via a scripted stdio client. Commit 2: install.sh registers it for the
  harnesses it already wires (Claude Code hooks; the Pi extension).

## 5. Requirements
- Every tool is read-only except `request_change`, which is an intent, not a write.

## 6. Constraints
- Loopback only if an HTTP form is added; stdio first. No new runtime dependency.

## 7. Assumptions / Ambiguities
- Tool names may mirror mem's for interchange (brief 12).

## 8. Open Questions
- Should `search` fall back to `dig` (brief 11) below the hot tier? Proposal: a `depth` argument.

## 9. Acceptance Criteria
- A scripted client lists five tools; `search` returns provenance-pinned hits in < 100 ms on the current mind.

## 10. Clarification Check
- None outstanding.
