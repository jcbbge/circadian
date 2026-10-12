# Behavioral 005: all six additions

This is the finite behavioral evaluation authorized after the six deterministic prototypes and their visual explanation. Working Circadian remains the baseline. It uses 24 fictional scenarios, actual ordinary scope recall and actual prototype outputs; it never loads or changes the private mind.

Start with the [assessment](ASSESSMENT.md), [six-proposal results](RESULTS.md), and [proposed integration boundaries](INTEGRATION-BOUNDARIES.md). The [frozen protocol](PROTOCOL.md), [scoring contract](SCORING.md), and [blinded review](SEMANTIC-REVIEW.md) preserve the method and its limits. Run artifacts are in `run/`: the manifest records source hashes and model settings, requests contain every planned reader input and classifier branch, raw call logs preserve actual replies/timing/usage, and blinded semantic scores remain separate from mechanical format checks.

Each proposal has useful, missing-evidence, misleading-annotation and ordinary cases. Baseline and augmentation receive the same evidence and annotations; only augmentation receives the operation result. The later Jev condition selects one bounded annotation before the operation. Uncertain selections omit annotations and the operation result, retaining the recalled sources.

This tests whether a reader uses an explicit operation result helpfully. It does not measure automatic memory capture, long-history recall, context savings, whole-life-cycle integration or unconstrained annotation extraction. One observation per condition cannot establish a robust performance difference.

Completed: 72 reader trials and 24 annotation calls, plus two separate transport probes. Strict passes were 5/24 baseline, 6/24 augmented and 8/24 assisted. Jev matched 24/24 bounded annotation labels, but 29 reader outputs violated the output contract. These diagnostic results do not establish a dependable integration benefit; the assessment distinguishes factual errors, required-detail omissions and output failures.

## Reproduce the instrument

From the repository root, no package installation is needed:

```sh
bun test research/lab/behavioral-005/runner.test.ts
bun research/lab/behavioral-005/runner.ts validate
bun research/lab/behavioral-005/runner.ts verify
```

The first run is deliberately single-attempt. `prepare` requires reviewed hashes and successful transport evidence. `run plain` executes 48 reader requests; `run jev` requires a completed infrastructure-clean first phase and executes at most 24 classifier plus 24 reader requests. `blind` prepares answers without condition labels for the independent scorer. `report.ts` validates scores and writes accounting/results. Existing preparations, phases, blind exports and reports refuse overwrite; a new study requires an explicitly separate run directory and protocol rather than silently replacing observations.

The reader is the existing local `mlx-community/Qwen3-30B-A3B-Instruct-2507-4bit` endpoint. Jev is pinned to `jev-1.13.0`. Endpoint discovery and the two non-scored transport probes are retained in [endpoint-evidence.json](endpoint-evidence.json) and [smoke.json](smoke.json). API documentation sources are linked in the protocol. The runner accepts the classifier credential only through `TYPESAFE_API_KEY`; credentials and authorization headers are excluded from artifacts.

## Files

- `contract.ts`, `cases-01-03.ts`, `cases-04-06.ts`: independently authored scenario groups, source-backed rubrics and annotation branches.
- `runner.ts`: actual recall, prototype execution, preparation/freeze, bounded sequential inference, raw recording and blinding.
- `runner.test.ts`: actual recall/branch checks and response-parser boundaries; no mocked network calls.
- `PRE-RUN-REVIEW.json`: independent fixture/runner acceptance tied to reviewed bytes.
- `SCORING.md`, `run/semantic-scores.json`: predeclared semantic criteria and subsequent arm-blinded judgments.
- `report.ts`, `RESULTS.md`, `run/summary.json`: aggregation and a separate disposition for each proposal.
- `ASSESSMENT.md`, `SEMANTIC-REVIEW.md`, `INTEGRATION-BOUNDARIES.md`: interpretation limits and minimal proposed consumer contracts.
- `VERIFICATION.json`: final independent accounting, artifact integrity and repository-boundary checks.

Study HTTP accounting includes every attempted request, including malformed/failed responses. Setup, fixture authoring and review/scoring agent work are outside that accounting; no whole-project cost or unverified dollar figure is claimed. Source references resolving mechanically do not establish semantic correctness.
