# MIND-SPEC.md — Circadian Memory Substrate

This is the contract for `~/circadian/mind`. It is the design authority for
every process that reads or writes this repo (wake, graze, sleep, rem,
status, zoom, replay). If a process's behavior conflicts with this document,
the process is wrong.

The mind repo is a plain git repository. It has no remote, ever. `USER.md` is
private relational memory and never leaves this machine.

This one page is the whole design. If a change doesn't fit on this page, the
change is wrong (Doctrine[1]: the cliff is complexity accretion). This is the
population-memory spec, authoritative since the 2026-07-28 switchover
(commit `d045196`); it supersedes the v1 document-editing spec, which lives
in git history. The full blueprint is `docs/POPULATION-MEMORY.md`.

## The five sentences

1. Beliefs are immutable weighted atoms.
2. Recurrence bumps weight instead of adding copies.
3. Forgetting is a nightly multiply.
4. `SELF.md` is a deterministic render of the top of the population.
5. The model compares atoms — it never composes the document.

## The Nine Laws

1. **Storage dumb, metabolism smart.** The mind is plain markdown in git;
   all intelligence lives in the processes around it. No database sits in
   the critical path of reading or writing the mind.
2. **Push, not pull.** Memory is injected at session start; the working
   agent has zero memory duties. The transcript itself is the deposit.
3. **Load-bearing or dead.** Every wake opens with a greeting composed from
   memory, placed in the user's face. If it isn't good enough to say out
   loud, it isn't earning its keep.
4. **Finite body.** Size targets force excretion. v1's token targets live on
   as render budgets and whole-file caps — SOFT targets, never walls
   (chars/4 = tokens; only a gross runaway past 1.75x fails loudly; silent
   truncation is never permitted).
5. **Ash banned.** Retained conclusions carry their why-chain and verbatim
   quotes — enforced structurally by the atom shape below.
6. **Motion is the metric.** Propagation re-potentiates an atom; a
   never-moving atom decays below the render floor. Memory that sits inert
   is not memory, it is inventory.
7. **The mind survives infra death.** Wake is file reads only. No step in
   WAKE may depend on a running service.
8. **Anchor-aware.** Greetings orient to the work — the current arc, the
   live tension, the next move — never to the memory system itself.
9. **Nothing silent.** Every process emits context-bound events to
   `logs/circadian.events.jsonl` via `src/obs.ts` (four-word outcomes:
   ok | idle | degraded | failed; degraded/failed carry cause +
   next_action). See `docs/OBSERVABILITY.md`. A process that runs and
   produces no event is operating silently — the cardinal sin.

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

stack(new episodes) → decay → render → greeting. An episode is new iff its
content hash is absent from `mind/digested.jsonl` (content-keyed, rename-proof;
lines shaped `{ts, hash, filename, disposition}`, malformed lines skipped —
`src/rem-popmem.ts recordDigested`). Commit subject convention (exact):

```
rem: <date> — stacked N, bumped M, sank K, population P
```

The commit body auto-records the "sank below floor" list (compost.md is frozen
as historical; git is the archive). Render-time health checks: stutter-detect,
counterfeit-quote assert.

## What survives v1 unchanged

Episodes; GRAZE (in-session checkpoint metabolizer → `mind/meals/`, folded by
SLEEP at session end); SLEEP drafting; WAKE injection (~15k-token payload cap,
loud telemetry on overage); NOW.md; USER.md; the greeting protocol (≤3 lines —
arc, flight plan, one live tension; a "Last sleep" older than 48h prepends an
explicit staleness warning at WAKE); hook wiring. Whole-file token caps
(SELF 6k / USER 2k / NOW 3k / compost 1k) and per-section render budgets
(identity 600 / doctrine 3400 / motif 800 / agreement 1200) are knobs in code —
`src/status.ts` CAPS, `src/render.ts` DEFAULT_BUDGETS; the scoreboard schema is
the `ScoreEvent` interface in `src/status.ts`. For every number, code is truth.

## Fitness — silence is a verdict

A greeting whose items propagate earns an implicit `ok` (appended at SLEEP,
`source:"propagation"`). The only manual act is `--greet-bad "<reason>"` (counts
double against the streak). Kill switch: 7 consecutive greetings with zero
propagation and no explicit ok surfaces the decommission question. The statusline
strip is the contract (R11): wake age · worldview tokens · population count ·
last REM (stacked/bumped/sank) · verdict streak · loud degraded marker. Every
organ reports into it; a process that runs without moving the strip is in
violation of Law 9.
