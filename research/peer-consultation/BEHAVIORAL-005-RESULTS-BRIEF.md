# Behavioral 005 results and full-model extraction: peer design consultation

Work name: circadian-behavioral-005-redesign. Identity: esteemed research colleague. Role: collaborative experimental-design peer. You previously helped refine all six optional additions. We seek insight, clarity and constructive refinement, not a defense of our existing work. Your advice remains provisional. Read-only consultation: no edits, new model experiments, production inspection/repair, dependency changes or deployment. The parent will preserve your response verbatim and synthesize the decisions separately.

## Operator purpose and latest question

Circadian already works. These are independently optional supplements to a general-purpose memory system. Default wake/graze/sleep/REM behavior remains the foundation. Keep all six proposals visible; do not collapse this into fixing Circadian, a generic framework, or only one favored idea. Stay minimal: existing runtime, no necessary new services/databases/packages, provider-agnostic contracts. Memory spans experiences, relationships, preferences, creative work, plans, interpretations and technical work. The operator wants continuity, useful selective detail and temporary aids that can become irrelevant, not just a larger retrieval backpack.

Latest request: reevaluate what would alleviate the experimental concerns, share the results with a peer, obtain input/guidance, and plan a better rerun. They propose using a full locally available language-model call to analyze the sources and extract the specific information needed by each mechanism, instead of relying on a classifier to sort/filter/select. This turn authorizes consultation and a concrete redesign, not an automatic new benchmark run. No credential is needed or provided.

## Verified evidence to read

All paths are under /Users/jrg/circadian and were verified by the parent:
- research/lab/behavioral-005/ASSESSMENT.md — concise six-proposal interpretation.
- research/lab/behavioral-005/RESULTS.md — full case rationales, costs and outcomes.
- research/lab/behavioral-005/SEMANTIC-REVIEW.md — frozen-rubric ambiguities and response failures.
- research/lab/behavioral-005/PROTOCOL.md — frozen design and precise comparison scope.
- research/lab/behavioral-005/INTEGRATION-BOUNDARIES.md — actual narrow operations and proposed consumers.
- research/lab/behavioral-005/run/requests.json and cases.json — actual stimuli and gold, inspect selectively.
- research/prototypes/README.md and 01-views, 02-compatibility, 03-relations, 04-operations, 05-experiences, 06-transformations/index.ts — implemented deterministic mechanisms.

## Completed experiment, unchanged

24 fictional scenarios, four per proposal: useful, missing, misleading and ordinary. One observation per case/condition. 48 reader calls completed first (baseline versus augmented), then 24 bounded annotation choices plus 24 reader calls. 96 study requests plus two separate transport probes. Frozen prompts/fixtures, no retries or sample replacement, model identity checks, raw records, independent arm-blinded semantic grading. Source/code hashes remain intact. There were no study transport or model-identity failures.

Reader: mlx-community/Qwen3-30B-A3B-Instruct-2507-4bit, temperature 0.2, top_p 1, max_tokens 640. The local model listing was fetched again this turn and still includes that reader. The auxiliary was jev-1.13.0. These are reported facts about the study; do not infer a general capability ranking.

Baseline received actual recallScope output from a temporary fictional mind PLUS supplied structured annotations. Augmented received the same source and annotations plus the actual operation result. Assisted chose one predeclared annotation variant using sources only; five uncertainty choices removed both annotations and the operation. All original sources remained present. This was consumption, not automatic capture, selective retrieval, context savings or full default Circadian behavior.

Strict passes (baseline / augmented / assisted), each out of four:
01 coordinated views: 1 / 1 / 1.
02 contextual compatibility: 2 / 2 / 3.
03 typed relations: 1 / 1 / 3.
04 reusable operations: 0 / 1 / 1.
05 joint experiences: 1 / 1 / 0.
06 checked transformations: 0 / 0 / 0.
Total: 5/24, 6/24, 8/24. A pass required semantic usefulness, all required propositions, source support, proper uncertainty and complete schema-valid/model-matched output. The classifier matched 24/24 expected bounded choices; that does not show annotation extraction or net pipeline benefit.

