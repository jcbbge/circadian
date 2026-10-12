# Shared conventions for six separate augmentation tests

**Status:** The six deterministic research prototypes are implemented and checked, with outside peer code review. Their [run instructions](../prototypes/README.md), [captured results](../prototypes/results.json) and per-proposal coverage maps record the implemented phase. All 93 specification IDs are mapped: 92 have deterministic contract/boundary checks and R14 remains deferred behavioral. No behavioral inference evaluation, production integration or selected extension architecture occurred. The model-run sections below remain the design for a later bounded phase.

## What a run would answer

Each refinement names one useful operation, its input and output, concrete fixtures and an expected result. Existing Circadian is the working comparison. The question is what the optional addition contributes, at what cost. A baseline defect is not a prerequisite.

Three comparisons keep different sources of benefit visible:

- **A — current behavior:** use the relevant actual Circadian operation and available source information. This measures the total proposed addition, including extra annotation.
- **B — same information, simpler operation:** provide the same annotations, sources and budget as C, using ordinary notes, joins, functions or validation as appropriate. This asks whether the proposed operation earns its place.
- **C — the proposed addition:** same evidence as B, with the specific operation enabled. A narrow ablation removes that operation while retaining the same fields when useful.

Not every arm is an LLM call. The implemented phase compares deterministic operations over reviewed fictional fixtures. Where B already implements the same mathematics with ordinary code, equivalence is an acceptable conclusion; do not manufacture a distinction by naming C differently. The prototypes do not constitute a completed behavioral A/B/C evaluation, and an implementation alias is not independent experimental evidence.

## Sources, unknowns and portability

Fixtures use explicit finite record populations and fictional IDs. These are supplied inputs, not a claim that production has an atomic whole-mind snapshot API. Source references in a future implementation use existing episode paths or atom IDs plus content revisions/digests where needed; an atom ID alone does not identify all current bytes or applicability.

New structured meaning is an annotation, not a field magically available in prose. First test reviewed annotations. Later, measure automatic extraction separately, retaining the source span and unknowns. Never count the same observation twice because two paths reference it.

Every operation states its source-eligibility inputs. A forgotten atom, removed source, unknown identity or stale annotation cannot be silently reintroduced by supplemental data. The current atom forget/erase commands do not automatically manage proposed supplemental objects. The implemented prototypes use fixtures and publish nothing; any live persistence requires an explicit deletion/eligibility integration before use.

All six consume supplied source references without depending on one another. Shared field names are conventions; a common ontology, person registry, generic rule engine or extension framework is not part of these implementations. The research runner demonstrates independent selection and empty-selection disablement. Production runtime enablement and persistent config keys remain future choices. The required production disabled behavior remains concrete: no supplemental selection, model call, mutation or change to ordinary output when an addition is off.

## Deterministic contract checks

Each refinement has at least eight named cases with expected outcomes. These cover useful behavior, incomplete evidence, a false-positive trap, changed/unavailable sources and bounded work. Expected sets, paths, statuses and preservation properties are specified independently of implementation syntax.

All declared structural invariants must hold for the fixtures. A checker passing its own invariants is evidence only of those properties; it does not validate semantic extraction or downstream prose. Adversarial cases deliberately include well-formed but semantically wrong annotations to expose that boundary. **Semantic and behavioral outcomes remain unmeasured across every proposal**, including case IDs with a deterministic boundary check; R14 is simply the one specification whose principal claim has no deterministic substitute.

Semantic tasks use free-form output or structured reports as appropriate. Questions are useful where the operation answers a question; wake is useful where the operation changes wake. Neither is the universal evaluation surface. Narrative fidelity, preserved uncertainty, attribution and meaningful rare memories receive their own review criteria.

## Dedicated model runs, if later authorized

The already-observed model identities available as **candidate selections**, not newly verified endpoint availability, are the local study model `mlx-community/Qwen3-30B-A3B-Instruct-2507-4bit`, the consultation model `claude-fable-5-1`, and selector `jev-1.13.0`. Provenance is in the earlier [real-session report](../lab/REAL-SESSION-RESULTS.md) and [consultation receipt](../peer-consultation/SESSION.json). Verify availability and actual returned IDs again before any future run.

A bounded first behavioral comparison for one proposal would use its two named positive and two named challenge cases, A/B/C, and two repetitions: **24 initial reader calls with one explicitly selected model**, each allowing at most one follow-up model invocation: **48 reader calls maximum**. A follow-up may consume a requested source/tool result; multiple deterministic source reads can be bundled within that one continuation. Trials needing more are recorded incomplete, not extended. This is a proposed budget, not a reliable-population estimate. A second model is a separate 24-trial, at-most-48-call confirmation choice; it is not automatic, and the local model is not an architectural gate. Freeze the exact provider/harness/model, rendered prompts, supported decoding settings, tool permissions, context limits, source ordering and fixture revision in the run manifest. Record unavailable settings honestly rather than pretending harnesses expose identical controls.

Randomize paired arm order; keep retrieval permission and maximum follow-up count identical (one per trial for this first protocol). Preserve every response, including failures and abstentions. Count initial and follow-up context, selector inputs, cache use, total calls, elapsed time and annotation effort separately. Any later selector/extraction comparison has its own declared finite call ceiling; its calls are additional and never hidden inside the reader budget. Report model-specific results rather than pooling them into a single success rate.

Run **without Jev first**. A separately authorized Jev comparison uses the proposal's specified classification job, when one exists. Use the same downstream model, evidence access and fallback permissions with/without the selector. Giving Jev the full source is permitted but charged to its cost. Jev may propose labels or annotations; it neither proves semantics nor replaces deterministic checks. Proposals 03, 04 and 06 have no necessary classifier in their core operation.

## What would count as progress

For each proposal, predeclare its primary benefit, its unacceptable errors, and an overhead ceiling appropriate to the intended use before a behavioral run. The per-proposal documents supply the concrete benefit measures and the prototypes now supply executable operations; performance thresholds still require an intended-use budget and are not invented here as product requirements.

A fixture pass establishes the specified operation. A behavioral comparison can show a benefit or cost on its named cases. Neither establishes universal memory reliability. If C adds no value over B, keep the simpler implementation or the agent practice; this does not discard the other five proposals. Do not expand the study to explain every model failure. Record unresolved evidence and stop at the frozen call budget.
