# 01 — Coordinated views: implementation and test refinement

**Status:** Implemented as an independent research prototype with deterministic fixture checks and outside peer review. No production integration or behavioral inference evaluation. Builds on [dossier 01](../01-coordinated-memory-views.md); uses the [shared test protocol](TEST-PROTOCOL.md). Other five proposals remain independent.

[Implementation](../prototypes/01-views/index.ts) · [Demonstration](../prototypes/01-views/demo.ts) · [Case coverage](../prototypes/01-views/coverage.json) · [Run instructions and results](../prototypes/README.md)

## Useful operation and improvement

Create a bounded, disposable view of a specified source population. Preserve represented qualifications, indicate incomplete coverage, and expand from the sources when more detail is needed. The benefit to test is useful context reduction with fewer lost qualifications or unnecessary follow-up reads.

Uses: orient to a family visit without loading every family episode; review a creative project's open interpretations without making the shortest account appear settled. The operation is useful at explicit recall or during reasoning. It does not assume the first task exists at wake.

The peer's useful refinement is to make **unmet preservation requirements and population coverage explicit**. Parent refinements: count every model-visible marker inside the budget; do not treat recording scope as semantic applicability; keep restriction laws separate from lossy ranking.

## Research prototype and design sketch

The following preserves the design-level API sketch; exact local signatures and result types are in the linked implementation.

```text
makeView(records, eligibility, selector, order, budget, policy, scanCap)
  → {text, includedRefs, eligibleCount, omittedCount,
     unresolvedCount, populationComplete, unmetCount}
expand(selectedRefs, currentSourceResolver, budget)
  → source text or per-reference unavailable/ineligible status
```

`makeView`, `restrictRecords` and `expand` now operate on supplied fixture records and source states. A future production adapter must supply existing source identity, content revision, text, and only available metadata. The implemented selector supports explicit IDs, source scope and episode-time ranges. A semantic/person selector can supply reviewed matching IDs later; it is not obtained for free by naming a field. Unknown metadata is reported unresolved for predicates that require it.

Algorithm:

1. Take an explicit fixed input population. Apply caller-supplied source eligibility, including relevant forgotten-atom state. Do not scan the entire mind implicitly.
2. Restrict eligible records using the selector. Keep unresolved predicate cases distinct from false matches. Source scope labels describe origin unless a separate applicability annotation exists.
3. Rank the matching population with a stable supplied order. Optional lexical/entity scores may provide that order; ranking is not the restriction operation.
4. Render whole records using a fixed renderer. A displayed claim keeps its required source and represented qualifications. An open disagreement may be represented by a short source-backed marker rather than the entire opposing record.
5. Reserve a fixed upper bound for the compact coverage footer for this supplied population, then render the longest fitting ranked prefix of complete record bundles. Each bundle includes its required qualification/disagreement marker. Stop at the first bundle that will not fit; do not skip it to fit later smaller records. It may become an ID-only insufficiency stub if that fits, or stay omitted. Never show its claim alone. All serialized fields visible to the model count toward the budget; full omitted-ID lists are not automatically returned. Below the minimum representable coverage response, return an invalid-budget control error before producing a view; any model-visible explanation needs its own accounted budget.
6. Expansion resolves original references afresh, checks revision/eligibility, and reads within a second explicit budget. It never expands a summary by guessing missing text.

Here `includedRefs` counts complete rendered records, not insufficiency stubs. The prototype chooses omission when a complete bundle does not fit. **`unmetCount` is a subset of `omittedCount`**, identifying omissions whose complete qualified representation could not fit; the two counts are not additive. With fixed eligibility, population, order, bundle representations and footer reservation, a larger budget can only extend the prefix. This policy trades packing efficiency for stable expansion; budget-dependent reranking has no such guarantee. Footer-only output is valid above the minimum. A scan cap limits inspected records and marks coverage incomplete.

The prototype uses a character budget and record cap, so the pure function needs no tokenizer dependency. The budget counts the whole successful serialized response in JavaScript UTF-16 units, not exact model tokens; behavioral runs would measure actual model tokens separately.

