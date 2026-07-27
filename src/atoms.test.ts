// atoms.test.ts — the atom store (popmem WS-B). Real fixtures, temp dirs, no
// mocks of code under test (the zoom.test.ts/scorecard.test.ts pattern).
import { describe, test, expect, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";
import {
  atomId,
  serializeAtom,
  parseAtom,
  writeAtom,
  readAtoms,
  readLedger,
  appendLedger,
  foldWeights,
  AtomShapeError,
  type Atom,
  type LedgerEvent,
} from "./atoms.ts";

const dirs: string[] = [];
function tmpDir(): string {
  const d = fs.mkdtempSync(path.join(tmpdir(), "atoms-test-"));
  dirs.push(d);
  return d;
}

afterEach(() => {
  while (dirs.length) {
    const d = dirs.pop()!;
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* already gone — fine */
    }
  }
});

const FIXTURE: Omit<Atom, "id"> = {
  kind: "doctrine",
  claim: "The cliff is complexity accretion.",
  why: "Five memory systems, same death — accretion until nobody can hold the whole thing in their head.",
  quotes: [{ text: "the cliff was never in the code", source: "2026-07-16-founding-session.md" }],
  eps: ["2026-07-16"],
};

// ---------------------------------------------------------------------
// atomId
// ---------------------------------------------------------------------
describe("atomId", () => {
  test("deterministic: same claim, same id", () => {
    expect(atomId("The cliff is complexity accretion.")).toBe(atomId("The cliff is complexity accretion."));
  });

  test("normalizes whitespace: internal runs collapse, edges trim", () => {
    expect(atomId("  The   cliff  is complexity   accretion.  ")).toBe(atomId("The cliff is complexity accretion."));
  });

  test("different claims produce different ids", () => {
    expect(atomId("The cliff is complexity accretion.")).not.toBe(atomId("Motion is the metric."));
  });

  test("is 12 hex chars", () => {
    expect(atomId("anything")).toMatch(/^[0-9a-f]{12}$/);
  });
});

// ---------------------------------------------------------------------
// serialize -> parse round trip
// ---------------------------------------------------------------------
describe("serializeAtom / parseAtom round trip", () => {
  test("byte-stable: serialize(parse(serialize(x))) === serialize(x)", () => {
    const once = serializeAtom(FIXTURE);
    const parsed = parseAtom(once);
    const { id, ...withoutId } = parsed;
    const twice = serializeAtom(withoutId);
    expect(twice).toBe(once);
  });

  test("parsed id matches atomId(claim)", () => {
    const parsed = parseAtom(serializeAtom(FIXTURE));
    expect(parsed.id).toBe(atomId(FIXTURE.claim));
  });

  test("round trip preserves multiple quotes and multiple [ep:] stamps, in order", () => {
    const multi: Omit<Atom, "id"> = {
      kind: "motif",
      claim: "Stutter: the same true sentence fifteen times.",
      why: "Volume mistaken for conviction.",
      quotes: [
        { text: "first telling", source: "2026-07-01-a.md" },
        { text: "second telling, with \"nested quotes\" inside", source: "2026-07-05-b.md" },
      ],
      eps: ["2026-07-01", "2026-07-05"],
    };
    const parsed = parseAtom(serializeAtom(multi));
    expect(parsed.quotes).toEqual(multi.quotes);
    expect(parsed.eps).toEqual(multi.eps);
  });
});

