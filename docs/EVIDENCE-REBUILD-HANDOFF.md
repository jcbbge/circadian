# Evidence-bound memory — implementation handoff

Status: discovery complete; implementation not started by this handoff.
Report back to the operator, per unit and at each activation gate.

## Purpose and diagnosis

Circadian captures conversations, consolidates memories, and renders/injects a worldview. That worldview must be a product of evidence, never evidence for its own reproduction.

Investigation against program commit `0ed0d707a35a1d210a770b621f6c06b846d4bb64` established:

- SLEEP supplies SELF, NOW and generated meal notes alongside the transcript, then requires personality observations and worldview-change conclusions.
- Three inspected worker transcripts and their reconstructed retained inputs lack claims that appear in their resulting episodes. Publication-parent SELF contains those claims. Reconstructed input lengths match capture logs.
- Structured worker packets pass the prose-opening provenance guard. Worker instructions are then attributed to the operator.
- Episode parsing checks format, not evidential support. Downstream quotation checks use generated episodes rather than original conversations.
- Of 68 examined Mac harvest outputs, 44 contain at least one checked phrase absent from their entire native source. All six examined VPS nightly outputs do too. These are conservative phrase diagnostics, not a complete semantic census or permission to delete matching records.
- The six VPS episodes were absorbed; an inspected resulting belief turned a missing obsolete configuration file into a claim about the operator's preferences.

This is a circular evidence and attribution defect. A better prompt alone is not the fix. The full historical contamination boundary is unknown.

The private audit, transcripts, source identifiers and private memories are intentionally absent from this repository. Obtain access from the operator when executing private recovery. Do not fabricate missing evidence or copy it into public fixtures.

## Governing solution

1. Capture from original, attributed session evidence only. No SELF, NOW, old beliefs, generated episodes or meal notes as evidence.
2. Validate source identity, spans, speaker, coverage and claim type in code. Separately adjudicate whether original context supports the claim. Literal matching is not entailment.
3. Fail closed on unknown attribution, missing context, contradiction, verifier outage or malformed results. Preserve sources and explain the disposition.
4. Separate retrieval activation from independent evidential support. Repetition, injection and common-ancestor summaries cannot corroborate themselves.
5. SELF is a deterministic read view of eligible records. Every other memory consumer honors eligibility too.
6. Rebuild a separate private store from original sources. Preserve legacy history and explicit operator-authored records. Verify independently before transactional per-machine cutover.

## Infrastructure, authority and safety

- Read `README.md`, `templates/MIND-SPEC.md` and relevant contracts before implementation. The present spec's recurrence/propagation weight rules require an explicit amendment; do not change them silently.
- Use Made Well for delivery, durable questions and independent checks. This document is the portable source of truth for the proposed units; Made Well holds execution state and evidence.
- On the originating machine, discovery **#52** produced candidates **#53–91**. E01 maps to #53, E39 to #91. IDs are local to that Made Well store. Do not reuse these numbers on another store without checking identity. Earlier discovery #33 was dropped after review; #32 remains blocked on unsafe live-checkout leftovers.
- Do not run discovery or tests inside a live memory-bearing checkout. Use an isolated code checkout and a sandbox memory home. Ensure test/discovery sessions cannot be harvested as lived evidence. A code-only checkout does not itself disable global harness hooks.
- Never follow a cleanup suggestion that includes private `mind/`. No `git clean -fdx` over a live installation. No history rewrite, mass deletion or phrase-based purge.
- Private minds have no remote. Do not stage private reports, memories, transcripts, receipts, source identifiers, credentials or copied private fixtures. Third-party review does not authorize exporting private data.
- Source models and summarizer/verifier models are different provenance fields. Do not infer summarizer identity from episode frontmatter.
- Preserve file-only/offline wake, immutable evidence/history, explicit operator corrections and constitutions. Do not blindly treat generated USER.md as operator-authored.
- No automatic schedule/service installation or activation without explicit operator authorization. Per-machine data operations and cutover retain their authorization gates.
- Do not claim complete delivery until real live and full-scheduled-cycle checks pass on both machines. A successful commit, deployment or test suite is not that proof.

