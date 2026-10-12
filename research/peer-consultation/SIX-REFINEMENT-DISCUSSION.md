# Six separate peer refinement discussions

These are the outside peer’s verbatim replies, each answering its own proposal-specific request in the same persistent consultation. They are provisional advice, including claims the parent subsequently corrected. Read the [integrated refinements](../refinements/README.md) and [focused follow-up](SIX-REFINEMENT-FOLLOWUP.md) for the reconciled design. No tests or implementation were executed.

Session: `3f7fb1c5-76d4-4306-aca6-3905d4575466`. Actual served model in all six receipts: `claude-fable-5-1`. The [brief](SIX-REFINEMENT-BRIEF.md) supplies the common scope and six individual seeds. Exact request/response digests are recorded in [SESSION.json](SESSION.json).


## Proposal 01 — verbatim peer reply

**Operation and benefit.** A view is a pure function from an explicit population, a selector, a budget and a preservation policy to four outputs: visible records, source references, computed coverage, and unmet qualifications. The benefit is that a reader knows what they are not seeing and what each visible record is conditioned on. Two uses: before a family visit, "everything about my sister's household this year" returns a short view plus "4 of 11 shown, 7 omitted by budget," so the agent can expand instead of assuming completeness. For a novel in progress, "second act notes" shows the open disagreement "narrator unreliable" against "narrator reliable" as a marker even when only one side fits.

One correction to the seed before design. Restriction-before-truncation already holds on the scope axis: `scopedView` filters episodes and atoms by scope, then applies a whole-line budget (`src/scopes.ts:95-118`). What the default lacks is narrower: non-scope selectors, computed coverage, qualifier preservation in rendering, and ledger awareness in free-text retrieval. The evidence block drops records from the tail with no omission marker (`src/relindex.ts:800-813`), and index ingestion does not fold the ledger, so a forgotten atom remains retrievable there (curator, `relindex.ts:309`, `702`). Those four gaps are the augmentation.

## Contract and algorithm (proposed, not existing)

```text
ViewRequest  { population: {atoms: Atom[], episodes: EpisodeRef[], complete: boolean},
               ledger: LedgerEvent[],
               selector: {scope?, entities?[], since?, until?, ids?[]},
               budgetTokens: number,
               policy: {qualifiers: ["scope","tension","superseded"], onUnmet: "drop"|"stub"} }
ViewResult   { visible: RenderedRecord[], refs: string[],
               coverage: {eligible, shown, omitted: string[], populationComplete},
               unmet: {ref, qualifier, reason}[] }
expand(ids, mind) → {ref, text}[] | {ref, status: "forgotten"|"unavailable"}
```

Algorithm:

1. Fold the ledger once (`foldBeliefs`, `src/atoms.ts:336`). Drop forgotten atoms from eligibility. Attach to each atom its scope, open contradiction edges, and superseded status.
2. Restrict: apply every selector predicate as a pure filter. Scope uses the quoted episode's scope exactly as `scopedView` does. Entities use index entity keys if an index is supplied, else a lowercase token match. Dates use episode stamps. No ranking here.
3. Rank, lossy: atoms by folded weight, episodes by time, or by `queryIndex` score when a query is supplied. Ranking happens only after step 2.
4. Render each record in a fixed shape: `[kind] claim | scope:x | tension:→id | src:file`. Qualifier tokens are part of the record's cost. A record whose required qualifiers do not fit is never rendered bare; under `drop` it goes to `unmet`, under `stub` it becomes `id, qualifiers omitted`.
5. Budget whole records in rank order. Omitted ids go to `coverage.omitted`, capped with a count.
6. Emit `populationComplete` from the caller's flag; if the beliefs or episodes directory was unreadable, force it false.

Expansion reads source files by id, not the view. A forgotten atom returns status only, no text. An erased file returns unavailable.

**The disagreement outside the budget.** The marker is a reference, never the other record. `tension:→b` costs about twenty characters. The ledger already holds the edge, so no annotation is needed. A record in an open contradiction is never shown without its marker, and a resolved edge never produces one.

## Fit

Read-only. Natural consumer is the pull door in `bin/circadian:30`, not wake, since wake has no task. Off by default means no consumer is wired. No dependencies beyond `atoms.ts`, `scopes.ts` and optionally `relindex.ts`. Deletion: the view filters forgotten atoms itself because the index does not. Works alone; if proposal 02 later adds an applicability line it becomes one more qualifier token, and proposal 06 could check that rendered qualifiers equal source fields.

## Tests

| # | Fixture and operation | Expected |
|---|---|---|
| 1 | 10 atoms across scopes A, B, global; selector scope B; budget fits 3 | 3 B records, refs, coverage eligible 4, shown 3, one omitted id |
| 2 | Global rank one is scope A; selector B; budget one record | B record shown. `budget(restrict)` ≠ `restrict(budget)`; view equals the former |
| 3 | Empty selector | visible = budget(population); eligible = population size |
| 4 | restrict(scope B) then restrict(since d) versus restrict(B ∧ d) | Identical ids and order |
| 5 | Atom scope cooking "prefers quiet" plus global "enjoys lively rooms" | Every visible non-global atom carries `scope:`; dropping it fails the test |
| 6 | Open edge a:b; budget fits a | a shown with `tension:→b`; b in omitted; `expand(b)` returns b. Trap: after a resolve event, no marker |
| 7 | Population flagged incomplete, or beliefs dir missing | `populationComplete:false`; output must not state nothing else exists |
| 8 | b forgotten; later file erased | View never shows b; `expand(b)` returns forgotten without text, then unavailable |
| 9 | Atom with six edges; marker line exceeds remaining budget | Under `drop`, record in `unmet` with reason, not rendered bare |
| 10 | 2,000 units | O(N log N), reads only population plus ledger; output ≤ budget plus one coverage line; expanding k ids reads exactly k files |
| 11 | 3 records that fully fit | Output equals plain concatenation plus "coverage 3/3"; at most one added line |
| 12 | Remove one eligible record from population | Coverage and omitted list change deterministically; a prose "and others" would not |
| 13 | Index returns a forgotten atom for an entity query | View counts it ineligible, not omitted |

