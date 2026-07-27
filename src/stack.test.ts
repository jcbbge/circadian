// stack.test.ts — the stacker's deterministic core (popmem WS-C, task 1):
// candidate shape validation, the counterfeit-quote assert, and the dedupe
// router, all LLM-free and pure. Real-fixture episode content is pinned to
// mind commit 6271e090226a9970b158399d621d69eac15c5a80 (the zoom.test.ts /
// gauntlet.test.ts pattern — no mocks of code under test).
import { describe, test, expect } from "bun:test";
import * as path from "path";
import { homedir } from "os";
import {
  MAX_CANDIDATES,
  BAND_LOW,
  BAND_HIGH,
  CandidateShapeError,
  parseCandidateBlock,
  processExtractCompletion,
  normalizeForQuoteMatch,
  quotesAreVerbatim,
  parseCompareToken,
  routeCandidate,
  frontmatterDate,
  buildExtractPrompt,
  buildComparePrompt,
  type ExistingAtomView,
} from "./stack.ts";
import { atomId } from "./atoms.ts";
import { significantTokens, jaccard } from "./ltp.ts";
import { collectAllEpisodesAt } from "./replay.ts";

const HOME = process.env.CIRCADIAN_HOME || path.join(homedir(), "circadian");
const MIND = path.join(HOME, "mind");
const PINNED_MIND_REV = "6271e090226a9970b158399d621d69eac15c5a80";

const FLOOD = collectAllEpisodesAt(PINNED_MIND_REV, MIND).filter((e) =>
  e.filename.startsWith("2026-07-24-bidirectional-")
);

// ---------------------------------------------------------------------
// counterfeit-quote assert (R3) — real episode content, pinned rev
// ---------------------------------------------------------------------
describe("counterfeit-quote assert — real episode fixtures", () => {
  test("14-flood fixture is present at the pinned rev (sanity)", () => {
    expect(FLOOD.length).toBe(14);
  });

  test("rejects a fabricated quote", () => {
    const episode = FLOOD[0];
    const fake = "this exact sentence was never written in any episode, invented for the test";
    expect(quotesAreVerbatim([fake], episode.content)).toBe(false);
  });

  test("passes a real verbatim quote pulled straight from the episode body", () => {
    const episode = FLOOD[0];
    // A real substring of the actual content — not retyped from memory, so it
    // is guaranteed byte-identical to what is actually on disk.
    const body = episode.content.replace(/^---\n[\s\S]*?\n---\n+/, "");
    const real = body.slice(0, 80);
    expect(real.trim().length).toBeGreaterThan(20);
    expect(quotesAreVerbatim([real], episode.content)).toBe(true);
  });

  test("normalization tolerates curly quotes/dashes/whitespace but not content changes", () => {
    const hay = 'He said "the cliff is complexity — accretion" to the room.';
    expect(quotesAreVerbatim(['the cliff is complexity — accretion'], hay)).toBe(true);
    expect(quotesAreVerbatim(["the cliff is complexity - accretion"], hay)).toBe(true); // ascii dash normalizes
    expect(quotesAreVerbatim(['the   cliff  is  complexity — accretion'], hay)).toBe(true); // whitespace runs
    expect(quotesAreVerbatim(["the cliff is simplicity accretion"], hay)).toBe(false); // real content change
  });

  test("processExtractCompletion rejects a candidate whose quote is counterfeit, keeps one with a real quote", () => {
    const episode = FLOOD[0];
    const body = episode.content.replace(/^---\n[\s\S]*?\n---\n+/, "");
    const realQuote = body.slice(0, 60).trim();
    const raw = [
      `kind: doctrine`,
      `claim: "A fabricated belief with an invented quote."`,
      `why: "because the test says so"`,
      `quote: "this text does not appear anywhere in the episode"`,
      ``,
      `kind: motif`,
      `claim: "A belief backed by a real verbatim quote."`,
      `why: "because it is actually in the episode"`,
      `quote: ${JSON.stringify(realQuote)}`,
    ].join("\n");

    const result = processExtractCompletion(raw, episode.content);
    expect(result.candidates.length).toBe(1);
    expect(result.candidates[0].claim).toBe("A belief backed by a real verbatim quote.");
    expect(result.rejected.length).toBe(1);
    expect(result.rejected[0].reason).toContain("counterfeit quote");
  });
});

