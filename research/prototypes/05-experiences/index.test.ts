import { describe, expect, test } from "bun:test";
import { checkRevisit, jointOccasions, ordinaryIncidence, recallOccasion } from "./index";
import { cyclic, dinner, expected, festival, first, later, limits, pairs, population, revisit, secondDinner, sources } from "./fixtures";

function ok<T extends { status: string }>(x: T): Extract<T, { status: "ok" }> { expect(x.status).toBe("ok"); return x as Extract<T, { status: "ok" }>; }
describe("05 evidenced occasions and interpretation boundaries", () => {
  test("H01 pairwise meetings do not establish a joint occasion", () => {
    expect(ok(jointOccasions(["narrator", "Mira", "Noor"], pairs, sources)).matches).toEqual([]);
    const joint = jointOccasions(["narrator", "Mira", "Noor"], [dinner], sources);
    expect(ok(joint).matches.map(x => x.id)).toEqual(["D1"]);
    expect(ordinaryIncidence(["narrator", "Mira", "Noor"], [dinner], sources)).toEqual(joint);
  });
  test("H02 repeated groups preserve occasion-specific roles", () => {
    const r = ok(jointOccasions(["Mira", "Noor"], [dinner, secondDinner], sources));
    expect(r.matches.map(x => x.id)).toEqual(expected.dinnerIDs);
    expect(r.matches.map(x => x.roles.find(p => p.role === "cook")!.person)).toEqual(expected.cooks);
  });
  test("H03 mention leaves attendance unknown", () => {
    const r = ok(jointOccasions(["Dana", "Mira"], [dinner], sources));
    expect(r.matches).toEqual([]); expect(r.unresolved).toEqual([{ id: "D1", reason: "participation-unknown" }]);
  });
  test("H04 a narrator account does not become a group feeling", () => {
    const r = ok(recallOccasion("D1", population, sources));
    expect(r.accounts.map(x => x.author)).toEqual(["narrator", "narrator"]);
    expect(r.accounts.find(x => x.author === "Mira")).toBeUndefined();
  });
  test("H05 checked links connect supplied occasion interpretations", () => {
    expect(later.account).not.toMatch(/Mira|Noor|dinner/);
    expect(checkRevisit(first, later, revisit, sources)).toEqual({ status: "sameBoundary" });
    const r = ok(recallOccasion("D1", population, sources));
    expect(r.accounts.map(x => x.id)).toEqual(expected.accountIDs);
    expect(r.accounts.map(x => x.ref.source)).toEqual(["I1", "I2"]);
    const disconnected = ok(recallOccasion("D1", { ...population, revisits: [] }, sources));
    expect(disconnected.accounts.map(x => x.id)).toEqual(["I1"]);
    expect(disconnected.unresolved).toEqual([{ id: "I2", reason: "omittedFromSelectedView" }]);
    expect(disconnected.coverage.complete).toBe(false);
  });
  test("H06 different questions reject checked revisit", () => {
    const other = { ...later, question: { id: "Q2", label: "what food was served" } };
    expect(checkRevisit(first, other, revisit, sources)).toEqual({ status: "mismatchedBoundary", reason: "question" });
    expect(ok(recallOccasion("D1", { ...population, interpretations: [first, other] }, sources)).accounts.map(x => x.id)).toEqual(["I1"]);
  });
  test("H07 equal labels do not equate local question IDs", () => {
    expect(checkRevisit(first, { ...later, question: { ...later.question, id: "Q2" } }, revisit, sources)).toEqual({ status: "mismatchedBoundary", reason: "question" });
  });
  test("H08 ambiguous occasion stays unresolved", () => {
    const ambiguous = { ...later, occasion: { candidates: ["D1", "D2"] } };
    const r = ok(recallOccasion("D1", { ...population, interpretations: [first, ambiguous] }, sources));
    expect(r.accounts.map(x => x.id)).toEqual(["I1"]);
    expect(r.unresolved).toContainEqual({ id: "I2", reason: "unresolved-occasion", candidates: ["D1", "D2"] });
  });
  test("H09 traversal caps and encountered cycles are distinguished", () => {
    const capped = ok(recallOccasion("D1", cyclic, sources, { ...limits, depth: 2, records: 3 }));
    expect(capped.accounts.map(x => x.id)).toEqual(["I1", "I2", "I3"]);
    expect(capped.cycles).toEqual([]); expect(capped.coverage.complete).toBe(false);
    const reached = ok(recallOccasion("D1", cyclic, sources, { ...limits, depth: 3, records: 3 }));
    expect(reached.cycles).toEqual(["R31"]); expect(reached.coverage.complete).toBe(true);
  });
  test("H10 unavailable event does not resurrect its narrative", () => {
    const r = ok(recallOccasion("D1", population, { ...sources, D1: { ...sources.D1, available: false } }));
    expect(r.occasion.state).toBe("unavailable"); expect(r.occasion.narrative).toBeNull();
    expect(r.accounts.map(x => x.id)).toEqual(expected.accountIDs);
    expect(r.accounts.every(x => x.attendance === "unknown")).toBe(true);
    expect(JSON.stringify(r)).not.toContain(dinner.narrative);
  });
  test("H11 retrieval frequency creates no retirement policy", () => {
    const unused = { ...dinner, uses: 0, unrelatedLedger: [{ kind: "decay" }] };
    expect(ok(jointOccasions(["Mira", "Noor"], [unused], sources)).matches.map(x => x.id)).toEqual(["D1"]);
  });
  test("H12 querying subgroups does not create pairwise events", () => {
    const before = structuredClone(dinner);
    for (const pair of [["Mira", "Noor"], ["Mira", "narrator"], ["Noor", "narrator"]]) expect(ok(jointOccasions(pair, [dinner], sources)).matches.map(x => x.id)).toEqual(["D1"]);
    expect(dinner).toEqual(before);
  });
  test("H13 shared attendance does not imply simultaneous presence", () => {
    expect(ok(jointOccasions(["Mira", "Noor"], [festival], sources)).matches).toEqual([{ id: "festival", roles: [{ person: "Mira", role: "visitor" }, { person: "Noor", role: "visitor" }], simultaneous: "unknown" }]);
  });
  test("H14 changed revisions and unresolved people suppress old answers", () => {
    const stale = ok(jointOccasions(["Mira", "Noor"], [dinner], { ...sources, D1: { ...sources.D1, revision: "v2" } }));
    expect(stale.matches).toEqual([]); expect(stale.unresolved).toContainEqual({ id: "D1", reason: "stale" });
    const unresolved = { ...dinner, participants: dinner.participants.map(p => p.person === "Mira" ? { ...p, person: null, candidates: ["Mira", "M."] } : p) };
    expect(ok(jointOccasions(["Mira", "Noor"], [unresolved], sources)).matches).toEqual([]);
  });
  test("H15 capped input never claims exhaustive coverage", () => {
    let inspected = 0;
    const long = Array.from({ length: 1000 }, (_, n) => ({ ...dinner, id: `occasion-${n}`, participants: n === 999 ? dinner.participants : [] }));
    const guarded = new Proxy(long, { get(t, p, r) { if (/^\d+$/.test(String(p))) inspected++; return Reflect.get(t, p, r); } });
    const result = ok(jointOccasions(["Mira", "Noor"], guarded, sources, { ...limits, inputCap: 20 }));
    expect(inspected).toBe(20); expect(result.matches).toEqual([]); expect(result.coverage.complete).toBe(false);
  });
  test("H16 interpretation authorship does not imply attendance", () => {
    const dana = { ...later, id: "Dana", ref: { source: "Dana", revision: "v1" }, author: "Dana" };
    const relation = { ...revisit, id: "RD", to: "Dana", ref: { source: "RD", revision: "v1" } };
    expect(checkRevisit(first, dana, relation, sources)).toEqual({ status: "sameBoundary" });
    const r = ok(recallOccasion("D1", { ...population, interpretations: [first, dana], revisits: [relation] }, sources));
    expect(r.accounts.find(x => x.author === "Dana")?.attendance).toBe("unknown");
    expect(dinner.participants.some(p => p.person === "Dana")).toBe(false);
  });
  test("XH01 relation evidence and unresolved questions are required", () => {
    expect(checkRevisit(first, later, { ...revisit, account: "" }, sources).status).toBe("unknown");
    expect(checkRevisit(first, { ...later, question: { id: null, label: "why" } }, revisit, sources).status).toBe("unknown");
  });
  test("XH02 output budget includes unresolved lists and metadata", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ ...dinner, id: `unknown-${i}`, participants: [] }));
    const small = jointOccasions(["Mira"], many, sources, { ...limits, outputChars: 100 });
    expect(small).toEqual({ status: "unsupported", reason: "output-limit" });
    expect(JSON.stringify(small).length).toBeLessThanOrEqual(100);
    const large = ok(jointOccasions(["Mira"], many, sources));
    expect(large.outputChars).toBe(JSON.stringify(large).length);
    const reflection = ok(recallOccasion("D1", population, sources));
    expect(reflection.outputChars).toBe(JSON.stringify(reflection).length);
    expect(recallOccasion("D1", population, sources, { ...limits, outputChars: 100 })).toEqual({ status: "unsupported", reason: "output-limit" });
  });
  test("XH03 no entry seeds account for every relevant interpretation", () => {
    const noSeeds = { ...population, interpretations: population.interpretations.map(i => ({ ...i, entry: false })) };
    const result = ok(recallOccasion("D1", noSeeds, sources));
    expect(result.accounts).toEqual([]);
    expect(result.unresolved).toEqual([{ id: "I1", reason: "omittedFromSelectedView" }, { id: "I2", reason: "omittedFromSelectedView" }]);
    expect(result.coverage.complete).toBe(false);
  });
  test("XH04 unvisited interpretation sources retain their actual state", () => {
    for (const reason of ["stale", "unavailable", "ineligible", "unknown"] as const) {
      const changed = { ...sources };
      if (reason === "unknown") delete changed.I2;
      else changed.I2 = { ...sources.I2, ...(reason === "stale" ? { revision: "v2" } : reason === "unavailable" ? { available: false } : { eligible: false }) };
      const result = ok(recallOccasion("D1", { ...population, revisits: [] }, changed));
      expect(result.accounts.map(a => a.id)).toEqual(["I1"]);
      expect(result.unresolved).toEqual([{ id: "I2", reason }]);
      expect(result.coverage.complete).toBe(false);
    }
  });
  test("XH05 traversal caps report omissions without inventing missing links", () => {
    for (const caps of [{ ...limits, depth: 0 }, { ...limits, records: 1 }]) {
      const result = ok(recallOccasion("D1", population, sources, caps));
      expect(result.accounts.map(a => a.id)).toEqual(["I1"]);
      expect(result.unresolved).toEqual([{ id: "I2", reason: "omittedFromSelectedView" }]);
      expect(result.coverage.complete).toBe(false);
    }
  });
  test("XH06 revisit IDs cannot suppress interpretation omission entries", () => {
    const orphan = { ...revisit, id: "I2", to: "missing-interpretation" };
    const result = ok(recallOccasion("D1", { ...population, revisits: [orphan] }, sources));
    expect(result.accounts.map(a => a.id)).toEqual(["I1"]);
    expect(result.unresolved).toEqual([{ id: "I2", reason: "orphan-target" }, { id: "I2", reason: "omittedFromSelectedView" }]);
    expect(result.coverage.complete).toBe(false);
  });
  test("XH07 reached accounts omitted for budget get an accurate reason", () => {
    const longReflection = { ...later, account: "x".repeat(1500) };
    expect(checkRevisit(first, longReflection, revisit, sources)).toEqual({ status: "sameBoundary" });
    const result = ok(recallOccasion("D1", { ...population, interpretations: [first, longReflection] }, sources, { ...limits, outputChars: 800 }));
    expect(result.accounts.map(a => a.id)).toEqual(["I1"]);
    expect(result.unresolved).toEqual([{ id: "I2", reason: "omittedFromSelectedView" }]);
    expect(result.coverage.complete).toBe(false);
    expect(result.outputChars).toBe(JSON.stringify(result).length);
    expect(result.outputChars).toBeLessThanOrEqual(800);
  });
});
