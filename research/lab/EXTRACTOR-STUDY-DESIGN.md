# Full-model extraction for six optional Circadian additions

**Status: peer-refined proposal; no new benchmark or production integration executed.** This design follows the completed [Behavioral 005 assessment](behavioral-005/ASSESSMENT.md), the [outside peer response](../peer-consultation/PEER-005-REDESIGN.md), its [corrective follow-up](../peer-consultation/PEER-005-REDESIGN-RESOLUTION.md), and a [source-contract audit](EXTRACTOR-CONTRACT-AUDIT.md). It is a concrete basis for the next protocol, not a claim that the proposed extractor, decoder, explanation adapters or runtime toggles already exist.

## Decision and purpose

Test a full language model as an optional **producer of source-grounded candidate annotations**. It can identify relationships, circumstances, uncertainty and useful combinations, and emit the information needed by each of the six operations. It is not restricted to choosing among prewritten answers. This would test a missing capability: producing the representation from the source instead of receiving it by hand.

Jev matched 24/24 bounded choices in 005. The study does not establish that it is a bad classifier; it does establish neither automatic extraction nor sufficient downstream value. Omit Jev from this proposed first extractor study to isolate the new role. A later source-support classifier would be another untested component, not an assumed verifier.

The proposed path is:

```text
source bundle → full-model candidate extraction → bounded decoding/state binding
              → one existing optional operation → appropriate consumer
```

The experiment distinguishes extraction fidelity, operation correctness and consumer behavior. An operation remains correct only relative to its supplied representation; a verified calculation cannot authenticate a fabricated speaker or participant. All six remain in scope. Circadian's default lifecycle remains the foundation, and all new work stays in research until a separate integration decision.

## What changes, and why

| Concern from 005 | Proposed remedy | What it does not establish |
| --- | --- | --- |
| 29/72 output-contract failures | Calibrate exact producer and consumer contracts on separate easy cases; short prose for human-facing answers, bounded structured data where a machine actually needs it. | A larger output cap or another model is not a demonstrated fix. |
| Correct answers failed hidden extra-detail requirements | Required content must follow from the actual question/task. Separate factual correctness, unsupported assertions, uncertainty, optional detail, citations and syntax. | Free prose does not make unsupported explanations acceptable. |
| Correct operation result followed by invented explanation | Supply a citable derivation record with exact input references, actual result and explicit limits. Supply a checked witness only where implemented; otherwise say that no explanation trace was produced. | The old handoff is a plausible contributor, not a proven cause of failures. |
| Additional text may add work without adding value | Compare plain LLM preparation, the extracted artifact alone and the same artifact with the operation. Respect each consumer's total context budget. | A full-model improvement alone does not establish value from mathematical structure. |
| Source references gave false confidence | Independently score whether source evidence supports each extracted field, including speaker, conditions and unknowns. Exact quote matching is only one mechanical check. | Valid JSON, a real source ID or a matching quote does not establish entailment. |
| Generic Q&A missed budget, reuse and continuity | Give all six mechanism-specific consumer tests, including context pressure, repeated tasks, delayed questions and transformation decisions. | This small study still cannot validate general-purpose lifelong memory. |

## Authority and information boundaries

Use a fresh stateless preparation call per selected source bundle/version and proposal. The same local model can fill both preparation and reading roles initially; separate calls do not make their errors independent. Use a different blinded peer for source-grounded evaluation and report disagreements explicitly. Do not impose an unrequested human review task on the operator.

The existing local model listing was fetched for this consultation and includes `mlx-community/Qwen3-30B-A3B-Instruct-2507-4bit`, the 005 reader. It is a candidate starting model, not a quality guarantee. Recheck served identity before execution; freeze actual prompts, settings and supported limits after calibration. No unknown weight revision or constrained-decoding capability is assumed.

The model may emit candidate meaning, supporting source IDs/quotes, concise rationales and explicit unresolved items. The caller supplies actual source bytes, revisions/digests, availability, eligibility, current time, budgets and runtime state. Source IDs must come from the enumerated manifest; output cannot authorize arbitrary file reads. No generated value can declare an identity reviewed, an entire memory population complete or an aid currently applicable merely by asserting it.

Each prototype needs a small bounded runtime decoder before arbitrary model JSON reaches it. Missing information becomes the API's documented unknown/missing representation only when that mapping is valid. Malformed structures are rejected and counted, not silently normalized into apparently valid facts. Unknown, absent, false, empty and unrestricted are not interchangeable. For example, missing quiet-preference evidence cannot become `quiet: false`, and an empty finite domain is not an unknown domain.

Where an API expects reviewed identities or contextual alignment, the minimum experiment uses explicitly supplied common fixture identities/alignment rules, disclosed to all relevant arms. Novel model guesses remain unreviewed and are not silently promoted. This limits the automatic-identity/alignment claim; it does not establish a production acceptance policy.

## Six contracts and proper consumers

