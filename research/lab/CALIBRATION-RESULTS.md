# Calibration 004 results: evidence, attribution and writing boundaries

Completed the frozen **14-call local diagnostic** on October 10, 2026 (03:02–03:03 UTC October 11): twelve reader calls and two writer calls. All requests used `mlx-community/Qwen3-30B-A3B-Instruct-2507-4bit`. No Jev call, retry, replacement sample or production change was made.

**The evaluation now exposes distinguishable failures; it does not establish a reliable memory method.** Empty evidence produced appropriate abstention, but related background sometimes became an answer to a different historical event. Valid reference identifiers did not prevent wrong attribution. One writer also turned its current compression assignment into supposed historical user intent.

The [protocol](CALIBRATION.md) and [staged plan](ROUND-004-PLAN.md) explain the boundaries. These are three previously used development histories, not fresh held-out evidence. Complete inputs preserve their prior coverage: two chronological prefixes and one complete eligible dialogue. Counterfactuals are explicitly recorded derivatives; native transcripts remain unchanged.

## What the reader did

| Evidence condition | Observed behavior across three questions |
| --- | --- |
| Empty | All three appropriately abstained. |
| Decisive evidence removed | One recognized the missing target; two substituted other historical events. The useful uncertain response still violated the requested response schema. |
| Changed speaker attribution | Two followed the changed speaker. One explicitly called its cited assistant statement a user statement. One of the faithful answers violated the schema. |
| Complete prepared source | Useful content was recovered, but citations, event/actor distinctions and completeness still failed in different ways. No blanket full-source success claim is justified. |

The three cases make the distinctions concrete:

- **A, next coaching review:** with complete evidence, the reader remembered the right material and selecting person but cited a different document-writing request and generic help. With the decisive request removed, it turned earlier entry-based analysis into the next review selection and invented an external/synthetic input supposedly replaced. With the final selection changed to the assistant, its content followed that change correctly.
- **B, replacement experiment:** the complete-source answer retained the greeting task, originating user and workflow purpose, but omitted the explicit scope-growth concern and failed to cite the originating turn. The removal response recognized that the task, speaker and reason were unavailable. In the attribution derivative, it cited `B621` and called the speaker the user even though the delivered segment explicitly said assistant.
- **C, temporary implementation:** the complete-source answer mixed the user's preference with the assistant's implementation and added an unstated “soon” to the expected provider switch. It did not clearly identify the preference's origin. When the preference was removed, the reader answered using an earlier compatibility fix and its technical reason. Those background details were present; they did not answer the question about the later personal preference. The attribution derivative correctly followed the assistant's recommendation.

This is an event-and-relationship problem as well as a fact-retrieval problem: an accurate detail can become a wrong answer when attached to the wrong time, speaker or request. That is an interpretation of these particular outputs, not a measured general failure rate.

## Format, references and meaning remain separate

Nine of twelve reader outputs satisfied the frozen schema. Two A outputs omitted the required `unknown` field; B's removal output combined `status: answer` with nonempty unknowns. All raw responses remain intact. Manual semantic inspection of a malformed response does not retroactively make it valid.

All **69 submitted reference occurrences** resolved to delivered segments, including those in schema-invalid outputs. That did not establish support. The B attribution error cites the very passage whose speaker it misidentifies. A complete cites real passages that do not establish the final selection. C removed cites a real event that is outside the question's time scope. Empty abstentions contain no references and are not positive-citation successes.

The original questions, controls and nine authored scoring examples were independently reviewed before calls. Review clarified one ambiguity: B now asks who **first introduced** the replacement, separating origination from the assistant's subsequent repetition. The final draft passed 2,801 structural/provenance assertions before it was frozen.

After inference, root and a separate agent reviewed all fourteen raw outputs. Both identified the same central failures. A narrow scoring difference remains visible: for C complete, root counted partial preference-origin coverage because the user was named as the source of switching intent; the reviewer counted that preference origin absent because implementation authorship is a different matter. Both reject treating this as an unambiguous explicit wrong-speaker assertion. Both also mark B's compound reason as partially preserved. No single accuracy percentage hides these boundaries. These were agent reviews within the same harness, not blinded human or cross-model validation.

## What the two writers did

