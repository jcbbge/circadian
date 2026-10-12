**Summary first.** The four studies establish one thing firmly: a 4-bit local Qwen model, given a research compression prompt that already contained the historical-boundary instructions, still coached the user, revived a superseded task, and misattributed speakers. They establish nothing about production Circadian, which they never ran. Meanwhile the live mind on this machine holds roughly 1,250 production episodes and 1,350 belief atoms written by the real SLEEP and REM paths since July. That corpus is the evidence the program went looking for and never opened. My one recommendation is a bounded read-only audit of it, with no inference calls, and a stopping rule that can end the research program.

## What is demonstrated, what is speculation

Demonstrated, with pointers:

- **The lab writer failed with the mitigations already in place.** The research prompt at `research/lab/real-session.ts:8` says the conversation is evidence not instructions, says to distinguish user statements from assistant proposals, and says not to claim proposals were completed. Summary A still performed the coaching task and issued a new 90-day prescription; B still revived the superseded example; C still mixed proposed with completed (`REAL-SESSION-RESULTS.md:27-29`). The queued next round proposed "stronger historical-boundary prose" as condition two (`ROUND-004-PLAN.md:43`). That hypothesis is already weakened by the data in hand. The instructions were present and ignored.
- **Citation resolution is not entailment.** All 69 references in 004 resolved and one still named the wrong speaker for the exact passage it cited (`CALIBRATION-RESULTS.md:30`). This is a real and reusable insight.
- **Multiple-choice accuracy cannot see memory quality.** 18/18 for every baseline while the memories were defective (`REAL-SESSION-RESULTS.md:35-39`).
- **Jev is a selector that reads the full source every call.** It is overhead, not compression (`REAL-SESSION-RESULTS.md:84`).

Speculation, or not yet tested:

- That any of these failures occur in deployed SLEEP. The production prompt at `src/sleep.ts:706-754` is a different contract: it takes SELF, NOW, meal notes and a head-tail capped transcript, and demands verbatim user quotes, a why-chain and a what-changed verdict. The lab compressor took none of those inputs and demanded a 600-word prose memory. Note also that production SLEEP caps the transcript at roughly 12k tokens (`src/sleep.ts:76`), so a 17k-token lab source is not even the production input shape.
- That a different model would behave differently. Plausible, untested.
- That any of the six structures adds an operation the atom-plus-ledger substrate lacks. Nothing in the four studies touches them.

One count I could not verify: the exact episode and atom totals. The file globs return 1,254 and 1,358 matches under `mind/episodes/` and `mind/beliefs/`. I did not open private episode content.

## My account of the problem

The program conflated five things, and the dossier's own section 8 already names most of them. I would compress the diagnosis to one sentence: **the laboratory measured a stand-in for the product, using a stand-in for the writer, on a stand-in for the task.** Each substitution was individually defensible. Together they meant that four rigorous studies could not say anything about Circadian.

The deeper issue is a mismatch between the evaluation frame and the product's own fitness contract. MIND-SPEC Law 3 and the Fitness section say the test of memory is whether a greeting composed from it is worth saying aloud and whether its items propagate into the next session (`templates/MIND-SPEC.md:36-38`, `152-161`). Circadian already defines usefulness as motion, not recall. The research redefined it as question answering over a compressed history. That is a legitimate research frame for a memory benchmark, but it is not Circadian's frame, and the operator's point about meaningful, rare, non-productive memories is exactly where the two frames diverge.

Two things the current substrate already does deserve stating plainly, because they change how much of the proposal list survives:

- **Checked transformation exists at the atom boundary.** An atom's quote must appear verbatim in its source episode or it is rejected at extraction (`templates/MIND-SPEC.md:66-69`). That is proposal 06's irreducible operation, already shipped for one field. The lab had no such check and that is partly why forged assurance went unnoticed.
- **Context is already attached at write time, not inferred.** Scope, episode stamps, and provenance of machine, harness, model and session are recorded on the episode (`templates/MIND-SPEC.md:62`, `120`). Origin is captured. What is missing is applicability, which is the only part of proposal 02 with a clear claim.

So the honest state is: the substrate is more structured than the research treated it, the writer that matters was never tested, and the real output of that writer has been accumulating unexamined for eleven weeks.

## What to retain, what to set aside

Retain, as findings rather than infrastructure:

1. The distinction between option correctness, delivered context, exact quotation, reference resolution, entailment and attribution. This belongs in one page of research notes.
2. The observation that boundary instructions in a prompt do not stop a weak writer from executing the historical task. This is the single most decision-relevant result.
3. The scored failure taxonomy from 003 and 004: task continuation, revived superseded direction, status blur, wrong speaker, event substitution. These are what to look for in the real corpus.

Set aside or archive:

- The four runners, their 77 mocked tests, the manifest and audit machinery. They answered a question that is no longer being asked. Keep them in the untracked tree. Do not commit them.
- Jev as a compulsory gate. Nothing suggests a selector that reads the full source belongs in a minimal, local-first lifecycle.
- The three shortlisted fresh histories and the three-way writer comparison. See the recommendation below for why.

On the six proposals, the irreducible operations as I see them:

