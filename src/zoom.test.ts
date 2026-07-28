// zoom.test.ts — the provenance drill pinned against the REAL mind on disk
// (repo doctrine: no mocks of the code under test; see ltp.test.ts). The
// malformed [ep:2026-07-6] stamp in the living SELF.md is a founding fixture
// here: normalization exists precisely because that stamp exists.
import { describe, test, expect } from "bun:test";
import * as path from "path";
import { homedir } from "os";
import * as fs from "fs";
import { execFileSync } from "child_process";
import {
  normalizeDate,
  parseQuery,
  collectEpisodes,
  matchEpisodes,
  gitDeletedEpisodes,
  selfLinesForDate,
  compostEntriesFor,
  taughtLine,
  nearestDates,
} from "./zoom.ts";
import { assertSandboxSafe, sectionTokens, seedNeedsShim, plantGenesisShim } from "./replay.ts";

const HOME = process.env.CIRCADIAN_HOME || path.join(homedir(), "circadian");
const MIND = path.join(HOME, "mind");
// Living-document fixtures are PINNED to a real mind revision (git history is
// the archive, MIND-SPEC): the 2026-07-27 21:00 rem wave normalized the
// malformed [ep:2026-07-6] stamp away and pruned the spine-ring compost entry
// out of the rolling window — the disease these tests document is only
// guaranteed to exist in history, exactly where zoom recovers things from.
const PINNED_MIND_REV = "6271e090226a9970b158399d621d69eac15c5a80";
const pinnedMindFile = (f: string) =>
  execFileSync("git", ["show", `${PINNED_MIND_REV}:${f}`], { cwd: MIND, encoding: "utf8" });

describe("query normalization", () => {
  test("zero-pads loose dates — the real malformed 2026-07-6 case", () => {
    expect(normalizeDate("2026-07-6")).toBe("2026-07-06");
    expect(normalizeDate("2026-7-6")).toBe("2026-07-06");
    expect(normalizeDate("2026-07-26")).toBe("2026-07-26");
    expect(normalizeDate("spine-ring")).toBeNull();
    expect(normalizeDate("2026-07")).toBeNull();
  });

  test("stamp dressing is stripped: brackets and ep: prefix, in any combination", () => {
    for (const raw of ["[ep:2026-07-26]", "ep:2026-07-26", "2026-07-26", "[2026-07-26]"]) {
      const q = parseQuery(raw);
      expect(q.kind).toBe("date");
      expect(q.date).toBe("2026-07-26");
    }
    // the malformed stamp normalizes through the same path
    expect(parseQuery("[ep:2026-07-6]").date).toBe("2026-07-06");
  });

  test("non-dates become case-insensitive name needles, .md stripped", () => {
    const q = parseQuery("Spine-Ring-Confirmed.md");
    expect(q.kind).toBe("name");
    expect(q.needle).toBe("spine-ring-confirmed");
  });
});

