**Lead finding.** The reader prompt makes the observed handoff failures close to inevitable. It tells the reader that operation results are "fallible derivations" that "do not override contrary source text or establish missing facts," requires every claim to cite source IDs, and forbids citing operation IDs (`run/requests.json:15`). Under that contract, a bare `{status: conflict, assignmentsExamined: 8}` is uncitable and untrusted, so abstaining was the compliant response. The scheduler returned the correct window with `reasons: []` (`requests.json:2811`), so a reader that wanted to explain had to invent reasons and cite sources for them. Your handoff question answers itself: yes, the protocol asked the reader to reconstruct a justification the operation withheld, while prohibiting the one citation that would have been honest. Fix that before changing models, caps or extractors.

A second structural point. Every arm received full sources, and the user message repeats source text inside `states` and again inside the view supplement. Proposals 01, 04 and 05 were therefore tested in a format that cannot show their benefit: a view with no budget pressure, an aid with no repeated task, an occasion with no later recall. Their "no demonstrated benefit" rows are untested, not negative. I would not rerun those three in the consumption format at all.

## Remedies that address the failures, and ones that move them

**Address.** Giving each operation an explanation object and making it citable as a derivation. Separating scores into factual error, unsupported elaboration, required-detail omission, uncertainty, citation and serialization, with the pass gate on the first two plus uncertainty. Aligning rubrics with the question asked, so Tari's handles and recording-location contrasts become optional-detail columns. Calibrating the output contract on disjoint cases with the exact prompt. Testing 01, 04 and 05 at their real boundaries.

**Move or hide.** A larger token cap without diagnosis. A stronger reader as the first move, because the handoff defect would survive it. Rescoring 005. A full factorial.

**Partly both.** The full-model extractor. It addresses a real gap, since 005 never tested extraction at all: annotations were reviewed and Jev chose among frozen variants. But it will not fix consumption failures, and it introduces the risk below.

## The extractor, and Jev's role

Adopt the extractor as the subject of its own fidelity stage, not as a pipeline component assumed to work. Its benefit is that it is the only way to test the capture-time contract: structure produced before any question exists. Its risk is specific and already observed in this programme: in 003 and 004 the same model class imported the current task into history and misattributed speakers beside valid citations. An extractor that does that produces a coherent, schema-valid, span-cited structure that a deterministic checker then endorses with mechanical authority. JSON validity and substring presence do not establish entailment, and the checkers were designed on that premise.

Jev as used was neither wrong nor necessary. It chose correctly among predeclared variants, which is a task built to be matchable. In an extractor design its narrow, honest place is span verification: a yes/no choice per extracted field, "does this span support this value," made by a different model from the extractor. That supplies some independence without becoming infrastructure, and it is optional. It should not be the extractor, the gate on every memory, or the judge.

The same local model for extraction and reading is acceptable for a first fidelity stage because that stage compares extraction to reviewed gold, not to the reader. Dependence matters at the consumption stage; measure it there with one different reviewer model on the subset where extractor and reader agree against gold.

## Per-mechanism extractor contract

| Mechanism | Extractor emits (with spans) | Stays deterministic | Must leave unknown | Sees question? | Smallest benefit test |
|---|---|---|---|---|---|
| 01 | Claim, qualifications, origin scope, open-disagreement edges | Restrict, rank, budget, coverage, expand | Scope if unstated; disagreement unless both sides present | No | Reader gets view at a budget that excludes sources versus plain prefix at the same budget; measure qualifier survival and expansion requests |
| 02 | Accounts with subject, property, values, each dimension typed known, unknown, unrestricted or irrelevant; alignment proposals | compareContexts, checkJoint | Name alignment; unspecified dimensions never universal | Accounts no; joint-constraint formulation yes, labelled task-aware | Operation returns the constraint IDs and implication chain; reader may cite it; measure explain-versus-abstain |
| 03 | Reports, attributions, occasions, settings, recording location, subjects, identity proposals | composeReports | Speaker when not explicit; identity | No | Per-field agreement with gold, speaker first; then by/about separation downstream |
| 04 | Windows, preferences, place observations, intention, asOf | plan, instantiate | Missing participant availability | Yes by nature, labelled | Operation returns rejected windows and why; second task with changed inputs; measure invented reasons with and without the explanation |
| 05 | Occasion, evidenced participants, mentioned, co-presence, interpretations with author and question ID | jointOccasions, recallOccasion | Participation for anyone merely mentioned, never absent | No | Extract at T1, question at T2; measure unknown versus absent, the error all three arms made |
| 06 | Five fields for old and candidate, unknown when unrepresented, quoted refs | checkPresentation | Everything not in the text | No | Candidate rewrites produced by the model, then checked; measure reader overclaiming when the guarantee string is present |

