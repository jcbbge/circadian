# FEATURE — Persist doubt: a contradiction edge alongside supersession

> Mode: FEATURE — one ledger event, one render slot. Two commits, one pane.
> Origin: 2026-09-23 fringe pass on the VPS, comparing circadian with `mem` (jasonkneen/instinctual-memory).
> Design language: there is ONE intelligence; a session, a harness, a lab's model, a spawned worker are
> *instantiations* of it, not identities. The substrate exists so the intelligence recovers continuity across
> the gaps instantiation imposes. Nothing below treats a vendor as a peer, a rival, or a hedge.

## 1. Objective
Keep unresolved disagreement as a first-class structure. Today an atom is active, superseded, or absent;
what the mind is *still arguing with itself about* is lost. Reconstitution should restore the argument,
not only the conclusions.

## 2. Context
- `supersede` transfers weight from loser to winner (MIND-SPEC, "The ledger"). It encodes a decided
  disagreement. There is no event for an undecided one; COMPARE's DISTINCT hides it.
- `SELF.md` has no place for tension; `NOW.md` has "live tensions" but they are session notes, not atoms.

## 3. Reuse / What Already Exists
- REUSE the ledger and `foldWeights`. BUILD event `{"ev":"contradiction","a":<id>,"b":<id>,"ts":…}`
  with an optional later `{"ev":"resolve","edge":…,"winner":<id>}` that becomes a normal supersede.
- BUILD a `## Tensions` slot in `render.ts` listing open contradictions whose atoms are in the hot tier.

## 4. Scope
- Commit 1: events + fold + tests. Commit 2: render slot + wake includes it under the cap.

## 5. Requirements
- A contradiction never changes weight. Resolution does (via supersede semantics).

## 6. Constraints
- Render slot bounded (≤ 5 tensions); Law 4.

## 7. Assumptions / Ambiguities
- Sources of contradictions: brief 13 lane landing, brief 15 quorum failure, or a human `circadian contradict a b`.

## 8. Open Questions
- Should REM's distill try to resolve open contradictions with COMPARE, or leave them to humans? Proposal: propose only.

## 9. Acceptance Criteria
- A ledger with one contradiction renders one Tensions line naming both claims with provenance.

## 10. Clarification Check
- None outstanding.