// ---------------------------------------------------------------------
// parseAtom shape rejection — one test per malformed slot
// ---------------------------------------------------------------------
describe("parseAtom rejects malformed shape", () => {
  test("bad kind", () => {
    const md = serializeAtom(FIXTURE).replace("kind: doctrine", "kind: heresy");
    expect(() => parseAtom(md)).toThrow(AtomShapeError);
  });

  test("claim exceeds 280 chars", () => {
    const tooLong = { ...FIXTURE, claim: "x".repeat(281) };
    const md = serializeAtom(tooLong);
    expect(() => parseAtom(md)).toThrow(AtomShapeError);
  });

  test("no quote", () => {
    const md = serializeAtom({ ...FIXTURE, quotes: [] });
    expect(() => parseAtom(md)).toThrow(AtomShapeError);
  });

  test("quote with no source", () => {
    const md = serializeAtom(FIXTURE).replace(
      /quote: "the cliff was never in the code" \| 2026-07-16-founding-session\.md/,
      'quote: "the cliff was never in the code" | '
    );
    expect(() => parseAtom(md)).toThrow(AtomShapeError);
  });

  test("no [ep:] stamp", () => {
    const md = serializeAtom({ ...FIXTURE, eps: [] });
    expect(() => parseAtom(md)).toThrow(AtomShapeError);
  });

  test("malformed [ep:] stamp shape", () => {
    const md = serializeAtom(FIXTURE).replace("[ep:2026-07-16]", "[ep:2026-7-16]");
    expect(() => parseAtom(md)).toThrow(AtomShapeError);
  });

  test("missing kind line entirely", () => {
    const md = serializeAtom(FIXTURE).split("\n").slice(1).join("\n");
    expect(() => parseAtom(md)).toThrow(AtomShapeError);
  });

  test("empty why", () => {
    const md = serializeAtom({ ...FIXTURE, why: "" });
    expect(() => parseAtom(md)).toThrow(AtomShapeError);
  });

  test("garbage content entirely", () => {
    expect(() => parseAtom("not an atom at all\n")).toThrow(AtomShapeError);
  });
});

