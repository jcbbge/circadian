/** A supplied-population prototype. Structural checks never certify attribution truth. */
export type SourceRef = { id: string; revision: string };
export type SourceState = { available: boolean; eligible: boolean; revision: string };
type Supported = { id: string; sources: SourceRef[] };
export type Person = Supported & { kind: "person"; identity: "reviewed" | "unresolved" };
export type Place = Supported & { kind: "place" };
export type Episode = Supported & { kind: "episode"; recordingLocation: string | null };
export type Occasion = Supported & { kind: "occasion"; setting: string | null };
export type Attribution = Supported & { kind: "attribution"; report: string; speaker: string | null };
export type Report = Supported & {
  kind: "report"; statement: string; episode: string; occasion: string | null;
  subjects: string[] | null; declaredOccasionSetting?: string;
};
export type Record = Person | Place | Episode | Occasion | Attribution | Report;
export type Query =
  | { select: "by" | "about" | "byAndAbout"; person: string; project: "report" | "occasionSetting" }
  | { select: "speakers"; report: string };
export type Limits = { records: number; hops: number; rows: number; characters: number };
export const DEFAULT_LIMITS: Limits = { records: 100, hops: 2_000, rows: 100, characters: 64_000 };
export type Row = {
  report: string; statement: string; occasion: string | null; setting?: string; speaker?: string;
  evidencePaths: string[][]; support: SourceRef[];
};
export type Composition = {
  rows: Row[]; path: string[]; semantics: "notChecked";
  unresolved: { record: string; reason: string }[];
  violations: { record: string; reason: string; expected?: string; actual?: string }[];
  unavailable: { record: string; source: string; status: "unavailable" | "ineligible" | "stale" }[];
  coverage: { complete: boolean; recordsRead: number; totalRecords: number; hops: number; stopped: string | null };
};

