# QUICK — Promote MIND-SPEC.v.next.md; reconcile stale v1 references

> Mode: QUICK — single focused docs task. v.next is already written; v1 is stale. No conversation nuance to preserve.

## 1. Objective
Make Circadian's authoritative spec describe the population-memory model that has been **live since 2026-07-28** (commit `d045196`), and remove the stale v1 claims that misdescribe the running system.

## 2. Context
- `templates/MIND-SPEC.md` (v1) is the spec `README.md` links. It predates the 2026-07-28 population-memory switchover.
- `templates/MIND-SPEC.v.next.md` **already exists and is essentially complete**: the five sentences, atom/ledger/stacker/render design, REM payload, R7 fitness ("silence is a verdict"), and "compost.md is frozen as historical" (v.next line 65). Its header says "This one page is the whole design."
- `docs/POPULATION-MEMORY.md` is the COORDINATED blueprint that built the model (R1–R11, the pathology taxonomy, workstream decomposition). It is the detailed design-of-record.
- v1 still claims things the code no longer does:
  - compost.md is a "ROLLING WINDOW log of shed episodes" (it is **frozen** — `src/rem-popmem.ts:48,769` writes `composted: []`; "nothing composts in the population-memory world").
  - REM commit subject is `absorbed N, shed M, worldview XXk tokens` (it is now `stacked N, bumped M, sank K, population P` — see `src/rem-popmem.ts` `buildCommitMessage`).
  - Kill switch = "seven consecutive bad verdicts" (it is now the R7 **weighted streak** over scored greeting windows — `src/status.ts` `computeVerdictStreak`; `src/sleep.ts` `decideImplicitOk`; `docs/POPULATION-MEMORY.md §7 R7`).
  - No mention of atoms, the ledger, the stacker, the render, `mind/beliefs/`, `mind/beliefs.jsonl`, or `mind/render-manifest.json`.

## 3. Reuse / What Already Exists
- **REUSE / EXTEND** — `templates/MIND-SPEC.v.next.md` (the v2 spec, ~1 page), `docs/POPULATION-MEMORY.md` (the full blueprint, R1–R11), `docs/OBSERVABILITY.md` (Law 9 doctrine, referenced by v1 §9 and still authoritative).
- **BUILD NEW** — a redirect/header note on v1 if it is kept as historical; an updated link in `README.md`.
- **DO NOT REBUILD** — the five sentences, the atom/ledger/render design, the R7 fitness model. All are already in v.next and POPULATION-MEMORY.md. Do not re-derive any of it.

## 4. Scope
- Pick a promotion path (see Constraints) and execute it.
- If v1 is replaced: confirm v.next's "What survives v1 unchanged" section actually covers what v1 spelled out in detail — the token-target table, the scoreboard schema, the digestion-ledger (`digested.jsonl`) schema, the GRAZE mechanics. Anything v.next deliberately omits must either be in POPULATION-MEMORY.md or added as a cross-link, not lost.
- Update `README.md` to link the authoritative spec.
- Audit in-repo references to v1's stale claims: `grep -rn "rolling window\|absorbed.*shed\|7 consecutive\|compost" --include=*.md` and reconcile each hit (excluding the v1 file itself if kept as historical).

## 5. Requirements
- The authoritative spec describes: population-memory atoms/ledger/stacker/render; the `stacked/bumped/sank/population` commit convention; R7 verdict (implicit `ok` by propagation, only manual act is `--greet-bad`, weighted-streak kill switch); compost.md frozen; the statusline strip contract (R11).
- No spec claim contradicts the running code — verify against `src/rem-popmem.ts` (`buildCommitMessage`), `src/status.ts` (`computeVerdictStreak`), `src/sleep.ts` (`decideImplicitOk`).
- `README.md` links the authoritative file.

## 6. Constraints
- **[UNKNOWN — needs input: replace v1 outright (v1 → git history), or keep v1 as historical with a header redirect to v.next as authoritative?]**
- v.next is deliberately terse ("one page"). If porting v1 detail, do not bloat v.next past its intent — link out to POPULATION-MEMORY.md instead.
- Docs only — do not edit code. Code is truth; spec follows.

## 7. Assumptions / Ambiguities
- Assumes v.next is intended to be authoritative (its header suggests so).
- Ambiguity: v.next drops the explicit token-target table and the scoreboard/digestion-ledger schemas v1 had — are these fully covered in POPULATION-MEMORY.md, or must they survive in the canonical spec?

## 8. Open Questions
- Replace v1 outright or keep both?
- Does any tooling parse `MIND-SPEC.md` by filename? (`zoom.ts:263` lists it among pinned mind files; `README.md` links it. Confirm nothing else depends on the v1 filename.)

## 9. Acceptance Criteria
- [ ] Exactly one spec is authoritative; `README.md` links it.
- [ ] `grep -E "rolling window|absorbed.*shed|7 consecutive bad"` in the authoritative spec returns nothing contradictory.
- [ ] Commit convention, R7 verdict, compost-frozen, statusline strip all match the code.
- [ ] `bun src/doctor.ts` still exits 0.

## 10. Clarification Check
Do you understand the intent and purpose? What ambiguous details remain? — Unresolved: promotion path (replace vs keep both); whether v1 detail (token table, schemas) must survive in the canonical spec.