// ---------------------------------------------------------------------
// writeAtom — immutability is physical
// ---------------------------------------------------------------------
describe("writeAtom", () => {
  test("first write: created true, file exists with canonical bytes", () => {
    const dir = tmpDir();
    const res = writeAtom(dir, FIXTURE);
    expect(res.created).toBe(true);
    expect(res.id).toBe(atomId(FIXTURE.claim));
    expect(fs.readFileSync(res.path, "utf8")).toBe(serializeAtom(FIXTURE));
  });

  test("second write of the same claim: created false, NO write, bytes unchanged", () => {
    const dir = tmpDir();
    const first = writeAtom(dir, FIXTURE);
    const before = fs.readFileSync(first.path, "utf8");
    const tamperedWhy = { ...FIXTURE, why: "a completely different why-chain, if this landed the immutability contract is broken" };
    const second = writeAtom(dir, tamperedWhy);
    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id);
    expect(second.path).toBe(first.path);
    const after = fs.readFileSync(first.path, "utf8");
    expect(after).toBe(before);
    expect(after).not.toContain("completely different why-chain");
  });

  test("rejects a malformed atom before ever touching disk", () => {
    const dir = tmpDir();
    expect(() => writeAtom(dir, { ...FIXTURE, quotes: [] })).toThrow(AtomShapeError);
    expect(fs.existsSync(dir)).toBe(true);
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// readAtoms
// ---------------------------------------------------------------------
describe("readAtoms", () => {
  test("sorted by id, skips a corrupt file, skips a filename/id mismatch", () => {
    const dir = tmpDir();
    const a = writeAtom(dir, FIXTURE);
    const b = writeAtom(dir, { ...FIXTURE, claim: "Motion is the metric.", quotes: [{ text: "motion", source: "x.md" }] });
    fs.writeFileSync(path.join(dir, "deadbeefcafe.md"), "not a real atom\n");
    // filename/id mismatch: valid atom bytes under the WRONG name
    fs.writeFileSync(path.join(dir, "000000000000.md"), fs.readFileSync(a.path, "utf8"));

    const atoms = readAtoms(dir);
    const ids = atoms.map((x) => x.id);
    expect(ids).toEqual([...ids].sort());
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
    expect(ids).not.toContain("deadbeefcafe");
    expect(ids).not.toContain("000000000000");
    expect(atoms.length).toBe(2);
  });

  test("empty/missing dir returns empty array, never throws", () => {
    expect(readAtoms(path.join(tmpdir(), "does-not-exist-" + Math.random().toString(36)))).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// ledger
// ---------------------------------------------------------------------
describe("readLedger / appendLedger", () => {
  test("appended events round-trip in order", () => {
    const dir = tmpDir();
    const p = path.join(dir, "beliefs.jsonl");
    const events: LedgerEvent[] = [
      { ev: "stack", atom: "abc123abc123", ep: "2026-07-16", ts: "2026-07-16T00:00:00.000Z" },
      { ev: "decay", factor: 0.95, ts: "2026-07-17T00:00:00.000Z" },
    ];
    for (const e of events) appendLedger(p, e);
    expect(readLedger(p)).toEqual(events);
  });

  test("skips a corrupt line, never fatal", () => {
    const dir = tmpDir();
    const p = path.join(dir, "beliefs.jsonl");
    fs.writeFileSync(p, '{"ev":"stack","atom":"abc123abc123","ts":"2026-07-16T00:00:00.000Z"}\nnot json at all\n{"ev":"decay","factor":0.95,"ts":"2026-07-17T00:00:00.000Z"}\n');
    const events = readLedger(p);
    expect(events.length).toBe(2);
    expect(events[0].ev).toBe("stack");
    expect(events[1].ev).toBe("decay");
  });

  test("missing ledger file returns empty array, never throws", () => {
    expect(readLedger(path.join(tmpdir(), "no-such-ledger-" + Math.random().toString(36) + ".jsonl"))).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// foldWeights — hand-computed fixture, all four event types
// ---------------------------------------------------------------------
describe("foldWeights", () => {
  test("hand-computed fixture: stack, decay, potentiate, supersede, decay-before-birth", () => {
    const events: LedgerEvent[] = [
      { ev: "stack", atom: "AAA", ts: "t1" }, // AAA weight 1, decay-eligible from here on
      { ev: "stack", atom: "BBB", ts: "t2" }, // BBB weight 1, decay-eligible from here on
      { ev: "decay", factor: 0.5, ts: "t3" }, // AAA -> 0.5, BBB -> 0.5
      { ev: "stack", atom: "CCC", ts: "t4" }, // CCC weight 1, born AFTER the decay above
      { ev: "decay", factor: 0.5, ts: "t5" }, // AAA -> 0.25, BBB -> 0.25, CCC -> 0.5 (decay-before-birth: unaffected by t3)
      { ev: "potentiate", atom: "AAA", ts: "t6" }, // AAA -> 1.25
      { ev: "supersede", winner: "CCC", loser: "BBB", ts: "t7" }, // CCC -> 0.5 + 0.25 = 0.75; BBB -> 0, superseded-by:CCC
    ];
    const states = foldWeights(events);

    expect(states.get("AAA")).toEqual({ weight: 1.25, status: "active" });
    expect(states.get("BBB")).toEqual({ weight: 0, status: "superseded-by:CCC" });
    expect(states.get("CCC")).toEqual({ weight: 0.75, status: "active" });
  });

  test("decay-before-birth in isolation: an atom stacked after a decay is unaffected by it", () => {
    const events: LedgerEvent[] = [
      { ev: "decay", factor: 0.1, ts: "t1" }, // nothing stacked yet — no-op
      { ev: "stack", atom: "X", ts: "t2" }, // X born weight 1, AFTER the decay above
    ];
    const states = foldWeights(events);
    expect(states.get("X")).toEqual({ weight: 1, status: "active" });
  });

  test("empty ledger folds to an empty map", () => {
    expect(foldWeights([]).size).toBe(0);
  });

  test("the ~13-night decay runway: weight 1, 13 decays >= floor 0.5, 14th < floor", () => {
    const events: LedgerEvent[] = [{ ev: "stack", atom: "X", ts: "t0" }];
    for (let i = 0; i < 13; i++) events.push({ ev: "decay", factor: 0.95, ts: `d${i}` });
    let states = foldWeights(events);
    expect(states.get("X")!.weight).toBeCloseTo(0.95 ** 13, 10);
    expect(states.get("X")!.weight).toBeGreaterThanOrEqual(0.5);

    events.push({ ev: "decay", factor: 0.95, ts: "d13" });
    states = foldWeights(events);
    expect(states.get("X")!.weight).toBeCloseTo(0.95 ** 14, 10);
    expect(states.get("X")!.weight).toBeLessThan(0.5);
  });
});
