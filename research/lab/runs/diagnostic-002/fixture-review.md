# Independent fixture and runner verification

**Verdict: fixtures and protocol pass; correct one material scoring mismatch before freezing the run.** Inspected all four fixtures, `diagnostic.ts`, and `DIAGNOSTIC.md`. No inference, network requests, or repository edits were performed.

## Required scoring correction

`diagnostic.ts:115` currently defines sufficient-input `decisionCorrect` as `answerCorrect && decisiveSupport`. That duplicates answer/support performance instead of independently scoring whether the reader chose the appropriate action, contrary to the protocol’s separation of choice, decision, and support. For example, answering from sufficient evidence but quoting the wrong sentence should record an appropriate answer action and failed support; it currently records failed decision correctness too.

Define action correctness independently: on sufficient delivered evidence, `decision.action === 'answer'`; on insufficient evidence, the expected action is `expand` when retrieval is available and `abstain` otherwise. Keep `answerCorrect`, `quoteFromMemory`, `decisiveSupport`, and `supportedAnswer` unchanged. The progression gate should continue using `supportedAnswer`. Alternatively, preserve the present composite under an explicitly different name and add the independent action metric. This is a measurement correction, not a change to the authorized progression rule.

## Fixture confirmation

| Situation | Gold | Decisive fact | Missing-view judgment |
|---|---|---|---|
| Anniversary greeting | A | Tessa requested a short voicemail from Noor for this anniversary. | Request context does not identify its form. |
| Collage title | B | Jules chose “Under the Table” for the final collage. | Label preparation and placement do not identify a title. |
| Tree practice | C | Davi selected the violet envelope first. | No color preference or ordering convention remains. |
| Picnic meeting | D | Mina designated the east fountain. | Planning context and absence of updates do not identify a landmark. |

Each support sentence occurs exactly once in both source and sufficient view. Each degraded view is exactly that sentence’s deletion after whitespace normalization. Copying the decisive sentence satisfies the implemented quotation/support checks. Sources and gold are coherent; none of the remaining prose establishes the requested concrete answer. The collage deletion leaves a dangling “This,” which is a visible deletion cue but supplies no answer and is not blocking.

## Protocol and runner confirmation

Routing instructions permit expansion based on insufficiency regardless of metadata presence; the two routing conditions differ only by `source_complete: false`. Gold, rationale, case ID, and reviewed support are excluded from inference payloads. Independent requests, sealed inputs/code, request caps, and failure accounting are implemented.

`comparisonReady` requires 48 error-free records and all eight sufficient capability trials supported. Not requiring missing-view abstention is consistent with the documented objective of testing selectors against premature guesses. No stricter gate is necessary.

Limits remain four easy authored situations, lexical-support scoring, reused cases, baseline-first policy blocks, and different policy retrieval permissions. Those are declared exploratory boundaries, not further blockers.
