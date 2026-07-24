// accretion.test.ts — the anti-accretion invariants, pinned against the REAL
// SELF.md on disk (repo doctrine: no mocks, real data).
//
// These tests exist because of the 2026-07-24 accretion wave: the mutation
// engine cured echo and immediately grew the opposite disease. 66 anabolic ops
// applied vs 1 catabolic across every wave ever committed; SELF.md 13,994 ->
// 29,333 chars, monotonic, 42% near-duplicate text at its worst.
//
// The root cause was an ASYMMETRIC GRAMMAR: HowWeWork and WhoIAm had exactly
// one verb each and it appended. Every test below pins one half of the fix —
// either a catabolic verb existing, or an append refusing to duplicate.
import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { homedir } from "os";
import {
  parseMutations,
  applyMutations,
  selfSimilarity,
  opDirection,
  MUTATION_GRAMMAR,
} from "./mutate.ts";

const MIND = path.join(process.env.CIRCADIAN_HOME || path.join(homedir(), "circadian"), "mind");
const realSelf = () => fs.readFileSync(path.join(MIND, "SELF.md"), "utf8");

// FIXTURES ARE DERIVED, NOT HARDCODED.
//
// First cut of this suite pinned the literal damaged strings from the accretion
// wave ("terminal-native inspection", "I am the living memory"). Every test then
// went red the moment the distillation healed the file — the suite was asserting
// the presence of the disease, not the correctness of the cure. Real data with
// no mocks (repo doctrine) does not mean brittle coupling to today's bytes: read
// whatever the live worldview actually holds and exercise the invariant against
// that. These helpers throw loudly if the file loses its shape.

function section(name: string): string {
  const s = realSelf();
  const start = s.indexOf(`## ${name}`);
  if (start === -1) throw new Error(`SELF.md has no "## ${name}" section`);
  const from = start + name.length + 3;
  const next = s.indexOf("\n## ", from);
  return (next === -1 ? s.slice(from) : s.slice(from, next)).trim();
}

/** A real working-agreement bullet from the live file, without its "- ". */
function aRealBullet(): string {
  const b = section("How we work")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- ") && l.length > 60)[0];
  if (!b) throw new Error("SELF.md 'How we work' has no substantial bullet to test against");
  return b.replace(/^-\s*/, "").trim();
}

/** A real motif line from the live file, without its "- ". */
function aRealMotif(): string {
  const m = section("Motifs")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- ") && l.length > 40)[0];
  if (!m) throw new Error("SELF.md 'Motifs' has no substantial motif to test against");
  return m.replace(/^-\s*/, "").trim();
}

/** A real sentence of identity prose from the live file. */
function aRealIdentitySentence(): string {
  const p = section("Who I am across sessions")
    .split(/\n\n+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 80)[0];
  if (!p) throw new Error("SELF.md 'Who I am' has no substantial prose to test against");
  const sentence = p.split(/(?<=\.)\s+/).filter((x) => x.trim().length > 60)[0] ?? p;
  return sentence.trim();
}

/** A real doctrine title from the live file, and its number. */
function aRealDoctrine(): { n: number; title: string } {
  const m = [...realSelf().matchAll(/^\*\*(\d+)\.\s+(.*?)\.?\*\*/gm)][0];
  if (!m) throw new Error("SELF.md has no parseable doctrine entries");
  return { n: parseInt(m[1], 10), title: m[2] };
}

/** Apply a raw mutation block to the real SELF.md. */
function run(block: string) {
  const { mutations } = parseMutations(block);
  return applyMutations(realSelf(), mutations);
}

