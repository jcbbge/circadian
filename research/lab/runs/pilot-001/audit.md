# Independent results audit

**Verdict: the tentative counts and restrained interpretation are supported. No material scoring error or explicit gold leakage found. No integration is justified.** I read `analysis.json`, then independently recomputed outcomes and usage from both raw call files and matched them to frozen gold, bundles, and result rows in `research/lab/runs/pilot-001`. No inference was performed.

## Confirmed results

| Measure | Baseline | Assisted |
|---|---:|---:|
| Trials / correct / operationally grounded | 72 / 72 / 72 | 72 / 72 / 72 |
| Each view arm | 24/24 | 24/24 |
| Each domain/pair | 12/12 | 12/12 |
| Each repeat | 36/36 | 36/36 |
| Reader calls | 120 | 104 |
| Selector calls | 0 | 72 |
| Reader-triggered expansions | 48 | 32 |
| Selector-triggered expansions | 0 | 16 |
| Mean trial latency | 796.21 ms | 894.92 ms |
| Reported input + output tokens, all models | 40,572 | 91,470 |

There were zero recorded errors and no missing usage flags. Actual calls total 296, below the 360 cap. Selector classification matches gold on 56 sufficient and 16 expand trials: **72/72**. This includes 24 complete-source reference trials and 48 compact-view trials; there are no unknown-gold cases.

Every final reader request contains the complete source. All 48 compact trials expand in each round. In baseline, the reader requests all 48 expansions, including 32 unnecessary under the frozen labels. Assistance preempts the 16 necessary expansions; the reader still requests the other 32 despite correct sufficient classifications. Thus “16 reader calls saved” is accurate; “16 source expansions avoided” would be wrong. Total requests rise from 120 to 176.

Assisted reader usage is 36,284 tokens, saving 4,288 reader tokens. Selector usage adds 55,186 tokens, for a net increase of 50,898 reported tokens. These are provider/model-reported quantities, not comparable monetary costs or a matched-compute experiment.

## Integrity and explanation checks

The manifest seal and frozen gold/bundle hashes match. Trial order is identical across rounds; call sequences are contiguous. Request and response model identifiers match the declared reader and `jev-1.13.0`; that verifies reported identity, not otherwise unexposed weights.

I checked every recorded request against allowed fields and frozen content. Reader requests contain only the fixed system prompt, memory, source-complete flag, question, and options. Selector requests contain only the specified source/view/question/options and classification instructions. No gold keys, rationales, case IDs, or sufficiency labels enter inference. The answer options necessarily contain candidate answers; this acknowledged assistance is not hidden gold leakage.

I inspected 24 final explanations: both variants in every domain, plain arm, first repeat, across both rounds. They support the selected answers and preserve the decisive distinctions in these cases. This sample does not certify every explanation or free-form narrative fidelity.

## Claim boundaries and next step

The +98.71 ms mean difference is descriptive: baseline-first scheduling prevents attributing it cleanly to assistance. Small authored paired cases, ceiling performance, no unknown class, and no held-out histories preclude general accuracy or reliability claims.

Compact-view answer fidelity was not isolated: after expansion, the reader receives a fresh source-only request. The sufficient selector decision is not communicated to the reader; retaining the compact view still leaves `source_complete: false`. Therefore persistent over-expansion is not evidence that the selector misclassified sufficiency. Flag wording, prompt behavior, or uncertainty could explain it; none is established causally.

A next protocol should separate first-pass answer capability from expansion policy, vary completion-flag/prompt treatment, include harder held-out sources, and compare unconditional source delivery. Preserve genuinely missing-detail cases. The supported finding is accurate selector classification on these fixtures with fewer reader calls, greater total recorded resource use, and no demonstrated net benefit—not a production recommendation.
