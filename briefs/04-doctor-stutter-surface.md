# QUICK — Surface semantic-stutter (detectSelfStutter) in doctor; investigate persistence

> Mode: QUICK — focused doctor.ts extension + a diagnostic. No conversation nuance.

## 1. Objective
Make Circadian's health surface (`doctor`) report the semantic-stutter cluster count that the REM render path **already computes**, instead of reporting "0.0% redundancy / healthy" while `SELF.md` carries ~10 paraphrased "mechanical fidelity" doctrine bullets.

## 2. Context
- `src/doctor.ts` `checkRedundancy` calls **only** `selfSimilarity` (`src/immune.ts`) — a line-level redundant-text ratio over lines ≥ 40 chars. It reports **0.0%** for the current `SELF.md` because the paraphrased bullets are each distinct lines; line-level dedup finds nothing.
- `src/immune.ts` **also** exports `detectSelfStutter` (line 305) — semantic overlap-clustering over doctrine/motif entries (threshold `SELF_STUTTER_THRESHOLD` = 0.3, via `significantTokens` + `overlapCoefficient`). doctor does **not** call it.
- `detectSelfStutter` **is already wired into REM's render path**: `src/migrate.ts:872` `adaptRenderedForStutterCheck` wraps the rendered SELF.md into the v1 shape the parser expects, and `migrate.ts:1132` runs `detectSelfStutter` on it before commit (the "smear not laundered" guard).
- So the detector exists and runs at REM. Two gaps: (a) doctor doesn't surface it; (b) the stutter is visibly still in SELF.md despite the detector — so either the detector thresholds out, or the render re-introduces it faster than it's caught.

## 3. Reuse / What Already Exists
- **REUSE / EXTEND** — `src/immune.ts` `detectSelfStutter` + `SELF_STUTTER_THRESHOLD`; `src/migrate.ts` `adaptRenderedForStutterCheck` (the envelope adapter — doctor MUST wrap the rendered SELF.md the same way, or `parseSelf` won't parse it, per immune.ts's header comment); `src/doctor.ts` `checkRedundancy` (add a sibling check).
- **BUILD NEW** — a doctor check ("semantic stutter") that runs `detectSelfStutter(adaptRenderedForStutterCheck(read SELF.md))` and reports the cluster count + clustered doctrine/motif titles.
- **DO NOT REBUILD** — `detectSelfStutter`, `adaptRenderedForStutterCheck`, `selfSimilarity`. Do not duplicate the clustering logic.

## 4. Scope
- Add the check to `doctor.ts`. Do **not** remove `selfSimilarity`/`checkRedundancy` — keep both; they measure different things (line-level text redundancy vs semantic cluster).
- Run `detectSelfStutter` against the current `mind/SELF.md` and **report** (in the brief's investigation notes) whether it actually flags the ~10 mechanical-fidelity bullets at threshold 0.3. This determines the next step.
- If it does **not** flag them: report why (threshold too high? `significantTokens` dropping content words? the rendered shape not matching `parseSelf`?) — diagnostic only; do not change the threshold without sign-off.

## 5. Requirements
- New check severity, matching the existing accretion-instrument pattern: OK (0 clusters), WARN (1 cluster), FAIL (≥ 2 clusters).
- Must use `adaptRenderedForStutterCheck` so it parses the current render shape.
- Emit cluster titles in the detail line (like `checkRedundancy` emits `worstOffender`).

## 6. Constraints
- Do **not** change `detectSelfStutter`, `adaptRenderedForStutterCheck`, or the REM render path. If the investigation finds the render path is ignoring its own detector, that is a **separate** brief — report it, don't fix it here.
- **DEPENDENCY: this brief edits `src/doctor.ts`. Brief 05 (`doctor` harness-aware hooks) ALSO edits `src/doctor.ts` `checkHooks`. Sequence them or merge the edits — do not run in parallel against the same file.**
- Do not change `SELF.md` content.

## 7. Assumptions / Ambiguities
- Assumes `detectSelfStutter` + `adaptRenderedForStutterCheck` are the right instrument (they're what REM uses — consistency argues for them).
- Ambiguity: the stutter the system already resolved once (episode `2026-07-28-the-stutter-resolved.md`) — is the current paraphrase a **regression**, or a different (acceptable) phenomenon? The investigation should say.

## 8. Open Questions
- Is the persistent paraphrase a real defect to fix, or accepted variance? (Determines whether a follow-up brief fixes the render path.)
- Threshold: keep 0.3, or tune for the current render?

## 9. Acceptance Criteria
- [ ] `bun src/doctor.ts` prints a "semantic stutter" line reporting the cluster count.
- [ ] With current `SELF.md`, it reports ≥ 1 cluster (the mechanical-fidelity paraphrase) — OR, if it reports 0, the brief's investigation notes explain why the detector misses it.
- [ ] `adaptRenderedForStutterCheck` is used (`parseSelf` does not throw).
- [ ] `bun test` passes (`immune.test.ts`, `migrate.test.ts` pin `detectSelfStutter` behavior — must not regress).

## 10. Clarification Check
Do you understand the intent and purpose? What ambiguous details remain? — Unresolved: is the paraphrase a defect to fix or accepted variance; threshold tuning.