| Addition | Full-model preparation | Timing and caller boundary | Primary benefit test |
| --- | --- | --- | --- |
| **01 Coordinated views** | Extract claims, qualifications and supported context; propose unresolved disagreement links without equating an observed event with a preference conflict. | Capture before future questions. Scope origin and completeness come from supplied metadata; query/ranking policy is separate and equally declared across arms. | Under the same total context budget, compare ordinary recall, plain prepared memory, a simple rendering of extracted records and the bounded view. Full sources are available through the same one-expansion allowance, never hidden in the initial view. Score retained meaning and expansion cost. |
| **02 Contextual compatibility** | Extract accounts and explicit dimensions/constraints with source spans. Preserve unresolved dimensions and assumptions. | Account capture can be question-blind. Formulating a particular joint-constraint problem is task-aware and must be labeled; same visibility in plain and structured preparation. Reviewed alignment is a supplied experimental boundary. | Distinguish satisfiable, incompatible and unresolved situations. Check the actual finite result and whether the consumer explains it without inventing assumptions. |
| **03 Typed relations** | Extract speaker, subject, report, occasion and setting separately from where a note was recorded. | Capture before future questions. Stable IDs and reviewed identities come from the common fixture manifest; ambiguous identities remain unresolved. | Later by/about questions and location/attribution traps; score field fidelity as well as supported answers. |
| **04 Reusable operations** | Extract source-backed slots for the existing `shared-afternoon` recipe: requirements, intervals, observations and duration. Do not generate executable recipes. | Task-aware preparation is allowed. Caller supplies current time, applicability and retirement; changed source versions trigger new preparation rather than reusing stale bindings. | Two task steps with changed inputs/state: useful reuse, stale/inapplicable aid handling and total preparation/reading cost. This tests one scheduling aid, not autonomous mnemonic invention or every operad-like operation. |
| **05 Joint experiences** | Extract occasion, evidenced participation, mentions and attributed interpretations with uncertainty. Propose links without certifying shared occasion/question identity. | Capture at T1, update with a later account at T2, then reveal held-out questions. Common accepted IDs remain caller-owned. | Retain changing interpretations and distinguish unknown attendance from absence across two later recall questions. Reward faithful continuity, not just planning success. |
| **06 Checked transformations** | Annotate the five supported fields from old and candidate text independently, with quoted support. | Transformation-time, not generic future-question-blind capture. Use fixed reviewed good/bad candidate texts; no candidate-generation model in this round. Caller owns actual bytes, rule and mode. | Directly measure detection of specified harmful changes and false alarms on harmless ones. Use pass-for-named-properties/reject/needs-semantic-review outcomes; free-prose meaning never becomes mechanically certified. Do not reduce this to a reader repeating a guarantee string. |

## Fixed comparison arms

All five are predeclared for every proposal. No winner-only ablation is added after outcomes are seen.

| Arm | Preparation | Consumer input/action | Interpretation |
| --- | --- | --- | --- |
| **A — ordinary** | None | Actual ordinary recall/evidence route under the declared consumer budget. | Practical reference, not an asserted lower bound on performance. |
| **P — plain full-model analysis** | One preparation call per bundle/version, same evidence visibility and task timing as X. | Useful source-grounded prose instead of the structured mechanism. | Whether extra analysis already supplies the benefit. |
| **X− — extracted, no operation** | The exact frozen extraction also used by X. | The same validated candidate information through a simple fixed presentation, with the selected operation omitted. | Comparison with X tests operation/consumer contribution conditional on the same extraction. |
| **X — extracted plus operation** | Full-model extraction, decoding and caller state binding. | Actual optional operation and a faithful, citable result where relevant. | Candidate complete workflow. |
| **R — reviewed annotations plus operation** | Independently reviewed source-based fields. | Same operation and consumer policy as X. | Diagnostic extraction comparator; not a guaranteed performance ceiling. |

These are policies, not five identical giant prompts. In 01 every arm fits the same initial budget and has equal expansion permission. In 06 the operation is the guard/check decision, so an unnecessary reader call is omitted. No full source packet is secretly attached to a supposedly compact view. X− and X share identical extraction bytes in each comparison; no new extraction call is hidden in the ablation.

P versus X measures two workflows with comparable preparation-call counts, not equal internal compute. R versus X changes annotation provenance/content, not only one scalar variable. These distinctions stay explicit. A citable explanation adapter changes the tested workflow; without a separate explanation ablation we cannot attribute an improvement uniquely to it.

## Finite stages and proposed ceiling

This is a proposed maximum allocation, not a started run or a target to exhaust. A frozen execution protocol must instantiate the fixtures, settings, exact requests and per-case scores before any held-out calls.