## Execution protocol

For each unit:

1. Read its predecessors' accepted artifacts and the named code boundary. Paths below are grounding leads at the audited revision, not permission to assume current implementations.
2. Confirm the unit's contract and scope in Made Well. Resolve lookup questions from code; raise only actual decisions or missing access.
3. Implement in its own worktree. Have another author define/check acceptance. Use synthetic fixtures in a sandbox; never call live capture as a test.
4. Run targeted behavior checks and required project gates. Record exact commands, results, unexecuted checks and changed paths.
5. Land only this unit's changes under the project's delivery policy. Do not activate dependent runtime behavior prematurely.

All units exclude unrelated refactors, private-data deletion and undocumented changes to the evidence contract. Code units deliver reviewed commits, not live activation. Operational units deliver independently reviewable evidence, not placeholder code commits. A rollback must preserve newly acquired original evidence and state its trust status honestly.

## Dependency graph and work units

`After` means accepted prerequisites, not merely started work. Logical readiness permits parallel development; shared-file changes still require coordinated landing. E-labels are stable across machines.

### Contract and independent acceptance

### E01 — Evidence/admission contract

**After:** none. **Type:** specification. **Made Well:** #53.

**Purpose/current defect:** admission, speaker origin, completeness and independent support are not defined strongly enough to prevent circular evidence.

**Deliver:** `docs/EVIDENCE-ADMISSION.md` and an explicit amendment to `templates/MIND-SPEC.md`. Define append-aware source identity, spans, role versus origin, claim types, qualified inference, accepted/unverified/rejected/legacy-untrusted/operator-authored states, receipts, lineage, verifier context, activation boundaries and protected records. Keep the contract small and reuse existing mechanisms.

**Done:** an independent reviewer maps every requirement here to a contract clause and downstream unit. **Out of scope:** runtime changes. **Failure:** unresolved semantics block dependent work; do not guess.

### E02 — Independent acceptance criteria

**After:** none. **Type:** specification. **Made Well:** #54.

**Purpose:** define success independently of implementation.

**Deliver:** `docs/EVIDENCE-ACCEPTANCE.md`, authored separately from implementation. Cover fabricated SELF claims, unseen paraphrases, forged attribution, quoted packets, injected context, worker traits, plans versus outcomes, unrelated conclusions attached to real quotes, omitted contradictions, independent versus common-ancestor support, replay, live append, crash boundaries, verifier outage, reader eligibility, useful learning and private recovery. Assign each to unit, integration, live or scheduled-cycle verification.

**Done:** every case has a measurable expected outcome and gate; held-out cases remain unseen until independent evaluation. **Out of scope:** private examples and implementation. **Failure:** incomplete criteria block evaluation.

### Original evidence and provenance

### E03 — Append-aware source envelope

**After:** E01. **Type:** code. **Made Well:** #55.

**Purpose:** full-file hashes and flattened excerpts cannot identify stable evidence in a growing transcript.

**Deliver:** a harness-neutral source/segment/coverage interface. Distinguish unchanged, appended, rewritten and missing sources; track original byte ranges and partial trailing records. Reuse `src/stack-source-lines.ts` where suitable without confusing normalized text offsets with raw bytes.

**Done:** old spans resolve identically after append; prefix edits/truncation are detected; incomplete ranges are explicit; non-ASCII offsets round-trip. **Out of scope:** harness parsing. **Rollback:** inert interface until wired.

### E04 — Claude source adapter

**After:** E03. **Type:** code. **Made Well:** #56.

**Purpose:** a harness `user` role alone does not prove operator authorship.

**Deliver:** Claude JSONL adapter distinguishing operator text, hook/system injection, tool results, quoted packets and worker/sidechain material. Unknown remains unknown. Wire later through E14.

