# Dossier 02: Contextual compatibility in one shared memory

**Implementation, usage and test refinement:** [Dedicated peer-refined supplement](refinements/02-contextual-compatibility.md). This carries the latest concrete operation and case specifications; the conceptual dossier below remains provisional. No benchmark execution or production implementation is reported.

Status: **Provisional pre-plan research.** Recorded 2026-10-10. This preserves the second collaborative analysis and its mathematical qualifications. It is not an approved architecture, implementation plan, or report of measured benefit.

Code observations refer to commit `dd31739cf8cf5f5c7e137d8a8f2b4ebaac3bb3a7`. Primary sources were acquired during the research session. See the [research index](README.md) for shared constraints.

## Question and intended benefit

When can memories from different contexts coexist or combine without changing what they mean?

[Dossier 01](01-coordinated-memory-views.md) concerns what an individual view preserves. This proposal concerns compatibility among accounts before consolidation or joint use. The operator wants one continuous intelligence across machines, harnesses, projects, and customers. A shared identity can preserve contextual differences without creating separate agent personalities.

The candidate benefit is to distinguish legitimate differences from actual conflicts, preserve uncertainty where context is missing, and expose combinations of requirements that cannot jointly apply. This is a hypothesis about memory quality, not a proposal to replace Circadian's lifecycle or implement a new storage system.

## General-purpose scope

Circadian is general-purpose memory. Context can be an occasion, relationship, activity, audience, season, or stage of life; it need not be a project or machine. Different feelings about the same event may belong to different people or moments and need not be reconciled into one objective verdict. This proposal preserves attributable accounts as well as checks explicit factual constraints.

## Origin and applicability are different

Origin asks where a memory was recorded. Applicability asks where, when, and under what conditions its content holds. A preference learned on the Mac may apply everywhere; a VPS-specific fact should retain its limitation when read elsewhere. A recorded timestamp is not automatically an interval during which a claim is valid.

Hypothetical examples:

| Records | Interpretation to investigate |
|---|---|
| Enjoys lively rooms when dancing; prefers quiet when reading | Different activities can support different preferences |
| Preferred late outings last summer; now prefers early evenings | A possible change over time |
| One account says Mira attended a particular dinner; another says she was absent throughout it | A possible conflict about the same occasion |
| Prefers quiet; prefers bustle, with no person, activity, or time | Insufficient applicability information |

A shared project tag does not prove overlap of meaning. Different project origins do not prove non-overlap either: both records might concern the same global preference. This distinction must survive any proposed classification.

## Mathematical contribution: the local-to-global question

