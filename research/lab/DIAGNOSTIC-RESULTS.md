# Diagnostic 002: the reader can use compact memory; routing still matters

**Measured result:** the fixed local reader answered all eight sufficient-memory capability trials correctly and abstained on all eight insufficient-memory capability trials. In the subsequent whole-policy comparison, reader-only routing answered 13/16 correctly; Jev-assisted selection and unconditional source delivery each answered 16/16. Full-source delivery had fewer requests and lower observed latency on these short sources. This supports further investigation, not production integration or a general superiority claim.

[Frozen protocol](DIAGNOSTIC.md), [fixtures](diagnostic-fixtures.json), [manifest](runs/diagnostic-002/manifest.json), [grouped results](runs/diagnostic-002/summary.json), [analysis](runs/diagnostic-002/analysis.json). Local run date: 2026-10-10; UTC completion timestamps fall on 2026-10-11.

## What changed from the first pilot

Capability and retrieval decisions were tested independently, in fresh requests. Four new fictional situations cover a relationship request, a creative title, a learning activity, and an everyday plan. Each has a compact view containing the decisive sentence and a matched view with only that sentence removed. Both omit unrelated source material.

The reader remained `mlx-community/Qwen3-30B-A3B-Instruct-2507-4bit`, temperature 0.2, top-p 1, maximum 192 output tokens. Jev remained `jev-1.13.0` with the prior sufficiency rubric. Every actual response reported the expected model ID. No prompt, fixture, policy or setting changed after the diagnostic began; there were no retries or discarded attempts.

There were 48 diagnostic trials, followed by 32 baseline-policy trials and 16 assisted-policy trials. Those 96 observations come from only four situations with two views and repetitions; they are not 96 independent histories. The whole run used **117 measured inference calls: 101 reader calls and 16 Jev calls**, below the 128-call cap. No extra transport inference was performed. All phases completed without request/schema errors or missing usage.

## Stage 1: capability and retrieval

| Condition | Sufficient views, 8 trials | Missing-detail views, 8 trials |
|---|---|---|
| Answer or abstain; retrieval unavailable | 8 correct, fully quoted answers | 8 appropriate abstentions |
| Answer or retrieve; completeness field absent | 8 correct answers, no expansions | 6 expansions, 2 unsupported wrong answers |
| Answer or retrieve; `source_complete: false` | 8 correct answers, no expansions | 8 expansions, no unsupported answers |

The strict sufficient-capability progression rule passed. The [recorded inspection](runs/diagnostic-002/comparison-acceptance.json) authorized the already-defined policy stage without changing it.

Neither routing condition over-expanded sufficient evidence. Under this wording, the completeness field did not reproduce the first pilot's universal expansion behavior. The new prompt, fixtures and response requirements differ from Pilot 001, so this does not identify the original cause or show that removing the field is beneficial. In this diagnostic, the flagged condition instead had fewer premature answers. Four situations and two repetitions cannot establish a stable metadata effect.

The absent-field errors are concrete: the reader selected an unsupported collage title and an unsupported greeting form. It quoted text that actually appeared in the view, but that text did not establish its selected answer. Quote existence is not evidence entailment.

All four sufficient-view routing quotation failures were a different issue: the reader selected the right answer and copied a truthful substring but omitted the introductory occasion clause from the requested complete sentence. They remain failures of the predeclared exact-sentence score, not additional wrong answers.

## Stage 2: whole policies

The reader-only policy used the predeclared absent-field routing prompt and could answer immediately or expand once. The assisted policy let Jev select compact view versus source and constrained the final reader to answer or abstain. The unconditional policy supplied the full source directly. Baseline policies were interleaved and completed before assistance.

| Measurement, 16 trials per policy | Reader-only routing | Always supply source | Jev-assisted selection |
|---|---:|---:|---:|
| Correct options | 13/16 | 16/16 | 16/16 |
| Strict supported answers | 11/16 | 16/16 | 16/16 |
| Reader calls | 21 | 16 | 16 |
| Jev calls | 0 | 0 | 16 |
| Total calls | 21 | 16 | 32 |
| Full source delivered to reader | 5 | 16 | 8 |
| Mean trial time | 664 ms | 497 ms | 676 ms |
| Median trial time | 581 ms | 545 ms | 643 ms |
| Reader input tokens | 5,798 | 5,576 | 4,700 |
| Reader output tokens | 696 | 512 | 512 |
| Jev input tokens | 0 | 0 | 12,250 |
| Jev output tokens | 0 | 0 | 728 |