**Done:** synthetic fixtures prove roles, coverage, byte spans and append behavior; quoting a packet does not erase a legitimate human turn. **Out of scope:** changing the other adapters. **Rollback:** inert until wired.

### E05 — Pi source adapter

**After:** E03. **Type:** code. **Made Well:** #57.

**Purpose:** injected wake/custom messages and tool output must not become operator speech.

**Deliver:** Pi native-session adapter using the session/message contracts; inspect `src/circadian-mind.ts` for existing integration knowledge.

**Done:** synthetic native sessions round-trip roles and offsets, including injected context and append behavior. **Out of scope:** extension redesign. **Rollback:** inert until wired.

### E06 — Codex source adapter

**After:** E03. **Type:** code. **Made Well:** #58.

**Purpose:** normalization must not lose origin or turn hook context into human evidence.

**Deliver:** Codex rollout adapter grounded in `src/circadian-codex.ts` and native event shapes, retaining original identity and mapping normalized spans back to original bytes.

**Done:** fixtures distinguish completed messages, tool/injected context and operator text; offsets and appends remain valid. **Out of scope:** unrelated Codex configuration. **Rollback:** inert until wired.

### E07 — Slate source adapter

**After:** E03. **Type:** code. **Made Well:** #59.

**Purpose:** generated trace summaries cannot stand in for missing operator speech.

**Deliver:** Slate trace adapter that marks summaries/tool events as non-operator and admits operator attribution only from positive native evidence.

**Done:** summary-only traces yield no operator spans; unknown/missing text is visible, with exact coverage. **Out of scope:** reconstructing absent chat by inference. **Rollback:** inert until wired.

### E08 — Capture-time session origin

**After:** E01. **Type:** code. **Made Well:** #60.

**Purpose:** sweeps cannot recover an expired process's environment by examining their own environment.

**Deliver:** durable origin records keyed by harness/session, carried through capture, queues and sweeps. Ground worker/synthetic/interactive signals in `src/provenance.ts`, hook entrypoints, harvest and backfill. A path, regex or interactive terminal alone is not sufficient proof of human authorship.

**Done:** structured worker packets are non-operator; synthetic/discovery sessions cannot enter lived memory; human discussion of packets remains legitimate; missing/conflicting origin fails closed. Record-write failure cannot silently admit evidence. **Out of scope:** historical guesses. **Rollback:** preserve origin receipts.

### E09 — Historical origin classification

**After:** E03, E08. **Type:** code. **Made Well:** #61.

**Purpose:** old sessions lack capture-time origin records.

**Deliver:** read-only classification from independent available signals, recording which signals were used and conflicts. Investigate invocation/launch records and full packet structure; never infer authorship solely from a path or opening regex.

**Done:** fixture cases distinguish positively identified workers/operators from unknowns. **Out of scope:** automatic acceptance of ambiguous history. **Failure:** unknown remains unverified; optional operator confirmation is explicit and recorded.

### E10 — Independent executable acceptance suite

**After:** E01, E02, E03. **Type:** tests. **Made Well:** #62.

**Purpose:** test the contract rather than the implementer's assumptions.

**Deliver:** synthetic harness fixtures and executable unit/integration cases for E02, authored independently. Record current-code failures and isolate fixture memory from the real store. Integrate the suite into the project's gates by E31; do not silently skip failing acceptance checks.

**Done:** every unit/integration criterion has a runnable check and no private data. **Out of scope:** implementing the behavior being scored. **Rollback:** tests only; preserve baseline results.

### Admission and memory-blind capture

### E11 — Admission-status fold

**After:** E01. **Type:** code. **Made Well:** #63.

**Purpose:** readers need a shared eligibility rule; pinning a generated record does not make it operator-authored.

**Deliver:** status folding in the existing atom/ledger model, with unreceipted legacy records explicitly untrusted. Define the receipt interface before concurrent consumers implement it.