Tests 2, 3 and 4 are the restriction law. Test 12 distinguishes computed coverage from annotation. Tests 5 and 6 are policy, not law.

## Comparison and measure

Three arms over identical records and budget: current scoped recall, a same-information compact prose block, and the view. Deterministic validity is tests 1 through 13, no model. Annotation cost is zero for scope and tension, since both are existing fields. Downstream behaviour, if later authorized with a named model and visible runs: given the prose arm versus the view, does the reader report that a disagreement exists, refuse to universalize a scoped preference, and expand by id rather than guess. The measure is qualifier survival at budget and total context to a correct answer, counting expansions. What a model run can establish is whether the marker gets used. What it cannot establish is whether the edge was right, because the contradiction was itself a COMPARE decision.

## Improvement to the seed and the open choice

Make `unmet` and `populationComplete` first-class outputs. A view that renders a qualified record bare, or implies completeness it cannot compute, fails its one job. The mathematics earns exactly tests 2 through 4 and nothing else. Prose does not obey the restriction law and the view does not claim it does.

The unresolved choice: whether the population is the ledger-folded atom and episode files or the relational index units. They disagree on forgotten atoms and on identity, since the index keys by path and atoms by claim hash. I recommend files plus ledger as the population, with the index as an optional ranking signal only.


## Proposal 02 — verbatim peer reply

**Operation and benefit.** Given two or more contextual records about the same subject and property, return one of four verdicts: separate, compatible with a witness, conflict under the declared constraints, or unknown. The benefit is that one shared memory can hold accounts that differ by activity, occasion, time or observer without forcing a winner, and can tell a genuine clash from a false one. Two uses: a person who likes lively rooms when dancing and quiet when reading is not contradicting themselves, and the operation says so. Two friends who recall the same dinner differently on who was present are in genuine conflict on attendance, while their different feelings about the evening are separate because the observer is part of the subject.

A fact worth stating first. Today's conflict signal is procedural, not semantic. COMPARE sees two claim strings and nothing else (`src/stack.ts:689-704`). Contradiction edges are written when quorum voters dissent (`src/stack.ts:992`) or when lanes land divergent supersessions (`src/lane.ts:57`). No existing step asks whether two claims overlap in applicability. That is the gap this operation fills, and it gives the operation a bounded first population: the open edges already in the ledger.

## Contract and algorithm (proposed)

```text
ContextRecord { ref: atomId | episodeFile, subject: key, property: key,
                value: string | Set<string>, domain?: Set<string>,
                applicability: { activity?, occasion?, observer?,
                                 from?, until?, extent?: "universal"|"unspecified" },
                source: episodeFile, reviewedBy: "human"|"model:<id>" }
compat(records: ContextRecord[], ledger, cap = 10_000)
  → { verdict: "separate"|"compatible"|"conflict"|"unknown",
      witness?: Assignment, narrowed?: boolean, reason, dimensions: string[],
      checked: number, cap, skipped: {ref, why}[] }
```

Algorithm:

1. **Eligibility.** Fold the ledger. A record whose atom is forgotten or whose source file is missing is skipped with a reason, and the verdict for any set that needed it is unknown.
2. **Alignment.** Records compare only if subject and property keys are identical as declared. "Mira" and "M." with no declared alias is unknown, never conflict. For a subjective property, observer is part of the subject key.
3. **Overlap.** Compare applicability dimension by dimension. Both declared and different on activity or occasion gives separate. Disjoint time ranges give separate, annotated as possible change. A dimension declared on one side and unspecified on the other gives unknown. Unspecified on both sides is not universal: two unspecified records with different values are unknown. Only an explicit universal extent overlaps everything.
4. **Values.** With overlap established, intersect allowed-value sets. Nonempty gives compatible with a witness. A proper subset is compatible with `narrowed: true`, never conflict. Empty gives conflict.
5. **Joint check.** For three or more constraints over shared variables, enumerate assignments over the product of declared finite domains in a fixed order up to `cap`. Any satisfying assignment is the witness. Exhausting the space with none is conflict. Hitting the cap is unknown with `checked` reported.

Pairwise results never substitute for the joint result. The three-way fixture in the dossier is exactly where they diverge (`research/02-contextual-compatibility.md:52-62`).

## Fit

Report-only. Records are small files under a directory such as `mind/context/`, one per annotated atom, named by the atom id so a future erase extension can find them by pattern. Erase today knows only atoms and ledger lines (curator, `src/erase.ts:17-48`), so no-resurrection for these files is a design obligation, not an inherited property. Atom ids are claim hashes; a reworded claim orphans its context record, and the operation then reports unknown for the orphan rather than guessing. No dependency beyond `atoms.ts` fold. Off by default means no context files exist and the operation returns nothing. Works alone. Proposal 01 can carry a verdict as a qualifier token. Proposal 06 could check that a rendered applicability equals the stored one. The natural first invocation is explicit, over the open contradiction edges, which is a finite list and not a corpus scan.

