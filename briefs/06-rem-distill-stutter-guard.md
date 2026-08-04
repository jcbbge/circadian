# QUICK — REM distill phase: auto-supersede live stutter clusters + commit-subject truth + comment sweep

> Mode: QUICK — one focused module change (rem-popmem) + comment-only sweep. Two sequential commits.

## 1. Objective
Make REM resolve semantic-stutter clusters in the LIVE population every run — via the ledger's
existing `supersede` mechanics — so doctor's semantic-stutter check returns to OK and stays
there. Then make the REM commit subject tell the truth about sank/potentiate counters.

## 2. Context
- **Verdict from wave-01 investigation (orch-b04, board `wave-b04`):** the live paraphrase is a
  REGRESSION of `2026-07-28-the-stutter-resolved`. The detector was never the gap — surfacing
  was. `detectSelfStutter` is wired only at `src/migrate.ts:1132`, which checks a SEEDED SANDBOX,
  never the live mind. Nothing in the live REM path merges paraphrase atoms.
- **Current live state (verified 2026-08-04):** doctor FAILs with 5 doctrine clusters, incl. a
  12-member "mechanical fidelity" paraphrase. All members are above RENDER_FLOOR; the render
  faithfully folds all of them (`rem-popmem.ts:684`, `renderSelf`).
- **The supersede mechanism already exists and is unused by the live path:**
  `src/atoms.ts:46,57,291-335` (event type, `superseded-by:<winner>` status, fold: loser's
  current weight TRANSFERS to winner; loser keeps file + lineage); `src/stack.ts:36,50-51`
  (superseded atoms are historical, not dedupe targets); `src/rem-popmem.ts:546`
  (`RemCommitStats.superseded` counter exists, never incremented).
- **Commit-subject gaps (verified 2026-08-04):** "sank 27" appeared in 3 consecutive REM
  subjects with an IDENTICAL 27-id list (md5-checked) — it is a below-floor STATE report, not a
  per-run transition; and 19 potentiate events in a run surface nowhere in the subject while the
  commit context claims `propagated: 0`.
- Stale references to the deleted `templates/MIND-SPEC.v.next.md` remain in code comments:
  `src/atoms.ts:4,282`, `src/migrate.ts:4`, `src/rem-popmem.ts:4`, `src/stack.ts:4,540`,
  `src/render.ts:4,10`, `src/decay.ts:4`, plus v1-spec section citations in `src/sleep.ts`;
  `briefs/02-compost-dedup.md:9` cites v.next line 65.

## 3. Reuse / What Already Exists
- **REUSE / EXTEND** — `detectSelfStutter` (`src/immune.ts:305`, threshold 0.3, never throws);
  `adaptRenderedForStutterCheck` (`src/migrate.ts:872`); the supersede fold (`src/atoms.ts:329-335`);
  `renderSelf` (`src/render.ts`); the render-fidelity guard (`src/rem-popmem.ts:698`);
  `buildCommitMessage` (`src/rem-popmem.ts:438`); the janitor's paranoia-wrapper pattern
  (`src/rem-popmem.ts:829-838`).
- **BUILD NEW** — a DISTILL phase in `rem-popmem.ts` (after DECAY, before RENDER) that runs the
  detector pair against the live post-decay population and appends supersede events for every
  cluster; a `--dry-run`-capable standalone entry for verification; subject/counter fixes in
  `buildCommitMessage` + the decay phase.
- **DO NOT REBUILD** — the detector, the adapter, the threshold, the extraction stacker, the
  render. Do not add new event types to the ledger.

## 4. Scope
- **Phase A (commit 1):** DISTILL phase + subject truth.
  - Detect clusters over the live population each REM run (doctrine AND motifs — the detector
    reports both).
  - Per cluster: winner = highest current fold(ledger) weight; tie → earliest `[ep:]` stamp.
    Every loser gets one `supersede` ledger event; then RENDER proceeds over the distilled
    population (one render per run, reflecting the distillation).
  - Safety: cap 10 clusters resolved per run (overflow → WARN obs event, remainder defers to
    next run); whole phase wrapped in the janitor-pattern try/catch (a distill bug can never
    crack the REM host); one obs event per supersede `{winner, loser, transferred_weight}` plus
    a phase summary event.
  - Subject truth: distinguish newly-sank-this-run from below-floor total (e.g.
    `sank 0 · 27 below floor`) and surface potentiated count. Exact format: implementer's terse
    choice within those counters — the number must mean what it says (Law 9).
  - Standalone verification path: a flag to run ONLY the distill phase (dry-run supported) so
    the fix can be verified against the live mind TODAY without waiting for the 21:00 slot.
- **Phase B (commit 2):** comment-only sweep repointing `MIND-SPEC.v.next.md` references to
  `MIND-SPEC.md` (the promoted spec) in the 8 locations above; fix the `briefs/02` citation.
  No logic changes.

## 5. Requirements
- Supervised live run TODAY: execute the standalone distill against the real mind (the supersede
  appends + render + mind-repo commit travel the SAME code path REM uses at 21:00). After it,
  `bun src/doctor.ts` exits 0.
- The live run must leave evidence: the obs events, the mind-repo commit sha, the before/after
  doctor stutter lines, and the cluster→winner mapping in the report.
- Tests (no mocks; real tmp fixtures, house style): cluster detection → supersede appends →
  weight transfer folds correctly → re-render drops losers below floor → cap/overflow path →
  paranoia wrapper (throwing detector can't kill REM) → subject counters under: newly-sank 0,
  potentiate > 0, distill > 0.
- Recovery note in report: a bad supersede is recovered by `git revert` in the mind repo
  (beliefs.jsonl is committed every REM) — state this; do not build an unsupersede event.

## 6. Constraints
- Do NOT change `detectSelfStutter`, `adaptRenderedForStutterCheck`, `SELF_STUTTER_THRESHOLD`,
  the extraction stacker, or `renderSelf`.
- Identity atoms are out of the detector's scope already (doctrine + motifs only) — keep it so.
- NEVER push. Local commits only. Mind-repo commits only via the REM code path.
- `[UNKNOWN — needs input: none — coordinator resolved: auto-supersede (not proposals), phase
  placement after DECAY before RENDER, winner rule, 10-cluster cap, both doctrine+motifs.]`

## 7. Assumptions / Ambiguities
- Assumes fold(ledger) weight is cheap to compute per atom at distill time (renderSelf already
  does it — reuse, don't re-fold).
- Ambiguity: whether tonight's 21:00 REM should also absorb the new `tunick-s-ghost` episode
  normally — YES, no special handling; distill and absorb are independent phases.

## 8. Open Questions
- None. All UNKNOWNs resolved by coordinator (see §6).

## 9. Acceptance Criteria
- [ ] `bun test` green (302 baseline + new distill tests).
- [ ] Standalone distill run against live mind: 5 clusters resolved, evidence captured.
- [ ] `bun src/doctor.ts` exits 0 after the live run (stutter OK, hooks OK).
- [ ] Commit subject distinguishes newly-sank vs below-floor and shows potentiated/distilled.
- [ ] No v.next references remain in code comments; `briefs/02` citation fixed.
- [ ] Tonight's 21:00 REM (unattended) commits normally with the distill phase active.

## 10. Clarification Check
Do you understand the intent and purpose? What ambiguous details remain? — None unresolved;
coordinator pre-resolved all decision points (§6).
