# Proposal 4: Reusable operations with multiple inputs

**Implementation, usage and test refinement:** [Dedicated peer-refined supplement](refinements/04-reusable-multi-input-operations.md). This carries the latest concrete operation and case specifications; the conceptual dossier below remains provisional. No benchmark execution or production implementation is reported.

**Status:** provisional pre-plan dossier, 2026-10-10. This is a research candidate, not an approved architecture or implementation plan. No prototype or model experiment was run for this dossier.

## Purpose and constraints

Explore whether Circadian could remember **how several pieces of evidence were combined**, preserving a reusable method with explicit conditions rather than only its last conclusion. Proposal 1 concerns faithful views; proposal 2 concerns compatible accounts. This proposal concerns a qualified operation that consumes several inputs and produces a result.

Circadian remains the flagship. The candidate must supplement its existing memory and lifecycle, disable cleanly, and impose no mandatory service, database, model call, dependency, or daily bookkeeping on the working agent. Selection, retrieval, validation, expansion, and maintenance all count toward its cost. The operator's account of a gateway being slower than direct search makes lookup overhead a central experimental question; the cause of that earlier result is not established here.

The ordinary baseline is a short recipe or typed function. An ontology, procedural memory library, and workflow engine can all recreate that baseline with more machinery. The baseline already provides readable instructions, low startup cost, and an escape to direct problem-solving. Any alternative must preserve those advantages. The mathematical vocabulary alone supplies no novelty.

## General-purpose scope

Circadian is general-purpose memory. A reusable operation could support planning time with friends, comparing interpretations of a story, recalling a learned method, or developing a creative idea. This proposal covers the procedural portion of memory; it must not force feelings, relationships, or meaningful experiences to justify themselves as useful procedures. The worked example below replaces the earlier software-preview illustration.

## Precise mathematical contribution

A colored operad, also described in Spivak's treatment as a symmetric multicategory, has typed operations with multiple inputs and one output. An operation can be substituted into a compatible input of another operation. Identity operations and associativity constrain substitution; an interpretation into sets assigns concrete functions while preserving that composition. These are explicit constituents and laws, beyond merely drawing several incoming edges. [Spivak, definitions 2.1.2 and 2.2.5](https://arxiv.org/html/1305.0297)

For this candidate, the potentially useful law is that grouping a **pure, explicitly defined composition** differently preserves its interpreted result. This is not a license to reorder inputs, omit premises, regroup model calls, or reorder external actions. We would initially exclude those transformations. A hypergraph recording joint dependencies is insufficient to claim an implemented operad: substitution, identities, and their interpretation must also be defined and checked.

An individual recipe does not need that full structure. Operadic laws become useful only if separately defined recipes can actually be nested and their composition inspected. Until then, ordinary function composition is the appropriate description.

## Worked example: remember the method for a shared afternoon

The following is a hypothetical planning fixture. A person wants to suggest an afternoon together that fits the participants and the occasion.

| Input slot | Required information |
|---|---|
| Participants' stated preferences | Person, attributed preference, relevant activity/occasion, source |
| Shared time | Participants, currently reported availability, source and date |
| Place conditions | Setting, relevant observations such as noise or seating, source and date |
| Current intention | Who is meeting, when, and what they hope to do together |

The recipe returns a **tentative option with its supporting reasons** or the information still missing. It does not contact people or make reservations. One possible internal composition is:

```text
match stated preferences to this occasion
    + find an overlap in current availability
    + check relevant conditions of a candidate place
    → tentative option with evidence bindings and unknowns
```

Last month's availability cannot silently fill today's time slot. One person's preference cannot stand in for everybody's, and an uncertain recollection must remain uncertain. The result describes fit under the supplied information; it cannot promise that the afternoon will feel a particular way.

The frozen memory “the garden was a good choice” has limited reuse. The recipe instead preserves which conditions supported that choice. A future session can supply new people, circumstances, or observations while retaining an inspectable method. If the human meaning of the occasion cannot be represented adequately by these slots, the procedure should yield to the narrative rather than overwrite it.

## Two-domain scrutiny

