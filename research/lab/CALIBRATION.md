# Calibration 004: free-form evidence and historical instructions

Status: protocol for the authorized initial development block in [ROUND-004-PLAN.md](ROUND-004-PLAN.md). The run-specific inputs, review acceptance, requests, settings and code hashes must be frozen before inference. The completed run is documented separately in [CALIBRATION-RESULTS.md](CALIBRATION-RESULTS.md); requirements below describe its pre-inference design.

## Purpose and boundary

Determine whether the evaluation distinguishes a supported recollection from missing evidence, incorrect attribution and historical-task continuation. The [previous experiment](REAL-SESSION-RESULTS.md) showed that multiple-choice accuracy and literal quotation containment could obscure these distinctions.

This is a 14-call development diagnostic using the same existing local model. It is not a held-out accuracy estimate, a test of an entire long conversation, or a production modification. Native transcripts and previous sealed runs stay authoritative. No selector is required in this block; its existing authorization remains available for the later, separately specified comparison.

## Twelve reader calls

Three free-form questions concern the prior histories' review request, replacement of an earlier example, and temporary implementation preference. They ask for attribution and relevant content/reasons without supplying answer alternatives. Each question has four independently reviewed evidence variants:

| Variant | Required preparation |
| --- | --- |
| Complete | Every turn of that history's previously prepared source, without rewriting |
| Empty | No evidence segments |
| Removed | Remove every occurrence or paraphrase of decisive support; record all deletions |
| Attributed | Consistently change the relevant attribution, recording rewrites and removal of incompatible repetitions |

The complete input is still the previously declared prepared source: two chronological prefixes and one complete eligible dialogue. Counterfactuals and omissions are laboratory derivatives, never revisions of native history. Unequal input length is expected; these controls diagnose interpretation and scoring, not performance at matched context length.

Each visible evidence segment has a stable identifier, a historical role and text. Private provenance maps it to original source/hash/line information or marks it as a derivative. The model sees only the question and segment identifiers, roles and text. It does not see condition names, gold, rubrics, transformation explanations, paths or scoring examples. A native role label alone is not proof of human authorship; injected guidance must not become a human preference in the gold.

Reader responses are structured free-form accounts:

```json
{
  "status": "answer",
  "claims": [{"text": "A supported statement.", "refs": ["segment-id"]}],
  "unknown": []
}
```

`partial` requires at least one claim and an explicit unknown; `abstain` has no claims and at least one unknown. Claims require references, whose existence is checked separately. An unresolved reference remains an observed failure, not an automatically repaired citation. A resolving reference does not certify the truth or entailment of its claim. There is no retrieval or hidden continuation in these calibration requests.

## Rubrics and pre-inference review

Freeze required propositions, prohibited inferences, acceptable uncertainty and supporting references for every variant. For each question, prepare three mock answers: supported, partial/uncertain, and confidently unsupported despite plausible evidence. These nine samples require independent rubric review before inference. They are not model observations and are never sent as exemplars.

An independent reviewer must establish that deletion removes all decisive support, attribution changes remain coherent, original source is reproduced accurately and each question is meaningful across conditions. A control that still contains a decisive paraphrase is not a missing-evidence control. Any ambiguity is resolved before freezing; all changes to the author draft are documented.

Model outcomes are reviewed for proposition coverage, unsupported additions, attribution/status errors, and appropriate uncertainty. Schema/reference validity are separate mechanical measures. A free-form paraphrase can be faithful without reproducing exact Markdown. A correct conclusion with a fabricated reason cannot pass merely because a reference resolves. Blanket abstention does not receive full credit when the evidence establishes an answer.

## Two writer calls

Prepare a short historical passage in two versions: an imperative request and a declarative account of the same request. Keep speaker, requested action, status and surrounding context constant. Review equivalence before inference. The same prior question-blind compression prompt is used for both; no reader question or gold accompanies the writer input.

Assess whether each output preserves the request as historical memory or starts performing it, whether attribution/scope survive, and whether new advice or completion claims appear. With one observation per version, a difference suggests a discriminator to investigate; it does not identify a general causal mechanism. Equal outcomes cannot rule out instruction sensitivity in a longer or different context.

## Execution and accounting

The selected model is the same `mlx-community/Qwen3-30B-A3B-Instruct-2507-4bit` used previously, confirmed again through the existing local models endpoint. The private `endpoint-evidence.json` records that discovery. The runner uses the existing transport; no new service, SDK or dependency is needed.

Use temperature 0.2, top-p 1, a 640-output-token reader ceiling and a 1,200-token writer ceiling. The request timeout is 60 seconds. The previous compression prompt's 600-word request remains a soft instruction; actual writer words/tokens and truncation are reported. Requested model identity and actual response identity must agree.

Freeze the 12 reader requests in seeded order, followed by the two writer requests in seeded order. The maximum is **14 study inference calls**, one per trial, with no repair retries. Mocked regression tests make no network calls. Three consecutive infrastructure/model-identity failures stop the run. Malformed or truncated model outputs remain scored failures and raw evidence; they are not grounds to conceal a completed request or replace it.

Preserve exact requests, successful responses, parsing results, finish reasons, references, usage, model IDs and elapsed times. Mark missing usage rather than estimating it. Sanitize arbitrary transport errors and configured credential reflections. Exclusive file creation prevents overwriting an earlier attempt; hash verification prevents accidental input/code drift before execution. The selector credential is not required or loaded for this local block.

## Progression decision

The gate concerns the instrument, not a demand for perfect model behavior. Advance when inputs and transformations are coherent, references can be resolved, and independent review can distinguish supported, partial, unsupported and misattributed answers. Record reviewer disagreements. If scoring or a control remains ambiguous, identify and repair that instrument defect in a separately recorded revision before bulk comparisons. Poor but clearly interpretable model behavior is useful evidence, not automatically a failed instrument.

A passing diagnostic makes the three-condition writing study ready to prepare: prior prose, stronger historical boundary in prose, and the same substantive instructions in minimal evidence-linked records. Fresh session families, blind question authorship, explicit output budgets and separate source/no-memory controls are required there. Its final inputs and call budget need their own freeze. The later selector comparison and full chronological-history replay retain their separate conditions from the provisional plan.
