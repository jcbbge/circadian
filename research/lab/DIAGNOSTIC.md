# Diagnostic 002: capability, retrieval, and whole-policy cost

Status: frozen protocol before measured inference. Research only; no live-memory or lifecycle changes.

## Question

Pilot 001 did not isolate compact-memory capability because every final answer received the full source. This diagnostic separates ability to answer from the choice to retrieve. Four new fictional situations each have a sufficient compact view and a view with exactly one decisive sentence removed. Both views omit irrelevant source material, so being incomplete does not imply being insufficient.

Fixture authorship, implementation, test engineering, and independent review have separate owners. These authored cases are a mechanism check, not a representative sample or a held-out confirmation set.

## Stage 1: 48 local requests

Four situations × two views × two repetitions × three conditions:

1. Capability: answer with an option and exact supporting sentence, or abstain. No retrieval.
2. Routing, field absent: answer with evidence, or request expansion.
3. Routing, `source_complete: false`: same evidence, instructions and actions as condition 2; only the metadata field differs.

All requests use fresh contexts. Conditions are interleaved using a frozen shuffle. Routing requests do not execute expansion in this stage. The prompt explicitly permits retrieval when needed whether the metadata field is present or absent. It also explains that completeness and question sufficiency are different properties. Any observed field effect applies to this wording, not every possible prompt.

The reader is the same `mlx-community/Qwen3-30B-A3B-Instruct-2507-4bit` served by the existing local endpoint. Availability was verified through `GET http://127.0.0.1:10240/v1/models` during this task. Settings remain temperature 0.2, top-p 1, maximum 192 output tokens. No exposed seed or independent weight revision is assumed. Exact prompts, inputs, settings and code hashes are frozen in the run manifest.

## Predeclared progression rule

Proceed to the policy comparison only if all 48 diagnostic requests complete without infrastructure/schema errors and all eight sufficient-view capability trials produce the correct option with the reviewed supporting sentence. Otherwise retain the failed run and diagnose it before new inference under a revised protocol.

Missing-view abstention and routing behavior are measured and inspected but are not additional progression requirements. The independent reviewer suggested requiring perfect missing-view abstention too. We retain the narrower gate deliberately: premature answers on missing evidence would be a relevant failure for a selector to address, whereas inability to use sufficient evidence would confound that comparison. This is a strict operational gate for four easy situations, not a statistical reliability threshold.

## Stage 2: three whole policies

Only after that gate passes, reuse the eight inputs and two repetitions:

| Policy | Behavior | Maximum requests |
|---|---|---:|
| Reader-only routing | Reader answers immediately or requests source; expansion triggers one fresh answer/abstain request | 32 |
| Always supply source | One answer/abstain request with full source | 16 |
| Jev-assisted selection | Selector reads source and view; sufficient retains view, expand/unknown supplies source; one answer/abstain reader request | 32 |

The two baseline policies are interleaved and finish before the assisted policy, preserving the operator's baseline-first requirement. Total maximum: 128 measured requests across both stages, including 16 Jev requests. No extra model sweep or unrecorded transport inference is planned.

The assisted reader does not override selection with another retrieval request. This is a comparison of whole policies, not an isolation of selector intelligence: retrieval permissions differ. Stage 1's constrained reader supplies a descriptive no-selector reference, in a separate block. All terminal answers have the same evidence/abstention requirements. Model `jev-1.13.0` and the prior selector rubric remain fixed; the documented endpoint and response shape were rechecked in the [API reference](https://docs.typesafe.ai/api) and [model reference](https://docs.typesafe.ai/models). Actual response identity is validated on every call.

Charge all selector source-reading tokens, latency and calls. Always supplying source is a serious comparator here because these sources are short. Baseline-first order, caching, distinct service/tokenizer units and four authored situations prevent causal speed, matched-compute, price or generalization claims.

## Scoring and evidence

Score choice correctness, exact quotation, inclusion of the reviewed decisive sentence, and the answer/abstain/expand decision separately. On a missing view, a lucky correct option is unsupported. The original source establishes the answer in all four cases; abstention means the current view lacks evidence, not that the source establishes an unknown answer.

The mechanical support score requires a correct option and a quote present in the delivered memory containing the fixture's decisive sentence. It is a narrow proxy with independent inspection; merely quoting a sentence does not prove semantic support. Exact-sentence misses remain visible rather than being silently regraded. Review all apparent support failures and a source-matched explanation sample.

Report capability and routing separately, then accuracy, supported answers, source delivery, unnecessary expansion, per-stage latency, reported usage and failures by policy/view. Missing usage is explicit. Error attempts remain in the accounting; three consecutive failures stop a phase. There are no retries, prompt revisions, fallback models or discarded samples within a run.

Inputs, code and manifest are hashed and sealed; existing phases cannot be overwritten. Successful request/response bodies are retained without authorization headers. Known process credentials are redacted if reflected; HTTP error bodies are not persisted. Use only fictional material.

## Decision after this diagnostic

If the reader answers sufficient evidence but retrieves unnecessarily, investigate instructions/policy before enriching the representation. If it cannot use sufficient evidence, inspect presentation and interpretation. Necessary retrieval is not itself a failure. A successful mechanism check permits a harder, independent test; it does not justify production integration.

Richer mathematical proposals remain separate. These tests do not implement or establish the advantage of a structured ontology, automatic extraction, long-context memory, or repeated wake/sleep/REM cycles.

## Commands

```sh
bun test research/lab/diagnostic.test.ts
bun research/lab/diagnostic.ts prepare diagnostic-002
bun research/lab/diagnostic.ts run diagnostic-002 diagnostic
# Only after the frozen progression rule passes:
bun research/lab/diagnostic.ts run diagnostic-002 baseline
# Supply TYPESAFE_API_KEY via process environment; never place it in a file.
bun research/lab/diagnostic.ts run diagnostic-002 jev
bun research/lab/diagnostic.ts report diagnostic-002
```
