import { describe, test, expect } from "bun:test";
import { foldWeights, type LedgerEvent, type Atom } from "./atoms.ts";
import { foldStrata, hotLimit, STRATA_HOT } from "./strata.ts";
import { renderSelf } from "./render.ts";

const atom = (id: string): Atom => ({ id, kind: "doctrine", claim: `Claim ${id}`, why: "reason", quotes: [{ text: "quoted", source: "2026-01-01-origin.md" }], eps: ["2026-01-01"] });
const stack = (id: string, ep: string): LedgerEvent => ({ ev: "stack", atom: id, ep, ts: "2026-01-01" });

describe("strata", () => {
  test("distinct later stack episodes, not stack events, timestamps or decays; recurrence and potentiation surface", () => {
    const events = [stack("old", "2026-01-01-a.md"), stack("other", "2026-01-02-b.md"), stack("third", "2026-01-02-b.md"),
      { ev: "decay", factor: 0.95, ts: "later" } as LedgerEvent, stack("other", "2026-01-03-c.md")];
    expect(foldStrata(events).get("old")?.depth).toBe(2);
    expect(foldStrata(events).get("third")?.depth).toBe(1);
    events.push({ ev: "potentiate", atom: "old", ts: "later" });
    expect(foldStrata(events).get("old")).toEqual({ depth: 0, lastStack: "2026-01-01-a.md", lastStackDate: "2026-01-01" });
    events.push(stack("third", "2026-01-04-d.md"));
    expect(foldStrata(events).get("old")?.depth).toBe(1);
    expect(foldStrata(events).get("third")?.depth).toBe(0);
    expect(foldWeights(events).get("old")!.weight).toBeGreaterThan(1); // independent axes
  });

  test("heavy deep atoms leave hot render but stay in deep; infinite hot reproduces old render byte-for-byte on 200 episodes", () => {
    const events: LedgerEvent[] = Array.from({ length: 200 }, (_, i) => stack(`a${i}`, `2026-01-${String(i).padStart(3, "0")}-ep.md`));
    // use valid episode dates while retaining 200 distinct filenames
    for (let i = 0; i < 200; i++) events[i].ep = `2026-01-01-ep-${i}.md`;
    events.unshift(...Array.from({ length: 10 }, () => stack("a0", "2026-01-01-ep-0.md")));
    const atoms = Array.from({ length: 200 }, (_, i) => atom(`a${i}`));
    const states = foldWeights(events);
    expect(states.get("a0")!.weight).toBe(11);
    const old = renderSelf(atoms, states, undefined, { hot: Infinity }).md;
    expect(renderSelf(atoms, states, undefined, { events, hot: Infinity }).md).toBe(old);
    expect(renderSelf(atoms, states, undefined, { events, hot: STRATA_HOT }).md).not.toContain("**Claim a0**");
    expect(renderSelf(atoms, states, undefined, { events, hot: STRATA_HOT, tier: "deep" }).md).toContain("**Claim a0**");
    expect(renderSelf(atoms, states, undefined, { events, hot: STRATA_HOT }).manifest[0].address).toBe("SELF.Doctrine[1]");
  });
  test("hot knob parses infinity and rejects malformed values", () => {
    expect(hotLimit("Infinity")).toBe(Infinity);
    expect(hotLimit("0")).toBe(0);
    expect(() => hotLimit("oops")).toThrow();
  });
});
