// relindex.wake.test.ts — the session-anchored wake retrieval slice (b07
// commit 2). The slice logic (deriveAnchors, retrieveForWake) is PURE and
// importable, so it is tested directly against a temporary disk-backed mind
// (repo doctrine: no mocks). wake.ts itself fires at import time (it is a
// SessionStart hook script), so its integration is asserted on source text +
// a live subprocess, never a live import — mirroring wake.test.ts.
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";
import { execFileSync } from "child_process";
import {
  buildIndex,
  deriveAnchors,
  retrieveForWake,
  type IndexData,
} from "./relindex.ts";

const HOME = path.resolve(import.meta.dir, "..");
// Disk-backed fixture: the wake slice needs a populated index, not a particular corpus.
const fixture = fs.mkdtempSync(path.join(tmpdir(), "circadian-wake-corpus-"));
const MIND = path.join(fixture, "mind");
fs.cpSync(path.join(HOME, "templates"), MIND, { recursive: true });
fs.mkdirSync(path.join(MIND, "episodes"), { recursive: true });
fs.mkdirSync(path.join(MIND, "beliefs"), { recursive: true });
fs.writeFileSync(path.join(MIND, "episodes", "2026-08-02-circadian-work.md"),
  "Circadian worktrees b07: a session evidence memory of circadian integration and continuity.\n");
afterAll(() => fs.rmSync(fixture, { recursive: true, force: true }));
const WAKE_SRC = fs.readFileSync(path.join(import.meta.dir, "wake.ts"), "utf8");

