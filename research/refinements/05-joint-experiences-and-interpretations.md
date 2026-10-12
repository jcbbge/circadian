# 05 — Joint experiences and interpretations: implementation and test refinement

**Status:** Implemented as an independent research prototype with deterministic fixture checks and outside peer review. No production integration or behavioral inference evaluation. Builds on [dossier 05](../05-higher-order-relations.md), the [shared-experience example](../worked-examples/02-shared-experience.md), and [shared protocol](TEST-PROTOCOL.md).

[Implementation](../prototypes/05-experiences/index.ts) · [Demonstration](../prototypes/05-experiences/demo.ts) · [Case coverage](../prototypes/05-experiences/coverage.json) · [Run instructions and results](../prototypes/README.md)

## Useful operations and improvement

Keep two independently useful operations visible: find an evidenced joint occasion, and follow attributed reinterpretations of that occasion. A dinner can remain one experience rather than a collection of pairwise associations. A reflection weeks later can remain reachable even when it repeats none of the original names. A concert remembered differently after a loss can retain both accounts without declaring either the final meaning.

The peer sharpened the interpretation link with a concrete boundary check: the same occasion and the same question. The parent narrows several claims. Co-occurring names already belong to source-bearing retrieval units; the addition must earn its cost through evidenced participation, roles, occasion separation, or checked interpretation links. Mention is not evidence of absence. Attending the same long event does not by itself establish simultaneous presence. These distinctions become explicit cases.

## Research prototype and design sketch

The prototype uses source-referenced reviewed fixture records supplied to ordinary functions. No graph database or global person registry is required. The following is the design-level API sketch; exact local signatures, source-state inputs and combined limits are in the linked implementation.

```text
Occasion: source path + optional local span ID, participants with evidence/roles,
          mentioned people, known co-presence evidence, optional event time
Interpretation: ID, occasion reference or unresolved candidates,
                local question ID, attributed author, source span/revision
Revisit: earlier/later interpretation references, source-backed account of the relation

jointOccasions(people, occasions, eligibility, limits)
  → evidenced co-participation / unknown identities / coverage
checkRevisit(a, b, relationEvidence)
  → sameBoundary | mismatchedBoundary | unknown
recallOccasion(id, records, eligibility, depthCap, recordCap, budget)
  → narrative references, roles, attributed accounts, unresolved links, coverage
```

Algorithm:

1. Resolve supplied sources, versions and eligibility. A quote occurring in a source checks textual presence only; reviewed participation/interpretation labels supply the initial semantics.
2. Match requested identities against evidenced participation in each occasion. Keep repeated occasions distinct. Return co-participation; answer a stronger simultaneous-presence question only with supporting interval or narrative evidence.
3. Check an interpretation relation's endpoints against **exactly the same resolved occasion and local question ID**. A broad label such as `why-it-mattered` is insufficient to identify a question. Unresolved occasion or question identity gives `unknown`; different endpoints give `mismatchedBoundary`. Cross-question associations can remain ordinary references without masquerading as this checked relation. Authorship labels the interpretation; it is not part of the (occasion, question) boundary. A sourced reflection by someone whose participation is unknown is legitimate without implying that they attended. Boundary equality alone does not create a revisit: a relation still needs its supplied source-backed account.
4. Traverse valid revisit links from the selected entry seeds with a visited set and explicit depth, record and output caps. Preserve author, source and event-versus-reflection time. Source-date ordering is a presentation choice, not proof of causal succession. Account for every relevant interpretation in the already bounded accepted population: an eligible account not emitted is `omittedFromSelectedView`, with incomplete coverage; stale/unavailable/ineligible accounts retain those actual reasons. This neutral reason covers both unreached and reached-but-unemitted accounts. It does not infer a missing link or a particular traversal failure. Never choose a winning interpretation.
5. Keep the original narrative reachable. Do not synthesize a separate two-person meeting from a subset of a dinner's participants, infer a cause of the narrator's feeling, or impose an interpretation on everyone present.

This supplies incidence and one globular-inspired boundary invariant. It does not implement higher composition, simplicial closure or an inference rule saying a filled shape proves an event. A plain typed link with the same endpoint check is a valid minimal implementation of the proposed mathematics.

## Fit, cost and independence

Existing episode paths and index unit references are sufficient source doors; see the [source map](SOURCE-MAP.md). Optional derivation after an episode is committed avoids changing SLEEP's established outputs. A later consumer can use the records during relevant recall; no mandatory global-wake scan is required. The current lifecycle has no general plugin callback to assume.

One file per occasion is a possible persistence layout, not a requirement or implemented config. If later reflections live elsewhere, discoverability needs either an updated occasion file or a reverse index. Count that maintenance and its reads; the peer's claim that recall automatically reads only linked files is not established. A fixture first supplies the bounded population explicitly. No new always-on service is needed.

