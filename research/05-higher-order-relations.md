# Proposal 5: joint experiences and relations between interpretations

**Implementation, usage and test refinement:** [Dedicated peer-refined supplement](refinements/05-joint-experiences-and-interpretations.md). This carries the latest concrete operation and case specifications; the conceptual dossier below remains provisional. No benchmark execution or production implementation is reported.

**Status:** Provisional, non-authoritative pre-plan dossier. **Date:** 2026-10-10. No prototype or model experiment has been run for this proposal.

**Question:** What should memory retain about a whole experience that disappears when it is reduced to separate associations—and when is a relation between interpretations worth representing explicitly?

## Purpose and distinction

Circadian is general-purpose memory. An experience may matter because it was beautiful, uncomfortable, formative, or difficult to describe. It need not improve task performance or become a reusable instruction to deserve preservation.

Earlier proposals concern views, compatibility, typed paths, and operations combining inputs. This proposal concerns the shape of what is remembered: joint participation, roles, combinations, and relationships between accounts of the same experience. A remembered event is not automatically an operation, a proof, or a formal simplex.

The binding constraint is to supplement Circadian without reorganizing it around mathematics. Its existing [source-bearing atoms](../src/atoms.ts), [episode retrieval units](../src/relindex.ts), and [Markdown/Git design contract](../templates/MIND-SPEC.md) remain the foundation. This inquiry justifies neither a database nor a mandatory topology package. An ordinary episode with references is the baseline to beat.

## Four different structures, four different commitments

