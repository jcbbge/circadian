# FEATURE — Split the model dependency at the decision boundary

> Mode: FEATURE — replace one call shape's transport. One commit plus a measurement.
> Origin: 2026-09-23 fringe pass on the VPS, comparing circadian with `mem` (jasonkneen/instinctual-memory).
> Design language: there is ONE intelligence; a session, a harness, a lab's model, a spawned worker are
> *instantiations* of it, not identities. The substrate exists so the intelligence recovers continuity across
> the gaps instantiation imposes. Nothing below treats a vendor as a peer, a rival, or a hedge.

## 1. Objective
Leave exactly one generative step in the substrate — EXTRACT — and move every fixed-choice step
(COMPARE, dedupe tie-break, rerank, "is this atom still load-bearing") to a decision-only model that
returns a typed choice. The substrate then depends on a language model only for a rare batch job.

## 2. Context
- `stack.ts` already limits the model surface to two shapes: EXTRACT (episode -> ≤5 candidates) and
  COMPARE (two claims -> one token of four: SAME | DISTINCT | SUPERSEDES_A | SUPERSEDES_B). COMPARE is
  already a decision, transported over a generative endpoint.
- Decision-only models exist and are cheap and fast (the VPS already uses one through Stanley and `mem`
  uses one as a reranker). A fixed-choice question over bounded evidence is their native shape.
- Any endpoint that answers a typed choice is interchangeable here; this is the opposite of a vendor
  feature. The point is that the *hot path* stops needing prose generation at all.

## 3. Reuse / What Already Exists
- REUSE `llm.ts` as the EXTRACT client unchanged.
- BUILD `src/decide.ts`: `decide({question, options, evidence}) -> option` with two transports:
  (a) a decision endpoint when configured, (b) fallback to the current generative COMPARE prompt. Same
  coercion rule as today: anything unparseable -> DISTINCT, surfaced as degraded.
- CHANGE `stack.ts` COMPARE to call `decide`. Later: relindex rerank, decay's "still load-bearing" check.

## 4. Scope
- One commit: `decide.ts` + COMPARE rerouted + tests with a fake transport. Then a measured run over the
  existing mind: agreement rate between old and new COMPARE on the same pairs, logged as an obs event.

## 5. Requirements
- Zero behaviour change when no decision endpoint is configured.

## 6. Constraints
- Law 7 untouched: wake still makes no model call of either kind.

## 7. Assumptions / Ambiguities
- Extraction quality is unaffected; only COMPARE moves.

## 8. Open Questions
- Threshold for trusting the decision transport's `confidence` when it exposes one? Proposal: ignore it in v1.

## 9. Acceptance Criteria
- COMPARE agreement ≥ 95% on the recorded pair set, with the decision transport ≥ 10x faster per call.
Measurement status: pending (see WORK.md)

## 10. Clarification Check
- None outstanding.
