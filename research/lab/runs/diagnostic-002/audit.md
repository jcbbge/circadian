# Independent diagnostic 002 results audit

**Verdict: the reported counts are correct; the progression gate passed; no material integrity, scoring, or explicit gold-leakage defect was found.** Compact-answer capability is demonstrated on these four authored situations. Selector superiority is not established.

I read `analysis.json`, then independently reconstructed choices, actions, source delivery, exact support, model usage, and call counts from all three phases’ raw requests/responses and frozen gold. I inspected all strict-support failures. No inference, network calls, tests, or repository changes were performed.

## Integrity and progression

Manifest seal, gold/bundle hashes, and both code hashes (`diagnostic.ts`, `harness.ts`) match. Recorded trial orders match frozen bundles; per-phase call sequences are contiguous. There are 96 trial records and 117 requests: 48 diagnostic, 37 baseline, 32 assisted. All phases completed with zero recorded errors and no missing reported usage.

All 101 reader requests/responses report the frozen reader identifier; all 16 selector requests/responses report `jev-1.13.0`. This checks reported identities, not unexposed weight revisions. Every inference body matches the permitted fields, prompts, evidence, and answer options. No gold choices, rationale, reviewed support, case IDs, or hidden previous-turn context enter requests. No authorization/API-key fields were present in the audited call bodies or responses. This audit does not independently certify unrelated test artifacts.

The diagnostic completed all 48 required calls. Sufficient-view capability was **8/8 correct and strictly supported**; missing-view capability was **8/8 abstentions**. Thus the frozen progression rule passed. Reporting capability as merely “8/16 correct” would obscure its eight appropriate abstentions.

## Diagnostic behavior

| Routing condition | Sufficient views | Missing views |
|---|---|---|
| Field absent | 8/8 correct answers; 6/8 strict support; no expansion | 6 expansions; 2 wrong unsupported answers |
| `source_complete: false` | 8/8 correct answers; 6/8 strict support; no expansion | 8 expansions; no answers |

The absent-field guesses occurred on collage-title, repetition 1, and anniversary-greeting, repetition 2. Flagged routing avoided those errors here while retaining sufficient-view answers. This is a small randomized-condition observation under the frozen wording, not evidence of a universally beneficial flag or an established effect size.

## Whole-policy outcomes

| Policy | Correct | Strict support | Reader + selector calls | Full sources delivered | Mean trial ms |
|---|---:|---:|---:|---:|---:|
| Reader-only, absent field | 13/16 | 11/16 | 21 + 0 | 5 | 664.05 |
| Always source | 16/16 | 16/16 | 16 + 0 | 16 | 496.66 |
| Assisted | 16/16 | 16/16 | 16 + 16 | 8 | 676.41 |

Reader-only failures were two anniversary missing-view trials and collage missing-view repetition 2. Five other missing-view trials expanded and then answered correctly. No sufficient-view trial expanded unnecessarily.

Selector labels were **16/16**: eight sufficient, eight expand. All eight sufficient assisted final requests contain the exact compact view, not the full source; all eight missing-view final requests contain full source. This successfully avoids pilot 001’s universal-source limitation. The selector did not supply answer letters to the reader.

Reported reader input-plus-output tokens were 6,494 for reader-only, 6,088 for always-source, and 5,212 for assisted. Assistance additionally used 12,978 selector tokens. Always-source therefore used the fewest requests and had the lowest observed mean latency; it is the strongest simple comparator for these short sources. Monetary expense was not measured, and different services’ token units are not equivalent text or compute.

## All support failures inspected

Six failures are correct anniversary answers with the verbatim substring “Tessa specifically requested a short voicemail from Noor.” They omit the required sentence’s introductory occasion qualifier: four diagnostic routing trials and two reader-policy trials. In the delivered view, the occasion remains explicit. These fail the preregistered exact-sentence requirement but do not establish semantic misunderstanding. Retain the strict scores and explain this distinction; do not silently regrade.

The remaining five failures are genuine unsupported wrong answers: anniversary guesses of a handwritten card cite only that a request was recorded; collage guesses of “The Blue Stair” cite only that a title names one piece. All quoted text exists in memory, illustrating why quotation alone is insufficient.

## Claim boundary and smallest justified next test

Assistance changes both selection and terminal-reader instructions/permissions. Capability already shows that the constrained reader can use sufficient compact evidence without a selector. The assisted-versus-reader accuracy and quotation differences therefore cannot isolate selector intelligence. Baseline-first blocks also confound timing comparisons; four situations and repeated cases establish no general memory reliability.

The cheapest unresolved candidate is **flagged reader-only routing with actual expansion**, which stage 1 did not execute end-to-end. Test it against absent-field routing and always-source on a small, independently authored fixture set with balanced answer positions, frozen prompts, fresh contexts, and interleaved conditions. Preserve mechanical versus semantic support scoring. Establish whether this simpler policy fixes premature guessing before another selector comparison. No production integration or mathematical layer is justified yet.
