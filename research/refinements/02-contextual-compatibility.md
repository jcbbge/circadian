# 02 — Contextual compatibility: implementation and test refinement

**Status:** Implemented as an independent research prototype with deterministic fixture checks and outside peer review. No production integration or behavioral inference evaluation. Builds on [dossier 02](../02-contextual-compatibility.md) and the [shared protocol](TEST-PROTOCOL.md).

[Implementation](../prototypes/02-compatibility/index.ts) · [Demonstration](../prototypes/02-compatibility/demo.ts) · [Case coverage](../prototypes/02-compatibility/coverage.json) · [Run instructions and results](../prototypes/README.md)

## Useful operation and improvement

Combine information with explicit knowledge of where its meanings overlap. Preserve differing activities, periods and perspectives; for declared finite constraints, establish whether a joint satisfying assignment exists. The benefit is more useful combination of memory without forced agreement or false conflict.

Uses: combine changing preferences while planning time with friends; compare several recollections of a shared trip without treating different feelings as competing objective facts. A second, independently useful operation is checking several explicit planning constraints together rather than only in pairs.

The peer improved the design by distinguishing **unspecified** from **explicitly unrestricted** applicability. The parent keeps comparison of selected accounts as the primary use; inspecting existing disagreement edges is an optional input source, not a production-repair prerequisite.

## Research prototype and design sketch

Two pure functions keep semantic alignment separate from finite checking:

```text
compareContexts(records, reviewedAlignment)
  → pair/group reports: separate | aligned | unknown, reasons and source refs
checkJoint(domains, allowedTuples, assignmentCap)
  → compatible(witness, narrowing) | conflict(exhausted domain)
    | unknown(reason, work completed)
```

These are design-level API sketches; the linked implementation contains the exact local signatures, including source states and bounds. A reviewed record supplies source reference/revision, subject, property meaning, value or allowed values, and applicability dimensions needed for this comparison: activity, occasion, observer or time interval. A dimension can be a known set/range, explicitly unrestricted, irrelevant to the declared property, or unknown. Omitted context never becomes universal by default.

The code review exposed a case where a supplied record dimension was absent from the reviewed comparison declaration. The prototype now returns `unknown(undeclared-record-dimension)` unless that record dimension is explicitly marked irrelevant. Restricted, unknown and unrestricted dimensions cannot silently disappear from comparison. The added regressions are separate from the original C01–C15 inventory.

Algorithm:

1. Check source eligibility/revision and declared alignment. A shared spelling is not proof of entity identity. Missing evidence needed for a comparison yields unknown.
2. Establish the comparison's meaning. Different observers' reported feelings remain attributable accounts; they are not rival measurements of one objective feeling. Unknown identity differs from explicitly distinct subjects.
3. Compute relevant applicability overlap. Explicitly disjoint domains are separate; uncertain overlap is unknown. A time interval uses a declared convention, initially half-open `[from, until)`, with explicit open endpoints distinct from unknown endpoints.
4. Within an aligned overlap, intersect allowed values or prepare a small finite constraint group. A nonempty intersection can narrow alternatives without creating a conflict.
5. Enumerate complete assignments in stable order, stopping at a witness, exhaustion, or the supplied cap. Only exhaustion with no witness supports conflict. A cap reached without a witness is unknown. Report which declared constraints/population were checked.
6. Return reports by reviewed comparison key (resolved subject/property/question and declared variable frame), with explicit applicability regions. Do not form a group merely from connected pairwise overlaps: overlap is not transitive. For the first bounded implementation, common regions/constraint groups are supplied by reviewed alignment; unsupported automatic partitioning returns unknown. An unaligned record keeps its own unknown report and does not block known groups. Do not force one verdict onto unrelated contexts or mutate memory, resolve tensions, or choose a winner.

Current atoms supply source references and origin scope; ledger edges supply existing recorded tensions. The applicability/variable meanings above are **new reviewed annotations**, not current atom fields. See [`atoms.ts`](../../src/atoms.ts), [`stack.ts`](../../src/stack.ts) and [source map](SOURCE-MAP.md).

