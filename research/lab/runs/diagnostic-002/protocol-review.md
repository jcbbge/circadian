# Independent diagnostic protocol review

**Verdict: proceed after two narrow protocol revisions.** Fresh contexts, matched sufficient/degraded views, fixed reader, interleaving, and separate evidence/choice/decision scoring address the first pilot’s central failure. The arithmetic is correct: 48 diagnostic requests; the proposed later policies require at most 64 reader plus 16 selector requests. Reviewed the supplied brief and the relevant RESULTS, README, and existing harness sections; no new fixtures or diagnostic implementation were available to inspect.

## 1. Freeze equal retrieval permissions and the scope of the policy comparison

The existing `harness.ts` system prompt permits expansion conditionally on `source_complete is false`. Reusing that clause when the field is absent would change the decision rule, not merely its presentation. Both diagnostic routing conditions must explicitly permit expansion whenever supplied evidence is insufficient, independently of field presence. Missing metadata must not assert completeness. Keep source text, options, instructions, retrieval availability, and any stated cost identical. Do not interpret a difference as a pure flag effect if the permissible actions differ.

For the later policy stage, the assisted reader is constrained to answer/abstain, whereas the reader-only policy can request expansion. This is legitimate as an end-to-end comparison of **whole policies**, but a reduction in unnecessary expansion cannot be attributed to selector intelligence alone: the design also removes that reader action. Preserve reader-only routing as the strong baseline; do not handicap it with a compulsory extra call. Use the already-frozen capability probe as a descriptive no-selector, constrained-reader reference, and acknowledge its separate block. Match terminal answer/abstention and support requirements wherever applicable. Charge every router/source-reading call. Baseline-first order remains a limitation for all causal comparisons, not only latency.

## 2. Make progression and support judgments executable before looking

“Capability works” is not yet a decision rule. Predeclare a numeric gate and failure disposition. For this deliberately small mechanism check, a defensible strict gate is all eight sufficient-view capability trials giving supported correct answers, all eight degraded-view trials abstaining, and no infrastructure/schema failures. This is a proposed progression rule, not a statistically justified threshold. Any failure stops the selector stage for diagnosis; preserve the failed version and require a new frozen protocol for revisions.

Review that each sufficient fixture can actually meet the exact-sentence requirement. If support spans multiple sentences, allow a predeclared set of spans or redesign the fixture before running. Score quote fidelity separately from whether the cited evidence licenses the answer. Missing-view guesses remain unsupported even when the option is correct. Freeze what counts as abstention versus an evidence-supported “unknown” answer.

With these revisions, no additional safety or architecture machinery is needed. The reused cases can discriminate mechanisms; they cannot establish generalization, reliable calibration, or a production benefit.
