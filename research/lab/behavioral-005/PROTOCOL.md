# Behavioral 005 — six optional operations, one finite comparison

Status: protocol to be sealed with reviewed fixtures and runner before study inference. Working Circadian is the baseline. No live memory, production hooks or lifecycle changes are involved.

## Question and scope

Does supplying the result of each existing research operation change a fixed reader's answer, compared with ordinary recall of the same evidence and annotations? Does a separate bounded annotation choice improve or damage that result?

There are **24 fictional scenarios**, four for each of the original six additions: a useful case, missing evidence, misleading evidence/annotation, and an ordinary case where the baseline should suffice. These are deliberately small diagnostic cases, not a held-out population estimate, long-session replay, full lifecycle test, or proof of general-purpose benefit. They span everyday memory and planning. All six receive a separate result and disposition.

## Conditions and call ceiling

- **Baseline:** actual `recallScope` output from a temporary fictional mind, plus supplied structured input annotations. No supplemental operation result.
- **Augmented:** exactly the same recalled evidence and supplied annotations, plus the actual corresponding prototype's output.
- **Jev-assisted:** the same recalled evidence; one predeclared annotation choice is made from sources alone, then its frozen input variant is passed to the same operation. A null/uncertain variant falls back to recalled evidence with both supplied annotations and the operation result omitted. The annotation decision is disclosed as uncertain model output, never a truth certificate.

The first two conditions isolate the operation with matched underlying information. The baseline's supplied annotations make it a competent same-information comparison, not an untouched end-to-end default capture pipeline. The added report changes input length and computation; those costs are measured rather than hidden. Annotations are normally reviewed, except deliberately false annotations in the misleading controls. Source text controls semantic truth in all conditions.

One observation per scenario/condition: **48 reader requests without Jev**, completed first, then at most **24 Jev requests and 24 reader requests**. Maximum **96 study HTTP requests**, plus at most two separately recorded transport smoke calls. No inference retries, prompt tuning, replacement samples, extra models or automatic follow-on studies. Three consecutive infrastructure/model-identity failures stop a phase. A failed annotation request stops that trial without a substitute reader request. Malformed/truncated reader answers remain observed failures; they do not trigger repair calls. An interrupted phase is preserved and not automatically replayed.

Seeded case ordering and balanced alternating baseline/augmentation order reduce within-phase order bias. Jev is necessarily later; timing comparisons retain that order confound. There are no decoding repeats, so apparent differences may reflect generation variability.

## Models and settings

The existing local endpoint `/v1/models` was fetched into [endpoint-evidence.json](endpoint-evidence.json). The selected reader is `mlx-community/Qwen3-30B-A3B-Instruct-2507-4bit`; requests use temperature 0.2, top-p 1, 640 output tokens, no streaming. Actual response identity must match. No seed or immutable weight revision is asserted.

Jev is pinned to `jev-1.13.0`, documented in [TypeSafe's model reference](https://docs.typesafe.ai/models), fetched for this study. Its [API reference](https://docs.typesafe.ai/api) specifies `POST /v1/systemone` and Choice questions. No SDK is installed. Each choice changes one named annotation field or coherent field group; all other input structure is supplied by the experiment. This measures constrained annotation selection, not free-form extraction, ontology discovery or autonomous mnemonic invention. Some operations have no necessary classifier; assistance is an optional experimental condition, not an architectural dependency.

Both transports have a 60-second request timeout. Endpoint identities, prompts, supported settings, ordered requests, fixtures, gold, protocol and relevant code hashes are sealed before study inference. Transport smoke records are separate from scored observations. Credentials are passed through process environment and never included in request artifacts or error bodies.

## Answers and scoring

The reader gives a free-form JSON account with `status`, `claims` (each with source references), and `unknown`. It sees no case ID, condition name, gold, rubric or answer choices. Full supplied source evidence is already present; no retrieval or follow-up call is available. This isolates consumption, not an agent's discovery/selection policy. Supplementary results remain fallible derivations and must not override contrary source evidence.

Freeze required propositions, forbidden inferences, acceptable unknowns and supporting source IDs for every scenario. An independent reviewer checks fixture coherence and the runner before the first scored call. After execution, anonymize answer order and remove condition labels for a separate semantic review. The reviewer receives source, question, rubric and answer. The reviewer must not see the arm map until scores are saved. This is an agent-judged diagnostic with a single reviewer, not human adjudication or measured inter-rater reliability.

Report separately:

1. Required proposition coverage, unsupported claims, attribution/qualification errors, appropriate uncertainty, and an overall faithful-and-useful pass. A correct conclusion with invented reasoning fails; blanket abstention when evidence supports an answer also fails.
2. JSON schema, completed output and source-reference existence. A resolving reference is not proof of entailment.
3. Jev annotation agreement with frozen gold, unknown/fallback rate and downstream outcomes. Jev neither grades itself nor supplies gold.
4. Per-stage request count, reported input/output tokens, missing-usage status, elapsed time, prototype execution time and serialized input length. Every executed HTTP request counts, including failed or malformed annotation responses; totals come from raw call records. Prototype execution times are measured while preparing the frozen branches, not during a deployed reader workflow. Manual fixture/annotation labor and setup/review/scoring agent computation are outside the study HTTP accounting and are not assigned fabricated costs. Dollar totals are not estimated without separately verified billing evidence.

## Decision and stopping rules

Each proposal has only four cases. A useful signal requires at least one baseline failure repaired without a new unsupported claim or another paired regression. A signal is a candidate for confirmation, not sufficient evidence to ship. A tie gives **no demonstrated added benefit on these cases**. New errors give **refine before integration**. Mixed effects are reported case by case, without hiding ordinary-case overhead. Report per-proposal median token/latency ratios; no universal acceptable-overhead threshold is invented after results.

Stop after the frozen comparisons, semantic review and six-row report. Do not expand cases to chase a positive result. Production adapters and a general plugin framework remain outside this assignment. A short per-proposal integration disposition may identify the input/output/activation boundary the evidence supports, while disabled production behavior remains unchanged.
