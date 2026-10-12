# Proposal 3: typed relationships and checked composition

**Implementation, usage and test refinement:** [Dedicated peer-refined supplement](refinements/03-typed-relations-and-composition.md). This carries the latest concrete operation and case specifications; the conceptual dossier below remains provisional. No benchmark execution or production implementation is reported.

**Status:** Non-authoritative pre-plan dossier. **Date:** 2026-10-10. This records a research hypothesis, not an implementation decision. No experiment has been run for this proposal.

**Question:** Can a few explicit relationship types prevent an agent from turning a useful memory association into an unsupported conclusion?

## Purpose and boundaries

Proposal 1 concerns what a reduced view preserves. Proposal 2 concerns whether contextual accounts can coexist. This proposal concerns which relationship paths mean something, which paths express the same thing, and what a traversal actually establishes.

Circadian remains the flagship and source of memory. Any addition must be optional, removable, and subordinate to its existing lifecycle. The target is a small check over selected records, without a new database, ontology service, mandatory classifier, startup router, or replacement for ordinary recall. The extension must earn its annotation and context costs, not merely avoid package dependencies.

The conventional answer would be a typed knowledge graph. That may be sufficient. The potentially useful departure is to constrain a handful of compositions precisely, rather than increase the number of connections an agent can traverse. Mathematical vocabulary alone adds no capability.

## General-purpose scope

Circadian is general-purpose memory. Relationship types may connect people, occasions, places, reports, ideas, stories, or learned concepts. They are not a compulsory universal schema: some narrative should remain narrative, and an ambiguous attribution must not be forced into a precise-looking relationship. The worked example below replaces the earlier software-deployment illustration while retaining its mathematical question.

## Observed Circadian foundation

The inspected [atom representation](../src/atoms.ts) retains a claim, why-chain, source quotations, episode stamps, and optional scope. Identity is derived from normalized claim text; weight and supersession live in the ledger. That is an existing source-backed foundation, not a blank slate.

The [retrieval representation](../src/relindex.ts) records source-bearing units, entity occurrences, and chronological episode adjacency. Those relationships help locate material; the inspected types do not declare a general vocabulary of causal, applicability, or implication relations. This dossier does not claim that the current retrieval engine mistakes adjacency for causality.

The [design contract](../templates/MIND-SPEC.md) places intelligence in processes around Markdown and Git, preserves reasons and quotations, and excludes a database from the reading/writing critical path. The [package manifest](../package.json) declares no runtime dependencies. A proposed extension should preserve those properties.

## Precise mathematical contribution