**Open dynamical systems and wiring.** Vagner, Spivak, and Lerman explicitly separate system interfaces from internal state and give wiring a compositional interpretation. Their tank example derives a combined system from individual systems and their connections. Their particular wiring category also imposes restrictions, including prohibiting certain passing wires; an arbitrary diagram does not qualify automatically. [Definitions 3.1 and 4.2, proposition 4.5](https://arxiv.org/html/1408.1598)

The transferred mechanism is an explicit interface and interpretation, not the visual resemblance of boxes. For Circadian, a recipe must expose every input relevant to the promised result. **Falsifier:** identical declared inputs yield different results because the recipe secretly reads a changed file, current clock, previous conversation, or service. Such a recipe is not pure under that interface. It must expose the dependency or remain outside the first experiment. Nested wording cannot make hidden state disappear.

**Compiler specialization.** Partial evaluation specializes a program using the inputs already known, leaving a residual program for the remaining inputs. Its correctness equation requires the residual computation to agree with the original computation on those remaining inputs. Jones also gives an example where knowing a different input produces no significant speedup. Specialization is not synonymous with acceleration. [Jones, sections 1.1–1.2](https://faculty.cc.gatech.edu/~harrold/6340/cs6340_fall2010/Readings/p480-jones.pdf)

The proposed memory hypothesis is to retain **the remaining work**: bind an explicitly stated preference for a recurring occasion while leaving current availability and place observations open. This is only actual partial evaluation if a specified transformation preserves the program's meaning; filling a prose template does not establish that property. **Falsifiers:** the bound preference or its applicability changes without reconsideration, or retrieving and checking the residual costs more than using the ordinary recipe. These two technical domains expose real mechanisms, but neither makes this an unprecedented memory architecture.

## Smallest viable optional fit

Observed code provides useful anchors. Atoms have claim-derived identities, reasons, source quotations, episode references, and optional scope. Their ledger represents weight and status changes. Neither the atom interface nor retrieval unit interface defines recipe inputs, executable operations, or application conditions. [Atom types and identity](../src/atoms.ts), [retrieval unit types](../src/relindex.ts)

The design contract places intelligence in processes around Markdown in Git, preserves supporting reasons and quotations, and requires wake composition to survive without services. The package manifest declares no runtime dependencies. [Mind contract](../templates/MIND-SPEC.md), [package manifest](../package.json)

The first candidate would therefore be one explicitly selected research recipe, with a reviewed data fixture referencing existing source identities, and a small deterministic instantiation/checking function in the existing runtime. It would produce data only. No generic expression language, arbitrary code in memory, autonomous executor, new router before every task, or automatic write-back is needed. This describes a possible future experiment, not a newly available API.

The fixture's added fields—slot types, applicability, source bindings, and failure result—are new information. They cannot be assumed recoverable from current atoms. Manual annotation is initially honest and inspectable. Semantic extraction by a classifier is a separate hypothesis with separate error and maintenance costs.

Bound inputs must remain linked to their actual supporting versions and declared validity conditions. An unchanged identifier alone does not establish continuing applicability. Source changes, supersession, unresolved contradictions, or missing validity information should cause reconsideration rather than silent reuse. A general invalidation service would exceed this candidate's scope.

Two branches may depend on the same original observation. Preserve that shared provenance; two paths do not constitute two independent confirmations. Representing shared inputs as references avoids copying their text, but a tree expansion must not multiply their evidential weight. Supporting effects or probabilistic confidence would require additional semantics and remains outside this proposal.

## Temporary utility and retirement

The operator's mnemonic was useful immediately in an unfamiliar situation, then less useful with fluency, disuse, and relocation. Here the analogous hypothesis concerns the **external aid's utility**, not model-weight learning or an assertion of human-like internal adaptation.

A recipe may help early repeated tasks, add friction once direct solving is reliable, and become inapplicable after a context change. Those are distinct retirement reasons. Low use does not prove obsolescence, and repeated selection does not prove benefit. Initially, retirement can be a review decision supported by recorded experimental results; it need not become a new decay mechanism or ledger event.

## Dedicated experiment specification

**Stage A: deterministic fixtures.** Use reviewed synthetic inputs and expected outputs. Check correct composition, identity wrapping, missing premises, wrong types, changes of participant or occasion, outdated availability, changed preferences, superseded sources, and explicit unknown validity. Include duplicate evidence through two branches and attempted substitution of an effectful operation. Reject unsupported operations. Compare nested composition with its equivalent directly written function on the same inputs. No model is necessary.

**Stage B: separately specified model study.** Before any run, record provider, exact model identifier/version where exposed, harness, prompts, settings, tool schemas, fixture hashes, retrieval path, and repetition count. Use paired, randomized trials with inspectable transcripts and outputs. Separate unseen tasks and changed conditions from examples used to author the recipe.

Include practical planning, learning, creative exploration, and relationship-sensitive recollection. Keep task completion separate from fidelity to the person's account and preservation of ambiguity. A recipe that narrows an open creative or emotional conversation prematurely should count as a failure, even if its fields validate.

Compare ordinary Circadian recall, a concise prose recipe with the same substantive information, and the structured recipe. Ablate applicability checks, source bindings, and specialization separately. Include explicitly provided recipes and recipes the agent must locate, so selection cost cannot disappear from the measurement. Measure correct decisions, unsupported conclusions, appropriate abstentions, tokens, tool calls, total elapsed time, and annotation/maintenance effort.

Before running, choose a minimum useful improvement and an acceptable accuracy margin; both are currently undecided. Deterministic preservation failures block model evaluation. Retire the candidate if it repeatedly loses to the prose/function baseline after all costs, silently accepts missing premises or stale applicability, or requires substantial machinery to remain correct. No numerical benefit or experiment result is claimed here.

## Unknowns and provisional verdict

Open questions are whether recurrent tasks have stable enough interfaces, whether eligibility can be checked cheaply, and whether the useful unit is simply a saved procedure. We also lack evidence that nested composition adds value beyond one operation.

The promising candidate is **a small qualified recipe that remembers its inputs and remaining work**. The full operadic structure has not earned its cost. Ordinary recipes and functions remain the strongest baseline, and should be retained if they perform equally well. Circadian's existing memory stays authoritative; this addition would earn continued use through measured task benefit, not mathematical sophistication.
