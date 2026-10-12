# Completed local serving comparison 009

**36/36 requests completed.** The same local model generated ordinary JSON, followed by the unchanged strict validator and reader. Fifteen of eighteen records were consumable; twelve reader answers satisfied their source-level question. [Results and per-addition findings](RESULTS.md) explain the remaining failures and the exact limits of the comparison.

[Protocol](PROTOCOL.md), [accepted independent inspection](PRE-RUN-REVIEW.json), [sealed manifest](run-local/manifest.json), [raw requests/responses](run-local/calls.jsonl), [case results](run-local/results.jsonl), [transformation comparisons](run-local/transformations.json), [assessment](run-local/assessment.json), and [verification](VERIFICATION.json) preserve the experiment. Three independent reviews cover all 36 outputs: [1](SEMANTIC-REVIEW-1.md), [2](SEMANTIC-REVIEW-2.md), [3](SEMANTIC-REVIEW-3.md).

Verify from the checkout with no inference:

```sh
bun research/lab/extractor-009/runner.ts verify research/lab/extractor-009/run-local
```

The run is complete and cannot be resumed. The [operating contract](../extractor-008/OPERATIONS.md) defines ownership, evidence and failure handling; this version's protocol changes the budget to 36 calls and removes native grammar enforcement. [008](../extractor-008/RESULTS.md) supplies the prior serving condition and historical prose comparator. All cases here are exposed development material.