In a basic olog, objects denote types and arrows denote functional relationships. Under a set-valued interpretation, every arrow assigns exactly one target to every source instance. Arrows compose when their types match. Particular paths can be declared equal; equality is not automatic because two paths have the same endpoints. Instance data must respect those declared equations. A many-valued relationship can be represented by a relation object with projections to its participants. [Spivak and Kent, sections 2–3](https://arxiv.org/html/1102.1889)

A graph representation can encode these objects, arrows, and laws. The extra capability is explicit semantics and checking, not escape from graph storage. Structural consistency also does not certify the author's description of reality. [Spivak and Kent, introduction and section 2](https://arxiv.org/html/1102.1889)

**Proposed Circadian hypothesis:** selected memory questions could benefit from typed, source-backed paths whose conclusions have deliberately narrow meanings. Establishing who a report concerns is different from establishing an enduring trait of that person.

## Worked example: an attributed report is not an enduring trait

Everything below is a synthetic fixture, not a claim about actual people.

| Report | Speaker | Attributed statement | Occasion | Source |
|---|---|---|---|---|
| R1 | Mira | Quiet places help me enjoy reading | An afternoon conversation in a garden | Episode E |
| R2 | Noah | I enjoy lively cafes when writing | A later conversation in a cafe | Episode E |

Each complete report in this fixture has one speaker, one statement, one occasion, and one source episode. Each occasion has one recorded setting. This permits:

```text
Report --speaker--> Person
Report --occasion--> Occasion --setting--> Setting
Report --statement--> AttributedStatement
Report --source--> Episode
```

These paths identify attribution, the setting of the reported occasion, and provenance. They do not establish the speaker's complete personality, a timeless preference, or a causal effect of the setting.

The supported answer to “What did Mira say about reading?” is R1's attributed, qualified statement. It does not support “Mira dislikes social life.” Selecting R2 because it is newer would also change the person and activity. The source episode may have been written at home; its recording location is not the setting of either conversation.

Suppose an import additionally records `declaredOccasionSetting`. We could require this explicit equation:

```text
declaredOccasionSetting(r) = setting(occasion(r))
```

A mismatch identifies inconsistent data under the fixture's declared meaning. It does not settle which account of an experience is correct. The episode's recording setting must not be substituted into that equation.

Unknown speakers or settings remain unknown. Total functions can be used over the complete-record subset; incomplete accounts remain outside it. If one report has several sources or speakers, separate source-reference/attribution records or an explicitly different relation semantics are needed. The narrative itself stays available when the chosen schema is inadequate.

## Two-domain scrutiny

**Categorical database discipline.** The transferred mechanism is checking domain/codomain matches, functional assignments, and a small list of declared path equations against concrete records. This resembles ordinary joins and integrity checks. A dedicated test can deliberately attach a report to the wrong occasion setting and verify that the equation fails.

The falsifier is equally concrete: change the attributed statement while retaining correct types and person identifiers. The checks still pass. Therefore this mechanism cannot establish observational accuracy, freshness, causality, or authorization. It also loses its practical case if ordinary typed records and explicit joins provide the same behavior with less maintenance. No general category engine is justified by the example.

**Dimensional analysis in executable type systems.** F# implements units of measure that check arithmetic compatibility and unit conversions at compile time; the annotations are erased at runtime. Its documentation includes accepted and rejected arithmetic examples. This is a working instance of lightweight structural checks, not a proposal to add F# to Circadian. [Official units-of-measure reference](https://learn.microsoft.com/en-us/dotnet/fsharp/language-reference/units-of-measure)

The proposed transfer is to distinguish kinds of identifiers and conclusions: a source episode identifier cannot silently stand in for a person identifier, and an attributed statement cannot silently acquire the meaning “enduring trait.” The representation would need to enforce those distinctions during processing and preserve them in output.

Its falsifier is mislabelling: a number annotated with the wrong unit can be dimensionally consistent, and a statement attributed to the wrong person can be well typed. Moreover, memory relations generally lack the algebraic regularity of physical dimensions. This supports a few carefully chosen distinctions, not a universal calculus of meaning.

## Smallest viable optional fit

Begin with a reviewed research fixture referencing existing atom or episode identities, plus a tiny relationship table and explicitly named equations. Source identity, interpretation, and provenance must remain inspectable. A report could enumerate permitted paths and unresolved or inconsistent records without changing atom files, weights, or REM decisions.

The distinction between a derived index and authored interpretation matters. Mechanical source references can be rebuilt; a human judgment that a sentence attributes an experience to a particular person cannot be regenerated reliably unless its interpretation is recorded or its extraction is repeatable and reviewed. That annotation is a real new artifact and maintenance cost. The initial fixture keeps this cost visible before any storage decision.

A future integration, if justified, could render narrow conclusions through the existing recall surface. It should not place a chooser before every wake or force agents to author ontology records during normal work. Disabling it should leave ordinary Circadian memory usable, with no migration requirement.

A classifier may eventually propose relationships. It would produce candidates carrying source spans and uncertainty; the deterministic checker could reject structural errors but could not certify semantic extraction. No model call is needed for the first formal tests.

## Dedicated experiment specification

Before any run, publish fixtures, expected answers, scoring rules, and a manifest. Include correct compositions, missing fields, multiple sources, outdated preferences, misleading co-occurrence, person/occasion mislabelling, subjective versus objective statements, and conflicting direct/composed paths. Mark whether each failure is structural, semantic, or temporal.

Include relationship recollections, observations during travel, learning notes, and creative work. Report outcomes by domain. An operation that only succeeds on easily formalized technical records has not established general-purpose value; preserving ambiguity is a valid outcome.

Compare four arms over identical evidence:

1. Existing source-bearing prose recall.
2. Ordinary typed records with explicit joins and equivalent source detail.
3. Typed records plus declared path-equation checks and narrow conclusion rendering.
4. An ablation of arm 3 with equation checks disabled, retaining identical fields and provenance.

Run deterministic validation first. If a later model evaluation is warranted, pin provider, model/version, prompts, decoding settings, tool availability, and evidence order; record seeds where supported. Predeclare repetitions and uncertainty reporting, keep every request/response, and use held-out entities and paraphrases. No informal one-shot model comparison counts as acceptance.

Measure unsupported conclusions, useful answers correctly retained, proper abstention, source recovery, latency, total tokens, additional lookups, and annotation time. Separate gains from more information from gains caused by checks. Models may ignore a correctly rendered qualification, so structural and behavioral outcomes require separate reporting.

Fail the prototype for incorrect accepted equations, silent guesses for missing values, or loss of source attribution. Retire the mathematical layer if ordinary records match its benefit, if unresolved cases dominate, or if annotation and lookup costs exceed a predeclared task-specific improvement threshold. Do not choose that threshold after seeing results.

## Open questions and provisional verdict

Which recurring Circadian error actually needs a typed composition? Can a source-backed rendering convention solve it? Who supplies missing subject and temporal distinctions without creating routine memory duties? How are changed or forgotten source records handled by annotations? Which conclusions deserve formal names at all?

**Verdict:** retain a small, optional experiment around attributed-report-versus-enduring-trait and source-versus-subject distinctions. The opportunity is disciplined composition with narrow conclusions. A global ontology, general inference engine, and third-party mathematics dependency have not earned their place. Ordinary records and a few explicit checks may be the best eventual result.
