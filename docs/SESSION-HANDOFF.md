# Circadian session handoff — 2026-10-13

## Current state: coordinated views and memory checks published, enabled and live-checked

The preserved research and closeout were landed on `main` at `19c8872`, pushed to GitHub, and installed on both the M5 and hive. Both installations reported views ON and a passing real view/expansion check after synchronization. All 333 original research files match the preserved archive; the research index was intentionally updated. The original Mac folder is retained as a historical backup under `~/Library/Caches/circadian-research/reconcile-20261013-i4n2pw/research-original`.

Verification: the full M5 run passed 1,005 tests with 21 skips and zero failures. The publication worktree's required VPS gate passed 939 tests with 93 skips and zero failures. These are actual run counts, not a claim that skipped checks ran or that models use memory correctly.

The earlier missing-activity refusal remains preserved in `research/session-close/operational-metadata.md`. The installed native session adapter was repaired to normalize tool names and pass worker identity to every helper. Fresh sessions recorded real reads, grounding and completed writes; no historical events were fabricated. The moved credential guard was restored through its canonical installer/path.

The supporting tooling repair is committed and installed on hive at `620cc25` in its local `~/concierge` repository. Its required integration gate passed, including a restored negative test that makes the health check fail when a configured Ground gate stops refusing. The normal landing review completed all 22 selected hunks with no blocking findings. The installed health check reported 39 checks OK, six optional/legacy warnings, and zero required failures. That machine-local repository has no remote; its complete Git history is backed up privately on both machines as `concierge-repair-20261013.bundle` under hive's `~/.local/state/` and the M5's `~/Library/Caches/circadian-research/`. No new remote was created. Both temporary workers and their worktrees were closed; merged closeout/fringe branches were removed.

The publication review completed the top-level/documentation checks but exhausted its budget on the historical research archive. Its partial archive check reported 14 `weak_task_relation` warnings. Publication used the landing tool's explicit `--land-unreviewed --accept-findings` path, recorded as such in the landing receipt; the archive was not represented as fully re-reviewed. Existing prototype/peer evidence and frozen failures remain intact. Receipt: `worker events circadian-publish-20261013` on hive.

Hive's Claude login was restored by the operator. The fresh native `claude auth status --json` check returned exit 0, `loggedIn: true` and `authMethod: claude.ai`; native `claude mcp list` returned exit 0 and confirmed Circadian connected. The installed Claude settings retain Circadian SessionStart wake/status, UserPromptSubmit/PostToolUse graze and SessionEnd sleep hooks. This verifies authentication and MCP connectivity, plus hook registration; it does not certify a complete lifecycle run or model use of memory.

## Next-session entry

From the installed checkout:

```sh
cd ~/circadian && git pull --ff-only && circadian extensions status && circadian extensions check views && circadian extensions check checks
```

Then read this file, `docs/COORDINATED-VIEWS.md`, and `research/README.md`. Do not rerun the completed research studies for pickup; use the evidence paths below.

## What is shipped

Production now includes the bounded optional coordinated memory view from proposal 01 and the separate default-off [memory checks](MEMORY-CHECKS.md) addition. Both use existing atoms, episodes and the belief ledger; they add no database, service, timer or new inference endpoint. Checks changes the existing extraction encoding to code-bound source selectors and exposes `memory_check` through CLI, MCP and Pi. It adds no extraction model call; the read-check handler calls no model. When disabled, the original extraction prompt/decoder and ordinary Circadian behavior remain unchanged.

The shipped reader returns bounded whole records with coverage counts, omissions and unresolved records. Expansion requires the returned `{id, revision}` and rechecks current eligibility, source availability and source revisions before returning atom/source text; stale, ineligible, unavailable and over-budget cases are explicit. Controls are `circadian extensions status`, `circadian extensions check views`, `circadian extensions enable views`, `circadian extensions disable views`, plus `circadian view` and `circadian expand`. The live check reads and expands real memory, checks bounds and file bytes, and writes only an operational receipt.

Enabled wake adds a short usage note outside remembered data; disabled wake is unchanged. Native Pi and MCP expose `memory_view` and `memory_expand` when enabled, rechecking the flag on every call. Existing MCP sessions need reconnect/new session and Pi needs `/reload` or a new session to discover newly registered tools; CLI use is immediate. Codex registration here is MCP tools only, not wake/sleep lifecycle certification.

Checks-enabled wake explains `memory_check` and its evidence limits; `checks ON` is visible in status. Controls are `circadian extensions enable checks`, `disable checks`, `check checks` and `circadian check --input <JSON file|->`. For the complete read workflow, enable views as well. Typed recording-location, event-location and participation outputs are candidates with semantic UNKNOWN. Fields/contexts results are comparisons within supplied annotations, not independent proof of source meaning. The source selector path binds exact original spans and rejects invalid/oversized ranges; its 4,096-character, eight-selection and 32 KiB encoded-quote limits also leave an explicit whole-atom size guard before publication.

