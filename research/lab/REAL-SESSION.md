# Real-session pilot: compression and retrieval

This exploratory study moves from fictional fixtures to three past conversations. It tests compact memory and retrieval policies. It does not test Circadian's complete wake/sleep/REM pipeline or implement any proposed mathematical extension.

The operator authorized both local and remote inference over real conversation material, using the existing test credential. Model choice is explicit: the existing local `mlx-community/Qwen3-30B-A3B-Instruct-2507-4bit` reader, followed by `jev-1.13.0` as a sufficiency selector. These are research choices, not product dependencies.

## Sources and scope

Native session logs remain authoritative. Private derived evaluation inputs reference the native files, selected parent chains, line numbers and hashes. Public research files contain code, protocol and aggregate findings. The source preparer uses the already-installed Python tokenizer package and local tokenizer file; it installs no packages, creates no database and calls no inference service.

Selection sampled large native logs and searched for varied subject matter: personal reflection and coaching, conceptual corrections, and extended troubleshooting with changing constraints. It is a purposive sample, not a representative corpus or a random sample of all harnesses. The selected formats cover two native harnesses.

| Source | Eligible visible turns | Supplied turns | Eligible tokens | Supplied tokens |
| --- | ---: | ---: | ---: | ---: |
| A: reflection and coaching | 60 | 59 | 18,552 | 17,697 |
| B: conceptual clarification | 67 | 67 | 10,931 | 10,931 |
| C: extended troubleshooting | 312 | 107 | 50,702 | 17,631 |

Source preparation follows the latest physical record's ancestry and preserves visible user/assistant text. Tool and reasoning blocks, other event types and explicitly identified context-injection IDs are excluded. Other quoted or inline injected guidance may remain within visible messages; a native user role alone does not establish human authorship. Gold evidence must identify actual conversational statements.

Each input stops before the first whole turn that would exceed 18,000 local reader-tokenizer tokens. No middle turn is skipped. B contains all eligible dialogue; A and C are chronological prefixes. “Source” below means this prepared input, not the entire native transcript. Its cap excludes downstream prompt framing and is not a measurement under Jev's tokenizer. Actual service usage is retained; overflow is a recorded failure, never silent truncation. This first study cannot establish performance across C's unseen suffix or repeated compactions.

## Independent preparation

1. Generate one compact memory per source using the frozen compression prompt, temperature 0.2, top-p 1 and a 1,200 output-token ceiling. Request at most 600 words; record realized length. Supply neither questions nor answer keys. There is one attempt per source; retain failures.
2. An independent author writes three four-option retrospective questions per source from its prepared text, without seeing compact memories. Questions concern intent, qualifications, corrections and decisions, rather than external factual truth. Preserve this draft unchanged.
3. A separate reviewer checks source-supported answers and annotates whether each generated memory is sufficient or requires expansion. Record exact supporting source lines and the reasoning for each sufficiency judgment. Compare the reviewed questions with the preserved draft. Do not manufacture a favorable sufficient/insufficient balance after viewing summaries.
4. Freeze sources, generated views, reviewed cases, seeded trial order, prompts and runner hashes before any scored call. Verify generated views against the raw compression responses. A partial or failed attempt stays recorded; any revised protocol requires a distinct run.

## Four policies

| Policy | Initial reader input | Retrieval decision |
| --- | --- | --- |
| Reader, field absent | Compact memory | Answer now or request source once |
| Reader, field present | Same compact memory plus `source_complete: false` | Same prompt and available actions |
| Always source | Prepared source | Answer or abstain |
| Jev-assisted | Compact memory or source selected by Jev | Jev sees source, memory, question and options; only `sufficient` retains compact memory |

An expansion uses a fresh terminal reader request with source. Jev's `expand` and `unknown` selections both supply source. The assisted reader answers or abstains; it cannot silently override the selector with another fetch. Jev does not provide an answer letter to the reader. No model receives gold, rationale, reviewed sufficiency labels, trial ID or repetition index.

The assisted policy and unassisted routing policies differ in reader action permissions and prompt. This is a comparison of whole policies, not an isolated causal estimate of classifier intelligence. Jev reads source on every assisted trial; its tokens and time must count. It is not a source-free retrieval oracle.

## Runs, budgets and errors

Nine questions × two repetitions × four policies yield 72 trials, not 72 independent conversations. The 54 baseline trials are interleaved with fixed seed 9263; all finish before the 18 assisted trials. Reader decoding is temperature 0.2, top-p 1, maximum 320 output tokens. Model IDs are checked on every response. No reader seed or immutable weight revision is exposed by this experiment.

There are at most 3 compression calls, 90 baseline calls and 36 assisted calls: 129 total. Requests time out at 60 seconds; there are no automatic retries. Invalid decisions are scored failures, not silently repaired. Three consecutive infrastructure failures stop a phase. Assistance requires all baseline trials to finish without infrastructure errors; model-output errors remain part of the baseline score and do not block assistance. Failed or incomplete runs cannot be presented as completed comparisons.

Raw requests, responses, timing, model IDs, usage and final decisions are retained. Credentials are passed through environment at runtime and scrubbed from logs; they are never fixtures. Existing run artifacts cannot be overwritten. Inputs and code are hash-checked before each phase.

## Scoring and interpretation

Report option accuracy, abstentions, wrong answers, invalid responses, expansion frequency, reader and selector calls, each service's token counts, and descriptive latency. Account for the three compression calls separately; do not hide preprocessing cost in a favorable per-question average.

The automated support proxy requires a correct option, an exact quote appearing in delivered evidence, and either source delivery or a sufficient compact view. Quote presence does not prove entailment. An independent audit must inspect the actual quote and question for each answer and distinguish unsupported reasoning from minor quotation noncompliance. Routing judgments use the reviewed sufficiency labels, without tuning a probability threshold on results.

This small multiple-choice sample can identify concrete failure modes. It cannot establish production readiness, free-form fidelity, stable cross-model behavior, universal memory compression, a full long-history solution or the value of any mathematical extension. Fixed baseline-first order, local prompt caching, remote latency and machine load confound timing comparisons. Token units from different services are not equivalent compute measures.

## Execution

The source selection and all run-specific artifacts live in an existing private directory supplied explicitly to the tools:

```text
python3 research/lab/real-session-source.py <selection.json> <private-dir>/sources.json
bun test research/lab
bun research/lab/real-session.ts compress <private-dir>
# Preserve independently authored draft; review gold and view sufficiency into cases.json.
bun research/lab/real-session.ts freeze <private-dir>
bun research/lab/real-session.ts run <private-dir> baseline
# Supply TYPESAFE_API_KEY securely to this process environment.
bun research/lab/real-session.ts run <private-dir> jev
bun research/lab/real-session.ts report <private-dir>
```

The protocol does not alter Circadian's runtime, default behavior, hooks, private mind or installed services. Results remain research evidence for deciding whether an optional extension is justified.
