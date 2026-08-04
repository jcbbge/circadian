# FEATURE — Relational evidence index + session-anchored deterministic wake retrieval

> Mode: FEATURE — one new module + REM phase + wake slice. Two sequential commits, one pane.
> Adoption of Zero-Mem implications #1 (entity–context graph) + #2 (deterministic session-relevant
> retrieval), per the coordinator's deep read and `docs/ZEROMEM-RESEARCH.md`.

## 1. Objective
Give Circadian the relational retrieval view it lacks — a deterministic, token-free
entity–context index over episodes and belief atoms — and let wake use it to inject
session-relevant evidence alongside the worldview. Zero-Mem (arXiv 2607.29377) proved the read
path can be generation-free; Circadian's wake read path already is (Law 7) — what it lacks is
RELEVANCE SELECTION. This brief adds it.

## 2. Context
- **Paper evidence:** entity–context graph + temporal hierarchy are complementary (ablation:
  graph-only 62.5 F1, hierarchy-only 54.9, both 72.07 — HotpotQA 56K, Fig. 3); the relational
  view is the bigger single contributor. Circadian has ONLY the temporal hierarchy
  (transcripts → meals → episodes → atoms). No entity index exists — "everything about X" is
  grep or an LLM reading episodes.
- **Domain fit:** our corpus is code-heavy — entities are file paths, symbols, repo/tool names,
  commit SHAs, pane ids, dates. Deterministic extraction beats general NER here. NO spaCy, no
  new runtime dependencies (Doctrine 1: the cliff is complexity accretion).
- **Infrastructure exists:** local OpenAI-compatible embeddings at `http://127.0.0.1:10240/v1`
  (Qwen3-Embedding-4B, always-on per global AGENTS.md). BM25 is the floor; dense is optional.
- **The no-crisp-query-at-wake objection (from the r01 research artifact — take it seriously):**
  wake often fires with no user question. Resolved via the anchor chain in §5 — the session's
  cwd/project is itself a strong entity anchor.
- **Wake constraints (verified this session):** Law 7 — wake is file reads only, the injection is
  ALWAYS delivered, staleness/over-cap are degraded events not blocks (`src/wake.ts:1-12`);
  `CAP_TOKENS = 15000` (`src/wake.ts:27`); `CIRCADIAN_HOME` env knob (`src/wake.ts:24`).
- **REM constraints:** phases are paranoia-wrapped (janitor pattern, `src/rem-popmem.ts:829-838`);
  distill phase now exists (b06, merged) — the index phase must not interfere with it.
- **Not scope:** upgrading the stutter detector to dense+lexical fusion (research agent's
  recommendation D) — separate future brief; b06's distill just landed, let it run.

## 3. Reuse / What Already Exists
- **REUSE / EXTEND** — `src/wake.ts` (injection assembly, cap accounting, obs events);
  `src/rem-popmem.ts` (phase pattern, paranoia wrapper, obs); `src/obs.ts`; zoom.ts's episode
  reading (`collectEpisodes`) for trace access patterns; `src/llm.ts` is the LLM client — the
  EMBEDDING client should follow its shape (endpoint config) but hit `:10240/v1/embeddings`.
- **BUILD NEW** — `src/relindex.ts` (extraction + graph + BM25 + optional dense + query API +
  `--reindex` CLI); `src/relindex.test.ts`; a REM index phase; a wake retrieval slice.
- **DO NOT REBUILD** — the atom/ledger/render, the distill phase, zoom, the extraction stacker.
  The index is a READ-OPTIMIZED DERIVED VIEW over `mind/episodes/` + `mind/beliefs/` — it never
  writes to them, and its store is rebuildable.