describe("selfSimilarity — the accretion instrument", () => {
  test("detects the real duplication currently in SELF.md", () => {
    const sim = selfSimilarity(realSelf());
    // The file on disk is the evidence: it carries known repeated units.
    expect(sim.totalChars).toBeGreaterThan(1000);
    expect(sim.ratio).toBeGreaterThan(0);
    expect(sim.worstOffender).not.toBeNull();
    expect(sim.worstOffender!.copies).toBeGreaterThanOrEqual(2);
  });

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

describe("the grammar is symmetric — every section has a catabolic verb", () => {
  test("catabolic verbs are documented in the grammar handed to the model", () => {
    for (const verb of ["MERGE Doctrine", "REVISE HowWeWork", "RETRACT HowWeWork", "REVISE WhoIAm"]) {
      expect(MUTATION_GRAMMAR).toContain(verb);
    }
  });

  test("the grammar tells the model that shrinking is real work", () => {
    expect(MUTATION_GRAMMAR).toContain("SHRINKING IS REAL WORK");
  });

  test("op direction is classified so an all-anabolic wave is detectable", () => {
    expect(opDirection("amend-howwework")).toBe("anabolic");
    expect(opDirection("amend-whoiam")).toBe("anabolic");
    expect(opDirection("deepen")).toBe("anabolic");
    expect(opDirection("retract-howwework")).toBe("catabolic");
    expect(opDirection("revise-howwework")).toBe("catabolic");
    expect(opDirection("revise-whoiam")).toBe("catabolic");
    expect(opDirection("merge-doctrine")).toBe("catabolic");
    expect(opDirection("supersede")).toBe("catabolic");
    expect(opDirection("confirm")).toBe("neutral");
  });
});

describe("the dup guard is universal — every append-shaped op refuses a twin", () => {
  test("AMEND HowWeWork with an already-held bullet does not create a duplicate", () => {
    // The failure mode: one bullet reached 15 copies because AMEND appended
    // unconditionally. Paired with a CONFIRM so this exercises the guard rather
    // than the all-collapsed confession path (covered separately below).
    const bullet = aRealBullet();
    const d = aRealDoctrine();
    const beforeCount = realSelf().split("\n").filter((l) => l.trim().startsWith("- ")).length;

    const r = run(`AMEND HowWeWork :: ${bullet}\nCONFIRM Doctrine[${d.n}]`);
    const afterCount = r.text.split("\n").filter((l) => l.trim().startsWith("- ")).length;

    expect(afterCount).toBe(beforeCount); // no new bullet minted
    expect(r.collapsed).toBe(1);
  });

  test("AMEND HowWeWork ignores trailing-clause variation (the real duplicate shape)", () => {
    // Live duplicates were never verbatim twins — always the same claim wearing
    // one more clause ("... — this is now a core agreement"). One-directional
    // containment missed exactly this.
    const bullet = aRealBullet();
    const d = aRealDoctrine();
    const beforeCount = realSelf().split("\n").filter((l) => l.trim().startsWith("- ")).length;

    const r = run(`AMEND HowWeWork :: ${bullet} — and this is now confirmed again in the live session.\nCONFIRM Doctrine[${d.n}]`);
    const afterCount = r.text.split("\n").filter((l) => l.trim().startsWith("- ")).length;

    expect(afterCount).toBe(beforeCount);
    expect(r.collapsed).toBe(1);
  });

  test("AMEND WhoIAm with already-held identity prose is refused", () => {
    const sentence = aRealIdentitySentence();
    const d = aRealDoctrine();
    const r = run(`AMEND WhoIAm :: ${sentence}\nCONFIRM Doctrine[${d.n}]`);
    expect(r.collapsed).toBe(1);
    expect(r.rejected.some((x) => /already says this/.test(x.reason))).toBe(true);
  });

  test("a wave of nothing but duplicates confesses stagnation, not a phantom sync bug", () => {
    // Design flaw these tests caught in the fix itself: an all-collapsed wave
    // threw "mutating a SELF.md that isn't the one on disk", sending the reader
    // after a nonexistent bug. A duplicate is not a hallucination — it is a
    // model with nothing new to say, which is stagnation, and stagnation is
    // spoken to jrg's face at wake.
    const r = run(`AMEND WhoIAm :: ${aRealIdentitySentence()}`);
    expect(r.noChange).not.toBeNull();
    expect(r.noChange).toMatch(/circling, not advancing/);
    expect(r.applied).toHaveLength(0);
    expect(r.text).toBe(realSelf()); // untouched
  });

  test("ADD DOCTRINE with a title already held degrades instead of creating a twin", () => {
    // The exact hole that produced doctrines 9, 10 and 11 all titled
    // "Turn-End as Data Anchor".
    const d = aRealDoctrine();
    const beforeCount = (realSelf().match(/^\*\*\d+\.\s/gm) || []).length;
    const r = run(`ADD DOCTRINE :: ${d.title} :: Some restatement of a belief already held under this title.`);
    const afterCount = (r.text.match(/^\*\*\d+\.\s/gm) || []).length;

    expect(afterCount).toBe(beforeCount); // no new belief was minted
    expect(r.collapsed).toBe(1);
    expect(r.applied.some((a) => /ADD→(CONFIRM|DEEPEN)/.test(a))).toBe(true);
  });

  test("ADD MOTIF ignores trailing-clause variation", () => {
    const motif = aRealMotif();
    const d = aRealDoctrine();
    const r = run(`ADD MOTIF :: ${motif} — and this is now confirmed again.\nCONFIRM Doctrine[${d.n}]`);
    expect(r.collapsed).toBe(1);
    expect(r.rejected.some((x) => /already present/.test(x.reason))).toBe(true);
  });

  test("a genuinely new working agreement still lands (the guard is not a wall)", () => {
    const r = run("AMEND HowWeWork :: Redundancy is measured every wave and reported in the commit body, never inferred.");
    expect(r.collapsed).toBe(0);
    expect(r.applied.some((a) => /AMEND HowWeWork/.test(a))).toBe(true);
    expect(r.text).toContain("Redundancy is measured every wave");
  });
});

describe("catabolic ops actually shrink the worldview", () => {
  test("REVISE HowWeWork replaces a bullet in place and can shorten it", () => {
    const bullet = aRealBullet();
    const prefix = bullet.slice(0, 30);
    const r = run(`REVISE HowWeWork :: ${prefix} :: Show the output, never just describe it.`);
    expect(r.applied.some((a) => /REVISE HowWeWork/.test(a))).toBe(true);
    expect(r.text).toContain("Show the output, never just describe it.");
    expect(r.text.length).toBeLessThan(realSelf().length);
  });

  test("RETRACT HowWeWork removes a bullet entirely", () => {
    const prefix = aRealBullet().slice(0, 30);
    const before = realSelf().split("\n").filter((l) => l.trim().startsWith("- ")).length;
    const r = run(`RETRACT HowWeWork :: ${prefix}`);
    const after = r.text.split("\n").filter((l) => l.trim().startsWith("- ")).length;
    expect(after).toBe(before - 1);
    expect(r.direction.catabolic).toBe(1);
  });

  test("REVISE WhoIAm distills the identity prose and shrinks the file", () => {
    const r = run("REVISE WhoIAm :: I am Circadian, the metabolism of a working system. I digest, absorb, and excrete only what moves the work.");
    expect(r.applied.some((a) => /REVISE WhoIAm/.test(a))).toBe(true);
    expect(r.text.length).toBeLessThan(realSelf().length);
    // NOTE ON THE RIGHT ASSERTION HERE. An earlier version expected the
    // similarity RATIO to fall, which is arithmetically wrong: cutting UNIQUE
    // text leaves redundant chars fixed while shrinking the denominator, so the
    // ratio rises even though the document got better. Redundant VOLUME is the
    // honest measure of a catabolic op — it can never increase.
    const redundantBefore = selfSimilarity(realSelf()).redundantChars;
    expect(selfSimilarity(r.text).redundantChars).toBeLessThanOrEqual(redundantBefore);
  });

  test("MERGE folds one doctrine into another, reducing the count by exactly one", () => {
    const self = realSelf();
    const nums = [...self.matchAll(/^\*\*(\d+)\.\s/gm)].map((m) => parseInt(m[1], 10));
    expect(nums.length).toBeGreaterThanOrEqual(2);
    const [a, b] = [nums[nums.length - 2], nums[nums.length - 1]];

    const r = run(`MERGE Doctrine[${a}] <- Doctrine[${b}] :: The unified belief, stated once, carrying both why-chains.`);
    const after = (r.text.match(/^\*\*\d+\.\s/gm) || []).length;
    expect(after).toBe(nums.length - 1);
    expect(r.direction.catabolic).toBe(1);
    expect(r.text).toContain("The unified belief, stated once");
  });

  test("MERGE rejects a self-merge rather than deleting the belief", () => {
    const n = [...realSelf().matchAll(/^\*\*(\d+)\.\s/gm)].map((m) => parseInt(m[1], 10))[0];
    // A self-merge is the only mutation that could silently destroy a belief.
    // It must be refused, and since it is the only mutation in the wave,
    // applyMutations throws its all-rejected back-pressure error.
    expect(() => run(`MERGE Doctrine[${n}] <- Doctrine[${n}] :: whatever`)).toThrow(/rejected/);
  });
});

describe("telemetry — accretion can never again be invisible", () => {
  test("every wave reports its metabolic direction", () => {
    const d = aRealDoctrine();
    const r = run(`CONFIRM Doctrine[${d.n}] :: still true\nAMEND HowWeWork :: A brand new agreement about nothing that is otherwise held.`);
    expect(r.direction.neutral).toBe(1);
    expect(r.direction.anabolic).toBe(1);
    expect(r.direction.catabolic).toBe(0);
  });

  test("every wave reports resulting self-similarity", () => {
    const r = run(`CONFIRM Doctrine[${aRealDoctrine().n}]`);
    expect(r.similarity.ratio).toBeGreaterThanOrEqual(0);
    expect(r.similarity.ratio).toBeLessThanOrEqual(1);
  });

  test("collapsed mutations are counted, so a circling model is visible", () => {
    const d = aRealDoctrine();
    const r = run(`AMEND WhoIAm :: ${aRealIdentitySentence()}\nCONFIRM Doctrine[${d.n}]`);
    expect(r.collapsed).toBe(1);
  });
});
