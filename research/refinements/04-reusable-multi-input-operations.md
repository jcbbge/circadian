# 04 — Reusable operations: implementation and test refinement

**Status:** Implemented as an independent research prototype with deterministic fixture checks and outside peer review. R14's total-cost/usefulness comparison remains deferred. Semantic and behavioral benefit also remain unmeasured for the other cases. No production integration or behavioral inference evaluation. Builds on [dossier 04](../04-multi-input-operations.md), the [temporary-aid example](../worked-examples/01-temporary-aid.md), and [shared protocol](TEST-PROTOCOL.md).

[Implementation](../prototypes/04-operations/index.ts) · [Demonstration](../prototypes/04-operations/demo.ts) · [Case coverage](../prototypes/04-operations/coverage.json) · [Run instructions and results](../prototypes/README.md)

## Useful operation and improvement

Retain a useful way of combining inputs, bind already-known information with its source, and expose the remaining work. Reuse it when relevant; stop using the aid when its utility ends while preserving the underlying experience.

Uses: propose a shared afternoon using stated preferences, current availability and place observations; prepare a creative brief using previously chosen themes while leaving the current medium and occasion open. The operation produces tentative data with reasons or missing inputs. It does not promise how people will feel or perform external actions.

The peer sharpened the design with explicit specialization and substitution properties. The parent makes two corrections: an atom ID and unchanged ledger status do not establish continuing validity, and a pure computation must not append usage notes as a side effect. We also avoid introducing a generic combinator-tree language while claiming to have no DSL.

## Research prototype and design sketch

The prototype implements one known recipe using three ordinary pure functions in the existing runtime, not an interpreter for executable memory. The following preserves the design-level sketch; exact local signatures include the explicit time and bounds shown in the linked implementation:

```text
overlap(availabilityByPerson) → shared windows
matchPlace(reviewedRequirements, currentPlaceObservations) → matching options / unknowns
assemble(windows, options, intention) → tentative result / missing

instantiate(aidRecord, suppliedInputs, sourceStates, asOf, applicability, limits)
  → result | missing | notApplicable | reconsider | unsupported
```

The implemented aid record names that known recipe and retains participant/occasion identity, bindings, sources/revisions and any retirement note. Applicability is supplied explicitly at instantiation; missing slots are derived from the bindings and supplied inputs. It is data. A plain prose procedure remains usable for methods outside the tiny implemented vocabulary. There is no need to make all useful aids executable.

Algorithm:

1. Check supplied character/record/work limits before composition; an exceeded limit returns a bounded unsupported status. Work bounds apply per finite phase, not as a count of every CPU instruction. Future use would select an aid at an already relevant reasoning/recall opportunity. Discovery is a cost, not a free assumption; no chooser is implemented or runs before every task.
2. Accept an explicit reviewed applicability input: applies, doesNotApply or unknown. The second returns notApplicable without retirement; unknown returns missing(applicabilityEvidence). Check binding revisions/eligibility. Unchanged source bytes or ledger status do not prove current-world validity; declared conditions and available evidence still matter. Unknown conditions limit reliance rather than inventing satisfaction.
3. Validate participant/occasion bindings and remaining input types. Report missing slots precisely. A supplied value that conflicts with an already-bound slot returns reconsider(bindingConflict), never silent overwrite.
4. Evaluate the fixed composition with all dependencies, including `asOf`, supplied explicitly. No clock/file/model calls occur inside the pure functions.
5. Return the result and deduplicated source evidence. A usage observation remains an optional future design; the prototype produces no usage record. Any persistence would be a separate operation after computation, using the eventual publication integration. It is excluded from the pure equivalence claim.

Specialization for the fixture binds reviewed preferences `p` in an aid record: `instantiate(aidWithP, rest, ...) = plan(p, rest, ...)`. The residual is data identifying a known recipe and its bindings, not generated executable code. The property is equality with the fully applied plan for identical remaining inputs, applicability, source state and `asOf`. Substitution requires a produced value's type to match the receiving input. Identity wrapping and regrouping an explicitly pure composition preserve its output. These are concrete contributions to test; they do not establish a full general operad implementation or guarantee speedup.

Current source seams are ordinary source-bearing atoms/episodes and optional derivation after an episode has been committed. Existing SLEEP emits its established artifacts; this design does not require changing that contract to add a third output. [`sleep.ts`](../../src/sleep.ts), [`graze.ts`](../../src/graze.ts), [source map](SOURCE-MAP.md).

