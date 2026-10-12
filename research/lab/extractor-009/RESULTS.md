# Local extraction repair: completed assessment

**The laboratory now executes and records the full experiment. The additions have not all met their readiness requirements.** This session completed 108 study calls across two declared runs, checked every output independently, and preserved the failed first attempt. The local model was sufficient to run the work; no remote provider or paid endpoint was needed.

The immediate engineering result is a smaller, working research interface: code owns bookkeeping; the model owns uncertain interpretation; prose and structured conditions have separate formatting instructions; deterministic validation and source-grounded review decide different things. These changes are isolated under `research/`. Circadian's working lifecycle and private memory were not modified.

## What changed and why

- **Input contract:** source IDs, revisions, evidence paths and clock conversion moved into code. The model extracts meaning instead of reconstructing redundant metadata.
- **Controls:** both forms receive the same sources and semantic assignment. Prose receives no schema command. Future questions and scoring data are withheld except the explicitly task-aware comparison/planning assignments.
- **Consumer boundary:** generated provenance containing full source text stays out of reader packets. Correct answers must be supported by the memory actually shown.
- **Execution:** fixed local model/settings, independent pre-run inspection, hashed inputs, one start, bounded calls, raw receipts and no retries or hidden repairs. Rejected extractions remain visible while the remaining diagnostic cases still run.
- **Serving:** the original native grammar blocked the service; the string-limit repair made it run. A second bounded comparison removed native grammar entirely while retaining the same strict local validator. Capability support is no longer treated as evidence that a serving mode improves the task.
- **Assessment:** source meaning, exact contract acceptance, operation output, literal answer completeness and packet support are reported separately. The parent owns completion and review; routine execution decisions do not return to the operator.

The [operating document](../extractor-008/OPERATIONS.md) and [protocol](PROTOCOL.md) codify these rules. The runner enforces the mechanical parts. Human/model semantic review is explicitly an evidentiary process, not an automatic truth guarantee.

## Actual results

| Measure | 008: native grammar | 009: ordinary JSON + same validator |
|---|---:|---:|
| Cases | 18 | Same 18, now exposed |
| New calls | 72: two preparation/reader forms | 36: structured preparation/reader only |
| Consumable structured records | 13/18 | 15/18 |
| Structured preparations preserving assigned meaning | 16/18 | 15/18 |
| Structured reader answers satisfying the question | 8/18 | 12/18 |
| Cases passing every recorded acceptance dimension | 8/18 | 11/18 |
| Structured extraction request time, summed | 103.639 s | 30.604 s |

All 108 requests returned HTTP 200, the expected local model and `stop`. No output exhausted its token cap. 008's historical prose reader answered 17/18 questions correctly; its preparations preserved assigned meaning in 11/18 cases. That comparator was not rerun in 009 and is not independent new evidence. Correct final answers sometimes coexist with an incorrect prepared relationship, so reader accuracy alone does not certify memory fidelity.

The earlier 006 run consumed only 1/8 structured outputs. On those same eight exposed cases, 009 consumed 8/8. This is engineering regression evidence after multiple interface/settings changes, not an isolated estimate of one improvement's effect. The ten newly authored confirmation cases were fresh only in 008; by 009 all 18 cases were development material.

009 made 36 new requests, reported 23,093 input tokens and 3,080 output tokens, and took 45.558 seconds summed request time. The source/configuration/reader instructions were inherited. The changes were removal of `response_format` and the system clause claiming the server constrains syntax. This tests that serving policy; it does not prove the internal cause of every output difference. The misspellings in two transformation records recurred without grammar enforcement.

## The original six additions