**Done:** mixed-status fixtures fold correctly without silently changing legacy arithmetic; operator actions and operator-authored evidence stay distinct. **Out of scope:** changing support weights. **Rollback:** additive format retained.

### E12 — Deterministic evidence validation

**After:** E03. **Type:** code. **Made Well:** #64.

**Purpose:** reject false spans, roles and claim types before semantic adjudication.

**Deliver:** candidate/envelope validation reusing exact-span machinery from `src/memory-check.ts` and `src/stack-source-lines.ts`. Validate against originals, not generated episodes. Coverage gaps limit admissibility; a matching quote still has semantic status unknown.

**Done:** forged offsets/attribution, injected operator claims, plan-as-achievement and stale revisions fail; valid bytes alone never imply truth. **Out of scope:** claiming semantic support from string matching. **Rollback:** pure validator until E17.

### E13 — Independent support adjudication

**After:** E03. **Type:** code. **Made Well:** #65.

**Purpose:** real quotations can support unrelated or contradicted conclusions.

**Deliver:** isolated adjudication receiving the claim, original context and coverage—not SELF, prior beliefs or drafter rationale. Check contrary context, not only selected supportive snippets. Record supported/unsupported/contradicted/incomplete/unavailable/malformed outcomes and model/config identity.

**Done:** independent adversarial cases reject unsupported conclusions; outage and insufficient context never admit claims. **Out of scope:** unapproved external processing of private data. **Failure:** retain unverified candidates for inspection/retry. Model independence must be explicit; a second call alone is not proof of independent judgment.

### E14 — Memory-blind capture

**After:** E04, E08. **Type:** code. **Made Well:** #66.

**Purpose:** sever the demonstrated SELF-to-new-evidence path.

**Deliver:** rework `src/sleep.ts` drafting to consume original adapter segments only, emit source-bound candidates and report processed/omitted coverage. Remove SELF, NOW and meal evidence inputs and forced personality/worldview conclusions. Unsupported harnesses fail closed until their adapters land.

**Done:** canaries placed in SELF/NOW/meals never enter evidence prompts; unrelated sessions produce no fabricated claim; gaps are explicit. **Out of scope:** regenerated personality narratives. **Failure:** preserve source handles and reasons, no partial admission.

### E15 — Operator NOW protection

**After:** E08, E14. **Type:** code. **Made Well:** #67.

**Purpose:** batch capture and worker work must not overwrite the operator's handoff or feed it back as evidence.

**Deliver:** separate NOW generation from evidence capture; only eligible live operator sessions update the appropriate scoped NOW. Harvest/backfill/worker/synthetic/unknown sessions do not.

**Done:** fixtures prove unchanged NOW for excluded origins and no NOW content in evidence/verifier prompts. **Out of scope:** claiming NOW is authoritative evidence. **Failure:** keep the prior handoff rather than write an unsupported one.

### E16 — Worker artifacts, not operator traits

**After:** E08, E14. **Type:** code. **Made Well:** #68.

**Purpose:** preserve useful project work without turning worker instructions into a personality model.

**Deliver:** explicitly non-operator artifact records for genuine worker sessions; synthetic/test/discovery sessions write no lived evidence. Enforce allowed destinations and claim kinds structurally in capture/admission.

**Done:** worker files/commands/outcomes remain inspectable; worker-derived operator traits, USER/NOW changes and false corroboration are rejected. **Out of scope:** discarding legitimate project artifacts indiscriminately. **Failure:** ambiguous origin remains unverified.

### E17 — Atomic admission and receipt

**After:** E11, E12, E13, E14. **Type:** code. **Made Well:** #69.

**Purpose:** no accepted-but-unreceipted state.

**Deliver:** validation and adjudication feed one publication containing accepted record, receipt and ledger reference. Rejected/unverified candidates retain their dispositions without accepted atoms. Ground names against `src/publish.ts`'s existing intent/receipt reservations. Do not use an existing generated episode as evidence.

