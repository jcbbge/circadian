# FEATURE — Stratigraphy: depth tiers alongside decay, and a `dig` that reads below the floor

> Mode: FEATURE — one module, a render change, one command. Two commits, one pane.
> Origin: 2026-09-23 fringe pass on the VPS, comparing circadian with `mem` (jasonkneen/instinctual-memory).
> Design language: there is ONE intelligence; a session, a harness, a lab's model, a spawned worker are
> *instantiations* of it, not identities. The substrate exists so the intelligence recovers continuity across
> the gaps instantiation imposes. Nothing below treats a vendor as a peer, a rival, or a hedge.

## 1. Objective
Add a second forgetting model that never mutates weight: atoms fall out of the hot render by *depth*
(how many strata of newer atoms sit above them), like sediment. Forgetting becomes a threshold on a read,
not an event on the record. `dig` reads any depth on demand.

## 2. Context
- Today forgetting is the nightly multiply (`decay.ts`, `{ev:"decay",factor:0.95}` + `renorm`). It is
  correct and stays. But it is a *mutation of the fold*: an atom that mattered a year ago and will matter
  again has to climb back from near zero.
- Git already compresses old, small, immutable files aggressively. Physical shrinking is free; only the
  *read tier* needs a rule.
- Law 4 (finite body) and Law 6 (motion is the metric) both hold: the hot tier is bounded by depth, and
  potentiation still lifts an atom to the surface.

## 3. Reuse / What Already Exists
- REUSE `atoms.ts readLedger/foldWeights`; `render.ts RENDER_FLOOR` + manifest.
- BUILD `src/strata.ts`: assigns each active atom a depth = count of distinct later `stack` episodes; the
  hot tier is depth ≤ `STRATA_HOT` (default 40 episodes). Pure function over the ledger.
- BUILD `circadian dig <query|depth>`: reads atoms below the hot tier, BM25 via `relindex.ts`, prints with
  depth and last-stack date. Never writes.

## 4. Scope
- Commit 1: `strata.ts` + tests; render takes `tier ∈ {hot, deep}`; SELF.md renders hot only.
- Commit 2: `dig` command + obs events + a one-line MIND-SPEC amendment under Law 4.

## 5. Requirements
- Depth and weight are independent axes; an atom can be heavy and deep (old, once important).
- `dig` output cites episode provenance for every atom (Law 5).

## 6. Constraints
- No new dependency. No file deletion ever (defocus, never delete — decay.ts header).

## 7. Assumptions / Ambiguities
- `STRATA_HOT` is a knob; default chosen so the current mind's hot tier ≈ today's render.

## 8. Open Questions
- Should potentiate reset depth to 0 (surface) or only bump weight? Proposal: both.

## 9. Acceptance Criteria
- A synthetic ledger of 200 episodes renders the same SELF.md as today when `STRATA_HOT=∞`.
- `dig "old-claim-text"` finds an atom that decay has pushed below `RENDER_FLOOR`.

## 10. Clarification Check
- None outstanding.
