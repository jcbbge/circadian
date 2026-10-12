# Diagnostic runner test report

Status: reported for independent parent acceptance. No remaining blocker found in the exercised protocol paths.

## Scope and evidence

Implemented `/Users/jrg/circadian/research/lab/diagnostic.test.ts` under the adjacent test-engineer brief. Root retained ownership of `diagnostic.ts` and `harness.ts`. This assignment changed only the owned test file and this report. No model inference, commits, provider configuration changes, or product lifecycle changes were performed.

Read the diagnostic runner and existing harness tests. The test suite uses four fabricated notebook-choice cases, one correct answer per option, with the missing view formed by deleting exactly the decisive support sentence. It does not load the study fixtures, measured results, or private memory. Each test replaces global `fetch` with a throwing guard and asserts zero fetch calls. Runner artifacts live in temporary directories removed after each test.

Executed from `/Users/jrg/circadian`:

```text
bun test research/lab/diagnostic.test.ts
bun test v1.3.14 (0d9b296a)
19 pass
0 fail
1402 expect() calls
Ran 19 tests across 1 file. [85.00ms]
```

This run followed the root's final scoring correction and corresponding regression additions. No broader suite was rerun by this assignment.

## Verified behavior

- Fixture validation rejects unbalanced options, changes beyond exact support deletion, and duplicate decisive support.
- The diagnostic produces 48 fresh, two-message reader requests: 16 per probe, eight per probe/view. The two routing conditions differ only by `source_complete: false`; neither gold fields nor rationales are sent. Compact input excludes source-only detail. Diagnostic expansion decisions do not secretly retrieve the source.
- Answer correctness, quoted evidence, decisive support, and action correctness remain distinct. A correct option without available evidence fails grounded credit; a quotation from another source fails; an irrelevant quotation from the supplied memory fails. On sufficient input, a wrong option or wrong quotation can still earn correct-action credit while failing supported-answer credit.
- Comparisons are blocked before diagnostic completion and when sufficient capability fails. A dedicated regression gives all eight sufficient capability trials the correct action but only seven a supported answer: progression remains blocked. Assisted comparisons also require completed baseline trials.
- With the fabricated ideal responder, baseline completes 32 trials using 40 reader calls: only the eight missing-view reader-policy trials expand. Always-source uses one reader call per trial. Assisted policy completes 16 trials with exactly 16 selector calls and 16 final reader calls. There is no hidden reader override when the selector incorrectly says sufficient. Unknown selector decisions expand.
- Wrong-model, malformed-JSON, and invalid-schema responses remain recorded failures, stop after three consecutive errors, and are not retried. Transport failures and responses without usage mark usage as missing instead of silently representing the total as known.
- Changed input, bundle, or manifest bytes fail before transport. A separately exercised code-hash check rejects an incorrect expected digest without editing shared source. Preparation, phase results, and summaries cannot overwrite existing artifacts.
- A reflected synthetic secret is redacted from both call and parsed-decision artifacts while preserving readable JSON. The test restores the original environment value without printing it.

## Defects and resolution

This review found that the initial decision parser accepted a JSON array such as `choice: ["A"]` because property-key lookup coerced it to a string. Reported to root; root added the explicit string check. The regression now passes, including the runner's durable schema-failure path.

An independent reviewer found that `decisionCorrect` initially conflated choosing the correct action with answering correctly and supplying decisive evidence. Root separated the action score from the other measures. This suite now explicitly covers that separation and confirms the progression gate continues to require eight supported sufficient-capability answers. These runner fixes were made by root, not this test assignment.

## Tested artifact fingerprints

SHA256 values acquired after the passing run:

```text
18d895b48bbcf09458f762b0dc828d73a55bb583e29baaf9fb09cb58bfbb4848  research/lab/diagnostic.ts
4717087324ecd33b2c43ce7be72626fdfd819881ca0ca11554218af2f4ae1d8a  research/lab/diagnostic.test.ts
7d86a6915b48892f42a35d319266e8ed8480af1345ac91e95538a582d975c2b6  research/lab/harness.ts
```

## Limits

These tests establish mocked runner behavior, not endpoint compatibility, real-model competence, semantic validity of the author's study labels, measured cost, or scientific benefit. Exact decisive-sentence matching is a deliberately narrow scoring proxy rather than general semantic verification. The progression gate establishes supported answering on sufficient capability inputs; it does not require successful missing-evidence routing. Hash sidecars catch protocol drift, not coordinated adversarial rewriting of both artifacts and their checksums. Redaction was tested with a fabricated secret, not real credentials. Independent parent inspection remains required before acceptance and inference.
