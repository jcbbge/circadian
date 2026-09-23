# QUICK — Archaeology: "when did I start believing this" as a named command

> Mode: QUICK — one command over git. One commit.
> Origin: 2026-09-23 fringe pass on the VPS, comparing circadian with `mem` (jasonkneen/instinctual-memory).
> Design language: there is ONE intelligence; a session, a harness, a lab's model, a spawned worker are
> *instantiations* of it, not identities. The substrate exists so the intelligence recovers continuity across
> the gaps instantiation imposes. Nothing below treats a vendor as a peer, a rival, or a hedge.

## 1. Objective
Expose what git already knows: for a claim, when its atom was born, every episode that bumped it, every
supersede it won or lost, and the first commit that mentioned the claim text at all. For a human
re-trusting the substrate after a gap, this is reconstitution too.

## 2. Context
- Everything needed is in `git log -S`, `git log --follow` over `mind/beliefs/`, and the ledger. `zoom.ts`
  resolves atoms to episodes already; nothing resolves the *history* of belief.

## 3. Reuse / What Already Exists
- REUSE `zoom.ts` episode resolution, `atoms.ts readLedger`. BUILD `src/archaeology.ts`:
  `circadian when <id|claim-substring>` and `circadian bisect <claim>` (first commit where the claim text
  appears in any episode).

## 4. Scope
- One commit: command + tests against a fixture mind repo with three episodes.

## 5. Requirements
- Read-only. Output cites commit shas and episode filenames.

## 6. Constraints
- No model call. Law 7 spirit: file and git reads only.

## 7. Assumptions / Ambiguities
- Claim-substring match is case-insensitive whitespace-normalized (reuse the quote normaliser).

## 8. Open Questions
- Fold into `doctor` as a section? Proposal: separate command; doctor stays a health check.

## 9. Acceptance Criteria
- `circadian when <id>` prints birth episode, bump count, last bump, supersede lineage; `bisect` names the first commit.

## 10. Clarification Check
- None outstanding.
