// ltp.test.ts — long-term potentiation pinned against the REAL episode
// backlog on disk (repo doctrine: no mocks). The 2026-07-24 bidirectional
// flood is the founding fixture: if these files ever compost, the git history
// of the mind repo still holds them — but the shape of the test stands: near
// -duplicate episodes cluster, distinct lessons do not.
import { describe, test, expect } from "bun:test";
import * as path from "path";
import { homedir } from "os";
import { execFileSync } from "child_process";
import { clusterEpisodes, jaccard, significantTokens, LTP_THRESHOLD } from "./ltp.ts";

const MIND = path.join(process.env.CIRCADIAN_HOME || path.join(homedir(), "circadian"), "mind");

// The founding fixture — the real 2026-07-24 bench flood — was QUARANTINED
// from the working tree the same day (bench provenance must not live in the
// mind). Git history is the archive (MIND-SPEC), so the test reads the flood
// from the last revision where it existed. Real data, permanently pinned,
// immune to compost: the fixture can never rot out from under the test again.
function gitEpisodesAt(rev: string, filter: (f: string) => boolean): { filename: string; content: string }[] {
  const files = execFileSync("git", ["ls-tree", "--name-only", rev, "episodes/"], { cwd: MIND, encoding: "utf8" })
    .split("\n")
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace("episodes/", ""))
    .filter(filter);
  return files.map((f) => ({
    filename: f,
    content: execFileSync("git", ["show", `${rev}:episodes/${f}`], { cwd: MIND, encoding: "utf8" }),
  }));
}

// Last revision that still carried the full flood: the commit whose tree
// contains bidirectional-sync-test.md. Found once, cached for the suite.
function floodRevision(): string {
  const revs = execFileSync("git", ["log", "--format=%H", "--", "episodes/2026-07-24-bidirectional-sync-test.md"], { cwd: MIND, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
  // newest rev that ADDED or still HELD the file (the deletion commit's tree
  // no longer has it, so probe each rev's tree newest-first).
  for (const r of revs) {
    try {
      execFileSync("git", ["cat-file", "-e", `${r}:episodes/2026-07-24-bidirectional-sync-test.md`], { cwd: MIND });
      return r;
    } catch { /* deleted in this rev; keep walking */ }
  }
  throw new Error("flood fixture not found anywhere in mind history — the archive contract broke");
}

const FLOOD_REV = floodRevision();

function loadReal(prefixes: string[]): { filename: string; content: string }[] {
  return gitEpisodesAt(FLOOD_REV, (f) => prefixes.some((p) => f.includes(p)));
}

describe("clustering against the real 2026-07-24 backlog", () => {
  test("the bidirectional flood collapses substantially within the full wave", () => {
    // Cluster the WHOLE backlog exactly as selectMeal does in production —
    // clustering the flood in isolation would let boilerplate detection eat
    // the shared lesson itself (cut scales with corpus size), which is not a
    // call path that exists.
    const all = loadReal([""]);
    const flood = all.filter((e) => e.filename.includes("bidirectional"));
    expect(flood.length).toBeGreaterThanOrEqual(10);
    const clusters = clusterEpisodes(all);
    // The win condition: most flood members ride inside potentiated clusters
    // instead of each claiming a meal slot. (Measured 2026-07-24: x12 cluster
    // at threshold 0.3 with corpus-level boilerplate stripping.)
    const inMulti = flood.filter((f) =>
      clusters.some(
        (c) => c.weight > 1 && (c.representative.filename === f.filename || c.members.some((m) => m.filename === f.filename))
      )
    );
    // Empirical pin (2026-07-24): 8 of 14 flood members ride in multi-clusters
    // at threshold 0.3. At least half must — below that, LTP isn't paying for
    // its complexity and the threshold needs re-measuring.
    expect(inMulti.length).toBeGreaterThanOrEqual(Math.floor(flood.length / 2));
    const heaviest = Math.max(...clusters.map((c) => c.weight));
    expect(heaviest).toBeGreaterThanOrEqual(3);
    // Weight conservation across the whole wave: nothing lost, nothing duplicated.
    const total = clusters.reduce((n, c) => n + c.weight, 0);
    expect(total).toBe(all.length);
  });

  test("distinct lessons from the same day do NOT cluster together", () => {
    const distinct = loadReal(["glyphs-that-heal", "output-flood-test", "terminal-resilience"]);
    expect(distinct.length).toBe(3);
    for (let i = 0; i < distinct.length; i++) {
      for (let j = i + 1; j < distinct.length; j++) {
        const sim = jaccard(
          significantTokens(distinct[i].content),
          significantTokens(distinct[j].content)
        );
        expect(sim).toBeLessThan(LTP_THRESHOLD);
      }
    }
    const clusters = clusterEpisodes(distinct);
    expect(clusters.length).toBe(3); // all singletons
  });

  test("representative is the longest telling and members carry the rest", () => {
    const flood = loadReal(["bidirectional-sync-test"]);
    expect(flood.length).toBeGreaterThanOrEqual(3);
    const clusters = clusterEpisodes(flood);
    for (const c of clusters) {
      for (const m of c.members) {
        expect(c.representative.content.length).toBeGreaterThanOrEqual(m.content.length);
      }
      expect(c.weight).toBe(c.members.length + 1);
    }
  });

  test("empty input yields no clusters; singleton stays weight 1", () => {
    expect(clusterEpisodes([])).toEqual([]);
    const one = loadReal(["glyphs-that-heal"]);
    const c = clusterEpisodes(one);
    expect(c.length).toBe(1);
    expect(c[0].weight).toBe(1);
    expect(c[0].members).toEqual([]);
  });
});