## Tests

| # | Fixture | Expected |
|---|---|---|
| 1 | Same subject, property room-energy; activity reading vs dancing, both declared | separate, dimension activity |
| 2 | Late outings from 2025-06 to 2025-09; early evenings from 2026-01, open | separate, possible change. Variant with both ranges unbounded: unknown, not conflict |
| 3 | Mira present at D1 vs Mira absent throughout D1; domain {present, absent}; occasion identical | conflict, both refs, witness none |
| 4 | Subject "Mira" vs "M.", no alias | unknown, reason alignment |
| 5 | Origin mac vs vps, extent universal on both, same value | compatible with witness; with different values, conflict. Origin never appears in `dimensions` |
| 6 | Time ranges overlapping by one day | overlap holds; proceed to values |
| 7 | A=B, B=C, A≠C over {0,1} | each pair compatible with witness; joint conflict, checked 8 |
| 8 | A in {0,1} with A=0 | compatible, witness A=0, narrowed true |
| 9 | Two records both say present; fixture note says she was absent | compatible. Output contains no truth language; test asserts the word "verified" is absent |
| 10 | Five variables, domain 20, cap 10,000 | unknown, reason cap, checked 10,000, same partial result on rerun |
| 11 | One record's atom forgotten in ledger | skipped with reason; set verdict unknown |
| 12 | Existing open edge a:b; records declare different activities | report "edge may be a false tension" and never append a resolve event |
| 13 | Subjective property, same time, different observers | separate, because observer is in the subject key |

Test 7 is the mathematical content: agreement on every overlap is a premise, and a joint witness is a stronger thing than pairwise consistency. Test 9 keeps consistency from being scored as truth. Test 12 is the triage benefit.

## Comparison and measure

Three arms on identical information: the current COMPARE token over claim strings, a prose arm where the same applicability words are written into the claims and a reader reasons pairwise, and the structured records with the deterministic checker. Deterministic validity is tests 1 through 13 with no model. Annotation is measured separately: two independent annotators, human or named model, produce subject, property and applicability for the same source span, and their agreement rate is reported before any checker result. A correct checker over wrong annotations is wrong, and the 003 attribution drift is the reason to pin observer explicitly.

The proposal-specific measure is a pair of rates on the fixture set: false conflicts, where separate or compatible accounts were called clashes, and missed conflicts, where overlapping incompatible accounts were called fine, with the unknown rate shown beside them. Cost is annotation lines per record and `checked` per joint call. What a model can establish, if runs are later authorized: whether a reader given "separate" avoids false reconciliation, and whether it given "unknown" asks rather than guesses. What no model run can establish: that the alignment was right, or that compatible accounts are true.

## Improvement to the seed and the open choice

Three changes. Distinguish unspecified from universal, so a record with no context never silently overlaps everything. Put the observer in the subject key for subjective properties, which is how two sincere accounts of one evening stay separate. And make the first invocation the open-edge triage: the population is finite, already in the ledger, and a false tension found there is a visible benefit without touching the atom population.

The unresolved choice is keying. Atom-id keyed context is simplest and matches forget and erase, but a claim hash is not a content revision, so a reworded claim orphans its context. Episode-span keyed context survives rewording but has no existing forget semantics. I recommend atom-keyed with the source episode recorded, and orphaning reported as unknown.


## Proposal 03 — verbatim peer reply

**Operation and benefit.** A small set of typed, source-backed records (report, speaker, subject, occasion, setting) with declared arrows, a short list of path equations, and one conclusion-warrant rule. The benefit is that a conclusion carries the path that licenses it, and a path that was never declared equal to another is never silently merged. Two uses: "what has my mother said about her own health, as opposed to what my sister has said about her" is the speaker path versus the subject path, both landing on the same person and deliberately not identified. "Where was I when Noor recommended that novel" is the occasion's setting, not the location where I later wrote the episode.

The seed's hardest question is which useful query exercises composition rather than displaying slots. My answer: the trait question. "Is it fair to say P prefers quiet?" is warranted only by a path: reports whose speaker is P, about P, on at least two distinct occasions. Hearsay about P reaches P through the subject arrow, not the speaker arrow, and does not count. That is a two-hop path with a cardinality condition, and it is the operation that distinguishes a report from a trait. The setting equation in the dossier (`research/03-typed-relations-and-composition.md:57-63`) is a second, data-integrity check.

## Contract and algorithm (proposed)

```text
Person     { id: local key, aliases: string[] }           -- fixture-local, no registry
Occasion   { id, date?, setting?, declaredSetting? }
Report     { id, statement: {quote, source: episodeFile},
             occasion: OccasionId | "unknown",
             subjects: PersonId[] | "unknown" | "none" }
Attribution{ report: ReportId, speaker: PersonId }       -- relation, so several speakers are legal
Schema     { arrows: {name, from, to}[], equations: [path, path][],
             conclusions: {name, path, minOccasions}[] }
query(schema, records, ledger, q) → { rows, path: string[], unknowns: ref[], violations: {eq, refs}[], unavailable: ref[] }
warrant(schema, records, conclusion, personId) → { warranted: boolean, instances: ReportId[], missing: string }
```

Algorithm:

