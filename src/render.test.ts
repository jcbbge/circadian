// render.test.ts — the render (popmem WS-B). Pure-function tests against
// hand-built atom/state fixtures; no filesystem, no LLM, no clock.
import { describe, test, expect } from "bun:test";
import { renderSelf, RENDER_FLOOR, DEFAULT_BUDGETS } from "./render.ts";
import type { Atom, AtomState } from "./atoms.ts";

function atom(id: string, kind: Atom["kind"], claim: string, quoteText = "verbatim telling", eps = ["2026-07-16"]): Atom {
  return { id, kind, claim, why: "because", quotes: [{ text: quoteText, source: "2026-07-16-ep.md" }], eps };
}

function active(weight: number): AtomState {
  return { weight, status: "active" };
}

describe("renderSelf", () => {
  test("byte-identical re-render for identical inputs", () => {
    const atoms = [atom("a1", "doctrine", "First belief."), atom("a2", "motif", "A recurring theme.")];
    const states = new Map<string, AtomState>([
      ["a1", active(2)],
      ["a2", active(1)],
    ]);
    const first = renderSelf(atoms, states);
    const second = renderSelf(atoms, states);
    expect(second.md).toBe(first.md);
    expect(second.manifest).toEqual(first.manifest);
  });

  test("default render: three sections in v1 order — identity is owned by CONSTITUTION.md (budget 0, no heading)", () => {
    const { md } = renderSelf([], new Map());
    const headingLines = md.split("\n").filter((l) => l.startsWith("## "));
    expect(headingLines).toEqual(["## Doctrine", "## Motifs", "## How we work"]);
  });

  test("identity section still renders when explicitly budgeted (the mechanism survives the default)", () => {
    const { md } = renderSelf([], new Map(), { identity: 600 });
    const headingLines = md.split("\n").filter((l) => l.startsWith("## "));
    expect(headingLines).toEqual(["## Who I am across sessions", "## Doctrine", "## Motifs", "## How we work"]);
  });

  test("weight-desc ordering, id-lex tiebreak", () => {
    const atoms = [
      atom("bbb", "doctrine", "Second by id, tied weight."),
      atom("aaa", "doctrine", "First by id, tied weight."),
      atom("ccc", "doctrine", "Heaviest belief."),
    ];
    const states = new Map<string, AtomState>([
      ["bbb", active(1)],
      ["aaa", active(1)],
      ["ccc", active(5)],
    ]);
    const { manifest } = renderSelf(atoms, states);
    const doctrineAtoms = manifest.filter((m) => m.address.startsWith("SELF.Doctrine")).map((m) => m.atom);
    expect(doctrineAtoms).toEqual(["ccc", "aaa", "bbb"]); // heaviest first; tie broken by id lex asc
  });

  test("floor exclusion: a weight-0.4 atom is absent from the render but the atom object itself is untouched", () => {
    const belowFloor = atom("low", "doctrine", "Sank below the render floor.");
    const atoms = [belowFloor, atom("high", "doctrine", "Well above the floor.")];
    const states = new Map<string, AtomState>([
      ["low", active(0.4)],
      ["high", active(1)],
    ]);
    const { md, manifest } = renderSelf(atoms, states);
    expect(manifest.map((m) => m.atom)).toEqual(["high"]);
    expect(md).not.toContain("Sank below the render floor");
    // the atom itself (its file, its object) is never mutated by rendering —
    // defocus, never delete, is a store-layer guarantee this test pins from
    // the render side: `low` is still a perfectly well-formed Atom.
    expect(belowFloor.claim).toBe("Sank below the render floor.");
  });

  test("weight exactly at RENDER_FLOOR renders (>= floor, not > floor)", () => {
    const atoms = [atom("edge", "doctrine", "Exactly at the floor.")];
    const states = new Map<string, AtomState>([["edge", active(RENDER_FLOOR)]]);
    const { manifest } = renderSelf(atoms, states);
    expect(manifest.map((m) => m.atom)).toEqual(["edge"]);
  });

  test("superseded atoms never render even at high weight", () => {
    const atoms = [atom("loser", "doctrine", "Lost the merge.")];
    const states = new Map<string, AtomState>([["loser", { weight: 99, status: "superseded-by:winner123" }]]);
    const { manifest } = renderSelf(atoms, states);
    expect(manifest).toEqual([]);
  });

  test("budget stop without truncation: an overflowing atom is omitted whole, later smaller atoms are not pulled in past it", () => {
    // budget of 10 tokens = 40 chars. First (heaviest) atom's line is long
    // enough alone to exceed it; a much smaller second atom exists behind it.
    const heavy = atom("heavy", "doctrine", "X".repeat(100));
    const small = atom("small", "doctrine", "tiny");
    const atoms = [heavy, small];
    const states = new Map<string, AtomState>([
      ["heavy", active(10)], // heaviest -> selected first in sort order
      ["small", active(1)],
    ]);
    const { manifest, md } = renderSelf(atoms, states, { doctrine: 10 });
    // documented rule: selection walks weight-desc and STOPS at the first
    // overflow — `small` is never reached even though it alone would fit.
    expect(manifest).toEqual([]);
    expect(md).not.toContain("tiny");
  });

  test("atom text is never truncated: a rendered atom's full claim appears verbatim", () => {
    const claim = "A belief that is moderately long but comfortably fits its section budget.";
    const atoms = [atom("a1", "motif", claim)];
    const states = new Map<string, AtomState>([["a1", active(1)]]);
    const { md } = renderSelf(atoms, states);
    expect(md).toContain(claim);
  });

  test("manifest addresses match rem.ts's SELF.Doctrine[n]/SELF.Motifs[n] format", () => {
    const atoms = [atom("d1", "doctrine", "A doctrine belief."), atom("m1", "motif", "A motif belief.")];
    const states = new Map<string, AtomState>([
      ["d1", active(1)],
      ["m1", active(1)],
    ]);
    const { manifest } = renderSelf(atoms, states);
    expect(manifest).toContainEqual({ address: "SELF.Doctrine[1]", atom: "d1" });
    expect(manifest).toContainEqual({ address: "SELF.Motifs[1]", atom: "m1" });
  });

  test("manifest addresses correspond 1:1 to non-blank lines rem.ts's enumerateSection would find", () => {
    const atoms = [atom("d1", "doctrine", "First doctrine belief."), atom("d2", "doctrine", "Second doctrine belief.")];
    const states = new Map<string, AtomState>([
      ["d1", active(2)],
      ["d2", active(1)],
    ]);
    const { md, manifest } = renderSelf(atoms, states);
    // reimplement rem.ts's enumerateSection line-walk against the rendered md
    const lines = md.split("\n");
    let inSection = false;
    const nonBlank: string[] = [];
    for (const line of lines) {
      if (/^##\s+/.test(line)) {
        inSection = line.trim() === "## Doctrine";
        continue;
      }
      if (inSection && line.trim()) nonBlank.push(line.trim());
    }
    const doctrineManifest = manifest.filter((m) => m.address.startsWith("SELF.Doctrine"));
    expect(nonBlank.length).toBe(doctrineManifest.length);
    for (let i = 0; i < doctrineManifest.length; i++) {
      expect(doctrineManifest[i].address).toBe(`SELF.Doctrine[${i + 1}]`);
    }
  });

  test("[ep:] stamps present in rendered output, in zoom-compatible bracket form", () => {
    const atoms = [atom("a1", "doctrine", "Has an origin stamp.", "verbatim", ["2026-07-16", "2026-07-24"])];
    const states = new Map<string, AtomState>([["a1", active(1)]]);
    const { md } = renderSelf(atoms, states);
    expect(md).toContain("[ep:2026-07-16]");
    expect(md).toContain("[ep:2026-07-24]");
  });

  test("empty section renders a placeholder, no manifest entries", () => {
    const { md, manifest } = renderSelf([], new Map());
    expect(manifest).toEqual([]);
    expect(md).toContain("(empty — no atoms above the render floor yet)");
  });

  test("default budgets sum to 5,400 — v1's 6,000 minus the identity 600 ceded to CONSTITUTION.md (2026-08-09)", () => {
    const sum = DEFAULT_BUDGETS.identity + DEFAULT_BUDGETS.doctrine + DEFAULT_BUDGETS.motif + DEFAULT_BUDGETS.agreement;
    expect(DEFAULT_BUDGETS.identity).toBe(0);
    expect(sum).toBe(5400);
  });
});
