# Proposal 6: Checked transformations of memory

**Implementation, usage and test refinement:** [Dedicated peer-refined supplement](refinements/06-checked-memory-transformations.md). This carries the latest concrete operation and case specifications; the conceptual dossier below remains provisional. No benchmark execution or production implementation is reported.

**Status:** provisional pre-plan dossier, 2026-10-10. General-purpose memory is the governing scope. No implementation, proof-assistant installation, or model experiment was performed for this dossier.

## Purpose and distinction

Explore whether selected changes to memory can carry a small, inspectable account of **what was checked, against which source, under which assumptions**. The desired benefit is preserving meaningful qualifications when memories are summarized, reorganized, or reinterpreted.

Earlier proposals concern views, contextual compatibility, typed relationships, reusable operations, and higher relationships. This proposal concerns the warrant for a particular transformation. A reason explaining a change is useful, but is not automatically a formal proof that the change preserves anything.

Circadian remains authoritative. An addition must be optional, lightweight, and removable, without mandatory databases, packages, services, inference, or extra memory duties at session start. Everyday experience, relationships, learning, creative associations, and emotionally significant recollections are first-class cases. They need not become action rules or measurable productivity improvements.

## What a check could actually establish

Keep three layers distinct:

| Layer | What it contains | What it does not establish |
|---|---|---|
| Source | An utterance, account, image description, or existing memory reference | That the account is complete or objectively true |
| Interpretation | A proposed reading of its subject, circumstances, attitude, or meaning | That the reading follows uniquely from the source |
| Formal premise | An explicitly admitted statement used by a checker | That the premise was faithfully extracted or empirically verified |

For a deliberately limited representation, let `P(old, new)` mean that designated fields are preserved. A checker can recompute `P` from the actual supplied objects. Its pass result means that property held for those objects under that checker; it cannot certify all natural-language meaning. Correctness also depends on the checker and specification.

One useful initial property would be equality of explicitly represented subject, attribution, context, modality, and comparison target during a declared presentation-only rewrite. More permissive changes require separately defined rules. Missing information produces “not checked,” rather than an assumption that the transformation is harmless.

## Worked example: preserve a situated preference

Consider this invented account:

> After a tiring day, I often prefer a quiet conversation with close friends to a big gathering.

A reviewed interpretation might contain:

| Field | Declared value |
|---|---|
| Subject and attribution | The speaker describing their own preference |
| Circumstance | After a tiring day |
| Modality | Often; neither always nor a prohibition |
| Preference | Quiet conversation with close friends over a big gathering |
| Source | The particular account and its recorded version |

A controlled rendering can retain those fields: “Self-reported preference: often favors quiet conversation with close friends over a big gathering after a tiring day.” A proposed transformation to “dislikes social occasions” changes the comparison, removes the circumstance, and replaces a qualified preference with a broad negative characterization.

The checker can detect those changes **if they are represented in the candidate fields**. It cannot detect arbitrary misleading prose merely because correct metadata remains attached. Therefore the first fixture should check structured transformations and their fixed renderer. An unconstrained paraphrase remains an interpretation requiring separate review; unchanged metadata must not give it a misleading pass label.

Suppose a later account says a lively celebration felt wonderful. Both experiences may remain meaningful. This proposal does not select one as the real personality or prove a contradiction. Nor does it require extracting a rule from a remembered evening whose value is its atmosphere or relationship.

## Higher inductive types: real capability, limited fit