1. **Load and type-check.** Every arrow value must name a record of the declared codomain kind. An occasion arrow pointing at an episode filename is rejected at load with a reason, never coerced.
2. **Eligibility.** Fold the ledger. A report whose source episode is missing becomes `unavailable` and its quote is never rendered. Quote presence in the named episode is checked by normalized substring, the same property `quotesAreVerbatim` checks today (curator, `src/stack.ts:353`), and nothing more.
3. **Typed join.** A query is a path. Each hop looks up the arrow; an unknown value yields a row in `unknowns`, not a dropped row. Speaker is resolved through Attribution, so a jointly spoken report appears under each speaker with a multiplicity flag.
4. **Equations.** For each record where both sides of a declared equation are defined, compute both paths and compare. Mismatch is a violation with refs. Either side undefined is "not checked."
5. **Warrant.** For a conclusion, enumerate instances of its permitted path for the person and count distinct occasions. Below the minimum, return not warranted with the count and the reports found.

Two paths that share endpoints are never equal unless declared. That is the single olog rule doing work, and it is why "by Mira" and "about Mira" stay apart.

## Fit

Reports are episode-span keyed, not atom keyed. The four atom kinds are the agent's own beliefs (`src/atoms.ts:34`), and a statement by someone else about a third person does not belong there. This differs from my recommendation for proposal 02, and the two can coexist because 02's records point at atoms while these point at episodes. Storage is a small file per report under a directory such as `mind/reports/`, with the source episode filename inside. Person ids are local keys with aliases, no global identity. Off by default means no reports exist. No dependency beyond `atoms.ts` for the ledger fold. Erase redacts atom text only (curator, `src/erase.ts:48`); a report quoting erased text must be covered by an extension, so quotes should be stored with their source and re-checked at read, never cached as authority. Proposal 05 can share the Occasion shape; proposal 02 can use occasion dates; proposal 06 can adopt the equation checker as a named property.

## Tests

| # | Fixture | Expected |
|---|---|---|
| 1 | R1 by Mira, occasion O1, setting garden; query "where did Mira say it" | garden; path report→occasion→setting listed |
| 2 | Occasion arrow on R2 points at an episode filename | load rejects R2 with reason; not an unknown |
| 3 | R1 speaker Mira, subject Noor; query "reports about Mira" | R1 excluded. A naive join on Person would include it; test asserts the typed result differs from that join |
| 4 | O1 declaredSetting cafe, setting garden | violation listed with refs; query still returns both values |
| 5 | Episode E written at home; R1 occasion setting garden | query returns garden; an arm that reads the episode's location fails |
| 6 | R3 subjects unknown; query "about Mira" | R3 in `unknowns`, not in rows and not silently excluded |
| 7 | R4 jointly by Mira and Noor | two Attribution rows; query "by Mira" returns R4 with multiplicity 2; a functional-speaker schema rejects R4 at load |
| 8 | R5 attributed to Noor; fixture note says Mira said it | all checks pass; output contains no "verified" wording; documented limit |
| 9 | One self-report by Mira in 2024, two hearsay reports in 2026; warrant "enduring preference" minOccasions 2 | not warranted, count 1, hearsay listed as excluded by path |
| 10 | R1's source episode erased | R1 `unavailable`, quote absent, listed in unavailable |
| 11 | 5,000 reports, three-hop query | reads only the reports directory plus referenced episodes for quote checks; linear in reports times hops |
| 12 | Same facts as test 9 in prose: "Mira once said… Noor says Mira…" | prose arm has identical information and no refusal; typed arm returns not warranted. This isolates the path rule from formatting |

Test 3 is the mathematical content. Test 4 is the equation checker. Test 9 and 12 together are the useful composed question.

## Comparison and measure

Three arms over identical facts: prose recall through the relational index, where names are lexical co-occurrence entities (curator, `src/relindex.ts:122`); typed records with joins but no equations or warrant rules; and the full schema. Deterministic validity is tests 1 through 12 with no model. Annotation is measured separately: two independent annotators assign speaker and subject for the same span, and agreement is reported per field. Speaker is the risky field, because the 004 run produced a wrong speaker beside a valid citation, so the structure pins exactly the thing models drift on.

The proposal-specific measure is warrant precision: conclusions rendered with a verified path, over conclusions rendered. Beside it, hearsay-as-fact rate and unsupported-trait rate on the fixture set, with supported answers retained. Cost is four annotation fields per report and violations per hundred records as noise. What a later model run could establish, under a named model and visible runs: whether a reader shown "not warranted, one self-report" declines to state the trait, and whether it still answers the supported question. What it cannot establish: that the speaker annotation was right, or that a well-typed report is true.

## Improvement to the seed and the open choice

Replace "a few declared equations" with one conclusion-warrant rule as the primary deliverable, and keep the setting equation as the secondary integrity check. The warrant rule is the only composition here that answers a question a person would actually ask. Model multiple speakers as an Attribution relation from the start, since a functional speaker arrow rejects real data. Distinguish `unknown` subject, which an annotator could not determine, from `none`, a statement with no person as subject.

The unresolved choice is person identity. Fixture-local ids with aliases avoid a registry but mean "Mira" in two reports is the same person only by annotator decision. A shared person file would make the warrant count meaningful across episodes but is the start of an identity system. I recommend local ids plus an explicit alias list per file, and a warrant result that names which ids it counted.


## Proposal 04 — verbatim peer reply

