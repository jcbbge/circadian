# Pilot 001: no Jev, then Jev-assisted memory views

**Measured result:** both rounds answered all 72 trials correctly. Jev matched all 72 predefined sufficiency judgments, but this configuration showed no accuracy gain and had higher observed total latency and additional inference overhead. These are exploratory results from twelve short fictional cases, not evidence of broad memory performance.

Run: [pilot-001 manifest](runs/pilot-001/manifest.json). Local date: 2026-10-10; the recorded UTC completion timestamps fall on 2026-10-11. [Protocol](README.md), [fixtures](fixtures.json), [analysis](runs/pilot-001/analysis.json), [per-arm summary](runs/pilot-001/summary.json).

## What ran

- Actual read-only Circadian scope recall over temporary fictional memory, competent hand-authored compact prose, and an information-equivalent labeled view.
- Twelve cases across relationships, learning, creativity, reflection, travel, and planning; six paired histories, two repetitions, three views: 72 trials per round.
- First all baseline trials, then all assisted trials. Same seeded order, reader prompts, options, source-expansion access, and settings.
- Reader throughout: `mlx-community/Qwen3-30B-A3B-Instruct-2507-4bit` at the existing local endpoint; temperature 0.2, top-p 1, 192-token output limit. Returned model IDs matched. No seed or independent weight revision was exposed.
- Assistant decision model: `jev-1.13.0`. It examined source, memory view, question and options, then chose sufficient/expand/unknown. It did not grade answers or provide answer letters to the reader.
- No retries, endpoint changes, prompt changes, or discarded measured attempts. Exact request bodies and successful responses are retained; credentials and authorization headers are excluded.

## Outcomes

| Measurement | No Jev | With Jev |
|---|---:|---:|
| Answer accuracy | 72/72 | 72/72 |
| Operational grounded accuracy | 72/72 | 72/72 |
| Request/schema/protocol failures | 0 | 0 |
| Reader calls | 120 | 104 |
| Jev calls | 0 | 72 |
| Total measured calls | 120 | 176 |
| Reader-initiated source expansions | 48 | 32 |
| Jev-initiated source expansions | 0 | 16 |
| Mean end-to-end trial time | 796 ms | 895 ms |
| Median trial time | 841 ms | 850 ms |
| 95th-percentile trial time | 1,021 ms | 1,215 ms |
| Sum of measured trial times | 57.327 s | 64.434 s |
| Reader input tokens | 37,750 | 33,570 |
| Reader output tokens | 2,822 | 2,714 |
| Jev input tokens | 0 | 51,850 |
| Jev output tokens | 0 | 3,336 |

Token totals are the respective services' reported units, with no missing usage in this run; tokenizer differences preclude treating them as identical amounts of text. Monetary billing was not measured. Trial times include the sequential decision/reader calls and local trial work, not fixture authorship, review, transport probes, or preparation. Baseline-first block order, caching and service variation prevent attributing the latency difference solely to assistance. The observed mean difference was approximately +99 ms (+12.4%).

Each view arm scored 24/24 in each round. Each domain scored 12/12 per round; each repeat scored 36/36. There were no improved or regressed paired answer choices. These repeated observations are not independent evidence from 144 histories.

| View | No-Jev mean trial time | With-Jev mean trial time | Final accuracy in each round |
|---|---:|---:|---:|
| Current scope recall | 608 ms | 764 ms | 24/24 |
| Ordinary compact prose | 885 ms | 935 ms | 24/24 |
| Labeled compact view | 896 ms | 986 ms | 24/24 |

Jev's sufficiency classifications matched 72/72 gold labels: 56 sufficient and 16 expand. No gold-unknown cases were present. This does not establish calibrated probabilities or performance on ambiguous examples.

## The important diagnostic

**Every compact-view trial ultimately supplied the full source.** Without Jev, the reader requested expansion in all 48 compact trials, including 32 whose compact views already carried enough information. With Jev, 16 genuinely insufficient views were expanded before the reader's first call. For the other 32 compact trials, Jev correctly retained the view but the reader still requested full source.

Consequently, Jev saved 16 reader calls while adding 72 decision calls. It did not prevent the unnecessary expansions under this policy. A sufficient decision was not separately communicated as assurance to the reader; it simply retained the original compact input and preserved the reader's expansion right. That behavior is a property of the tested integration, not a general limitation of Jev.

The reader's preference for expansion may have been encouraged by our prompt, the `source_complete: false` field, or the lack of an explicit retrieval cost in its decision. The run does not identify which explanation is correct. Calling this a model incapability would exceed the evidence.

Because every final answer had full source available, these scores do not isolate fidelity of answering directly from the different compact presentations. They primarily test routing and eventual source-grounded option selection. Our grounding score means the necessary source was delivered and the correct option selected; it does not certify the explanation or prove the model used that source causally.

## Interpretation and next experiment

Retain Jev as a candidate: its decisions were accurate on these inspected cases. Do not integrate this policy into production based on the pilot. The baseline already reached a ceiling; no accuracy improvement was possible, and observed total latency increased despite fewer reader calls.

Before testing richer mathematics, repair the experiment's ability to discriminate compact-memory behavior. A proposed next protocol would record an initial answer/abstention and its evidence before allowing expansion, then score the initial and eventual answers separately. Test presentation of completeness and retrieval cost as separate factors, with the same changes applied to both rounds. Add longer, confusable, held-out histories and cross sufficiency with both sensitivity and stability cases. Compare an auxiliary selector with unconditional source delivery when the source fits. These are proposed follow-ups, not additional runs performed here.

The present fixtures and summaries were authored together; source expansion is confounded with travel/planning and the stability pair type. They do not test capture from raw sessions, unknown future questions, pressure from long contexts, free-form narrative fidelity, multiple models, or repeated sleep/REM cycles. No significance, equivalence, or general-purpose superiority claim follows.

## Verification and artifacts

Before measured inference, an independent reviewer checked all fixture gold answers, compact-view equivalence, per-arm sufficiency, and protocol boundaries. Root inspected and accepted those findings. A separate test engineer exercised the runner with fabricated responses and a network prohibition. **17 harness tests and six existing scope tests passed.**

A subsequent [independent results audit](runs/pilot-001/audit.md) recomputed counts and usage from the raw records, checked inference payloads against frozen inputs, and sampled final explanations. It confirmed the reported results and limitations. The root reviewer inspected and accepted this audit; [acceptance record](runs/pilot-001/acceptance.json).

The runner seals manifests and hashes inputs/code; mutations require a new run. It rejects model drift, malformed decisions, omitted full-source payloads, unbounded expansion and overwrite attempts. Failed calls would remain in the denominator with incomplete usage flagged; none occurred in this run.

There were 296 measured inference calls. Separate smoke artifacts record one local reader probe, one Jev model-list request, and one Jev inference probe; they are excluded from results. All payloads used fictional material. Research artifacts were scanned for the supplied credential format; no credential was found. Production code, private memory, lifecycle hooks and installed services were not modified.

- [Frozen inputs](runs/pilot-001/bundles.json) and [gold labels](runs/pilot-001/gold.json)
- [Baseline trial records](runs/pilot-001/baseline.jsonl) and [raw calls](runs/pilot-001/baseline.calls.jsonl)
- [Assisted trial records](runs/pilot-001/jev.jsonl) and [raw calls](runs/pilot-001/jev.calls.jsonl)
- [Local transport probe](smoke-local.json) and [Jev discovery/probe](smoke-jev.json)
