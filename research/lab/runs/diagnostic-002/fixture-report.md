# Diagnostic fixture author report

Status: authored and mechanically validated; pending root and independent review. No inference, network calls, private-data access, or edits outside the assigned fixture and this report.

Artifact: `/Users/jrg/circadian/research/lab/diagnostic-fixtures.json`.

SHA-256: `69fbf81c370746ed5549f75fc2434c351cc483023f25f2aaa2927b609458a71a`.

## Design evidence and purpose

Read the existing `research/lab/RESULTS.md` and `research/lab/README.md`. Pilot 001 supplied full source before every final compact-arm answer, including compact views already sufficient for their probes. These new cases separate the ability to answer from provided evidence from the choice to retrieve more. Both sufficient and missing views omit unrelated source material, so being an incomplete representation of the source is not itself grounds for expansion.

All four histories, names, requests, and decisions are fictional and newly authored. They are arbitrary episode-specific selections, not questions whose answer follows from general knowledge. Each probe has four concrete options and no explicit unknown option. The support sentence identifies the chosen option; the missing view provides no evidence selecting one of them. Options necessarily name candidate answers but do not contain an attribution or other clue that establishes which candidate was selected.

## Mechanical validation

Python standard-library checks passed for exactly four cases; exact ten-key schema; every value except `options` a string; four A/B/C/D option strings; expected options balanced one each; four distinct required domains; source/support occurrence counts; and word limits. Counts use whitespace-delimited words.

| Case | Source words | Sufficient words | Missing words | Support words | Gold |
|---|---:|---:|---:|---:|---|
| anniversary-greeting | 146 | 50 | 37 | 13 | A |
| collage-title | 152 | 51 | 37 | 14 | B |
| tree-practice | 151 | 48 | 34 | 14 | C |
| picnic-meeting | 147 | 49 | 37 | 12 | D |

For every case, `support` occurs exactly once in the source and sufficient view, with identical wording and punctuation. Exact content-removal check:

```python
missing == ' '.join(sufficient.replace(support, '').split())
```

Only the support sentence is removed; the resulting adjacent whitespace is normalized. No other word, attribution, condition, or punctuation is changed. The full support sentence does not occur in the question, any option, or missing view.

## Gold and missingness inspection

**Personal relationship:** Tessa requested a short voicemail from Noor for this year's shared hiking anniversary. This supports A without generalizing the request to every year. The missing view names the occasion, prior variation, recording after lunch, another birthday, and absence of a new hike. None determines the greeting medium. The full source also contains a separate landscape-photograph recollection; it explicitly belongs to unrelated reminiscing and is not the requested greeting.

**Creative practice:** Jules selected `Under the Table` as the final collage's title for the Riverside showing, supporting B. The support is specific to one artwork, not the whole display. The missing view still establishes label preparation, the individual-piece scope, spelling review, and unsettled placement. None identifies any title. The source's packaging materials, hanging clips, future-series possibility, and storage details do not repeat the chosen title.

**Learning:** Davi selected the violet envelope's exercise to start Thursday's tree-identification practice, supporting C. The missing view identifies the practice, colored envelopes, observation pause, and unsettled location; it explicitly says colors indicate neither difficulty nor required sequence. The violet choice is arbitrary and has no tree-color association. Neither practice content nor general learning advice establishes the chosen envelope. Source-only discussion of materials and a possible later garden visit does not determine the order.

**Everyday planning:** Mina designated the east fountain for Saturday's picnic, supporting D. No later weather-related change is recorded. The missing view preserves that a meeting point was chosen in advance, shared-food planning, and the change policy. It does not identify the location, and neither food sharing nor an unchanged decision selects a landmark. Extra source details about blankets, a card game, departure plans, and the absence of a usual meeting place do not repeat or entail the choice.

## Limits and inference boundaries

- These are diagnostic fixtures, not independently held-out or confirmatory evidence. The author selected the support and wrote the views with the probe known. This does not test unsupervised capture or selecting what will matter for an unknown future question.
- Four episodes are a small mechanism check. They cannot estimate natural failure prevalence, domain performance, or broad model capability. Successful literal selection is intentionally easy when support is present.
- The required sentence deletion shortens missing views by 12–14 words. Fixed-choice answers may be guessed correctly with no evidence. Score grounded initial evidence separately from option accuracy and retrieval policy; a correct guess does not demonstrate adequate memory.
- Both views are incomplete relative to the original, but only one is sufficient for the exact probe. Do not supply `sufficient`, `missing`, `support`, `expected`, or `rationale` as semantic labels or gold fields in model requests. Send the selected view under a neutral field and keep run metadata outside inference inputs.
- Correct-option balance helps guard a constant-letter response but does not eliminate position bias. Case identifiers and domain labels do not encode answer positions; do not expose fixture ordering or the balance rule to inference.
- These cases involve unambiguous reported decisions. They do not test conflicting accounts, nuanced narrative interpretation, stale source changes, spontaneous carry-over, or the lifecycle.

Root and independent reviewer should inspect the missingness judgments before any inference. No evaluation or model result is claimed in this report.
