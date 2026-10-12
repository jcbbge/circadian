> Preserved reviewer report, written while condition assignments were still hidden. The parent subsequently verified the score count, frozen criteria, pass formula and artifact hash before aggregation. The pending-acceptance wording below records the original handoff state.

# Independent blinded semantic review

Scoring is complete for all 72 anonymous answers. The deliverable is `research/lab/behavioral-005/run/semantic-scores.json`. Scores were saved before any arm map, raw call log, trial summary or condition-specific result was read. No additional inference was performed.

All 72 answers were read in full against the supplied sources, question and frozen rubric. For efficient comparison of the same evidence, the anonymous export was grouped by identical question; no condition labels or arm mapping were supplied or reconstructed. This grouping does not make responses independent observations or add replication.

The score file contains exactly one record per anonymous ID, the correct number of required-proposition Booleans, and a semanticPass value following the frozen conjunction. A separate structural check confirmed these properties and confirmed that no unparseable complete answer received a semantic pass. There are 19 semantic passes before the parent's independent completion/schema/reference-existence gate. This is a blinded pooled count, not a comparison between conditions.

## Interpretation decisions and limits

- Compound frozen required propositions were assessed as written. Some require more detail than a minimal answer to the question. Answer-007 gives the correct ferry message and dock, but omits home's later-recording role. Answers-019, -043 and -047 correctly answer Nia's action and companion but omit Tari's handle-making activity. Answers-025 and -059 give Rosa's correct recommendations and locations but omit the explicit Malik/home contrasts; answer-038 omits home. These are required-detail omissions, not false memories. Their usefulness remains true where the direct answer is sound. Do not present the resulting strict failures as hallucinations or proof that the mechanism harmed the task.
- The undated cello rubric separately requires uncertainty about week membership, beyond unknown frequency. Answers that only state an unknown date or frequency do not automatically satisfy that separate proposition. The source's phrase “other pages from the week” makes the natural-language boundary somewhat easy to overlook; the frozen rubric treats this loose entry's membership as unsettled.
- Conditional alignment of two tea requests to one time period does not establish the same cup or exclude a changed request. Answers-012 and -063 overstate that conditional even while withholding a present contradiction. Answer-041 says contradiction is possible but unconfirmed without asserting that time alignment alone proves it.
- A remembered noisy room is compatible with a preference for quiet. It does not by itself establish a changed preference, a dispute, or an obligation to resolve the old event before selecting a quiet room. This distinction informed the book-club judgments.
- A source's missing account of another person's feelings is not evidence that those feelings were absent or that their perspective could not have informed a later reflection. The Ari answers were checked for the tentative “perhaps,” distinct reflection times and unsupported claims about where the later interpretation came from.
- A generic arrangement framed as something people “can” do was treated as a proposal in the user's suggestion context. Answer-015's subsequent “scheduled” wording was not read as an independently completed booking. An asserted supported joint time despite a missing participant interval or failed venue requirement was still treated as an error.
- Reported ferry speech containing “this morning” was read within the remembered utterance rather than automatically as a new claim about today's schedule. Answer-068's awkward final lexical comment was not read as reversing the correctly stated activity-specific preferences.
- Citation scope is part of this contract: a resolving ID must support the entire claim. In particular, the original text alone does not contain a proposed replacement, and the original prose does not report a checker execution. Correct conclusions with incomplete or invented supporting references can therefore fail this strict semantic/source-support review.
- Truncated responses were inspected beyond their first correct clause. Several repeat a correct conclusion while adding unsupported explanations or never complete the required answer format. A correct opening is recorded through requiredMet where appropriate, but an unparseable complete answer cannot receive semanticPass under the frozen contract. Useful=false was used for those incomplete outputs rather than pretending their visible opening is the delivered answer.
- This remains one agent's semantic judgment with no second human/agent adjudication or inter-rater estimate. Ambiguous boundary readings are disclosed here; the gold and scores were not revised after unblinding.

## Integrity checks

- Anonymous answers: 72; unique scored IDs: 72.
- Rubric lengths and Boolean formula: checked for every score.
- Parseable full JSON answers in the export: 48; no unparseable answer passed.
- Anonymous export SHA256: `f7efe3b8f60c256c79fe1798c52570b89cace50db796a7a69383b9deec045063`.
- Frozen scoring contract SHA256: `aa2fae18478531b88b9522fa5743473775a3ab30797bff8d00c9e1b021fe165e`.
- Only the assigned score file and this report were written.
- Parent acceptance remains outstanding; completion of this review is not acceptance.

