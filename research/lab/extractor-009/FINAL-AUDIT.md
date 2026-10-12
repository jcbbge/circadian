# Final independent evidence and claim audit

Disposition: **READY for parent acceptance.** The reported material counts and conclusions reconcile with retained artifacts. No additional inference or source changes are required by this audit. One nonblocking semantic-scoring inconsistency is recorded below; it does not change the headline counts.

## Independent checks

I joined `review-map.json`, final `semantic-scores.json`, `results.jsonl` and `calls.jsonl`, checked review coverage, and recomputed the reported counts. Strict success requires a consumable preparation, no failed critical field check, passing preparation and reader meaning without critical errors, and reader packet support with no unsupported claims.

| Measure | 008 | 009 |
|---|---:|---:|
| Retained study calls / unique call IDs | 72 / 72 | 36 / 36 |
| Consumable structured preparations | 13/18 | 15/18 |
| Structured preparation meaning | 16/18 | 15/18 |
| Structured reader meaning | 8/18 | 12/18 |
| Strict end-to-end success, as defined above | 8/18 | 11/18 |
| Prompt tokens | 35,411 | 23,093 |
| Completion tokens | 6,462 | 3,080 |
| Sum of recorded request durations | 170.318 s | 45.558 s |
| Structured extraction duration sum | 103.639 s | 30.604 s |

All 108 successful study records have HTTP 200, the requested local model, and finish reason `stop`. Every output is below its 2,048-token completion cap. Score coverage is exactly 72 and 36 mapped calls, respectively. 008 has the two documented adjudication changes; 009 final scores equal its initial scores.

The eight 006 case IDs all recur in 009: consumability is 1/8 in 006 and 8/8 in 009. The report correctly calls this an exposed-case engineering regression check, not an isolated treatment effect. The historical 008 prose comparator is 11/18 preparation meaning and 17/18 reader meaning. It was not rerun in 009.

## All six additions reached their relevant code paths

| Addition | Evidence and limit checked |
|---|---|
| 01 — Views | `makeView` ran; both 009 cases retain qualifications. Success does not demonstrate a context-budget benefit. |
| 02 — Contextual compatibility | `compareContexts` ran for three cases, separating disjoint applicability and detecting the shared pump conflict. Descriptive source labels are missing from the packet contract, so one requested attribution remains incomplete. |
| 03 — Attributed reports | `composeReports` ran for four cases. The two unknown-setting cases in 009 wrongly promote recording location into event location; the reader repeats the mistake. |
| 04 — Multi-input operations | `instantiate(shared-afternoon)` ran on complete 009 inputs and produced `[800,825]` and `[866,889]`. In 008 the missing second participant prevented a shared plan. The 009 confirmation answer gets the requested planning facts right but adds unsupported pronouns. |
| 05 — Higher-order relations | `recallOccasion` and `jointOccasions` execute for the lantern case in 009. The kite preparation still incorrectly places Bex among participants and is rejected. |
| 06 — Meaning-preserving transformations | 009's development pair reaches the actual `checkPresentation` operation: the modality check fails for `might` to `always`. Its other two pair comparisons remain unavailable due to quote-binding failures. All three 008 comparisons are unavailable. The operation checks annotated fields, not unrestricted semantic equivalence. |

## Claim boundaries and accounting

The results preserve the distinction between valid/consumable data, assigned meaning, downstream answers, and whole-answer support. They identify exposed fixtures, short fictional material, partial blinding, one sample per condition, and the reused historical comparator. They make no supported claim of population-wide superiority or causal identification. The recommendation for ordinary JSON plus the existing strict validator is explicitly a research starting point; default Circadian and production memory behavior are outside this work.

Attempt accounting is consistent with the retained failed 007 attempt, the two successful non-study probes, and the two completed studies: `1 + 2 + 72 + 36 = 111`. Discovery GETs, service recovery and reviewer work are explicitly separate. This is the bounded repair effort's accounting, not a count of every experiment ever run.

Test claims match the retained receipts: `focused-tests.txt` records 65 pass; `full-tests.txt` records 970 pass, 21 skip, 0 fail before the serving-only delta; `008-focused-tests.txt` records 71 pass and 982 assertions after it. The reports do not imply that the full suite was rerun after that delta or that these checks establish production readiness.

## Nonblocking scoring consistency caveat

008 `confirm-t68/read-structured` (review item 46) uses “she” for Asha without that information in its actual packet, but its final packet-support score is true with no unsupported claims. 009's corresponding item 22 marks gendered pronouns unsupported. This is an inconsistent peripheral support judgment. The 008 case already fails strict success because its preparation omits Bram and its answer fails the requested meaning; applying 009's pronoun standard to it leaves strict **8 versus 11**, reader **8 versus 12**, and all other reported headline counts unchanged. The parent has now explicitly disclosed this comparability limitation in 009 `RESULTS.md`, preserving the original judgments. No broad rescoring or rerun is justified by this finding.

## Sources and integrity

Inspected sources are the 008 and 009 `RESULTS.md`, 009 `README.md`, both runs' raw call/case records, review maps, initial/final semantic scores, assessments and transformations, their semantic review reports, 008 `ADJUDICATION.md`, and 006's retained case results. Test receipts are in this report's private directory. The two serving probes and the preserved failed 007 record support attempt accounting.

Both read-only verification commands passed during this audit:

- `bun research/lab/extractor-008/runner.ts verify research/lab/extractor-008/run-local` — frozen run and inherited experiment verified.
- `bun research/lab/extractor-009/runner.ts verify research/lab/extractor-009/run-local` — frozen serving ablation verified.

I also independently recomputed every entry in each current output seal: 008 has 20 entries, 009 has 19, with zero mismatches.

SHA-256 bindings for the audited bytes:

| Artifact | SHA-256 |
|---|---|
| 008 `RESULTS.md` | `5e5926f738353a13be919c39b1505be837a9d0423f1d71b1c9f485247505aecd` |
| 009 `RESULTS.md` | `7cc31228be65bacb23ba81c17e3d2a8a3bec4cfe2a82116919951fb26b49b16d` |
| 009 `README.md` | `a386ee98fc5b8caa8509eae180c8d25f19ac929e7c143d80974885161af85678` |
| 008 `run-local/calls.jsonl` | `6b6399aced2fbd72b815ff070278e3201441ee7a70bdcc4dc0448859539274a9` |
| 009 `run-local/calls.jsonl` | `437a1e1a7de3b906ca7d79b9a54f0b06029d46329e8ac48a89146016acdb97c3` |
| 008 `run-local/OUTPUTS.sha256.json` | `b76ee5c2c314877fc9b952b3ef89949031dbe71815523d239538e65c1caf07d2` |
| 009 `run-local/OUTPUTS.sha256.json` | `76993ac204e22a50ce985056d48949267f1c4b81793e6717239664e85221124f` |

Parent acceptance still requires checking its final seals/index links and final repository boundaries after any concurrent documentation edits. This report records verification, not parent acceptance. Only this report was written; no inference or source mutation was performed.