// ---------------------------------------------------------------------
// candidate shape — structural rejection, no validator prose
// ---------------------------------------------------------------------
describe("parseCandidateBlock / processExtractCompletion — shape", () => {
  test("parses a well-formed block", () => {
    const c = parseCandidateBlock([
      `kind: doctrine`,
      `claim: "The cliff is complexity accretion."`,
      `why: "because it always has been"`,
      `quote: "the cliff was never in the code"`,
    ]);
    expect(c.kind).toBe("doctrine");
    expect(c.claim).toBe("The cliff is complexity accretion.");
    expect(c.quotes).toEqual(["the cliff was never in the code"]);
  });

  test("supports multiple quote: lines", () => {
    const c = parseCandidateBlock([
      `kind: motif`,
      `claim: "Motion is the metric."`,
      `why: "propagation is the signal"`,
      `quote: "first quote"`,
      `quote: "second quote"`,
    ]);
    expect(c.quotes).toEqual(["first quote", "second quote"]);
  });

  test("rejects a bad kind", () => {
    expect(() =>
      parseCandidateBlock([`kind: opinion`, `claim: "x"`, `why: "y"`, `quote: "z"`])
    ).toThrow(CandidateShapeError);
  });

  test("rejects a claim over 280 chars", () => {
    const long = "x".repeat(281);
    expect(() =>
      parseCandidateBlock([`kind: doctrine`, `claim: ${JSON.stringify(long)}`, `why: "y"`, `quote: "z"`])
    ).toThrow(/280/);
  });

  test("rejects zero quotes", () => {
    expect(() => parseCandidateBlock([`kind: doctrine`, `claim: "x"`, `why: "y"`])).toThrow(/no quote/);
  });

  test("rejects malformed JSON in a field", () => {
    expect(() =>
      parseCandidateBlock([`kind: doctrine`, `claim: not json`, `why: "y"`, `quote: "z"`])
    ).toThrow(CandidateShapeError);
  });

  test("caps at MAX_CANDIDATES, counting the overflow rather than silently dropping it", () => {
    const episodeContent = "irrelevant content with no quotes to match against";
    const blocks = Array.from({ length: 7 }, (_, i) =>
      [`kind: motif`, `claim: "claim number ${i}"`, `why: "why ${i}"`, `quote: "q${i}"`].join("\n")
    ).join("\n\n");
    // Use content containing every quote so none are rejected as counterfeit.
    const content = Array.from({ length: 7 }, (_, i) => `q${i}`).join(" ");
    const result = processExtractCompletion(blocks, content);
    expect(result.candidates.length).toBe(MAX_CANDIDATES);
    expect(result.droppedOverCap).toBe(7 - MAX_CANDIDATES);
    void episodeContent;
  });
});

