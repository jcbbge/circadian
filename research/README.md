# Circadian pre-plan research dossiers

**Current state and next work:** [definitive session handoff](../docs/SESSION-HANDOFF.md). The only shipped production addition from this research is the bounded optional reader described in [Coordinated memory views](../docs/COORDINATED-VIEWS.md); the remaining five proposals are preserved as research prototypes and evidence.

For a first-principles explanation of all six additions, open the [interactive Anatomy explainer](explainer/index.html) or its [written companion](explainer/EXPLAINER.md). Each example separates the demonstrated mechanism from the benefit still to be measured.

**Latest completed research: [local full-model extraction repair](lab/extractor-009/RESULTS.md).** The execution contract is now explicit and enforced, with 108 completed local requests, independent source-grounded reviews and preserved failures. All six additions remain in scope. The final serving comparison consumed 15/18 records and answered 12/18 questions correctly; remaining attribution, participation and exact-span failures prevent blanket readiness claims. [Operating instructions](lab/extractor-008/OPERATIONS.md) and [raw evidence](lab/extractor-009/README.md) make the work inspectable.

**All six augmentation proposals have isolated executable prototypes, dedicated tests and recorded outputs.** Start at the [prototype index](prototypes/README.md). The combined run passes 120 tests with 492 assertions; all 93 specification IDs are mapped, with 92 deterministic checks and R14's behavioral comparison explicitly deferred. Circadian is the working baseline; these are optional supplements.

**The subsequent [Behavioral 005 assessment](lab/behavioral-005/ASSESSMENT.md) now covers all six with 24 frozen scenarios and 72 reader trials, first without Jev and then with it.** Strict passes were 5/24 baseline, 6/24 augmented and 8/24 assisted. Output failures and stricter-than-minimal rubric details limit interpretation; this is not evidence to change Circadian's default. See the [results](lab/behavioral-005/RESULTS.md), [blinded review](lab/behavioral-005/SEMANTIC-REVIEW.md) and [optional integration boundaries](lab/behavioral-005/INTEGRATION-BOUNDARIES.md).

The [six-proposal refinement index](refinements/README.md) preserves the implementation, usage and test specifications. The outside [code review](prototypes/PEER-REVIEW.md), [correction record](prototypes/REVIEW-RESOLUTION.md) and [focused closure](prototypes/PEER-CLOSURE.md) document the implementation review. That implementation phase executed deterministic prototypes; it made no production changes or new no-Jev/Jev benchmark runs. Earlier laboratory and two-example narrowing remain historical; the current scope is all six original proposals.

These documents preserve a collaborative brainstorm begun from questions about mathematical memory structures, context management, temporary mnemonics, and one continuous intelligence across machines and harnesses. Recorded 2026-10-10.

**The conceptual dossiers remain provisional.** Their selected deterministic mechanisms now have research implementations; broader semantic claims, production designs and empirical improvements remain hypotheses. A later idea may supersede any part of them. Their ordering is conversational, not a delivery roadmap.

| Dossier | Question |
|---|---|
| [01 — Coordinated memory views](01-coordinated-memory-views.md) | What must a compact view preserve? |
| [02 — Contextual compatibility](02-contextual-compatibility.md) | When can contextual accounts coexist or combine? |
| [03 — Typed relations and composition](03-typed-relations-and-composition.md) | Which relationship paths support which conclusions? |
| [04 — Operations with multiple inputs](04-multi-input-operations.md) | How can a useful combination of evidence be reused? |
| [05 — Higher-order relations](05-higher-order-relations.md) | How can joint experiences and relations among accounts retain their meaning? |
| [06 — Checked memory transformations](06-checked-memory-transformations.md) | What can be checked when a memory representation changes? |

## General-purpose scope

Circadian is a general-purpose memory system. Its subject matter includes everyday experiences, relationships, preferences, plans, learning, creative work, stories, observations, and interpretations, as well as technical work. Software examples are illustrations, not a required ontology. The operator made this scope explicit during the analysis of the final proposals.

