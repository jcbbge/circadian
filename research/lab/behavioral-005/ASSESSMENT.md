# Assessment after the frozen run

**The study is complete; it does not establish a dependable behavioral gain for any of the six additions.** Keep the existing research implementations and their narrow contracts. This run supplies no basis for promoting them into Circadian's default lifecycle, adding a mandatory classifier, or building a general extension framework.

All 72 reader trials and 24 annotation calls completed without a transport or model-identity failure. Strict end-to-end passes were **5/24 baseline, 6/24 augmented, 8/24 Jev-assisted**. These scores combine the frozen semantic, citation and output requirements. They are not a simple count of correct versus hallucinated memories. The [full results](RESULTS.md), [blinded review](SEMANTIC-REVIEW.md) and [source-bound raw artifacts](run/summary.json) explain each result.

## All six remain in view

| Proposal | Baseline / augmented / assisted, out of four | What the paired cases actually show | Present disposition |
| --- | --- | --- | --- |
| **01 — Coordinated views** | 1 / 1 / 1 | The ordinary location answer passed throughout. The substantive book-club case still confused a remembered noisy occasion with evidence against a quiet preference. No complete-answer repair appeared. | Keep the prototype. No demonstrated added benefit here; context savings and expansion remain untested. |
| **02 — Contextual compatibility** | 2 / 2 / 3 | The assisted untimed-tea case passed. In the finite scheduling contradiction, augmented and assisted readers abstained even with a decisive operation result. | Defer integration. Establish that the consumer distinguishes an impossible assignment from an unknown answer. Correct bounded annotation choice did not settle that problem. |
| **03 — Typed relations** | 1 / 1 / 3 | Assisted responses repaired a malformed coffee answer and the ordinary ferry answer's required details. The recommendation answers largely retained correct speaker/location content but failed stricter contrast requirements. | Defer integration. Separate attribution benefit from response completion and extra-detail compliance before interpreting the score gap as a relation-reasoning gain. |
| **04 — Reusable operations** | 0 / 1 / 1 | The useful scheduling case changed from an invalid time to the correct earliest time in the augmented answer, but invented explanations and unfinished JSON prevented a pass. The complete-answer repair was the ordinary case's citation support. | Preserve the narrow planning mechanism as a candidate. Consumer faithfulness remains unresolved; this does not validate autonomous mnemonic invention or reuse. |
| **05 — Joint experiences** | 1 / 1 / 0 | All three conditions turned unrecorded participation into definite absence in the seed-exchange case. Assistance lost a previously passing identity-uncertainty case through nonexistent citations. Ordinary pottery answers were substantively useful but omitted a rubric detail. | Defer integration. Preserve unknown participation explicitly and distinguish unsupported absence from missing evidence. Do not interpret every strict failure as a lost experience. |
| **06 — Checked transformations** | 0 / 0 / 0 | Several answers correctly identified changed or retained qualifications, but failed format/citation requirements or overstated the checker as proving prose meaning. | Defer integration. Keep structural checks, semantic judgment and historical receipts visibly separate. Zero strict passes does not negate the deterministic checks. |

These are interpretations of individual observations, not measured population effects. The machine-readable report retains the conservative predeclared disposition rule and all newly observed error flags, including additional omissions in answers that already failed.

## What limits this result

**The reader/output setup was a major source of failure.** Twenty-nine of 72 responses violated the output contract. Twenty-two were malformed near the 640-token limit, including repeated text, while all 72 responses reported `finish_reason=stop`. That association does not establish whether the cap, decoding, prompt or serving behavior caused the problem. No settings were changed and no failed samples were replaced.

**The grading contract was stricter than some ordinary questions required.** For example, all three pottery answers correctly named Nia's action and companion but omitted the companion's activity, which the frozen compound rubric required. Several relation answers gave correct recommendations but omitted explicit contrasts. The reviewer preserved these failures and distinguished them from factual errors. Neither post-hoc rescue scoring nor a claim that all failures were hallucinations is warranted.

**Jev succeeded at its assigned subtask.** It chose the frozen expected annotation in all 24 cases, including five conservative fallbacks. The assisted workflow nevertheless passed only eight complete answers and introduced a regression. This supports the feasibility of this tightly bounded choice task; it does not prove autonomous extraction, net value or a reason to call Jev on every memory. Study-only reported token use was 24,319 baseline, 29,206 augmented and 38,221 assisted; setup and reviewer computation are excluded. Later assisted execution also limits latency conclusions.

**The experiment supplied full sources and structured annotations.** It measures consumption of an additional operation result, not automatic capture, full default Circadian behavior, selective retrieval or context-window savings. Four cases per proposal, one observation and one blinded agent reviewer cannot establish robust superiority or rank the six mathematical ideas.

## The decision this supports

Keep the six [proposed integration boundaries](INTEGRATION-BOUNDARIES.md) as concrete, independently reviewed design constraints. Keep the frozen run as evidence. Stop this assignment here.

If another study is chosen later, first specify a reader/output contract that can deliver the needed complete answers and align each rubric's required detail with its actual question. Make those changes in a new protocol, not in this run. Then test a named consumer and a specific predicted benefit. That is the remaining evidence gap; it is not a defect in working Circadian or a mandate to expand its architecture.
