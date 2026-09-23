# FEATURE — Backfill from session transcripts, and a hard `erase` (graft from `mem`)

> Mode: FEATURE — an ingester and a destructive command. Two commits, one pane.
> Origin: 2026-09-23 fringe pass on the VPS, comparing circadian with `mem` (jasonkneen/instinctual-memory).
> Design language: there is ONE intelligence; a session, a harness, a lab's model, a spawned worker are
> *instantiations* of it, not identities. The substrate exists so the intelligence recovers continuity across
> the gaps instantiation imposes. Nothing below treats a vendor as a peer, a rival, or a hedge.

## 1. Objective
Two gaps `mem` fills that circadian does not. Backfill: sessions that ran without graze (a new machine,
a harness with no hook) leave holes; read their transcripts after the fact into episodes. Erase: decay
fades a belief but cannot remove one; give the operator a hard forget that rewrites history and prunes.

## 2. Context
- `mem backfill-all` reads Claude Code, Codex and OpenCode session stores with a stable per-message id so
  re-ingest never duplicates. circadian's `transcript-format.ts` already parses one transcript shape.
- `mem erase` removes a fact from the tree, redacts its source events to `[erased]`, rewrites every commit on
  the memory branch and prunes objects (`erasure.rs`). circadian has `compost.md` (what was let go) but no removal.

## 3. Reuse / What Already Exists
- REUSE `transcript-format.ts`, `sleep.ts` episode drafting, `compost.md`. BUILD `src/backfill.ts`:
  `circadian backfill [--source claude|pi] [--since]` -> episodes with a `[backfilled]` stamp, idempotent by
  transcript id. BUILD `src/erase.ts`: remove atom file, redact its quote in the source episode, rewrite the
  mind repo history, prune; record the erasure (id and reason only, never the text) in `compost.md`.

## 4. Scope
- Commit 1: backfill + tests on fixture transcripts. Commit 2: erase + tests proving the text is absent
  from every reachable object.

## 5. Requirements
- Backfilled episodes are second-class for extraction (stacker weights them as one episode each; no
  synthetic recurrence). Erase requires an explicit `--reason` and prints what it will do before `--yes`.

## 6. Constraints
- Erase is the only process allowed to rewrite mind history; it says so in MIND-SPEC.

## 7. Assumptions / Ambiguities
- Pi session store shape to be read from the installed harness's docs at build time.

## 8. Open Questions
- Does a private remote (if ever allowed) get force-pushed after erase? Out of scope; noted.

## 9. Acceptance Criteria
- Backfilling the same transcript twice yields one episode. After `erase`, `git log -S<text>` over the mind returns nothing.

## 10. Clarification Check
- None outstanding.
