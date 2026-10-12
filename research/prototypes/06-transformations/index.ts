import { createHash } from "node:crypto";

export const FIELD_NAMES = ["subject", "attribution", "circumstance", "modality", "comparison"] as const;
export type FieldName = typeof FIELD_NAMES[number];
export type Field = { state: "known"; value: string } | { state: "absent" } | { state: "unknown" };
export type Fields = Record<FieldName, Field>;
export type QuoteRef = { source: string; revision: string; quote: string };
export type Presentation = { id: string; bytes: string | null; fields: Fields; refs: QuoteRef[]; kind: string; origin: string };
export type Source = { id: string; revision: string; bytes: string | null; eligible: boolean };
export type Assumption = { id: string; statement: string; affects: FieldName[] };
export type CheckInput = {
  old: Presentation; candidate: Presentation; sources: Source[]; assumptions: Assumption[];
  rule: { version: string; definition: string }; checkerVersion: string;
  mode: "fixed" | "free";
};
export type Limits = { bytes: number; records: number; fieldChars: number };
export const DEFAULT_LIMITS: Limits = { bytes: 100000, records: 100, fieldChars: 20000 };
export const RULE = { version: "equal-fields/1", definition: "Equality of subject, attribution, circumstance, modality and comparison; fixed mode additionally requires the exact fixture template. No assertion of semantic truth." };
export const CHECKER_VERSION = "fixture-checker/1";
export type Property = { name: string; status: "pass" | "fail" | "notChecked"; reason?: string; conditionalOn: string[] };
export type Binding = Record<"old" | "candidate" | "annotation" | "source" | "assumption" | "rule" | "checker" | "mode", string>;
export type CheckResult = { status: "checked"; properties: Property[]; differences: string[]; byteChange: "changed" | "unchanged" | "unavailable"; representationCoverage: { knownFields: number; totalFields: number; prose: "exact-template" | "unassessed" }; assumptionsUsed: Assumption[]; binding: Binding; guarantee: string } | { status: "unsupported"; reason: "limit" };
export type Receipt = { version: 1; binding: Binding; properties: { name: string; status: Property["status"] }[]; historicalOnly: true };

