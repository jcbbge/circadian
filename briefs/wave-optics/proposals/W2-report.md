# W2 Report — Exposure metering: session class gates deposit authority

Label: `w2-exposure`. Generated from the REAL implementation
(`src/stack.ts classifyExposure`) at completion time, not the tuning prototype.

## Knobs (as shipped)

| Knob | Value | Notes |
|---|---|---|
| `FLASH_GRAIN` | 0.25 | absent `grain` on a ledger stack event folds as 1 (backward compat) |
| `FLASH_BODY_MAX` | 2600 | body chars (frontmatter stripped); longest flash episode sits below, substantive sessions clear it |
| `FLASH_PAIRS_MAX` | 2 | max user/assistant exchange pairs |

## Signals (combined, tuned on the corpus)

1. **body length** below `FLASH_BODY_MAX`;
2. **transcript pairs** ≤ `FLASH_PAIRS_MAX`;
3. **instruction-echo / role-brief body evidence** — "Reply with exactly", "say OK",
   single-word expected output, "print the word X", "Write exactly 'x' to /tmp",
   or a disposable-worker role brief ("You are the %s worker. Read … execute it fully",
   "The worker contract it references binds you", "execute the brief at …");
3b. **identical-quote echo** — user turn == assistant turn verbatim (e.g.
   verdict-hook-validation-3's "The verdict hook works." twice).

Classification is BODY EVIDENCE, not filename regex. Filenames were used only as
a cross-check hint (below).

## Counts

- Total episodes: **155**
- Flash: **85**
- Standard: **70**
- Filename-hint set (ack|verdict|confirmation|validation|ok-|pong|ping|claim):
  35 flash, 4 standard (hint set size 39).
  Every ack/verdict/ok/pong/claim file with echo body evidence — including the
  identity-contaminating role briefs — is metered at 0.25 grain and barred from
  kind:identity.
  The 4 hint-set STANDARDS are the proof that filenames are hints, not truth:
  `2026-08-05-tower-scoping-fix.md` (matched via "ping" inside "scoping"),
  `2026-08-06-stop-hook-feedback.md` and `-2` (matched via "ok-" inside
  "hook-"), and `2026-08-05-verdict-hook-finalization.md` — all four carry real
  findings (a scoping fix, two hook relays with verdict records, a c001-verify
  report contract), not echo tests, so their bodies classify standard.

## Full classification (all 155 episodes)

| Class | Len | Episode |
|---|---|---|
| standard |  1240 | 2026-07-27-sleep-anchor-integrity.md |
| standard |  2127 | 2026-07-27-the-stuttering-mind.md |
| standard |   618 | 2026-07-27-tower-gate.md |
| standard |   622 | 2026-07-27-tower-silence.md |
| flash    |  1790 | 2026-07-27-ws-0-fix-hotfix.md |
| flash    |   871 | 2026-07-27-ws-b-execution.md |
| flash    |  2560 | 2026-07-27-ws-c-acceptance-run.md |
| standard |  2451 | 2026-07-27-ws-c2-idempotence-re-test.md |
| flash    |  1360 | 2026-07-27-ws-d-execution.md |
| standard |  3221 | 2026-07-27-ws-e3-final-migration.md |
| flash    |  1345 | 2026-07-27-ws-g-execution.md |
| flash    |  1743 | 2026-07-28-bash-only-report-write.md |
| standard |  1836 | 2026-07-28-coa-mismatch-resolution.md |
| flash    |  2036 | 2026-07-28-gauntlet-completion-tower-handoff.md |
| standard |  8053 | 2026-07-28-genesis-archaeology.md |
| flash    |  1582 | 2026-07-28-pong-echo.md |
| flash    |  1529 | 2026-07-28-pong-verification.md |
| standard |  1262 | 2026-07-28-the-river-remembers.md |
| standard |  1004 | 2026-07-28-the-stutter-resolved.md |
| standard |  2118 | 2026-07-28-tower-relay-finalization.md |
| flash    |  2434 | 2026-07-28-tower-test-flow.md |
| flash    |  1742 | 2026-07-28-verdict-hook-confirmation-2.md |
| flash    |  1102 | 2026-07-28-verdict-hook-confirmation-3.md |
| flash    |   749 | 2026-07-28-verdict-hook-confirmation.md |
| flash    |   929 | 2026-07-28-verdict-hook-validation-2.md |
| flash    |  1068 | 2026-07-28-verdict-hook-validation-3.md |
| flash    |  1074 | 2026-07-28-verdict-hook-validation.md |
| standard |  1429 | 2026-07-28-ws-1-finalization.md |
| standard |  1636 | 2026-07-28-ws-f-build-finalization.md |
| standard |  1647 | 2026-07-28-ws-h-finalization.md |
| standard |  1452 | 2026-07-30-logo-integration-memory-integrity.md |
| standard |  3248 | 2026-07-30-tower-auto-program-launch.md |
| flash    |   937 | 2026-07-30-wiring-confirmation.md |
| flash    |  1443 | 2026-07-30-ws-5-acceptance-chain.md |
| standard |  1766 | 2026-08-02-herdr-integration-closure.md |
| standard |  2026 | 2026-08-02-inventory-ledger-unlocked.md |
| flash    |  1595 | 2026-08-02-ok-acknowledgment.md |
| standard |  1725 | 2026-08-02-verbatim-compliance-audit.md |
| standard |  1700 | 2026-08-03-closure-of-drift.md |
| flash    |  1215 | 2026-08-03-criticality-matrix-pass-1.md |
| standard |   724 | 2026-08-03-criticality-synthesis.md |
| standard |   766 | 2026-08-03-delegation-ready-artifact-generation.md |
| flash    |  1035 | 2026-08-03-file-read-write-flow.md |
| flash    |  1027 | 2026-08-03-file-write-verification.md |
| flash    |   948 | 2026-08-03-hello-world-echo.md |
| flash    |  1147 | 2026-08-03-hello-world-write-2.md |
| flash    |   779 | 2026-08-03-hello-world-write-3.md |
| flash    |  1495 | 2026-08-03-hello-world-write.md |
| standard |  2638 | 2026-08-03-neural-avalanche-integration.md |
| flash    |   915 | 2026-08-03-ok-acknowledgment-2.md |
| flash    |   929 | 2026-08-03-ok-acknowledgment-3.md |
| flash    |   695 | 2026-08-03-ok-acknowledgment.md |
| flash    |  1231 | 2026-08-03-smoke-signal.md |
| flash    |  2083 | 2026-08-04-compost-dedup-b02.md |
| standard |  1856 | 2026-08-04-ratchet-as-data.md |
| standard |  1017 | 2026-08-04-tunick-s-ghost.md |
| standard |  1554 | 2026-08-05-bb-lifecycle-probe.md |
| standard |  1963 | 2026-08-05-bb-self-build-proof.md |
| standard |  1796 | 2026-08-05-bb-stress-test.md |
| standard |  1549 | 2026-08-05-c001-landed.md |
| standard |  2012 | 2026-08-05-c001-verification-fan-out.md |
| flash    |  1852 | 2026-08-05-c001-verify-complete.md |
| standard |  1463 | 2026-08-05-c001-verify-fan-out.md |
| flash    |  1812 | 2026-08-05-claim-gate-validation.md |
| flash    |  2064 | 2026-08-05-claim-verification-flow.md |
| standard |  1097 | 2026-08-05-control-plane-illusion.md |
| standard |  1154 | 2026-08-05-made-well-sink-activation.md |
| standard |  1493 | 2026-08-05-made-well-telemetry-sink.md |
| flash    |   877 | 2026-08-05-ok-acknowledgment.md |
| standard |  2041 | 2026-08-05-orchestrator-launch.md |
| flash    |   981 | 2026-08-05-passive-telemetry-sink.md |
| flash    |  1436 | 2026-08-05-probe-override-test.md |
| flash    |  1210 | 2026-08-05-ready-confirmation-2.md |
| flash    |  1140 | 2026-08-05-ready-confirmation.md |
| standard |  1011 | 2026-08-05-sleep-phase-trigger.md |
| flash    |  2052 | 2026-08-05-td-spine-verification.md |
| flash    |   943 | 2026-08-05-telemetry-sink-confirmation.md |
| flash    |  1809 | 2026-08-05-test-failure-diagnosis-2.md |
| flash    |  1898 | 2026-08-05-test-failure-diagnosis.md |
| standard |  1110 | 2026-08-05-tower-scoping-fix.md |
| standard |  2165 | 2026-08-05-verdict-hook-finalization.md |
| standard |  1151 | 2026-08-05-zero-mem-integration.md |
| standard |  1088 | 2026-08-06-bb-app-crash.md |
| standard |  2158 | 2026-08-06-bb-as-agentic-substrate.md |
| standard |  1781 | 2026-08-06-bb-self-build-loop.md |
| standard |  1769 | 2026-08-06-bb-telemetry-bridge.md |
| standard |  1480 | 2026-08-06-bridge-spec-rejection.md |
| flash    |  1812 | 2026-08-06-cairn-acknowledgment-2.md |
| flash    |   653 | 2026-08-06-cairn-acknowledgment-3.md |
| flash    |  2012 | 2026-08-06-cairn-acknowledgment.md |
| flash    |  1469 | 2026-08-06-cairn-activation.md |
| flash    |  2297 | 2026-08-06-cairn-confirmation-2.md |
| flash    |  1828 | 2026-08-06-cairn-confirmation-3.md |
| flash    |   950 | 2026-08-06-cairn-confirmation-4.md |
| flash    |  1499 | 2026-08-06-cairn-confirmation-5.md |
| flash    |   916 | 2026-08-06-cairn-confirmation.md |
| flash    |  1337 | 2026-08-06-cairn-initiation.md |
| flash    |  1627 | 2026-08-06-cairn-kickoff-10.md |
| flash    |  1356 | 2026-08-06-cairn-kickoff-11.md |
| flash    |  2059 | 2026-08-06-cairn-kickoff-12.md |
| flash    |  1373 | 2026-08-06-cairn-kickoff-13.md |
| flash    |  2178 | 2026-08-06-cairn-kickoff-2.md |
| flash    |  1108 | 2026-08-06-cairn-kickoff-3.md |
| flash    |   846 | 2026-08-06-cairn-kickoff-4.md |
| flash    |   957 | 2026-08-06-cairn-kickoff-5.md |
| flash    |  2449 | 2026-08-06-cairn-kickoff-6.md |
| flash    |  1468 | 2026-08-06-cairn-kickoff-7.md |
| flash    |  1523 | 2026-08-06-cairn-kickoff-8.md |
| flash    |  1479 | 2026-08-06-cairn-kickoff-9.md |
| flash    |  1349 | 2026-08-06-cairn-kickoff-verification.md |
| flash    |  1437 | 2026-08-06-cairn-kickoff.md |
| flash    |   701 | 2026-08-06-cairn-output-verification.md |
| flash    |  2051 | 2026-08-06-cairn-validation.md |
| flash    |  2119 | 2026-08-06-cairn-verification-2.md |
| flash    |   841 | 2026-08-06-cairn-verification-3.md |
| flash    |  1402 | 2026-08-06-cairn-verification-4.md |
| flash    |  1010 | 2026-08-06-cairn-verification.md |
| standard |  1474 | 2026-08-06-control-plane-reality-check.md |
| standard |   742 | 2026-08-06-e-is-live.md |
| standard |  1767 | 2026-08-06-ember-in-the-void.md |
| standard |  1148 | 2026-08-06-ember-lookup.md |
| standard |  2061 | 2026-08-06-fut-spine-handoff.md |
| flash    |   838 | 2026-08-06-hooks-wired-confirmation.md |
| standard |  1140 | 2026-08-06-instrument-over-model.md |
| standard |  1496 | 2026-08-06-kotadb-purge-and-c-decision-closure.md |
| flash    |  1076 | 2026-08-06-ok-acknowledgment-2.md |
| flash    |   790 | 2026-08-06-ok-acknowledgment.md |
| flash    |   838 | 2026-08-06-ok-compliance-test.md |
| flash    |  1180 | 2026-08-06-orch-ready-confirmation.md |
| flash    |  1245 | 2026-08-06-pong-ack-relay.md |
| standard |  1812 | 2026-08-06-restart-survival-test-pass.md |
| standard |  1708 | 2026-08-06-rivet-stigmergy-marriage.md |
| standard |  1516 | 2026-08-06-stop-hook-feedback-2.md |
| standard |  1205 | 2026-08-06-stop-hook-feedback.md |
| standard |  1350 | 2026-08-06-unification-finalized.md |
| standard |  1281 | 2026-08-06-water-as-negative-mold.md |
| flash    |   833 | 2026-08-06-worker-1-done-confirmation.md |
| flash    |  2147 | 2026-08-06-ws-a-platform-bring-up.md |
| flash    |  1510 | 2026-08-06-ws-b-nebula-core-completion.md |
| standard |  2324 | 2026-08-06-ws-c-completion-and-relay.md |
| standard |  1101 | 2026-08-06-ws-d-completion-and-telemetry-relay.md |
| flash    |  1563 | 2026-08-06-ws-e-completion-and-relay-verification.md |
| standard |  1832 | 2026-08-06-ws-f-acceptance-run.md |
| standard |   944 | 2026-08-06-ws-f2-acceptance-finalization.md |
| standard |  1694 | 2026-08-06-ws-g2-live-visualization.md |
| standard |  1310 | 2026-08-06-ws-g3-completion-and-verification.md |
| standard |  1209 | 2026-08-06-ws-g4-completion-and-tower-relay.md |
| standard |  1414 | 2026-08-06-ws-i-closure.md |
| flash    |  1488 | 2026-08-06-ws-j-finalization.md |
| standard |  2361 | 2026-08-06-ws-k-final-handoff.md |
| standard |  1281 | 2026-08-06-ws-m-cockpit-finalization.md |
| standard |  1164 | 2026-08-06-ws-o-final-verification.md |
| flash    |  1734 | 2026-08-07-cairn-verification.md |
| standard |  1452 | 2026-08-07-engine-overload.md |
| standard |  1785 | 2026-08-07-fringe-first-design.md |

## Boundary cases (hand-checked)

- **ACK episode** (2026-08-05-passive-telemetry-sink.md) → **flash** (pinned test):
  "You are a passive telemetry sink. Reply with exactly the word ACK…" — role brief
  + echo; the identity atom it once minted ("The system is a passive telemetry
  sink, with no agency…") would today be suppressed by the identity bar.
- **genesis-archaeology** (8.05k chars) → **standard** (pinned test): authored
  archaeology with 29 tellings; length alone gates it out of flash.
- **verdict-hook-validation-3** → **flash** via Signal 3b: the transcript is
  "The verdict hook works." twice — an identical-quote echo is a one-token test
  regardless of which side carried the instruction spelling.
- **hello-world-write** (prose rendition, no labeled turns) → **flash** via the
  transcript-head probe: "Write exactly 'hello world' to /tmp/gh-test.txt" appears
  in the opening paragraph.
- **ws-b-execution** ("The contract binds. Execute.") → **flash** via the
  contract-binds role-brief pattern. An "I am the WS-B worker" identity class
  would be suppressed today.
- **ws-c-acceptance-run** (the "I am the WS-C worker" source) → **flash** via the
  role brief; the role-brief identity atom is now barred at the tap.
- **tower-gate / tower-silence** (618/621 chars, 1 pair) → **standard**: short +
  single pair, but the user turn is a real finding, not an instruction-echo —
  proves length alone never flashes.
- **instrument-over-model / water-as-negative-mold** → **standard**: substantive
  new findings regardless of their short bodies.
- **e-is-live** (742 chars, 1 pair) → **standard**: a state query ("What is the
  current arc… Answer from your injected memory context only") with a real answer,
  not an echo contract.
- **neural-avalanche-integration** (2,638 chars) → **standard** despite its
  "You are the SELECTOR" framing — over FLASH_BODY_MAX; a genuine multi-agent
  design session with synthesized skill content is metered full.
- **criticality-matrix-pass-1** → **flash** via "Execute the brief at … / Write
  your complete output to …": a one-shot delegated run with a terminal directive
  ("Then stop."), not a design session.

## Notes on the report table

- The table is emitted by the shipped classifier at report time; counts are
  self-consistent with `bun test src/stack.test.ts`.
- Flash grains deposit via `grain: 0.25` on the stack event; `foldWeights`
  multiplies by `ev.grain ?? 1`. Stack remains the only decay-eligibility
  event regardless of grain (verified in test).
- Identity-bar obs event: `ok` summary "identity candidate suppressed: flash
  exposure", context carrying episode + suppressed claim excerpts (Law 9).