Cubical Agda implements higher inductive types with point and path constructors, including higher paths. Its documentation defines circles and a torus and shows a function rejected when the specified boundaries do not match. This is a working language capability, not evidence of a working personal-memory system. [Official Cubical Agda documentation](https://agda.readthedocs.io/en/latest/language/cubical.html#higher-inductive-types)

The research paper demonstrates a torus/product-of-circles equivalence and distinguishes a naive quotient from a set quotient requiring an additional truncation constructor. The choice of constructors changes the mathematical object being defined. [Vezzosi, Mörtberg, and Abel, sections 2.3–2.4](https://staff.math.su.se/anders.mortberg/papers/cubicalagda.pdf)

For memory, declaring a path between two representations would therefore introduce a relation into the formal model; it would not discover that two experiences mean the same thing. An explicitly postulated equality is an assumption. A derived equality is a result only relative to the definitions and premises used. Similar feelings, paraphrases, and alternative interpretations need not be identities.

There might eventually be value in proving that two transformation sequences preserve the same selected information. At present, ordinary field comparisons can address that bounded requirement without a proof assistant. Full higher inductive modeling has not earned its annotation or dependency costs.

## Virtual double categories and equipment

Riehl and Verity describe objects and vertical arrows, horizontal arrows, and cells whose horizontal source may contain several arrows. Cell composition has identity and associativity laws. Their virtual equipment adds particular universal properties for restrictions and units, and their theorem constructs this structure for modules in an infinity-cosmos. [Definitions 4.1.2 and 4.2.5, theorem 4.2.6](https://math.jhu.edu/~eriehl/equipment.pdf)

A possible memory interpretation would distinguish changing a representation from relating accounts, with a cell recording how a relation survives a change. That remains an analogy until the objects, relations, cells, and required properties are actually specified. Calling a source link a “witness” does not supply those properties. No memory implementation of this machinery was verified here. The current candidate needs neither an infinity-cosmos nor a virtual-equipment engine.

## Two-domain scrutiny

**Independently checked results.** Proof-carrying code separates production of a proof from its validation against a receiver's specified policy. Necula emphasizes both relating the proof to the actual artifact and the dependence on a sound policy and correct checker. [Necula's primary description](https://people.eecs.berkeley.edu/~necula/pcc.html)

The proposed transfer is narrow: a process proposing a memory rewrite must not validate itself by returning “preserved.” A small checker recomputes the named property over the exact inputs. **Falsifiers:** changing the candidate after checking leaves the pass usable; changing an unchecked assumption silently changes what the pass means; or the check depends on the same unreviewed semantic judgment as the generator. A hash binds bytes, not truth. We would call the result a check receipt, not a formal proof, unless a real proof object is supplied and verified.

**Textual scholarship.** TEI's critical apparatus distinguishes a reading, its witness, responsibility for an interpretation, and certainty. It can retain different scholars' readings of the same witness and an editorial conjecture the current editor does not accept. [TEI, critical apparatus](https://guidelines.tei-c.de/en/html/TC.html)

The mechanism transferred is preserving the separation between account and interpretation. A later interpretation need not erase what was felt earlier. **Falsifier:** a checked rewrite retains source identifiers but removes a meaningful ambiguity, voice, or alternative reading that the representation never captured. Formal checks can pass while the memory becomes worse. Narrative fixtures and human review must therefore be capable of rejecting formally accepted transformations. Installing TEI or converting memory into scholarly markup would add no demonstrated benefit.

## Smallest useful representation and lifecycle

Existing atoms already carry a claim, reasons, quotations with sources, episode references, and optional scope; the ledger records changes such as supersession and contradiction. Claim-derived identity does not encode a complete semantic equivalence between memories. [Existing atom and ledger types](../src/atoms.ts) The mind contract already supplies Git history and preservation of supporting reasons. [Design contract](../templates/MIND-SPEC.md)

A proposed research record would add only: old and candidate references with relevant content digests; rule and checker versions; the invariant actually checked; admitted assumptions; declared losses; and an inspectable pass, failure, or unsupported result. The guarantee beyond history is **reproducible checking of a named property**, not merely recording that a change happened. If ordinary validation can reproduce it cheaply, a durable certificate may be unnecessary.

Start with an explicitly selected synthetic transformation and a small function in the existing runtime. Do not mutate the original memory or authorize acceptance from the report. Manual reviewed annotations supply the initial semantics; a classifier could propose annotations later but cannot validate them simply by producing valid structure. Unknown or unmodeled meaning stays visible.

There would be no startup requirement. During a later experiment, checks could accompany selected rewrites or consolidation proposals; ordinary memory capture remains sufficient when no transformation is checked. Disabling the addition leaves the sources and existing lifecycle intact. Derived records must not retain source text that an authorized erasure was intended to remove. When required source content is unavailable, checks depending on it become unavailable; a previous pass must not imply current access or complete provenance.

## Dedicated evaluation and retirement

First use fixed, reviewed fixtures with no inference: same-source presentation changes, contradictory accounts, reported feelings versus objective assertions, broadened time or circumstances, altered modality, a false equivalence inserted as an axiom, changed candidate bytes, and deleted sources. Verify that an admitted axiom is exposed rather than promoted to source evidence. Include unchanged metadata paired with misleading prose; it must not receive a semantic-preservation claim.

Then, only under a separate run protocol, compare ordinary text diff plus provenance, simple field validation, and the proposed check receipt. Ablate attribution, assumptions, loss declarations, and independent recomputation. Any model study must pin provider/model identification and exposed version, settings, prompts, fixtures, and trial counts, with repeated paired trials and inspectable results. No such runs have occurred.

Evaluate everyday preferences, relationship memories, travel, learning, creative reflection, and rare meaningful events. Measure qualification loss, false acceptance, unjustified certainty, useful ambiguity, source accessibility, annotation effort, latency, and context overhead. Have reviewers assess narrative fidelity separately from formal passes. Test examples outside the domains used to design the fields; generality is a condition of acceptance.

Acceptance thresholds remain to be agreed before experiments. Reject a candidate that certifies unsupported semantics, silently changes assumptions, or makes unstructured memories second-class. Retire it if field validation and ordinary provenance perform equally well with less burden. Frequent use is not required for a rare but valuable memory to deserve preservation.

## Open questions and provisional verdict

Which transformations recur enough to justify checks? Who supplies the reviewed interpretation? Can a small vocabulary preserve qualifications without flattening lived experience? Does keeping a receipt improve later understanding beyond recomputing the check?

The promising direction is **a limited, inspectable check of an explicitly represented change**. Its practical value is unproven. Higher type theory and virtual equipment clarify possible obligations but do not currently justify adding their machinery to Circadian. The system should be allowed to preserve an account without resolving, formalizing, or operationalizing it.