Jev matched all 16 sufficiency labels: eight sufficient and eight requiring expansion. Its eight sufficient cases reached correct final answers using only the compact view; the other eight received source. Unlike the first pilot, this comparison did not ultimately deliver full source to every reader.

The reader-only policy's three wrong answers occurred when it answered missing evidence without requesting source. Its other two strict-score failures were correct greeting answers with shortened quotations, as in Stage 1. Do not describe the 11/16 strict score as five incorrect answers.

The assisted policy avoided the three wrong final answers observed in the matched reader-only trials. This is an observed difference between whole policies. It is not an isolated causal effect of Jev intelligence: the assisted reader also has different action permissions and the capability prompt. The Stage 1 constrained reader already used sufficient evidence and abstained on missing evidence without Jev. Moreover, the flagged routing condition showed no premature answers in its small probe. Those are credible simpler alternatives, not results that can be ignored to favor the selector.

Mean times are descriptive, not a controlled service-speed comparison. Policy order, caching and load can influence them. Token units come from each service; combining different tokenizers does not establish matched compute or monetary cost. The assisted policy saved 876 reader input tokens against always-source while adding 12,978 Jev input/output tokens. These sources were only 146–152 words, making full-source delivery a strong, inexpensive comparator.

## Interpretation and next experiment

The useful finding is that compact evidence itself was usable in these cases. The failure arose in some retrieval decisions: when an answer was missing, the reader sometimes answered anyway and attached an irrelevant quotation. That is a narrower, more actionable problem than assuming the model cannot use compact memory or that Jev failed its assigned classification task.

Retain Jev as a candidate; do not add an obligatory classifier to Circadian. It selected correctly here and the assisted policy avoided observed errors, but unconditional source delivery was equally accurate with fewer calls and lower observed time. A minimal representation and its retrieval instructions still deserve the first opportunity to solve the problem.

The smallest justified next experiment is local: test explicit completeness metadata with actual reader-controlled expansion against absent-field routing and always-source, using fresh independently authored cases and frozen prompts. Answer/abstain followed by one source fetch on abstention is another cheap candidate. Establish what these simpler policies achieve before another selector comparison. A subsequent larger test can vary irrelevant history length under declared budgets so compact memory has a reason to exist; keep genuine missing-detail cases. Use balanced policy order for a timing comparison if authorized, or retain baseline-first order and its limitation. Continue scoring unsupported conclusions separately from exact quotation compliance, with independent support review.

That follow-up is proposed, not executed. These runs do not evaluate the six mathematical extensions, automatic memory capture, unknown future questions, conflicting accounts, long contexts, spontaneous continuity or repeated wake/sleep/REM cycles. They locate an experimental mechanism to study before building those additions.

## Verification and artifacts

**36 laboratory tests passed:** 19 new diagnostic tests and 17 existing pilot-runner tests. Tests blocked real network calls. The independent [fixture review](runs/diagnostic-002/fixture-review.md) confirmed gold and missingness; its requested action-score correction was made before freezing and covered by tests. See [test report](runs/diagnostic-002/test-report.md) and [pre-run acceptance](runs/diagnostic-002/pre-run-acceptance.json).

The subsequent [independent results audit](runs/diagnostic-002/audit.md) reconstructed outcomes and usage from every raw call, verified frozen inputs and request boundaries, and inspected all support failures. It confirmed the counts and the distinction between quotation compliance and unsupported answers. Root inspected and accepted that report; see the [final acceptance record](runs/diagnostic-002/acceptance.json).

The original pilot's frozen code and manifest remain intact. Research artifacts were scanned for the supplied credential format; none was found. The user-authorized existing key was passed through an echo-disabled input channel into the child process environment, not written to a research file. The process has finished. No product code, private mind, installed hooks, services, dependencies, branches or worktrees were changed.

- [Diagnostic trial records](runs/diagnostic-002/diagnostic.jsonl) and [raw calls](runs/diagnostic-002/diagnostic.calls.jsonl)
- [Baseline trial records](runs/diagnostic-002/baseline.jsonl) and [raw calls](runs/diagnostic-002/baseline.calls.jsonl)
- [Jev trial records](runs/diagnostic-002/jev.jsonl) and [raw calls](runs/diagnostic-002/jev.calls.jsonl)
- [Frozen gold](runs/diagnostic-002/gold.json), [input bundles](runs/diagnostic-002/bundles.json), and [protocol review](runs/diagnostic-002/protocol-review.md)
