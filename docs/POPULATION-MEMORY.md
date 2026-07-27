# COORDINATED — Circadian Population Memory (kill the editor, keep the mind)

> Mode: COORDINATED — large, parallelizable across ~8 workstreams, explicitly intended
> for an orchestrator spawning parallel async subagents under Tower coordination.

## 1. Executive Objective

Replace Circadian's worldview-editing layer with **population memory**: beliefs are
immutable weighted atoms; recurrence bumps weight instead of adding copies; forgetting
is a nightly multiplicative decay; `SELF.md` becomes a deterministic **render** of the
population, never a document anyone edits; the LLM's role shrinks from document
surgeon to bounded extractor + pairwise comparator. Success is **net code deletion**
(the metabolism ends smaller than it started) and a worldview whose every belief is
verifiable down to its source episode.

Five sentences that ARE the design (preserve verbatim in MIND-SPEC.v.next):
1. Beliefs are immutable weighted atoms.
2. Recurrence bumps weight instead of adding copies.
3. Forgetting is a nightly multiply.
4. `SELF.md` is a deterministic render of the top of the population.
5. The model compares atoms — it never composes the document.

## 2. Background / Context

Circadian (`~/circadian`) is a file-based memory substrate: plain markdown in a
private git repo (`~/circadian/mind`, no remote ever), five processes (wake / graze /
live / sleep / rem), design contract at `templates/MIND-SPEC.md`. It is the sixth
iteration; the previous five died of complexity accretion ("the cliff", Doctrine[1]).

The week of 2026-07-26/27 produced, with telemetry receipts in
`logs/circadian.events.jsonl`, a **taxonomy of self-editing-memory pathologies**:

- **Stutter** — the same belief absorbed as multiple doctrine entries (observed: one
  belief as Doctrine 8/16/17 + duplicate motifs).
- **The photocopier** — the most-repeated phrase in context statistically dominates
  everything the model rewrites; consolidation amplifies noise instead of damping it
  (observed: DEEPEN injected live-status prose into unrelated Doctrine[1]).
- **Merge-then-readd** — the model merges Doctrine[4] into [3], then re-ADDs the
  merged belief in the same wave (observed with Qwen3-30B; redundancy 12.1%→24.2%).
