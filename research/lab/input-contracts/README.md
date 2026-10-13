# Prospective input-contract repairs

These executable research adapters address the specific boundaries identified in [009](../extractor-009/RESULTS.md). They import unchanged prototype operations and frozen validators; they do not modify or rescore historical studies, change production Circadian, or start another inference run. They have no enable switch because they are not production extensions.

## What can be used now

| Proposal | Entry point | Guarantee | Remaining limit |
| --- | --- | --- | --- |
| 02: contextual compatibility | `compatibilityMemory(raw, fixture, labels)` | Binds and runs the existing compatibility adapter, then retains caller-owned human source labels alongside stable IDs and current supplied revisions in its reader packet. Missing labels remain null; unknown/stale label references reject. | A caller must supply labels. Labels embedded only in prose are not automatically discovered. Metadata is not proof of source meaning. |
| 03: checked relationships | `composeReviewedLocations(records, query, states, sources, facts, reviews)` | Separately reviewed recording-location and event-location claims are bound to exact source spans and packet identities before entering the unchanged composition operation. Unapproved event settings stay unknown. | Requires trusted caller review; there is no automatic semantic reviewer. Equal recording/event places are allowed when each has affirmative support. |
| 04: reusable operations | Existing `retireAid`, `instantiate` and `plan` | The regression verifies that retirement disables the derived aid without changing original inputs, sources or ordinary planning. No rewrite was needed. | This does not measure selection quality or total cost; R14 remains deferred. |
| 05: joint experiences | `recallReviewedParticipation(occasion, interpretations, states, sources, facts, reviews, people)` | Only separately approved participation enters the unchanged occasion/incidence readers. Authorship alone cannot enter membership through this gate; pending membership is retained as unresolved. | Other narrative/interpretation fields remain caller inputs. An unsupported participation claim does not establish absence. |
| 06: checked transformations | `bindTransformationSpans(raw, fixture)` / `compareSpanTransformations(...)` | Code extracts exact phrases from selected offsets and passes them to the unchanged validator and paired checker. Unknown and absent remain distinct. | Correct copying is guaranteed; selecting the right phrase, interpreting absence and preserving meaning are not. |

Proposal 01 remains the shipped optional reader; these repairs do not broaden its scope.

## Caller boundary

`bindSourceSpan` accepts a caller-owned source registry and `{sourceId, revision, start, end}`. Revisions must match the supplied snapshot. Offsets are half-open JavaScript UTF-16 code-unit offsets; empty, out-of-range, oversized and surrogate-splitting spans reject. It neither authenticates the snapshot nor establishes entailment.

Event facts use `{owner, relation, subject, value, span}`. Pass independent review separately as `{claim, decision, reviewer}`, where decision is `supported`, `unsupported` or `unknown`. Approval must match the complete claim, including source, revision and offsets. A missing/unknown approval is pending; only supported facts populate the checked fields. Decisions are returned alongside consumer results, so rejection or missing evidence is visible. The caller must actually obtain independent review: code cannot authenticate a reviewer or distinguish dishonest caller approval from real review.

Transformation known fields use `{state: "known", span: {start, end}}`; absent/unknown fields carry only their state. Their one source is assigned by the caller. Compatibility label metadata uses source IDs as keys and `{revision, label}` values; a null/missing label is unknown. These functions provide prospective packet adapters, not a new model runner or a claim that the existing endpoint selects correct offsets.

## Verification and continuation

Run the deterministic regressions with:

```sh
bun test research/lab/input-contracts
```

The tests include development fixtures already exposed in earlier studies, intentionally authored selections and reviewed annotations. They establish boundary behavior, not model accuracy or fresh held-out confirmation. They do not dispatch inference or read grading fields in the adapter path. Future inference, if authorized, needs its own bounded prospective protocol; do not silently apply these adapters to old responses and replace their scores.

The five ordinary-use observations for the shipped reader continue independently in [VIEWS-OBSERVATION.md](../../../docs/VIEWS-OBSERVATION.md). Further production promotion remains a separate decision grounded in that evidence.
