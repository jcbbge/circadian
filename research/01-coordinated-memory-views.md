# Dossier 01: Coordinated views of one memory

**Implementation, usage and test refinement:** [Dedicated peer-refined supplement](refinements/01-coordinated-memory-views.md). This carries the latest concrete operation and case specifications; the conceptual dossier below remains provisional. No benchmark execution or production implementation is reported.

Status: **Provisional pre-plan research.** Recorded 2026-10-10. This preserves the first collaborative analysis and adds an explicit evaluation outline. It is not an approved architecture, implementation plan, or claim of measured benefit.

Code observations refer to commit `dd31739cf8cf5f5c7e137d8a8f2b4ebaac3bb3a7`. Primary sources were acquired during the research session. See the [research index](README.md) for shared constraints.

## Question and intended benefit

Can a smaller representation of memory preserve what matters for its intended use, while making its limitations apparent? That use may be recollection, conversation, reflection, or a decision.

Circadian remains the owner of memory and its lifecycle. The candidate addition is a disposable view over existing records, with explicit preservation rules. Its value would be more faithful and useful recall under a context budget. Decision accuracy is one possible measure; preserving a story's attribution, emotional texture, and qualifications also matters.

The operator wants high-level orientation outside a project and more detail inside the relevant project, one continuous intelligence across environments, and optional additions that fit the existing default. Minimality includes storage, dependencies, maintenance, context consumption, selection overhead, and additional tool calls. These are operator constraints from the brainstorming conversation, not research findings.

## General-purpose scope and example

Circadian is general-purpose memory. Project-specific wake behavior is an existing implementation example, not the conceptual boundary of a view. Views could concern a journey, a friendship, a learning thread, a creative idea, or a period of life.

In a synthetic example, an episode says: “During a family visit, the garden felt restful after my long journey.” A short orientation could retain the family visit and the attributed feeling, with a source reference for the scene. Rewriting it as “prefers gardens to people” would invent a general preference and lose the occasion. A fuller recollection might preserve sensory or relational detail that has no immediate task value. These proposed distinctions are not psychological findings, and arbitrary prose fidelity remains outside the mechanical guarantees below.

## Existing Circadian foundation

The current implementation already resolves scope, composes project/global wake context, and provides explicit recall. Source atoms contain a claim, reason, quotations, episode references, and optional scope. The ledger records reinforcement, supersession, and contradiction events. The relational index provides deterministic evidence retrieval and source references. These are observed capabilities, not proposed additions. Sources: [scopes](../src/scopes.ts), [atoms](../src/atoms.ts), [relational index](../src/relindex.ts), [wake composition](../src/wake.ts), and [recall entrypoint](../bin/circadian).

Consequently, “add different views” is insufficient motivation. A candidate must identify a useful question that existing recall does not already answer as well.

Two implementation boundaries matter. Wake retrieval does not receive the first user task; it derives anchors from the working directory and continuation information. Also, the committed checkout helper reconstructs a narrower subset than the complete wake payload. A proposal must not assume task-aware startup or an existing atomic snapshot of every wake input. Sources: [wake retrieval](../src/relindex.ts), [checkout](../src/checkout.ts), and [wake](../src/wake.ts).

## Mathematical contribution: restriction consistency