The extractor should refuse rather than fill: an empty field with reason beats a plausible value.

## Smallest staged comparison

**Stage 0, contract calibration, no study.** Eight disjoint cases, the exact reader prompt, two formats: current JSON-only, and prose answer followed by a short JSON block that is parsed while the prose is graded. Measure malformed rate only. Freeze the better format. Decision on reader: start with the available one; if malformed exceeds one in ten after calibration, run the same eight cases on one different reader as a diagnosis before any study. Do not assume the cap is the cause; the repeated-text pattern at low temperature suggests the model looping while forcing explanation into claim strings.

**Stage 1, extraction fidelity, no reader.** Run the question-blind extractor on the 24 existing sources, whose reviewed annotations already exist as gold. Score per field, with speaker, participation and absence as named columns. Optional second arm: extractor plus Jev span verification. About 24 to 48 calls. This isolates extraction loss from everything else. Stopping gate: predeclared per-field agreement, and zero cases where unrecorded becomes absent. If the gate fails, the extractor is not ready, manual annotation remains the ceiling, and nothing else runs.

**Stage 2, consumption with repaired handoff.** Twelve new held-out cases authored after the extractor prompt is frozen, limited to 02, 03 and 06, which are consumption mechanisms. Arms:

- A′: sources, then a free-form analysis call whose prose is handed to the reader. The competent full-model alternative, matched on call count.
- B: sources, reviewed annotations, operation result with explanation, citable. The diagnostic ceiling.
- C: sources, extracted annotations, operation result with explanation, citable. The real pipeline.

A′ versus B bounds what structure plus computation can add. B versus C is extraction loss. If C beats A′ on a proposal, add D, extracted annotations without the operation, to separate deterministic computation from structured presentation. Thirty-six reader calls plus twelve extractions, plus conditional D. Reporting cost: extraction is per source, reading is per question; report both, and amortize honestly rather than charging extraction to every answer.

**Stage 3, boundary tests for 01, 04 and 05**, each as its own small design from the table above, only after Stage 1 passes.

Scoring: two graders, the blinded agent and a human spot-check of twelve answers, with disagreement reported. Serialization is a column, never the gate. Required detail beyond the question is optional-detail, never the gate. One observation per case is acceptable if cases are held out; two decoding repeats add less than twelve new cases.

## Where I disagree with the parent

Concern 1 undersells the problem. Calibration matters, but the decisive defect is the citation and trust contract for operation output, which is a design error rather than a measurement one. Concern 5 is right about dependence, but it does not block Stage 1, where the comparator is gold. Concern 7's factorial is avoidable with the three arms above and a conditional fourth. And the 005 assessment's "no demonstrated benefit" wording for 01, 04 and 05 should be revised to "not testable in this format."

## The strongest reason not to adopt the extractor

It launders the writer's known failure through a checker. A fabricated `participant` or `speaker`, cited to a real span that does not entail it, becomes a conflict verdict or a preservation pass with the authority of deterministic code, and a reader told to trust derivations will repeat it. That is worse than the current state, where errors stay visible as prose. What would change my advice: Stage 1 agreement on speaker and participation fields at the predeclared level on held-out sources, zero unrecorded-to-absent conversions, and a span-verification arm that catches the extractor's remaining errors at a measured rate. With that evidence the extractor earns its place as an optional capture-time provider for 02, 03 and 06. Without it, reviewed annotation stays the ceiling and the honest baseline.