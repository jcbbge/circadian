# W1 — Homeostatic renormalization: decay becomes competitive

Label: `w1-renorm`. Contract: `briefs/wave-optics/CONTRACT.md` (binding).

## Mission

The nightly decay (`{"ev":"decay","factor":0.95}`) multiplies every active
atom uniformly. Uniform decay preserves rank order forever: the top atom
(weight ~189, id `e8b0c351543c`) can never be displaced except by its own
~116 untouched nights, which it will never get because wake re-injects it and
sessions re-confirm it (Hebbian runaway, no homeostasis). Real neural
systems pair LTP with **synaptic scaling**: total weight is normalized, so
strengthening one belief costs the others. Implement that.

## Pre-verified facts (acquired 2026-08-09 by the coordinator)

- Weight is never stored; it is `fold(ledger)` — deterministic. Ledger:
  `mind/beliefs.jsonl`, events stack/decay/potentiate/supersede
  (MIND-SPEC "The ledger").
- The canonical fold is `foldWeights` in `src/atoms.ts` (verified:
  `src/decay.ts:37` imports it; decay emits `{ev:"decay",factor:DECAY_FACTOR}`
  at `decay.ts:219`, `DECAY_FACTOR = 0.95` at `decay.ts:50`). Current
  population: 235 atoms, 165 above RENDER_FLOOR 0.5, 23 decay nights in the
  ledger, top weight 189.65.
- MIND-SPEC says: "Weight is never stored — it is fold(ledger)" and knobs
  are "birth 1, bump +1, decay ×0.95/night, RENDER_FLOOR 0.5."

## Design (the coordinator's decision — implement, refine details freely)

Add a new ledger event, emitted nightly by the decay step AFTER the decay
line:

```
{"ev":"renorm","target":<TOTAL_WEIGHT_TARGET>,"ts":...}
```

Fold semantics: when a `renorm` line is folded, scale every active atom's
weight by `target / currentTotal` iff `currentTotal > target`. (Never scale
UP — renorm is a ceiling, not a thermostat; a young sparse mind stays
untouched.) `TOTAL_WEIGHT_TARGET` is a knob in code; set it initially to
**400** (current total is materially above this; the effect on today's
population must be shown in your report, not guessed).

Properties this must preserve (test them):
- Determinism: fold is pure; byte-identical re-runs (render invariant).
- Append-only: no file rewrites, no stored weights.
- Rank order within a single renorm is preserved (it's a uniform scale) —
  the competitive pressure comes from the INTERACTION with stack/potentiate:
  new earnings are worth relatively more when the total is capped.
- Backward compatibility: ledgers with no renorm lines fold exactly as
  before (all 795 existing stack events, 23 decay lines).

## Partition (writable)

- `src/decay.ts` (emit renorm nightly; knob `TOTAL_WEIGHT_TARGET`)
- `src/decay.test.ts`
- `src/atoms.ts` — `foldWeights` gains the `renorm` event case (+ the
  `LedgerEvent` type). `src/atoms.test.ts` for its tests.
- `mind/MIND-SPEC.md` — ONLY the ledger-events list and knobs line (add
  `renorm`; one sentence: "nightly ceiling: total active weight scales down
  to target; never scales up"). Keep the one-page law.
- `briefs/wave-optics/proposals/W1-report.md` — your analysis: fold the real
  ledger with renorm@400 active and show the top-15 weights before/after,
  and how many atoms cross RENDER_FLOOR.

## Done-when

- `bun test src/decay.test.ts` green; `bun test src/render.test.ts` green.
- Real-ledger before/after table exists in W1-report.md (computed, not
  estimated).
- Renorm emitted by the nightly path, folded by the canonical fold,
  spec updated, no stored weights anywhere.