**Operation and benefit.** A recipe is a named pure operation with typed input slots. A binding fixes some slots to evidence references. Instantiation fills the rest from the present request and returns data: a suggestion with its evidence, or a precise statement of what is missing. The benefit is that the agent keeps the way it combined evidence, not only the last answer, and can tell you which input is absent instead of inventing it. Two uses: suggesting an afternoon for friends, where preferences are bound and availability and the venue are supplied later (`research/04-multi-input-operations.md:25-47`); and drafting a birthday message, where the relationship facts are bound and the occasion and tone are supplied later. The aid in the worked example is a degenerate recipe with two bound associations and one remaining slot (`research/worked-examples/01-temporary-aid.md:21-33`).

## Contract and algorithm (proposed)

```text
Type       = "Availability" | "Preference" | "PlaceObs" | "TimeWindow" | "Candidate" | "Intention" | "Instant" | ...
Recipe     { name, slots: {name, type}[], out: Type,
             body: CombinatorTree }           -- tree of named runtime combinators, no code
Binding    { slot, ref: atomId | episodeFile, ledgerStatusAtBind, label }
Aid        { recipe, bindings: Binding[], cue: string, usage: UsageNote[], status: "active"|"retired", retireReason? }
instantiate(aid, supplied: Record<slot, value>, ledger, now: Instant)
  → { kind: "result", value, evidence: ref[] }
  | { kind: "missing", slots: string[], who?: string[] }
  | { kind: "reconsider", binding, status: "superseded-by:…"|"forgotten"|"unavailable" }
specialize(recipe, partial: Binding[]) → Recipe        -- residual with fewer slots
compose(outer, slot, inner) → Recipe | TypeError       -- substitution
```

The body is a tree over a small fixed combinator library in the runtime: overlap of windows, filter by predicate, dedupe by reference, select by score, and a few more. No DSL and no agent-written code. A recipe that the library cannot express is a finding, not a reason to add a language.

Algorithm for `instantiate`:

1. Fold the ledger. For each binding, check the referenced atom's current status. Superseded, forgotten or missing returns `reconsider` with that binding named. Atom content is immutable, so the id fixes content; the ledger fixes validity. Atom ids are not content revisions, so a binding also stores the source episode.
2. Check every remaining slot is supplied with the declared type. Unsupplied slots return `missing`, with participant names where the slot is per-person.
3. Walk the combinator tree. `now` is an ordinary slot of type Instant; no combinator may read a clock.
4. Collect evidence references from bindings and supplied values, deduplicated by reference. One observation feeding two branches is one piece of evidence.
5. Append a usage note to the aid: used, declined, missing, or reconsider, with the date supplied in `now`.

The two properties that make this an operad and a partial evaluator rather than a renamed note:

- **Specialization.** For every completion `rest`, `instantiate(specialize(r, b), rest) == instantiate(r, b ∪ rest)`. This is Jones's correctness equation (`04:55`).
- **Substitution.** `compose(f, s, g)` typechecks only if `g.out` equals the type of slot `s`. Wrapping with an identity recipe changes nothing, and nesting in either grouping gives the same result on the same inputs.

## Fit

Aids live as small data files under a directory such as `mind/aids/`, holding references and short labels only, never quoted text. Authoring happens at an explicit request or as an optional output of reasoning already in progress; the SLEEP contract is a fixed two-artifact format (`src/sleep.ts:731-754`), so an optional third artifact would be a seam to open later, not now. Off by default means no aids directory. Dependency is `atoms.ts` for the fold. Retirement is a status line with a reason on the aid, which leaves source episodes and atoms untouched. Erase redacts atom text (curator, `src/erase.ts:48`); since aids hold no text, an erased atom simply makes its binding `unavailable` at the next instantiation. Works alone. Proposal 02 could supply applicability for bindings; proposal 06 could check that a rendered aid matches its stored bindings.

## Tests

| # | Fixture | Expected |
|---|---|---|
| 1 | Afternoon recipe; preferences bound; availability, place and intention supplied | `result` with one window, one candidate, evidence refs listed |
| 2 | Noor's availability absent | `missing`, slots [availability], who [Noor]; no window invented |
| 3 | Preference bound to Dana; intention names Mira and Noor | `missing` or error naming the binding outside participants; Dana's preference never used |
| 4 | Ledger supersedes the bound preference atom | `reconsider`, status superseded-by, binding named |
| 5 | Mira's availability feeds both overlap and fit | evidence contains her ref once |
| 6 | Three different completions of the residual | specialization equation holds for all three |
| 7 | `compose(plan, windows, overlap)` versus `compose(plan, windows, fit)` | first typechecks; second rejected, Candidate[] is not TimeWindow[] |
| 8 | Identity wrapper on overlap; two groupings of a three-recipe nest | identical outputs on identical inputs |
| 9 | Two runs at different wall clock times, same `now` slot | identical outputs; a combinator reading the clock fails the property |
| 10 | Request unrelated to the aid's cue | not instantiated; usage note "not applicable"; reads limited to the aid header |
| 11 | S3 route closed, bound route atom superseded; separately S2 "no more reminders" | first returns `reconsider`; second retires with reason; source episode untouched in both; retired aid readable on explicit request only |
| 12 | Plain note of 120 chars versus aid header plus instantiation | if characters read to a correct answer exceed the note's, output says prefer note |
| 13 | Bound atom erased | `reconsider` unavailable; assert the aid file contains no string from the erased atom |
| 14 | Same recipe written as prose | tests 4, 6, 7 and 8 cannot be stated for prose; this isolates the structure |