Each operation works without proposals 01–04 or 06. Turning it off invokes neither selection nor model calls and leaves ordinary output unchanged; it need not delete previously created files. Any persistent quotes, question labels or relationship descriptions carry a deletion obligation. Checking source availability at read time prevents some resurfacing but is not erasure of those copies. Existing atom erasure does not automatically cover them.

Rare meaningful experiences are not retired because they were seldom retrieved. This proposal adds neither a retention score nor a productivity requirement.

## Concrete cases

Fictional fixture: `D1` records narrator, Mira and Noor together at dinner; Noor cooked. Dana was discussed, with attendance unspecified. `D2` is another dinner with the same participants, where Mira cooked. `I1` and later `I2` answer local question `Q1: how did narrator understand D1's silence?`; only the narrator reports feeling at ease. `I2`'s source says “I now think permission to say nothing mattered most,” without names or “dinner.”

| ID | Input / operation | Exact expected result |
|---|---|---|
| H01 | Three pairwise occasions versus D1; query all three people | No joint occasion in the pairwise fixture; D1 in the shared fixture. |
| H02 | D1 and D2, same group | Two distinct occasions with separate roles; Noor cooked D1, Mira cooked D2. |
| H03 | Query Dana with Mira at D1 | No supported co-participation; Dana's attendance remains unknown, not absent. |
| H04 | Ask how everyone felt from narrator's I1 | Narrator's reported feeling returned; others' feelings unknown. |
| H05 | Selected-seed recall of supplied D1 accounts with reviewed same-boundary I1→I2 link; then remove the link | Both accounts are traversed with the link. Without it, I2 is reported `omittedFromSelectedView` and coverage is incomplete. The supplied occasion IDs already identify I2 as relevant; this checks relation traversal and omission accounting, not lexical discovery. |
| H06 | I1 about D1/Q1, I3 about D1/Q2 | Checked revisit rejected for question mismatch; ordinary association may remain. |
| H07 | Two questions both labelled “why it mattered,” with different local IDs | Label equality does not create a valid boundary. |
| H08 | “That dinner” could mean D1 or D2 | Candidate occasions retained with an unresolved relation; neither gets a confirmed reinterpretation. |
| H09 | I1→I2→I3→I1; depth 2; record cap 3 | Termination, cycle/truncation markers as encountered; no duplicate rendered account or traversal beyond caps. |
| H10 | Delete D1's source; retain I2's independent eligible source | D1 unavailable; I2 may remain an attributed reflection with an unavailable target, never reconstruction of D1's removed text. |
| H11 | Zero later use of D1; unrelated ledger decay events | D1 remains eligible under the supplied source policy; operation introduces no usage-based deletion. |
| H12 | Query each pair within D1 | Answer “co-participants at D1”; stored occasion count remains one, with no invented pairwise events. |
| H13 | Mira attended festival morning; Noor attended evening | Shared event attendance may be reported; simultaneous presence unsupported. |
| H14 | Source bytes change or person identity becomes unresolved | Dependent reviewed annotation marked stale/unknown; no unqualified old participation answer. |
| H15 | 1,000 supplied occasions, input cap 20, target beyond cap | Bounded inspection and incomplete coverage; never an exhaustive “no occasion exists.” |
| H16 | Dana later interprets D1/Q1; a reviewed source supports the relation to I1, but no attendance evidence exists | sameBoundary; recall labels Dana as author and attendance unknown. Dana is not added as a participant. |

For H09, traversal order is stable by reference ID; separate fixtures cover a cycle within the cap and a cap preventing its discovery. The latter reports incomplete traversal, not a falsely detected cycle. H05's original anchorless-reflection motivation remains a future retrieval/reader question: this supplied-population prototype cannot establish an advantage over direct occasion lookup, which already knows I2 belongs to D1.

## Comparisons and benefit

Compare A ordinary narratives/index access, B the **same** occasion/interpretation records with competent ordinary incidence queries and links, C those records with the specified endpoint check and bounded traversal. Incidence may already be equivalent in B; do not pretend a new name improves it. Compare valid and mismatched links to isolate boundary checking. Report participation, retrieval and narrative outcomes separately.

First behavioral set: **H02/H05 positive; H04/H08 challenge**, under the shared 24-trial proposal (at most 48 reader calls). Measures: correct occasion/role recall; retrieval of supported anchorless reflections; invented attendance; mistaken group attribution; unresolved identity handled faithfully; preservation of both accounts and uncertainty. Cost includes annotation, reverse-link maintenance, records read, context and any extra call. Meaningful narrative loss can outweigh a structural pass.

No classifier is needed for reviewed records. A separate no-Jev/Jev arm could test participation versus mention and occasion/question alignment. It cannot infer another person's feeling from the narrator's report. Open design choice: author-created local question IDs versus later reviewed alignment; measure alignment effort before building a universal question taxonomy.
