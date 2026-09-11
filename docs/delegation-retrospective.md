# Session-storage repair: delegation failure

Evidence: this session's tool calls and operator corrections; `work/done/repair-session-storage`; `work/done/orch-session-storage` (formerly held); `work/agnt-storage-code.log`; commits `2afe7a6` and `adbf4be`; installed `hdx --help`.

## What failed

The operator's task was clear. The desk chose a multi-tier execution route before acquiring the small native-persistence fact that explained the symptom. It discovered there was no Herdr server, then improvised unattended delegation without verifying its ownership and completion contracts.

- The first `hdx init` targeted the project root rather than the default `work` board. The next `put` failed. The model-profile lookup also used invalid syntax before the documented `get` form.
- The first child had no stable `WORK_TOKEN`. Its claim fenced under the fallback process-derived identity. Restarting with a stable token addressed that incident, but should have been verified before dispatch.
- Both coordinator and orchestrator cards recorded `parent: -`. Parentage existed in prose, not in the board's explicit parent field. No end-to-end completion-delivery test was run.
- The desk blocked in a shell `wait` with a 1200-second timeout. This was not the promised durable completion channel. The tool was interrupted; later inspection found the orchestrator still running.
- The desk required recursive delegation for a small repair even though it had not established a functioning execution route. Three roles repeated orientation and generated briefs; the relevant native `_persist` implementation was not established before the initial patch.
- The coder reported `UNMET: None`, although its report also marked native lifecycle behavior unproven and it added no regression tests. Existing-suite success was presented as verification of a new behavior.
- The initial patch retained the old unreachable missing-file/empty-success branch and conflated explicit non-persistence with emptiness. The subsequent direct repair removed the duplicate branch and tested native session behavior.
- The coder committed while the orchestrator brief reserved commits to the coordinator. Subsequent source review established that `agent-core/primitives/rules/commit-discipline.md` explicitly overrode no-commit briefs. This is conflicting authority, not proven worker insubordination.
- On takeover the desk stopped the remaining process but initially left held cards describing active work. Subsequent closure recorded all three as cancelled/superseded doer reports, not accepted implementation: `hdx ls` returned OPEN0, HELD0, DONE3, VERIFIED0, using explicit no-runtime mode with no cleanup effects.

## Ambiguity

No product clarification was needed from the operator. Operational directives disagree: mandatory full hierarchy versus small-task inline guidance; automatic sidecar versus manually creating it; various descriptions of completion delivery; worker commit requirements versus brief-specific prohibitions. These conflicts require canonical resolution, not another prose layer. They do not excuse the desk's unverified dispatch.

## Proposed prevention — not implemented by this retrospective

1. Choose a supported execution route before dispatch. If hierarchy remains mandatory, make it cheap and executable; explicitly define the unavailable-substrate fallback. Do not silently improvise one.
2. A dispatch door should atomically establish stable identity, parent link, ownership, report destination, and completion delivery. Refuse dispatch if these cannot be established. Verify with a real child claim/report/exit cycle.
3. Completion must carry evidence for each acceptance condition. A baseline test count cannot satisfy a requested regression test. `UNMET: None` plus an unproven required condition must fail acceptance.
4. Cancellation and direct takeover must reconcile descendants, processes, and cards together. Shell exit alone is not fleet closure.
5. Set commit authority once per unit and enforce it at the commit boundary.

The initial retrospective did not implement prevention. Subsequent work is recorded in `agent-core/research/execution-contracts/`: corrected instruction/mapping source landed as 7d4693c and was scoped-synced; installed standalone runtime acceptance is qualified in report06. These changes do not establish universal concurrency or live-runtime compatibility. The native Pi regression tests prove current persistence behavior; they do not retroactively prove what the missing historical session contained. Codex-native ingestion was not demonstrated by the repair.
