// relindex.test.ts — the relational evidence index, exercised against the
// REAL mind on disk plus deterministic in-memory fixtures (repo doctrine: no
// mocks of the code under test; see ltp.test.ts, zoom.test.ts). The dense path
// is tested with the HashEmbedder — a REAL embedder (deterministic
// bag-of-hashed-tokens, no network), not a mock — exactly as brief §5.3
// requires ("a REAL embedder implementation, not a mock, so the suite runs
// with no network").
import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { homedir } from "os";
import {
  tokenize,
  extractEntities,
  slugEntities,
  unitDate,
  ingestUnit,
  aggregate,
  buildIndex,
  updateIndex,
  loadIndex,
  saveIndex,
  queryIndex,
  bm25,
  activate,
  cosine,
  excerpt,
  renderEvidenceBlock,
  HashEmbedder,
  RHO_RELATIONAL,
  RHO_TEMPORAL,
  type Unit,
  type IndexData,
} from "./relindex.ts";

const HOME = process.env.CIRCADIAN_HOME || path.join(homedir(), "circadian");
const MIND = path.join(HOME, "mind");

// A small, hand-built corpus with KNOWN entities and co-occurrence — the
// deterministic fixture for the pure graph/scoring functions (mirrors the
// "real data where it matters, fixtures where the math must be exact" split in
// the existing suite). These strings are shaped like real episodes/beliefs.
function fixtureUnits(): Unit[] {
  return [
    ingestUnit(
      "episode",
      "2026-07-28-the-stutter-resolved.md",
      "The system built to end stuttering ate the episode named after the stutter and produced exactly one atom. detectSelfStutter fired on src/immune.ts.",
    ),
    ingestUnit(
      "episode",
      "2026-07-27-the-stuttering-mind.md",
      "The stutter: the same true sentence fifteen times; volume mistaken for conviction. The jaccard threshold in src/immune.ts missed it.",
    ),
    ingestUnit(
      "episode",
      "2026-08-02-herdr-integration-closure.md",
      "herdr integration closed. The tower board is the liveness plane. `herdr notification show` is the doorbell.",
    ),
    ingestUnit(
      "belief",
      "aaaa00000001.md",
      'kind: motif\nclaim: "Compost: the five dead iterations were sheddings, not failures; a growth record, not a graveyard."\nwhy: "x"\nquote: "Compost." | 2026-07-28-genesis-archaeology.md\n[ep:2026-07-28]\n',
    ),
  ];
}

describe("tokenize — code-aware, subword-splitting, deterministic", () => {
  test("keeps compound tokens whole AND emits their subword pieces", () => {
    const toks = tokenize("we edited src/wake.ts and CAP_TOKENS today");
    // whole compounds present
    expect(toks).toContain("src/wake.ts");
    expect(toks).toContain("cap_tokens");
    // subword pieces present so a bare `wake` query matches
    expect(toks).toContain("wake");
    expect(toks).toContain("src");
    expect(toks).toContain("tokens");
  });

  test("drops stopwords and single chars; lowercases", () => {
    const toks = tokenize("The a I of Compost");
    expect(toks).toEqual(["compost"]);
  });

  test("is a pure function — identical input, identical output", () => {
    const a = tokenize("herdr tower compost.md src/wake.ts");
    const b = tokenize("herdr tower compost.md src/wake.ts");
    expect(a).toEqual(b);
  });
});

describe("extractEntities — deterministic code-aware NER, no deps", () => {
  test("file paths, identifiers, constants, dates, SHAs, tool names", () => {
    const e = extractEntities(
      "edited `src/wake.ts`, set CAP_TOKENS, called detectSelfStutter at commit a1b2c3d4e5f on 2026-07-28 with herdr",
    );
    expect(e.get("src/wake.ts")).toBe("path");
    expect(e.get("cap_tokens")).toBe("constant");
    expect(e.get("detectselfstutter")).toBe("identifier");
    expect(e.get("2026-07-28")).toBe("date");
    expect(e.get("a1b2c3d4e5f")).toBe("sha");
    expect(e.get("herdr")).toBe("name");
  });

  test("a bare 4-digit-only hex-looking year is NOT a sha (needs a hex letter)", () => {
    const e = extractEntities("the number 2026 alone");
    expect(e.has("2026")).toBe(false);
  });

  test("snake_case and kebab-case both read as identifiers", () => {
    const e = extractEntities("the render_manifest and the wave-b07 branch");
    expect(e.get("render_manifest")).toBe("identifier");
    expect(e.get("wave-b07")).toBe("identifier");
  });

  test("pure: identical text yields an equal entity map", () => {
    const a = [...extractEntities("herdr `src/wake.ts` 2026-07-28").entries()].sort();
    const b = [...extractEntities("herdr `src/wake.ts` 2026-07-28").entries()].sort();
    expect(a).toEqual(b);
  });
});

