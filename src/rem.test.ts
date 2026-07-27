// rem.test.ts — unit tests for the pure decision functions extracted for the
// popmem WS-0 absorb freeze (docs/POPULATION-MEMORY.md R7/§12 WS-0). A full
// sandbox REM run needs the local LLM (~15 min per wave) and is impractical
// for a fast unit suite; these test the freeze-decision and backlog-counting
// logic in isolation, which is what the write-block guards on.
import { describe, test, expect, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";
import { computeFreezeDecision, countBacklog } from "./rem.ts";

const tmpFiles: string[] = [];
function tmpMarkerPath(): string {
  const p = path.join(tmpdir(), `rem-freeze-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  tmpFiles.push(p);
  return p;
}

afterEach(() => {
  while (tmpFiles.length) {
    const p = tmpFiles.pop()!;
    try {
      fs.unlinkSync(p);
    } catch {
      /* already gone or never created — fine */
    }
  }
});

describe("computeFreezeDecision", () => {
  test("no marker file => not frozen", () => {
    const p = tmpMarkerPath(); // never written
    expect(computeFreezeDecision(p)).toEqual({ frozen: false, reason: null });
  });

  test("marker file with reason text => frozen, reason trimmed", () => {
    const p = tmpMarkerPath();
    fs.writeFileSync(p, "  popmem WS-F not yet switched over\n");
    expect(computeFreezeDecision(p)).toEqual({ frozen: true, reason: "popmem WS-F not yet switched over" });
  });

  test("empty marker file => frozen, reason null", () => {
    const p = tmpMarkerPath();
    fs.writeFileSync(p, "");
    expect(computeFreezeDecision(p)).toEqual({ frozen: true, reason: null });
  });

  test("whitespace-only marker file => frozen, reason null", () => {
    const p = tmpMarkerPath();
    fs.writeFileSync(p, "   \n  ");
    expect(computeFreezeDecision(p)).toEqual({ frozen: true, reason: null });
  });
});

describe("countBacklog", () => {
  function fakeEpisode(filename: string, isNew: boolean) {
    return { filename, filepath: filename, content: "", hash: filename, isNew };
  }

  test("counts only isNew episodes", () => {
    const episodes = [fakeEpisode("a.md", true), fakeEpisode("b.md", false), fakeEpisode("c.md", true)];
    expect(countBacklog(episodes as any)).toBe(2);
  });

  test("zero when nothing is new", () => {
    const episodes = [fakeEpisode("a.md", false), fakeEpisode("b.md", false)];
    expect(countBacklog(episodes as any)).toBe(0);
  });

  test("zero on an empty episode list", () => {
    expect(countBacklog([])).toBe(0);
  });
});
