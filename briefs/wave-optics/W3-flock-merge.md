# W3 — The interference instrument: semantic flock merge (design + dry-run)

Label: `w3-flock`. Contract: `briefs/wave-optics/CONTRACT.md` (binding).

## Mission

The population holds paraphrase FLOCKS: one belief wearing dozens of
tellings. Measured (coordinator audit, 2026-08-09): 43 atom files contain
"mechanical fidelity", 56 contain "verbatim"; the top-8 atoms bumped by
ack-type episodes are all restatements of one claim ("trust through literal
execution"). The dedupe pipeline is lexical (jaccard 0.3 via `ltp.ts`
`jaccard`/`significantTokens`) + a borderline COMPARE band — semantic
paraphrases with low token overlap fall below BAND_LOW and are never
compared at all (`stack.ts` routeCandidate, `compareUsed: false`; per
brief 08). Brief 08 (`briefs/08-extraction-time-paraphrase-rejection.md` —
READ IT) attacks this at extraction time for FUTURE episodes. You attack
the EXISTING population: design and dry-run the merge pass that collapses
flocks via supersede events.

This is the multi-plate interference instrument from the design dialogue
behind this wave: provenance stays intact at rest (every atom keeps its
file, quotes, [ep:] stamps; supersede transfers weight and preserves
lineage), but the COMPARISON erases which-plate identity — claims are
compared as claims, not as sourced records.

## Pre-verified facts (coordinator, 2026-08-09)

- Supersede semantics already exist and are exactly right for this:
  `{"ev":"supersede","winner","loser"}` — weight transfers, loser keeps
  file + lineage, zoom shows the old telling forever (MIND-SPEC; fold
  contract in the `foldWeights` doc block, `src/atoms.ts:281-295`). Only 46
  supersedes have ever fired vs 795 stacks.
- COMPARE surface (documented at `src/stack.ts:21-26`): two claims → one
  token SAME | DISTINCT | SUPERSEDES_A | SUPERSEDES_B; anything else is
  coerced to DISTINCT (safe default) with a degraded obs event. Calls go
  through `src/llm.ts`, local only. Honor the same asymmetry in your
  clustering: a false-DISTINCT costs a later pass nothing; a false-SAME
  loses a belief permanently — bias conservative.
- Local LLM at `:10240` (Qwen3-Embedding-4B embeddings, Qwen3-4B chat) is
  **DOWN this session** (connection refused, verified). So: the tool must
  accept an injectable embeddings/COMPARE function and degrade to a
  **lexical-cluster dry-run** when unreachable — structure the pipeline so
  the semantic call is one injectable function. Test with the lexical
  fallback (it is a real implementation, not a mock — repo doctrine).
- Population by kind: 67 agreement, 69 doctrine, 34 identity, 65 motif =
  235 atoms. Claims ≤280 chars — full pairwise matrix ~27k pairs;
  clustering cost trivial even lexically.

## Design (implement as a standalone offline tool; refine freely)

New file `src/interfere.ts` (+ test). Pipeline:

1. Load all atoms (claims + kinds) from `mind/beliefs/`.
2. Cluster candidates: embeddings when the endpoint is up; fallback =
   lexical jaccard at a LOWER threshold (0.15) + shared-bigram signals,
   kind-scoped (never cluster across kinds).
3. Within each cluster of size ≥2: pick the winner = highest folded weight
   (tiebreak: earliest [ep:] stamp — the original telling). Emit proposed
   supersede lines `loser → winner`.
4. **Dry-run by default.** `--apply` appends to `mind/beliefs.jsonl`;
   without it, write the full proposal to
   `briefs/wave-optics/proposals/W3-merge-proposal.jsonl` + a
   human-readable `W3-report.md`: every cluster, its claims verbatim,
   winner, combined weight, and the resulting top-20 render preview.
5. DO NOT run with `--apply`. The coordinator reviews the proposal and
   applies. Your deliverable is the instrument + the proposal.

## Partition (writable)

- `src/interfere.ts` (new), `src/interfere.test.ts` (new — pin real atoms:
  the "mechanical fidelity" flock, e.g. `0bf353ba44b0` "trust is earned
  through mechanical fidelity" and `4aa467268930` "user values mechanical
  fidelity over narrative interpretation", must land in one cluster; two
  genuinely distinct doctrines, e.g. `6ed0b774ec2a` "Bidirectional state
  flow..." vs `e8b0c351543c` "Motion is the metric...", must NOT cluster).
- `briefs/wave-optics/proposals/W3-merge-proposal.jsonl`, `W3-report.md`.
- NOTHING else. `mind/beliefs.jsonl` and `mind/beliefs/` are read-only for
  you; you import from `atoms.ts`/`ltp.ts`, never edit them (W1/W2 own
  them this wave).

## Done-when

- `bun test src/interfere.test.ts` green; `bun test src/render.test.ts`
  green (you changed no render inputs — assert it stays green anyway).
- Proposal + report exist; report states cluster count, atoms affected,
  and effective-population before/after (235 → N).
- No `--apply` was executed (`git diff --stat mind/` is empty; state it).
