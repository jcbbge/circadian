# FEATURE — Reconstitution is a checkout: the mind ref is the handoff, wake is narration

> Mode: FEATURE — a contract change plus a thin command. Two commits, one pane.
> Origin: 2026-09-23 fringe pass on the VPS, comparing circadian with `mem` (jasonkneen/instinctual-memory).
> Design language: there is ONE intelligence; a session, a harness, a lab's model, a spawned worker are
> *instantiations* of it, not identities. The substrate exists so the intelligence recovers continuity across
> the gaps instantiation imposes. Nothing below treats a vendor as a peer, a rival, or a hedge.

## 1. Objective
Make the whole mind reconstitutable from a single git ref, so that any instantiation able to run `git` is
fully continuous the moment it holds the ref — with no circadian process required. Wake stays, but as the
voice that narrates the already-complete handoff (Law 3: load-bearing or dead), never as the mechanism of it.

## 2. Context
- Today continuity is *produced* by `src/wake.ts` reading `mind/` and composing an injection under
  `CAP_TOKENS` (15000). If wake does not run, the instantiation is amnesiac even though the files are complete.
- `mem` reduces its entire store to a bare repo and a ref (`repo.rs`: publication is a compare-and-swap
  against `MEMORY_REF`). That is the colder object: a pointer, not a process.
- Law 7 already says wake is file reads only and must survive infra death. This brief takes the law to its
  limit: the files ARE the reconstitution; wake is optional presentation.

## 3. Reuse / What Already Exists
- REUSE `mind/` as a git repo (install.sh already initialises it, no remote).
- REUSE `src/wake-payload.ts` composition; it becomes the narration layer.
- BUILD `src/checkout.ts`: `circadian checkout <ref|path>` — verifies the ref resolves, validates the
  ledger folds (`atoms.ts foldWeights`), renders `SELF.md`/`NOW.md` deterministically (`render.ts`), emits one
  obs event. No LLM, no network, idempotent.
- DO NOT REBUILD wake, render, or the ledger.

## 4. Scope
- Commit 1: `checkout.ts` + tests. Given a mind ref, produce the rendered surfaces to stdout or to a path,
  and a one-line `RECONSTITUTED <sha> atoms=<n> weight=<w>` receipt. Refuse (exit 2) if the ledger fails to fold.
- Commit 2: `MIND-SPEC.md` amendment — one sentence under Law 7: "The ref is the reconstitution; every
  process after `checkout` is presentation." Wake calls `checkout` internally instead of re-deriving.

## 5. Requirements
- A fresh machine with only `git` and `bun` reaches identical `SELF.md` bytes from the same ref (determinism test).
- `checkout` never writes to `mind/`.

## 6. Constraints
- Law 1 (storage dumb). Law 7 (no service in the path). Doctrine 1 (fits on one page).

## 7. Assumptions / Ambiguities
- `mind/` stays remote-less by default; this brief does not decide whether a private remote is ever allowed.

## 8. Open Questions
- Should `checkout` accept a *mem*-shaped repo once brief 12 lands? (Yes if 12 lands first.)

## 9. Acceptance Criteria
- `bun src/checkout.ts --ref HEAD` on a mind repo prints the receipt and byte-identical renders across two runs.
- Wake output unchanged for an existing mind (golden test).

## 10. Clarification Check
- None outstanding.