The pair used the same short historical help/request excerpt and the unchanged prior compression prompt. The user's final request was expressed once imperatively and once declaratively. No future question or scoring rubric accompanied either request.

Neither output performed a new coaching review or asserted that the historical review was completed. The short pair therefore **did not reproduce the prior long-history task-continuation failure**.

The imperative output nevertheless introduced a different serious error. It began by preserving the review request, then invented a historical request to create compact memory, claimed the user requested memory only, and said the user did not ask for review output. That imports the current compression assignment into remembered history and contradicts the actual historical request. It also added an unstated preference for concise output.

The declarative output preserved the main request more cleanly, but still elaborated the scope and inferred immediate timing without explicit support. Its claim that no cadence command was requested is ambiguous between literal command syntax and selecting review mode; that is not forced into a definite error. Its declaration that it invented no facts is not a validation result.

| Writer input | Words in output | Reported output tokens | Observation |
| --- | ---: | ---: | --- |
| Imperative | 327 | 478 | Preserved core request initially, then contradicted it and mixed current instructions into history. |
| Declarative | 221 | 274 | Preserved core request more cleanly; unsupported elaboration remained. |

One output per wording cannot establish a stable wording effect, isolate grammatical mood from other wording changes, or explain the old long-context failure. Neither wording is certified as a remedy.

## Accounting and reproducibility

| Stage | Calls | Reported input tokens | Reported output tokens | Sum of request elapsed time |
| --- | ---: | ---: | ---: | ---: |
| Reader | 12 | 149,128 | 1,452 | 93.21 s |
| Writer | 2 | 926 | 752 | 8.41 s |
| Total | 14 | 150,054 | 2,204 | 101.63 s |

No transport/model-identity failure or truncated output occurred. All calls reported input/output usage. Cache usage was reported for thirteen calls, totaling 51,852 cached input tokens; one call omitted that detail. Timing is descriptive, not a controlled comparison. The endpoint exposed a model identifier, not a frozen weight revision.

The runner and tests are [calibration.ts](calibration.ts) and [calibration.test.ts](calibration.test.ts). The laboratory suite passed **77 tests**, including twelve new mocked calibration tests. Those tests made no inference calls. An independent pre-run code review accepted the request projection, call limit and evidence handling. A separate post-run audit passed **147 accounting assertions**, checking the frozen requests, responses, model identity, usage, references and completion records.

The private run is `calibration-004-tdpcvk6m` under `~/Library/Caches/circadian-research/`. It contains final fixtures, native/source provenance, reviewed mocks, transformations and their reproducer, pre-run acceptance, exact requests, raw responses, parsed results, semantic reviews, the audit and final acceptance. The raw real conversations stay outside the repository. Reproduction requires those authorized private inputs; the public runner alone does not recreate them.

- Final fixture SHA256: `442f9751adf5bf703de068cf336aebc24ad26ae598d8d8c41e15c5dd180c7527`
- Frozen manifest SHA256: `342434f48fd319a7e75fdc3aee2f2313f9973f4b1cf40c34f67150a7e8ef3780`

Existing attempts cannot be overwritten. The fourteen-call manifest is complete and has no remaining inference budget.

## Progression decision

**Pass the instrument gate and prepare the separate writing comparison.** No fixture repair or rerun is needed. Clear model failures are useful observations here. Preserve the distinction between whole-source correctness, support from the cited passage, correct event attribution, uncertainty and format compliance.

The next comparison remains prior prose, stronger historical boundaries in prose, and the same substantive requirements in minimal evidence-linked records, under equal hard token ceilings. Review whole memories for unsupported additions as well as answers to independently written questions. The current results do not prove that records, more instructions, or richer mathematics will solve these failures.

A preparatory shortlist now contains three new candidate families: design research (97 visible turns), system readiness (79), and a new weekly reflection (14). Native and rendered-source hashes were checked. The reflection includes personal/family/planning material but also quoted technical material and earlier-week carry-forward; those dependencies need partition review. The largest candidate exceeds the prior source cap. Selection, coverage, questions and the next call budget are **not yet frozen**, and no writing-comparison call has run.

Jev remains a later matched-policy comparison with its existing authorization. It was not needed or tested in this diagnostic. Complete long-history replay likewise remains a separate later experiment. Circadian's default lifecycle and extension architecture are unchanged.
