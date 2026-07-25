// usermutate.test.ts — the USER-organ mutation engine, pinned against the REAL
// USER.md on disk (repo doctrine: no mocks, real data).
//
// This organ exists because of the third post-mortem (2026-07-24): USER.md was
// still a full-document rewrite long after SELF.md had been cured, and verifying
// the size-discipline fix — rather than assuming it — caught the model returning
// the file BYTE-IDENTICALLY while 919 tokens over target, reported as success.
//
// Every test below pins one half of the structural cure: either echo being
// impossible (there is no document to copy), or a catabolic verb that actually
// shrinks the model of a person.
import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { homedir } from "os";
import {
  parseUserMutations,
  applyUserMutations,
  userOpDirection,
  USER_MUTATION_GRAMMAR,
} from "./usermutate.ts";

const MIND = path.join(process.env.CIRCADIAN_HOME || path.join(homedir(), "circadian"), "mind");
const realUser = () => fs.readFileSync(path.join(MIND, "USER.md"), "utf8");

function run(block: string) {
  const { mutations } = parseUserMutations(block);
  return applyUserMutations(realUser(), mutations);
}

// Fixtures are DERIVED from whatever the live file holds — never hardcoded
// strings from today's bytes. The SELF suite learned this the hard way: pinning
// literal damaged text made every test go red the moment the damage was healed,
// which meant the suite was asserting the disease, not the cure.
function aSection(): string {
  const m = realUser().match(/^## (.+)$/m);
  if (!m) throw new Error("USER.md has no '## ' section to test against");
  return m[1].split(/[\s—]/)[0];
}

function bulletsIn(text: string, sectionPrefix: string): string[] {
  const heads = [...text.matchAll(/^## (.+)$/gm)];
  const i = heads.findIndex((h) => h[1].toLowerCase().startsWith(sectionPrefix.toLowerCase()));
  if (i === -1) throw new Error(`no section starting "${sectionPrefix}"`);
  const start = heads[i].index! + heads[i][0].length;
  const end = i + 1 < heads.length ? heads[i + 1].index! : text.length;
  return text.slice(start, end).split("\n").filter((l) => l.trim().startsWith("- "));
}

/** Two real bullets from the largest section, and its name. */
function twoRealBullets(): { section: string; a: string; b: string } {
  const heads = [...realUser().matchAll(/^## (.+)$/gm)];
  for (const h of heads) {
    const name = h[1].split(/[\s—]/)[0];
    const bs = bulletsIn(realUser(), name).filter((l) => l.length > 60);
    if (bs.length >= 2) return { section: name, a: bs[0].replace(/^-\s*/, ""), b: bs[1].replace(/^-\s*/, "") };
  }
  throw new Error("USER.md has no section with two substantial bullets");
}

describe("the USER organ cannot echo — there is no document to copy", () => {
  test("the grammar emits mutations, never a USER.md", () => {
    expect(USER_MUTATION_GRAMMAR).toContain("OBSERVE");
    expect(USER_MUTATION_GRAMMAR).not.toContain("===USER_MD===");
  });

  test("an empty mutations block is refused — silence is not an option", () => {
    expect(() => parseUserMutations("")).toThrow(/empty/i);
  });

  test("a fully garbled block is refused rather than silently accepted", () => {
    expect(() => parseUserMutations("here is the updated USER.md:\n# JRG\nsome prose")).toThrow(/no valid mutation/i);
  });

  test("shrinking verbs exist and are documented as real work", () => {
    for (const verb of ["MERGE", "REVISE", "RETRACT"]) expect(USER_MUTATION_GRAMMAR).toContain(verb);
    expect(USER_MUTATION_GRAMMAR).toContain("SHRINKING IS REAL WORK");
  });

  test("op direction is classified so an append-only cycle is detectable", () => {
    expect(userOpDirection("observe")).toBe("anabolic");
    expect(userOpDirection("deepen")).toBe("anabolic");
    expect(userOpDirection("merge")).toBe("catabolic");
    expect(userOpDirection("revise")).toBe("catabolic");
    expect(userOpDirection("retract")).toBe("catabolic");
    expect(userOpDirection("no-change")).toBe("neutral");
  });
});

describe("catabolic verbs actually shrink the model of a person", () => {
  test("MERGE folds two traits into one and removes a bullet", () => {
    const { section, a, b } = twoRealBullets();
    const before = bulletsIn(realUser(), section).length;
    const r = run(`MERGE ${section} :: ${a.slice(0, 40)} + ${b.slice(0, 40)} :: He wants the flow visible end to end, not just endpoints.`);
    const after = bulletsIn(r.text, section).length;

    expect(after).toBe(before - 1);
    expect(r.direction.catabolic).toBe(1);
    expect(r.applied.some((x) => /MERGE/.test(x))).toBe(true);
    expect(r.text.length).toBeLessThan(realUser().length);
  });

  test("MERGE refuses to fold a line into itself", () => {
    const { section, a } = twoRealBullets();
    expect(() => run(`MERGE ${section} :: ${a.slice(0, 40)} + ${a.slice(0, 40)} :: collapsed`)).toThrow(/rejected/);
  });

  test("REVISE replaces a line in place and can shorten it", () => {
    const { section, a } = twoRealBullets();
    const r = run(`REVISE ${section} :: ${a.slice(0, 40)} :: Sharper, shorter, same trait.`);
    expect(r.applied.some((x) => /REVISE/.test(x))).toBe(true);
    expect(r.text).toContain("Sharper, shorter, same trait.");
    expect(r.text.length).toBeLessThan(realUser().length);
  });

  test("RETRACT removes a line entirely", () => {
    const { section, a } = twoRealBullets();
    const before = bulletsIn(realUser(), section).length;
    const r = run(`RETRACT ${section} :: ${a.slice(0, 40)}`);
    expect(bulletsIn(r.text, section).length).toBe(before - 1);
    expect(r.direction.catabolic).toBe(1);
  });
});

describe("the dup guard is present from birth, not retrofitted", () => {
  test("OBSERVE of an already-held trait is refused or sharpens in place", () => {
    const { section, a } = twoRealBullets();
    const before = bulletsIn(realUser(), section).length;
    const r = run(`OBSERVE ${section} :: ${a}\nRETRACT ${section} :: ${twoRealBullets().b.slice(0, 40)}`);
    // No new bullet minted for the duplicate; the RETRACT accounts for -1.
    expect(bulletsIn(r.text, section).length).toBe(before - 1);
    expect(r.collapsed).toBe(1);
  });

  test("OBSERVE catches the same trait wearing one more clause", () => {
    const { section, a } = twoRealBullets();
    const before = bulletsIn(realUser(), section).length;
    const r = run(`OBSERVE ${section} :: ${a} And this was confirmed again in the live session.\nRETRACT ${section} :: ${twoRealBullets().b.slice(0, 40)}`);
    expect(bulletsIn(r.text, section).length).toBeLessThanOrEqual(before);
    expect(r.collapsed).toBe(1);
  });

  test("a genuinely new observation still lands — the guard is not a wall", () => {
    const section = aSection();
    const r = run(`OBSERVE ${section} :: He reaches for a barometer before a thermometer when a system feels wrong.`);
    expect(r.collapsed).toBe(0);
    expect(r.text).toContain("barometer before a thermometer");
    expect(r.applied.some((x) => /OBSERVE/.test(x))).toBe(true);
  });

  test("an all-duplicate cycle confesses that nothing was learned", () => {
    const { section, a } = twoRealBullets();
    const r = run(`OBSERVE ${section} :: ${a}`);
    expect(r.noChange).not.toBeNull();
    expect(r.noChange).toMatch(/already holds/);
    expect(r.text).toBe(realUser()); // untouched
  });

  test("every applied line carries an origin stamp", () => {
    const section = aSection();
    const r = run(`OBSERVE ${section} :: He treats a silent failure as worse than a loud one.`);
    const added = r.text.split("\n").find((l) => l.includes("silent failure as worse"))!;
    expect(added).toMatch(/\[ep:\d{4}-\d{2}-\d{2}\]/);
  });
});

describe("the engine enforces what the prompt could not", () => {
  // Three live waves, three failed persuasions:
  //   1. full rewrite  -> byte-identical echo while 919t over target
  //   2. mutations     -> 5 catabolic / 3 anabolic, 844 cut, 836 added, net -8
  //   3. char quota    -> one REVISE saving 342, given back by OBSERVE + DEEPEN
  // Every mutation was valid every time. A 4B local model cannot hold a running
  // character budget, and persuasion is not a mechanism.
  const TARGET = 2000 * 4;

  test("while over target, pure appends are DEFERRED, not applied", () => {
    const section = aSection();
    const { mutations } = parseUserMutations(
      `OBSERVE ${section} :: A wholly new trait line long enough to matter to the budget accounting.\n` +
      `OBSERVE ${section} :: Another wholly distinct new trait line, also long enough to matter here.`
    );
    const r = applyUserMutations(realUser(), mutations, { targetChars: TARGET });
    expect(realUser().length).toBeGreaterThan(TARGET); // precondition: over target
    expect(r.applied).toHaveLength(0);
    expect(r.deferred).toBe(2);
    expect(r.deltaChars).toBe(0);
  });

  test("an all-deferred wave confesses; it is NOT a phantom sync error", () => {
    const section = aSection();
    const { mutations } = parseUserMutations(`OBSERVE ${section} :: A brand new trait, long enough to be worth deferring for budget reasons.`);
    const r = applyUserMutations(realUser(), mutations, { targetChars: TARGET });
    expect(r.noChange).toMatch(/deferred/);
    expect(r.rejected.every((x) => /DEFERRED/.test(x.reason))).toBe(true);
  });

  test("appends are funded only by what the same wave's cuts earn", () => {
    const { section, a } = twoRealBullets();
    const { mutations } = parseUserMutations(
      `REVISE ${section} :: ${a.slice(0, 40)} :: Short.\n` +
      `OBSERVE ${section} :: ${"detail ".repeat(90)}`
    );
    const r = applyUserMutations(realUser(), mutations, { targetChars: TARGET });
    // The cut lands; the oversized append exceeds the headroom it created.
    expect(r.applied.some((x) => /REVISE/.test(x))).toBe(true);
    expect(r.deferred).toBe(1);
    expect(r.deltaChars).toBeLessThan(0);
  });

  test("catabolic mutations apply FIRST so cuts are never blocked by later appends", () => {
    const { section, a, b } = twoRealBullets();
    const { mutations } = parseUserMutations(
      `OBSERVE ${section} :: A new trait recorded before the merge in source order.\n` +
      `MERGE ${section} :: ${a.slice(0, 40)} + ${b.slice(0, 40)} :: One trait, once.`
    );
    const r = applyUserMutations(realUser(), mutations, { targetChars: TARGET });
    // MERGE was written second but must be applied first, so it funds the OBSERVE.
    expect(r.applied[0]).toMatch(/MERGE/);
    expect(r.deltaChars).toBeLessThan(0);
  });

  test("under target the mind grows freely — the gate is not a cage", () => {
    const section = aSection();
    const { mutations } = parseUserMutations(`OBSERVE ${section} :: A genuinely new trait that deserves its own line in the model.`);
    const r = applyUserMutations(realUser(), mutations, { targetChars: 999_999 });
    expect(r.deferred).toBe(0);
    expect(r.applied).toHaveLength(1);
    expect(r.deltaChars).toBeGreaterThan(0);
  });
});

describe("structure and telemetry", () => {
  test("mutations preserve the document's sections and preamble", () => {
    const before = realUser();
    const section = aSection();
    const r = run(`OBSERVE ${section} :: A new and distinct observation about his working rhythm.`);
    for (const h of [...before.matchAll(/^## .+$/gm)].map((m) => m[0])) {
      expect(r.text).toContain(h);
    }
    expect(r.text).toContain("# JRG");
    expect(r.text).toContain("PRIVATE: never leaves this machine");
  });

  test("a target consumed by an earlier mutation is reported as such, not as a hallucination", () => {
    // Live wave 2026-07-24: a MERGE folded two lines, then a later REVISE aimed
    // at one of them and was reported "no line matches that prefix" — which reads
    // like a model defect. The model was right; it described one consolidation
    // twice. Superseded target is normal metabolism; hallucinated is back-pressure.
    const { section, a, b } = twoRealBullets();
    const r = run(
      `MERGE ${section} :: ${a.slice(0, 40)} + ${b.slice(0, 40)} :: One trait, stated once.\n` +
      `REVISE ${section} :: ${a.slice(0, 40)} :: A later mutation aimed at the consumed line.`
    );
    expect(r.applied.some((x) => /MERGE/.test(x))).toBe(true);
    const rej = r.rejected.find((x) => /REVISE/.test(x.line));
    expect(rej).toBeDefined();
    expect(rej!.reason).toMatch(/already consolidated by an earlier mutation/);
    expect(rej!.reason).not.toMatch(/^no line matches/);
  });

  test("a mutation naming no real section is rejected, not applied blindly", () => {
    expect(() => run("OBSERVE Nonexistent :: something")).toThrow(/rejected/);
  });

  test("net char delta is reported — direction counts alone hid a net-flat wave", () => {
    // The 2026-07-24 live wave applied 5 catabolic ops and 3 anabolic, saving 844
    // chars and adding back 836: net -8. Direction counts called that a success.
    // Net delta is the only honest measure of a consolidation wave.
    const { section, a, b } = twoRealBullets();
    const shrink = run(`MERGE ${section} :: ${a.slice(0, 40)} + ${b.slice(0, 40)} :: One trait, once.`);
    expect(shrink.deltaChars).toBeLessThan(0);
    expect(shrink.text.length - realUser().length).toBe(shrink.deltaChars);

    const grow = run(`OBSERVE ${section} :: A wholly distinct trait that is nowhere else recorded in this file.`);
    expect(grow.deltaChars).toBeGreaterThan(0);
  });

  test("direction counts are reported so an append-only cycle is visible", () => {
    const { section, a } = twoRealBullets();
    const r = run(`OBSERVE ${section} :: A distinct new trait worth recording once.\nRETRACT ${section} :: ${a.slice(0, 40)}`);
    expect(r.direction.anabolic).toBe(1);
    expect(r.direction.catabolic).toBe(1);
  });

  test("a confession alongside real mutations is dropped — mutations are evidence of motion", () => {
    const section = aSection();
    const p = parseUserMutations(`NO-CHANGE :: nothing moved\nOBSERVE ${section} :: A genuinely distinct new trait.`);
    expect(p.droppedConfession).toBe("nothing moved");
    expect(p.mutations.every((m) => m.op !== "no-change")).toBe(true);
  });
});