function withWakeSandbox(check: (home: string) => void): void {
  const home = fs.mkdtempSync(path.join(tmpdir(), "circadian-wake-index-"));
  try {
    fs.cpSync(MIND, path.join(home, "mind"), {
      recursive: true,
      filter: (source) => !source.split(path.sep).includes(".git"),
    });
    fs.symlinkSync(import.meta.dir, path.join(home, "src"), "dir");
    execFileSync(process.execPath, [path.join(import.meta.dir, "relindex.ts"), "--reindex"], {
      env: { ...process.env, HOME: home, CIRCADIAN_HOME: home },
      stdio: "ignore",
    });
    fs.mkdirSync(path.join(home, "circadian"));
    fs.writeFileSync(path.join(home, "mind", "scopes.tsv"), `circadian\t${path.join(home, "circadian")}\tactive\n`);
    check(home);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

// A real index over the temporary mind, built once for the suite (no network:
// BM25-only, which is the wake read path anyway).
let realIndex: IndexData;
beforeAll(async () => {
  realIndex = (await buildIndex(MIND)).index;
});

describe("deriveAnchors — the cwd/continuation anchor chain (b07 §5)", () => {
  test("a circadian cwd yields KNOWN entities (the anchor fires)", () => {
    const a = deriveAnchors(realIndex, "/Users/jrg/circadian-wave/worktrees/b07");
    expect(a.chain).toContain("cwd");
    expect(a.knownEntities.length).toBeGreaterThan(0);
    // `circadian` is deliberately seeded in the fixture
    expect(a.knownEntities).toContain("circadian");
  });

  test("an UNRELATED cwd yields no known entities (worldview-only gate)", () => {
    const a = deriveAnchors(realIndex, "/Users/jrg/some/rust/thing-xyzzy");
    // it may derive candidate tokens, but none the corpus knows
    expect(a.knownEntities.length).toBe(0);
  });

  test("filesystem noise (Users, home, jrg, tmp) never anchors", () => {
    const a = deriveAnchors(realIndex, "/Users/jrg/tmp");
    expect(a.knownEntities.length).toBe(0);
    expect(a.chain).not.toContain("cwd"); // every segment was noise
  });

  test("a resume/compact source signal is recorded in the chain", () => {
    const a = deriveAnchors(realIndex, "/Users/jrg/circadian", "resume");
    expect(a.chain.some((c) => c.startsWith("source:"))).toBe(true);
    expect(a.query).toContain("continuation");
  });

  test("a plain 'startup' source does NOT add a continuation signal", () => {
    const a = deriveAnchors(realIndex, "/Users/jrg/circadian", "startup");
    expect(a.chain.some((c) => c.startsWith("source:"))).toBe(false);
  });
});

describe("retrieveForWake — the slice decision (pure, no network, no writes)", () => {
  test("circadian cwd -> injects a provenance-pinned block inside budget", () => {
    const slice = retrieveForWake({ index: realIndex, vectors: null }, "/Users/jrg/circadian-wave/worktrees/b07", { budgetTokens: 2000 });
    expect(slice.reason).toBe("injected");
    expect(slice.units.length).toBeGreaterThan(0);
    expect(slice.block).toContain("<mind:session-evidence>");
    // every injected unit is provenance-pinned to its source
    for (const u of slice.units) expect(slice.block).toContain(`from ${u.id}`);
    // budget honoured (+ a small allowance for the wrapper lines)
    expect(Math.ceil(slice.block.length / 4)).toBeLessThanOrEqual(2000 + 80);
  });

  test("unrelated cwd -> worldview-only, empty block (today's behavior)", () => {
    const slice = retrieveForWake({ index: realIndex, vectors: null }, "/tmp/unrelated-xyzzy");
    expect(slice.reason).toBe("no-anchors");
    expect(slice.block).toBe("");
    expect(slice.units.length).toBe(0);
  });

  test("no index on disk -> worldview-only, no crash", () => {
    const slice = retrieveForWake(null, "/Users/jrg/circadian");
    expect(slice.reason).toBe("no-index");
    expect(slice.block).toBe("");
  });

  test("a stale index (>48h) -> worldview-only degraded, block empty", () => {
    const stale: IndexData = { ...realIndex, meta: { ...realIndex.meta, builtAt: new Date(Date.now() - 72 * 3600 * 1000).toISOString() } };
    const slice = retrieveForWake({ index: stale, vectors: null }, "/Users/jrg/circadian", { nowMs: Date.now() });
    expect(slice.reason).toBe("stale-index");
    expect(slice.block).toBe("");
  });

  test("a fresh index (age under 48h) is NOT treated as stale", () => {
    const fresh: IndexData = { ...realIndex, meta: { ...realIndex.meta, builtAt: new Date(Date.now() - 1000).toISOString() } };
    const slice = retrieveForWake({ index: fresh, vectors: null }, "/Users/jrg/circadian-wave/worktrees/b07", { nowMs: Date.now() });
    expect(slice.reason).toBe("injected");
  });

  test("budget of ~0 tokens -> no-relevant-units (nothing fits), still no crash", () => {
    const slice = retrieveForWake({ index: realIndex, vectors: null }, "/Users/jrg/circadian", { budgetTokens: 1 });
    expect(slice.reason).toBe("no-relevant-units");
    expect(slice.block).toBe("");
  });

  test("the slice is DETERMINISTIC — same inputs, same block", () => {
    const a = retrieveForWake({ index: realIndex, vectors: null }, "/Users/jrg/circadian-wave/worktrees/b07", { budgetTokens: 2000 });
    const b = retrieveForWake({ index: realIndex, vectors: null }, "/Users/jrg/circadian-wave/worktrees/b07", { budgetTokens: 2000 });
    expect(a.block).toBe(b.block);
    expect(a.units.map((u) => u.id)).toEqual(b.units.map((u) => u.id));
  });
});

describe("wake.ts integration — source-text + live subprocess (no live import)", () => {
  test("wake.ts imports and calls the slice, threading evidence into buildPayload", () => {
    expect(WAKE_SRC).toContain('from "./relindex.ts"');
    expect(WAKE_SRC).toContain("retrieveForWake");
    expect(WAKE_SRC).toContain("evidence,"); // threaded into buildPayload
  });

  test("wake.ts uses process.cwd() as the anchor and reads the index (Law 7: file reads only)", () => {
    expect(WAKE_SRC).toContain("loadIndex(MIND)");
    expect(WAKE_SRC).toContain("process.cwd()");
    // the slice call passes NO queryVector -> no network at wake
    expect(WAKE_SRC).not.toMatch(/retrieveForWake\([^)]*queryVector/);
  });

  test("wake.ts wraps the slice in its own try/catch (Law 7: never withhold injection)", () => {
    // the session-evidence phase must degrade to empty evidence, never throw
    // out of the hook
    expect(WAKE_SRC).toMatch(/session-evidence slice threw/);
  });

  test("LIVE: wake from a circadian cwd emits the evidence block; from /tmp it does not", () => {
    withWakeSandbox((home) => {
      const runWake = (cwd: string) =>
        execFileSync(process.execPath, [path.join(import.meta.dir, "wake.ts")], {
          cwd,
          env: { ...process.env, HOME: home, CIRCADIAN_HOME: home, CIRCADIAN_BUN_BIN: process.execPath, CIRCADIAN_ROLE: "", CIRCADIAN_SCOPE: "" },
          input: "",
          encoding: "utf8",
          stdio: ["pipe", "pipe", "ignore"],
        });
      const fromCircadian = runWake(path.join(home, "circadian"));
      expect(fromCircadian).toContain("<mind:session-evidence>");
      const fromTmp = runWake(tmpdir());
      expect(fromTmp).not.toContain("<mind:session-evidence>");
      expect(fromCircadian).toContain('<mind:here scope="circadian">');
      expect(fromTmp).toContain('<mind:here scope="global">');
    });
  });

  test("LIVE: the payload stays under the 15k-token cap with evidence present", () => {
    withWakeSandbox((home) => {
      const out = execFileSync(process.execPath, [path.join(import.meta.dir, "wake.ts")], {
        cwd: path.join(home, "circadian"),
        env: { ...process.env, HOME: home, CIRCADIAN_HOME: home, CIRCADIAN_BUN_BIN: process.execPath, CIRCADIAN_ROLE: "", CIRCADIAN_SCOPE: "" },
        input: "",
        encoding: "utf8",
        stdio: ["pipe", "pipe", "ignore"],
      });
      expect(out).not.toContain("OVER-CAP:");
      expect(Math.ceil(out.length / 4)).toBeLessThan(15000);
    });
  });
});