// ---------------------------------------------------------------------
// COMPARE token parsing
// ---------------------------------------------------------------------
describe("parseCompareToken", () => {
  test("recognizes all four tokens, case/whitespace tolerant", () => {
    for (const [raw, expected] of [
      ["SAME", "SAME"],
      [" distinct \n", "DISTINCT"],
      ["Supersedes_A", "SUPERSEDES_A"],
      ["supersedes_b", "SUPERSEDES_B"],
    ] as const) {
      const r = parseCompareToken(raw);
      expect(r.token).toBe(expected);
      expect(r.valid).toBe(true);
    }
  });

  test("coerces anything else to DISTINCT with valid:false", () => {
    for (const raw of ["", "maybe", "SAME.", "I think they are the same", "SUPERSEDES"]) {
      const r = parseCompareToken(raw);
      expect(r.token).toBe("DISTINCT");
      expect(r.valid).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------
// dedupe router — the four regimes + in-batch stutter
// ---------------------------------------------------------------------
describe("routeCandidate — dedupe pipeline", () => {
  const BASE_CLAIM = "The cliff is complexity accretion across the whole system.";
  const HIGH_OVERLAP_CLAIM = "The cliff is complexity accretion across the entire codebase."; // ~0.5
  const MID_BAND_CLAIM = "The cliff of complexity keeps accreting inside every system we ship."; // ~0.27, in-band
  const LOW_OVERLAP_CLAIM = "Weight decays nightly across the population by a small multiplicative factor."; // ~0.08

  function existingFor(claim: string): ExistingAtomView[] {
    return [{ id: atomId(claim), claim }];
  }

  test("sanity: the four fixture pairs actually land in the regimes this suite exercises", () => {
    const ov = (a: string, b: string) => jaccard(significantTokens(a), significantTokens(b));
    expect(ov(BASE_CLAIM, HIGH_OVERLAP_CLAIM)).toBeGreaterThanOrEqual(BAND_HIGH);
    const mid = ov(BASE_CLAIM, MID_BAND_CLAIM);
    expect(mid).toBeGreaterThanOrEqual(BAND_LOW);
    expect(mid).toBeLessThan(BAND_HIGH);
    expect(ov(BASE_CLAIM, LOW_OVERLAP_CLAIM)).toBeLessThan(BAND_LOW);
  });

  test("exact hash match -> stack, no COMPARE call", async () => {
    let compareCalls = 0;
    const compare = () => {
      compareCalls++;
      return "SAME";
    };
    const decision = await routeCandidate(BASE_CLAIM, existingFor(BASE_CLAIM), compare);
    expect(decision.action).toBe("stack");
    expect(decision.targetAtomId).toBe(atomId(BASE_CLAIM));
    expect(decision.compareUsed).toBe(false);
    expect(compareCalls).toBe(0);
  });

  test("overlap >= BAND_HIGH -> auto-SAME, no COMPARE call", async () => {
    let compareCalls = 0;
    const compare = () => {
      compareCalls++;
      return "SAME";
    };
    const decision = await routeCandidate(HIGH_OVERLAP_CLAIM, existingFor(BASE_CLAIM), compare);
    expect(decision.action).toBe("stack");
    expect(decision.targetAtomId).toBe(atomId(BASE_CLAIM));
    expect(decision.compareUsed).toBe(false);
    expect(compareCalls).toBe(0);
  });

  test("overlap in [BAND_LOW, BAND_HIGH) -> routed to COMPARE; SAME verdict stacks", async () => {
    const seen: [string, string][] = [];
    const compare = (a: string, b: string) => {
      seen.push([a, b]);
      return "SAME";
    };
    const decision = await routeCandidate(MID_BAND_CLAIM, existingFor(BASE_CLAIM), compare);
    expect(decision.compareUsed).toBe(true);
    expect(seen.length).toBe(1);
    expect(seen[0]).toEqual([MID_BAND_CLAIM, BASE_CLAIM]);
    expect(decision.action).toBe("stack");
    expect(decision.targetAtomId).toBe(atomId(BASE_CLAIM));
  });

  test("in-band DISTINCT verdict -> new atom", async () => {
    const decision = await routeCandidate(MID_BAND_CLAIM, existingFor(BASE_CLAIM), () => "DISTINCT");
    expect(decision.action).toBe("new");
    expect(decision.compareUsed).toBe(true);
  });

  test("in-band SUPERSEDES_A -> supersede, existing atom is the loser", async () => {
    const decision = await routeCandidate(MID_BAND_CLAIM, existingFor(BASE_CLAIM), () => "SUPERSEDES_A");
    expect(decision.action).toBe("supersede");
    expect(decision.targetAtomId).toBe(atomId(BASE_CLAIM));
  });

  test("in-band SUPERSEDES_B -> stack (existing wins)", async () => {
    const decision = await routeCandidate(MID_BAND_CLAIM, existingFor(BASE_CLAIM), () => "SUPERSEDES_B");
    expect(decision.action).toBe("stack");
    expect(decision.targetAtomId).toBe(atomId(BASE_CLAIM));
  });

  test("an unrecognized COMPARE token coerces to DISTINCT (the safe default) and is flagged invalid", async () => {
    const decision = await routeCandidate(MID_BAND_CLAIM, existingFor(BASE_CLAIM), () => "banana");
    expect(decision.action).toBe("new");
    expect(decision.compareValid).toBe(false);
    expect(decision.compareToken).toBe("DISTINCT");
  });

  test("overlap below BAND_LOW -> new atom, no COMPARE call", async () => {
    let compareCalls = 0;
    const decision = await routeCandidate(LOW_OVERLAP_CLAIM, existingFor(BASE_CLAIM), () => {
      compareCalls++;
      return "SAME";
    });
    expect(decision.action).toBe("new");
    expect(decision.compareUsed).toBe(false);
    expect(compareCalls).toBe(0);
  });

  test("empty population -> always new, no COMPARE call", async () => {
    const decision = await routeCandidate(BASE_CLAIM, [], () => "SAME");
    expect(decision.action).toBe("new");
    expect(decision.compareUsed).toBe(false);
  });

  test("in-batch stutter: a second candidate overlapping the first (newly-added) atom collapses, deterministic order", async () => {
    // Simulates the CLI's own loop: population starts empty (no atoms on
    // disk yet), candidate 1 is new, candidate 2 (near-duplicate of 1)
    // must dedupe against candidate 1's freshly-minted id — not the disk.
    let population: ExistingAtomView[] = [];
    const compare = () => "SAME";

    const d1 = await routeCandidate(BASE_CLAIM, population, compare);
    expect(d1.action).toBe("new");
    population = [...population, { id: atomId(BASE_CLAIM), claim: BASE_CLAIM }];

    const d2 = await routeCandidate(HIGH_OVERLAP_CLAIM, population, compare);
    expect(d2.action).toBe("stack");
    expect(d2.targetAtomId).toBe(atomId(BASE_CLAIM));
  });

  test("highest-overlap existing atom wins when several are in range", async () => {
    const low = "Weight decays nightly by a small multiplicative factor at midnight.";
    const existing: ExistingAtomView[] = [
      { id: atomId(low), claim: low },
      { id: atomId(BASE_CLAIM), claim: BASE_CLAIM },
    ];
    const decision = await routeCandidate(HIGH_OVERLAP_CLAIM, existing, () => "SAME");
    expect(decision.action).toBe("stack");
    expect(decision.targetAtomId).toBe(atomId(BASE_CLAIM)); // the higher-overlap match, not `low`
  });
});

// ---------------------------------------------------------------------
// frontmatter date extraction
// ---------------------------------------------------------------------
describe("frontmatterDate", () => {
  test("extracts date from real episode frontmatter (pinned rev)", () => {
    const episode = FLOOD[0];
    expect(frontmatterDate(episode.content)).toMatch(/^2026-07-24$/);
  });

  test("returns null when frontmatter or date is missing", () => {
    expect(frontmatterDate("no frontmatter here at all")).toBeNull();
    expect(frontmatterDate("---\nsession: x\n---\nbody")).toBeNull();
  });
});

// ---------------------------------------------------------------------
// prompt builders — pure, no I/O
// ---------------------------------------------------------------------
describe("prompt builders", () => {
  test("EXTRACT prompt embeds the episode content and the candidate cap", () => {
    const p = buildExtractPrompt("EPISODE BODY MARKER");
    expect(p).toContain("EPISODE BODY MARKER");
    expect(p).toContain(String(MAX_CANDIDATES));
  });

  test("COMPARE prompt embeds both claims and the four tokens", () => {
    const p = buildComparePrompt("claim A text", "claim B text");
    expect(p).toContain("claim A text");
    expect(p).toContain("claim B text");
    for (const token of ["SAME", "DISTINCT", "SUPERSEDES_A", "SUPERSEDES_B"]) expect(p).toContain(token);
  });
});