Tests 6 through 8 are the mathematical content. Test 4 is where validity becomes mechanical by reusing the existing ledger. Test 11 keeps validity, usefulness and retirement apart.

## Comparison and measure

Three arms on identical evidence: direct reasoning over the source episodes; a prose recipe with the same slots written in words; and the structured aid. Deterministic validity is tests 1 through 14 with no model. Authoring is measured separately: an agent or person writes the recipe and bindings, and a reviewer checks the tree against the direct-reasoning answer on the fixture. Downstream behaviour, if later authorized with a named model and visible runs: shown `missing` for Noor, does the reader ask rather than guess, and shown `reconsider`, does it re-read the source rather than reuse the stale binding. What no run can establish: that the slots captured what the afternoon meant; the dossier is right that the procedure yields to the narrative when they do not (`04:47`).

The proposal-specific measure is residual advantage: tokens or steps to a correct suggestion with the aid, including discovery, versus direct reasoning and the prose recipe, reported beside the invented-input rate.

## Improvement to the seed and the open choice

Three changes. Bindings should record the atom id, source episode and ledger status at bind time, and instantiation should re-fold the ledger, because that turns "is this still valid" into an existing mechanism rather than a new lifecycle. Usage notes should be the agent's own evidence for usefulness, so retirement is a judged status with a reason and never a decay rule. And the specialization equation should be the acceptance test for any recipe before it is stored.

The unresolved choice is the combinator library. A fixed library in the runtime is safe and keeps memory data-only, but will fail to express some recipes. Agent-written code would express anything and is executable memory, which the constraints forbid. I recommend the fixed library, with inexpressible recipes recorded as a plain prose note, which remains the strongest baseline.


## Proposal 05 — verbatim peer reply

**Operation and benefit.** Two operations, kept apart. Incidence: an occasion is a thing with evidenced participants, so "were Mira, Noor and I ever together" is answered from occasions, not reconstructed from pairs. Interpretation: an account of what an occasion meant is attributed to a person and a question, and a later account can be linked to an earlier one with a checked relation that keeps both. Two uses: the dinner in the worked example, where a reflection weeks later shares no words with the original (`research/worked-examples/02-shared-experience.md:5-13`); and a concert attended with a sibling, reinterpreted after a loss, where the first meaning must survive the second.

A fact about the default first. The relational index already treats an episode as a hyperedge: one unit lists every entity it mentions (`src/relindex.ts:116-126`), so a shared dinner and three pairwise meetings are already different at the unit level. What the index cannot do is separate mention from participation, split one episode into two occasions, carry roles, or reach a reflection that repeats none of the original anchors, since adjacency links only chronological neighbours (`src/relindex.ts:144-145`). Those four are the augmentation.

## Contract and algorithm (proposed)

```text
Occasion       { id: episodeFile | episodeFile#span,   -- default is the source path itself
                 participants: {person, role?, evidence: {quote, source}}[],
                 mentioned: person[], date? }
Interpretation { id, about: OccasionId | {ambiguous: OccasionId[]},
                 question: "what-happened"|"how-i-felt"|"why-it-mattered"|"other",
                 by: person, text: {quote, source} }
Revisits       { from: InterpretationId, to: InterpretationId, coexist: boolean }
occasionsFor(person) → Occasion[]
jointlyPresent(persons[]) → Occasion[]              -- all listed as participants, never mentioned
recall(occasion, depth = 5) → { narrative: source, participants, chain: Interpretation[], cycles, orphans }
link(a, b) → Revisits | Rejected{reason}
```

Algorithm:

1. **Load and check quotes.** Every participant and interpretation quote is checked for presence in its source by normalized substring, the property `quotesAreVerbatim` already checks (curator, `src/stack.ts:353`). A missing source makes the record `unavailable` and its quote is never rendered.
2. **Joint presence.** Intersect participant sets across occasions. No sub-occasion is ever created for a subset. A pair present at a three-person dinner is reported as jointly present at that dinner.
3. **Link check.** `link(a, b)` succeeds only if both interpretations resolve to the same occasion and the same question. Different questions or different occasions are rejected with the reason. An ambiguous `about` on either side yields a link marked ambiguous, never resolved by the checker.
4. **Traversal.** From an occasion, follow revisits in both directions up to the depth cap, with visited-set cycle detection. Return the chain in source-date order with each account's author. No winner is chosen.
5. **Ambiguity.** "That dinner" when two dinners exist is stored as ambiguous over both and shown under both, flagged.

The mathematical content is exactly step 3. A 2-cell between two 1-cells requires shared endpoints (`research/05-higher-order-relations.md:46-54`). Translated, a revisits link is legal only between accounts of the same occasion answering the same question. A plain pointer accepts anything. Simplicial closure is deliberately absent: step 2 answers subset questions by computation, never by storing faces.

## Fit

One small file per occasion under a directory such as `mind/occasions/`, holding participants, mentions, interpretations and links together. The occasion id defaults to the episode path, as the seed suggests; an explicit span suffix exists only when one episode holds two occasions. Off by default means no directory. Dependency is none beyond file reads; ledger folding is irrelevant because occasions reference episodes, not atoms. Erase redacts atom text only (curator, `src/erase.ts:48`); occasion files hold quotes, so the obligation is to re-check every quote at read time and render nothing whose source is gone. Occasions carry no weight and never decay; a rare meaningful evening stays reachable through its participants for as long as its episode exists. Proposal 03 can share the Occasion and person shapes; proposal 01 can key a view by occasion; proposal 02 can use occasion identity for alignment.