A sheaf supplies data over domains and restriction maps. Its gluing axiom requires that local sections agreeing on overlaps assemble uniquely over the domain they cover. Compatibility is a premise, not a result manufactured by the theorem. The union of known domains also does not establish a rule over unobserved contexts. Source: [Stacks Project, sheaf definition](https://stacks.math.columbia.edu/tag/006S).

The proposed transfer is to ask what accounts actually overlap on before attempting to combine them. Relevant alignment may include subject identity, property meaning, environment, time, and explicitly known conversions. Without an evidenced alignment, the result should be unknown rather than inferred agreement or disagreement.

This does not claim arbitrary prose atoms form a sheaf. Establishing the data domains, restriction maps, and applicable laws would be part of any genuine implementation. The smallest useful audit may require only a narrow fragment of those ideas.

## First external mechanism: sensor integration

Robinson's sensor-integration framework separates the modeled observation spaces and their relationships from the supplied observations. Explicit comparison maps permit consistency analysis; fusion is a further operation. Its examples include geometric and temporal models, and it discusses failures from omitted temporal structure. Source: [Sheaves are the canonical data structure for sensor integration](https://arxiv.org/html/1603.01446).

The transferable discipline is to establish common meaning before comparing values. For memory, the proposed sequence is: identify the subject/property, establish applicability overlap, compare the overlapping information, and preserve uncertainty when alignment is missing.

**Falsifier:** if the mapping is wrong, a consistency computation can confidently compare unlike things. Consistent accounts may also share an error. The proposed audit therefore cannot certify empirical truth or select the correct source merely by finding consistency.

## Second external mechanism: several locally compatible constraints

Consider three binary variables A, B, and C. The following allowed-value tables form an original toy fixture:

| Variables | Allowed tuples | Meaning |
|---|---|---|
| A, B | 00, 11 | A = B |
| B, C | 00, 11 | B = C |
| A, C | 01, 10 | A differs from C |

Every overlap on a single variable projects to the same possibilities, 0 and 1. Any two constraints can be satisfied. All three cannot: the first two imply A = C, contradicting the third. Their joint satisfying set is empty.

The example illustrates an obstruction for a relation-valued presheaf. It is not a counterexample to the gluing axiom of an actual sheaf: no simultaneous choice of one row from each table agrees on all overlaps. The relational construction and its gluing limitations are developed in [Abramsky, Relational Databases and Bell's Theorem](https://arxiv.org/html/1208.6416).

An important distinction survives this example. A nonempty joint solution establishes satisfiability. Requiring the joint relation to project back to every original table is stronger. Combining A in {0,1} with A = 0 narrows possibilities; it is not automatically a contradiction. An audit must respect the intended meaning of the inputs instead of calling every lost alternative a conflict.

Valuation-algebra research formalizes local agreement and global disagreement under explicit domains and combination/projection laws. Those laws have not been established for Circadian's arbitrary prose. Source: [Abramsky and Carù, a general theory of disagreement](https://arxiv.org/html/1911.03521).

**Falsifier:** pairwise checks alone miss the three-way fixture. Conversely, treating every failure to preserve all local alternatives as inconsistency produces false alarms. A bounded audit must state which property it checked and which population it covered.

The useful consequence for memory is the possibility of finding a small incompatible set of requirements. Such a finding might direct investigation toward a missing condition, stale observation, or mistaken alignment. It does not identify which requirement should be discarded.

## Existing Circadian fit and limitations

Atoms already retain reasons, quotations, episode references, and optional scope; ledger events reference reinforcement episodes and contradiction/supersession endpoints. These provide evidence for an audit. Sources: [atom representation and fold](../src/atoms.ts), [scope handling](../src/scopes.ts), and [stacking](../src/stack.ts).

The inspected candidate router receives claim strings and existing IDs/claims, without separately passing scope, reasons, or quotations. Context can influence comparison if it remains in a claim's wording. Scope is stamped on a newly serialized atom after routing. Identical normalized claims share an identity across scopes; ordinary recurrence reinforces that identity and records the new episode in the ledger. Sources: [candidate routing and stacking](../src/stack.ts) and [claim-derived IDs](../src/atoms.ts).

These are design limitations for explicit local applicability, not evidence of an observed bad merge. Cross-project reinforcement can be correct. A recorded contradiction edge is also a disagreement signal, not a proof that two claims are logically incompatible under the same conditions.

Current schemas do not provide a general formal language for subject/property alignment, temporal validity, environment conditions, or universal versus local intent. Context may exist in source prose, but extracting it adds an interpretation step. Changing identity, folding, or mutation policy would be a separate decision requiring evidence. Source: [atoms](../src/atoms.ts), [stacking](../src/stack.ts), and [REM distillation](../src/rem-popmem.ts).

## Smallest optional fit

Start with an explicitly invoked, report-only audit of selected records. No automatic wake, SLEEP, or REM hook is proposed for the first experiment.

A small reviewed fixture would reference existing source IDs and state the variable meanings, finite values or allowed tuples, applicability, and relevant time. This supplies genuinely missing information; it is not a claim that current project tags encode those facts.

The audit could enumerate a bounded set of assignments and report:

- **Compatible under these checks:** a witness satisfies all declared applicable constraints.
- **Separate:** applicability is explicitly disjoint.
- **Conflict under this formalization:** exhaustive checking finds no satisfying assignment.
- **Unknown:** alignment is unverified, meaning unsupported, evidence unavailable, or the computation limit reached.

Return the source references, formalized inputs, coverage, and a witness or reason. Show narrowed alternatives separately from conflicts. Leave the original memory and default behavior unchanged.

The proposed mechanism needs no external solver, database, or service for small finite examples. Enumeration grows with the product of domain sizes, so a hard cap is essential. Semantic annotation and maintenance may cost more than the computation. A classifier could propose annotations later; checking its output cannot prove that it correctly understood the source.

## Do stacks justify additional machinery?

Stack descent involves local objects, specified isomorphisms on overlaps, coherence on triple overlaps, and effectiveness of descent. Those requirements exceed simple context tags or aliases. Sources: [descent data](https://stacks.math.columbia.edu/tag/026B) and [stack definition](https://stacks.math.columbia.edu/tag/0268).

No present requirement demonstrates a need to retain multiple meaningful identifications and their coherence as first-class memory data. Ordinary evidenced mappings may suffice. Identifying Mac and VPS paths as replicas of one project does not establish equal contents or runtime state. Ongoing file synchronization remains a separate concern.

## Dedicated evaluation proposal

No experiment for this proposal has been run. Begin with reviewed, inspectable fixtures for distinct environments, evolving facts, genuinely overlapping conflicts, absent context, incorrect aliases, compatible narrowing, and the three-way obstruction. Include a case where all records agree but are factually wrong, to prevent consistency from being scored as truth.

Include nontechnical cases from personal preferences, shared experiences, learning, and planning. Score false reconciliation of subjective accounts separately from logical incompatibility: two people may sincerely describe one occasion differently. A narrative that cannot be usefully formalized may remain unchanged, with unknown comparison status.

Compare the current claim-oriented comparison, a plain explicit-context comparison, and the bounded structured audit. Separately ablate applicability information and multi-record checking. Report false conflict rates, missed contradictions, unknown decisions, annotation time, total latency, and evidence coverage. The ordinary explicit-context baseline may be sufficient.

If a model proposes annotations, pin provider/model/version, prompts, settings, repetitions, source fixtures, and scoring before running. Score annotation accuracy separately from checker accuracy. An invalid formalization passed by a correct checker remains a system failure.

Retire or simplify the candidate if ordinary contextual comparison performs as well, if maintenance costs dominate, or if the output mostly reports unknown without directing useful investigation. A formal result about reviewed fixtures does not establish value on live memory.

## Open questions and provisional verdict

- Which recurring memory mistake would this audit actually catch?
- What is the smallest useful applicability vocabulary?
- Who establishes alignment, and how is its evidence retained?
- Does a bounded multi-record check outperform pairwise contextual review often enough?
- Would any later mutation policy preserve legitimate reinforcement across contexts?

Retain contextual compatibility as a promising optional capability. Its first useful artifact is an inspectable report distinguishing differences, conflicts, and missing information. The value is making the conditions for combination explicit. A full sheaf/stack engine or automatic reconciliation policy has not earned its place.