function digest(bytes: string): string { return createHash("sha256").update(bytes).digest("hex"); }
function textFits(s: string | null, l: Limits): boolean { return s === null || s.length <= l.fieldChars && s.length <= l.bytes; }
function fieldFits(f: Field, l: Limits): boolean { return f.state !== "known" || textFits(f.value, l); }
function presentationFits(p: Presentation, l: Limits): boolean {
  if (p.refs.length > l.records || ![p.id, p.kind, p.origin, p.bytes].every(s => textFits(s, l))) return false;
  return FIELD_NAMES.every(k => fieldFits(p.fields[k], l)) && p.refs.every(r => [r.source, r.revision, r.quote].every(s => textFits(s, l)));
}
/** Inspect collection sizes first. Strings exceeding the budget fail before encoding or hashing. */
function boundedInput(input: CheckInput, l: Limits): string | null {
  if (!Object.values(l).every(v => Number.isSafeInteger(v) && v >= 0) || input.sources.length > l.records || input.assumptions.length > l.records) return null;
  if (!presentationFits(input.old, l) || !presentationFits(input.candidate, l)) return null;
  if (!input.sources.every(s => [s.id, s.revision, s.bytes].every(t => textFits(t, l)))) return null;
  if (!input.assumptions.every(a => a.affects.length <= FIELD_NAMES.length && [a.id, a.statement].every(s => textFits(s, l)) && a.affects.every(f => FIELD_NAMES.includes(f)))) return null;
  if (![input.rule.version, input.rule.definition, input.checkerVersion, input.mode].every(s => textFits(s, l))) return null;
  let stringBytes = 0;
  for (const value of inputStrings(input)) {
    if (value !== null) stringBytes += Buffer.byteLength(value, "utf8");
    if (stringBytes > l.bytes) return null;
  }
  // Build only the declared contract, not unknown caller properties/getters.
  const raw = JSON.stringify(canonical(input));
  return raw.length <= l.bytes && Buffer.byteLength(raw, "utf8") <= l.bytes ? raw : null;
}
function* inputStrings(input: CheckInput): Generator<string | null> {
  for (const p of [input.old, input.candidate]) {
    yield p.id; yield p.bytes; yield p.kind; yield p.origin;
    for (const name of FIELD_NAMES) if (p.fields[name].state === "known") yield (p.fields[name] as { value: string }).value;
    for (const r of p.refs) { yield r.source; yield r.revision; yield r.quote; }
  }
  for (const s of input.sources) { yield s.id; yield s.revision; yield s.bytes; }
  for (const a of input.assumptions) { yield a.id; yield a.statement; }
  yield input.rule.version; yield input.rule.definition; yield input.checkerVersion; yield input.mode;
}
function canonicalFields(f: Fields): Fields { return Object.fromEntries(FIELD_NAMES.map(k => [k, f[k].state === "known" ? { state: "known", value: (f[k] as { value: string }).value } : { state: f[k].state }])) as Fields; }
function presentationValue(p: Presentation) { return { id: p.id, bytes: p.bytes, kind: p.kind, origin: p.origin, refs: p.refs.map(r => ({ source: r.source, revision: r.revision, quote: r.quote })) }; }
function canonical(input: CheckInput) {
  return { old: presentationValue(input.old), candidate: presentationValue(input.candidate), annotation: { old: canonicalFields(input.old.fields), candidate: canonicalFields(input.candidate.fields) }, source: input.sources.map(s => ({ id: s.id, revision: s.revision, bytes: s.bytes, eligible: s.eligible })), assumption: input.assumptions.map(a => ({ id: a.id, statement: a.statement, affects: [...a.affects] })), rule: { version: input.rule.version, definition: input.rule.definition }, checker: input.checkerVersion, mode: input.mode };
}
function binding(input: CheckInput): Binding {
  const value = canonical(input);
  return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, digest(JSON.stringify(v))])) as Binding;
}
function equalField(a: Field, b: Field): Property["status"] {
  if (a.state === "unknown" || b.state === "unknown") return "notChecked";
  return a.state === b.state && (a.state !== "known" || b.state === "known" && a.value === b.value) ? "pass" : "fail";
}
export function renderFixed(fields: Fields): string {
  return FIELD_NAMES.map(k => `${k}: ${fields[k].state === "known" ? JSON.stringify((fields[k] as { value: string }).value) : fields[k].state === "absent" ? "[explicitly absent]" : "[unknown]"}`).join("\n");
}
const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
function sourceChecks(input: CheckInput): Property[] {
  const states = new Map(input.sources.map(s => [s.id, s]));
  const duplicate = states.size !== input.sources.length;
  const refs = [...input.old.refs, ...input.candidate.refs];
  return refs.map((ref, i) => {
    const source = states.get(ref.source);
    if (duplicate) return { name: `source[${i}]`, status: "notChecked", reason: "duplicate-source-identity", conditionalOn: [] };
    if (!source || source.bytes === null || !source.eligible) return { name: `source[${i}]`, status: "notChecked", reason: "unavailable-source", conditionalOn: [] };
    if (source.revision !== ref.revision) return { name: `source[${i}]`, status: "notChecked", reason: "stale-source-revision", conditionalOn: [] };
    if (!normalize(ref.quote)) return { name: `source[${i}]`, status: "notChecked", reason: "empty-quote", conditionalOn: [] };
    return { name: `source[${i}]`, status: normalize(source.bytes).includes(normalize(ref.quote)) ? "pass" : "fail", reason: "textual-presence-only", conditionalOn: [] };
  });
}
/** Same primitive equality as the full checker; this is a component ablation, not a separate implementation. */
export function compareFields(old: Fields, candidate: Fields): Record<FieldName, Property["status"]> {
  return Object.fromEntries(FIELD_NAMES.map(k => [k, equalField(old[k], candidate[k])])) as Record<FieldName, Property["status"]>;
}

