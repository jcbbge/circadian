// gauntlet.test.ts — the gauntlet harness, tested end-to-end with the real
// stub payload against a real sandbox (repo doctrine: no mocks of the code
// under test). Pinned to the same mind rev replay.test.ts uses, so the
// corpus this test feeds through the harness is deterministic.
import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { homedir } from "os";
import { execFileSync } from "child_process";
import { batchesOf, buildGauntletSandbox, runGauntlet } from "./gauntlet.ts";
import { collectAllEpisodesAt } from "./replay.ts";

const HOME = process.env.CIRCADIAN_HOME || path.join(homedir(), "circadian");
const MIND = path.join(HOME, "mind");
const PINNED_MIND_REV = "6271e090226a9970b158399d621d69eac15c5a80";

describe("batchesOf", () => {
  test("groups into batches of the requested size, last group holds the remainder", () => {
    expect(batchesOf([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
    expect(batchesOf([], 3)).toEqual([]);
    expect(batchesOf([1], 3)).toEqual([[1]]);
  });
});

describe("buildGauntletSandbox", () => {
  test("ships mind/, templates/, and src/ into a safe sandbox dir", () => {
    const episodes = collectAllEpisodesAt(PINNED_MIND_REV, MIND).slice(0, 2);
    const { sandboxHome } = buildGauntletSandbox(episodes);
    try {
      expect(fs.existsSync(path.join(sandboxHome, "mind", "SELF.md"))).toBe(true);
      expect(fs.existsSync(path.join(sandboxHome, "templates", "SELF.md"))).toBe(true);
      expect(fs.existsSync(path.join(sandboxHome, "src", "gauntlet.ts"))).toBe(true);
      for (const e of episodes) {
        expect(fs.existsSync(path.join(sandboxHome, "mind", "episodes", e.filename))).toBe(true);
      }
      // HARD SAFETY: never inside the real home.
      expect(path.resolve(sandboxHome).startsWith(path.resolve(HOME) + path.sep)).toBe(false);
    } finally {
      fs.rmSync(sandboxHome, { recursive: true, force: true });
    }
  });
});

describe("runGauntlet — full loop with the real stub payload (task 3)", () => {
  test("batches the pinned 14-flood corpus, invokes the stub payload per batch, all exit 0", () => {
    const report = runGauntlet({ rev: PINNED_MIND_REV, mindDir: MIND, batchSize: 3, limit: 14 });
    try {
      expect(report.totalEpisodes).toBe(14);
      expect(report.batches.length).toBe(Math.ceil(14 / 3));
      expect(report.batches.every((b) => b.exitCode === 0)).toBe(true);
      const fed = report.batches.flatMap((b) => b.episodes);
      expect(fed.length).toBe(14);
      expect(new Set(fed).size).toBe(14); // no episode fed twice
      for (const b of report.batches) {
        expect(b.stdoutTail).toContain("processed");
      }
    } finally {
      fs.rmSync(report.sandboxHome, { recursive: true, force: true });
    }
  });

  test("the stub payload's existence check is real, not a rubber stamp: a fabricated filename fails", () => {
    const bunBin = process.env.CIRCADIAN_BUN_BIN || path.join(homedir(), ".bun/bin/bun");
    const episodes = collectAllEpisodesAt(PINNED_MIND_REV, MIND).slice(0, 1);
    const { sandboxHome } = buildGauntletSandbox(episodes);
    try {
      const r = execFileSync(bunBin, [path.join(__dirname, "gauntlet-stub-payload.ts"), sandboxHome, "does-not-exist.md"], {
        encoding: "utf8",
        env: { ...process.env, CIRCADIAN_HOME: sandboxHome },
      }).toString();
      throw new Error(`expected non-zero exit, got clean output: ${r}`);
    } catch (err: any) {
      expect(err.status).toBe(1);
      expect(String(err.stdout)).toContain("MISSING");
    } finally {
      fs.rmSync(sandboxHome, { recursive: true, force: true });
    }
  });
});
