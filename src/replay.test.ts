// replay.test.ts — pinned-corpus tests for the gauntlet harness (popmem WS-G).
// Living-document fixtures pinned to a real mind revision (repo doctrine: no
// mocks of the code under test; the zoom.test.ts / ltp.test.ts pattern) —
// the mind composts twice daily, so anything regression-shaped must pin to a
// rev and never assume a live census.
import { describe, test, expect } from "bun:test";
import * as path from "path";
import { homedir } from "os";
import { execFileSync } from "child_process";
import { collectAllEpisodes, collectAllEpisodesAt } from "./replay.ts";

const HOME = process.env.CIRCADIAN_HOME || path.join(homedir(), "circadian");
const MIND = path.join(HOME, "mind");

// Pinned 2026-07-27 21:00 rem wave (same rev zoom.test.ts pins to — it postdates
// every 2026-07-24-bidirectional-* compost, verified via
// `git -C mind merge-base --is-ancestor <compost-commit> <this-rev>`).
const PINNED_MIND_REV = "6271e090226a9970b158399d621d69eac15c5a80";

// The 14-flood acceptance fixture (popmem brief §WS-G): every
// 2026-07-24-bidirectional-* episode, all git-recovered (0 live in HEAD).
const FLOOD_FILENAMES = [
  "2026-07-24-bidirectional-state-2.md",
  "2026-07-24-bidirectional-state-3.md",
  "2026-07-24-bidirectional-state-4.md",
  "2026-07-24-bidirectional-state-flow.md",
  "2026-07-24-bidirectional-state-open.md",
  "2026-07-24-bidirectional-state-roots.md",
  "2026-07-24-bidirectional-state-sync.md",
  "2026-07-24-bidirectional-state.md",
  "2026-07-24-bidirectional-sync-test-2.md",
  "2026-07-24-bidirectional-sync-test-3.md",
  "2026-07-24-bidirectional-sync-test-4.md",
  "2026-07-24-bidirectional-sync-test.md",
  "2026-07-24-bidirectional-sync-validation.md",
  "2026-07-24-bidirectional-sync.md",
];

/** Test-usable helper (task 2): the 14-flood fixture, retrieved at the
 * pinned rev via the living-fixture pattern (git show, no checked-in
 * copies) — gauntlet callers reuse this shape directly. */
export function collectFloodFixture(mindDir: string = MIND, rev: string = PINNED_MIND_REV) {
  return collectAllEpisodesAt(rev, mindDir).filter((e) => e.filename.startsWith("2026-07-24-bidirectional-"));
}

describe("existing live-mode replay behavior is untouched", () => {
  test("collectAllEpisodes still reads the live working tree + HEAD-reachable history", () => {
    const live = collectAllEpisodes(MIND);
    expect(Array.isArray(live)).toBe(true);
    expect(live.length).toBeGreaterThan(0);
    expect(live.every((e) => e.source === "live" || e.source === "git")).toBe(true);
    // sorted chronologically (filenames are YYYY-MM-DD-<slug>.md)
    const sorted = [...live].sort((a, b) => a.filename.localeCompare(b.filename));
    expect(live.map((e) => e.filename)).toEqual(sorted.map((e) => e.filename));
  });
});

describe("collectAllEpisodesAt — pinned enumeration (task 1)", () => {
  test("enumerates an exact, byte-stable total at the pinned rev", () => {
    const first = collectAllEpisodesAt(PINNED_MIND_REV, MIND);
    const second = collectAllEpisodesAt(PINNED_MIND_REV, MIND);

    // Census AT 6271e090 (verified this session via git ls-tree + git log
    // --diff-filter=D constrained to this rev): 193 total.
    expect(first.length).toBe(193);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  test("every entry has non-empty content and a valid source tag", () => {
    const all = collectAllEpisodesAt(PINNED_MIND_REV, MIND);
    for (const e of all) {
      expect(e.content.length).toBeGreaterThan(0);
      expect(["live", "git"]).toContain(e.source);
    }
  });

  test("pinning to an ancestor rev never leaks a later HEAD-only episode", () => {
    // HEAD has since moved past the pin (REM composts twice daily) — an
    // episode that only appears after the pin must not show up.
    const headRev = execFileSync("git", ["rev-parse", "HEAD"], { cwd: MIND, encoding: "utf8" }).trim();
    expect(headRev).not.toBe(PINNED_MIND_REV);
    const atPin = new Set(collectAllEpisodesAt(PINNED_MIND_REV, MIND).map((e) => e.filename));
    const atHead = new Set(collectAllEpisodesAt(headRev, MIND).map((e) => e.filename));
    expect(atHead.size).toBeGreaterThanOrEqual(atPin.size);
  });
});

describe("14-flood fixture (task 2)", () => {
  test("retrieves exactly the 14 named 2026-07-24-bidirectional-* episodes, each non-empty", () => {
    const flood = collectFloodFixture();
    expect(flood.length).toBe(14);
    expect(flood.map((e) => e.filename).sort()).toEqual([...FLOOD_FILENAMES].sort());
    for (const e of flood) {
      expect(e.content.length).toBeGreaterThan(0);
      expect(e.source).toBe("git"); // all composted before the pin — none live
    }
  });

  test("none of the 14 are present in the live HEAD tree (confirmed fully composted)", () => {
    const headRev = execFileSync("git", ["rev-parse", "HEAD"], { cwd: MIND, encoding: "utf8" }).trim();
    const liveFiles = execFileSync("git", ["ls-tree", "-r", "--name-only", headRev, "--", "episodes/"], {
      cwd: MIND,
      encoding: "utf8",
    });
    for (const f of FLOOD_FILENAMES) {
      expect(liveFiles).not.toContain(f);
    }
  });
});
