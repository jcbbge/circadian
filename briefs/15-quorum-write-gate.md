# FEATURE — Quorum write gate: concurrent instantiations must agree before a belief becomes canonical

> Mode: FEATURE — a gate in the stacker. One commit.
> Origin: 2026-09-23 fringe pass on the VPS, comparing circadian with `mem` (jasonkneen/instinctual-memory).
> Design language: there is ONE intelligence; a session, a harness, a lab's model, a spawned worker are
> *instantiations* of it, not identities. The substrate exists so the intelligence recovers continuity across
> the gaps instantiation imposes. Nothing below treats a vendor as a peer, a rival, or a hedge.

## 1. Objective
When more than one instantiation is stacking at once (brief 13), admit a *new* atom to the canonical mind
only when N of M independent COMPARE decisions agree it is DISTINCT from everything active. Disagreement
is recorded, not resolved by whoever wrote last.

## 2. Context
- Today one stacker's COMPARE decides. With lanes, several run in parallel against slightly different
  views of the population; the first to land wins by accident of timing.
- This is NOT plurality of vendors as a hedge; the intelligence is one. It is independence of *evidence*:
  the same question asked against each lane's view, and only agreement admits.

## 3. Reuse / What Already Exists
- REUSE `decide` (brief 14) as the vote. REUSE the `contradiction` event (brief 16) for the disagreement.
- BUILD in `stack.ts`: `QUORUM = {n: 2, m: 3}` knob; a candidate that fails quorum is written as a
  `proposed` atom (file present, no `stack` event) and listed by `circadian status`.

## 4. Scope
- One commit: gate + `proposed/` handling + tests with fake votes.

## 5. Requirements
- Quorum never applies to a bump (recurrence of an existing atom); only to a birth.

## 6. Constraints
- Default off when there is a single lane (no behaviour change for a single instantiation).

## 7. Assumptions / Ambiguities
- Votes are cheap enough (brief 14) that M=3 is affordable per birth.

## 8. Open Questions
- Does a human `circadian admit <id>` promote a proposed atom? Proposal: yes; it is the escalation door.

## 9. Acceptance Criteria
- Three fake voters 2:1 DISTINCT -> atom born; 1:2 -> `proposed`, visible in status, no `stack` event.

## 10. Clarification Check
- None outstanding.