describe("match resolution against the real mind", () => {
  const records = collectEpisodes(MIND);

  test("the universe is live ∪ git-deleted, deduped by filename", () => {
    const live = fs.readdirSync(path.join(MIND, "episodes")).filter((f) => f.endsWith(".md"));
    const deleted = gitDeletedEpisodes(MIND);
    expect(records.length).toBeGreaterThanOrEqual(live.length);
    expect(records.length).toBeGreaterThan(deleted.size === 0 ? 0 : live.length);
    const names = records.map((r) => r.filename);
    expect(new Set(names).size).toBe(names.length); // no filename appears twice
    // every live file is present and marked live
    for (const f of live) {
      const rec = records.find((r) => r.filename === f);
      expect(rec).toBeDefined();
      expect(rec!.composted).toBe(false);
    }
  });

  test("a composted episode is recovered from git with its deleting commit", () => {
    // the founding fixture: spine-ring-confirmed was shed 2026-07-26. If the
    // history ever rewrites, any composted record still proves the contract.
    const composted = records.filter((r) => r.composted);
    expect(composted.length).toBeGreaterThan(0);
    for (const c of composted.slice(0, 5)) {
      expect(c.deletingCommit).toMatch(/^[0-9a-f]{7,}$/);
      expect(c.content.length).toBeGreaterThan(0);
    }
    const spine = records.find((r) => r.filename === "2026-07-26-spine-ring-confirmed.md");
    expect(spine).toBeDefined();
    expect(spine!.composted).toBe(true);
  });

  test("a date query matches by filename prefix; composted matches are permanent, live ones follow the metabolism", () => {
    const q = parseQuery("[ep:2026-07-26]");
    const matches = matchEpisodes(records, q);
    expect(matches.length).toBeGreaterThan(0);
    for (const m of matches) expect(m.filename.startsWith("2026-07-26-")).toBe(true);
    // the composted members of this date are in git history forever
    expect(matches.some((m) => m.composted)).toBe(true); // spine-ring et al were shed
    // live episodes come and go twice daily (the 21:00 wave composted all four
    // originals of this date mid-development) — so assert on whatever is live
    // NOW: every current working-tree episode must surface un-composted under
    // its own date query.
    const liveNow = fs.readdirSync(path.join(MIND, "episodes")).filter((f) => f.endsWith(".md"));
    for (const f of liveNow.slice(0, 3)) {
      const liveMatches = matchEpisodes(records, parseQuery(f.slice(0, 10)));
      expect(liveMatches.some((m) => m.filename === f && !m.composted)).toBe(true);
    }
  });

  test("a slug fragment matches case-insensitively; a bogus one matches nothing", () => {
    const hit = matchEpisodes(records, parseQuery("SPINE-RING"));
    expect(hit.length).toBeGreaterThanOrEqual(1);
    expect(matchEpisodes(records, parseQuery("no-such-episode-ever-xyzzy")).length).toBe(0);
  });

  test("nearestDates offers real dates for the miss message, nearest-first", () => {
    const near = nearestDates(records, parseQuery("2026-07-25"), 3);
    expect(near.length).toBeGreaterThan(0);
    expect(near[0]).toBe("2026-07-25"); // that date exists in the archive
    for (const d of near) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("provenance extraction", () => {
  test("SELF.md citation lookup finds the malformed [ep:2026-07-6] stamp via normalization", () => {
    const selfMd = pinnedMindFile("SELF.md"); // the malformed stamp as it really shipped
    expect(selfMd).toContain("[ep:2026-07-6]");
    const lines = selfLinesForDate(selfMd, "2026-07-06");
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((l) => l.includes("[ep:2026-07-6]"))).toBe(true);
  });

  test("compost.md entries are matched by filename in the fixed Composted: form", () => {
    const compostMd = pinnedMindFile("compost.md"); // rolling window — history holds the entry
    const entries = compostEntriesFor(compostMd, "2026-07-26-spine-ring-confirmed.md");
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) expect(e).toMatch(/Composted: .+ — .+ — lesson lives at/);
    expect(compostEntriesFor(compostMd, "never-composted-xyzzy.md")).toEqual([]);
  });

  test("taughtLine extracts the digestion-completeness receipt when present", () => {
    const withLine = "body\n\n**taught -> absorbed-where:** the lesson → SELF.md Doctrine[5]\n";
    expect(taughtLine(withLine)).toContain("taught -> absorbed-where");
    expect(taughtLine("an episode with no receipt")).toBeNull();
  });
});

describe("replay sandbox safety (HARD SAFETY assertion)", () => {
  test("rejects any path inside the real circadian home, including mind/", () => {
    expect(() => assertSandboxSafe(path.join(HOME, "mind"))).toThrow(/HARD SAFETY/);
    expect(() => assertSandboxSafe(path.join(HOME, "mind", "episodes"))).toThrow(/HARD SAFETY/);
    expect(() => assertSandboxSafe(HOME)).toThrow(/HARD SAFETY/);
    expect(() => assertSandboxSafe(path.join(HOME, "logs"))).toThrow(/HARD SAFETY/);
    // sneaky relative traversal that still resolves inside
    expect(() => assertSandboxSafe(path.join(HOME, "mind", "..", "mind"))).toThrow(/HARD SAFETY/);
  });

  test("accepts a genuinely external temp path", () => {
    expect(() => assertSandboxSafe("/tmp/circadian-replay-abc123")).not.toThrow();
  });
});

describe("replay genesis bootstrap shim", () => {
  test("the real templates/SELF.md needs the shim; the planted seed does not", () => {
    const template = fs.readFileSync(path.join(HOME, "templates", "SELF.md"), "utf8");
    expect(seedNeedsShim(template)).toBe(true); // empty Doctrine — parseSelf would throw
    const planted = plantGenesisShim(template);
    expect(seedNeedsShim(planted)).toBe(false);
    expect(planted).toContain("**1. Genesis (replay scaffold).** [ep:1970-01-01]");
    // the other three sections survive the graft
    for (const h of ["## Who I am across sessions", "## Motifs", "## How we work"]) {
      expect(planted).toContain(h);
    }
  });

  test("a v1-shaped worldview (numbered Doctrine) never needs the shim", () => {
    // PINNED, not live — this file's established pattern (see PINNED_MIND_REV
    // above). Root cause (popmem, not a pre-existing flake): the WS-F
    // switchover rewrote the live SELF.md into render.ts's atom-rendered
    // shape ("**claim** — quotes eps", no numbered "**N. " entries).
    // seedNeedsShim's check is the v1-envelope shape mutate.ts's parseSelf
    // (now src/immune.ts's internal parseSelf) requires — a real, populated
    // atom-rendered document reads as an EMPTY Doctrine section to that
    // check, a false positive against the NEW shape, not a regression in
    // seedNeedsShim itself (which nothing asked to understand render.ts's
    // format). buildSandbox only ever calls seedNeedsShim against
    // templates/SELF.md (a fixed, checked-in v1-shaped file) — never the
    // live mind's current SELF.md — so this invariant was never actually
    // exercised against the live document in production. Pinning to a rev
    // where the live document was still v1-shaped preserves the real
    // invariant: a genuinely populated Doctrine section never triggers the
    // genesis shim.
    const selfMd = pinnedMindFile("SELF.md");
    expect(seedNeedsShim(selfMd)).toBe(false);
  });
});

describe("replay section accounting", () => {
  test("sectionTokens splits the four MIND-SPEC sections of the real SELF.md", () => {
    const selfMd = fs.readFileSync(path.join(MIND, "SELF.md"), "utf8");
    const sections = sectionTokens(selfMd);
    expect(Object.keys(sections)).toEqual(["Who I am across sessions", "Doctrine", "Motifs", "How we work"]);
    for (const v of Object.values(sections)) expect(v).toBeGreaterThan(0);
    // Doctrine is the heavyweight section of the living worldview
    expect(sections["Doctrine"]).toBeGreaterThan(sections["Motifs"]);
  });
});