First use is an explicit report over supplied records. Source-linked annotations could later live alongside existing Markdown, but storage/keying is not chosen: multiple annotations per source must remain possible. ID plus revision identifies what was interpreted. No mandatory wake hook, solver, classifier or change to atom identity. Disabled means no invocation or read/write of these annotations; existing annotation files need not be deleted to disable the feature.

## Concrete cases

All values below are synthetic reviewed formalizations. Correct formalization is stipulated for the deterministic cases and challenged separately in C09.

| ID | Fixture / operation | Expected |
| --- | --- | --- |
| C01 | Same person, preferred room energy: quiet while reading; lively while dancing | Separate applicability; retain both statements. |
| C02 | Same preference property over `[day1,day5)` and `[day5,day9)` | Separate periods; a possible change, not contradiction. Unknown endpoint variant yields unknown overlap. |
| C03 | Mira present throughout dinner D1 versus absent throughout that same occasion, same declared meaning | Conflict over domain {present,absent}; show both references. |
| C04 | “Mira” and “M.” without identity evidence | Unknown alignment, even if values match. |
| C05 | Same reviewed subject/property/occasion from different machines | Compare values normally; origin difference alone neither separates nor conflicts. |
| C06 | One activity unspecified, the other reading | Unknown overlap. Explicitly unrestricted variant overlaps reading. |
| C07 | A,B,C each in {0,1}; constraints A=B, B=C, A≠C | Every pair has a witness; all three have none after eight assignments. Joint result conflict, not inferred from pair verdicts. |
| C08 | A∈{0,1} and A=0 | Compatible, witness A=0; report narrowing, not conflict. |
| C09 | Two aligned records agree on attendance; a separate truth oracle says their annotation is wrong | Formal consistency passes; semantic extraction fails. No truth guarantee or merged “correct” score. |
| C10 | Eight binary variables; only all-ones satisfies; lexicographic enumeration capped at eight | Unknown after eight assignments. Raising cap to 256 reaches the witness; do not report conflict at the smaller cap. |
| C11 | Needed source removed, ineligible or revision changed | Unknown/skipped with reason; no conclusion based silently on stale annotation. |
| C12 | Two known different observers describe their own feeling at D1 | Preserve separate attributed feelings; not an attendance-style value conflict. |
| C13 | Input contains one aligned conflicting group and one unrelated compatible group | Two group reports; no universal verdict about the whole memory population. |
| C14 | r1/r2 share a reviewed comparison key and conflict; r3 has unknown alignment to both | {r1,r2} conflict; {r3} unknown. Joint enumeration/witness for the known group is unchanged. |
| C15 | Time-local value: r1 allows {0} on [0,2), r2 {0,1} on [1,3), r3 {1} on [2,4); reviewed overlap regions supplied | [1,2) narrows to 0; [2,3) narrows to 1. No triple overlap or global conflict from chaining the two overlaps. |

C07 is the substantive multi-record operation. It does not establish that arbitrary prose is a sheaf or that compatibility implies empirical truth. The sheaf/local-to-global direction contributes a precise question about overlap and joint assembly; the finite implementation needs only bounded enumeration.

## Comparisons and evidence

A is ordinary contextual reasoning over the selected accounts. B receives the exact same applicability/constraint annotations with ordinary pairwise checks. C adds the explicit joint operation. A further comparison with a plain exhaustive checker may show the minimal mathematical implementation is ordinary code; that is acceptable.

Measure false conflict, missed declared incompatibility, appropriate unknowns, useful combinations retained, annotation effort and assignments examined. Behavioral use matters too: does the resulting account preserve both perspectives and enable a sensible plan? Review semantic extraction separately from checker results.

First behavioral cases: C01/C08 positive, C04/C07 challenging. Optional Jev role: propose subject/property alignment or applicability labels with cited evidence, then pass them through the same checker. It is not the judge of the checker or a source of guaranteed truth. No-Jev reviewed-annotation behavior is the first comparison.

Unresolved choice: how much applicability vocabulary is useful across general-purpose situations before annotation effort dominates. Start with each fixture's explicit relevant dimensions; do not introduce a universal context ontology to answer that question.