A memory may be valuable for continuity, meaning, or faithful recollection even when it rarely helps complete a task. These proposals must allow subjective accounts, ambiguity, and changing interpretations without forcing every record into a fact, rule, or executable procedure. Generality is an evaluation requirement: include multiple nontechnical domains and report their results separately before claiming broad benefit.

## Shared constraints from the operator

- Circadian is the flagship and is general-purpose. Additions must fit its purpose, source of truth, and lifecycle; a coding ontology must not become a prerequisite.
- The existing default remains the baseline: useful wake, grazing, sleep, and REM behavior without requiring these proposals.
- Future additions should be optional, independently removable, and able to coexist. No extension architecture has been selected.
- Prefer the smallest useful mechanism: no forced third-party packages, extra databases, always-on services, or provider-specific infrastructure.
- Count cognitive and operational costs as well as code: selection, retrieval, validation, context, inference, latency, maintenance, and subsequent tool calls.
- Preserve one continuous identity. Provenance and applicability provide context; they do not require separate agent identities.
- Search beyond conventional approaches, but retain only mechanisms with a precise claim, limitations, and a way to falsify them. Ordinary engineering is a valid outcome.
- A local classifier or remote inference endpoint may be used in a later experiment if justified. Neither is mandatory.

## Evidence discipline

Each dossier separates established mathematics, inspected repository behavior, original design hypotheses, and unknowns. A mathematical structure does not by itself establish empirical truth, suitable context, or improved model behavior.

Code observations are snapshots, not assertions about all future versions or deployed machines. The initial inspected commit is `dd31739cf8cf5f5c7e137d8a8f2b4ebaac3bb3a7`; follow source links and recheck the relevant behavior before implementation. No private memory content is reproduced here.

The conceptual experiments described in the original dossiers are proposals; executed deterministic cases and their limits are recorded in [prototype results](prototypes/results.json). The prototype implementation phase reported no behavioral model runs or production changes; Behavioral 005 is the separately frozen subsequent experiment. Before any new behavioral experiment, specify fixtures, baselines, model/provider/version, settings, prompts, repetitions, scoring, artifacts, and retirement criteria. Measure semantic interpretation separately from deterministic validation.

## How to build on a dossier

Keep a worked example, a mundane baseline, the exact missing information, and a failure case visible. Record which hypothesis new evidence supports or rejects. Promote a bounded subset into a plan only when its purpose, cost, and acceptance criteria are concrete; the whole dossier need not become a feature.

The [confidence assessment and experimental agenda](confidence-and-experiment-agenda.md) compares the six proposals, identifies their weakest assumptions, and recommends a small staged laboratory. It is a provisional portfolio assessment, not a seventh proposal or a report of completed experiments.

The [memory-view laboratory](lab/README.md) contains the dedicated no-Jev/Jev pilot protocol, fictional fixtures, runner, and per-run artifacts. Experimental results belong there; they do not retroactively turn a dossier's hypothesis into an established finding.

Completed laboratory reports: [Pilot 001](lab/RESULTS.md), followed by [Diagnostic 002](lab/DIAGNOSTIC-RESULTS.md), which separates compact-memory capability from retrieval behavior and compares whole policies. These are small exploratory studies, not validation of the six proposed mathematical extensions.

[Real-session pilot 003](lab/REAL-SESSION-RESULTS.md) adds three historical conversation inputs and question-blind generated memories. It exposes compression, attribution and scoring failures that multiple-choice accuracy alone misses. Its bounded source coverage and unresolved interpretation limits are explicit; the findings do not establish a complete long-history solution.

[Calibration 004](lab/CALIBRATION-RESULTS.md) completes fourteen local calls with free-form questions, evidence-removal and attribution controls, and a historical-wording writer pair. It separates event substitution, citation support, response format and current-instruction contamination. The instrument is ready for a separately frozen writing comparison; no mathematical extension or production change is validated by this result.