**Done:** crash/retry tests show atomicity; direct unreceipted acceptance is refused; unavailable verification leaves a recoverable unverified result. **Out of scope:** bypassing the original-source check. **Rollback:** preserve receipts and original sources.

### E18 — Close every alternate writer

**After:** E17. **Type:** code. **Made Well:** #70.

**Purpose:** one bypass can defeat the entire admission boundary.

**Deliver:** route or refuse every alternate writer: lanes, REM, migration/import, backfill, manual admit, direct stack, graze-derived content and replay. Add an invariant scan to health checks. Ground the actual write graph rather than assuming this list is exhaustive.

**Done:** each writer exercised in a sandbox either produces valid receipts or refuses; no unreceipted accepted state survives. **Out of scope:** changing unrelated writer behavior. **Failure:** refuse publication with a source-preserving diagnostic.

### E19 — USER.md evidence boundary

**After:** E08, E17. **Type:** code. **Made Well:** #71.

**Purpose:** generated observations must not become unqualified operator traits.

**Deliver:** restrict USER mutations and their REM caller to accepted operator evidence with receipt references. Do not upgrade a qualified inference to a fact. Define explicit treatment of historical USER content; git author identity alone is insufficient.

**Done:** worker/injected observations cannot mutate USER; supported operator observations remain inspectable. **Out of scope:** silently copying or deleting historical USER. **Failure:** uncertain authorship remains unverified or awaits explicit operator designation.

### E20 — Lineage and independent support

**After:** E17. **Type:** code. **Made Well:** #72.

**Purpose:** repetition and self-propagation are not corroboration.

**Deliver:** separate activation from support in atom/ledger folds, stacking and potentiation. Trace common ancestors and derived echoes. Define valid independent evidence by claim type: non-personal project facts may use attributable tool/worker evidence; operator traits require operator evidence.

**Done:** repeated same-origin evidence adds no support; injected echoes add none; genuinely independent admissible evidence can add support; activation remains a separate quantity. **Out of scope:** counting all distinct session IDs as independent sources. **Rollback:** preserve lineage/history and make compatibility explicit.

### E21 — Idempotent replay and resume

**After:** E17. **Type:** code. **Made Well:** #73.

**Purpose:** retries and normalization must not manufacture events or confidence.

**Deliver:** stable admission keys, checkpoints, pipeline/model version records and explicit handling of fresh-generation differences. Preserve deterministic projection from the same accepted records; do not promise deterministic fresh LLM generations.

**Done:** crash/resume and replay produce no duplicate receipts/admissions/support; deterministic views reproduce byte-identically. **Out of scope:** silently replacing prior accepted output. **Failure:** expose incompatible versions or divergent fresh generations.

### Eligible reads and inspection

### E22 — SELF and wake eligibility

**After:** E11. **Type:** code. **Made Well:** #74.

**Purpose:** untrusted records must not reappear as authoritative identity.

**Deliver:** eligibility in render, wake payload/parts and checkout/restore paths. Keep SELF read-only with respect to capture and keep wake file-only.

**Done:** mixed-status fixtures expose only eligible evidence as authoritative; manifests retain status; no evidence prompt consumes SELF. **Out of scope:** silently changing the live legacy store before cutover. **Failure:** unknown status is unverified.

### E23 — Recall/MCP/views eligibility

**After:** E11. **Type:** code. **Made Well:** #75.

**Purpose:** an alternate retrieval API must not bypass admission.

**Deliver:** shared eligibility in views/expand/check, search/read/recall/history, scoped recall and indexing. Diagnostic access to untrusted records must label them, not return them as eligible evidence. Include omission counts.

**Done:** every endpoint tested with mixed statuses; stale refs cannot upgrade eligibility. **Out of scope:** hiding coverage gaps. **Failure:** changed/unavailable evidence is explicit.

### E24 — REM consumer eligibility

**After:** E11. **Type:** code. **Made Well:** #76.

**Purpose:** greeting, propagation and distillation must not recycle unaccepted material.