29 of 72 reader outputs violated the output contract. 22 were malformed near the 640-token cap; all responses reported finish_reason=stop. Cause is unresolved: do not assume a larger cap or stronger model solves it. There were 48 syntactically valid JSON answers but only 43 schema-valid ones. Some semantic failures were correct useful answers omitting rubric details beyond the minimal question: all pottery answers correctly named Nia's action and companion but omitted Tari's handle-making; several relation answers omitted explicit recording-location contrasts. Other errors were real, e.g. unknown participation became definite absence.

The scheduling operation supplied the correct 10:10–10:35 option; augmented readers acquired it but added false explanations and unfinished JSON. Its result had an empty reasons list. The compatibility helper supplied {status: conflict, assignmentsExamined: 8}; readers abstained instead of explaining the contradiction. These observations raise a handoff question: are we asking the reader to reconstruct a justification the operation did not provide?

Study token totals including failed attempts: baseline 24,319; augmented 29,206; assisted 38,221. Setup, fixture authoring and review/scoring computation were excluded. Later assisted phase confounds latency. One reader, one observation, one blinded grader; no population claim or robust ranking.

## Parent's current concerns to challenge

1. We controlled execution well but insufficiently calibrated the measurement interface. Preflight should use representative tasks and the exact response contract, on disjoint cases.
2. Overall pass hides factual errors, unsupported elaboration, extra-detail omissions, uncertainty, citations and serialization. We need separate scores plus a clearly justified consumer acceptance gate.
3. Sending every source, every annotation and an extra report may increase work. Each mechanism needs a consumer-specific test: views under context budgets, transformations at a write/check boundary, experiences across later recall, reusable aids across repeated tasks and retirement.
4. A full-model extractor could remove manual annotation labor and preserve meaning more flexibly, but may hallucinate a coherent structure that a deterministic checker then accepts. JSON validity and source-substring matches do not prove entailment.
5. Same local model for extraction and reading is operationally small but can repeat the same mistake. Separate stateless calls do not establish independent judgment. A different reviewer/model might diagnose dependence without becoming required production infrastructure.
6. For persistent-memory claims, extraction must happen before the held-out future question is visible. Task-aware extraction is a different useful contract and should be labeled as such.
7. Comparison must distinguish benefit from an extra reasoning call, from extracted information, from deterministic computation, and from structured presentation. A giant full factorial would recreate the wheel-spinning; suggest the smallest interpretable staged set.

## What we need from you

Give a concrete collaborative assessment, approximately 1,500–2,000 words maximum:
- Which proposed remedies actually address the observed failures, and which would merely move complexity or hide a bad result?
- Evaluate the full-model extraction proposal fairly. Is Jev the wrong role, an unnecessary layer, or still useful in a narrow place? Avoid replacing one unverified promise with another.
- For EACH of the six mechanisms, specify what the extractor should emit, what remains deterministic, what it must leave unknown, when it can see the question, and its smallest proper benefit test.
- Recommend the smallest finite comparison arms and stages. Explicitly include a competent full-model/prose alternative and a reviewed-annotation diagnostic ceiling. Identify what each comparison can and cannot isolate.
- Explain output-contract calibration, source/evidence checking, proof/explanation handoff, repeats/held-out cases, scoring independence, call/cost accounting and stopping gates without building a new framework. Recommend whether to start with the available reader or require a separate reader diagnosis.
- Name the strongest reason NOT to adopt the full-model extractor, and what evidence would change your advice.

Do not silently discard proposals or promote production changes. Prefer a finite, falsifiable plan over a broad roadmap. Tell us where you disagree with the parent's analysis. Return the discussion in your response only; the parent owns disk writes.