/** Only these code-defined paths and one explicitly named equation are supported. */
export function composeReports(
  records: readonly Record[], query: Query, sourceStates: { [id: string]: SourceState },
  equations: readonly "declaredOccasionSetting"[] = [],
  reviewedIdentityMap: { [id: string]: string } = {}, limits: Limits = DEFAULT_LIMITS,
): Composition {
  const result: Composition = {
    rows: [], path: query.select === "speakers" || query.select === "by" ? ["report", "attribution", "speaker"]
      : query.select === "about" ? ["report", "subject"] : ["report", "attribution/speaker AND subject"],
    semantics: "notChecked", unresolved: [], violations: [], unavailable: [],
    coverage: { complete: true, recordsRead: 0, totalRecords: records.length, hops: 0, stopped: null },
  };
  if (query.select !== "speakers" && query.project === "occasionSetting") result.path.push("occasion", "setting");
  let characters = 0;
  const stop = (reason: string) => { result.coverage.complete = false; result.coverage.stopped ??= reason; };
  if (Object.values(limits).some(n => !Number.isSafeInteger(n) || n < 0)) { stop("invalidLimits"); return result; }
  const step = () => {
    if (result.coverage.stopped && result.coverage.stopped !== "records") return false;
    if (result.coverage.hops >= limits.hops) { stop("hops"); return false; }
    result.coverage.hops++;
    return true;
  };
  const text = (value: string) => {
    if (characters + value.length > limits.characters) { stop("characters"); return false; }
    characters += value.length; return true;
  };
  const unresolved = (record: string, reason: string) => {
    result.coverage.complete = false; result.unresolved.push({ record, reason });
  };
  const index = new Map<string, Record>();
  const attributions = new Map<string, Attribution[]>();
  const reports: Report[] = [];
  // Length inspection is constant time. The tail is never validated/scanned to count it.
  for (let i = 0; i < Math.min(records.length, limits.records); i++) {
    const record = records[i]!;
    if (!text(record.id)) break;
    result.coverage.recordsRead++;
    if (index.has(record.id)) {
      result.violations.push({ record: record.id, reason: "duplicateId" });
      index.delete(record.id); stop("duplicateId"); break;
    }
    index.set(record.id, record);
    if (record.kind === "report") reports.push(record);
    if (record.kind === "attribution") {
      if (!text(record.report)) break;
      const entries = attributions.get(record.report) ?? [];
      entries.push(record); attributions.set(record.report, entries);
    }
  }
  if (result.coverage.recordsRead < records.length && !result.coverage.stopped) stop("records");
  const checkedSources = new Map<string, boolean>();
  function supported(record: Record): boolean {
    if (checkedSources.has(record.id)) return checkedSources.get(record.id)!;
    let good = true;
    if (!record.sources.length) { unresolved(record.id, "sourceUnknown"); good = false; }
    for (const source of record.sources) {
      if (!step() || !text(source.id) || !text(source.revision)) return false;
      const state = Object.hasOwn(sourceStates, source.id) ? sourceStates[source.id] : undefined;
      const status = !state?.available ? "unavailable" : !state.eligible ? "ineligible"
        : state.revision !== source.revision ? "stale" : null;
      if (status) { result.unavailable.push({ record: record.id, source: source.id, status }); good = false; result.coverage.complete = false; }
    }
    checkedSources.set(record.id, good); return good;
  }
  function get<K extends Record["kind"]>(id: string | null, kind: K, from: string): Extract<Record, { kind: K }> | undefined {
    if (!step()) return;
    if (id === null) { unresolved(from, `${kind}Unknown`); return; }
    if (!text(id)) return;
    const record = index.get(id);
    if (!record) { unresolved(from, `${kind}Unresolved:${id}`); return; }
    if (record.kind !== kind) {
      result.violations.push({ record: from, reason: "endpointKind", expected: kind, actual: record.kind });
      result.coverage.complete = false; return;
    }
    if (!supported(record)) return;
    return record as Extract<Record, { kind: K }>;
  }
  function person(id: string | null, from: string): { id: string; records: Person[] } | undefined {
    const original = get(id, "person", from);
    if (!original) return;
    const mapped = Object.hasOwn(reviewedIdentityMap, original.id) ? reviewedIdentityMap[original.id] : undefined;
    const canonical = mapped ? get(mapped, "person", from) : original;
    if (!canonical) return;
    if (canonical.identity !== "reviewed") { unresolved(from, `identityUnresolved:${original.id}`); return; }
    return { id: canonical.id, records: original === canonical ? [original] : [original, canonical] };
  }
  const target = query.select !== "speakers" ? person(query.person, "query") : undefined;
  if (query.select !== "speakers" && !target) return result;
  const rows = new Map<string, Row>();
  function add(report: Report, projected: { setting?: string; speaker?: string }, path: string[], supportRecords: Record[]) {
    if (!step()) return;
    const key = `${report.id}\0${projected.speaker ?? ""}\0${projected.setting ?? ""}`;
    let row = rows.get(key);
    if (!row) {
      if (rows.size >= limits.rows) { stop("rows"); return; }
      if (!text(report.statement)) return;
      row = { report: report.id, statement: report.statement, occasion: report.occasion, ...projected, evidencePaths: [], support: [] };
      rows.set(key, row); result.rows.push(row);
    }
    row.evidencePaths.push(path);
    const seen = new Set(row.support.map(s => `${s.id}\0${s.revision}`));
    for (const record of supportRecords) for (const source of record.sources) {
      if (!step()) return;
      const key = `${source.id}\0${source.revision}`;
      if (!seen.has(key)) { seen.add(key); row.support.push({ ...source }); }
    }
  }
  for (const report of reports) {
    if (!step()) break;
    if (query.select === "speakers" && report.id !== query.report) continue;
    if (!supported(report)) continue;
    const episode = get(report.episode, "episode", report.id);
    if (!episode) continue;
    const speakerMatches: { speaker: string; path: string[]; records: Record[] }[] = [];
    if (query.select !== "about") {
      const attrs = attributions.get(report.id) ?? [];
      if (!attrs.length) unresolved(report.id, "speakerUnknown");
      for (const attribution of attrs) {
        if (!step()) break;
        if (!supported(attribution)) continue;
        const speaker = person(attribution.speaker, report.id);
        if (speaker && (query.select === "speakers" || speaker.id === target!.id))
          speakerMatches.push({ speaker: speaker.id, path: [report.id, attribution.id, speaker.id], records: [attribution, ...speaker.records] });
      }
    }
    const subjectMatches: { path: string[]; records: Record[] }[] = [];
    if (query.select === "about" || query.select === "byAndAbout") {
      if (report.subjects === null) unresolved(report.id, "subjectUnknown");
      else for (const id of report.subjects) {
        if (!step()) break;
        const subject = person(id, report.id);
        if (subject?.id === target!.id) subjectMatches.push({ path: [report.id, "subject", subject.id], records: subject.records });
      }
    }
    const matches = query.select === "about" ? subjectMatches
      : query.select === "byAndAbout" ? speakerMatches.filter(() => subjectMatches.length > 0)
      : speakerMatches;
    if (!matches.length) continue;
    let occasion: Occasion | undefined;
    let setting: Place | undefined;
    if ((query.select !== "speakers" && query.project === "occasionSetting") || equations.length) {
      // Equation vocabulary has exactly one member: no unbounded expression interpreter.
      if (equations.length > 1) { stop("equations"); break; }
      occasion = get(report.occasion, "occasion", report.id);
      setting = occasion ? get(occasion.setting, "place", occasion.id) : undefined;
      if (query.select !== "speakers" && query.project === "occasionSetting" && !setting) continue;
      if (equations[0] === "declaredOccasionSetting") {
        if (report.declaredOccasionSetting === undefined) unresolved(report.id, "equationNotChecked:declaredOccasionSetting");
        else {
          const declared = get(report.declaredOccasionSetting, "place", report.id);
          if (declared && setting && declared.id !== setting.id) {
            result.violations.push({ record: report.id, reason: "declaredOccasionSetting", expected: declared.id, actual: setting.id });
          }
        }
      }
    }
    for (const match of matches) {
      const extra = query.select === "byAndAbout" ? subjectMatches.flatMap(m => m.records) : [];
      const path = [...match.path, ...(query.select === "byAndAbout" ? ["AND subject", target!.id] : []),
        ...(setting ? [occasion!.id, setting.id] : [])];
      add(report, { ...(query.select === "speakers" ? { speaker: (match as typeof speakerMatches[number]).speaker } : {}),
        ...(setting ? { setting: setting.id } : {}) }, path,
      [report, episode, ...(target?.records ?? []), ...match.records, ...extra, ...(occasion && setting ? [occasion, setting] : [])]);
    }
  }
  return result;
}

