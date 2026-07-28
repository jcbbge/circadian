// immune.test.ts — pinned test coverage for the three health checks
// extracted from mutate.ts (popmem WS-H, dross deletion) plus
// selfSimilarity (also extracted — doctor.ts's redundancy check depends on
// it and it survives the mutation grammar's retirement). Origin-date tests
// are adapted from mutate.test.ts's "origin-date stamping" describe block:
// those tests drove makeStampGuard through applyMutations, which retired
// with mutate.ts, so here they call makeStampGuard directly — same
// fixtures, same assertions, adapted call site only.
import { describe, test, expect } from "bun:test";
import * as path from "path";
import { homedir } from "os";
import { execFileSync } from "child_process";
import { makeStampGuard, counterfeitQuotes, detectSelfStutter, selfSimilarity } from "./immune.ts";

const MIND_DIR = path.join(process.env.CIRCADIAN_HOME || path.join(homedir(), "circadian"), "mind");

// ---------------------------------------------------------------------
// makeStampGuard — origin-date stamping (moved from mutate.test.ts)
// ---------------------------------------------------------------------
describe("makeStampGuard", () => {
  const fixture = [
    "## Who I am across sessions", "", "I persist across context windows.", "",
    "## Doctrine", "",
    "**1. The first belief.** [ep:2026-07-10]",
    "Body of the first belief with its why-chain. [ep:2026-07-10]", "",
    "## Motifs", "", "- an existing motif line about rivers and lakes", "",
    "## How we work", "", "- an existing working agreement about staging files explicitly", "",
  ].join("\n");

  test("a run-date stamp outside the episode batch is corrected to the batch origin", () => {
    const guard = makeStampGuard(fixture, ["2026-07-16"]);
    const fixed = guard.fix("[ep:2026-07-27]", "ADD DOCTRINE");
    expect(fixed).toBe("[ep:2026-07-16]");
    expect(guard.corrections).toEqual([{ op: "ADD DOCTRINE", from: "2026-07-27", to: "2026-07-16" }]);
  });

  test("the origin is the newest episode date in the batch", () => {
    const guard = makeStampGuard(fixture, ["2026-07-16"]);
    expect(guard.origin).toBe("2026-07-16");
  });

  test("stamps the worldview already carries are preserved, and sloppy dates are zero-padded", () => {
    const guard = makeStampGuard(fixture, ["2026-07-16"]);
    expect(guard.fix("[ep:2026-07-10]", "DEEPEN")).toBe("[ep:2026-07-10]"); // pre-existing SELF stamp survives
    expect(guard.fix("[ep:2026-7-16]", "ADD MOTIF")).toBe("[ep:2026-07-16]"); // zero-padded, in-set, no correction
    expect(guard.corrections).toEqual([]);
  });

  test("without episodeDates the guard behaves as before (today's stamp, no correction pass)", () => {
    const guard = makeStampGuard(fixture);
    const today = new Date().toISOString().slice(0, 10);
    expect(guard.origin).toBe(today);
    expect(guard.fix("no stamp here", "DEEPEN")).toBe("no stamp here");
    expect(guard.corrections).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// counterfeitQuotes — quote integrity (moved from mutate.test.ts)
// ---------------------------------------------------------------------
describe("counterfeitQuotes", () => {
  const episode =
    'Session narrative with real testimony. jrg said "the grip returning to the hands that were open before" and the room went quiet.';

  test("a fabricated quoted span (>= 40 chars) is flagged", () => {
    const text =
      'New belief body. "This synthesized aphorism was never spoken by anyone in any transcript at all." — distilled this wave.';
    const misses = counterfeitQuotes(text, [episode]);
    expect(misses.length).toBe(1);
    expect(misses[0]).toContain("synthesized aphorism");
  });

  test("a genuine quoted span passes, tolerant of whitespace runs and curly quotes", () => {
    const text = 'Belief. “the grip returning to the   hands that were open before” — evidence from the session.';
    expect(counterfeitQuotes(text, [episode])).toEqual([]);
  });

  test("short scare-quotes are style, not testimony — ignored", () => {
    expect(counterfeitQuotes('a "short quote" and a "slightly longer but still short one"', [episode])).toEqual([]);
  });

  test("the prior SELF.md is a legal source (pre-existing quotes never re-flagged)", () => {
    const priorSelf = 'Doctrine body holding "an old quote that has lived in the worldview for many waves already".';
    const text = 'Rewritten body still holding "an old quote that has lived in the worldview for many waves already".';
    expect(counterfeitQuotes(text, [priorSelf])).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// detectSelfStutter — inward LTP, pinned against the REAL SELF.md as of
// mind commit 6271e09 (2026-07-26 rem wave, moved from mutate.test.ts)
// ---------------------------------------------------------------------
describe("detectSelfStutter", () => {
  const PINNED_REV = "6271e090226a9970b158399d621d69eac15c5a80";
  const pinnedSelf = execFileSync("git", ["show", `${PINNED_REV}:SELF.md`], { cwd: MIND_DIR, encoding: "utf8" });

  test("the live-status doctrine trio (8/16/17) clusters as one belief", () => {
    const report = detectSelfStutter(pinnedSelf);
    const family = report.doctrine.find((g) => g.some((d) => d.n === 8));
    expect(family).toBeDefined();
    const ns = family!.map((d) => d.n);
    expect(ns).toContain(8);
    expect(ns).toContain(16);
    expect(ns).toContain(17);
  });

  test("the heartbeat / high-water motif clusters are found", () => {
    const report = detectSelfStutter(pinnedSelf);
    expect(report.motifs.length).toBeGreaterThanOrEqual(2);
    const flat = report.motifs.flat().join(" | ");
    expect(flat).toContain("heartbeat");
    expect(flat).toContain("high-water mark");
  });

  test("genuinely distinct entries report nothing", () => {
    const distinct = [
      "## Who I am across sessions", "", "I persist.", "",
      "## Doctrine", "",
      "**1. The cliff is complexity accretion.** [ep:2026-07-16]",
      "Layers accrete until nobody holds the whole system in their head; distrust breeds compensation.", "",
      "**2. Storage dumb, metabolism smart.** [ep:2026-07-16]",
      "Plain markdown in git; every gram of intelligence lives in the processes around it.", "",
      "## Motifs", "",
      "- Lake vs river: storage pools; memory must flow.",
      "- The diamond: turn the problem in the light; every facet a different lens.", "",
      "## How we work", "", "- stage files explicitly, never git add -A", "",
    ].join("\n");
    const report = detectSelfStutter(distinct);
    expect(report.doctrine).toEqual([]);
    expect(report.motifs).toEqual([]);
  });

  test("a malformed SELF.md yields silence, never a throw", () => {
    expect(detectSelfStutter("not a worldview at all")).toEqual({
      threshold: 0.3,
      doctrine: [],
      motifs: [],
    });
  });
});

// ---------------------------------------------------------------------
// selfSimilarity — the accretion instrument (moved from accretion.test.ts;
// the static-fixture tests only — the live-SELF.md test was dropped
// because the population-memory switchover changed SELF.md's shape and
// content, so an assertion pinned to "the file on disk currently has
// duplication" is no longer a safe invariant to carry forward)
// ---------------------------------------------------------------------
describe("selfSimilarity — the accretion instrument", () => {
  test("a clean document scores near zero", () => {
    const clean = [
      "## Who I am across sessions",
      "",
      "I am a mind that persists in plain markdown, and my body has a size.",
      "",
      "## Doctrine",
      "",
      "**1. Shrinking is the work.** [ep:2026-07-24]",
      "A belief repeated is not a belief strengthened; it is a belief stuttering.",
      "",
      "## Motifs",
      "",
      "- The hearth that can also be swept.",
      "",
      "## How we work",
      "",
      "- Ground truth is the run log, never the theory.",
      "",
    ].join("\n");
    expect(selfSimilarity(clean).ratio).toBe(0);
  });

  test("catches paraphrase-grade repetition, not just verbatim", () => {
    const line = "All decisions are preceded by a live terminal-native inspection because the user demands to see the output.";
    const stuttering = [
      "## Who I am across sessions",
      "",
      "placeholder identity prose that is long enough to count as a unit here.",
      "",
      "## Doctrine",
      "",
      "**1. A.** [ep:2026-07-24]",
      line,
      `${line} This is now confirmed.`,
      `${line} This is now a core agreement.`,
      "",
      "## Motifs",
      "",
      "- a motif line long enough to be counted as a unit by the measure.",
      "",
      "## How we work",
      "",
      "- a working agreement long enough to be counted as a unit by measure.",
      "",
    ].join("\n");
    const sim = selfSimilarity(stuttering);
    expect(sim.ratio).toBeGreaterThan(0.2);
    expect(sim.worstOffender!.copies).toBe(3);
  });
});
