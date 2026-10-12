# Implementation review and corrections

The parent inspected the six implementations and worker reports, ran the combined suite, delivered the actual code to the existing outside peer session, independently reproduced the two material findings, and inspected and retested their corrections. The [initial reply](PEER-REVIEW.md) and [focused closure](PEER-CLOSURE.md) are preserved verbatim. Their adjacent receipts bind the requests, responses and source snapshots; an earlier reviewed snapshot is intentionally not replaced by the corrected one.

## Material findings resolved

| Finding | Reproduced behavior | Correction and regression evidence |
|---|---|---|
| 02 silently ignored a record context dimension absent from its reviewed group | Reading/dancing restrictions were dropped, permitting an aligned conflict verdict. | `compareContexts` returns unknown/`undeclared-record-dimension` unless the extra dimension is explicitly irrelevant. XC06 covers restricted, unknown, unrestricted and explicitly reviewed dimensions; XC07 covers irrelevant and mixed records. |
| 05 hid a relevant non-entry interpretation while claiming complete coverage | Removing the revisit from the H05 population yielded I1 alone, no unresolved I2, and complete coverage. | Every relevant interpretation omitted from the bounded accepted population is accounted for and marks coverage incomplete. H05 covers the original counterexample; XH03 covers no seeds; XH04 preserves actual source states; XH05 covers depth/record caps. |

The parent reran both original counterexamples after the changes. 02 now returns the required unknown verdict; 05 reports I2 as `omittedFromSelectedView` with incomplete coverage. The latter is deliberately neutral: traversal limits can cause an omission without a missing relation. Omitted interpretation content is not re-emitted through metadata.

H05's former apparent retrieval advantage was partly imposed by the entry flag. Both accounts already have occasion IDs, so direct occasion lookup already knows they are relevant. The implementation keeps selected-seed traversal but now measures its checked relationships and honest omission reporting. The test label, coverage note, demonstration and documentation no longer claim lexical discovery or superior retrieval.

The focused closure accepted the original corrections and identified two smaller accounting edges. Both are also fixed: interpretation IDs are tracked separately from revisit IDs, so a colliding revisit cannot suppress an interpretation omission (XH06); and the generic omission reason now accurately includes accounts reached but not emitted because of the output budget (XH07). The parent inspected these final changes and reran the full suite. The closure receipt records its earlier reviewed snapshot; no extra peer review of the last three changed source files is claimed.

## Other dispositions

- **01:** `unmetCount` is a subset of `omittedCount`. An open disagreement records an unresolved relationship; it does not assert current access to its opponent. Expansion independently checks eligibility and revisions. These presentation semantics are documented; no new inference or eligibility bypass was added.
- **03:** Equation checking is scoped to query-matching reports. Repeated subject entries can create multiple supporting paths on one report row; this does not duplicate the answer row. The separately implemented ordinary typed join is a competent positive-answer comparator for its stated reviewed, eligible fixture precondition.
- **04:** Ordered places are part of the binding because they control tie-breaking. The suggested removal of outer preflight was declined: it bounds both bound and supplied inputs before `slotSignature` traverses and serializes them. The later preflight checks merged input and also protects direct `plan` calls. Limits apply per finite phase.
- **06:** Added independent `byteChange: changed | unchanged | unavailable`. K01/K06/K11/K13/K15 cover the states, including misleading and faithful changed prose with empty field-difference lists. Text inequality is not a semantic judgment; prose preservation remains `notChecked`.
- **Comparator qualification:** The peer's combined claim that every comparator uses the same code path was too broad. 03's ordinary join is separate code; other comparisons share primitives, use full versus partial application, or deliberately alias an implementation. None are independent behavioral performance arms.

## Captured acceptance evidence

[results.json](results.json), [JUnit output](test-results.xml) and [demonstrations.json](demonstrations.json) record the corrected run: **120 tests, 492 assertions, zero failures or skips**, six demos, and all **93** original case IDs mapped. **92** mappings have exact executed test labels in the JUnit artifact. **R14** remains deferred because its actual usefulness/total-cost question needs a behavioral comparison. Additional regressions and runner tests are outside the 93-case inventory.

All 213 tracked production files match the starting hashes. Source hashes were stable across the verification commands. No production lifecycle, dependency, service, database, live memory or model-evaluation configuration changed. Tests execute in the existing Bun runtime; they are not a static type-check claim.

This accepts the bounded research implementation. It does not establish semantic extraction, annotation fidelity, narrative preservation, reader benefit, real-model speedup or total maintenance cost. Those remain empirical questions across all six proposals. The executable selection control is for the research runner; no production extension configuration has been installed.
