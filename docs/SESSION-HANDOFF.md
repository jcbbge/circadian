# Circadian session handoff — 2026-10-12

## Starting command

After this branch is landed and pulled where you work:

```sh
cd ~/circadian && git pull --ff-only && circadian extensions status && circadian extensions check views
```

Then read this file, `docs/COORDINATED-VIEWS.md`, and `research/README.md`. Do not rerun the completed research studies for pickup; use the evidence paths below.

## What is shipped

Shipped production behavior is the bounded optional coordinated memory view from proposal 01. It uses existing atoms, episodes and the belief ledger; it adds no model call, database, service, timer or new inference endpoint. It is opt-in per machine. When disabled, ordinary Circadian wake/recall/graze/sleep/REM behavior is unchanged.

The shipped reader returns bounded whole records with coverage counts, omissions and unresolved records. Expansion requires the returned `{id, revision}` and rechecks current eligibility, source availability and source revisions before returning atom/source text; stale, ineligible, unavailable and over-budget cases are explicit. Controls are `circadian extensions status`, `circadian extensions check views`, `circadian extensions enable views`, `circadian extensions disable views`, plus `circadian view` and `circadian expand`. The live check reads and expands real memory, checks bounds and file bytes, and writes only an operational receipt.

Enabled wake adds a short usage note outside remembered data; disabled wake is unchanged. Native Pi and MCP expose `memory_view` and `memory_expand` when enabled, rechecking the flag on every call. Existing MCP sessions need reconnect/new session and Pi needs `/reload` or a new session to discover newly registered tools; CLI use is immediate. Codex registration here is MCP tools only, not wake/sleep lifecycle certification.

## What remains research-only

Everything under `research/` is preserved research evidence unless a later brief explicitly promotes a bounded part. The six dossiers, refinements, prototypes, peer work, fictional lab receipts and visual explainer are not production extensions. There is no claim of a general category-theory engine, universal ontology, measured superiority, or automatic model use.

## Six original proposals: status and next action

| Dossier title | Demonstrated mechanism | Remaining limitation | Concrete next action |
| --- | --- | --- | --- |
| Dossier 01: Coordinated views of one memory | Production integrated only in bounded form: whole-record `view`/revision-checked `expand` over current atoms, episodes and ledger, with CLI/MCP/Pi controls and live check. Prototype also demonstrated `restrictRecords`, `makeView`, `expand`. | Behavioral value is unmeasured: context savings, reduced irrelevant recall and autonomous model use are not established. | P1: observe normal sessions with the stop rule below before more promotion. |
| Dossier 02: Contextual compatibility in one shared memory | Prototype `compareContexts`/`checkJoint`; 009 usable inputs computed different-day compatibility and same-day conflict. | 009 lost human-readable maintenance/safety-note labels behind opaque IDs; extraction can still omit labels needed by later questions. | P2: fix the model-input contract to retain human source labels before any integration. |
| Proposal 3: typed relationships and checked composition | Prototype `composeReports`; explicit attribution cases worked in 009. | Unknown-setting cases copied recording location into event-location, yielding structurally valid but false relations. | P2: require affirmative event-location evidence and reject copied recording locations. |
| Proposal 4: Reusable operations with multiple inputs | Prototype `overlap`, `matchPlace`, `assemble`, `instantiate`, `retireAid`; 009 found bounded scheduling answers. | Selection/invalidation and total usefulness remain unmeasured; R14 total-cost comparison is deferred. Temporary aid retirement must not delete meaningful memory. | P2/P3: separate retirement of useful temporary aids from retention of underlying memory; defer R14 until after real-use evidence. |
| Proposal 5: joint experiences and relations between interpretations | Prototype `jointOccasions`, `checkRevisit`, `recallOccasion`; 009 lantern case kept participants distinct from a later observer. | Kite case promoted an instructions author into participant list despite unknown attendance; absence of evidence can become false absence/presence. | P2: require affirmative attendance/participation evidence before recording event membership. |
| Proposal 6: Checked transformations of memory | Prototype `checkPresentation`, `makeReceipt`, `verifyApplicability`; 009 paired checker caught “might prefer” becoming “always prefer.” | Exact phrase copying failed in two confirmation texts; free prose remains outside semantic checking. | P2: bind exact source spans in code instead of asking the model to recopy them. |

## Priorities

**P1 — finite real-use observation of existing views.** For the next five relevant memory requests in normal sessions, record only: whether the view tool was called when wake/ordinary recall lacked context; whether needed evidence was present; whether the answer was source-correct after expansion; and context/tool overhead versus ordinary recall. Stop after five relevant requests and summarize. No new broad benchmark is needed first.

**P2 — narrowly fix confirmed model-input contract defects before further promotion.** Fix only when work resumes: retain human source labels for 02; require affirmative event-location and attendance evidence for 03/05; bind exact source spans with code for 06; separate useful temporary aid retirement from memory retention for 04. Defer 04 R14 total-cost comparison.

**P3 — choose one next optional integration after P1.** Recommend 02, or a small 03 attribution seam if P1 failures show attribution/location confusion. Do not integrate all six at once; preserve all six and avoid another scope-loss spiral.

## Research results to carry forward

- Prototypes: 120 deterministic tests, 492 assertions, 93 specification IDs mapped; 92 deterministic checks and R14 deferred.
- Behavioral 005: 24 frozen scenarios and 72 reader trials; strict passes were baseline 5/24, augmented 6/24, assisted 8/24. Useful signal is limited by output/schema failures and a strict rubric.
- Local extractor 008+009: 108 study calls. In 009, 15/18 structured records were consumable, 12/18 reader answers were question-correct, and 11/18 passed every recorded acceptance dimension. The runs exposed case-level failures and a historical comparator; they do not establish universal superiority.

## Operational boundaries

Other harnesses are not certified. Codex is MCP tools only unless a future lifecycle integration is explicitly installed and checked. Machine task/worker/boot installation drift belongs to the box/tooling owner, not Circadian. Parent verified the boot-card runner and tree-state script were absent on M5; record that as a tooling-owner follow-up only, and do not provision replacements from Circadian work. No cloud provider is required for the current shipped reader; all latest study inference used the existing local endpoint. Any keys provided during earlier tests should be revoked by the operator/provider owner if still active; never reproduce them.

Existing sessions must reload/reconnect for newly discovered tools. Disabling views blocks future calls but cannot erase context already in an ongoing conversation.

## Retrospective

What worked: a tangible optional reader with status/on/off/help, live check, native Pi/MCP discovery and parity across the checked machines. Confidence is high in deterministic read, current eligibility checks and default-off behavior.

What fell short: experimentation sprawled, scope drifted, and the operator/agent discovery story was not delivered up front. Confidence is lower in automatic model use and source interpretation. The correction for future delivery is to present status, on/off/help and agent guidance first, then run the finite P1 observation and the exact P2 fixes above.

## Evidence paths

- Shipped guide: `docs/COORDINATED-VIEWS.md`
- Preserved research index: `research/README.md`
- Prototype evidence: `research/prototypes/README.md`, `research/prototypes/results.json`
- Behavioral 005: `research/lab/behavioral-005/RESULTS.md`
- Extractor repair/latest local run: `research/lab/extractor-009/RESULTS.md`
- Lab contract: `research/lab/AGENTS.md`
- Operational receipts: `research/session-close/delivery-report.md`, `research/session-close/review-report.md`, `research/session-close/codex-discovery-receipt.json`, `research/session-close/operational-metadata.md`

No fresh experiments are required to resume. Start with P1 observation in real use.