export function checkPresentation(input: CheckInput, l: Limits = DEFAULT_LIMITS): CheckResult {
  if (boundedInput(input, l) === null) return { status: "unsupported", reason: "limit" };
  const properties: Property[] = FIELD_NAMES.map(name => ({ name, status: equalField(input.old.fields[name], input.candidate.fields[name]), conditionalOn: input.assumptions.filter(a => a.affects.includes(name)).map(a => a.id) }));
  for (const key of ["kind", "origin"] as const) properties.push({ name: key, status: input.old[key] === input.candidate[key] ? "pass" : "fail", conditionalOn: [] });
  properties.push({ name: "source-references", status: JSON.stringify(input.old.refs) === JSON.stringify(input.candidate.refs) ? "pass" : "fail", conditionalOn: [] });
  properties.push(...sourceChecks(input));
  const bytesPresent = input.old.bytes !== null && input.candidate.bytes !== null;
  properties.push({ name: "input-bytes", status: bytesPresent ? "pass" : "notChecked", reason: bytesPresent ? undefined : "unavailable-input", conditionalOn: [] });
  if (input.mode === "fixed") {
    for (const key of ["old", "candidate"] as const) properties.push({ name: `exact-render:${key}`, status: input[key].bytes === null ? "notChecked" : input[key].bytes === renderFixed(input[key].fields) ? "pass" : "fail", conditionalOn: [] });
  }
  properties.push({ name: "prose-preservation", status: "notChecked", reason: input.mode === "fixed" ? "only-listed-fields-and-template-are-checked" : "free-prose-unassessed", conditionalOn: [] });
  const knownFields = FIELD_NAMES.filter(k => input.old.fields[k].state !== "unknown" && input.candidate.fields[k].state !== "unknown").length;
  return { status: "checked", properties, differences: properties.filter(p => p.status === "fail").map(p => p.name), byteChange: !bytesPresent ? "unavailable" : input.old.bytes === input.candidate.bytes ? "unchanged" : "changed", representationCoverage: { knownFields, totalFields: FIELD_NAMES.length, prose: input.mode === "fixed" ? "exact-template" : "unassessed" }, assumptionsUsed: input.assumptions.map(a => ({ ...a, affects: [...a.affects] })), binding: binding(input), guarantee: "Only named structural and template properties were checked. Byte changes are not semantic verdicts. Annotations, assumptions and arbitrary prose are not verified truth. This report authorizes no publication." };
}

/** Recompute internally: a caller cannot pair an unrelated result with these inputs. */
export function makeReceipt(input: CheckInput, l: Limits = DEFAULT_LIMITS): Receipt | { status: "unsupported"; reason: "limit" } {
  const result = checkPresentation(input, l);
  if (result.status === "unsupported") return result;
  return { version: 1, binding: result.binding, properties: result.properties.map(p => ({ name: p.name, status: p.status })), historicalOnly: true };
}
export function verifyApplicability(receipt: Receipt, input: CheckInput, l: Limits = DEFAULT_LIMITS) {
  if (boundedInput(input, l) === null) return { status: "unsupported" as const, reason: "limit" };
  if (input.old.bytes === null || input.candidate.bytes === null) return { status: "unavailable" as const, reason: "input" };
  const sources = new Map(input.sources.map(s => [s.id, s]));
  if ([...input.old.refs, ...input.candidate.refs].some(r => { const s = sources.get(r.source); return !s || s.bytes === null || !s.eligible; })) return { status: "unavailable" as const, reason: "source" };
  const now = binding(input);
  for (const key of ["old", "candidate", "annotation", "source", "assumption", "rule", "checker", "mode"] as const) if (receipt.binding[key] !== now[key]) return { status: "stale" as const, reason: key };
  return { status: "applicable" as const, guarantee: "Input identity matches this unauthenticated historical claim; recomputation establishes current check results." };
}
export function historicalReceipt(receipt: Receipt, policyPermits: boolean) {
  return policyPermits ? { status: "historical" as const, properties: receipt.properties.map(p => ({ ...p })), guarantee: "Historical result only; no present applicability or semantic claim." } : { status: "suppressed" as const };
}

export type TransformRecord = { id: string; refs: string[]; fields: Fields; display?: string };
export function fixedReformat(record: TransformRecord): TransformRecord { return { ...record, display: renderFixed(record.fields) }; }
export function selectSubject(records: TransformRecord[], subject: string): TransformRecord[] { return records.filter(r => r.fields.subject.state === "known" && r.fields.subject.value === subject); }
export function normalizedRecords(records: TransformRecord[]) { return records.map(r => ({ id: r.id, refs: [...r.refs], fields: canonicalFields(r.fields) })); }
