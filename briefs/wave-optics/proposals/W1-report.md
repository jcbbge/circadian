# W1 report — homeostatic renormalization (`renorm`)

Label: `w1-renorm`. Computed 2026-08-09 against the real ledger
(`mind/beliefs.jsonl`, 1461 lines: 795 stack, 597 potentiate, 46 supersede,
23 decay) and the real population (`mind/beliefs/`, 235 atoms). Every number
below is `fold(ledger)` output from the shipped `foldWeights` — computed,
not estimated.

## What shipped

- `foldWeights` (src/atoms.ts) folds a new event
  `{"ev":"renorm","target":<n>,"ts":…}`: if the total weight of **active**
  atoms exceeds `target`, every active atom scales by `target/total`.
  Never scales up (ceiling, not thermostat); superseded atoms are excluded
  from the total and never touched; missing/non-positive/non-finite `target`
  is a no-op (the malformed-line tolerance).
- `src/decay.ts` emits exactly one renorm line per nightly run, AFTER the
  decay line. Knob: `TOTAL_WEIGHT_TARGET = 400` (exported).
- `mind/MIND-SPEC.md`: renorm added to the ledger-events list; knobs line now
  reads "decay ×0.95/night, renorm ceiling 400".

## Effect on today's population (renorm@400, one fold)

Fold state before = `foldWeights(realLedger)`; after = same ledger plus one
`{"ev":"renorm","target":400}` line.

| metric | before | after |
|---|---|---|
| active atoms | 189 | 189 |
| total active weight | 873.4758 | 400.0000 |
| scale applied | — | 0.457941 |
| atoms ≥ RENDER_FLOOR (0.5) | 163 | 84 |
| atoms crossing below floor | — | **79** |

The first renorm is a one-time haircut: the population is 2.18× over the
ceiling, so everything active scales by ~0.458. After this settling night,
nightly renorms only trim the overshoot created by that day's
stack/potentiate earnings — steady-state scale approaches 1.0 and the cap
becomes purely competitive: every +1 someone earns is paid for pro-rata by
everyone else.

## Top-15 active atoms, before → after

| # | atom id | weight before | weight after |
|---|---|---|---|
| 1 | e8b0c351543c | 189.6491 | 86.8480 |
| 2 | 0bf353ba44b0 | 49.0055 | 22.4416 |
| 3 | 6ed0b774ec2a | 31.0609 | 14.2240 |
| 4 | 4aa467268930 | 27.9451 | 12.7972 |
| 5 | 494fc44e6b05 | 26.7164 | 12.2345 |
| 6 | 373341d1cb0c | 21.5721 | 9.8788 |
| 7 | 66480d39b201 | 19.4504 | 8.9071 |
| 8 | a68e8fb5f11d | 16.2489 | 7.4410 |
| 9 | 45bc2cd4294e | 13.5176 | 6.1903 |
| 10 | b132d4bd6034 | 13.2564 | 6.0706 |
| 11 | 32bd0d6b1e3a | 12.3714 | 5.6654 |
| 12 | 83e65cb841d0 | 12.2291 | 5.6002 |
| 13 | eeadb9dde05f | 11.5186 | 5.2748 |
| 14 | 67d1ffdde9e8 | 11.4689 | 5.2521 |
| 15 | 8736fbdf23a5 | 11.0799 | 5.0740 |

Rank order is untouched (uniform scale), as required. The displacement
mechanism is temporal, not intra-event: the top atom now sits at ~86.8
instead of ~189.6, so a challenger earning steadily under the cap closes the
gap in less than half the nights — and every night the champion is NOT
re-confirmed, its share of the fixed 400 budget shrinks in favor of atoms
that did move. Hebbian runaway is now paid for.

## The 79 floor-crossers

All 79 atoms pushed below RENDER_FLOOR by the first renorm were already in
the decay tail — weights 0.61–0.97, i.e. singletons (born at 1.0) that had
only ever decayed, never been re-stacked or propagated. Renorm@400
accelerates exactly the cohort Law 6 targets ("a never-moving atom decays
below the render floor"): under pure decay they had 5–13 nights of runway
left (0.6147 crosses on the 5th further decay, 0.9715 on the 13th); the
haircut spends it now. None had weight ≥ 1 before the fold. Files
stay on disk (defocus, never delete); one propagation brings any of them
back.

## Properties verified by tests (all green)

`bun test src/decay.test.ts src/atoms.test.ts src/render.test.ts`:
70 pass / 0 fail (133 expect calls).

- Determinism: same renorm-bearing ledger folds to identical states twice;
  render invariant suite green.
- Append-only: a second nightly run's ledger bytes are an exact
  byte-prefix-extension of the first's; `--dry-run` appends nothing.
- Ceiling semantics: total ≤ target folds identically to the renorm-free
  ledger (young sparse mind untouched); total > target lands at exactly
  the target.
- Rank order preserved within one renorm; superseded atoms excluded.
- Backward compatibility: ledgers with no renorm lines fold exactly as
  before (existing fixtures unchanged and passing).
- Competitive interaction: a post-renorm stack is worth relatively more
  against a capped champion (0.5 ratio vs 0.25 uncapped, pinned in test).

## Knob note for the coordinator

The brief's pre-verified "165 above RENDER_FLOOR" measured 163 at my fold
time (the ledger moved between the coordinator's read and mine; population
235 and 23 decay nights match). At target 400 the render loses 79 of 163
rendered atoms on the settling night — a deliberate cull of the inert tail,
but a visible one. If a gentler landing is wanted, a higher initial target
(e.g. 600, scale ≈ 0.687, far fewer crossers) stepped down over a few nights
would work with zero code change: the knob is one exported const.