**An incidence record or hyperedge** identifies a joint relationship among several participants. An explicit event identifier can distinguish repeated occurrences involving the same people. Connecting event records to participants also gives a graph encoding of group membership; flattening everything to person-to-person links loses that distinction. [Battiston et al., section II](https://arxiv.org/html/2006.01764)

**An abstract simplicial complex** is closed under taking subsets: including a three-vertex simplex requires its edges and vertices. This closure is an additional semantic commitment. Weighted constructions can distinguish directly observed interactions from faces introduced only to satisfy closure; Baccini and colleagues give an invertible weighting construction for their interaction data. That result does not recover narrative detail, roles, or event identity that the input never retained. [Baccini, Geraci, and Bianconi, sections I–II](https://arxiv.org/html/2207.04710)

**A simplicial set** has sets of simplices in each dimension, face maps, and degeneracy maps satisfying compatibility identities. It is a functor from the opposite simplex category to sets. Faces and degeneracies are structural data, not labels one can omit while claiming the full structure. [Kerodon, section 1.1](https://kerodon.net/tag/0004)

**A globular set** has cells with source and target cells one dimension below. A two-cell connects parallel one-cells: those lower cells must have the same source and target. A globular set alone supplies neither composition nor a proof that a cell expresses truth. [Leinster, definition 1.4.5 and subsequent discussion](https://arxiv.org/pdf/math/0305049)

These structures can be encoded with typed records and incidence links. The question is which laws earn their cost. A filled triangle is not intrinsically a causal inference or verified composite. Completing a triangle from three pairwise associations can invent a joint occurrence. Completing a horn is not evidence that a remembered event happened.

## Worked example: a dinner and its changing meaning

Consider this fictional recollection:

> Mara hosted dinner. Ivo cooked. I arrived late. During the quiet stretch after dessert, I felt unexpectedly at ease. I am unsure whether it was their company, the rain, or simply having nowhere else to be.

A useful representation could retain one event, D1, with three participant references and attributed roles. Its source remains the narrative. “I felt at ease” belongs to the narrator; it does not establish that everyone felt the same. The uncertain explanation remains uncertain.

Contrast two histories:

| History | What its records establish |
|---|---|
| Three separate pairwise meetings among the same people | Each pair met on an occasion |
| One dinner attended by all three | One recorded occasion included the group |

Both can yield the same unlabelled person-to-person triangle. Only the second supports recalling a shared dinner. A later dinner, D2, with identical participants must remain distinct: different roles, mood, timing, and meaning may matter.

If we chose a simplicial representation, an edge such as `{Mara, Ivo}` could mean “these two were among D1's participants.” It must not silently mean “they also had a separate dinner” or “the experience would have felt the same without the third person.” Downward closure concerns representation; a subset of jointly relevant conditions is not thereby sufficient for the remembered feeling.

Here is a separate, deliberately small globular possibility. Let D1 and the question Q, “How did I understand the silence?”, be two objects. Two interpretation records, f and g, both run from D1 to Q:

```text
f: D1 → Q   “At first I attributed my ease to familiar company.”
g: D1 → Q   “Later I thought the permission to be quiet mattered more.”
α: f ⇒ g   a sourced account of that reinterpretation
```

The shared boundaries make α structurally well formed. Its source might describe reflection or a subsequent conversation. It does not prove g correct, erase the earlier feeling, or require every change of mind to be reconciliation. Contrasting interpretations can coexist. Without useful questions about such relations, an ordinary “reinterprets” reference carries the same information more cheaply.

## Two substantive mechanisms and their falsifiers

**Group-event analysis: preserve incidence before projection.** The mechanism is an event-to-participant mapping that survives retrieval. A cue about Ivo can lead to D1 and its whole account without reconstructing the dinner from pairwise associations. Bipartite incidence representations explicitly retain group interactions, while clique completion can introduce interactions absent from the original records. [Battiston et al., section II.1](https://arxiv.org/html/2006.01764)

The falsifier is that the ordinary episode already does this adequately. If explicit membership adds no retrieval benefit, or falsely treats a mentioned person as an attendee, the additional representation loses its case. Participation must come from evidence, not shared words. The representation alone also says nothing about the meaning of the evening.

**Multivariate information: a combination can carry information absent from either component.** Williams and Beer distinguish unique, redundant, and jointly available information in their formulation of multivariate information. [Their section II](https://arxiv.org/html/1004.2515)

A precise synthetic example uses two independent fair bits, X and Y, with Z their parity. Either input alone leaves Z equally uncertain; together they determine it. This establishes a possibility of joint information, not a theory of human experience. Our memory hypothesis is narrower: preserve an explicitly recorded combination rather than replacing it with independent preferences such as “likes rain” and “likes quiet dinners.”

The falsifier for a claimed retrieval benefit is additive or single-cue sufficiency: if one detail already identifies the relevant memory, jointly matching cues may add no value. One moving dinner does not supply a statistical distribution, estimate synergy, or establish that its ingredients caused the feeling. Computing an information-theoretic score over sparse personal recollections would require assumptions we have not justified.

## Smallest useful representation and lifecycle

Start, if warranted, with an optional fixture containing event IDs, participant references, evidence-supported roles, source references, and separately attributed interpretations. Retain uncertain dates and unresolved identity instead of completing missing fields. Keep the narrative available; the structured part points into it rather than replacing it.

The first experiment should stop at event incidence. A second, independent fixture could test interpretation-to-interpretation links. Neither needs simplicial closure, degeneracy maps, matrices, or higher-dimensional composition. Formal face or globular-boundary checking becomes relevant only if a concrete operation uses that structure.

The costs include identifying people across accounts, distinguishing mention from participation, separating event time from recollection time, preserving roles, and recording who made an interpretation. Repeated experiences and uncertain identities make canonicalization a substantive problem. A classifier can propose annotations later; well-formed output cannot validate its own reading of the story.

A future extension should run only when enabled, within an existing capture or recall opportunity. It should add no compulsory startup selection or ongoing memory chores. Disabling it leaves the original episodes and ordinary recall intact. Deletion and forgetting behavior must be defined before integration so an auxiliary index cannot resurrect an excluded record.

This extension would not set a new retention policy. Rare meaningful experiences must not be discarded merely because they have low degree, few repetitions, or no measurable task payoff. Nor should an automatically generated interpretation silently supersede an attributed human recollection.

## Dedicated experiment specification

Publish synthetic, inspectable fixtures before running anything. Include joint versus separate meetings, repeated groups, changed roles, someone mentioned but absent, uncertain attendance, travel memories sharing a cue, taste combinations, solitary experiences, and a rare meaningful event with no later practical use. Include competing interpretations that should remain unresolved.

Use these comparison arms over equivalent evidence:

1. Existing narrative episodes and ordinary source-bearing retrieval.
2. Episodes plus a plain event record with participant/role references.
3. Arm 2 plus an explicitly defined higher structure and one operation that requires its laws.
4. Ablations removing joint membership, role information, or interpretation linkage separately.

If arm 3 has no operation beyond those in arm 2, do not run it under a mathematical name. For any closure experiment, distinguish evidenced events from formal faces and test round-trip recovery of the actual event records. For globular fixtures, test common boundaries independently of the plausibility of the interpretations.

A later behavioral study must specify provider, model/version, prompts, settings, tools, repetitions, evidence order, scoring, and retained request/response artifacts. Evaluate source fidelity, invented events, role confusion, attribution, preservation of uncertainty, retrieval effort, context cost, and whether the account still conveys its original meaning. Narrative judgments need an explicit rubric and room for disagreement; deterministic validity is a separate result.

Fail on invented participation, fabricated explanations, lost event identity, or subjective feeling presented as group fact. Retire any extra layer when ordinary episodes or incidence records provide equivalent value, annotation overhead dominates, or recall becomes more flattened despite improved formal scores. Thresholds and review criteria must be chosen before results.

## Provisional verdict

Explicit joint context may be useful; a memory need not be decomposable into independent facts. The strongest minimal candidate is an event reference with roles and preserved narrative. Relations between interpretations are a separate, plausible extension when their provenance matters.

Simplicial and globular structures offer precise representational choices, not automatic consolidation or a guarantee of meaningful recall. We have not yet found a Circadian requirement that demands their full machinery. The open question is what a carefully defined higher operation contributes beyond retaining the whole experience and its source-linked reinterpretations.
