# Circadian augmentation laboratory

**Current completed work: [local extraction repair and serving comparison 009](extractor-009/RESULTS.md).** Two declared runs completed 108 local requests across all six additions. The [72-call repaired battery 008](extractor-008/RESULTS.md) consumed 13/18 structured records; the focused 36-call comparison consumed 15/18 and produced 12/18 source-correct reader answers. [Operating instructions](extractor-008/OPERATIONS.md) codify ownership, frozen controls, failure handling and evidence. Remaining semantic failures are explicit; no production promotion followed. [007's failed serving attempt](extractor-007/RESULTS.md) is preserved.

This directory preserves the successive bounded experiments. Pilot 001 compares three memory presentations, first without an auxiliary model and then with Jev checking whether source expansion is needed. It does not change Circadian's runtime or private memory. No dependency installation is required.

[Prospective input-contract repairs](input-contracts/README.md) provide executable label/span adapters and separately reviewed event/participation gates for the confirmed 009 defects, plus an aid-retirement invariant. These deterministic engineering changes are not another inference study or production promotion; completed studies remain unchanged.

[Pilot 001 results](RESULTS.md): both rounds completed. Both scored 72/72; Jev matched all sufficiency labels but added overhead under the tested policy. The report explains why universal source expansion limits what this result establishes.

[Diagnostic 002 results](DIAGNOSTIC-RESULTS.md): separated compact-memory capability from retrieval decisions, then compared reader-only routing, unconditional source delivery and Jev-assisted selection. Final policy accuracy was 13/16, 16/16 and 16/16 respectively. Its [separate frozen protocol](DIAGNOSTIC.md) and runner preserve Pilot 001 unchanged. The design below describes Pilot 001 only.

[Real-session pilot 003](REAL-SESSION-RESULTS.md): three actual conversation inputs, question-blind generated memories, and 72 trials across four policies. Correct choices frequently concealed missing evidence; generated memories also exposed task-continuation and attribution defects. See its [protocol](REAL-SESSION.md) for source coverage, independent question authoring, and model/run boundaries.

[Calibration 004](CALIBRATION-RESULTS.md): fourteen local calls with free-form answers and reviewed evidence controls. Empty inputs prompted abstention, while related background sometimes became the wrong historical event; valid references did not prevent wrong attribution. The writer pair exposed current-instruction contamination. Its [protocol](CALIBRATION.md) keeps schema, references and semantic support separate; the [next-study plan](ROUND-004-PLAN.md) remains staged.

[Behavioral 005](behavioral-005/ASSESSMENT.md): all six deterministic additions, 24 fictional scenarios, 72 reader trials and 24 annotation calls. Strict passes were 5/24 baseline, 6/24 augmented and 8/24 assisted. Jev matched every bounded annotation label, while reader output failures and required-detail omissions limited the behavioral conclusions. See the [six-row results](behavioral-005/RESULTS.md), [blinded review](behavioral-005/SEMANTIC-REVIEW.md), and [minimal proposed integration boundaries](behavioral-005/INTEGRATION-BOUNDARIES.md). No production integration followed.

[Proposed full-model extractor study](EXTRACTOR-STUDY-DESIGN.md): peer-refined response to Behavioral 005, with six source-grounded extraction contracts, actual consumer boundaries, plain-analysis and reviewed-input comparisons, a fixed ablation, calibration/fidelity gates and complete proposed call accounting. This is a design, not a started run. The [source-contract audit](EXTRACTOR-CONTRACT-AUDIT.md) identifies the small decoders and authority boundaries still needed.

[Local extractor calibration 006](extractor-006/RESULTS.md): 32 local Qwen requests across eight bundles covering all six additions. Only 1/8 structured preparations passed the current contract; independent semantic review separates format, provenance and meaning failures. The prose comparator also contained competing schema instructions. Promotion stopped at calibration; the larger proposed study remains unstarted. [Artifacts and verification](extractor-006/README.md) preserve the complete run.

## Frozen design — Pilot 001

- Twelve fictional cases, six paired histories/domains, two repetitions, three view arms: **72 trials per round**.
- `current`: actual `recallScope` output from a temporary synthetic mind. This is a small-system reference, not the entire live wake payload.
- `plain`: a competent hand-authored compact prose view.
- `preserved`: an information-equivalent hand-authored view with explicit qualifications/attribution labels. It is not guaranteed shorter.
- Reader: `mlx-community/Qwen3-30B-A3B-Instruct-2507-4bit`, discovered from the local `/v1/models` endpoint and confirmed by a separate transport probe. Temperature 0.2, top-p 1, 192 output-token cap, no seed control or weight revision exposed by this run.
- Auxiliary: `jev-1.13.0`, pinned to the version documented in [TypeSafe's model reference](https://docs.typesafe.ai/models), inspected 2026-10-10. Response model must match. The [API](https://docs.typesafe.ai/api) uses `POST /v1/systemone` with structured Choice questions; no SDK is needed.
- All baseline trials finish before Jev trials, as requested. Trial order is seeded and identical between rounds. This cannot remove the time/order confound between rounds.
- Up to 360 measured HTTP requests total: 144 baseline reader requests and 216 assisted-round requests. The actual total will be lower if fewer source expansions occur. Transport smoke checks have a separate maximum of four requests and are excluded from scores.
- No retries, endpoint fallback, prompt tuning, or replacing failed samples. Three consecutive errors stop a round. Incomplete runs remain incomplete, and infrastructure/schema errors block starting the assisted round.

## Interaction and evidence

The reader sees the presented memory, question, answer options, and whether the full source is already present. It can return one `expand` request before answering with an option and short explanation. The second reader call receives the full original account. Requesting expansion after receiving the complete source is a recorded protocol failure.

In the assisted round, Jev first sees the source, view, question, and options. It chooses `sufficient`, `expand`, or `unknown`. Only `sufficient` retains the compact view; either other choice supplies full source. The reader still has its own expansion option when source has not been supplied. Jev does not supply the answer, create gold labels, or grade itself.

Gold option keys, rationales, case IDs, pair metadata, and sufficiency labels stay out of both inference requests. Original source access is available to both rounds through expansion. Jev's proactive reading of that source is an additional computation/access advantage: its tokens and latency must count. This is not matched-compute evidence or a comparison against always supplying the source.

Each arm has a frozen sufficiency label. `unknown` is selector uncertainty, not the same as a source-supported answer that something is unknown. These fixtures have no selector-unknown gold cases, so unknown-class performance cannot be estimated.

## Scores and limits

Report option accuracy, grounded option accuracy, errors, expansions, gate-label accuracy, per-stage latency, reported input/output tokens, and missing-usage status. A lucky correct answer from an insufficient compact view without expansion does **not** count as grounded. Explanations are retained for inspection; letter accuracy does not certify narrative fidelity.

Report each repeat and pair/domain separately. Twelve cases are six closely related pairs, not 144 independent observations. No significance, equivalence, prevalence, or broad general-purpose claim is justified. Cases are short and may reach a ceiling. Expansion cases coincide with the travel/planning stability pairs; those factors are confounded. Views and questions were authored together; this does not test automatic capture before an unknown future task. There is no untouched confirmation set.

The primary interpretation is diagnostic: did assistance fix errors, avoid reader expansion calls, or add cost without benefit on these cases? A pilot improvement alone does not warrant production integration.

## Commands

From the checkout:

```sh
bun test research/lab/harness.test.ts
bun research/lab/harness.ts prepare pilot-001
bun research/lab/harness.ts run pilot-001 baseline
# Supply TYPESAFE_API_KEY through the process environment, never a committed file.
bun research/lab/harness.ts run pilot-001 jev
bun research/lab/harness.ts report pilot-001
```

`prepare` writes immutable bundles, gold labels, a manifest, source/code hashes, and a manifest seal. Existing run paths and round files are not overwritten. Frozen code or input changes require a new run identifier. The runner never loads the user's runtime environment file, private mind, hooks, or model fallback settings.

Raw request bodies, successful responses, timing, usage and sanitized errors are retained in `runs/<id>/`. Credentials are supplied only through process environment and are not included in request artifacts or error messages. Authorization headers are never logged; known credential values are redacted if a successful response unexpectedly reflects them. HTTP error bodies are deliberately not saved because they may reflect credentials; status codes remain visible. Private data is not part of this pilot.
