# Extractor calibration 006: local Qwen results

**The local endpoint worked. The extraction pipeline did not meet its readiness gate.** All 32 study requests completed successfully, but only one of eight structured preparations satisfied the current decoder and evidence contract. This diagnoses the tested extraction interface and its outputs; it does not establish that the six proposed additions are unhelpful or that a larger model is required.

This is isolated research for optional Circadian supplements. The working default, private mind, hooks and production code were not changed. No development-set expansion or held-out run followed the failed gate.

## What ran

The [sealed manifest](run-local/manifest.json) records the run beginning at `2026-10-12T04:27:29Z` (October 11 in the operator's timezone). Eight fictional, nontechnical source bundles cover all six proposals. Each received a structured preparation, a prose-requested preparation, and a separate reader call for each output: 32 calls, no retries or format repair.

Both preparation and reading used the existing local endpoint, serving `mlx-community/Qwen3-30B-A3B-Instruct-2507-4bit`. Settings were temperature 0.3, top-p 0.95 and a 2,048-token output cap. No seed control or weight revision was exposed. All responses identified the expected model and finished with `stop`; the longest completion was 515 tokens. Output-cap exhaustion is not an observed explanation for these failures. See [endpoint evidence](ENDPOINT-EVIDENCE.json) and [raw receipts](run-local/calls.jsonl).

Before cancellation, discovery used two GETs and three separately counted completion probes: one local success and two remote failures, the last a billing gate. The operator then selected local inference and cancelled the remote comparison. It received **zero study calls**, no billing or endpoint changes were made, and the temporary local credential copy was removed. Outside peer consultation and evaluator work are separate from study-call counts.

## Results by stage

| Check | Structured | Prose-requested comparator |
|---|---:|---:|
| Preparations preserving meaning and evidence fidelity | 2/8 | 5/8 |
| Preparations with a critical semantic error | 5/8 | 1/8 |
| Reader answers meeting the literal question | 2/8 | 4/8 |
| Reader answers with a critical unsupported claim | 0/8 | 3/8 |

These are descriptive counts from the [independent review](SEMANTIC-REVIEW.md), with scoring boundaries resolved in [adjudication](ADJUDICATION.md). Eight cases are not a population estimate, and paired outputs are not independent trials.

Six structured preparations were syntactically valid JSON; only one passed the full contract. Seven structured readers therefore received an explicit unavailable-memory marker and no extracted facts. Their abstentions were appropriate to that packet. One unknown-answer case passed its literal question merely by abstaining; it does not demonstrate retained memory. **Only one bundle combined usable structured extraction with a correct reader answer.** Zero hallucinations in the structured reader condition is consequently not evidence of an effective memory system.

Three preparation failures were evidence-only defects: two invented source identifiers and one fabricated verbatim quote. Their substantive propositions survived. Excluding those defects would raise preparation passes from 7/16 to 10/16, but that narrower diagnostic does not replace the declared source-fidelity requirement. Exact quote presence also did not prevent incorrect adjacent field values.

## Where each proposal stands

| Original addition | Observed behavior | What remains to establish |
|---|---|---|
| 01 — Coordinated memory views | Structured content preserved the policy, but missing scope evidence prevented consumption. The comparator reader invented a connection between independent garden and loan policies. | A small, usable extraction contract and a reader that respects record boundaries; no view benefit was measured. |
| 02 — Contextual compatibility | Structured output had malformed JSON and a false quote. Comparator preparation preserved Tuesday versus Wednesday, yet its reader called them contradictory. | Reliable contextual interpretation and a controlled test of whether the compatibility operation prevents this mistake. |
| 03 — Typed relations and composition | The clear speaker/subject case passed extraction, operation and reading. The unknown case asserted an empty subject list while also declaring subjects unknown; its comparator reader turned recording location into event location. | Broader attribution and unknown-versus-absent coverage. One successful case is a functioning path, not general validation. |
| 04 — Operations with multiple inputs | Structured extraction copied the wrong participant's availability and omitted required evidence. Prose preparation and reading found the correct 13:20–13:45 plan. | Correct input interpretation before assessing the reusable operation's contribution. A calculation cannot repair wrong inputs. |
| 05 — Higher-order relations | Structured output had malformed JSON and included a reflection's author among event participants despite unknown attendance. The comparator preserved attribution and uncertainty. | Reliable separation of event participation from later interpretation before evaluating joint-experience operations. |
| 06 — Checked memory transformations | Both independent structured extractions used wrong source IDs and put the compared paths in the person slot. The paired check was unavailable. One comparator reader lost the explicit “always” qualification. | Faithful independent representations before claiming that the transformation check catches changed meaning. It neither passed nor failed the change itself in this run. |

The successful path calls the actual prototype API. The remaining model-derived candidates did not reach their operations. Separate deterministic tests exercise those mappings with reviewed inputs; this run does not measure their downstream behavioral benefit.

## A defect in the comparison I built

The prose-requested condition retained JSON-oriented schema instructions and added an override requesting prose. Two of eight outputs still emitted schema-shaped JSON, one mixed with prose. That is a test-design defect, not a clean comparison of structured memory against ordinary prose. It is preserved in the [presentation audit](run-local/presentation-audit.json).

The structured reader also saw both the candidate and its operation result, while its comparator saw the preparation text. This was intentionally a readiness calibration, not an ablation isolating mathematical contribution. The current outputs cannot support a claim that prose wins, structure loses, or any particular operation adds value. Fixed ordering, one sample per condition, shared model roles, short sources and quotations repeating source material further limit interpretation.

## Cost and verification

| Phase | Calls | Input tokens | Output tokens | Sum of request time |
|---|---:|---:|---:|---:|
| Structured preparation | 8 | 5,541 | 2,046 | 25.581 s |
| Prose-requested preparation | 8 | 5,525 | 1,298 | 16.796 s |
| Structured reader | 8 | 2,895 | 449 | 6.876 s |
| Comparator reader | 8 | 3,090 | 663 | 8.793 s |
| Total | 32 | 17,051 | 4,456 | 58.046 s |

Tokens are service-reported usage; request time excludes review and preparation. Short unavailable-memory answers make a latency or token-efficiency comparison misleading.

The final focused checks passed **50 tests, 365 assertions**. The full repository run before the final fixture/prompt corrections passed **905 tests**, with **21 skips** and no failures. The focused suite was rerun after those corrections. Skips cover unavailable pinned mind fixtures and opt-in live-model tests. [Verification](VERIFICATION.json) records frozen hashes, receipt counts and preservation checks; [TESTS.json](TESTS.json) records the test stages.

An outside peer reviewed the pre-run design; an independent instrument reviewer verified corrections before freeze. A separate evaluator reviewed all 32 anonymized outputs against sources and literal rubrics, followed by independent adjudication of six scoring boundaries. Review identities and artifact hashes are recorded. Blinding is partial because output style can reveal a condition. No additional model samples were used to replace failures.

## Smallest justified next change

Keep the local endpoint and all six proposals. Before another declared calibration:

1. Separate shared meaning instructions from serialization instructions, so the prose condition receives no competing schema directive.
2. Let code carry source IDs and caller-owned metadata where their association is deterministic. Ask the model for uncertain interpretation and source-span selection, then validate that interpretation. Avoid asking it to regenerate redundant metadata.
3. Keep semantic tests for day conditions, speaker versus subject, recording versus event location, unknown versus absent, participant attribution and modal strength. Formatting success alone must not pass the gate.

These are proposals, not post-hoc repairs to this run. Any constrained-output support must be verified locally before relying on it. A corrected small calibration should precede the already-proposed development and held-out benefit studies. No new provider, package, database or production integration is justified by this result.
