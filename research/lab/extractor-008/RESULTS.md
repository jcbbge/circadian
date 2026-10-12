# Repaired extractor battery 008

**The execution infrastructure worked; the full readiness requirement did not pass.** All 72 local requests completed with HTTP 200, the expected served model and `stop`. Thirteen of eighteen structured outputs were consumable. Eight cases combined a valid record, critical field checks, preserved preparation meaning and a source-correct, packet-supported reader answer.

This is research on six optional additions. The working Circadian default was not changed. The full-model extractor is the existing local `mlx-community/Qwen3-30B-A3B-Instruct-2507-4bit`, also used for reading, at temperature 0, top-p 1 and a 2,048-token output cap. No remote inference, retry, output repair or new package was used.

## What was fixed

The model now supplies semantic fields. Code supplies source IDs, revisions, evidence paths and deterministic clock conversion. Generated source references mean provenance, not entailment. Plain preparation receives the same meaning assignment without competing JSON instructions. Reader packets exclude the full source text previously carried by generated evidence envelopes. Tests cover these boundaries across all six mechanisms.

The first frozen attempt, [007](../extractor-007/RESULTS.md), blocked in the local schema-compilation path and timed out. After recovery of the existing service, this run omitted only finite string `maxLength` from the serving grammar. Full limits stayed in the prompt and local binder. A separately logged probe completed in 4.886 seconds; no failed request was replaced or hidden.

## Results

| Measure | Development: 8 cases | Fresh confirmation: 10 cases | Total |
|---|---:|---:|---:|
| Consumable structured records | 6/8 | 7/10 | 13/18 |
| Structured preparations preserving assigned meaning | 7/8 | 9/10 | 16/18 |
| Plain preparations preserving assigned meaning | 6/8 | 5/10 | 11/18 |
| Structured reader answers satisfying the question | 4/8 | 4/10 | 8/18 |
| Plain reader answers satisfying the question | 8/8 | 9/10 | 17/18 |

Meaning review accepts harmless paraphrases and typographical blemishes that do not change the assigned proposition. The strict binder separately rejects malformed/exact-quote violations. Thus a preparation can preserve meaning and still be unusable. Neither valid JSON nor apparent semantic plausibility bypasses the full acceptance requirements.

Three independent evaluators reviewed all 72 outputs against original sources and literal questions. Condition/model/cohort labels were withheld; formatting still makes blinding partial. A fourth reviewer adjudicated nine ambiguities, changing two support/severity judgments without changing any pass count. [Machine assessment](run-local/assessment.json) contains item-level scores and costs. [Adjudication](ADJUDICATION.md) explains the decisions. All first-pass scores remain.

## All six additions

| Addition | What happened | Concrete remaining issue |
|---|---|---|
| 01 — Coordinated views | Both structured preparations and readers preserved the needed qualifications. | No retrieval/expansion or context-saving benefit was tested. |
| 02 — Contextual compatibility | All three records were usable; disjoint-day and same-day comparisons executed. | One answer omitted maintenance-versus-safety note labels. The annotation/reader contract discarded those descriptive labels, so this is also an interface limitation, not simply reader failure. |
| 03 — Typed relations | All four records were usable; all critical extraction fields passed. | Both unknown-location readers promoted recording location into an expression/event location despite the correct unknown field. |
| 04 — Multi-input operations | Both outputs passed structural validation but omitted the second participant. | Exact critical checks caught the omissions. The operation reported missing inputs; readers still lost or exceeded the available planning information. |
| 05 — Higher-order relations | Both outputs preserved much of the event meaning. | Both overlapped participant and mention-only sets, so strict consumption failed. One fallback reader then mislabeled a vocabulary entry as an established participant. |
| 06 — Checked transformations | Two of five outputs were usable. | Three damaged exact source phrases; all three paired comparisons were unavailable. A meaningful proposition in rejected JSON is insufficient for a checked transformation. |

The prose control was cleanly separated from schema instructions, but its preparations still invented several relations, exclusions and planning decisions. Some readers answered correctly despite wrong or missing prepared relationships; source correctness and support by the actual packet are therefore recorded separately. The confirmation planning prose and reader both ignored the current-time constraint. A high reader pass count alone is insufficient evidence of faithful memory.

## Cost and limits

The 72 requests reported 35,411 input tokens and 6,462 output tokens; summed request time was 170.318 seconds. Structured extraction accounted for 103.639 seconds, compared with 34.633 seconds for prose preparation. These are observations of different workloads, not a matched efficiency result. The run began at `2026-10-12T05:18:56.160Z` and completed at `2026-10-12T05:21:46.597Z`.

Eight development cases were previously exposed; ten confirmation cases were independently authored before outputs. Sources are short, fictional and general-purpose. Preparation and reading share one model; ordering is fixed; each condition has one sample. This is readiness evidence, not a causal benefit ablation or a population reliability estimate. No mathematical addition was promoted into production.

The serving-policy alternative is tested separately in [009](../extractor-009/RESULTS.md): ordinary JSON generation with the same strict validation and unchanged semantic assignments. These eighteen cases become exposed development material for that comparison. This report and all 008 outputs remain unchanged.
