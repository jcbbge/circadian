// mutate.test.ts — the mutation engine tested against the REAL SELF.md on
// disk (repo doctrine: no mocks — real data). Every case exercises the exact
// document REM will operate on tonight.
import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { homedir } from "os";
import { parseMutations, applyMutations, noChangeGreeting } from "./mutate.ts";

const SELF_PATH = path.join(
  process.env.CIRCADIAN_HOME || path.join(homedir(), "circadian"),
  "mind",
  "SELF.md"
);
const realSelf = fs.readFileSync(SELF_PATH, "utf8");

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