A presheaf assigns data to domains and supplies restriction maps to smaller domains. Its laws require identity restrictions and agreement between direct restriction and restriction through an intermediate domain. The borrowed discipline is that narrowing the same source population through different valid routes should preserve the same result. This is a structural law, not a guarantee about arbitrary summaries. Source: [Stacks Project, definition of a presheaf](https://stacks.math.columbia.edu/tag/006D).

### Worked example: scope and truncation

Consider a fixed source population containing records from projects A and B. Suppose a global top-one view ranks A first.

1. Truncate globally, then filter to B: the result is empty.
2. Filter the original population to B, then truncate: the result contains B.

Thus filtering and lossy selection do not commute. This is an original toy example, not an observed Circadian defect.

The proposed engineering rule is to select a requested scope from eligible source records before applying that view's budget. Expansion should return to the source, not ask a shortened global summary to reconstruct omitted evidence.

The restriction law can apply before lossy ranking and rendering. It cannot be asserted indiscriminately across rendered outputs. Once this is stated, the implementation resembles ordinary projection engineering; calling it a presheaf does not add functionality or establish that all sheaf-related axioms hold.

## Mathematical contribution: conservative abstraction

Abstract interpretation studies simpler representations that soundly account for the possibilities relevant to a specified property. Its practical tradeoff is precision versus computational cost; a sound abstraction may retain possibilities that are not actually realized. Source: [Patrick Cousot, Abstract Interpretation in a Nutshell](https://www.di.ens.fr/~cousot/AI/IntroAbsInt.html).

The proposed transfer to memory is deliberately narrow: a compact view has a defined job, and compression must not strengthen the claims it conveys.

| Source information | Proposed preservation requirement |
|---|---|
| A statement belongs to a particular customer or project | Preserve that scope; do not render it as universal |
| A claim participates in an unresolved recorded disagreement | Preserve a disagreement marker and a route to the other evidence |
| A conclusion has cited support | Preserve source identity or a reference back to it |
| Eligible records were omitted | Do not imply that omitted information does not exist |

A compact view that presents an apparently settled recommendation while hiding opposing evidence can fail its job despite reading fluently. A small marker plus a reference may be more useful than another sentence of narrative detail. That is a hypothesis to test.

Mechanical guarantees apply only to represented information and defined transformations. Circadian's atom schema does not explicitly encode every prerequisite, causal relationship, or applicability condition that may appear in prose. Preserving arbitrary natural-language meaning would require annotation or interpretation beyond the existing structured fields. Sources: [atom types](../src/atoms.ts) and [index unit representation](../src/relindex.ts).

## Two-domain scrutiny

**Restriction theory:** the mechanism is path-independent narrowing over a fixed source population. The truncation example breaks a naive claim that all rendered views satisfy that law. The retained proposal therefore separates restriction from lossy presentation.

**Program analysis:** the mechanism is a property-specific approximation with stated guarantees. It breaks when a summary silently drops a condition needed for the property, or when no formal interpretation of that condition exists. The retained proposal limits its checks to explicit fields and reports insufficiency beyond them.

These are specific constraints borrowed from other fields. They do not establish novelty, truth of remembered claims, or improved model behavior. A conventional implementation that satisfies them is an acceptable outcome.

An additional research lead was adaptive numerical refinement: concentrating refinement where estimated error affects a quantity of interest. The inspected paper uses numerical error estimators that this proposal does not possess for prose. No analogous prose error bound or new automatic refinement controller is justified here. Source: [Jakeman and Wildey, goal-oriented adaptive sparse grids](https://arxiv.org/abs/1407.1061).

## Smallest optional fit

The initial candidate is one deterministic selection-and-rendering operation over existing records, invoked through the existing explicit recall surface. It carries source identities and a few preservation checks. Its output is disposable; it does not become a second canonical memory population.

Proposed boundaries:

- The existing wake and recall layout remains the default.
- No category-theory package, database, daemon, or mandatory inference call.
- No catalog of alternative summaries to maintain before a particular view earns its place.
- No task selector added to startup when the task is not yet available.
- Disabling the addition requires no memory migration or cleanup.

The package manifest currently declares no runtime dependencies; the proposal should preserve that characteristic. Source: [package manifest](../package.json). The exact extension mechanism remains undecided.

A classifier could later propose a view or identify semantic qualifications. Its interpretation and inference cost would be separate experimental variables. Deterministic rendering of already explicit information does not require a classifier.

## Dedicated evaluation proposal

No experiment for this proposal has been run. The following is a proposed protocol, not an acceptance claim.

First use small, inspectable fixtures to check scope preservation, references, disagreement markers, omitted-record signaling, and the order of filtering versus truncation. Include an adversarial case where the highest-ranked record belongs to another scope and one where an opposing record falls outside the display budget. Use a fixed input population; do not assume a whole-mind snapshot feature.

Use fixtures from personal recollection, learning, creative exploration, and practical planning, as well as technical work. Keep attribution, uncertainty, and preservation of meaningful detail separate from task success; use explicit human judgments where no mechanical criterion exists. Do not treat low retrieval frequency as evidence that a memory is disposable.

Then compare:

1. Current Circadian recall.
2. An ordinary compact view with the same budget.
3. The proposed view with explicit preservation rules.

The second arm is necessary to distinguish the value of the rules from ordinary summarization or formatting. Hold source evidence and task difficulty comparable. Predeclare model/provider/version, prompts, settings, available tools, repetition count, scoring, and failure criteria. Retain inspectable inputs and outputs.

Measure task correctness, loss of relevant qualifications, unsupported certainty, source recovery, total context, elapsed time, and additional retrieval calls. A smaller initial payload that requires several expensive follow-up calls may be a net loss. Do not claim that a deterministic fixture pass establishes model compliance.

Retire or simplify the candidate if existing recall or ordinary formatting performs as well, if it merely moves tokens into later calls, or if semantic annotation costs dominate its useful effect. Choose numerical thresholds before future runs, not after observing results.

## Open questions and provisional verdict

- Which concrete question is underserved by existing recall?
- Which qualifications can be preserved mechanically from present fields?
- How should a view express insufficiency without adding routine noise?
- Does a useful view need a bounded, consistent input snapshot beyond current APIs?
- Would an explicit view be used often enough to justify another option?

The promising idea is deliberate, testable information loss. Preserve qualifications relevant to the intended use while reducing unnecessary detail. A small optional projection is plausible; a new ontology engine, summary store, or model router has not earned its weight. Performance and behavior benefits remain unknown.