1. **Contract calibration: at most 32 calls.** Eight disjoint development bundles cover all six schemas and difficult unknown handling. Each has at most one structured-preparation call, one plain-preparation call and two consumer probes. No automatic model swap or expanding cap sweep. Machine-consumed outputs must decode; semantic easy controls must be assessed too. If the instrument cannot deliver usable outputs, stop with a diagnosis instead of opening the study.
2. **Extraction development: at most 24 calls.** Reuse the old 24 source bundles as disclosed development material. Independently author field gold from source text; deliberately misleading 005 annotations are not gold. Score required/forbidden/unknown fields, source support and decoder failures. Preserve mistakes and stop promotion of an affected proposal when critical identity/participation/uncertainty errors remain. A source-only extractor cannot be claimed to resist planted annotations it never saw; contaminated-annotation recovery would be a separate exposure condition.
3. **Held-out comparison: 18 new scenarios, three per proposal, five arms, two consumer repeats = 180 consumer trials.** Cases cover useful, ordinary and challenge behavior; challenge coverage must include missing evidence and a misleading inference, with the coverage matrix accepted before freeze. Preparation is frozen before future questions where the contract requires it. Old cases never become held-out evidence again.

Count requests rather than treating every trial as one call. Proposed source-package allocation: one package for each 01/02/03 scenario, two ordered versions for each 04/05 scenario, and separate old/candidate extraction packages for each 06 scenario: **27 packages**. One extraction and one plain-preparation call per package gives **54 preparation calls**. Reuse those artifacts across the two consumer repeats; this measures consumer variability, not extraction sampling variance.

Each 01 trial permits at most one expansion continuation; each 04 and 05 trial has at most two task/recall steps. Each 02/03/06 trial permits one consumer step. Upper bound: **270 consumer model calls**, including slots that a deterministic 06 consumer may not use. Thus the held-out ceiling is **324 calls**, and the entire proposed sequence is **380 study calls** including calibration/development. A retry, format repair, extra extraction, alternative model or extra continuation cannot be silently added. If a contract requires more, revise the plan before execution. Review/scoring computation is separately declared and recorded rather than concealed in these endpoint-call counts.

Keep source versions chronological and equal across arms. Freeze each later preparation before revealing its corresponding questions. For 06, annotation of old and candidate occurs independently; the transformation consumer later receives both. Three cases and two repeats remain diagnostic, not a reliable population estimate.

## Acceptance, scoring and stopping

Before held-out execution, independent reviewers accept source-based field gold, literal question requirements, benign and adversarial controls, operation/decoder behavior and the exact consumer contract. A useful answer is not failed for an incidental unasked detail. A harmful unsupported explanation still fails semantic acceptance even if its first sentence is correct.

Separate extraction fidelity, structural decoding, operation outcome, factual answer quality, unsupported additions, uncertainty, citation support, serialization and cost. Citations may name original sources or explicitly labeled derivations, but a derivation must expose its input assumptions and exact checked scope. It cannot prove its own extracted inputs true.

Malformed machine inputs remain failures. Human-facing prose is graded for meaning without gratuitous JSON requirements. Where the real consumer requires a machine decision, its serialization is part of acceptance. Missing or rejected extraction follows one frozen fallback/no-result policy applied equally to X and X−; failed cases and all spent calls remain in the unconditional totals. Do not report only the successful-extraction subset as end-to-end success.

Use arm-blinded source-grounded semantic review with a separately authored rubric and independent adjudication of disputed judgments. All mandatory criteria, unacceptable-error categories and budgets are fixed before held-out inference. Report the two repeats separately and flag disagreement as instability; do not conceal it in an average. Common decoder/transport defects stop the affected run. Predeclared semantic failures block promotion and cannot trigger an open-ended repair loop.

Report actual preparation and consumer tokens/calls/latency separately. Count source expansion, both steps of reuse/continuity cases, rejected candidates and any permitted fallback. Report cold first-use cost as well as observed reuse cost; do not amortize over hypothetical future uses. Reader/schema/annotation failures remain separate from transport/model-identity failures.

## Parent resolution of peer advice

Accepted: full-model extraction is worth a bounded fidelity test; Jev is optional; separate stage scores; source-backed derivation handoff; all-six consumer-specific tests; a plain-analysis alternative; reviewed-annotation diagnostics; fixed operation ablation; no production framework.

Corrected with the peer: the old prompt did not force abstention or fabricated explanations; 005 tested local consumption but left principal budget/reuse/longitudinal claims untested; misleading annotations are not gold; 06 tests fixed transformation decisions; caller state is not extracted authority. See the preserved follow-up.

Further parent qualifications: explanation records cost implementation, context and verification effort, so they are not free. Their presence alone does not isolate their causal effect. Decoder rejection differs from missing information. Source-only extraction cannot reproduce planted annotations it never receives, so we will not claim to test that resistance. A fixed 180-trial plan needs the additional-call accounting above. Serialization remains a gate where the consumer actually requires structured data. Independent field review is an experimental reference, not a claim that live semantic acceptance has been solved.

The next concrete work, if this direction is taken, is the finite calibration instrument, six small extraction adapters and independent field/consumer fixtures under this design. No new database, mandatory startup model call, persistent capture hook or production plugin framework is required to test it.