/** Competent ordinary join for an already bounded, eligible, reviewed fixture population.
 * It answers the same positive query without retaining paths or checking equations.
 */
export function ordinaryReportJoin(records: readonly Record[], person: string, select: "by" | "about", limits: Limits = DEFAULT_LIMITS) {
  const unsupported = { status: "unsupported" as const, reason: "limit" };
  if ([limits.records, limits.hops, limits.rows, limits.characters].some(n => !Number.isSafeInteger(n) || n < 0)
    || records.length > limits.records) return unsupported;
  let characters = person.length, hops = 0;
  for (const record of records) {
    characters += record.id.length;
    if (record.kind === "attribution") characters += record.report.length + (record.speaker?.length ?? 0);
    if (record.kind === "occasion") characters += record.setting?.length ?? 0;
    if (record.kind === "report") {
      characters += record.occasion?.length ?? 0;
      if ((record.subjects?.length ?? 0) > limits.hops - hops) return unsupported;
      for (const subject of record.subjects ?? []) { characters += subject.length; hops++; }
    }
    if (characters > limits.characters || ++hops > limits.hops) return unsupported;
  }
  const reports = records.filter((r): r is Report => r.kind === "report");
  const spoken = new Set(records.filter((r): r is Attribution => r.kind === "attribution" && r.speaker === person).map(r => r.report));
  const occasions = new Map(records.filter((r): r is Occasion => r.kind === "occasion").map(r => [r.id, r.setting]));
  const places = new Set(records.filter(r => r.kind === "place").map(r => r.id));
  const matched = reports.filter(r => select === "by" ? spoken.has(r.id) : r.subjects?.includes(person));
  if (matched.length > limits.rows) return unsupported;
  return matched.map(r => {
    const setting = r.occasion ? occasions.get(r.occasion) : undefined;
    return { report: r.id, setting: setting && places.has(setting) ? setting : undefined };
  });
}
