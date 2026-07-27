// mutate.test.ts — the mutation engine tested against a REAL SELF.md (repo
// doctrine: no mocks — real data). The fixture is PINNED to mind revision
// 6271e09 (the 2026-07-26 rem wave) rather than read live: the 2026-07-27
// 21:00 wave merged Doctrine 2/3/5 away mid-development and every test that
// addressed those numbers went red — the living document is a moving target
// by design (the metabolism rewrites it twice daily), and a suite anchored to
// its momentary shape asserts the weather, not the engine. Git history is the
// archive (MIND-SPEC), so the pinned document is real, permanent, and immune
// to compost — the same cure ltp.test.ts applied when its flood fixture was
// quarantined out from under it.
import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { homedir } from "os";
import { execFileSync } from "child_process";
import { parseMutations, applyMutations, noChangeGreeting, counterfeitQuotes, detectSelfStutter } from "./mutate.ts";

const MIND_DIR = path.join(
  process.env.CIRCADIAN_HOME || path.join(homedir(), "circadian"),
  "mind"
);
const SELF_PATH = path.join(MIND_DIR, "SELF.md");
const PINNED_MIND_REV = "6271e090226a9970b158399d621d69eac15c5a80";
const realSelf = execFileSync("git", ["show", `${PINNED_MIND_REV}:SELF.md`], { cwd: MIND_DIR, encoding: "utf8" });

describe("parseMutations", () => {
  test("parses every grammar form", () => {
    const { mutations: muts } = parseMutations(
      [
        "CONFIRM Doctrine[5]",
        "DEEPEN Doctrine[2] :: propagation failure is itself a signal — jrg caught the flatline by gut, not telemetry.",
        "SUPERSEDE Doctrine[3] :: new body text",
        "RETRACT Doctrine[6] :: superseded by lived practice",
        "ADD DOCTRINE :: The null action must cost more than change :: echo was free; now stagnation requires a signed confession. [ep:2026-07-24]",
        "ADD MOTIF :: The signed confession: stagnation must speak its name at wake.",
        "RETRACT MOTIF :: The diamond",
        "AMEND HowWeWork :: Flatlines are ruled on by jrg at wake, never smoothed over by the system.",
        "AMEND WhoIAm :: I mutate; I do not rewrite.",
      ].join("\n")
    );
    expect(muts.length).toBe(9);
    expect(muts[0]).toEqual({ op: "confirm", n: 5 });
    expect(muts[4].op).toBe("add-doctrine");
  });

  test("empty block throws — silence is not an option", () => {
    expect(() => parseMutations("")).toThrow(/silence is not an option/);
    expect(() => parseMutations("\n  \n")).toThrow(/silence is not an option/);
  });

  test("NO-CHANGE mixed with mutations: mutations win, confession dropped loudly", () => {
    const r = parseMutations("CONFIRM Doctrine[1]\nNO-CHANGE :: nothing moved");
    expect(r.mutations.length).toBe(1);
    expect(r.droppedConfession).toBe("nothing moved");
  });

  test("all-garbage block throws — silence is not an option", () => {
    expect(() => parseMutations("REWRITE EVERYTHING PLEASE")).toThrow(/silence is not an option/);
  });

  test("mixed garbage and valid: valid applies, garbage collected", () => {
    const r = parseMutations("REWRITE EVERYTHING\nCONFIRM Doctrine[1]");
    expect(r.mutations.length).toBe(1);
    expect(r.malformed.length).toBe(1);
  });

  test("titleless ADD DOCTRINE derives a title instead of dropping the belief", () => {
    const r = parseMutations("ADD DOCTRINE :: \"Memory is not a static ledger — it is a live flow that survives compaction\"");
    expect(r.mutations[0].op).toBe("add-doctrine");
    // @ts-expect-error narrowed at runtime
    expect(r.mutations[0].title).toBe("Memory is not a static ledger");
  });
});

