# Local full-model extraction calibration 006

**Completed locally: 32 requests, eight source bundles covering all six optional additions. Promotion stopped at the declared calibration gate.** Circadian's production lifecycle was not changed.

Start with [results and interpretation](RESULTS.md). The served model was `mlx-community/Qwen3-30B-A3B-Instruct-2507-4bit`; the cancelled remote endpoint received no study requests.

- [Frozen protocol](PROTOCOL.md), [fixtures](FIXTURES.json), [configuration](local-config.json), and [endpoint evidence](ENDPOINT-EVIDENCE.json).
- [Outside peer assessment](PEER-PRE-RUN.md) and [accepted corrections](PRE-RUN-REVIEW.json).
- [Independent semantic review](SEMANTIC-REVIEW.md), [adjudication](ADJUDICATION.md), and [final aggregate](run-local/assessment.json).
- [Raw requests and responses](run-local/calls.jsonl), [decoded results](run-local/results.jsonl), and [sealed manifest](run-local/manifest.json).
- [Comparator limitation](run-local/presentation-audit.json), [tests](TESTS.json), and [closure verification](VERIFICATION.json).

The earlier `complete.json` and `mechanical-results.json` records were written before semantic review. Their pending-review labels are historical; the final aggregate records completion without rewriting execution evidence.

Safe verification, without inference:

```sh
bun research/lab/extractor-006/runner.ts verify research/lab/extractor-006/run-local
bun test research/lab/extractor-006
```

The runner deliberately refuses to overwrite an existing run. Changed prompts, model settings or fixtures need a new declared experiment; this completed run must not be repaired in place.