## 4. Scope
- **Commit 1 — `src/relindex.ts` + REM phase.**
  - Units: `mind/episodes/*.md` and `mind/beliefs/*.md`. Each unit keeps provenance (filename,
    date/episode stamp) — retrieved evidence must cite its source (Zero-Mem's core discipline).
  - Deterministic code-aware entity extraction: file paths, `camelCase`/`snake_case` identifiers,
    backticked tokens, commit SHAs, repo/tool names, ISO dates. Pure regex/heuristics. No deps.
  - Graph: entity↔unit co-occurrence edges weighted by normalized frequency (Zero-Mem eq. 4
    spirit); temporal adjacency edges between chronologically adjacent episodes.
  - Scoring: BM25 over unit text; optional dense embeddings (`:10240`, env-gated
    `CIRCADIAN_EMBED=1`); embeddings OFF → BM25-only degraded mode (still fully functional).
  - Retrieval: query entities → one-hop activation over co-occurrence neighbors (closure, NOT
    PageRank — v1 stays one page); temporal view = recency + adjacency; fuse with a fixed dual
    weight, relational-primary for entity-bearing queries.
  - Store: `mind/index/` (JSON), gitignored in the MIND repo — update install.sh's written
    `mind/.gitignore`. Rebuildable: `bun src/relindex.ts --reindex`.
  - REM phase (after the mind commit, paranoia-wrapped like janitor): update the index
    incrementally (new/changed units only). An index bug must never crack REM.
- **Commit 2 — wake retrieval slice.**
  - Anchor chain (in order): cwd-derived project/repo entities → resume/continuation signals →
    first user message entities IF the harness exposes it at wake time → none: worldview-only
    (today's exact behavior + an idle obs event).
  - With anchors: retrieve top-5 fused units, render as a provenance-pinned block
    (`— from episodes/2026-07-28-the-stutter-resolved.md`), budget ≤ 2000 tokens INSIDE the
    existing 15k cap (the slice shrinks something else per the existing cap logic — follow it).
  - Missing or stale (>48h, matching wake's staleness convention) index → degraded event +
    today's behavior. Wake NEVER builds or writes the index. Law 7 holds.

## 5. Resolved UNKNOWNs (coordinator — final)
1. Store location: `mind/index/`, gitignored, rebuildable. (Derived per-user data beside what it
   indexes; not committed; replay sandboxes unaffected.)
2. Freshness: REM-phase updates (twice daily) + explicit `--reindex`. Wake tolerates staleness.
3. Embeddings: optional, env-gated, BM25 floor. Tests use a deterministic hash-embedder (a REAL
   embedder implementation, not a mock) so the suite runs with no network.
4. Routing: no learned router — entity-bearing anchors → relational-primary fusion weight;
   else temporal-primary. Fixed weights, documented in the report.
5. Mode: FEATURE, but still one pane, sequential commits, no workers.

## 6. Constraints
- No new runtime dependencies. No network calls at wake (the `:10240` client is used only at
  index-build time; wake reads the built index files only).
- Do NOT touch: distill phase, detectSelfStutter, render, stacker, janitor.
- NEVER push. Local commits only. Never stage `mind/` (including `mind/index/`) into the source repo.
- obs events per Law 9: index build (units, entities, ms), REM phase outcome, wake slice
  decision (anchors found / units injected / why-not).

## 7. Assumptions / Ambiguities
- Assumes ~60 episodes + ~100 beliefs index in seconds — measure and report; if slower, the REM
  phase must be incremental-only (it is specified incremental — verify).
- Ambiguity: whether pi/CC expose the first user message at wake time — INVESTIGATE
  (`~/.pi/agent/extensions/circadian-mind.ts`, CC SessionStart payload); if not exposed, that
  anchor simply never fires. Report findings.

## 8. Open Questions
- None unresolved; all decisions in §5.

## 9. Acceptance Criteria
- [ ] `bun src/relindex.ts --reindex` builds `mind/index/` over the real mind; time reported.
- [ ] Smoke retrievals return correct provenance-pinned units: `herdr` → herdr-spine episodes;
      `stutter` → `2026-07-28-the-stutter-resolved`; `compost.md` → compost-related atoms/episodes.
- [ ] Embeddings-disabled run works BM25-only (degraded event, no crash).
- [ ] Wake with anchors injects a ≤2k-token provenance-pinned evidence block; without anchors
      behaves exactly as today; cap respected in both cases.
- [ ] `bun test` green (330 baseline + new tests, no mocks); `bun src/doctor.ts` exits 0.
- [ ] install.sh's mind `.gitignore` includes `index/`.
- [ ] No new runtime dependencies (`package.json` unchanged).

## 10. Clarification Check
Do you understand the intent and purpose? What ambiguous details remain? — None unresolved (§5).