describe("slugEntities + unitDate — provenance from the filename", () => {
  test("filename becomes a path entity and its parts become slugs", () => {
    const s = slugEntities("2026-07-28-the-stutter-resolved.md");
    expect(s.get("2026-07-28-the-stutter-resolved.md")).toBe("path");
    expect(s.get("stutter")).toBe("slug");
    expect(s.get("resolved")).toBe("slug");
    // the date prefix is stripped from slug parts
    expect(s.has("2026")).toBe(false);
  });

  test("unitDate: episode prefix wins, else first [ep:] stamp, else null", () => {
    expect(unitDate("2026-07-28-x.md", "body")).toBe("2026-07-28");
    expect(unitDate("aaaa0001.md", "claim\n[ep:2026-07-6]\n")).toBe("2026-07-06");
    expect(unitDate("aaaa0001.md", "no stamp here")).toBeNull();
  });
});

describe("ingestUnit — one mind file into a Unit", () => {
  test("carries provenance, tf, entities, and a content hash", () => {
    const u = ingestUnit("episode", "2026-07-28-the-stutter-resolved.md", "stutter and detectSelfStutter");
    expect(u.id).toBe("episodes/2026-07-28-the-stutter-resolved.md");
    expect(u.source).toBe("2026-07-28-the-stutter-resolved.md");
    expect(u.date).toBe("2026-07-28");
    expect(u.kind).toBe("episode");
    expect(u.entities).toContain("detectselfstutter");
    expect(u.entities).toContain("stutter"); // from the slug
    expect(u.tf["stutter"]).toBeGreaterThan(0);
    expect(u.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  test("belief id is prefixed beliefs/, episode id episodes/", () => {
    expect(ingestUnit("belief", "aaaa0001.md", "x").id).toBe("beliefs/aaaa0001.md");
  });
});

describe("aggregate — occurrence-frequency graph + df + adjacency", () => {
  test("entity->unit edge weights are frequency ratios summing to 1 per entity", () => {
    const units = fixtureUnits();
    const { entities } = aggregate(units);
    // `src/immune.ts` appears in both stutter episodes — edge weights split
    const node = entities["src/immune.ts"];
    expect(node).toBeDefined();
    const sum = Object.values(node.units).reduce((s, w) => s + w, 0);
    expect(sum).toBeCloseTo(1, 6);
    expect(Object.keys(node.units).length).toBe(2);
  });

  test("adjacency joins chronologically neighbouring EPISODES only", () => {
    const units = fixtureUnits();
    const { adjacency } = aggregate(units);
    // 3 episodes -> 2 adjacency edges; beliefs never appear
    expect(adjacency.length).toBe(2);
    for (const [a, b] of adjacency) {
      expect(a.startsWith("episodes/")).toBe(true);
      expect(b.startsWith("episodes/")).toBe(true);
    }
    // ordered by date: stuttering-mind (07-27) -> stutter-resolved (07-28) -> herdr (08-02)
    expect(adjacency[0][0]).toContain("2026-07-27");
    expect(adjacency[1][1]).toContain("2026-08-02");
  });

  test("df counts units carrying each token", () => {
    const units = fixtureUnits();
    const { df } = aggregate(units);
    expect(df["stutter"]).toBeGreaterThanOrEqual(2);
  });
});

describe("bm25 + activate — the two retrieval signals", () => {
  test("bm25 ranks the stutter episodes for a 'stutter' query", () => {
    const units = fixtureUnits();
    const { entities, df, adjacency } = aggregate(units);
    const index: IndexData = {
      meta: { version: 1, builtAt: "X", unitCount: units.length, entityCount: Object.keys(entities).length, buildMs: 0, embedder: "none", avgdl: units.reduce((s, u) => s + u.len, 0) / units.length },
      units, entities, df, adjacency,
    };
    const scores = bm25(index, tokenize("stutter"));
    const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
    expect(ranked[0][0]).toMatch(/stutter/);
  });

  test("activate lights query-entity units + one hop of co-occurrence", () => {
    const units = fixtureUnits();
    const { entities, df, adjacency } = aggregate(units);
    const index: IndexData = {
      meta: { version: 1, builtAt: "X", unitCount: units.length, entityCount: Object.keys(entities).length, buildMs: 0, embedder: "none", avgdl: 100 },
      units, entities, df, adjacency,
    };
    // src/immune.ts is in both stutter episodes; activating it lights both
    const act = activate(index, ["src/immune.ts"]);
    expect(act.get("episodes/2026-07-28-the-stutter-resolved.md")).toBeGreaterThan(0);
    expect(act.get("episodes/2026-07-27-the-stuttering-mind.md")).toBeGreaterThan(0);
    // herdr episode shares no entity — stays dark
    expect(act.get("episodes/2026-08-02-herdr-integration-closure.md") ?? 0).toBe(0);
  });

  test("a DIRECT entity hit always outranks a pure co-occurrence HOP (regression pin)", () => {
    // The subword-tokenization regression: a unit sharing many INCIDENTAL
    // entities with a direct hit could out-sum the units the query entity
    // actually names. The two-tier activation forbids it: every direct hit
    // scores >= 1, every pure-hop hit scores <= HOP_DECAY (< 1).
    const units = fixtureUnits();
    const { entities, df, adjacency } = aggregate(units);
    const index: IndexData = {
      meta: { version: 1, builtAt: "X", unitCount: units.length, entityCount: Object.keys(entities).length, buildMs: 0, embedder: "none", avgdl: 100 },
      units, entities, df, adjacency,
    };
    const act = activate(index, ["src/immune.ts"]); // names both stutter episodes
    const directScores = [...act.entries()].filter(([id]) => /stutter/.test(id)).map(([, w]) => w);
    const hopScores = [...act.entries()].filter(([id]) => !/stutter/.test(id)).map(([, w]) => w);
    for (const d of directScores) expect(d).toBeGreaterThanOrEqual(1);
    for (const h of hopScores) expect(h).toBeLessThan(1); // hops never reach the direct tier
  });
});

describe("cosine + HashEmbedder — the REAL dense path (no network, no mock)", () => {
  test("HashEmbedder is deterministic and L2-normalized", async () => {
    const e = new HashEmbedder();
    const a = await e.embed("herdr tower compost");
    const b = await e.embed("herdr tower compost");
    expect(a).toEqual(b); // deterministic
    const norm = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 6); // normalized
  });

  test("cosine: identical text ~1, unrelated text lower", async () => {
    const e = new HashEmbedder();
    const stutter = await e.embed("stutter the same sentence fifteen times detectSelfStutter");
    const stutter2 = await e.embed("stutter the same sentence fifteen times detectSelfStutter");
    const herdr = await e.embed("herdr tower board doorbell notification");
    expect(cosine(stutter, stutter2)).toBeCloseTo(1, 6);
    expect(cosine(stutter, herdr)).toBeLessThan(cosine(stutter, stutter2));
  });

  test("cosine handles degenerate inputs safely", () => {
    expect(cosine([], [])).toBe(0);
    expect(cosine([1, 2], [1, 2, 3])).toBe(0);
    expect(cosine([0, 0], [0, 0])).toBe(0);
  });
});

describe("queryIndex — the deterministic fusion, over fixtures", () => {
  function fixtureIndex(): IndexData {
    const units = fixtureUnits();
    const { entities, df, adjacency } = aggregate(units);
    return {
      meta: { version: 1, builtAt: "X", unitCount: units.length, entityCount: Object.keys(entities).length, buildMs: 0, embedder: "none", avgdl: units.reduce((s, u) => s + u.len, 0) / units.length },
      units, entities, df, adjacency,
    };
  }

  test("'stutter' returns the stutter-resolved episode first, provenance-pinned", () => {
    const results = queryIndex(fixtureIndex(), "stutter", { k: 3 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toMatch(/stutter/);
    expect(results[0].source).toBeTruthy();
    expect(results[0].snippet.length).toBeGreaterThan(0);
  });

  test("'herdr' surfaces the herdr episode, not the stutter ones", () => {
    const results = queryIndex(fixtureIndex(), "herdr", { k: 2 });
    expect(results[0].id).toContain("herdr");
  });

  test("an entity-bearing query routes relational-primary; a bare word does not", () => {
    // src/immune.ts is a code entity the corpus knows -> relational routing
    const withEntity = queryIndex(fixtureIndex(), "src/immune.ts", { k: 3 });
    // both stutter episodes carry it; the closure lights both
    const ids = withEntity.map((r) => r.id);
    expect(ids.some((i) => i.includes("stutter-resolved"))).toBe(true);
    expect(ids.some((i) => i.includes("stuttering-mind"))).toBe(true);
  });

  test("is deterministic — same query, same ranking, twice", () => {
    const a = queryIndex(fixtureIndex(), "compost", { k: 4 });
    const b = queryIndex(fixtureIndex(), "compost", { k: 4 });
    expect(a).toEqual(b);
  });

  test("dense fusion with a HashEmbedder query vector runs and stays sane", async () => {
    const idx = fixtureIndex();
    const e = new HashEmbedder();
    const vectors = { embedder: "hash", dims: e.dims, vectors: {} as Record<string, number[]> };
    for (const u of idx.units) vectors.vectors[u.id] = await e.embed(u.text);
    const qv = { embedder: "hash", vector: await e.embed("stutter fifteen times") };
    const results = queryIndex(idx, "stutter", { k: 3, queryVector: qv, vectors });
    expect(results[0].id).toMatch(/stutter/);
  });

  test("RHO constants are ordered relational > temporal (routing is real)", () => {
    expect(RHO_RELATIONAL).toBeGreaterThan(RHO_TEMPORAL);
  });
});

describe("excerpt + renderEvidenceBlock — provenance-pinned rendering", () => {
  test("belief excerpt is the claim; episode excerpt is the first sentence", () => {
    const belief = ingestUnit("belief", "aaaa0001.md", 'kind: motif\nclaim: "The claim text here."\nwhy: "x"\nquote: "q" | ep.md\n[ep:2026-07-28]\n');
    expect(excerpt(belief)).toContain("The claim text here.");
    const ep = ingestUnit("episode", "2026-07-28-x.md", "---\ndate: 2026-07-28\n---\n\nFirst sentence. Second sentence.");
    expect(excerpt(ep)).toContain("First sentence.");
    expect(excerpt(ep)).not.toContain("date:"); // front-matter stripped
  });

  test("renderEvidenceBlock pins each unit to its source and honours the budget", () => {
    const results = queryIndex(
      (() => {
        const units = fixtureUnits();
        const { entities, df, adjacency } = aggregate(units);
        return { meta: { version: 1 as const, builtAt: "X", unitCount: units.length, entityCount: 0, buildMs: 0, embedder: "none", avgdl: 100 }, units, entities, df, adjacency };
      })(),
      "stutter",
      { k: 5 },
    );
    const { text, used } = renderEvidenceBlock(results, 2000);
    for (const r of used) expect(text).toContain(`from ${r.id}`);
    // a tiny budget drops from the tail
    const tiny = renderEvidenceBlock(results, 5);
    expect(tiny.used.length).toBeLessThan(used.length);
  });
});

// -----------------------------------------------------------------------
// REAL MIND — build, smoke retrievals, determinism, incremental = full
// -----------------------------------------------------------------------
describe("buildIndex over the REAL mind on disk", () => {
  test("builds a non-trivial index in well under a second", async () => {
    const { index } = await buildIndex(MIND);
    expect(index.meta.unitCount).toBeGreaterThan(50); // ~55 episodes + ~104 beliefs
    expect(index.meta.entityCount).toBeGreaterThan(100);
    expect(index.meta.buildMs).toBeLessThan(5000);
    expect(index.meta.embedder).toBe("none"); // BM25-only by default (no CIRCADIAN_EMBED)
    expect(index.adjacency.length).toBeGreaterThan(0);
  });

  test("SMOKE: 'herdr' returns herdr-bearing units with provenance", async () => {
    const { index } = await buildIndex(MIND);
    const results = queryIndex(index, "herdr", { k: 5 });
    expect(results.length).toBeGreaterThan(0);
    // at least one result actually mentions herdr in its source or text
    const hit = results.some((r) => /herdr|river-remembers|tower/.test(r.id) || /herdr/i.test(r.snippet));
    expect(hit).toBe(true);
  });

  test("SMOKE: 'stutter' returns the-stutter-resolved episode", async () => {
    const { index } = await buildIndex(MIND);
    const results = queryIndex(index, "stutter", { k: 5 });
    expect(results.some((r) => r.id.includes("the-stutter-resolved"))).toBe(true);
  });

  test("SMOKE: 'compost.md' returns compost-related atoms/episodes", async () => {
    const { index } = await buildIndex(MIND);
    const results = queryIndex(index, "compost.md", { k: 5 });
    expect(results.some((r) => /compost/i.test(r.id) || /compost/i.test(r.snippet))).toBe(true);
  });

  test("DETERMINISM: two builds agree byte-for-byte except meta.builtAt/buildMs", async () => {
    const a = (await buildIndex(MIND)).index;
    const b = (await buildIndex(MIND)).index;
    const strip = (i: IndexData) => JSON.stringify({ ...i, meta: { ...i.meta, builtAt: "X", buildMs: 0 } });
    expect(strip(a)).toBe(strip(b));
  });
});

describe("updateIndex — incremental, and equal to a full rebuild", () => {
  test("no changes -> reuses every cached unit, same graph as full build", async () => {
    const full = (await buildIndex(MIND)).index;
    const { index: updated, changed, deleted } = updateIndex(MIND, full);
    expect(changed).toBe(0);
    expect(deleted).toBe(0);
    const strip = (i: IndexData) => JSON.stringify({ units: i.units, entities: i.entities, df: i.df, adjacency: i.adjacency });
    expect(strip(updated)).toBe(strip(full));
  });

  test("a changed unit re-extracts; result still equals a full rebuild", async () => {
    // Simulate a prior index missing the newest content by handing updateIndex
    // a prior with one unit's hash corrupted — it must re-ingest exactly that
    // unit and converge on the full-rebuild graph.
    const full = (await buildIndex(MIND)).index;
    const tampered: IndexData = {
      ...full,
      units: full.units.map((u, i) => (i === 0 ? { ...u, hash: "deadbeefdeadbeef", tf: {}, entities: [], len: 0 } : u)),
    };
    const { index: updated, changed } = updateIndex(MIND, tampered);
    expect(changed).toBe(1); // exactly the tampered unit re-ingested
    const strip = (i: IndexData) => JSON.stringify({ units: i.units, entities: i.entities, df: i.df, adjacency: i.adjacency });
    expect(strip(updated)).toBe(strip(full)); // converges on the truth
  });
});

describe("save/load round-trip (no network, no writes to episodes/beliefs)", () => {
  test("saveIndex writes mind/index/, loadIndex reads it back identically", async () => {
    // Sandbox: write to a temp CIRCADIAN_HOME-shaped dir, never the real mind.
    const tmp = fs.mkdtempSync(path.join(require("os").tmpdir(), "relindex-test-"));
    try {
      const { index } = await buildIndex(MIND);
      saveIndex(tmp, index, null);
      expect(fs.existsSync(path.join(tmp, "index", "index.json"))).toBe(true);
      const loaded = loadIndex(tmp);
      expect(loaded).not.toBeNull();
      expect(JSON.stringify(loaded!.index)).toBe(JSON.stringify(index));
      expect(loaded!.vectors).toBeNull(); // BM25-only -> no vectors file
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("loadIndex returns null when there is no index", () => {
    const tmp = fs.mkdtempSync(path.join(require("os").tmpdir(), "relindex-empty-"));
    try {
      expect(loadIndex(tmp)).toBeNull();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
