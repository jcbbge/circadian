# QUICK — Dedup compost.md fossil entries (frozen historical)

> Mode: QUICK — one-shot data cleanup of a frozen file; no code, no conversation nuance.

## 1. Objective
Remove the duplicate pre-switchover entries in `mind/compost.md` so the frozen historical record is clean and `zoom.ts` provenance lookups aren't noisy.

## 2. Context
- compost.md is **DECIDED frozen as historical**: `templates/MIND-SPEC.md` line 113 ("compost.md is frozen as historical; git is the archive") and `docs/POPULATION-MEMORY.md` ("DECIDED — compost.md is frozen as historical; the decay step auto-generates a [sank list]").
- The population-memory REM **does not write compost** — `src/rem-popmem.ts:48` ("composted: [] -- nothing composts in the population-memory world") and `:769` (`composted: []`). The sank-below-floor list lives in the commit body, not compost.md.
- The file's last entries are dated **2026-07-26 and 2026-07-27** — the day before the 2026-07-28 switchover (commit `d045196`). These are pre-switchover fossils from the retired v1 pruner path.
- The `## 2026-07-26` and `## 2026-07-27` sections **each appear twice, identical** (verified by reading the file). Pure duplicates.

## 3. Reuse / What Already Exists
- **REUSE / EXTEND** — the existing `Composted: <what> — <why> — lesson lives at <where>` entry format (v1 spec; `src/zoom.ts` `compostEntriesFor:176` parses it by that fixed form).
- **BUILD NEW** — nothing. This is a dedup edit.
- **DO NOT REBUILD** — any compost pruner. The popmem path has none; the v1 pruner is retired. Do **not** add a pruner — the file is frozen by design.

## 4. Scope
- Remove the duplicate `## 2026-07-26` and `## 2026-07-27` sections in `mind/compost.md` (keep one copy of each dated section).
- Decide the cap-check disposition (see Constraints).

## 5. Requirements
- After dedup, each dated section appears exactly once.
- Surviving entries still match `zoom.ts`'s `Composted:` parser (`compostEntriesFor`).
- File stays under its cap (currently ~830 tokens / 1000).

## 6. Constraints
- Do **not** touch any code that writes compost (there is none in popmem).
- **[UNKNOWN — needs input: keep the `compost.md` 1000-token cap check in `src/doctor.ts:70` and `src/status.ts:36,286`, drop it, or raise it — given the file is frozen historical?]**
- **[UNKNOWN — needs input: commit the dedup directly, or leave staged?]** Since REM no longer writes compost, a direct manual commit is the only path; REM won't touch it.

## 7. Assumptions / Ambiguities
- Assumes the duplicates are pure fossils (confirmed by date — both pre-switchover).
- Ambiguity: since the file is frozen and git is the archive, is dedup even worth it? (Recommend yes — duplicates are noise for `zoom.ts` provenance lookups and contradict "frozen/clean.")

## 8. Open Questions
- Cap-check disposition for a frozen file?
- Direct commit vs leave staged?

## 9. Acceptance Criteria
- [ ] `grep -c "^## 2026-07-26" mind/compost.md` == 1 (was 2).
- [ ] `grep -c "^## 2026-07-27" mind/compost.md` == 1 (was 2).
- [ ] `zoom.ts` `compostEntriesFor` still parses the surviving entries (run the zoom test or a manual check).
- [ ] `bun src/doctor.ts` exits 0.

## 10. Clarification Check
Do you understand the intent and purpose? What ambiguous details remain? — Unresolved: cap-check disposition; commit path.