M5 rejection diagnosis: the retained 12 EXTRACT calls in the 2026-10-14 04:19–04:21 UTC absorption batch reproduced 40 accepted and 20 rejected candidates: 19 non-verbatim quotes and one malformed quote line. All stored prompts matched current source bytes, ruling out source drift. The original validation guard was correct and remains in place. No rejected historical output was rewritten or published by these probes.

Four fresh local Qwen probe calls were made during implementation: one synthetic extraction and three successive probes of one original failing source. The first whole-line attempt rejected all five candidates because its source line was 2,420 characters, exceeding the initial 2,000-character cap. Segmentation alone accepted one and rejected four spanning-range selections. The final declared 4,096-character/32 KiB bounded format accepted all five, rejected zero and copied every quote exactly. That result was also validated against the final escape-aware decoder without another model call. This is an exact-symptom reproduction, not a held-out study or proof of semantic accuracy. One synthetic receipt initially inspected string quotes as objects; a separate correction record preserves that reporting error and the unchanged raw response. Private request/response evidence is under ignored `logs/checks-probes/`, not in the public repository.

Parent's final full M5 code gate: 1,051 pass, 21 skip, zero failures, 20,649 assertions across 89 files. Two visible implementation agents delivered disjoint changes; the independent reviewer identified prototype-key lookup, checks-only guidance, leading-whitespace diagnostics and escaped-quote size issues, all fixed with regressions before publication. The existing extraction prompt remains byte-identical when checks are disabled. CLI, MCP and native Pi integration tests exercise actual handlers, immediate disable and bounded evidence without live-mind writes. M5's explicit live source check passed after enabling checks; deployment parity is recorded after synchronization below.

Runtime delivery landed at `7c45dbe`, pushed to GitHub and synchronized to both checked installations. Both report `views: true` and `checks: true`. Explicit live checks passed on both; fresh MCP stdio clients and each actual installed Pi extension discovered and executed `memory_check`, returning source-current exact bytes with semantic UNKNOWN. Those probes called no model and changed no mind. Existing sessions still need reconnect/reload for discovery. Sources: `circadian extensions status --json`, `circadian extensions check checks --json`, `circadian extensions check views --json` and the fresh native MCP/Pi probe on each machine, acquired 2026-10-14 UTC.

The final VPS full gate returned 1,046 pass, 32 skip, zero failures and 17,577 assertions across 89 files. An initial SSH invocation omitted Bun's directory from PATH and produced ten child-process failures; it was retained as a failed verification attempt, then rerun with the verified `/home/jrg/.bun/bin` directory on PATH. No source fix or weaker gate was used for those environment failures.

The machines intentionally retain their existing provider settings. M5's current `/models` and probe response identify `mlx-community/Qwen3-30B-A3B-Instruct-2507-4bit`; Hive's identify `deepseek-ai/DeepSeek-V4.1-Flash` at its configured managed endpoint. No provider, endpoint or model setting was changed. A fifth fresh probe call used Hive's configured backend on the same synthetic source: two accepted candidates, zero rejected, all quotes exact, no mind writes. Sources: actual `/models` responses and private retained probe receipts `logs/checks-probes/bounded-1791953887550/receipt.json` on M5 and `logs/checks-probes/hive-1791954525962/receipt.json` on Hive. Raw requests, responses, earlier failed probes and the correction record remain private; none enter the public repo.

## What remains research-only

Everything under `research/` is preserved research evidence unless a later brief explicitly promotes a bounded part. The six dossiers, refinements, prototypes, peer work, fictional lab receipts and visual explainer are not production extensions. There is no claim of a general category-theory engine, universal ontology, measured superiority, or automatic model use.

Current `src/extensions.ts` exposes the independent `views` and `checks` booleans. A generalized plugin loader is not implemented. Further additions should retain the smallest independently disabled and fallback-preserving contract rather than broadening these into an extension framework.

## Six original proposals: status and next action

