import { describe, expect, test } from "bun:test";
import { checkPresentation, compareFields, fixedReformat, historicalReceipt, makeReceipt, normalizedRecords, renderFixed, selectSubject, verifyApplicability, type CheckInput, type CheckResult, type Receipt } from "./index";
import { changedField, expected, faithful, fields, sourceText } from "./fixtures";

function checked(input: CheckInput): Extract<CheckResult, { status: "checked" }> { const r = checkPresentation(input); expect(r.status).toBe("checked"); return r as Extract<CheckResult, { status: "checked" }>; }
function receipt(input = faithful): Receipt { const r = makeReceipt(input); expect("version" in r).toBe(true); return r as Receipt; }
function property(input: CheckInput, name: string) { return checked(input).properties.find(p => p.name === name)!; }

describe("06 checked presentations and exact input identity", () => {
  test("K01 fixed rendering preserves only the named properties", () => {
    const result = checked(faithful);
    expect(result.differences).toEqual([]);
    expect(result.byteChange).toBe("unchanged");
    expect(expected.fieldNames.every(name => result.properties.find(p => p.name === name)?.status === "pass")).toBe(true);
    expect(result.properties.find(p => p.name === "exact-render:candidate")?.status).toBe("pass");
    expect(result.properties.find(p => p.name === "prose-preservation")?.status).toBe("notChecked");
    expect(compareFields(faithful.old.fields, faithful.candidate.fields)).toEqual({ subject: "pass", attribution: "pass", circumstance: "pass", modality: "pass", comparison: "pass" });
  });
  test("K02 subject changes fail equality", () => { expect(property(changedField("subject", { state: "known", value: "Mira" }), "subject").status).toBe("fail"); });
  test("K03 often becoming always fails modality", () => { expect(property(changedField("modality", { state: "known", value: "always" }), "modality").status).toBe("fail"); });
  test("K04 explicitly removed circumstances fail equality", () => { expect(property(changedField("circumstance", { state: "absent" }), "circumstance").status).toBe("fail"); });
  test("K05 widening the comparison fails equality", () => { expect(property(changedField("comparison", { state: "known", value: "quiet conversation over all social occasions" }), "comparison").status).toBe("fail"); });
  test("K06 misleading free prose cannot receive a semantic pass", () => {
    const input = { ...structuredClone(faithful), mode: "free" as const }; input.candidate.bytes = expected.misleadingProse;
    const r = checked(input); expect(r.differences).toEqual([]); expect(property(input, "prose-preservation").status).toBe("notChecked");
    expect(r.representationCoverage.prose).toBe("unassessed"); expect(r.byteChange).toBe("changed"); expect("pass" in r).toBe(false);
  });
  test("K07 unannotated circumstances remain not checked", () => { expect(property(changedField("circumstance", { state: "unknown" }), "circumstance").status).toBe("notChecked"); });
  test("K08 edited candidate bytes invalidate receipt", () => {
    const current = structuredClone(faithful); current.candidate.bytes += " altered";
    expect(verifyApplicability(receipt(), current)).toEqual({ status: "stale", reason: "candidate" });
  });
  test("K09 same atom ID cannot conceal changed source bytes", () => {
    const current = structuredClone(faithful); current.sources[0].bytes = "An unrelated source without the quote.";
    expect(current.old.id).toBe(faithful.old.id);
    expect(verifyApplicability(receipt(), current)).toEqual({ status: "stale", reason: "source" });
    expect(property(current, "source[0]").status).toBe("fail");
  });
  test("K10 every declared input component invalidates its binding", () => {
    const mutations: [string, (x: CheckInput) => void][] = [
      ["old", x => { x.old.bytes += " extra"; }],
      ["annotation", x => { x.candidate.fields.modality = { state: "known", value: "sometimes" }; }],
      ["rule", x => { x.rule.definition += " changed"; }], ["rule", x => { x.rule.version = "2"; }],
      ["checker", x => { x.checkerVersion = "2"; }],
      ["assumption", x => { x.assumptions = [{ id: "A1", statement: "M. is Mira", affects: ["subject"] }]; }],
      ["mode", x => { x.mode = "free"; }],
    ];
    const saved = receipt();
    for (const [reason, mutate] of mutations) { const x = structuredClone(faithful); mutate(x); expect(verifyApplicability(saved, x)).toEqual({ status: "stale", reason }); }
  });
  test("K11 missing or ineligible sources prevent current checking", () => {
    for (const mode of ["deleted", "ineligible"] as const) {
      const x = structuredClone(faithful); if (mode === "deleted") x.sources[0].bytes = null; else x.sources[0].eligible = false;
      expect(verifyApplicability(receipt(), x)).toEqual({ status: "unavailable", reason: "source" });
      expect(property(x, "source[0]")).toMatchObject({ status: "notChecked", reason: "unavailable-source" });
      expect(checked(x).byteChange).toBe("unchanged");
    }
    for (const missing of ["old", "candidate"] as const) {
      const x = structuredClone(faithful); x[missing].bytes = null;
      expect(checked(x).byteChange).toBe("unavailable");
    }
  });
  test("K12 admitted identity remains an explicit assumption", () => {
    const x = structuredClone(faithful); x.assumptions = [{ id: "A1", statement: "M. is Mira", affects: ["subject", "attribution"] }];
    expect(sourceText).not.toContain("Mira");
    expect(property(x, "subject")).toMatchObject({ status: "pass", conditionalOn: ["A1"] });
    expect(checked(x).assumptionsUsed).toEqual(x.assumptions);
  });
  test("K13 lost narrative uncertainty remains outside field checking", () => {
    const x = { ...structuredClone(faithful), mode: "free" as const }; x.old.bytes = sourceText; x.candidate.bytes = sourceText.replace(" I'm unsure why it mattered.", "");
    expect(checked(x).differences).toEqual([]); expect(property(x, "prose-preservation").status).toBe("notChecked");
    expect(x.old.bytes).toContain("unsure"); expect(x.candidate.bytes).not.toContain("unsure");
    expect(checked(x).byteChange).toBe("changed");
  });
  test("K14 selection commutes only with field-preserving formatting", () => {
    const mira = { id: "M1", refs: ["source-m"], fields: { ...fields, subject: { state: "known" as const, value: "Mira" } } };
    const records = [mira];
    expect(normalizedRecords(selectSubject(records, "Mira").map(fixedReformat))).toEqual(normalizedRecords(selectSubject(records.map(fixedReformat), "Mira")));
    const changeSubject = (r: typeof mira) => ({ ...r, fields: { ...r.fields, subject: { state: "known" as const, value: "Noor" } } });
    expect(normalizedRecords(selectSubject(records, "Mira").map(changeSubject))).toEqual([{ id: "M1", refs: ["source-m"], fields: { ...fields, subject: { state: "known", value: "Noor" } } }]);
    expect(selectSubject(records.map(changeSubject), "Mira")).toEqual([]);
  });
  test("K15 faithful free rephrasing has no machine prose guarantee", () => {
    const x = { ...structuredClone(faithful), mode: "free" as const }; x.candidate.bytes = expected.faithfulProse;
    expect(checked(x).differences).toEqual([]); expect(property(x, "prose-preservation").status).toBe("notChecked");
    expect(checked(x).byteChange).toBe("changed");
  });
  test("K16 matching false annotations expose the semantic boundary", () => {
    const x = structuredClone(faithful);
    x.old.fields.attribution = { state: "known", value: "Mira self-report" }; x.candidate.fields.attribution = { ...x.old.fields.attribution };
    x.old.bytes = renderFixed(x.old.fields); x.candidate.bytes = renderFixed(x.candidate.fields);
    expect(sourceText).not.toContain("Mira"); expect(property(x, "attribution").status).toBe("pass");
    expect(property(x, "source[0]").status).toBe("pass");
  });
  test("K17 byte limits refuse before source traversal or hashing", () => {
    const x = structuredClone(faithful); x.old.bytes = "a".repeat(10001);
    let touched = false; x.sources = new Proxy(x.sources, { get(t, p, r) { if (p === "0") touched = true; return Reflect.get(t, p, r); } });
    expect(checkPresentation(x, { bytes: 10000, records: 10, fieldChars: 20000 })).toEqual({ status: "unsupported", reason: "limit" });
    expect(touched).toBe(false);
  });
  test("K18 historical failure is separate from present applicability", () => {
    const x = changedField("modality", { state: "known", value: "always" }); const saved = receipt(x); x.sources[0].bytes = null;
    expect(verifyApplicability(saved, x)).toEqual({ status: "unavailable", reason: "source" });
    const history = historicalReceipt(saved, true); expect(history.status).toBe("historical");
    if (history.status === "historical") expect(history.properties).toContainEqual({ name: "modality", status: "fail" });
    const encoded = JSON.stringify(saved); expect(encoded).not.toContain(sourceText); expect(encoded).not.toContain("always"); expect(encoded).not.toContain("episode-1");
    expect(historicalReceipt(saved, false)).toEqual({ status: "suppressed" });
  });
  test("XK01 fixed mode detects forged candidate prose and absent old input", () => {
    const x = structuredClone(faithful); x.candidate.bytes = expected.misleadingProse;
    expect(property(x, "exact-render:candidate").status).toBe("fail");
    x.old.bytes = null; expect(property(x, "input-bytes").status).toBe("notChecked");
  });
  test("XK02 revision changes and duplicate sources are not trusted", () => {
    const x = structuredClone(faithful); x.sources[0].revision = "v2";
    expect(property(x, "source[0]")).toMatchObject({ status: "notChecked", reason: "stale-source-revision" });
    x.sources.push({ ...x.sources[0] });
    expect(property(x, "source[0]")).toMatchObject({ status: "notChecked", reason: "duplicate-source-identity" });
  });
});