| Addition | Working evidence in 009 | Remaining boundary |
|---|---|---|
| 01 — Coordinated views | Both cases retained their policy conditions and answered correctly. | Retrieval/expansion usefulness and context savings remain unmeasured. |
| 02 — Contextual compatibility | All three inputs were usable; different-day compatibility and same-day conflict computed correctly. | One answer lacked named maintenance/safety-note attribution because the prepared contract retained opaque IDs but discarded those labels. The contract needs that meaning if later questions ask for it. |
| 03 — Typed relations | The two explicit attribution cases worked. | In both unknown-setting cases, extraction copied the recording location into the event-location field. The reader repeated it. A valid typed record can still encode a false relation. |
| 04 — Multi-input operations | Both cases captured both participants; the actual operation and reader found 13:20–13:45 and 14:26–14:49, including the current-time constraint. | One otherwise correct answer added gendered pronouns unsupported by the source. It passes requested planning meaning but fails strict whole-answer support. This is separate from a scheduling error. |
| 05 — Higher-order relations | The lantern case kept participants separate from a later observer and answered correctly. | The kite case still promoted the instructions' author into the participant list despite unknown attendance. Validation rejected the overlapping participant/mention sets. |
| 06 — Checked transformations | Three records were usable. The actual paired checker detected the change from “might prefer” to “always prefer” as a modality difference. | Two confirmation texts produced damaged exact phrases and were rejected. Their harmless/harmful pair checks remain unavailable; no blanket meaning-preservation claim follows from the one working pair. |

All six have an executed path through their actual prototype APIs across these records. Several paths work; the table identifies where model-derived inputs still fail. Passing a prototype operation on an annotation does not establish the annotation's truth or the operation's value over ordinary memory.

## What is now the research operating baseline

Use the existing local endpoint with ordinary JSON generation and strict post-generation validation as the next research starting point. It is simpler to operate and was faster/more consumable here. That choice does **not** imply universal superiority: the grammar condition preserved unknown event locations in its annotations where ordinary generation did not. Every addition keeps its own case-level failures visible.

The current experiment is complete. There is no automatic loop searching for a passing result and no promotion into production. Any subsequent benefit study must preserve the ordinary Circadian baseline when an optional addition rejects its input. The unavailable-memory marker used here isolates extraction failure for measurement; it is not a production fallback policy. No extension should erase working baseline memory merely because its augmentation failed.

The remaining engineering targets are specific: retain requested source labels, require affirmative support for an event location or participation, avoid asking the model to recopy exact quotes when code can bind a selected source span, and keep unasked assertions out of readers. These are recorded limitations and next design inputs, not claimed implemented repairs or a reason to switch providers. Further changes need new reviewed inputs and fresh confirmation evidence; the current failures must remain in the record.

## Evidence and verification

Three independent evaluators reviewed all 36 outputs with model, condition and cohort labels withheld; formatting limits blinding. Their reports and first-pass scores are preserved. The parent inspected all reports and accepted the decisions. The named-note and failed-preparation explanation boundaries match 009's documented interpretation and the independently adjudicated 008 boundaries. The pronoun issue is explicitly retained as a peripheral unsupported addition, not a planning failure. No score, output or source was repaired to pass.

A final independent audit identified uneven treatment of incidental pronouns: 008's corresponding planning answer also used an unsupported pronoun but retained packet-support credit. That case already failed required knowledge and preparation completeness, so the strict 8/18 versus 11/18 counts do not change. The original judgments are preserved; fine-grained packet-support totals should not be treated as a precise comparison of minor wording defects across reviewers.

The repaired instrument's focused suite passed 71 tests with 982 assertions. The full repository check before the serving-only delta passed 970 tests, 21 skipped and 0 failed; the six added projection tests and combined focused suite passed afterward. The 009 runner was independently inspected, imported without dispatch, verified against frozen dependencies, and exercised by its complete 36-call run. [Verification](VERIFICATION.json) records request/score coverage, preserved historical files, hash seals and source boundaries.

Total request accounting for this repair effort is separate and explicit: two successful non-study serving probes, one failed 007 study request, 72 completed 008 study requests, and 36 completed 009 study requests: 111 inference attempts. Discovery GETs, service recovery and independent reviewer work are separate. All inference in these runs used the existing local endpoint. No new dependency, service, database or remote inference was introduced; the existing registered service was restarted once to recover from the blocked compiler.
