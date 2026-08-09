// stack.test.ts — the stacker's deterministic core (popmem WS-C, task 1):
// candidate shape validation, the counterfeit-quote assert, and the dedupe
// router, all LLM-free and pure. Real-fixture episode content is pinned to
// mind commit 6271e090226a9970b158399d621d69eac15c5a80 (the zoom.test.ts /
// gauntlet.test.ts pattern — no mocks of code under test).
import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { homedir } from "os";
import {
  MAX_CANDIDATES,
  BAND_LOW,
  BAND_HIGH,
  COMPARE_TOP_K,
  EXTRACT_TEMPERATURE,
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
  FLASH_GRAIN,
  FLASH_BODY_MAX,
  FLASH_PAIRS_MAX,
  classifyExposure,
  stripFrontmatter,
  parseExposureTranscript,
  type ExistingAtomView,
  type ExposureClass,
} from "./stack.ts";
import { atomId, foldWeights, type LedgerEvent } from "./atoms.ts";
import { significantTokens, jaccard } from "./ltp.ts";
import { collectAllEpisodesAt } from "./replay.ts";

const HOME = process.env.CIRCADIAN_HOME || path.join(homedir(), "circadian");
const MIND = path.join(HOME, "mind");
const PINNED_MIND_REV = "6271e090226a9970b158399d621d69eac15c5a80";

const FLOOD = collectAllEpisodesAt(PINNED_MIND_REV, MIND).filter((e) =>
  e.filename.startsWith("2026-07-24-bidirectional-")
);