## Tests

| # | Fixture | Expected |
|---|---|---|
| 1 | Three pairwise episodes versus one shared dinner | `jointlyPresent([M, N, narrator])` returns D1 in the shared case and empty in the pairwise case, stated explicitly |
| 2 | Same three people on two dates | two occasions, two ids, never merged |
| 3 | Dana mentioned at D1 | Dana in `mentioned`, not `participants`; `jointlyPresent([M, Dana])` empty |
| 4 | D1 Noor cooked; D2 Mira cooked | roles per occasion; "who cooked" answered per occasion |
| 5 | Narrator's "at ease" as interpretation by narrator | query "how did the group feel" returns unknown; no projection to others |
| 6 | R1 reflection with no anchor words, linked to I1 | `recall(D1)` returns both; an index query "Noor quiet" returns D1 only. This is the retrieval benefit isolated |
| 7 | I1 answers why-it-mattered; I3 answers what-happened | `link(I1, I3)` rejected, question mismatch; a plain pointer arm accepts it |
| 8 | "That dinner" with D1 and D2 both plausible | interpretation stored ambiguous over both, shown under both, flagged; never auto-resolved |
| 9 | I1→I2→I3→I1 | traversal terminates, cycle reported, depth cap honoured |
| 10 | D1's episode erased | occasion `unavailable`; quotes absent; its interpretations listed as orphans |
| 11 | One occasion, zero later use, 400 decay events in the ledger | still returned by `occasionsFor(Mira)`; no weight involved |
| 12 | D1 with three participants; pair queries | answered as jointly at D1; occasion count stays 1; no two-person face created |
| 13 | 1,000 occasions; `recall(D1, 3)` | reads D1's file plus linked files only |
| 14 | Same facts as tests 7 and 9 in prose "later reflection on the same dinner" | prose can be neither rejected nor traversed; this isolates the checked relation from annotation |

Tests 1, 3 and 12 are incidence. Tests 6, 7 and 9 are interpretation. Keep their results separate in any report.

## Comparison and measure

Three arms over identical evidence: narrative plus the relational index; occasion records with a plain "see also" pointer; and occasion records with the checked link and the joint-presence operation. Deterministic validity is tests 1 through 14 with no model. Annotation is measured separately, and the risky fields are participation versus mention, and the question label; two annotators, human or named model, produce them for the same episode and agreement is reported per field. My expectation, not a finding, is that models conflate mention with attendance.

Downstream behaviour, if later authorized with visible runs: does a reader shown the recall output avoid asserting Dana attended, avoid attributing the narrator's ease to the group, and present both interpretations without picking one. The proposal-specific measure is two numbers kept apart: invented-participation rate for incidence, and co-retrieval rate of anchorless reflections for interpretation. Cost is annotation fields per occasion. What no run can establish: that the evening's meaning survived the fields; the dossier is right that narrative stays authoritative for that (`05:70`).

## Improvement to the seed and the open choice

Accept the seed's point: no redundant occasion field, the episode path is the id unless split. Attach interpretations and links to the occasion file rather than a separate store, so one file carries one evening. Make the checked property exactly "same occasion and same question," and keep `mentioned` as negative evidence so absence is recorded rather than inferred.

The unresolved choice is the question label. Free text makes the boundary check string equality, which is brittle. A small enumerated set makes the check meaningful but may not fit every reflection. I recommend the enumerated set with `other` plus free elaboration, and a rule that `other` never links to `other`.


## Proposal 06 — verbatim peer reply

**Operation and benefit.** A pure checker takes an old record, a candidate record, a declared rule and admitted assumptions, and returns a per-field verdict of pass, fail or not-checked, plus the differences and a flag for text changed outside the represented fields. The benefit is that a transformation a model made, such as a supersession or a consolidation, can be held to a named property without anyone pretending the prose is certified. Two uses: "often prefers quiet conversation with close friends after a tiring day" rewritten as "dislikes social occasions" fails on modality, circumstance and comparison target (`research/06-checked-memory-transformations.md:27-47`). A travel memory consolidated from two episodes that silently turns "we" into "I" fails on subject.

The default already has two members of this family, and they are the right model. `quotesAreVerbatim` checks normalized substring presence and nothing more (`src/stack.ts:364-367`). `assertRenderInvariant` recomputes the render and compares bytes (`src/rem-popmem.ts:952-958`). Publication validates atom shape only and never semantics (`src/publish.ts:52-56`). The checker is a third member: name the property, recompute it, say nothing else.

## Contract and algorithm (proposed)

```text
Rule       { id, version, fields: string[], allowed: Record<field, "equal"|"narrow"|"any">,
             sourceChecks: ("quotesResolve"|"sameKind"|"scopeNotWidened")[] }
Input      { old: {bytes, fields?}, candidate: {bytes, fields?},
             sources: {ref, bytes|null}[], assumptions: {id, text}[] }
check(rule, input) → { perField: Record<field, "pass"|"fail"|"not-checked">,
                       diffs: {field, oldHash, newHash}[],
                       unrepresentedTextChanged: boolean,
                       verdict: "pass"|"pass-under-assumptions"|"partial"|"fail",
                       assumptionsUsed: id[] }
receipt(rule, input, result) → { ruleId, ruleVersion, checkerVersion,
                                 oldHash, candidateHash, sourceHashes, assumptionsHash,
                                 verdict, perField, ts }     -- hashes and field names, no values
verify(receipt, currentInput) → "applicable" | "stale: candidate|source|rule|assumptions"
```