| Dossier title | Demonstrated mechanism | Remaining limitation | Concrete next action |
| --- | --- | --- | --- |
| Dossier 01: Coordinated views of one memory | Production integrated only in bounded form: whole-record `view`/revision-checked `expand` over current atoms, episodes and ledger, with CLI/MCP/Pi controls and live check. Prototype also demonstrated `restrictRecords`, `makeView`, `expand`. | Behavioral value is unmeasured: context savings, reduced irrelevant recall and autonomous model use are not established. | P1: observe normal sessions with the stop rule below before more promotion. |
| Dossier 02: Contextual compatibility in one shared memory | Prototype `compareContexts`/`checkJoint`; runtime checks now compare finite caller-supplied contexts and retain document labels on exact source selections. | 009 lost human-readable maintenance/safety-note labels behind opaque IDs; extraction can still omit labels needed by later questions. | Research projection retains caller-supplied semantic labels. Runtime document labels do not automatically discover embedded roles; model benefit remains unmeasured. |
| Proposal 3: typed relationships and checked composition | Prototype `composeReports`; runtime checks keep recording-location/event-location candidates distinct and bind exact sources. | Unknown-setting cases copied recording locations into event locations. Exact provenance alone cannot reject every wrong interpretation. | The research approval gate requires actual independent semantic review. Runtime candidates remain semantic UNKNOWN, without pretending to supply that review. |
| Proposal 4: Reusable operations with multiple inputs | Prototype `overlap`, `matchPlace`, `assemble`, `instantiate`, `retireAid`; 009 found bounded scheduling answers. | Selection/invalidation and total usefulness remain unmeasured; R14 total-cost comparison is deferred. | New regression verifies existing retirement preserves inputs/source states and ordinary planning. Defer R14 until after real-use evidence. |
| Proposal 5: joint experiences and relations between interpretations | Prototype `jointOccasions`, `checkRevisit`, `recallOccasion`; runtime checks bind participation candidates to exact source selections. | Kite case promoted an instructions author into participant list despite unknown attendance; source presence is not attendance proof. | Runtime candidates remain semantic UNKNOWN. The separate research approval gate requires actual reviewed participation evidence; automatic semantic review is unimplemented. |
| Proposal 6: Checked transformations of memory | Prototype paired checker caught “might prefer” becoming “always prefer”; runtime checks compare exact selected fields and enabled extraction copies source evidence in code. | Copying faults are addressed; selecting correct evidence and interpreting absence still require semantic assessment. Free prose is outside exact-field checking. | Continue ordinary use. Semantic benefit remains unmeasured; do not rescore frozen failures or claim universal understanding from exact copying. |

## Priorities

**P1 — finite real-use observation of existing views.** For the next five relevant ordinary memory requests in normal sessions, record only: whether the view tool was called when wake/ordinary recall lacked context; whether needed evidence was present; whether the answer was source-correct after expansion; and context/tool overhead versus ordinary recall. Stop after five relevant requests and summarize. Do not manufacture a new broad benchmark first.

The manual [observation record](VIEWS-OBSERVATION.md) is ready with counting rules and an excluded native setup probe. No qualifying request has been counted yet. Continue it during ordinary work; no background collector or new inference service is installed.

**P2 — prospective research input-contract repairs.** The [new adapters](../research/lab/input-contracts/README.md) retain caller-owned labels for 02, bind exact source spans for 06 and require separately reviewed event-location/participation claims before 03/05 operations. The 04 regression verifies that existing aid retirement already preserves original memory inputs and ordinary planning; no rewrite was needed. These engineering repairs proceed independently of P1. They do not change frozen studies or production, automate semantic review, or demonstrate improved model accuracy. Embedded labels still need selection, spans still need correct interpretation and independent review must actually be supplied by the caller. Defer 04 R14 total-cost comparison.

Verification for these repairs: parent full M5 suite returned 1,026 pass, 21 skip, zero failures; final focused boundary suite returned 21 pass, 140 assertions, zero failures. Two visible implementation agents delivered disjoint files and a third independently reviewed the new research code with no blocking findings. Synthetic test approvals do not constitute actual independent semantic review. No new inference requests were dispatched. Production and frozen 006–009 paths were unchanged.

**P3 — bounded checks integration selected by the operator.** The operator explicitly authorized implementation without waiting for P1. The new runtime includes source labels, exact spans, annotated field/context comparisons and separately typed relation candidates. It does not promote the research-only approval gate into automatic semantic truth or add a temporary-aid runtime. Further additions should follow real-use evidence and preserve all six proposals and default behavior.

## Research results and frozen limits to carry forward

- Prototypes: 120 deterministic tests, 492 assertions, 93 specification IDs mapped; 92 deterministic checks and R14 deferred.
- Proposed first behavioral comparison in the refinement protocol: 24 initial reader calls with one explicitly selected model, each allowing at most one follow-up model invocation, for 48 reader calls maximum. That design was not executed as written; a second model would be a separate bounded choice.
- Behavioral 005: 24 frozen scenarios and 72 reader trials; strict passes were baseline 5/24, augmented 6/24, assisted 8/24. Useful signal is limited by output/schema failures and a strict rubric.
- Extractor 008: inherited the repaired semantic contracts and ran the 72-call battery with existing local model/settings, no remote inference, retry, output repair or new package; serving grammar omitted finite string `maxLength` only, while prompt and local binders retained the limits.
- Extractor 009: all eighteen 008 cases were exposed development material; it authorized exactly 36 new calls, sequential, one structured extraction and one structured reader per case, with no retries, repair, winner selection, source-span normalization, data repair or weaker validation.
- Local extractor 008+009 total: 108 study calls. In 009, 15/18 structured records were consumable, 12/18 reader answers were question-correct, and 11/18 passed every recorded acceptance dimension. The runs exposed case-level failures and a historical comparator; they do not establish universal superiority.

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

No fresh experiments are required to resume. After parent land, push, synchronization and live installation checks, start with P1 observation in real use.