**Deliver:** eligibility filters on REM consumers; generated greetings remain non-evidence. Coordinate shared `src/rem-popmem.ts` changes with E19/E20.

**Done:** unverified atoms are absent from eligible prompts/clusters and cannot gain activation through those paths. **Out of scope:** evidence laundering through distillation. **Failure:** incomplete eligibility prevents the affected operation.

### E25 — Honest diagnostics

**After:** E11. **Type:** code. **Made Well:** #77.

**Purpose:** the operator must distinguish available memory from verified memory.

**Deliver:** admission status and split counts in diagnostics, health/history/zoom/dig/status and related presentation paths, grounded against current entrypoints.

**Done:** mixed-status snapshots show trust states and unresolved gaps without a false green. **Out of scope:** changing admission. **Rollback:** display-only.

### E26 — Inspect actual contents and reasons

**After:** E01, E03. **Type:** code. **Made Well:** #78.

**Purpose:** answer what was processed and why, not merely how many records were produced.

**Deliver:** a read-only inspector for session/claim/receipt showing bounded original contents, covered/omitted ranges, source revisions, validation and adjudication outcomes, and model/config provenance. Ground CLI wiring: `bin/circadian` is a pull-door script; `src/circadian-mind.ts` is a Pi extension; package bin routing must also be checked.

**Done:** fixture receipts render contents and reasons, including appended/changed/missing sources. Private text is not echoed into unrelated telemetry. **Out of scope:** model calls or mutations from inspection. **Rollback:** read-only command.

### Private recovery and rollout

### E27 — Mac inventory

**After:** E03. **Type:** private read-only operation. **Made Well:** #79.

**Purpose:** establish the complete recoverable source population and its gaps.

**Deliver:** private manifest of derived records, originals, revisions, origin signals, protected authorship and high-water marks. Include unsupported formats and unreadable records rather than omitting them. Run without capture hooks; record current update/deployment wiring.

**Done:** counts reconcile; every record has a source disposition; independent spot checks match disk. **Out of scope:** mind writes or public evidence export. **Failure:** mark incomplete inventory; preserve originals.

### E28 — VPS inventory

**After:** E03. **Type:** private read-only operation. **Made Well:** #80.

**Purpose/deliverable:** E27's inventory on the VPS, retaining private contents there and transferring only approved aggregate results.

**Done:** complete reconciled manifest including downstream absorbed records and unsupported sources. **Out of scope:** schedule changes, deletion and private cross-machine copying. **Failure:** explicit incomplete manifest.

### E29 — Transactional switch and rollback

**After:** E01. **Type:** code. **Made Well:** #81.

**Purpose:** prevent mixed-store reads, late writes and lost original sessions during replacement.

**Deliver:** one store-generation resolution boundary across hooks, long-lived MCP, queues, workers and CLI; fenced publication; delta reconciliation from original sessions; honest rollback retaining new evidence. Ground pointer/generation design before implementation. A reader must use a coherent snapshot, not separately resolve individual files.

**Done:** concurrent/crash tests refuse stale writes, reconcile appended/new sessions without duplication, avoid mixed reads and reject stores with remotes. **Out of scope:** actual activation. **Rollback:** legacy may be restored only with its untrusted status explicit.

### E30 — Clean-store rebuild runner

**After:** E05–E07, E09, E15–E16, E18–E21. **Type:** code. **Made Well:** #82.

**Purpose:** recover trustworthy memory without feeding contaminated derived records back into generation.

**Deliver:** resumable runner taking a private inventory and original sources into a separate private store. Reuse sandbox safeguards; refuse the live store. Preserve designated operator-authored records byte-for-byte with provenance. Missing/rewritten/unsupported sources remain visible gaps. Legacy comparison is reporting only, never an evidentiary input.

**Done:** synthetic rebuild survives crash/resume; cannot write the live store; preserves protected hashes; no remote; legacy canaries never enter generation. **Out of scope:** destructive cleanup or blind USER copy. **Failure:** preserve partial store and explicit unresolved inputs.

