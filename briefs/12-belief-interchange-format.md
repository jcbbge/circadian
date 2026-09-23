# SPEC — Belief interchange format: the atom shape as a protocol, not a file layout

> Mode: SPEC — one document + one reader. Two commits, one pane.
> Origin: 2026-09-23 fringe pass on the VPS, comparing circadian with `mem` (jasonkneen/instinctual-memory).
> Design language: there is ONE intelligence; a session, a harness, a lab's model, a spawned worker are
> *instantiations* of it, not identities. The substrate exists so the intelligence recovers continuity across
> the gaps instantiation imposes. Nothing below treats a vendor as a peer, a rival, or a hedge.

## 1. Objective
Freeze the atom shape circadian and `mem` independently converged on — claim, why, verbatim quote, source,
origin stamp — as a portable interchange format that neither project owns. Then give circadian a reader
for foreign stores so a mind can absorb another system's beliefs without either changing.

## 2. Context
- `mind/beliefs/<id>.md`: fixed slots `kind/claim/why/quote/source/[ep:]`, id = sha256(claim) (MIND-SPEC,
  "The atom"). `mem`: `memory/<people|orgs|workstreams|preferences>/<name>.md`, YAML frontmatter per fact
  with id, status, timestamps, sources; consolidation rejects a fact whose evidence quote is not verbatim in
  the cited event (README, "How memory flows"). Same rule, two shapes.
- If the intelligence is one, its beliefs should not be stranded by which tool wrote them down.

## 3. Reuse / What Already Exists
- REUSE the counterfeit-quote assert in `stack.ts` (`normalizeForQuoteMatch`) as the format's single
  validity rule.
- BUILD `docs/BELIEF-INTERCHANGE.md`: the shape (≤ one page), the id rule, the quote rule, the two
  known dialects (circadian atom file, mem entity frontmatter) and their field mapping.
- BUILD `src/interchange.ts`: `parseForeign(path) -> Atom[]` for the mem dialect; rejected candidates
  emit degraded obs events with the reason.

## 4. Scope
- Commit 1: the document.
- Commit 2: the reader + a fixture copied from a mem store + tests. No writer in this brief.

## 5. Requirements
- A parsed foreign atom re-hashes to the same id as a native atom with the same claim (identity is content).
- Anything without a verbatim quote is rejected, never coerced.

## 6. Constraints
- The format document names no vendor, no harness, no project; it names a shape.

## 7. Assumptions / Ambiguities
- Mapping mem `status: superseded` -> a circadian `supersede` ledger event is out of scope (read-only import).

## 8. Open Questions
- Publish the format where? Proposal: this repo's `docs/`, then a standalone page once a second writer exists.

## 9. Acceptance Criteria
- `bun src/interchange.ts fixtures/mem-store` prints N atoms and M rejections with reasons; ids stable.

## 10. Clarification Check
- None outstanding.