Algorithm:

1. Hash old, candidate and every source by bytes. Atom ids are claim hashes, not content revisions, so hashes are always of bytes.
2. Run source checks: every candidate quote resolves in its named source by the existing normalization; kind unchanged; scope not widened from project to global. A missing source makes its check not-checked.
3. For each rule field present on both sides, compare under the allowed relation. Present on one side only is fail. Absent on both is not-checked.
4. Strip represented fields from both texts and compare the remainder. Any difference sets `unrepresentedTextChanged`.
5. Verdict: fail if any field fails; partial if any field is not-checked; pass-under-assumptions if an assumption was consulted; pass otherwise. Pass never implies anything about step 4, which is reported alongside.

A receipt is optional, bound to all hashes, and never read by publication. A pass authorizes nothing.

**The path pair and the limited equivalence.** Path A: annotate the old record, transform the fields under the rule, render with a fixed renderer. Path B: let a writer transform the prose, then annotate the candidate. The property: represented fields from A equal represented fields from B. When they differ, the checker names the field. It cannot say whether the writer changed meaning or the annotator read it differently; that limit is the point. No proof assistant is involved, and the dossier is right that higher inductive types add nothing here (`06:57`).

## Fit

A pure function in the runtime with no dependencies beyond `atoms.ts` parsing and the quote normalizer. Receipts, if kept, are small JSON files under a directory such as `mind/checks/`, holding hashes and field names only, so erasing an atom leaves nothing to resurrect. Off by default means no checks run and no files exist. The natural first population is supersede and resolve events, where fields the atom already has (kind, scope, quote sources, stamps) need no annotation. Richer fields such as modality and circumstance come from proposal 02 or 03 annotations when present and are not-checked otherwise. Works alone. Proposal 01 can run the checker on its fixed renderer; proposal 04 can run it on a rendered aid against its stored bindings.

## Tests

| # | Fixture | Expected |
|---|---|---|
| 1 | Fields {subject self, circumstance tiring-day, modality often, prefers quiet over gathering}; fixed renderer; parse back | all fields pass; unrepresented unchanged; verdict pass |
| 2 | Subject self → Mira | fail {subject} |
| 3 | Modality often → always | fail {modality} |
| 4 | Circumstance removed | fail {circumstance: present → absent} |
| 5 | Comparison target gathering → all social occasions | fail {comparison} |
| 6 | Quote and source retained; prose now "dislikes social occasions"; no field annotations | sourceChecks pass; every semantic field not-checked; verdict partial; output never says pass |
| 7 | One field unannotated on the candidate | that field not-checked; verdict partial |
| 8 | Candidate bytes edited after receipt | `verify` returns stale: candidate |
| 9 | Atom id unchanged; source episode bytes edited so quote no longer present | quotesResolve fails; `verify` returns stale: source |
| 10 | Rule version bumped, or assumption text changed | `verify` returns stale: rule or stale: assumptions |
| 11 | Source deleted | quotesResolve not-checked; verdict partial, never pass |
| 12 | Assumption "M. is Mira" admitted; alignment depends on it | verdict pass-under-assumptions; receipt lists the assumption id |
| 13 | Fields identical; old text "I'm not sure why it mattered", candidate drops the hedge | all fields pass; `unrepresentedTextChanged` true; verdict pass with the flag set, so a reviewer can reject |
| 14 | 10,000-byte records, 8 fields | linear in bytes plus fields; no corpus access |
| 15 | Path A versus path B on a faithful rewrite, then on a rewrite that changed modality | equal fields in the first; `{modality}` named in the second |
| 16 | Faithful rephrase versus modality change, both shown to git diff | diff reports word changes in both; checker passes the first and fails the second. Same information, different verdicts |

Test 16 is the value of a named property over diff. Test 13 is the boundary between field pass and prose change. Test 15 is the limited equivalence.

## Comparison and measure

Three arms over identical records: git diff plus provenance, which exists; the same-field check run and discarded; and the check with a persisted receipt. Deterministic validity is tests 1 through 16 with no model. The value of checking is measured as false acceptances caught per hundred transformations versus diff alone. The value of the receipt is measured separately as the count of later verifications that could not have been recomputed because a source, rule or assumption had changed. If that count stays near zero, keep the check and drop the receipt.

Annotation is measured apart: field values come from proposal 02 or 03 annotators or a named model, and annotator agreement per field is reported before any verdict. A correct checker over a wrong annotation is wrong. Downstream behaviour, if later authorized with visible runs: shown "pass on fields, text changed outside fields," does a reviewer still read the prose, or does the pass label produce false assurance. That false-assurance rate is the proposal-specific risk measure. What no run can establish: that the eight fields captured what the memory meant.

## Improvement to the seed and the open choice

Four changes. Make the overall verdict never pass when any field is not-checked; call that state partial. Always emit the unrepresented-text flag, since the 004 wrong-speaker case had valid citations beside wrong prose. Persist hashes and field names only, never values. Start with the fields atoms already carry, applied to supersede and resolve events, so the first version needs no annotation at all.

The unresolved choice is whether receipts exist in the first version. Checking is pure and cheap. A receipt earns its place only when recomputation is impossible, and the ledger schema is fixed, so receipts would be a sidecar file rather than a ledger line. I recommend ephemeral checks first and receipts only for supersessions, with the sidecar-versus-ledger question deferred until there is a measured recompute gap.