- **The poison feed** — composted episodes carry `taught -> absorbed-where:
  SELF.md Doctrine[N]` footers whose N goes stale after renumbering; fed back via the
  prompt (and via compost.md's "lesson lives at" lines), they taught every wave to
  DEEPEN phantom entries (observed: `DEEPEN Doctrine[5]` ×3 across waves and models).
- **Forged provenance** — fabricated quote-formatted text and false compost addresses
  entering the permanent record.

Root finding (validated across a 6-domain sweep — astrophoto stacking, synaptic
homeostasis, git content-addressing, oral-formulaic meter, common-law/Talmudic
precedent, immunological clonal selection): **the pathologies are properties of
handing a generator a pen.** Durable memory systems have no editor — they have a
population, a decay constant, and a reader. Every guard built this week was a
balancing loop bolted onto a reinforcing loop that the mutable-document paradigm
itself creates. This program removes the paradigm; the guards become unnecessary by
construction.

Design lineage note: this is also the deepest property of VictorTaelin's OptMem
(append-only atoms below, computed view above) arriving in Circadian's biology — and
the mind's own July-22 ACP episodes state the principle ("replaces fragile, heuristic
parsing with structured, typed events"). This is the mind applying its own lesson to
itself.

## 3. Reuse / What Already Exists

Surveyed live on 2026-07-27 (files read this session; commits cited are real).

**REUSE / EXTEND**
- `src/ltp.ts` (145 LOC) — `significantTokens` / `jaccard` / `clusterEpisodes` +
  overlap-coefficient variant in `mutate.ts detectSelfStutter`. Becomes the near-dup
  detector over ATOMS (same instrument, new target). Threshold history: 0.3 tuned
  against the real 2026-07-24 flood.
- `src/zoom.ts` (298 LOC, built 2026-07-27) — provenance drill from `[ep:]` stamps
  through git (live + composted episodes). Extend: resolve atoms → episodes.
- `src/replay.ts` (501 LOC, built 2026-07-27) — sandboxed replay harness
  (`--run --limit N`, `--stutter`), genesis shim, 193-episode discovery (4 live at the
  time, 189 git-recovered). Becomes the gauntlet runner for WS-G.
- `src/status.ts --line` (wired into `~/.claude/settings.json` SessionStart +
  statusLine on 2026-07-27) — vitals strip. Extend with population vitals.
- `src/obs.ts` — Law 9 event ledger. Extend the `CircadianProcess` union (pattern:
  the 2026-07-27 one-line edit adding `"zoom" | "replay"`).
- `src/llm.ts` — local-LLM client; default model now
  `mlx-community/Qwen3-30B-A3B-Instruct-2507-4bit` (flipped 2026-07-27, head-to-head
  documented at the `MODEL` constant). Comparator/extractor calls go through this.
- `src/sleep.ts` (977 LOC) / `src/graze.ts` / `src/wake.ts` — UNCHANGED in role.
  Episodes stay the deposit format. Wake stays file-reads-only (Law 7).
- The mind git repo — the lossless archive; `digested.jsonl` content-hash ledger
  pattern (rename-proof, corruption-tolerant) is the model for atom ledgers.
- From `mutate.ts` (926 LOC, retirement-bound): extract and keep THREE utilities —
  `makeStampGuard` origin-date logic, `counterfeitQuotes()` (as an assert at
  extraction time), `detectSelfStutter()` (as a render-time health check). The rest
  retires.
- `scoreboard.jsonl` + greeting verdict flags (`status.ts --greet-ok/--greet-bad`,
  kill switch = 7 consecutive bad) — the fitness function. Reused as-is; re-armed in
  WS-0.

**BUILD NEW**
- `mind/beliefs/` atom store + atom schema (one atom per file, content-hash identity).
- The stacker (episode → candidate atoms → hash/near-dup/comparator → weight bumps).
- The renderer (`SELF.md = fold(beliefs/)`, deterministic, byte-identical).
- Decay + re-potentiation step (nightly multiply; propagation bumps).
- Migration script (current `SELF.md`, 9 doctrine entries at mind commit `187bb80`,
  → seed atoms).
- `templates/MIND-SPEC.md` the population memory (ONE PAGE, hard cap).

**DO NOT REBUILD**
- The episode format, SLEEP/GRAZE/WAKE, the hooks wiring in `~/.claude/settings.json`,
  the mind git repo, `zoom`/`replay`/vitals, the launchd REM schedule (the job stays;
  its payload changes).
- Do NOT extend the mutation grammar or `rem.ts`'s omnibus prompt — they are the
  dross (rem.ts 1,715 LOC + mutate.ts 926 LOC ≈ 28% of the 9,466-LOC src tree).
  N-way MERGE (added 2026-07-27) retires with them.

## 4. Problem Statement

The current REM rewrites a mutable prose document through an LLM-emitted mutation
grammar. Every failure this week (§2) is a non-idempotent operation on shared mutable
state. Guard-stacking is structurally endless (each guard revealed the next disease),
violates the anti-accretion doctrine, and the fitness function that would arbitrate
any of it (greeting verdicts) has been silent since 2026-07-23 (4 verdicts ever).

## 5. Scope

- The worldview layer: atom store, stacker, renderer, decay, migration, REM the population memory
  payload, spec, deletion of the editor stack, gauntlet verification.
- Fitness-function re-arm (verdict UX).
- Vitals extension (population health).

## 6. Non-Goals

- No embeddings, no vector DB, no database of any kind (Law 1: storage dumb).
- No cloud LLM (privacy: mind content never leaves the machine; the comparator task
  makes the local 30B overqualified — the escalation-tier question is DISSOLVED, not
  deferred).
- No changes to episodes format, GRAZE, SLEEP drafting, or hook wiring.
- Not in this program: fleet digestion, the constellation pane compiler
  (`~/constellation/docs/PANE-COMPILER-PRD.md`), USER.md/NOW.md conversion to atoms
  (later-program candidates).
- No LoRA/fine-tuning work (the distillation flywheel is a later program; DO start
  retaining wave transcripts — one line in scope: keep raw stacker I/O in logs/).

## 7. Requirements

- R1 Atom immutability: a belief file, once written, is never edited. Weight and
  status changes are separate ledger appends (`mind/beliefs.jsonl` or per-atom
  sidecar — WS-A decides, one page constraint applies).
- R2 Idempotence: stacking an already-held belief = weight bump. Adding and merging
  are the same operation. Merge-then-readd must be INEXPRESSIBLE.
- R3 Atom shape (the meter): fixed slots — claim (≤280 chars), why-chain, ≥1 verbatim
  quote + source episode filename, `[ep:]` origin dates, weight, status
  (active | superseded-by:<hash>). Malformed = rejected by shape at parse, no
  validator prose.
- R4 Renderer: `SELF.md = fold(beliefs/)` — deterministic, byte-identical re-runs,
  section token targets honored by selecting top-weight atoms (never truncating atom
  text), strongest telling verbatim. Render carries each atom's `[ep:]` stamps so
  zoom keeps working from the rendered page.
- R5 Model surface: exactly two call shapes, both through `llm.ts`:
  (a) EXTRACT: one episode → ≤5 candidate atoms in the fixed shape;
  (b) COMPARE: two claims → one token: SAME | DISTINCT | SUPERSEDES(A>B | B>A).
  Deterministic layers run first: exact content-hash, then token-overlap ≥ threshold
  auto-SAME; the model sees only the borderline band.
- R6 Decay: nightly weight ×= DECAY (default 0.95, a config knob, not a wall);
  propagation events (already in scoreboard `propagated` arrays) re-potentiate the
  atoms whose render lines propagated. Below RENDER_FLOOR, an atom leaves the render;
  the file stays (defocus, never delete).
- R7 Fitness — **silence is a verdict**: a greeting whose arc/flight-plan items
  propagate into the session it opened (Law 6 data, already recorded in scoreboard
  `propagated` arrays) earns an implicit `ok` verdict, appended at SLEEP with
  `source: "propagation"`. The ONLY manual act is `--greet-bad "<reason>"` — rare,
  high-signal, human. The statusline shows the streak ambiently ("trust is ambient,
  not narrated" — the existing working agreement). Kill switch restated: 7
  consecutive greetings with zero propagation and no explicit ok surfaces the
  decommission question; any explicit bad counts double-weight against the streak.
  Rationale: the positive path must cost zero — a memory system that asks to be
  graded daily fails the lovability bar; one that notices it was useful passes it.
- R8 Invariant test (replaces replay-divergence as a metric): render(archive) ==
  committed SELF.md, byte-identical, asserted in the test suite and after every REM.
- R9 Law 9 observability: stacker/renderer/decay each emit context-bound events
  (extend `obs.ts` union); silent operation remains the cardinal sin.
- R10 Immune-system size becomes a plotted vital: metabolism LOC + guard count,
  emitted alongside worldview tokens.
- R11 **The statusline is the contract — NON-NEGOTIABLE.** The existing
  `status.ts --line` strip (SessionStart + statusLine, wired 2026-07-27) is never
  removed, never degraded, and every new organ reports into it. At any glance, with
  zero commands, the user can answer "is it working": wake age · worldview tokens ·
  graze count · session Δ · last REM + result (stacked N / bumped M / sank K) ·
  atom population count · verdict streak (incl. implicit-ok source) · and a loud
  marker when anything is degraded/failed in the obs ledger since last glance.
  Implicit verdicts change what the user must DO (nothing); they change nothing
  about what the user can SEE (everything). A the population memory process that runs without moving
  the statusline is in violation of this requirement and Law 9 both. Acceptance
  for every workstream includes: its activity is visible in the strip.

## 8. Constraints

- MIND-SPEC.v.next fits ONE page. If it doesn't fit, the design is wrong (Doctrine[1]).
- Net LOC of src/ must END BELOW the current 9,466 (retiring rem.ts+mutate.ts's
  ~2,641 funds the new organs several times over; budget for all new code: <1,500).
- Test floor: currently 109 tests, 108 pass + 1 PRE-EXISTING fail
  (`usermutate.test.ts:205`, missing git fixture — not this program's to fix). Never
  regress below 108 pass; every workstream adds its own tests.
- The LIVE mind repo (`~/circadian/mind`) is READ-ONLY for every workstream except
  WS-F (switchover), which is sequential, gated, and git-committed. All metabolism
  runs before WS-F happen in sandboxes via `CIRCADIAN_HOME` override (the `replay.ts`
  pattern — proven this week, zero live mutations across ~10 sandbox waves).
- Local model only; `llm.ts` preflight/retry conventions apply; remember the server's
  `finish_reason` always reads "stop" (truncation is undetectable — structural
  validation is the only defense; documented in `~/dotfiles/launchagents/LOCALLLM.md`).
- Style: match existing src/ conventions — bun + TypeScript, one process per file,
  doctrine-citing header comments, real-fixture tests (no mocks of code under test;
  living-document fixtures pin to mind commits, the `zoom.test.ts` pattern pinned at
  `6271e09`).
- Commits follow `~/.claude/rules/commit-convention.md` (PHASE/DONE/TODO lines).

## 9. Dependencies

- WS-A (spec) gates B, C, D, E (they implement it).
- WS-B (atoms + renderer) gates E (migration writes atoms) and C's output shape.
- WS-F (switchover) requires B + C + D + E complete and G's sandbox pass green.
- WS-H (deletion) requires F stable (one clean scheduled REM the population memory run on the live mind).
- WS-0 (fitness) and WS-G harness prep depend on nothing — start immediately.

## 10. Assumptions

- The 30B (`Qwen3-30B-A3B-Instruct-2507-4bit`, served, smoke-tested 2026-07-27)
  handles EXTRACT and COMPARE; if COMPARE quality disappoints, the fallback is MORE
  deterministic band (widen auto-SAME), never a bigger model.
- Episode census ~193+ (grows daily; `replay.ts` discovery is authoritative).
- `sleep.ts` keeps producing episodes in the current format throughout the program.
- The stutter-detect / counterfeit-quote utilities keep working as render-time health
  checks after extraction from mutate.ts.

## 11. Ambiguities / Risks

- SUPERSEDES semantics: does the superseded atom's weight transfer, halve, or freeze?
  Default: transfer to the superseding atom; the superseded atom keeps status +
  lineage. Flagged for WS-A to finalize on the spec page.
- Render section mapping: v1 sections (Who I am / Doctrine / Motifs / How we work)
  map to atom kinds. Default: an atom carries `kind: doctrine | motif | agreement |
  identity`; renderer folds by kind. WS-A finalizes.
- Migration fidelity risk: current SELF.md (9 entries, mind commit `187bb80`)
  contains smeared/duplicated text (redundancy warnings in scoreboard). Migration
  must NOT launder smear into seed atoms — WS-E uses the earliest clean telling from
  git history (zoom finds it), not the current smeared body, when they differ.
- Decay-rate risk: 0.95/night with twice-daily propagation may starve rarely-woken
  arcs. Mitigation: RENDER_FLOOR is a render threshold, not deletion; a starved atom
  returns the moment it propagates once.
- DECIDED — verdict UX: implicit-ok via propagation + explicit `--greet-bad` only +
  statusline streak segment (see R7). No footer command to copy; the positive path
  costs zero.
- DECIDED — the three live episodes (incl. `2026-07-27-the-stuttering-mind.md`) are
  HELD un-digested as the switchover's first real meal, and the v1 absorb freeze moves UP from
  WS-F to WS-0 (program start): v1 REM must not keep mutating SELF.md while
  migration prepares seed atoms from it (moving-target risk), and the first live the population memory
  digestion doubles as the acceptance demo — the system built to end stuttering,
  eating the episode named after the stutter.
- DECIDED — supersedes semantics: weight TRANSFERS to the superseding atom
  (evidence that the belief-area is load-bearing carries forward); the superseded
  atom keeps its file, lineage, and `superseded-by:<hash>` status. Comparator emits
  one token; the engine does arithmetic; zoom shows the old telling forever.
- DECIDED — atom kinds: `identity | doctrine | motif | agreement`, mapping 1:1 to
  the v1 sections, so the rendered SELF.md diff reads like the document everyone
  already knows and the migration review is a side-by-side, not a puzzle.
- DECIDED — decay numbers: weight starts at 1, each recurrence or propagation
  bump +1, nightly ×0.95, RENDER_FLOOR 0.5. Computed consequence: an unused
  singleton belief renders for ~13 nights before defocusing; one propagation
  resets its runway. All three are config knobs; these are the shipped defaults.

## 12. Workstream Decomposition

- **WS-0 — Fitness re-arm + freeze + THE DAILY READING** (tiny, first): (a) the
  daily scorecard per §17 — expected/actual/verdict lines + yesterday's prediction
  HELD/BROKE, emitted at first wake of each day, starting with build-phase metrics
  on day one; (b) implicit-ok verdict wiring per R7 (SLEEP appends
  `source:"propagation"` ok when greeting items propagated; statusline streak
  segment); (c) v1 REM absorb path paused behind a flag — SLEEP keeps drafting
  episodes, WAKE keeps injecting the frozen SELF.md (Law 7 intact), the backlog
  accumulates as the switchover's shakedown meal.
- **WS-A — MIND-SPEC.v.next** (one page, sequential gate): the five sentences, atom
  shape, ledger choice, supersedes + kind decisions (§11 defaults unless overturned),
  what survives from v1 (Laws 1,2,3,7,9; kill switch; targets-as-render-budget).
- **WS-B — Atom store + renderer**: `src/atoms.ts` (parse/write/ledger) +
  `src/render.ts` (fold). Pure, deterministic, no LLM, no clock in the fold. Tests:
  byte-identical re-render; shape rejection; targets honored.
- **WS-C — Stacker**: `src/stack.ts` — EXTRACT + hash dedupe + overlap band +
  COMPARE via `llm.ts`; counterfeit-quote assert at extraction (quote must appear
  verbatim in the source episode or the atom is rejected by shape). Tests against
  real episodes recovered from mind git history (the 14-flood set is the acceptance
  fixture: must yield ONE atom, weight 14).
- **WS-D — Decay + potentiation**: nightly multiply + propagation bumps read from
  scoreboard; RENDER_FLOOR; obs events; vitals extension in `status.ts --line`
  (population count, top-weight, immune-size).
- **WS-E — Migration**: `src/migrate-the population memory.ts` (or a one-shot script under `scripts/`):
  current SELF.md → seed atoms with stamps/quotes sourced from git-clean tellings;
  stutter clusters → one atom each, weight = copy count. Runs against a SANDBOX copy
  of the mind first; produces a human-review diff (rendered the population memory SELF.md vs live).
- **WS-F — Switchover** (sequential, the only live-mind writer; the absorb freeze
  is already active from WS-0): commit seed atoms + first render to the live mind;
  repoint the launchd REM payload at stack→decay→render→greeting; one supervised
  live run whose first meal is the held backlog (§11).
- **WS-G — Gauntlet**: extend `replay.ts` to drive the stacker (same sandbox
  pattern): full 193-episode run; invariant test wired into `bun test`; the
  3-at-a-time batches become regression fixtures; produce the v1-vs-the population memory rendered
  worldview comparison document.
- **WS-H — Dross deletion**: retire rem.ts editor path + mutate.ts (minus the three
  extracted utilities) + merge directives; LOC report before/after; immune-size
  vital proves net negative.

## 13. Parallel vs Sequential Execution

- Immediately, in parallel: WS-0, WS-A, WS-G(harness prep only).
- After WS-A merges: WS-B ∥ WS-C ∥ WS-D (three parallel workers, disjoint files).
- After WS-B: WS-E.
- Barrier: WS-F alone, sequential, supervised (single writer to the live mind).
- After WS-F: WS-G full run ∥ WS-H.
- Human gates: WS-A page review; WS-E diff review; WS-F go/no-go; then 7 days of
  verdicts (kill switch) decide its residence.

## 14. Agent Responsibilities

Every worker brief MUST carry (the enforce-brief hook rejects otherwise):
`## Pre-Verified Facts` (orchestrator verifies paths/commands/fixtures before
spawning — `scout` agent exists for this), a Tower section (board topic:
`popmem`; kinds: progress at checkpoints, deliverable for review artifacts,
ask_user for gate decisions) or an explicit `TOWER-WAIVED:` line for single-turn
workers, `## Tasks` with per-task `done when:`, and `## Report back with` (terse:
counts, paths, verdicts).

- Workers are Herdr panes in a `popmem-workers` tab, each in its own git
  worktree of `~/circadian` on a feature branch → merge. CRITICAL worktree caveat
  (learned 2026-07-27): `mind/` and `logs/` are untracked — absent from worktrees.
  Tests needing mind data read `~/circadian/mind` via `git -C` (read-only); any
  metabolism execution uses a `CIRCADIAN_HOME` sandbox. Never install packages in a
  worktree.
- Per-workstream done-when lives in §12; global acceptance in §16.
- Model tier: workers are execution agents on spec-complete tasks — standard tier;
  WS-A drafting deserves the top tier once.

## 15. Input / Output Contracts

- WS-A → all: the one-page spec file path + the finalized §11 decisions, posted to
  the board.
- WS-B → E/C: exported atom parse/write API (file path + function signatures posted).
- WS-C → F/G: stacker CLI (`bun src/stack.ts <episode-path>` sandbox-safe) + the
  14-flood fixture result (1 atom, weight 14) as proof.
- WS-E → F: sandbox migration diff document path (deliverable to user via Tower).
- WS-G → F: green invariant + gauntlet report path.
- All → orchestrator: branch name, test counts (must show ≥108 pass, 1 pre-existing
  fail), files touched, LOC delta.

## 16. Acceptance Criteria

- [ ] MIND-SPEC.v.next is one page and contains the five sentences verbatim.
- [ ] Stacking the 2026-07-24 14-episode flood yields exactly ONE atom, weight 14.
- [ ] Merge-then-readd is inexpressible: stacking any atom twice changes only weight
      (test asserts file count and content unchanged).
- [ ] render(beliefs/) is byte-identical across runs and equals the committed
      SELF.md (invariant in `bun test` and asserted post-REM).
- [ ] Every rendered belief zooms to a source episode through git.
- [ ] Counterfeit quotes are impossible at rest: every atom quote appears verbatim in
      its source episode (shape-rejected otherwise).
- [ ] Nightly decay runs; a never-propagated seed atom falls below RENDER_FLOOR
      within a computable number of nights; its file survives.
- [ ] src/ total LOC < 9,466 (2026-07-27 baseline) after WS-H.
- [ ] Live mind untouched by every workstream except WS-F's gated commits
      (`git -C ~/circadian/mind status --porcelain` clean in every worker report).
- [ ] The fitness loop runs without human effort: implicit-ok verdicts appear in
      scoreboard.jsonl from propagation alone; kill-switch week (7 days) completes
      with the streak intact.
- [ ] R11 holds end-to-end: the statusline strip survives every workstream, and
      after switchover a single glance shows wake · worldview · population · last
      REM result · verdict streak · degraded-event marker. Demo: kill the local
      LLM mid-day — the strip must show the degradation without any command run.

## 17. Verification / Review Criteria

**THE DAILY READING — the program's heartbeat, non-negotiable, 30 days minimum.**
Nobody waits a week to learn anything. Every morning, at first wake, the strip is
followed by a three-line scorecard (built in WS-0, before anything else), each line
EXPECTED vs ACTUAL vs a one-word verdict:

```
day 12/30 · population 41 (expected 35-50 ✓) · stacked 3 bumped 5 sank 1 · invariant PASS
redundancy 4.1% (expected <10 ✓) · degraded 0 · verdict streak ok×9
yesterday's prediction: "ACP atoms consolidate to 1" → HELD
```

Rules of the reading:
- Every day states ONE falsifiable prediction for tomorrow (which atom bumps, what
  the population does, what the render diff shows). Tomorrow's scorecard says
  HELD or BROKE. A system whose predictions keep breaking is pivoted or killed —
  no sunk-cost defense, no "give it another week."
- During the BUILD phase the same scorecard tracks the program itself: workstreams
  green/red, gauntlet batches run vs planned, LOC trend vs the 9,466 baseline.
  Daily verification starts on day one of the program, not at switchover.
- Out-of-band metric → the scorecard names it and asks the pivot question in plain
  text, that morning. Decisions happen at day-scale: continue / adjust / pivot.
- The 7-day kill switch remains as the FLOOR (the automatic decommission trigger),
  not the cadence. The cadence is: every single day, for at least 30 days, the
  human can answer "is it working, is it what we expected, do we change course" in
  one glance — and the system must volunteer the answer, not wait to be asked.

- The gauntlet document: v1 (hand-evolved, smeared) SELF.md vs the population memory render from the
  same 193 episodes, side by side — the research artifact's centerpiece.
- Pathology regression: re-run the week's failure fixtures (the flood; the ACP
  near-dup pairs; the stale-footer episodes) and show each former pathology is now
  structurally impossible, with the obs ledger as evidence.
- LOC + immune-size chart before/after.
- Human review at the three gates (§13); Tower `deliverable` messages carry each
  gate artifact.

## 18. Open Questions

- None load-bearing. All §11 items are DECIDED; WS-A transcribes them onto the spec
  page rather than re-litigating them.
- Runner-up mode note per the tie-breaker rule: BRIDGE-SPEC for MIND-SPEC.v.next itself —
  deliberately NOT produced here; WS-A writes the spec as its deliverable under this
  document's constraints.
- DECIDED — `compost.md` is frozen as historical; the decay step auto-generates a
  "sank below floor" section in each REM commit body. One less file to maintain;
  git remains the archive.

## 19. Handoff Notes

- Board topic `popmem`; odometer awareness per Tower tokenomics (terse reports;
  standard tier for execution).
- The orchestrator runs from its own checkout on mainline; workers never share a
  working tree; close each pane when its worker finishes; teardown per
  `~/.claude/rules/long-running-processes.md`.
- Reference documents on disk: this file;
  `~/constellation/docs/PANE-COMPILER-PRD.md` (adjacent program — the renderer here
  is that compiler's future metabolism input; do not couple them yet);
  scratchpad analysis `optmem-vs-circadian-analysis.md` (session-local, background).
- The live scheduled REM (launchd, 09:00/21:00 + catch-up) keeps running v1 until
  WS-F — sandbox work is unaffected by it, but WS-E/WS-F must re-baseline against
  the live mind's HEAD at execution time, not against commit `187bb80` from this
  document's drafting.

## 20. Clarification Check

Is the intent captured — editor deleted, population memory in its place, net-negative
LOC, verifiability as the acceptance bar, the archive untouched throughout? No
unknowns remain: every design question is DECIDED in §11/§18 with its rationale. The
three human gates (§13) are review gates, not decision gates — the spec page, the
migration diff, and the switchover go/no-go. If nothing here is misread or
over-scoped, this document is ready to hand to an orchestrator verbatim.