// ---------------------------------------------------------------------
// tuned knobs (popmem WS-C2, §10 fallback: widen deterministic band /
// temp-0 EXTRACT — never a bigger model)
// ---------------------------------------------------------------------
describe("WS-C2 tuned knobs", () => {
  test("BAND_LOW widened from 0.15 to 0.05", () => {
    expect(BAND_LOW).toBe(0.05);
  });
  test("COMPARE_TOP_K consults 2 in-band atoms", () => {
    expect(COMPARE_TOP_K).toBe(2);
  });
  test("EXTRACT runs at temperature 0", () => {
    expect(EXTRACT_TEMPERATURE).toBe(0);
  });
});

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
  const LOW_OVERLAP_CLAIM = "The user prefers terse replies without trailing summaries in every session."; // 0 overlap

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
// COMPARE_TOP_K — multi-atom band consult (popmem WS-C2, §10 fallback:
// widen deterministic routing, never a bigger model)
// ---------------------------------------------------------------------
describe("routeCandidate — COMPARE_TOP_K multi-atom band consult", () => {
  // Three atoms whose overlap against CANDIDATE all land in-band
  // [BAND_LOW, BAND_HIGH), distinctly ranked: TOP > SECOND > THIRD.
  const CANDIDATE = "The cliff is complexity accretion across the whole system.";
  const TOP = "The cliff is complexity accretion yet the rest of this sentence differs completely now."; // ~0.2727
  const SECOND = "The cliff is complexity accretion but nothing else about this matters here today."; // ~0.25
  const THIRD = "Complexity accretion across many unrelated other topics discussed during the long meeting."; // ~0.2308

  function threeInBand(): ExistingAtomView[] {
    return [
      { id: atomId(THIRD), claim: THIRD },
      { id: atomId(TOP), claim: TOP },
      { id: atomId(SECOND), claim: SECOND },
    ];
  }

  test("sanity: TOP > SECOND > THIRD, all within [BAND_LOW, BAND_HIGH)", () => {
    const ov = (b: string) => jaccard(significantTokens(CANDIDATE), significantTokens(b));
    const [top, second, third] = [ov(TOP), ov(SECOND), ov(THIRD)];
    expect(top).toBeGreaterThan(second);
    expect(second).toBeGreaterThan(third);
    for (const o of [top, second, third]) {
      expect(o).toBeGreaterThanOrEqual(BAND_LOW);
      expect(o).toBeLessThan(BAND_HIGH);
    }
  });

  test("second-highest SAME wins when the highest is DISTINCT; THIRD is never consulted (topK=2)", async () => {
    const seen: string[] = [];
    const compare = (_a: string, b: string) => {
      seen.push(b);
      if (b === TOP) return "DISTINCT";
      if (b === SECOND) return "SAME";
      throw new Error(`THIRD must not be consulted at topK=2, got compare against: ${b}`);
    };
    const decision = await routeCandidate(CANDIDATE, threeInBand(), compare);
    expect(decision.action).toBe("stack");
    expect(decision.targetAtomId).toBe(atomId(SECOND));
    expect(decision.compareCallCount).toBe(2);
    expect(seen).toEqual([TOP, SECOND]);
  });

  test("short-circuits on a SAME from the highest-overlap atom — second is never consulted", async () => {
    const seen: string[] = [];
    const compare = (_a: string, b: string) => {
      seen.push(b);
      return "SAME";
    };
    const decision = await routeCandidate(CANDIDATE, threeInBand(), compare);
    expect(decision.action).toBe("stack");
    expect(decision.targetAtomId).toBe(atomId(TOP));
    expect(decision.compareCallCount).toBe(1);
    expect(seen).toEqual([TOP]);
  });

  test("a SUPERSEDES_A on the highest is remembered but a later SAME still wins (SAME > SUPERSEDES priority)", async () => {
    const compare = (_a: string, b: string) => {
      if (b === TOP) return "SUPERSEDES_A";
      if (b === SECOND) return "SAME";
      throw new Error("unexpected consult");
    };
    const decision = await routeCandidate(CANDIDATE, threeInBand(), compare);
    expect(decision.action).toBe("stack");
    expect(decision.targetAtomId).toBe(atomId(SECOND));
    expect(decision.compareCallCount).toBe(2);
  });

  test("the FIRST SUPERSEDES_A wins when nothing later resolves SAME", async () => {
    const compare = (_a: string, b: string) => {
      if (b === TOP) return "SUPERSEDES_A";
      if (b === SECOND) return "DISTINCT";
      throw new Error("unexpected consult");
    };
    const decision = await routeCandidate(CANDIDATE, threeInBand(), compare);
    expect(decision.action).toBe("supersede");
    expect(decision.targetAtomId).toBe(atomId(TOP));
    expect(decision.compareCallCount).toBe(2);
  });

  test("both consulted atoms DISTINCT -> new atom, compareCallCount 2, THIRD still uncalled", async () => {
    const seen: string[] = [];
    const compare = (_a: string, b: string) => {
      seen.push(b);
      return "DISTINCT";
    };
    const decision = await routeCandidate(CANDIDATE, threeInBand(), compare);
    expect(decision.action).toBe("new");
    expect(decision.compareCallCount).toBe(2);
    expect(seen).toEqual([TOP, SECOND]);
  });

  test("an unrecognized token on one of two consulted atoms is counted in compareInvalidCount", async () => {
    const decision = await routeCandidate(CANDIDATE, threeInBand(), (_a: string, b: string) =>
      b === TOP ? "banana" : "DISTINCT"
    );
    expect(decision.action).toBe("new");
    expect(decision.compareCallCount).toBe(2);
    expect(decision.compareInvalidCount).toBe(1);
  });

  test("a custom topK narrows or widens how many in-band atoms are consulted", async () => {
    let calls = 0;
    const compare = () => {
      calls++;
      return "DISTINCT";
    };
    const decisionTop1 = await routeCandidate(CANDIDATE, threeInBand(), compare, { topK: 1 });
    expect(decisionTop1.compareCallCount).toBe(1);

    calls = 0;
    const decisionTop3 = await routeCandidate(CANDIDATE, threeInBand(), compare, { topK: 3 });
    expect(decisionTop3.compareCallCount).toBe(3);
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

// ---------------------------------------------------------------------
// exposure metering — flash vs standard (wave-optics W2)
// ---------------------------------------------------------------------

/** Reads a REAL episode pinned at the pre-purge snapshot rev (no mocks of
 * code under test — the repo doctrine). These fixtures were originally read
 * from the working tree; the 2026-08-09 purge (mind commit 87436ff) expelled
 * the drone corpus from disk, and the snapshot commit 7c4dc18 is where that
 * evidence lives forever. Same episodes, same ids, preserved location — the
 * pin is now actually content-stable, as the original comment intended. */
const PRE_PURGE_REV = "7c4dc18";
function readEpisode(filename: string): { name: string; body: string } {
  const r = Bun.spawnSync(["git", "-C", MIND, "show", `${PRE_PURGE_REV}:episodes/${filename}`]);
  if (r.exitCode !== 0) {
    throw new Error(
      `pinned episode ${filename} not found at mind rev ${PRE_PURGE_REV} — ` +
        `the evidence this suite is pinned to must exist in the snapshot; do not retarget`
    );
  }
  return { name: filename, body: r.stdout.toString() };
}

// The ACK / genesis fixtures — the canonical flash vs standard anchors:
const ACK_EPISODE = () => readEpisode("2026-08-05-passive-telemetry-sink.md");
const GENESIS_EPISODE = () => readEpisode("2026-07-28-genesis-archaeology.md");

describe("exposure metering knobs (W2)", () => {
  test("FLASH_GRAIN is 0.25 — flash deposits at a quarter weight", () => {
    expect(FLASH_GRAIN).toBe(0.25);
  });
  test("FLASH_BODY_MAX / FLASH_PAIRS_MAX are tuned, bounded knobs", () => {
    expect(FLASH_BODY_MAX).toBe(2600);
    expect(FLASH_PAIRS_MAX).toBe(2);
  });
});

describe("classifyExposure — real episodes, PINNED (W2)", () => {
  test("the ACK episode (passive-telemetry-sink) classifies FLASH", () => {
    const ep = ACK_EPISODE();
    expect(classifyExposure(ep)).toBe("flash");
  });

  test("genesis-archaeology (authored archaeology, 8k chars) classifies STANDARD", () => {
    const ep = GENESIS_EPISODE();
    expect(classifyExposure(ep)).toBe("standard");
  });

  test("verdict-hook-validation-3 — identical-quote echo — classifies FLASH", () => {
    const ep = readEpisode("2026-07-28-verdict-hook-validation-3.md");
    expect(classifyExposure(ep)).toBe("flash");
  });

  test("hello-world-write (prose rendition) classifies FLASH via transcript head", () => {
    const ep = readEpisode("2026-08-03-hello-world-write.md");
    expect(classifyExposure(ep)).toBe("flash");
  });

  test("a role-brief worker execution (ws-g-execution) classifies FLASH", () => {
    const ep = readEpisode("2026-07-27-ws-g-execution.md");
    expect(classifyExposure(ep)).toBe("flash");
  });

  test("a substantive short session (tower-gate, 618 chars) classifies STANDARD — body evidence over length", () => {
    const ep = readEpisode("2026-07-27-tower-gate.md");
    expect(classifyExposure(ep)).toBe("standard");
  });

  test("a multi-pair design session (the-river-remembers) classifies STANDARD", () => {
    const ep = readEpisode("2026-07-28-the-river-remembers.md");
    expect(classifyExposure(ep)).toBe("standard");
  });

  test("a real engineering finding (instrument-over-model) classifies STANDARD", () => {
    const ep = readEpisode("2026-08-06-instrument-over-model.md");
    expect(classifyExposure(ep)).toBe("standard");
  });

  test("flash requires body evidence — a long echo-looking transcript is standard", () => {
    const ep = readEpisode("2026-08-03-neural-avalanche-integration.md");
    expect(classifyExposure(ep)).toBe("standard"); // 2638 chars > FLASH_BODY_MAX
  });
});

describe("parseExposureTranscript — real episodes (W2)", () => {
  test("ACK episode: 1 labeled pair, first user turn is the role brief", () => {
    const t = parseExposureTranscript(stripFrontmatter(ACK_EPISODE().body));
    expect(t.pairs).toBe(1);
    expect(t.firstUserTurn).toContain("passive telemetry sink");
  });
  test("CAIRN kickoff-4: unlabeled alternating quote pair", () => {
    const ep = readEpisode("2026-08-06-cairn-kickoff-4.md");
    const t = parseExposureTranscript(stripFrontmatter(ep.body));
    expect(t.pairs).toBeGreaterThanOrEqual(1);
    expect(t.firstUserTurn).toMatch(/CAIRN/);
  });
  test("genesis-archaeology: prose, no transcript pairs", () => {
    const t = parseExposureTranscript(stripFrontmatter(GENESIS_EPISODE().body));
    expect(t.pairs).toBe(0);
  });
});

describe("grain — flash stack events deposit fractionally in fold (W2)", () => {
  test("absent grain folds as full weight (backward compatibility — the ACK episode's siblings never carried grain)", () => {
    const events: LedgerEvent[] = [
      { ev: "stack", atom: "A", ep: "2026-07-28-genesis-archaeology.md", ts: "t1" },
      { ev: "stack", atom: "A", ep: "2026-07-28-genesis-archaeology.md", ts: "t2" },
    ];
    expect(foldWeights(events).get("A")?.weight).toBe(2);
  });

  test("grain 0.25 stack events deposit at a quarter, and stack still marks decay-eligibility", () => {
    const events: LedgerEvent[] = [
      { ev: "stack", atom: "A", ep: "2026-08-05-passive-telemetry-sink.md", ts: "t1", grain: FLASH_GRAIN },
      { ev: "stack", atom: "A", ep: "2026-08-05-passive-telemetry-sink.md", ts: "t2", grain: FLASH_GRAIN },
      { ev: "decay", factor: 0.5, ts: "t3" },
    ];
    const states = foldWeights(events);
    // 0.25 + 0.25 = 0.5, then decay x0.5 = 0.25
    expect(states.get("A")?.weight).toBeCloseTo(0.25);
    expect(states.get("A")?.status).toBe("active");
  });

  test("a grain-bearing flash stack makes an atom decay-eligible exactly like a full stack", () => {
    const events: LedgerEvent[] = [
      { ev: "stack", atom: "A", ep: "2026-08-05-passive-telemetry-sink.md", ts: "t1", grain: FLASH_GRAIN },
      { ev: "decay", factor: 0.9, ts: "t2" },
    ];
    const states = foldWeights(events);
    expect(states.get("A")?.weight).toBeCloseTo(0.225); // 0.25 * 0.9
  });

  test("mixed ledger: flash grain and full-weight stacks fold independently", () => {
    const events: LedgerEvent[] = [
      { ev: "stack", atom: "FLASH", ep: "2026-08-05-passive-telemetry-sink.md", ts: "t1", grain: FLASH_GRAIN },
      { ev: "stack", atom: "FULL", ep: "2026-07-28-genesis-archaeology.md", ts: "t2" },
      { ev: "stack", atom: "FULL", ep: "2026-07-28-genesis-archaeology.md", ts: "t3" },
    ];
    const states = foldWeights(events);
    expect(states.get("FLASH")?.weight).toBeCloseTo(0.25);
    expect(states.get("FULL")?.weight).toBe(2);
  });
});

describe("classifyExposure — other real flashes and standards (W2)", () => {
  test("the whole ack/verdict/ok/pong/cairn family classifies flash", () => {
    const flashes = [
      "2026-08-03-ok-acknowledgment.md",
      "2026-08-06-ok-acknowledgment.md",
      "2026-08-03-ok-acknowledgment-2.md",
      "2026-07-28-verdict-hook-confirmation.md",
      "2026-07-28-verdict-hook-validation-2.md",
      "2026-07-28-pong-echo.md",
      "2026-08-06-cairn-kickoff-4.md",
      "2026-08-06-worker-1-done-confirmation.md",
      "2026-08-05-telemetry-sink-confirmation.md",
      "2026-08-03-hello-world-echo.md",
      "2026-08-05-ready-confirmation.md",
      "2026-08-03-hello-world-write-3.md",
      "2026-07-27-ws-0-fix-hotfix.md",
      "2026-08-05-claim-gate-validation.md",
    ];
    for (const f of flashes) {
      expect(classifyExposure(readEpisode(f))).toBe("flash");
    }
  });

  test("substantive sessions classify standard — relay, finding, debugging, orchestration", () => {
    const standards = [
      "2026-08-06-ws-f2-acceptance-finalization.md",
      "2026-08-05-tower-scoping-fix.md",
      "2026-08-04-tunick-s-ghost.md",
      "2026-08-05-control-plane-illusion.md",
      "2026-08-05-orchestrator-launch.md",
      "2026-08-06-bb-app-crash.md",
      "2026-08-06-water-as-negative-mold.md",
      "2026-08-06-e-is-live.md",
    ];
    for (const f of standards) {
      expect(classifyExposure(readEpisode(f))).toBe("standard");
    }
  });
});