### E31 — Independent integrated adversarial evaluation

**After:** E10, E22–E26, E29–E30. **Type:** independent audit. **Made Well:** #83.

**Purpose:** establish readiness before processing private history or activating the redesign.

**Deliver:** independent execution of E02/E10 plus unseen cases authored at evaluation time. The reviewer did not implement the pipeline and uses neither legacy nor rebuilt memory as authority.

**Done:** every unit/integration criterion has measured results; failures return to owning units. **Out of scope:** calling sandbox success a live deployment. **Failure:** blocks rebuild execution until resolved.

### E32 — Execute Mac rebuild

**After:** E27, E30–E31. **Type:** private recovery. **Made Well:** #84.

**Purpose:** create a candidate clean store without disturbing live history.

**Deliver:** authorized rebuild into a separate Mac store with receipts, gaps and checkpoints. Live originals arriving after inventory remain subject to delta reconciliation.

**Done:** input/output counts reconcile; every source has a disposition; live mind was not written; no remote. **Out of scope:** cutover/deletion. **Failure:** retain partial results for resumable investigation.

### E33 — Execute VPS rebuild

**After:** E28, E30–E31. **Type:** private recovery. **Made Well:** #85.

**Purpose/deliverable:** E32's recovery on the VPS using its inventory; private source content stays there.

**Done:** complete or explicitly incomplete receipt coverage, unchanged legacy store, no remote. **Out of scope:** activation/deletion. **Failure:** preserve checkpoint and gaps.

### E34 — Independent Mac store audit

**After:** E32. **Type:** independent audit. **Made Well:** #86.

**Purpose:** verify rebuilt contents, not just a successful runner exit.

**Deliver:** 100% deterministic receipt/source binding verification, independently selected semantic review, legacy-to-clean comparison with reasons and explicit gaps. Phrase disappearance alone is not success. Report semantic sampling coverage rather than claiming every claim was semantically audited.

**Done:** protected records checked, every accepted record structurally verified, semantic findings resolved or blocking. **Out of scope:** deleting records to make counts pass. **Failure:** repair/rebuild before activation.

### E35 — Independent VPS store audit

**After:** E33. **Type:** independent audit. **Made Well:** #87.

**Purpose/deliverable:** E34's verification on the VPS, including the diagnosed class of unrelated configuration observations becoming operator preferences.

**Done:** structural coverage, semantic-review scope, gaps and findings recorded. **Out of scope:** treating generated citations as originals. **Failure:** blocks VPS activation.

### E36 — Mac activation and live checks

**After:** E29, E34. **Type:** activation. **Made Well:** #88.

**Purpose:** make the verified pipeline actually serve the Mac.

**Deliver:** explicitly authorized switch with original-source catch-up, writer fence and independently observed wake/capture/MCP/publication checks. Keep legacy history intact.

**Done:** real session uses the new store, creates inspectable source-backed records, and stale-generation writes are refused. **Out of scope:** claiming scheduled-cycle proof yet. **Failure:** transactional rollback with legacy trust limitation disclosed.

### E37 — VPS activation and live checks

**After:** E29, E35. **Type:** activation. **Made Well:** #89.

**Purpose/deliverable:** E36's authorized activation on the VPS with its actual runtime wiring.

**Done:** independent live checks pass there, not inferred from the Mac. **Out of scope:** altering unrelated schedules/tunnels. **Failure:** preserve new evidence and roll back honestly.

**Recommended extra rollout gate:** E38 before E37 (Mac canary first). This is a proposed operator choice, not an edge already saved in discovery #52.

### E38 — Mac full scheduled-cycle proof

**After:** E36. **Type:** independent audit. **Made Well:** #90.

**Purpose:** show that normal recurring operation neither reinfects memory nor prevents useful learning.

