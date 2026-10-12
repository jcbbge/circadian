# 06 — Checked transformations: implementation and test refinement

**Status:** Implemented as an independent research prototype with deterministic fixture checks and outside peer review. No production integration or behavioral inference evaluation. Builds on [dossier 06](../06-checked-memory-transformations.md) and [shared protocol](TEST-PROTOCOL.md).

[Implementation](../prototypes/06-transformations/index.ts) · [Demonstration](../prototypes/06-transformations/demo.ts) · [Case coverage](../prototypes/06-transformations/coverage.json) · [Run instructions and results](../prototypes/README.md)

## Useful operation and improvement

Check a named property of a proposed transformation against its actual inputs, independently of the process that proposed it. Preserve such distinctions as who spoke, what circumstances applied, and whether “often” became “always.” Optionally retain a receipt of the exact check when later inspection benefits from one.

Uses include a qualified social preference being shortened, a shared travel recollection being reorganized without changing “we” to “I,” and a creative reflection whose uncertainty should survive a change in presentation. Checking is supplemental; an account need not become structured or checkable to remain valuable memory.

The peer sharpened independent recomputation and per-property results. The parent rejects an overall “pass” that can coexist with unexamined changed prose, magical removal of semantic fields from arbitrary prose, and the idea that a receipt can verify changed or unavailable inputs. A historical receipt records what was checked then; it is not a substitute for present evidence.

## Research prototype and design sketch

The prototype implements one fixed equality checker and one fixed renderer as ordinary functions in the existing runtime. No proof assistant, generic rule language or dependency on the other five additions is necessary. The following retains the design-level input sketch; the implementation packages inputs into `CheckInput` and takes explicit limits.

```text
checkPresentation(old, candidate, reviewedFields, sourceStates,
                  admittedAssumptions, ruleVersion, checkerVersion, limits)
  → propertyResults, differences, byteChange, representationCoverage, assumptionsUsed

makeReceipt(exactInputs, limits) → optional independently recomputed bound check record
verifyApplicability(receipt, exactCurrentInputs) → applicable | stale(reason) | unavailable
```

The first declared invariant is equality of subject, attribution, circumstance, modality and preference/comparison under a presentation-only change. Atom kind, source references and origin scope are separate structural fields; origin scope is not automatically semantic applicability. More permissive transformations need separate explicitly specified relations, not an undefined `narrow` operator.

Algorithm:

1. Enforce supplied byte/record limits before hashing or property checks. Read exact old/candidate bytes and supplied source revisions/eligibility. Bind all of them, the reviewed annotations, assumptions and rule/checker versions into the input identity. Atom ID alone does not identify all bytes.
2. Give each field an explicit state: known value, **explicitly absent**, or unannotated/unknown. Known versus a different known value or explicit removal fails equality; unknown on either side is `notChecked`. Thus missing annotation is not confused with established removal.
3. Independently compare represented fields and run the named source-presence checks. A required missing/ineligible source prevents a complete result. Textual quote presence does not establish entailment.
4. With the fixed renderer, recompute candidate bytes from the fields and compare bytes. This checks the exact template, not arbitrary prose. With free prose, always label prose preservation `notChecked`, even if metadata is unchanged. Independently expose `byteChange: changed | unchanged | unavailable` by comparing the supplied presentation bytes. An empty represented-field `differences` list can therefore coexist with changed prose without implying reassurance. Byte inequality is not a semantic verdict; unavailable source material need not prevent comparing presentation bytes that remain supplied.
5. Return per-property `pass` / `fail` / `notChecked`, with coverage described separately. A UI may say “represented fields passed; prose unassessed.” It must not say “memory preserved.” Expose admitted assumptions individually rather than upgrading them to evidence. A report authorizes no publication.

One deterministic path-equivalence fixture checks whether selecting records before fixed field-preserving reformatting equals reformatting before selection, for predicates whose represented fields are unchanged. Compare normalized record values and references, not incidental bytes. Do not claim commutation with truncation, aggregation or lossy ranking. A writer-then-annotator comparison is a separate semantic experiment, not a proof of that algebraic property.

## Fit, receipts and independence

Circadian already has bounded checks: normalized quote presence and equality with a fresh SELF render. See the [source map](SOURCE-MAP.md). These are precedents, not evidence of an existing semantic checker. Optional checks can accompany selected proposed derivations/consolidations before any future explicit acceptance step. Existing publication's content validation and Git durability do not validate arbitrary new semantic properties.

The prototype returns ephemeral results and optional in-memory receipts; it implements no persistence. Persist a receipt later only if inspection earns its storage/maintenance cost. The receipt binds digests of old/candidate bytes, sources, annotations, assumption contents and rule definition, together with rule/checker versions and result. It holds digests, field names and statuses, not copied semantic values or quotes. Version labels require stable definitions to be meaningful. Hashes bind bytes, not truth or a trusted checker. An unauthenticated receipt is an inspectable claim about a run, not tamper-proof evidence.

