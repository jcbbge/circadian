# Six executable Circadian augmentation prototypes

All six refined proposals now have independent implementations, fictional fixtures, dedicated deterministic tests, case maps and runnable demonstrations. These are optional research operations over supplied evidence. They do not register with or change Circadian's production lifecycle.

## Run them

From the repository root, using the existing Bun installation:

```sh
bun research/prototypes/run.ts
bun research/prototypes/run.ts --only 01,06
bun research/prototypes/run.ts --only none
bun test ./research/prototypes
bun research/prototypes/coverage.ts
```

The first command runs all six demonstrations and prints JSON. Selection runs only the named proposals; `none` imports/invokes no demonstration. This is a research runner, not an installed extension/configuration system. Each directory's `demo.ts` can also run directly, for example `bun research/prototypes/04-operations/demo.ts`.

| Proposal | Implemented operation | Concrete demonstration | Specified cases |
|---|---|---|---|
| [01 — Views](01-views/index.ts) | `restrictRecords`, `makeView`, `expand` | Family records b/c survive scope selection; a smaller view retains b's disagreement reference; c expands from fresh supplied source state. | 14 deterministic |
| [02 — Compatibility](02-compatibility/index.ts) | `compareContexts`, `checkJoint` | Reading/dancing preferences coexist; each pair of three binary constraints has a witness, but their conjunction has none after eight assignments. | 15 deterministic |
| [03 — Relations](03-relations/index.ts) | `composeReports` | Mira's attributed reports lead to garden/library occasions; an explicitly conflicting setting annotation is reported without choosing a true account. | 14 deterministic |
| [04 — Operations](04-operations/index.ts) | `overlap`, `matchPlace`, `assemble`, `instantiate`, `retireAid` | Preference-bound and calendar-bound aids both produce G at [90,105); missing Noor availability prevents an invented plan. | 15 deterministic; R14 deferred |
| [05 — Experiences](05-experiences/index.ts) | `jointOccasions`, `checkRevisit`, `recallOccasion` | One shared dinner differs from three pairwise meetings; checked links connect supplied interpretations, and omitted relevant accounts make coverage incomplete. | 16 deterministic |
| [06 — Transformations](06-transformations/index.ts) | `checkPresentation`, `makeReceipt`, `verifyApplicability` | Often→always fails modality preservation; misleading free prose stays unassessed; editing candidate bytes invalidates the old receipt. | 18 deterministic |

Each implementation imports only its own local files or runtime facilities; the only core standard-library import is SHA-256 for proposal 06. No new packages, database, service, model endpoint, universal ontology or executable recipe language is required. The shared runner imports selected demos; the six core implementations do not depend on one another.

## Evidence and what it establishes

[results.json](results.json) records exact commands, runtime, source hashes, case coverage, test counts and the check that tracked production files were unchanged. [test-results.xml](test-results.xml) contains the actual executed test names/results. [demonstrations.json](demonstrations.json) captures outputs from all six. To generate your own named test report:

```sh
bun test ./research/prototypes --reporter junit --reporter-outfile /tmp/circadian-prototype-tests.xml
```

The combined run after peer corrections passed **120 tests, 492 assertions, zero failures or skips**. The outside [code review](PEER-REVIEW.md) found two reproducible defects: ignored context restrictions and silently omitted interpretations. Both were corrected with regression tests. The [parent resolution](REVIEW-RESOLUTION.md) records the changes and dispositions; the [focused closure](PEER-CLOSURE.md) preserves the peer's follow-up. Request/response receipts accompany both exchanges.

All **93** specification IDs are mapped in the six `coverage.json` files. **92** have deterministic contract/boundary checks. **R14**, whether the reusable aid beats prose/direct reasoning in actual total cost and usefulness, remains explicitly deferred. Additional adversarial and integration tests are separate from the 93-case inventory. The coverage audit checks the map; captured JUnit evidence also binds each claimed deterministic case to an executed test name.

A structural case can deliberately pass a false-but-well-formed annotation. Such a test establishes the checker boundary; it does not validate the annotation. Tests for missing sources, changing interpretations or lost uncertainty similarly do not establish how well a future model extracts or uses those fields. Model behavior, narrative fidelity, annotation effort and practical speedup remain unmeasured across all six.

Simpler comparisons are retained honestly. Ordinary typed joins yield the same positive answers; ordinary full application agrees with stored partial applications; the incidence comparator is explicitly an implementation alias, not independent experimental evidence. A bounded exhaustive checker implements the joint-constraint mathematics with ordinary code. No improvement is inferred merely from a mathematical name.

In proposal 05, the later interpretation already carries the occasion ID in the supplied population. H05 tests checked traversal and omission accounting; it does not demonstrate discovery or superiority over direct occasion lookup.

## Integration boundaries

Callers supply reviewed meaning, source availability, eligibility, revisions and explicit limits. The prototypes read no living mind, resolve no global identity and publish nothing. Proposal 01's source revisions are supplied values; proposal 06 independently hashes its exact supplied inputs. View and experience character budgets count the whole successful JSON payload in JavaScript UTF-16 units, not model tokens. Impossible-budget refusals are control responses, not claimed budget-fitting memory payloads. Proposal 04's work bounds apply per finite phase, not as CPU-instruction metering.

Inputs follow the reviewed TypeScript shapes; these are not hardened arbitrary-JSON parsers. In 01, `unmetCount` is a subset of `omittedCount`; an open-disagreement marker does not promise that its target remains eligible for expansion. In 03, equations are checked only on query-matching reports. In 04, place order is part of a binding because it controls tie-breaking. In 06, `byteChange` reports text inequality independently of represented-field differences; free prose remains semantically unassessed.

The operation signatures are deliberately local. Production adapters, persistence/deletion integration, discovery, hooks and an extension configuration contract remain subsequent work. The [six refined designs](../refinements/README.md) and [source map](../refinements/SOURCE-MAP.md) identify their intended places in Circadian. Independent execution and disabled selection are demonstrated here; no production toggle or live interoperability guarantee is claimed.

This phase covers deterministic implementation and outside peer review. Any later no-Jev/Jev behavioral comparison uses the separately bounded [test protocol](../refinements/TEST-PROTOCOL.md), pinned models and preserved request/response artifacts. This runner itself makes no inference calls. The captured verification is Bun runtime testing; no separate static type-check result is claimed.
