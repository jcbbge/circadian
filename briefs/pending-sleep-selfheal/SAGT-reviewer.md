# SAGT (reviewer, sonnet) — review pending-sleep self-heal

Read `briefs/pending-sleep-selfheal/BRIEF.md` (root cause + Done-when),
`CONTRACT.md` (rules), and `AGNT-coder.md` (what the coder was told, including
the ORCH addendum) first.

## Your role
Adversarial review of the working-tree diff produced by the AGNT coder. You are
the scorer; the coder was the actor. **The actor never grades its own work** —
that is why you exist. A false green is worse than a red.

## Hard rules
- **You write NO source files.** Do not edit `src/sleep.ts`, `src/doctor.ts`,
  `src/sleep.test.ts`, or anything else under `src/`. Read and run only.
- **Do not commit, stage, stash, checkout, or revert anything.** The working
  tree is the deliverable; leave it exactly as you found it.
- Running tests, `bun build`, and `bun src/doctor.ts` is expected and fine.
- Do **not** run `bun src/sleep.ts --drain` — the ORCH owns that step, because
  it mutates the real local queue at `logs/pending-sleep.jsonl` and can only be
  done once meaningfully. Report on it, don't perform it.

## Do
1. `git diff` (and `git status`) — confirm the diff touches ONLY
   `src/sleep.ts`, `src/doctor.ts`, `src/sleep.test.ts`. Any other source file
   in the diff is a contract breach; report it as a FAIL.
2. Walk the Done-when checklist in `BRIEF.md` item by item. For each, record
   **PASS/FAIL plus the evidence** (a line range you read, or command output
   you ran). No item may be marked from reading the coder's report — the
   coder's claims are input to your review, never evidence for it.
3. Specifically confirm, by reading the code yourself:
   - There is exactly ONE definition of the stuck thresholds/predicate and
     `src/doctor.ts` imports it. Grep for stray `8` / `24` stuck-threshold
     literals across both files.
   - Doctor's stuck semantics are **unchanged in behavior** after the refactor
     (it must still flag cap OR stale) — a refactor that silently narrows
     doctor into agreeing with a weaker drain is the failure mode to hunt.
   - The dead-letter path appends to `logs/pending-sleep.dead.jsonl` AND
     removes from `pending-sleep.jsonl`, and emits a loud `fail`/`degraded`
     event. A silent drop is a FAIL (Art. 9).
   - The old halt-at-cap `break` no longer wedges the entries behind it (see
     ORCH addendum item 1).
   - The test uses real files in a tmpdir with **no mocks**, and genuinely
     proves both cases (stale-failing → dead-lettered; fresh-failing →
     retained with attempts ratcheted). A test that would pass even with the
     fix reverted is a FAIL — say so.
4. Run and paste output:
   - `bun test src/sleep.test.ts`
   - `bun test src/janitor.test.ts`
   - `bun build src/sleep.ts && bun build src/doctor.ts`
   - `CIRCADIAN_HOME=$PWD bun src/doctor.ts` (report the **pending sleep
     queue** line verbatim; it is expected to still read FAIL at this point,
     because the ORCH has not yet run the drain — that is not a defect)

## Report
Post a Tower DONE to topic `circadian/pending-sleep` with a verdict of
**PASS** or **CHANGES NEEDED**, the per-item Done-when table, and the pasted
command output. If CHANGES NEEDED, list each defect as a specific, actionable
line-level finding — route it to the ORCH on the board, never to the operator.
Then write `briefs/pending-sleep-selfheal/done/sagt-reviewer.done` and idle.