Changed inputs make applicability stale; missing inputs make current checking unavailable. A receipt may document a historical result when recomputation is impossible, but cannot reproduce that check or establish validity for the new state. If exact old inputs are already available in history, compare simple recomputation against retaining the receipt.

No mandatory wake check or model call. Disabling the addition leaves ordinary behavior unchanged and does not require deleting old artifacts. Live persistence still needs a deletion policy: even digests, reference paths or field names may identify a memory, and proposed sidecars are outside current atom-only erasure. Reviewed fixtures avoid imposing this storage scheme on the mind prematurely.

## Concrete cases

Fictional reviewed record: subject/attribution narrator self-report; circumstance tiring day; modality often; preference quiet conversation with close friends over a big gathering. The fixed template names every represented field. Free prose remains separately reviewable.

| ID | Input / operation | Exact expected result |
|---|---|---|
| K01 | Same fields, faithful fixed renderer | Every named equality and exact-render check passes; guarantee explicitly limited to these properties. |
| K02 | Subject narrator→Mira | Subject equality fails. |
| K03 | Modality often→always | Modality equality fails. |
| K04 | Circumstance known tiring-day→explicitly absent | Circumstance equality fails. |
| K05 | Comparison big-gathering→all-social-occasions | Comparison equality fails. |
| K06 | Correct metadata and quotes; free prose says “dislikes social occasions” | Field/source checks may pass; prose preservation is notChecked; no overall semantic pass. |
| K07 | Candidate circumstance unannotated rather than explicitly absent | Circumstance notChecked; no invented equality or proven-removal failure. |
| K08 | Edit candidate bytes after making a receipt | Applicability stale(candidate), even if field metadata is unchanged. |
| K09 | Same atom ID, changed source bytes; required quote removed | Applicability stale(source); fresh quote-presence check fails. |
| K10 | Change old bytes, annotation, rule definition/version, checker version or assumption | Each separate mutation invalidates its input binding and names the reason. |
| K11 | Required source deleted/ineligible | Current source-dependent check unavailable/notChecked; no rendering from an old receipt. |
| K12 | Admit “M. is Mira,” though fixture source does not establish it | Any dependent pass explicitly conditional on that assumption; no claim that identity was verified. |
| K13 | Same fields; free prose loses “I'm unsure why it mattered” | Fields may pass; prose remains unassessed; narrative review rejects the lost uncertainty. |
| K14 | Filter subject=Mira then fixed reformat versus opposite order; negative fixture maps the sole record subject Mira→Noor | Preserving transform gives identical normalized outputs. Negative: filter-then-transform retains the Noor record, transform-then-filter returns empty; that transform is outside the preservation guarantee. |
| K15 | Faithful free rephrase with the same represented fields | Field checks pass, prose notChecked; reviewer can accept without a false machine guarantee. |
| K16 | Same false reviewed attribution on both sides | Structural preservation passes; annotation review fails. The checker does not detect a shared false premise. |
| K17 | 10,001 input bytes with limits.bytes=10,000 | Unsupported(limit) before hashing/checking; no corpus scan or model fallback. |
| K18 | Retain a modality-failure receipt, then make its source unavailable; fixture policy permits historical metadata | Current applicability unavailable; past fail(modality) explicitly historical, with no field values/quotes. If the erasure policy also excludes the receipt, suppress/remove it instead of preserving history against that policy. |

K10 is a mutation family, not one ambiguous combined change. K14 deliberately excludes budget truncation. K06 and K16 test different failures: metadata may disagree with prose, or both annotations may agree on a false interpretation.

## Comparisons and benefit

Use A ordinary text diff plus source access, B the same reviewed fields with simple independently recomputed validation, C that validation plus exact artifact binding and, separately, an optional receipt. A well-built B may already supply binding; equivalence is a valid result. Do not use a vague proof label to claim an extra capability.

First behavioral set: **K01/K15 positive; K06/K13 challenge**, under the shared 24-trial proposal (at most 48 reader calls). Measure qualification/attribution changes caught; false acceptance and false rejection; whether “fields passed” causes unwarranted confidence; reading effort and context. Compare receipt versus recomputation on later inspection as a distinct operational question. Preserving a useful history of checks is different from certifying a changed record.

The checker needs no classifier. A future extraction arm could compare no-Jev/Jev annotations while the checker stays identical; score annotation fidelity separately. No model supplies a self-issued proof. The open decision is which recurring transformations justify reviewed fields at all; the cases now allow that question to be tested without a theorem-proving stack or a universal memory schema.
