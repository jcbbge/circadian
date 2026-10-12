import { describe, expect, test } from "bun:test";
import { composeReports, DEFAULT_LIMITS, ordinaryReportJoin, type Report, type Attribution, type Record } from "./index";
import { expected, fixture, ref } from "./fixtures";

const by = { select: "by", person: "mira", project: "report" } as const;
const about = { select: "about", person: "mira", project: "report" } as const;
const settings = { ...by, project: "occasionSetting" } as const;
const ids = (result: ReturnType<typeof composeReports>) => result.rows.map(r => r.report);
function replace<T extends Record>(records: Record[], id: string, update: Partial<T>) {
  const index = records.findIndex(r => r.id === id); records[index] = { ...records[index], ...update } as Record;
}

describe("03 typed relations and composition", () => {
  test("T01 compose speaker occasions into source-backed settings", () => {
    const { records, sources } = fixture();
    const result = composeReports(records, settings, sources);
    expect(result.rows.map(({ report, setting }) => ({ report, setting }))).toEqual(expected.settingsByMira);
    expect(result.rows[0]!.evidencePaths).toEqual([["R1", "A1", "mira", "O1", "garden"]]);
    expect(result.rows[0]!.support).toContainEqual(ref("e1"));
    expect(ordinaryReportJoin(records, "mira", "by")).toEqual(expected.settingsByMira);
  });
  test("T02 keep said-by separate from about", () => {
    const { records, sources } = fixture();
    expect(ids(composeReports(records, about, sources))).toEqual(expected.aboutMira);
    const result = composeReports(records, by, sources);
    expect(ids(result)).toEqual(expected.byMira);
    expect(result.unresolved).toContainEqual({ record: "R4", reason: "personUnknown" });
  });
  test("T03 reject an occasion edge into a person", () => {
    const { records, sources } = fixture(); replace<Report>(records, "R1", { occasion: "mira" });
    const result = composeReports(records, settings, sources);
    expect(ids(result)).toEqual(["R3"]);
    expect(result.violations).toContainEqual({ record: "R1", reason: "endpointKind", expected: "occasion", actual: "person" });
  });
  test("T04 check only the declared occasion-setting equation", () => {
    const { records, sources } = fixture(); replace<Report>(records, "R1", { declaredOccasionSetting: "cafe" });
    const result = composeReports(records, settings, sources, ["declaredOccasionSetting"]);
    expect(result.violations).toContainEqual({ record: "R1", reason: "declaredOccasionSetting", expected: "cafe", actual: "garden" });
    expect(result.rows[0]!.evidencePaths[0]).toContain("O1");
  });
  test("T05 recording location is not occasion setting", () => {
    const { records, sources } = fixture();
    const result = composeReports(records, settings, sources);
    expect(result.rows[0]!.setting).toBe("garden");
    expect(result.violations).toEqual([]);
    expect(result.path).toEqual(["report", "attribution", "speaker", "occasion", "setting"]);
  });
  test("T06 unknown speakers remain unresolved and empty subjects remain absent", () => {
    const { records, sources } = fixture();
    const result = composeReports(records, by, sources);
    expect(ids(result)).not.toContain("R4"); expect(result.coverage.complete).toBe(false);
    expect(result.unresolved).toContainEqual({ record: "R4", reason: "personUnknown" });
    expect(composeReports(records, about, sources).unresolved).not.toContainEqual({ record: "R4", reason: "subjectUnknown" });
    replace<Report>(records, "R4", { subjects: null });
    expect(composeReports(records, about, sources).unresolved).toContainEqual({ record: "R4", reason: "subjectUnknown" });
  });
  test("T07 retain both attributed speakers", () => {
    const { records, sources } = fixture();
    const result = composeReports(records, { select: "speakers", report: "R3" }, sources);
    expect(result.rows.map(r => r.speaker)).toEqual(expected.jointSpeakers);
    expect(result.rows.map(r => r.evidencePaths[0])).toEqual([["R3", "A3m", "mira"], ["R3", "A3n", "noor"]]);
  });
  test("T08 well-typed false attribution is not semantically verified", () => {
    const { records, sources } = fixture(); replace<Attribution>(records, "A1", { speaker: "noor" });
    const result = composeReports(records, { select: "speakers", report: "R1" }, sources);
    expect(result.rows[0]!.speaker).toBe("noor"); expect(result.violations).toEqual([]);
    expect(result.semantics).toBe("notChecked");
    const independentlyReviewedSpeaker = "mira";
    expect(result.rows[0]!.speaker).not.toBe(independentlyReviewedSpeaker);
  });
  test("T09 repeated self-reports never manufacture an enduring trait", () => {
    const { records, sources } = fixture();
    for (let n = 5; n <= 6; n++) {
      records.push({ id: `R${n}`, kind: "report", statement: "Mira enjoyed quiet reading today, according to Noor.", episode: "E2", occasion: "O2", subjects: ["mira"], sources: [ref("e2")] },
        { id: `A${n}`, kind: "attribution", report: `R${n}`, speaker: "noor", sources: [ref("e2")] });
    }
    const self = composeReports(records, { ...by, select: "byAndAbout" }, sources);
    const all = composeReports(records, about, sources);
    expect(ids(self)).toEqual(["R1", "R3"]); expect(self.rows.map(r => r.occasion)).toEqual(["O1", "O3"]);
    expect(ids(all)).toEqual(["R1", "R2", "R3", "R5", "R6"]);
    expect(Object.hasOwn(self, "trait")).toBe(false); expect(self.semantics).toBe("notChecked");
  });
  test("T10 equal endpoint types never create an undeclared equation", () => {
    const { records, sources } = fixture();
    const spoken = composeReports(records, { select: "speakers", report: "R2" }, sources);
    expect(spoken.rows[0]!.speaker).toBe("noor");
    expect(ids(composeReports(records, about, sources))).toContain("R2");
    expect(spoken.violations).toEqual([]);
    expect(composeReports(records, by, sources).path).not.toEqual(composeReports(records, about, sources).path);
  });
  test("T11 stale or unavailable source suppresses its report", () => {
    for (const state of [{ available: false, eligible: true, revision: "v1" }, { available: true, eligible: true, revision: "v2" }, { available: true, eligible: false, revision: "v1" }]) {
      const { records, sources } = fixture(); sources.e1 = state;
      const result = composeReports(records, by, sources);
      expect(ids(result)).toEqual(["R3"]);
      expect(result.unavailable.some(u => u.source === "e1")).toBe(true);
      expect(result.rows.some(r => r.statement.includes("this afternoon"))).toBe(false);
    }
  });
  test("T12 two supporting paths remain one report", () => {
    const { records, sources } = fixture();
    records.push({ id: "A1-second", kind: "attribution", report: "R1", speaker: "mira", sources: [ref("e5")] });
    const result = composeReports(records, by, sources);
    expect(ids(result)).toEqual(expected.byMira);
    expect(result.rows[0]!.evidencePaths).toHaveLength(2);
    expect(result.rows[0]!.support.map(s => s.id)).toContain("e5");
    expect(result.rows[0]!.support.filter(s => s.id === "e1")).toHaveLength(1);
  });
  test("T13 enforce population traversal and output limits", () => {
    const { records, sources } = fixture();
    let tailRead = false;
    Object.defineProperty(records, records.length, { get() { tailRead = true; throw new Error("tail scanned"); } });
    const capped = composeReports(records, by, sources, [], {}, { ...DEFAULT_LIMITS, records: records.length - 1 });
    expect(tailRead).toBe(false); expect(capped.coverage.complete).toBe(false); expect(capped.coverage.stopped).toBe("records");
    const fresh = fixture();
    const hops = composeReports(fresh.records, by, fresh.sources, [], {}, { ...DEFAULT_LIMITS, hops: 4 });
    expect(hops.coverage.hops).toBeLessThanOrEqual(4); expect(hops.coverage.complete).toBe(false);
    const rows = composeReports(fresh.records, by, fresh.sources, [], {}, { ...DEFAULT_LIMITS, rows: 1 });
    expect(rows.rows).toHaveLength(1); expect(rows.coverage.stopped).toBe("rows");
  });
  test("T14 reviewed alias enables self-report while an unresolved spelling does not", () => {
    const { records, sources } = fixture();
    records.push({ id: "R5", kind: "report", statement: "I enjoyed the garden today.", episode: "E1", occasion: "O1", subjects: ["mira"], sources: [ref("e1")] },
      { id: "A5", kind: "attribution", report: "R5", speaker: "m-dot", sources: [ref("e1")] });
    const query = { ...by, select: "byAndAbout" } as const;
    const unresolved = composeReports(records, query, sources);
    expect(ids(unresolved)).not.toContain("R5");
    expect(unresolved.unresolved).toContainEqual({ record: "R5", reason: "identityUnresolved:m-dot" });
    const reviewed = composeReports(records, query, sources, [], { "m-dot": "mira" });
    expect(ids(reviewed)).toEqual(["R1", "R3", "R5"]);
  });
  test("X-T01 duplicate identity is rejected instead of silently overwritten", () => {
    const { records, sources } = fixture(); records.push({ id: "mira", kind: "place", sources: [ref("identity")] });
    const result = composeReports(records, by, sources);
    expect(result.rows).toEqual([]); expect(result.violations).toContainEqual({ record: "mira", reason: "duplicateId" });
  });
  test("X-T02 source-support validation itself respects the work cap", () => {
    const { records, sources } = fixture(); const person = records[0]!;
    person.sources = Array.from({ length: 100 }, () => ref("identity"));
    const result = composeReports(records, by, sources, [], {}, { ...DEFAULT_LIMITS, hops: 3 });
    expect(result.coverage.hops).toBe(3); expect(result.rows).toEqual([]);
  });
});
