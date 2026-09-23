# FEATURE — Stigmergy: memory writes scoped to a worker's branch; landing is consolidation; a conflict is the escalation

> Mode: FEATURE — a write-path change and a merge rule. Two commits, one pane.
> Origin: 2026-09-23 fringe pass on the VPS, comparing circadian with `mem` (jasonkneen/instinctual-memory).
> Design language: there is ONE intelligence; a session, a harness, a lab's model, a spawned worker are
> *instantiations* of it, not identities. The substrate exists so the intelligence recovers continuity across
> the gaps instantiation imposes. Nothing below treats a vendor as a peer, a rival, or a hedge.

## 1. Objective
When several instantiations work concurrently (the concierge/worker model on the VPS spawns one per task),
stop pushing memory *into* each one. Let each write beliefs onto its own branch of the mind, let landing
the work land the beliefs, and let a git conflict between two instantiations' beliefs about the same claim
be the escalation — visible, not hidden.

## 2. Context
- The environment carries the memory (stigmergy): an instantiation that clones the branch is already
  reconstituted (brief 10). This brief is the write side of that idea.
- `stack.ts` is the only writer of atoms and appends to one `beliefs.jsonl`. Two concurrent stackers on
  one file is exactly the race `mem` designed its compare-and-swap against (brief 18).
- Atom files are immutable and content-addressed, so two branches creating the same claim produce the
  same file: git merges it clean. Only the ledger line order and a *conflicting* claim differ.

## 3. Reuse / What Already Exists
- REUSE atom immutability + content ids (merge-friendly by construction).
- REUSE the VPS worker lane convention (`fm/<id>`) as the branch name of the mind branch too.
- BUILD `src/lane.ts`: `circadian lane open <id>` (branch the mind), `lane land <id>` (merge to main with
  ledger-append merge strategy: union of `beliefs.jsonl` lines, deterministic sort by ts, dedupe by hash),
  `lane conflicts` (lists claims that both sides superseded differently).

## 4. Scope
- Commit 1: `lane.ts` + union merge driver for `beliefs.jsonl` (`.gitattributes` merge=union is not
  enough: order must be by `ts` and duplicates by hash removed).
- Commit 2: conflict surfacing — a `supersede` on both sides with different winners is written as a
  `contradiction` event (see brief 16) instead of picking one.

## 5. Requirements
- Landing never loses a `stack` event. Landing never silently resolves a disagreement.

## 6. Constraints
- Law 9: every lane operation emits an obs event. No daemon.

## 7. Assumptions / Ambiguities
- The mind repo stays local; lanes are local branches.

## 8. Open Questions
- Should a lane that is torn down without landing be composted (a `compost.md` entry) or dropped?

## 9. Acceptance Criteria
- Two lanes stacking the same claim land to one atom with weight 2. Two lanes superseding a claim with
  different winners land to a `contradiction` event and both winners visible.

## 10. Clarification Check
- None outstanding.