An optional aid can retain its own active/retired interpretation without repurposing atom forget for arbitrary objects. Disablement means no selection or instantiation even if old aids exist. Source eligibility and supplemental erasure must be integrated before live persistence; short labels can also contain sensitive source meaning, so references-only storage is not automatically erasure-safe. No mandatory classifier, service or new database.

## Deterministic fixture

In a fictional planning task, Mira is available in minutes `[60,120)` and Noor in `[90,150)`. Both explicitly require a quiet venue for this occasion. Garden G is observed quiet with seating. The intention is a 15-minute conversation. The fixed rule selects the earliest feasible interval and then the first matching place under a supplied stable order. **Place order is part of the binding**, because changing it can change the tie-break result; reordered places therefore constitute a binding conflict, even when set membership is unchanged. Output: G, `[90,105)`, with preference, availability, place and intention references. A fully known infeasible completion returns result(options=[]) with reasons, distinct from missing evidence. These are fixture constraints, not a rule that all preferences are hard requirements.

| ID | Variant / operation | Expected |
| --- | --- | --- |
| R01 | Complete fixture | G at [90,105), tentative and source-backed. |
| R02 | Noor's availability missing | `missing(Noor.availability)`; no invented interval. |
| R03 | Bound preference concerns Dana instead of a participant | Binding mismatch; Dana's preference never silently substitutes. |
| R04 | Bound source superseded, ineligible or content revision changed | `reconsider` identifying the binding; inspect fresh evidence before reuse. |
| R05 | Same availability record feeds two branches | One underlying evidence reference, not two confirmations. |
| R06 | Bind preferences; completions: base fixture; Noor changes to [115,150); G becomes noisy and H is supplied quiet with seating | Respectively G [90,105); no feasible 15-minute option; H [90,105). Each equals the full plan, including evidence. |
| R07 | Substitute `overlap` into a windows slot; substitute `matchPlace` there instead | First composition is valid; second is a type mismatch. |
| R08 | Identity wrapper and equivalent groupings of the three pure functions | Same result and evidence set under stable ordering. |
| R09 | Different wall clocks, identical supplied `asOf` and inputs | Identical computation. No usage write occurs inside it. |
| R10 | Reviewed applicability doesNotApply today, applies tomorrow; unknown variant | Today notApplicable without retirement; tomorrow reusable; unknown returns missing(applicabilityEvidence). |
| R11 | Closed route/place versus “this reminder no longer helps” | First concerns validity/reconsideration; second can justify retiring the aid. Neither deletes the source experience. |
| R12 | Forgotten/deleted required source | No stale binding reuse; return a status. Test residual text/labels in any future erase integration too. |
| R13 | 21 supplied records, limits.records=20 | Unsupported(limit) before composition, rather than unbounded selection/computation. |
| R14 | Prose recipe or direct reasoning solves the same cases at lower total cost | Evaluation records no advantage for C; instantiation does not grade itself or declare a speedup. |
| R15 | One aid binds preferences, another binds availability; each receives the identical complete fixture as its complement | Both equal full application: G [90,105), same deduplicated evidence, under identical source state/asOf/applicability. |
| R16 | Already-bound preference supplied again with a conflicting value | reconsider(bindingConflict); neither value silently wins. |

## Comparisons and benefit measures

A is direct reasoning from the same evidence. B is a prose recipe with identical slots/conditions, plus an ordinary hand-written function where deterministic comparison is appropriate. C retains bindings and the explicit residual/composition. Compare the residual to the ordinary function; do not pretend a concise function lacks composition merely because it is not called an operad.

Measure correct usable suggestions, invented/missing input handling, reuse after changed conditions, authoring effort, and total discovery/checking/context/computation cost. Count savings only after those costs. Usefulness can be assessed by the agent from evidence, while explicit user correction governs; silence alone proves neither competence nor obsolescence.

First behavioral cases: R01/R06 positive, R02/R11 challenging. No classifier is needed in the pure operation. A later Jev arm could propose slot matching or aid applicability, but must be measured separately with identical fallback permissions and complete selection cost.

Unresolved choice: whether the practical gain resides in a reusable record, specialization, or simply an agent practice of writing a concise aid. This design makes those separate comparisons possible without committing to a procedural-memory language.