**Deliver:** independently observe a complete scheduled capture/harvest/REM cycle. Verify actual store access with sufficient instrumentation; an invocation record alone is not proof of every file read. Check receipt invariant, lineage, eligibility and genuine new learning.

**Done:** no legacy-derived evidence re-enters, no unreceipted acceptance, and a real new admissible statement is inspectable. **Out of scope:** substituting unit tests for a cycle. **Failure:** block rollout expansion and apply the reviewed recovery procedure.

### E39 — VPS full scheduled-cycle proof

**After:** E37. **Type:** independent audit. **Made Well:** #91.

**Purpose/deliverable:** E38's independent proof on the VPS's real scheduled cycle.

**Done:** the same observed guarantees hold independently on that machine. **Out of scope:** deleting preserved legacy history after success. **Failure:** report the failed guarantee and recover transactionally.

## Parallel lanes and integration order

- Start E01 and E02 independently.
- After E01, source envelope, origin recording, status fold and switch design can proceed separately.
- After E03, the four harness adapters, validators/adjudicator, independent tests, inspector and two machine inventories have independent work available.
- Reader groups develop against E11 in parallel; integrate against actual receipt publication before acceptance.
- After E17, writer-boundary protection, USER protection, lineage and replay can proceed in separate worktrees. Coordinate edits to stack, publication, atoms and REM.
- E14–E16 all touch capture; E19/E20/E24 touch REM. Parallel development does not authorize concurrent uncoordinated edits in one checkout.
- E31 is an integrated gate, not a competing implementer.
- Mac/VPS rebuilds and store audits can run independently after their gates. Prefer Mac as the activation canary; preserve a separate VPS live verdict.

A candidate dependency indicates deliverable readiness. Planning must establish interfaces and shared-file landing order without deleting independent verification or silently broadening scope.

## Decisions and stopping rules

The operator has accepted the direction: sever derived memory from capture and separate support from repetition. Do not reopen that principle as an optional preference. E01 makes its precise contract explicit.

Real decisions remaining:
- Verifier independence and available local model resources. Prefer a distinct local model family where feasible; report correlated-error limitations otherwise. No external private-data processing without authorization.
- Historical ambiguous authorship. Default to unverified; explicit operator confirmation may recover selected records. Do not require the operator to classify the entire corpus manually.
- Designating truly operator-authored historical USER/correction material. Preserve uncertain originals without treating them as verified.
- Per-machine rollout authorization and whether to use the recommended Mac full-cycle canary gate before VPS activation.

Stop and report when a guard requires destructive private cleanup; originals are unavailable beyond the declared coverage; attribution or support cannot be established; a purported sandbox resolves to live storage; a verifier would export private data; or a publication/cutover invariant fails. Unknown is a result, not permission to invent. Independent work may continue where it cannot worsen the blocked boundary.

## Reporting and completion

For each E-unit, report:

- State: proposed / implementing / blocked / independently verified / activated.
- Deliverable paths and commit, or private operational receipt location.
- Confirmed cause and changed behavior.
- Exact checks executed, outcomes, and checks not run.
- Unresolved questions, coverage gaps, stop rules and rollback status.
- Reviewer identity distinct from implementer where independence is required.

Whole-program completion requires E38 and E39 evidence, not merely merged code. Preserved legacy stores are not deleted as part of this program.

## Handoff review checklist

- [x] Diagnosis and accepted direction separated from unknown historical scope.
- [x] All 39 units have purpose, deliverable, prerequisites and observable done conditions.
- [x] Parallelism, shared-file coordination, independent gates and activation boundaries are explicit.
- [x] Private evidence, protected authored records and rollback are addressed.
- [x] Stable E-labels work independently of machine-local Made Well IDs.
- [x] No private transcript excerpts or audited private record identifiers are included.
- [x] No implementation or deployment success is claimed.
- [ ] Exact implementation commands for every unit: intentionally deferred to Made Well planning after grounding current code and choosing the specified contracts. Inventing them during discovery would turn proposed design into false implementation facts.
