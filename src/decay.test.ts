// decay.test.ts — nightly multiply + re-potentiation (popmem WS-D). Pure
// decision logic tested against in-memory fixtures (no mind interaction);
// the CLI's idle/dry-run paths tested end-to-end via a temp CIRCADIAN_HOME
// sandbox and a real subprocess (the gauntlet.ts/replay.ts pattern — no
// mocks of the code under test).
import { describe, test, expect, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { tmpdir, homedir } from "os";
import { spawnSync } from "child_process";
import { foldWeights, appendLedger, readLedger, type LedgerEvent, type Atom, type AtomState } from "./atoms.ts";
import { RENDER_FLOOR } from "./render.ts";
import { DECAY_FACTOR, TOTAL_WEIGHT_TARGET, findNewRemEvents, computePotentiateEvents, computeSankBelowFloor, type RemPropagationEvent } from "./decay.ts";

const BUN_BIN = process.env.CIRCADIAN_BUN_BIN || path.join(homedir(), ".bun/bin/bun");
const DECAY_SCRIPT = path.join(import.meta.dir, "decay.ts");

const dirs: string[] = [];
function tmpDir(): string {
  const d = fs.mkdtempSync(path.join(tmpdir(), "decay-test-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length) {
    const d = dirs.pop()!;
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* already gone */
    }
  }
});

function atom(id: string, kind: Atom["kind"] = "doctrine"): Atom {
  return { id, kind, claim: `claim ${id}`, why: "because", quotes: [{ text: "verbatim", source: "ep.md" }], eps: ["2026-07-16"] };
}

// ---------------------------------------------------------------------
// findNewRemEvents — the ledger-is-its-own-high-water-mark logic
// ---------------------------------------------------------------------
describe("findNewRemEvents", () => {
  test("no prior potentiate/decay event at all => every rem event is new", () => {
    const rem: RemPropagationEvent[] = [{ ts: "2026-07-01T00:00:00.000Z" }, { ts: "2026-07-02T00:00:00.000Z" }];
    expect(findNewRemEvents([], rem)).toEqual(rem);
  });

  test("a rem event OLDER than the last potentiate/decay event is ignored", () => {
    const ledger: LedgerEvent[] = [{ ev: "decay", factor: 0.95, ts: "2026-07-10T00:00:00.000Z" }];
    const rem: RemPropagationEvent[] = [{ ts: "2026-07-05T00:00:00.000Z" }];
    expect(findNewRemEvents(ledger, rem)).toEqual([]);
  });

  test("a rem event NEWER than the last decay event is new", () => {
    const ledger: LedgerEvent[] = [{ ev: "decay", factor: 0.95, ts: "2026-07-10T00:00:00.000Z" }];
    const rem: RemPropagationEvent[] = [{ ts: "2026-07-11T00:00:00.000Z" }];
    expect(findNewRemEvents(ledger, rem)).toEqual(rem);
  });

  test("the watermark is the LATER of the last potentiate or decay event, whichever ran more recently", () => {
    const ledger: LedgerEvent[] = [
      { ev: "decay", factor: 0.95, ts: "2026-07-10T00:00:00.000Z" },
      { ev: "potentiate", atom: "a1", ts: "2026-07-12T00:00:00.000Z" },
    ];
    const rem: RemPropagationEvent[] = [
      { ts: "2026-07-11T00:00:00.000Z" }, // older than the potentiate watermark -> ignored
      { ts: "2026-07-13T00:00:00.000Z" }, // newer -> new
    ];
    expect(findNewRemEvents(ledger, rem)).toEqual([{ ts: "2026-07-13T00:00:00.000Z" }]);
  });
});

