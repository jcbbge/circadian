# MIND-SPEC v.next — Population Memory

This one page is the whole design. If a change doesn't fit on this page, the
change is wrong (Doctrine[1]: the cliff is complexity accretion).

## The five sentences

1. Beliefs are immutable weighted atoms.
2. Recurrence bumps weight instead of adding copies.
3. Forgetting is a nightly multiply.
4. `SELF.md` is a deterministic render of the top of the population.
5. The model compares atoms — it never composes the document.

## The atom — `mind/beliefs/<id>.md`, one belief per file, never edited

- **id** = first 12 hex of sha256(claim, whitespace-normalized). Identity is content.
- **Fixed slots, rejected by shape at parse (no validator prose):**
  `kind:` identity | doctrine | motif | agreement (maps 1:1 to the v1 SELF.md sections)
  `claim:` ≤280 chars — the belief, one telling
  `why:` the why-chain (Law 5: ash banned, structurally)
  `quote:` ≥1 verbatim quote + `source:` episode filename — the quote MUST appear
  verbatim in that episode or the atom is rejected at extraction (counterfeits
  impossible at rest)
  `[ep:YYYY-MM-DD]` origin stamps — zoom resolves every atom to its episode via git
- Weight and status are NOT in the file. The file is immutable, forever.

## The ledger — `mind/beliefs.jsonl`, append-only (the digested.jsonl pattern)

One JSON object per line; malformed lines skipped, never fatal. Events:
- `{"ev":"stack","atom":<id>,"ep":<episode>,"ts":…}` — birth or recurrence: weight +1.
  Adding and merging are the same operation; merge-then-readd is inexpressible.
- `{"ev":"decay","factor":0.95,"ts":…}` — nightly, one line, multiplies every active atom.
- `{"ev":"potentiate","atom":<id>,"ts":…}` — a rendered line propagated (scoreboard
  `propagated`): weight +1. Motion is the metric (Law 6).
- `{"ev":"supersede","winner":<id>,"loser":<id>,"ts":…}` — loser's current weight
  TRANSFERS to winner; loser keeps its file and lineage, status becomes
  superseded-by:<winner>. Zoom shows the old telling forever.

**Weight is never stored — it is fold(ledger), deterministic.** Defaults (knobs):
birth 1, bump +1, decay ×0.95/night, RENDER_FLOOR 0.5. A never-bumped singleton
renders ~13 nights, then defocuses; its file stays (defocus, never delete); one
propagation brings it back.

## The stacker — the only writer of atoms

episode → EXTRACT (≤5 candidate atoms, fixed shape) → dedupe pipeline:
exact content-hash → token-overlap ≥ threshold auto-SAME (ltp.ts jaccard, 0.3) →
only the borderline band reaches COMPARE. Model surface is exactly two calls,
both via llm.ts, local only: **EXTRACT** (episode → candidates) and **COMPARE**
(two claims → one token: SAME | DISTINCT | SUPERSEDES(A>B|B>A)). The engine does
all arithmetic; the model never holds the pen.

## The render — `SELF.md = fold(beliefs/, ledger)`

Deterministic, byte-identical re-runs, no clock in the fold. Four v1 sections,
folded by kind; within a section, atoms sort weight desc (tiebreak: id lex),
strongest telling verbatim with its `[ep:]` stamps. v1 token targets become
**render budgets**: selection stops at the budget — atom text is never truncated.
Invariant (asserted in `bun test` and after every REM): render(archive) ==
committed SELF.md, byte-identical.

## The REM payload

stack(new episodes) → decay → render → greeting. Commit body auto-records the
"sank below floor" list (compost.md is frozen as historical; git is the archive).
Render-time health checks: stutter-detect, counterfeit-quote assert.

## What survives v1 unchanged

Laws 1, 2, 3, 7, 9 verbatim. Episodes, GRAZE, SLEEP drafting, WAKE injection,
NOW.md, USER.md, greeting protocol (Law 8), hook wiring. Law 4 lives on as the
render budget; Law 5 as the atom shape; Law 6 as potentiation.

## Fitness — silence is a verdict

A greeting whose items propagate earns an implicit `ok` (appended at SLEEP,
`source:"propagation"`). The only manual act is `--greet-bad "<reason>"` (counts
double against the streak). Kill switch: 7 consecutive greetings with zero
propagation and no explicit ok surfaces the decommission question. The statusline
strip is the contract (R11): wake age · worldview tokens · population count ·
last REM (stacked/bumped/sank) · verdict streak · loud degraded marker. Every
organ reports into it; a process that runs without moving the strip is in
violation of Law 9.