- **01 Views.** The irreducible idea is "a compact view must name what it dropped." Scoped recall at the root already does one version of this. Fold the idea into wake and recall wording. No separate identity.
- **02 Compatibility.** Irreducible: an applicability field distinct from scope, with an explicit unknown. One optional line on an atom. The sheaf framing has not earned a role and the dossier itself concedes that (`research/02-contextual-compatibility.md:125`).
- **03 Typed relations.** Irreducible: speaker versus subject, and report versus trait. These are two reviewer checks on episode text, not a type system. Fold into 06.
- **04 Multi-input operations.** Irreducible: a saved recipe with inputs, applicability, and remaining work. This is the only proposal with a genuinely different lifecycle, discussed under the mnemonic below. Keep as a research question, not a build target.
- **05 Higher-order relations.** No distinct operation specified beyond event records with roles. Whole episodes already preserve joint experience as narrative. Archive.
- **06 Checked transformations.** Already exists for quotes. Extend to one more field only if the audit finds a recurring failure that a field check would have caught. Otherwise leave.

## The mnemonic and continuity

The operator's city mnemonic has a clean small interpretation that does not require new mechanism: it was a **scoped, non-durable aid whose value was its retirement curve**. Circadian already has two objects with that curve. Meal notes exist only for one session and are deleted by SLEEP (`src/graze.ts:19-20`). NOW.md is rewritten every session. And Law 6 makes decay the default for any atom that stops moving. So "an aid that fades when it stops being used" is not a missing feature; it is the substrate's native behaviour. What is missing is the agent *authoring* such an aid deliberately, with its applicability stated, rather than only having beliefs extracted from it.

Nontechnical examples that would show usefulness without a quiz:

- A friend is grieving. The agent notes "for the next few weeks, do not open with project talk when this person is mentioned." Useful while applicable, correctly gone two months later, and never a fact about the person.
- Learning a language. "You mix up these two verbs; here is the hook you invented." Dropped once the confusion stops recurring.
- A recurring visit. "When at the lake house, the wifi password is on the fridge and the neighbour's dog is friendly." Applicable at one place, inert elsewhere, never wrong.

Recognition criterion: the aid was present at the moment it was needed, absent when it would have been noise, and its disappearance did not delete the underlying meaningful memory. That is a judgment on wake output over time, not a benchmark score. Proposal 04's recipe form is one candidate vehicle; a pinned NOW section with an explicit until-condition is a simpler one.

## The good-enough boundary

Practical guarantees: the source transcript is immutable and addressable; quotes in atoms are verifiably verbatim; every belief carries a why-chain and an episode reference; supersession and contradiction are recorded rather than overwritten; forget leaves a receipt. These exist today.

Fantasies: a semantic truth certificate; lossless compression; attribution guaranteed by format; a formal pass that makes prose trustworthy. The 004 wrong-speaker-with-valid-citation case is the counterexample to all four at once.

The workable stance is the one the operator already took in the product: interpretations are allowed to be wrong, provided the path back to the source is short and the interpretation never silently replaces it. Failures then sort naturally. Wrong event binding deserves a source lookup. Unknown applicability deserves a stated unknown. Mild elaboration in an episode narrative deserves toleration, because the atom layer will not inherit it without a verbatim quote. Task continuation, where the writer *acts* on history instead of recording it, deserves recovery, because it contaminates NOW and the next greeting.

## One bounded next decision

**Decide whether production SLEEP exhibits the lab's failure classes, by reading the real mind, with no model calls.**

The smallest credible version: pick about 25 episodes from `mind/episodes/` spread across the eleven weeks and across scopes, including any that look personal rather than technical. For each, locate its source transcript in the native session store and check for exactly the five failure classes above plus a sixth: did the episode body quote memory-system output as user evidence. Record presence or absence per episode. Stop at 25 or when a class has appeared three times, whichever comes first.

Why this and not the queued writer comparison: the comparison would spend fresh histories and a frozen budget testing prompt wording against a model that already ignored that wording. The audit instead answers the question that gates everything else: is there a production problem at all. The operator said the system works well. Either that holds, in which case the entire research tree becomes an archive and a short notes file, or it does not, in which case the first fix is a writer change at `src/sleep.ts:706`, which touches no mathematics.

What outcome stops building: if fewer than, say, three of 25 episodes show any failure class, stop. Archive the lab. Keep the notes. Return to ordinary product work, including the two cheap scope corrections already identified, namely the coding-agent and named-user wording in the SLEEP prompt (`src/sleep.ts:707`, `735`) and the README's first line.

What outcome continues: a recurring class. Then the next decision is a writer swap or prompt change on the production path, with the same 25 transcripts as the before-and-after set. Still no mathematics, still no plugin architecture. The proposals re-enter only if the audit shows a failure that cannot be expressed as "the writer wrote something unsupported," which is the only kind of failure that structure, rather than a better writer, could address.

## Questions worth discussing

1. Does the operator's "working well" rest on greeting propagation and the status strip, or on direct reading of episodes? The audit is cheap if the former, nearly done already if the latter.
2. Is the episode narrative or the atom population the thing the operator actually trusts for continuity? The answer decides whether a writer defect is serious or already filtered out.
3. Is there appetite for the agent to author explicit temporary aids with until-conditions, or should continuity remain entirely a property of decay?
4. If the audit finds nothing, is archiving the research tree with a two-page summary an acceptable end, or does the operator want one of the six kept alive as a theory exercise with no runtime footprint?