describe("applyMutations against the real SELF.md", () => {
  test("CONFIRM stamps and refreshes without duplicating", () => {
    // The living document may already carry a confirm on Doctrine[5] from a
    // real wave (it earned it; the test must not assume a virgin world). The
    // invariant is REFRESH-NOT-ACCUMULATE: after N confirms of the same
    // belief, its title line holds exactly ONE stamp, and the rest of the
    // document's stamps are untouched.
    const d5Line = (s: string) => s.split("\n").find((l) => /^\*\*5\.\s/.test(l)) || "";
    const othersBaseline = (realSelf.match(/\[confirmed:/g) || []).length - (d5Line(realSelf).match(/\[confirmed:/g) || []).length;
    const once = applyMutations(realSelf, parseMutations("CONFIRM Doctrine[5]").mutations);
    expect(once.applied.length).toBe(1);
    expect(once.text).toMatch(/\*\*5\. .*\[confirmed:\d{4}-\d{2}-\d{2}\]/);
    const twice = applyMutations(once.text, parseMutations("CONFIRM Doctrine[5]").mutations);
    expect((d5Line(twice.text).match(/\[confirmed:/g) || []).length).toBe(1);
    expect((twice.text.match(/\[confirmed:/g) || []).length).toBe(othersBaseline + 1);
  });

  test("DEEPEN appends the why-chain, auto-stamped", () => {
    const r = applyMutations(
      realSelf,
      parseMutations("DEEPEN Doctrine[2] :: a flatline the telemetry misses but the user's gut catches is the load-bearing test failing in the open.").mutations
    );
    expect(r.text).toContain("the user's gut catches");
    expect(r.text).toMatch(/gut catches is the load-bearing test failing in the open\. \[ep:\d{4}-\d{2}-\d{2}\]/);
  });

  test("ADD DOCTRINE numbers itself after the last entry", () => {
    const r = applyMutations(
      realSelf,
      parseMutations("ADD DOCTRINE :: The null action must cost more than change :: when rewriting was the task, echo was the rational strategy; mutations invert the gradient. [ep:2026-07-24]").mutations
    );
    // Next number derives from the living document — the doctrine count grows
    // as real waves add beliefs; the test tracks the organism, not a snapshot.
    const lastN = Math.max(...[...realSelf.matchAll(/\*\*(\d+)\.\s/g)].map((m) => parseInt(m[1], 10)));
    expect(r.text).toContain(`**${lastN + 1}. The null action must cost more than change.**`);
  });

  test("RETRACT + ADD MOTIF perform surgery on the motif list only", () => {
    const r = applyMutations(
      realSelf,
      parseMutations("RETRACT MOTIF :: The diamond\nADD MOTIF :: The signed confession: stagnation speaks its name at wake.").mutations
    );
    expect(r.text).not.toContain("The diamond: turn the problem");
    expect(r.text).toContain("The signed confession");
    // Doctrine untouched
    expect(r.text).toContain("**1. The cliff is complexity accretion.**");
  });

  test("hallucinated target is rejected loudly, valid ones still apply", () => {
    const r = applyMutations(
      realSelf,
      parseMutations("CONFIRM Doctrine[99]\nCONFIRM Doctrine[1]").mutations
    );
    expect(r.applied.length).toBe(1);
    expect(r.rejected.length).toBe(1);
    expect(r.rejected[0].reason).toContain("no such doctrine");
  });

  test("ALL mutations missing their targets throws — back-pressure, not silence", () => {
    expect(() =>
      applyMutations(realSelf, parseMutations("CONFIRM Doctrine[99]").mutations)
    ).toThrow(/isn't the one on disk/);
  });

  test("NO-CHANGE returns the document untouched plus the confession", () => {
    const r = applyMutations(
      realSelf,
      parseMutations("NO-CHANGE :: six sync-test episodes repeat a lesson Doctrine[5] already holds — the work is circling the same validation loop.").mutations
    );
    expect(r.text).toBe(realSelf);
    expect(r.noChange).toContain("circling the same validation loop");
    const greeting = noChangeGreeting(r.noChange!);
    expect(greeting).toContain("Nothing moved through the night");
    expect(greeting).toContain("Either the work is circling or I am");
  });

  test("duplicate-quote guard: re-deepening with already-held text degrades to CONFIRM", () => {
    const first = applyMutations(realSelf, parseMutations("DEEPEN Doctrine[4] :: the vasculature lesson held again in live PTY testing tonight.").mutations);
    expect(first.applied[0]).toStartWith("DEEPEN Doctrine[4]");
    // Same substance, different dress: quotes + case + an ep-stamp
    const second = applyMutations(first.text, parseMutations('DEEPEN Doctrine[4] :: "The vasculature lesson HELD again in live PTY testing tonight." [ep:2026-07-25]').mutations);
    expect(second.applied[0]).toContain("DEEPEN→CONFIRM Doctrine[4]");
    // Body did not grow a second copy
    const hits = second.text.match(/vasculature lesson held again in live PTY testing tonight/gi) || [];
    expect(hits.length).toBe(1);
    // But the decay clock refreshed
    expect(second.text).toMatch(/\*\*4\..*\[confirmed:\d{4}-\d{2}-\d{2}\]/);
  });

  test("duplicate-quote guard: genuinely new text still deepens normally", () => {
    const first = applyMutations(realSelf, parseMutations("DEEPEN Doctrine[4] :: first insight about circulation.").mutations);
    const second = applyMutations(first.text, parseMutations("DEEPEN Doctrine[4] :: a different second insight about flow direction.").mutations);
    expect(second.applied[0]).toStartWith("DEEPEN Doctrine[4]");
    expect(second.text).toContain("first insight about circulation");
    expect(second.text).toContain("different second insight about flow direction");
  });

  test("round-trip: apply then re-parse — the rendered document stays parseable", () => {
    const r1 = applyMutations(realSelf, parseMutations("DEEPEN Doctrine[1] :: first pass.").mutations);
    const r2 = applyMutations(r1.text, parseMutations("DEEPEN Doctrine[1] :: second pass.\nCONFIRM Doctrine[3]").mutations);
    expect(r2.applied.length).toBe(2);
    expect(r2.text).toContain("first pass.");
    expect(r2.text).toContain("second pass.");
  });
});

// ---------------------------------------------------------------------
// origin-date stamping — the replay finding (2026-07-27): [ep:] stamps are
// zoom addresses and must name the source episode's date, never the run date.
// ---------------------------------------------------------------------
describe("origin-date stamping", () => {
  const fixture = [
    "## Who I am across sessions", "", "I persist across context windows.", "",
    "## Doctrine", "",
    "**1. The first belief.** [ep:2026-07-10]",
    "Body of the first belief with its why-chain. [ep:2026-07-10]", "",
    "## Motifs", "", "- an existing motif line about rivers and lakes", "",
    "## How we work", "", "- an existing working agreement about staging files explicitly", "",
  ].join("\n");

  test("a run-date stamp on a 2026-07-16 episode batch is corrected to [ep:2026-07-16]", () => {
    const { mutations } = parseMutations(
      "ADD DOCTRINE :: A genuinely new belief :: The body carries its full why-chain and reasoning. [ep:2026-07-27]"
    );
    const r = applyMutations(fixture, mutations, { episodeDates: ["2026-07-16"] });
    expect(r.text).toContain("[ep:2026-07-16]");
    expect(r.text).not.toContain("[ep:2026-07-27]");
    expect(r.stampCorrections.length).toBe(1);
    expect(r.stampCorrections[0].from).toBe("2026-07-27");
    expect(r.stampCorrections[0].to).toBe("2026-07-16");
  });

  test("an unstamped ADD is stamped with the batch origin date, not today", () => {
    const { mutations } = parseMutations(
      "ADD DOCTRINE :: Another new belief :: A body with reasoning behind the conclusion."
    );
    const r = applyMutations(fixture, mutations, { episodeDates: ["2026-07-16"] });
    const today = new Date().toISOString().slice(0, 10);
    expect(r.text).toContain("**2. Another new belief.** [ep:2026-07-16]");
    expect(r.text).not.toContain(`[ep:${today}]`);
    expect(r.stampCorrections).toEqual([]); // nothing to correct — the engine stamped it right the first time
  });

  test("stamps the worldview already carries are preserved, and sloppy dates are zero-padded", () => {
    const { mutations } = parseMutations(
      "DEEPEN Doctrine[1] :: Restating held history keeps its address. [ep:2026-07-10]\n" +
      "ADD MOTIF :: a theme born of the malformed stamp [ep:2026-7-16]"
    );
    const r = applyMutations(fixture, mutations, { episodeDates: ["2026-07-16"] });
    expect(r.text).toContain("keeps its address. [ep:2026-07-10]"); // pre-existing SELF stamp survives
    expect(r.text).toContain("[ep:2026-07-16]"); // 2026-7-16 normalized, in-set, no correction
    expect(r.stampCorrections).toEqual([]);
  });

  test("without episodeDates the engine behaves as before (today's stamp, no correction pass)", () => {
    const { mutations } = parseMutations("DEEPEN Doctrine[1] :: New reasoning without any stamp attached.");
    const r = applyMutations(fixture, mutations);
    const today = new Date().toISOString().slice(0, 10);
    expect(r.text).toContain(`[ep:${today}]`);
    expect(r.stampCorrections).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// quote integrity — the replay finding (2026-07-27): quotation marks are
// reserved for verbatim source text; a synthesized aphorism in quotes is
// counterfeit verbatim, and the validator names it.
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
// inward LTP — stutter detection pinned against the REAL SELF.md as of mind
// commit 6271e09 (2026-07-26 rem wave), the revision where the live stutter
// was measured: Doctrine 8/16/17 carry one "live status flow" belief and the
// heartbeat motifs repeat. Git history is the archive (MIND-SPEC), so the
// fixture can never rot out from under the test — same pattern as ltp.test.ts.
// ---------------------------------------------------------------------
describe("detectSelfStutter", () => {
  const MIND = path.dirname(SELF_PATH);
  const PINNED_REV = "6271e090226a9970b158399d621d69eac15c5a80";
  const pinnedSelf = execFileSync("git", ["show", `${PINNED_REV}:SELF.md`], { cwd: MIND, encoding: "utf8" });

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
// N-way MERGE — born from the real wave of 2026-07-26: the model emitted a
// FIVE-way merge of the live-status stutter family (exactly what the merge
// directive demands) and the pairwise-only grammar dropped it as malformed.
// The fixture is shaped like the living Doctrine at mind commit 6271e09:
// entries 4/8/13/16/17 carrying one belief under distinct [ep:] stamps.
// ---------------------------------------------------------------------
describe("N-way MERGE", () => {
  const familyFixture = [
    "## Who I am across sessions", "", "I persist.", "",
    "## Doctrine", "",
    "**1. The cliff is complexity accretion.** [ep:2026-07-16]",
    "Layers accrete until nobody can hold the system in their head.", "",
    "**2. Storage dumb, metabolism smart.** [ep:2026-07-16]",
    "Plain markdown in git; the intelligence lives in the processes.", "",
    "**4. Nine disconnected memory organs needed vasculature, not a tenth organ.** [ep:2026-07-24]",
    "There is nothing left to build; there is only circulation to restore.", "",
    "**8. Pi's live status is a visual contract.** [ep:2026-07-24] [confirmed:2026-07-25]",
    "One line updating in place, a glyph, elapsed time, a hairline mark settling at turn-end.", "",
    "**13. The board is the living pulse of the work.** [ep:2026-07-25]",
    "High-water mark persistence across session restarts is the continuity metric. [ep:2026-07-25]", "",
    "**16. The live status flow is a visual contract.** [ep:2026-07-26]",
    "A single line updates in place, with a glyph and elapsed time.", "",
    "**17. The live status flow is a living, responsive interface.** [ep:2026-07-26]",
    "Its high-water mark persistence across restarts is the only metric that matters. [ep:2026-07-26]", "",
    "## Motifs", "", "- Lake vs river: storage pools; memory must flow.", "",
    "## How we work", "", "- stage files explicitly, never git add -A", "",
  ].join("\n");

  const FIVE_WAY =
    "MERGE Doctrine[4] <- Doctrine[8] <- Doctrine[13] <- Doctrine[16] <- Doctrine[17] :: " +
    "The live status flow is a visual contract — a single line updates in place, with a glyph and elapsed time, " +
    "and a hairline mark settles when the exchange ends; its high-water mark persistence across session restarts is the continuity metric.";

  test("the exact dropped 5-way line parses with all four sources", () => {
    const { mutations, malformed } = parseMutations(FIVE_WAY);
    expect(malformed).toEqual([]);
    expect(mutations[0]).toEqual({
      op: "merge-doctrine",
      into: 4,
      from: [8, 13, 16, 17],
      text: expect.stringContaining("The live status flow is a visual contract"),
    });
  });

  test("5-way merge yields ONE entry with the union of all five entries' [ep:] stamps, others gone, numbering consistent", () => {
    const r = applyMutations(familyFixture, parseMutations(FIVE_WAY).mutations);
    // one merged entry; the four sources are gone
    const nums = [...r.text.matchAll(/^\*\*(\d+)\.\s/gm)].map((m) => parseInt(m[1], 10));
    expect(nums).toEqual([1, 2, 4]); // survivors keep their numbers, no dupes, no ghosts
    for (const gone of [8, 13, 16, 17]) expect(r.text).not.toMatch(new RegExp(`^\\*\\*${gone}\\.`, "m"));
    // the surviving title line carries the stamp union, oldest first
    const title = r.text.split("\n").find((l) => l.startsWith("**4."))!;
    expect(title).toContain("[ep:2026-07-24] [ep:2026-07-25] [ep:2026-07-26]");
    // the unified body replaced the target's
    expect(r.text).toContain("hairline mark settles when the exchange ends");
    expect(r.direction.catabolic).toBe(1);
    expect(r.applied[0]).toContain("5 beliefs became one");
    expect(r.applied[0]).toContain("3 origin stamp(s) preserved");
  });

  test("3-way merge folds both sources and unions stamps", () => {
    const r = applyMutations(
      familyFixture,
      parseMutations("MERGE Doctrine[8] <- Doctrine[16] <- Doctrine[17] :: The live status flow is a visual contract, stated once.").mutations
    );
    const nums = [...r.text.matchAll(/^\*\*(\d+)\.\s/gm)].map((m) => parseInt(m[1], 10));
    expect(nums).toEqual([1, 2, 4, 8, 13]);
    const title = r.text.split("\n").find((l) => l.startsWith("**8."))!;
    expect(title).toContain("[ep:2026-07-24] [ep:2026-07-26]");
    expect(title).toContain("[confirmed:2026-07-25]"); // the target's confirmed trail survives
  });

  test("an unknown source index rejects the whole merge with a reason — not fatal, nothing half-folded", () => {
    const r = applyMutations(
      familyFixture,
      parseMutations("CONFIRM Doctrine[1]\nMERGE Doctrine[4] <- Doctrine[8] <- Doctrine[99] :: whatever body").mutations
    );
    expect(r.rejected.length).toBe(1);
    expect(r.rejected[0].reason).toContain("no such doctrine entry 99");
    // nothing was folded: all seven entries still present
    const nums = [...r.text.matchAll(/^\*\*(\d+)\.\s/gm)].map((m) => parseInt(m[1], 10));
    expect(nums).toEqual([1, 2, 4, 8, 13, 16, 17]);
  });
});