// ---------------------------------------------------------------------
// computePotentiateEvents — address -> atom mapping, NOW.* ignored,
// unmapped SELF.* counted
// ---------------------------------------------------------------------
describe("computePotentiateEvents", () => {
  const MANIFEST = [
    { address: "SELF.Doctrine[1]", atom: "atomA" },
    { address: "SELF.Motifs[1]", atom: "atomB" },
  ];

  test("one potentiate event per mapped SELF.* address on a new rem event", () => {
    const rem: RemPropagationEvent[] = [{ ts: "2026-07-20T00:00:00.000Z", propagated: ["SELF.Doctrine[1]", "SELF.Motifs[1]"] }];
    const { events, newRemCount, unmappedCount } = computePotentiateEvents([], rem, MANIFEST, "2026-07-21T00:00:00.000Z");
    expect(newRemCount).toBe(1);
    expect(unmappedCount).toBe(0);
    expect(events).toEqual([
      { ev: "potentiate", atom: "atomA", ts: "2026-07-21T00:00:00.000Z" },
      { ev: "potentiate", atom: "atomB", ts: "2026-07-21T00:00:00.000Z" },
    ]);
  });

  test("NOW.* addresses are ignored — no atom mapping, not counted as unmapped", () => {
    const rem: RemPropagationEvent[] = [{ ts: "2026-07-20T00:00:00.000Z", propagated: ["NOW.Arc[1]", "NOW.FlightPlan[2]"] }];
    const { events, unmappedCount } = computePotentiateEvents([], rem, MANIFEST, "2026-07-21T00:00:00.000Z");
    expect(events).toEqual([]);
    expect(unmappedCount).toBe(0);
  });

  test("an unmapped SELF.* address is skipped and counted", () => {
    const rem: RemPropagationEvent[] = [{ ts: "2026-07-20T00:00:00.000Z", propagated: ["SELF.Doctrine[99]"] }];
    const { events, unmappedCount } = computePotentiateEvents([], rem, MANIFEST, "2026-07-21T00:00:00.000Z");
    expect(events).toEqual([]);
    expect(unmappedCount).toBe(1);
  });

  test("a rem event citing the same atom under two addresses yields exactly one potentiate event for it", () => {
    const manifest = [
      { address: "SELF.Doctrine[1]", atom: "atomA" },
      { address: "SELF.Doctrine[2]", atom: "atomA" }, // same atom re-selected under a second address
    ];
    const rem: RemPropagationEvent[] = [{ ts: "2026-07-20T00:00:00.000Z", propagated: ["SELF.Doctrine[1]", "SELF.Doctrine[2]"] }];
    const { events } = computePotentiateEvents([], rem, manifest, "2026-07-21T00:00:00.000Z");
    expect(events).toEqual([{ ev: "potentiate", atom: "atomA", ts: "2026-07-21T00:00:00.000Z" }]);
  });

  test("a rem event older than the last ledger potentiate/decay contributes no events at all", () => {
    const ledger: LedgerEvent[] = [{ ev: "decay", factor: 0.95, ts: "2026-07-25T00:00:00.000Z" }];
    const rem: RemPropagationEvent[] = [{ ts: "2026-07-20T00:00:00.000Z", propagated: ["SELF.Doctrine[1]"] }];
    const { events, newRemCount } = computePotentiateEvents(ledger, rem, MANIFEST, "2026-07-26T00:00:00.000Z");
    expect(newRemCount).toBe(0);
    expect(events).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// computeSankBelowFloor
// ---------------------------------------------------------------------
describe("computeSankBelowFloor", () => {
  test("only active atoms below RENDER_FLOOR are listed", () => {
    const atoms = [atom("low"), atom("high"), atom("superseded")];
    const states = new Map<string, AtomState>([
      ["low", { weight: 0.3, status: "active" }],
      ["high", { weight: 2, status: "active" }],
      ["superseded", { weight: 0.1, status: "superseded-by:high" }], // below floor but not active -> excluded
    ]);
    expect(computeSankBelowFloor(atoms, states)).toEqual(["low"]);
  });

  test("weight exactly at RENDER_FLOOR is NOT sank (>= floor renders, matching render.ts)", () => {
    const atoms = [atom("edge")];
    const states = new Map<string, AtomState>([["edge", { weight: RENDER_FLOOR, status: "active" }]]);
    expect(computeSankBelowFloor(atoms, states)).toEqual([]);
  });

  test("an atom with no ledger state at all (weight 0) is sank", () => {
    const atoms = [atom("never-stacked")];
    expect(computeSankBelowFloor(atoms, new Map())).toEqual(["never-stacked"]);
  });
});

// ---------------------------------------------------------------------
// runway assertion — via fold, not arithmetic reimplementation: a
// never-bumped singleton stays >= RENDER_FLOOR for 13 nightly decays, and
// drops below it on the 14th (the shipped knobs: 0.95^13=0.5133 >= 0.5,
// 0.95^14=0.4877 < 0.5).
// ---------------------------------------------------------------------
describe("decay runway (DECAY_FACTOR/RENDER_FLOOR knobs, via foldWeights)", () => {
  function ledgerAfterNights(nights: number): LedgerEvent[] {
    const events: LedgerEvent[] = [{ ev: "stack", atom: "singleton", ep: "2026-07-16-ep.md", ts: "2026-07-16T00:00:00.000Z" }];
    for (let i = 0; i < nights; i++) {
      events.push({ ev: "decay", factor: DECAY_FACTOR, ts: `2026-07-${17 + i}T00:00:00.000Z` });
    }
    return events;
  }

  test("13 nightly decays: weight stays at/above RENDER_FLOOR", () => {
    const states = foldWeights(ledgerAfterNights(13));
    expect(states.get("singleton")!.weight).toBeGreaterThanOrEqual(RENDER_FLOOR);
  });

  test("14th nightly decay: weight drops below RENDER_FLOOR", () => {
    const states = foldWeights(ledgerAfterNights(14));
    expect(states.get("singleton")!.weight).toBeLessThan(RENDER_FLOOR);
  });

  test("one propagation resets the runway: a potentiate event between nights 13 and 14 keeps it above floor", () => {
    const events = ledgerAfterNights(13);
    events.push({ ev: "potentiate", atom: "singleton", ts: "2026-07-30T00:00:00.000Z" });
    events.push({ ev: "decay", factor: DECAY_FACTOR, ts: "2026-07-31T00:00:00.000Z" });
    const states = foldWeights(events);
    expect(states.get("singleton")!.weight).toBeGreaterThanOrEqual(RENDER_FLOOR);
  });
});

// ---------------------------------------------------------------------
// CLI end-to-end, sandboxed CIRCADIAN_HOME (real subprocess, no mocks)
// ---------------------------------------------------------------------
function runDecayCli(circadianHome: string, extraArgs: string[] = []): { status: number | null; stderr: string } {
  const r = spawnSync(BUN_BIN, [DECAY_SCRIPT, ...extraArgs], {
    env: { ...process.env, CIRCADIAN_HOME: circadianHome },
    encoding: "utf8",
  });
  return { status: r.status, stderr: r.stderr ?? "" };
}

describe("decay.ts CLI — sandboxed", () => {
  test("missing mind/beliefs/ and render-manifest.json => idle, exit 0, no logs/.population-vitals.json written", () => {
    const home = tmpDir();
    const { status, stderr } = runDecayCli(home);
    expect(status).toBe(0);
    expect(stderr).toContain("IDLE");
    expect(fs.existsSync(path.join(home, "logs", ".population-vitals.json"))).toBe(false);
  });

  test("--dry-run appends NOTHING: ledger bytes are byte-identical before and after", () => {
    const home = tmpDir();
    const beliefsDir = path.join(home, "mind", "beliefs");
    fs.mkdirSync(beliefsDir, { recursive: true });
    fs.writeFileSync(path.join(home, "mind", "render-manifest.json"), "[]\n");
    const ledgerPath = path.join(home, "mind", "beliefs.jsonl");
    appendLedger(ledgerPath, { ev: "stack", atom: "seed", ep: "2026-07-16-ep.md", ts: "2026-07-16T00:00:00.000Z" });
    const before = fs.readFileSync(ledgerPath, "utf8");

    const { status } = runDecayCli(home, ["--dry-run"]);
    expect(status).toBe(0);
    const after = fs.readFileSync(ledgerPath, "utf8");
    expect(after).toBe(before);
    expect(fs.existsSync(path.join(home, "logs", ".population-vitals.json"))).toBe(false);
  });

  test("a real run appends exactly one decay event AND one renorm event (renorm after decay), and writes logs/.population-vitals.json", () => {
    const home = tmpDir();
    const beliefsDir = path.join(home, "mind", "beliefs");
    fs.mkdirSync(beliefsDir, { recursive: true });
    fs.writeFileSync(path.join(home, "mind", "render-manifest.json"), "[]\n");
    const ledgerPath = path.join(home, "mind", "beliefs.jsonl");
    appendLedger(ledgerPath, { ev: "stack", atom: "seed", ep: "2026-07-16-ep.md", ts: "2026-07-16T00:00:00.000Z" });

    const { status } = runDecayCli(home);
    expect(status).toBe(0);

    const events = readLedger(ledgerPath);
    const decayEvents = events.filter((e) => e.ev === "decay");
    expect(decayEvents.length).toBe(1);

    // homeostatic renorm: exactly one, carrying the knob, appended AFTER the decay line
    const renormEvents = events.filter((e) => e.ev === "renorm");
    expect(renormEvents.length).toBe(1);
    expect(renormEvents[0].target).toBe(TOTAL_WEIGHT_TARGET);
    expect(events.indexOf(renormEvents[0])).toBeGreaterThan(events.indexOf(decayEvents[0]));

    const vitals = JSON.parse(fs.readFileSync(path.join(home, "logs", ".population-vitals.json"), "utf8"));
    expect(vitals.population).toBe(0); // beliefs/ is empty in this fixture
    expect(Array.isArray(vitals.sank_below_floor)).toBe(true);
    expect(typeof vitals.src_loc).toBe("number");
  });

  test("a second run appends a second decay+renorm pair — append-only, no rewrites", () => {
    const home = tmpDir();
    const beliefsDir = path.join(home, "mind", "beliefs");
    fs.mkdirSync(beliefsDir, { recursive: true });
    fs.writeFileSync(path.join(home, "mind", "render-manifest.json"), "[]\n");
    const ledgerPath = path.join(home, "mind", "beliefs.jsonl");
    appendLedger(ledgerPath, { ev: "stack", atom: "seed", ep: "2026-07-16-ep.md", ts: "2026-07-16T00:00:00.000Z" });

    expect(runDecayCli(home).status).toBe(0);
    const afterFirst = fs.readFileSync(ledgerPath, "utf8");
    expect(runDecayCli(home).status).toBe(0);
    const afterSecond = fs.readFileSync(ledgerPath, "utf8");

    // append-only: the first run's bytes are an exact prefix of the second's
    expect(afterSecond.startsWith(afterFirst)).toBe(true);
    const events = readLedger(ledgerPath);
    expect(events.filter((e) => e.ev === "decay").length).toBe(2);
    expect(events.filter((e) => e.ev === "renorm").length).toBe(2);
  });
});

// ---------------------------------------------------------------------
// homeostatic renorm — fold semantics driven from the decay knob (the
// nightly pipeline's exact event pair: decay then renorm)
// ---------------------------------------------------------------------
describe("nightly decay+renorm pair (via foldWeights)", () => {
  test("total above target: the pair caps total active weight at exactly the target", () => {
    const events: LedgerEvent[] = [];
    // 3 atoms stacked heavily enough that the total clearly exceeds a small target
    for (const [atom, n] of [["a", 5], ["b", 3], ["c", 2]] as [string, number][]) {
      for (let i = 0; i < n; i++) events.push({ ev: "stack", atom, ts: `t-${atom}-${i}` });
    }
    events.push({ ev: "decay", factor: DECAY_FACTOR, ts: "n1" });
    events.push({ ev: "renorm", target: 4, ts: "n1" });
    const states = foldWeights(events);
    const total = [...states.values()].filter((s) => s.status === "active").reduce((t, s) => t + s.weight, 0);
    expect(total).toBeCloseTo(4, 10);
    // rank order preserved
    expect(states.get("a")!.weight).toBeGreaterThan(states.get("b")!.weight);
    expect(states.get("b")!.weight).toBeGreaterThan(states.get("c")!.weight);
  });

  test("total below target: the renorm line is inert — fold equals the renorm-free fold (young sparse mind untouched)", () => {
    const base: LedgerEvent[] = [
      { ev: "stack", atom: "only", ts: "t1" },
      { ev: "decay", factor: DECAY_FACTOR, ts: "n1" },
    ];
    const withRenorm = [...base, { ev: "renorm", target: TOTAL_WEIGHT_TARGET, ts: "n1" } as LedgerEvent];
    expect([...foldWeights(withRenorm).entries()]).toEqual([...foldWeights(base).entries()]);
  });
});
