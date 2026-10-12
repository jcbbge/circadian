# Operating the local extraction study

This is an operator document added **after 008 was frozen and started**. It is not an inference input or a change to the sealed experiment. Default Circadian continues to work; this research evaluates six optional additions. The binding instructions are [008's protocol](PROTOCOL.md) and the inherited [007 protocol](../extractor-007/PROTOCOL.md).

**Ownership.** The parent agent owns execution, call accounting, recovery coordination and the final assessment. An independent reviewer checks source fidelity and literal answer requirements; the parent inspects that review and resolves disagreements with independent adjudication. The operator is not a test runner or an approval relay. Passing code checks does not substitute for independent assessment of meaning.

**Current run.** The sealed [manifest](run-local/manifest.json) declares 72 requests: 18 bundles, each with structured preparation, prose preparation and one reader call for each preparation. Eight bundles are exposed development material; ten are independent confirmation material. The [configuration](run-local/config.json) fixes the local model, temperature 0, top-p 1, 2,048-token output cap, zero retries and zero format repairs. The two preparations share sources, semantic assignments and meaningful caller vocabulary. Gold, scoring rules and future questions stay out of preparation; the compatibility and scheduling tasks are explicitly task-aware.

Verify this run from any working directory:

```sh
/Users/jrg/.bun/bin/bun /Users/jrg/circadian/research/lab/extractor-008/runner.ts verify /Users/jrg/circadian/research/lab/extractor-008/run-local
```

This performs no inference. It checks the sealed inputs, implementation, accepted review and inherited experiment. It does not establish progress, completion, semantic quality or output integrity. The [runner](runner.ts) supports `prepare DIR`, `verify DIR`, and `run DIR`. Preparation requires a new directory and reviewed inputs; execution creates an exclusive `started.json` marker. **The existing run has already started: it cannot be resumed or launched a second time.**

**Evidence to inspect.** Paths below are relative to this directory; outputs appear as execution reaches the corresponding stage.

| Evidence | Meaning |
| --- | --- |
| `PRE-RUN-REVIEW.json`, `ENDPOINT-EVIDENCE.json` | Accepted implementation review and separate serving probe |
| `run-local/manifest.json`, `run-local/manifest.sha256` | Sealed inputs, dependency hashes and request ceiling |
| `run-local/fixtures.json`, `run-local/jobs.json`, `run-local/config.json`, `run-local/pairs.json` | Exact cases, prompts, settings and transformation comparisons |
| `run-local/started.json`, `run-local/dispatch.jsonl`, `run-local/calls.jsonl` | Single start, dispatch intent and actual request/response receipts |
| `run-local/results.jsonl`, `run-local/transformations.json` | Extracted candidates, validation errors, field checks, operation results and reader answers |
| `run-local/complete.json` or `run-local/stopped.json` | Execution outcome; completion still leaves semantic review pending |

The original capability probe, failed 007 request and repaired capability probe remain separate from the 72-request battery. Discovery checks and service recovery are separate operational evidence. The parent authors final counts and findings from the preserved records; this document asserts no study outcome.

**Failure handling.** A request/served-model error stops further dispatch and records a stopped receipt when the runner can handle the failure. A killed process may leave dispatch intent without a response or stop marker: treat that as uncertain execution, not permission to retry. The execution owner preserves every marker, raw receipt and partial result, diagnoses locally, and coordinates recovery of the existing service before considering another declared study. Never delete start markers, overwrite outputs or rename directories to conceal attempts.

A rejected extraction remains a result: its structured reader receives the frozen unavailable-memory fallback, while the prose comparison and remaining diagnostic battery continue. Do not repair JSON, truncate an overlong string, change a semantic field from gold, switch models, add samples or tune prompts inside this run. Every failure and spent request remains in the totals.

**Interpretation.** Serving omits only string `maxLength`; full schema instructions and local binders retain the caps. Valid syntax and caller-generated source references do not establish entailment. Correct prototype computation does not establish useful memory. Assess contract validity, source fidelity, unsupported assertions, uncertainty and reader behavior separately, and report development and confirmation separately. This readiness comparison does not isolate mathematical contribution or demonstrate context savings and repeated-use benefits.

**Future revisions.** Changes after observing outputs require a declared revision, independent review and fresh confirmation material where needed; observed confirmation cases become development data. In that reviewed revision, prepare a new output directory, verify its seal, then run exactly once. This new `OPERATIONS.md` is absent from 008's sealed source list, so current verification remains tied to the original list. A future `prepare` scans every local `.ts` and `.md`, including this document, and therefore needs corresponding review hash coverage. Do not rewrite 008's accepted review or manifest to accommodate a later study; preserve this run and version the next one explicitly.
