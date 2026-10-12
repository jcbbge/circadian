# 03 — Typed relations: implementation and test refinement

**Status:** Implemented as an independent research prototype with deterministic fixture checks and outside peer review. No production integration or behavioral inference evaluation. Builds on [dossier 03](../03-typed-relations-and-composition.md); follow the [shared protocol](TEST-PROTOCOL.md).

[Implementation](../prototypes/03-relations/index.ts) · [Demonstration](../prototypes/03-relations/demo.ts) · [Case coverage](../prototypes/03-relations/coverage.json) · [Run instructions and results](../prototypes/README.md)

## Useful operation and improvement

Answer a narrow relationship question through declared, source-backed paths, carrying those paths into the result. The addition makes the distinction between “said by,” “about,” “occurred at,” and “recorded at” usable during composition.

Uses: retrieve travel recommendations a friend actually made rather than remarks about that friend's taste; compare a family member's self-reports with accounts reported by others while preserving the occasions and speakers. The benefit is a more informative account of what supports a conclusion, not an automatic inference of personality or timeless truth.

The peer usefully proposed a separate attribution relation for multiple speakers and distinguishing unknown subject from an explicitly absent subject. The parent rejects its suggested rule that two self-reports warrant an enduring preference: frequency is not such a semantic guarantee. We instead return the reports and their distinct occasions, with a precise description of what was joined.

## Research prototype and design sketch

The following is the design-level API sketch. The implemented `composeReports` takes a code-defined query plus supplied source states; see the linked source for its exact signature and record types.

```text
composeReports(records, declaredPath, equations, reviewedIdentityMap, limits)
  → {rows, path, unresolved, violations, unavailable, coverage}
```

Design record sketch: `Report(id, statementRef, occasionRef, subjectRefs)`, `Attribution(reportRef, speakerRef)`, `Occasion(id, settingRef)`, and evidence-backed local person/place references. The implemented subject field distinguishes a set, unknown, and explicitly no personal subject. Multi-source support uses reference rows rather than assuming a single source. A reviewed identity mapping is supplied for this population; a shared spelling never creates identity automatically.

Only a few paths and equations are supported initially, as code-defined operations rather than a generic schema language. Examples:

```text
report → attribution → speaker
report → occasion → setting
report → subject
report → source episode → recording location
```

An explicitly declared equation may compare `report.declaredOccasionSetting` with `setting(report.occasion)`. It never equates the event setting with the episode's recording location. Two paths with the same endpoint type are not automatically equal.

Algorithm:

1. Resolve eligible source references and revisions within the supplied population. Reject endpoint kind mismatches; preserve unresolved references as unresolved.
2. Evaluate the selected typed join. For multi-valued relationships, retain multiplicity and supporting edges; do not coerce them into one speaker or one source.
3. Check only explicitly declared equations on **query-matching reports**, where both sides are defined. This is not a whole-population equation audit; a non-matching report's violation is outside the query. Missing sides are not checked. A failed equation identifies inconsistent structured data, not which source is true.
4. Render a narrow result: “On O1, P was attributed statement S, recorded in E,” with the traversed path. If several reports satisfy the query, list their occasions without promoting them to a permanent trait.
5. Stop at supplied row/hop/output limits and mark incomplete coverage. Deduplicate the same report reached through multiple paths without hiding genuinely different reports.

Current atoms already carry free-text claims and sources; they are not prohibited from mentioning other people. The relational index already offers lexical/entity retrieval. Explicit predicates, role assignments and checked composition would be supplemental semantics. An optional recall consumer could read the typed query result; the first prototype needs no changes to atom kinds, weights or REM. [Verified seams](SOURCE-MAP.md), [`atoms.ts`](../../src/atoms.ts), [`relindex.ts`](../../src/relindex.ts).

Reviewed annotations could be derived from committed episodes after capture, but automatic extraction and any persistent storage would be separate work. Disabled means no relation extraction/traversal. New data must obey source eligibility/deletion; current atom forget is not a generic report deletion API. No person database or ontology package is required for a supplied population.

## Concrete fixtures and cases

Fixture: R1 is Mira's statement about her reading preference at O1, a garden; its episode E1 was written at home. R2 is Noor's statement about Mira at O2, a cafe. R3 is a joint statement by Mira and Noor about themselves (subject set {Mira,Noor}) at O3, a library. R4 has an unknown speaker and an explicitly empty personal-subject set. Every report has explicit source references and revision values. Local identities are reviewed for this fixture only; an alias mapping is an explicit input, not string matching.

| ID | Input / query | Expected result |
| --- | --- | --- |
| T01 | Find setting of occasions where Mira spoke | O1→garden and O3→library; return path/source for each, not E1's home. |
| T02 | Find statements about Mira versus statements by Mira | About Mira: {R1,R2,R3}. By Mira: {R1,R3}, plus unresolved-speaker status for R4. R2 does not become Mira's self-report. |
| T03 | R1 occasion edge points to a Person record | Reject the typed hop; do not reinterpret the ID as an occasion. |
| T04 | R1 declaredOccasionSetting=cafe, composed setting=garden | Equation violation with both values and their references. |
| T05 | Episode recording location=home, occasion setting=garden | No equation between them; correct result remains garden. |
| T06 | Query by Mira with R4's speaker unknown | R4 appears as unresolved coverage, not attributed to Mira and not silently treated as someone else. |
| T07 | Query R3's speakers | Two attribution rows; no arbitrary single-speaker choice. |
| T08 | Fixture changes R1 speaker to Noor while all kinds/quotes still fit; external semantic oracle retains Mira | Structural checks can pass; semantic attribution is not checked. A “verified speaker” claim is prohibited. |
| T09 | Two self-reports on distinct occasions plus three hearsay reports | Return separate supported report groups/occasions; no threshold creates an enduring trait. |
| T10 | Two paths terminate in Person, with no declared equation | Keep their meanings/results distinct even when IDs happen to coincide. |
| T11 | Referenced episode unavailable or revision changed | Return unavailable/stale status; suppress unsupported quote rendering and conclusions depending on it. |
| T12 | Same report reached through two supporting paths | One report with two evidence paths, not two independent confirmations. |
| T13 | Supplied population exceeds work/row cap | Stop with coverage incomplete; no whole-corpus claim or unbounded traversal. |
| T14 | R5 has attributed speaker M. and subject Mira; query by-and-about Mira | With reviewed M.=Mira alias, R5 joins both paths. Without it, identity unresolved; never infer self-report or hearsay from the spelling alone. |

T01/T02 exercise useful composition rather than slot display. T04 tests a declared equation; T10 prevents an undeclared equation. T08 is a deliberately important limitation. These are bounded categorical-database-style semantics implemented with ordinary records and joins, not a full category engine or semantic proof.

## Comparisons and benefit measures

A is ordinary source-bearing recall. B receives the same typed records and uses ordinary joins. C adds the explicit path contract, equation checks and narrow renderer; remove each separately to identify its contribution. Do not make B an intentionally incorrect untyped name join.

Measure supported answers retained, attribution/path fidelity, overgeneralization in downstream use, proper unresolved reporting, lookup/context cost and annotation effort. Structural success is distinct from extracting the right speaker and from the reader respecting the conclusion's limits.

First behavioral cases: T01/T07 positive, T02/T09 challenging. The deterministic core needs no classifier. Optional later extraction with Jev or another named model must be a separate comparison against reviewed annotations, never a silent part of C.

Remaining choice: which few relationship paths recur enough to justify explicit annotation. Start with the two queries above and a caller-supplied population; do not solve global identity resolution to test them.
