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
    const once = applyMutations(realSelf, parseMutations("CONFIRM Doctrine[5]").mutations);
    expect(once.applied.length).toBe(1);
    expect(once.text).toMatch(/\*\*5\. .*\[confirmed:\d{4}-\d{2}-\d{2}\]/);
    // Re-confirming refreshes the stamp, never accumulates a second one
    const twice = applyMutations(once.text, parseMutations("CONFIRM Doctrine[5]").mutations);
    const stamps = twice.text.match(/\[confirmed:/g) || [];
    expect(stamps.length).toBe(1);
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
    expect(r.text).toMatch(/\*\*7\. The null action must cost more than change\.\*\*/);
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

  test("round-trip: apply then re-parse — the rendered document stays parseable", () => {
    const r1 = applyMutations(realSelf, parseMutations("DEEPEN Doctrine[1] :: first pass.").mutations);
    const r2 = applyMutations(r1.text, parseMutations("DEEPEN Doctrine[1] :: second pass.\nCONFIRM Doctrine[3]").mutations);
    expect(r2.applied.length).toBe(2);
    expect(r2.text).toContain("first pass.");
    expect(r2.text).toContain("second pass.");
  });
});
