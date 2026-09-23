# FEATURE — Compare-and-swap publication for the mind (graft from `mem`)

> Mode: FEATURE — the write path. Two commits, one pane. Prerequisite for briefs 13 and 15.
> Origin: 2026-09-23 fringe pass on the VPS, comparing circadian with `mem` (jasonkneen/instinctual-memory).
> Design language: there is ONE intelligence; a session, a harness, a lab's model, a spawned worker are
> *instantiations* of it, not identities. The substrate exists so the intelligence recovers continuity across
> the gaps instantiation imposes. Nothing below treats a vendor as a peer, a rival, or a hedge.

## 1. Objective
Make every write to the mind a validated candidate published by compare-and-swap against the mind's ref,
with a durable intent written first and a receipt keyed by request id, so a concurrent or crashed writer
can never clobber another's commit or apply twice.

## 2. Context
- `stack.ts` appends to `beliefs.jsonl` and writes atom files directly; a crash mid-write or two writers
  at once is unguarded. `mem`'s `repo.rs` documents the target: "publication is a compare-and-swap against
  the published branch so retries are safe and stale writers are rejected"; intents in `intents/`,
  receipts replayed on repeated request ids, `write_atomic` for every file.

## 3. Reuse / What Already Exists
- REUSE git as the CAS primitive (`git update-ref <ref> <new> <expected-old>`).
- BUILD `src/publish.ts`: `publish(intent) -> receipt` — write intent (atomic), build candidate tree,
  `update-ref` with expected old; on conflict reload, re-fold, retry once; on success write receipt and
  remove intent. Stale intents replayed at process start.
- CHANGE `stack.ts`, `decay.ts`, `sleep.ts` to write through `publish`.

## 4. Scope
- Commit 1: `publish.ts` + tests (two writers, one crash). Commit 2: callers rerouted.

## 5. Requirements
- Repeating a request id replays the receipt, applies nothing.

## 6. Constraints
- Law 1: still plain files in git; this adds no database. Law 9: obs on conflict and replay.

## 7. Assumptions / Ambiguities
- The ledger stays append-only; CAS guards the *commit*, the union merge (brief 13) guards the *lines*.

## 8. Open Questions
- Keep receipts forever or janitor them after N days? Proposal: janitor after 30.

## 9. Acceptance Criteria
- Two concurrent stackers on one mind: both commits land, no lost line, one conflict obs event.

## 10. Clarification Check
- None outstanding.