Current seams: [`scopedView`/`recallScope`](../../src/scopes.ts) already filter by scope before their estimated budget; [`queryIndex` and `renderEvidenceBlock`](../../src/relindex.ts) provide separate free-text retrieval/rendering. The addition can wrap a selected population through an explicit consumer; neither a new renderer nor new data automatically enters wake. [Verified source map](SOURCE-MAP.md).

No durable second summary population is needed. Disabling the addition preserves ordinary consumers. Missing sources produce statuses, not reconstructed content. A future persistent cache would need revision invalidation; the first version has none.

## Concrete fixtures and expected results

Use this fictional population, all initially eligible and complete: `a` = travel observation, scope travel, rank 1; `b` = reading preference, scope family, rank 2; `c` = another attributed reading account, scope family, rank 3; `d` = dance preference, scope family, rank 4. Sources and episode times are explicit. An existing-style disagreement annotation connects `b` and `c`. The renderer has room for two complete records plus coverage unless a case states otherwise.

| ID | Input / operation | Expected result |
| --- | --- | --- |
| V01 | Select family, cap 2 | Show b,c; eligible=3, omitted=1; a never consumes the view budget. |
| V02 | Select family, cap 1; a is globally highest | Show b, not empty. Global truncation followed by filtering is the deliberately different comparator. |
| V03 | Restrict family, then IDs {b,d}; compare direct intersection before ranking | Both restrictions return exactly {b,d}; identity restriction changes no eligible record. |
| V04 | Select b, but add an explicitly represented “when reading” qualification | Render that qualification; do not substitute its family origin scope for it. |
| V05 | Budget fits b and a disagreement marker but not c | Show b plus the unresolved-disagreement reference; expansion of c uses its source. Resolved-edge variant produces no open marker. |
| V06 | Budget fits the coverage response but not b's complete qualified representation | No bare b claim; only a fitting insufficiency stub or omission, with unmetCount incremented. |
| V07 | `populationComplete=false` | Counts refer only to supplied records; output does not claim exhaustive memory coverage. |
| V08 | b is ineligible before selection; or becomes unavailable before expansion | Exclude initially ineligible b; later expansion returns a status without its text. |
| V09 | Expansion source digest differs from the view's digest | Report changed revision; do not silently present old selection metadata as a check on new bytes. |
| V10 | Time selector requires a missing timestamp on d | d contributes to unresolved, not to a fabricated date match. |
| V11 | Every record fits | All eligible matches appear once; only bounded coverage overhead is added. |
| V12 | 21 supplied records, scanCap=20, budget above the coverage minimum | Inspect at most 20; return incomplete coverage rather than a global completeness claim; output satisfies the full serialized budget. |
| V13 | Same population, bundles and stable order; three increasing valid budgets | Complete includedRefs grow by prefix inclusion; omissions never increase; an open disagreement marker stays with its record. |
| V14 | budget=0, below the minimum coverage representation | Invalid-budget control result, no rendered view; never claim a nonempty explanation fit in zero characters. |

V03 exercises restriction composition over a fixed population. V02 demonstrates why a lossy truncation must not stand in for that restriction. Neither claims arbitrary summaries obey a presheaf law. V05/V06 test the useful preservation policy; they are not proofs of semantic truth.

## Comparisons, measures and model use

A is the relevant existing recall output; B is the same records/metadata/budget rendered plainly; C adds the preservation/coverage policy. An ablation removes markers while retaining records and budget. Primary measures: qualified-use success, recognition of incomplete coverage, source recovery and total context including expansions. Narrative review checks whether a compact view still conveys the intended account. Count any annotation needed beyond existing scope/ledger fields.

Candidate first behavioral cases under the shared protocol: V01/V11 positive, V05/V07 challenging. Match source lookup permissions across arms. Jev is optional only as a **view-sufficiency selector** in a later separate comparison; full-source selector input counts toward cost. The view itself requires no model.

The remaining choice is the supported selector vocabulary. Begin with explicit record references and actual source metadata, then add a semantic selector only if its annotation/discovery cost earns a benefit. This keeps the implementation smaller than a new retrieval router.
