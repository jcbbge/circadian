/** One fixed, pure recipe. No executable memory language, clock, files or inference. */
export type SourceRef = { id: string; revision: string };
export type SourceState = {
  available: boolean; eligible: boolean; revision: string; superseded?: boolean;
  validity: "current" | "invalid" | "unknown";
};
export type Window = [number, number];
export type Preference = { participant: string; occasion: string; quiet: boolean; seating: boolean; source: SourceRef };
export type Availability = { participant: string; occasion: string; windows: Window[]; source: SourceRef };
export type Place = { id: string; quiet: boolean | null; seating: boolean | null; open: boolean | null; source: SourceRef };
export type Intention = { minutes: number; source: SourceRef };
export type Slots = { preferences: Preference[]; availability: Availability[]; places: Place[]; intention: Intention };
export type Inputs = Slots & { participants: string[]; occasion: string };
export type Aid = {
  recipe: "shared-afternoon"; participants: string[]; occasion: string; bindings: Partial<Slots>;
  retired?: { reason: "noLongerUseful" };
};
export type Limits = { records: number; work: number; characters: number };
export const DEFAULT_LIMITS: Limits = { records: 100, work: 10_000, characters: 64_000 };
export type Unsupported = { status: "unsupported"; reason: "limit" | "typeMismatch" | "invalidInput"; detail: string };
export type Failure = Unsupported
  | { status: "missing"; slots: string[] }
  | { status: "notApplicable"; reason: "reviewedContext" | "retired" }
  | { status: "reconsider"; reason: "bindingConflict" | "bindingMismatch" | "staleSource" | "unavailableSource" | "ineligibleSource" | "invalidCondition"; binding: string };
export type Windows = { kind: "windows"; windows: Window[]; evidence: SourceRef[] };
export type Options = { kind: "options"; options: string[]; unknowns: string[]; evidence: SourceRef[] };
export type Result = { status: "result"; options: { place: string; window: Window; tentative: true }[]; evidence: SourceRef[]; reasons: string[]; asOf: number };
export type Applicability = "applies" | "doesNotApply" | "unknown";
type States = { [id: string]: SourceState };
const unsupported = (reason: Unsupported["reason"], detail: string): Unsupported => ({ status: "unsupported", reason, detail });
const slots = ["preferences", "availability", "places", "intention"] as const;
const own = <T>(obj: { [id: string]: T }, key: string) => Object.hasOwn(obj, key) ? obj[key] : undefined;
const evidence = (...groups: readonly SourceRef[][]): SourceRef[] => {
  const unique = new Map<string, SourceRef>();
  for (const group of groups) for (const ref of group) unique.set(`${ref.id}\0${ref.revision}`, { ...ref });
  return [...unique.values()].sort((a, b) => a.id.localeCompare(b.id) || a.revision.localeCompare(b.revision));
};
const recordCount = (data: Partial<Slots>) => (data.preferences?.length ?? 0) + (data.availability?.length ?? 0)
  + (data.places?.length ?? 0) + (data.intention ? 1 : 0);

/** Bound validation itself; never JSON-stringify or scan a rejected tail first. */
function preflight(data: readonly Partial<Slots>[], limits: Limits, participants: readonly string[] = [], occasion = ""): Unsupported | undefined {
  if ([limits.records, limits.work, limits.characters].some(n => !Number.isSafeInteger(n) || n < 0)) return unsupported("invalidInput", "limits");
  if (participants.length > limits.records || data.reduce((n, d) => n + recordCount(d), 0) > limits.records) return unsupported("limit", "records");
  let work = 0, characters = 0;
  const charge = () => ++work <= limits.work;
  const text = (s: string) => { characters += s.length; return charge() && characters <= limits.characters; };
  const source = (s: SourceRef) => text(s.id) && text(s.revision);
  if (!text(occasion)) return unsupported("limit", "characters/work");
  for (const p of participants) if (!text(p)) return unsupported("limit", "characters/work");
  for (const item of data) {
    for (const p of item.preferences ?? []) {
      if (!charge() || !text(p.participant) || !text(p.occasion) || !source(p.source)) return unsupported("limit", "preferences");
      if (typeof p.quiet !== "boolean" || typeof p.seating !== "boolean") return unsupported("invalidInput", "preference");
    }
    for (const a of item.availability ?? []) {
      if (a.windows.length > limits.work - work) return unsupported("limit", "windows");
      if (!charge() || !text(a.participant) || !text(a.occasion) || !source(a.source)) return unsupported("limit", "availability");
      for (const window of a.windows) {
        if (!charge()) return unsupported("limit", "windows");
        if (window.length !== 2 || !Number.isFinite(window[0]) || !Number.isFinite(window[1]) || window[0] >= window[1]) return unsupported("invalidInput", "window");
      }
    }
    for (const p of item.places ?? []) {
      if (!charge() || !text(p.id) || !source(p.source)) return unsupported("limit", "places");
      if ([p.quiet, p.seating, p.open].some(v => v !== null && typeof v !== "boolean")) return unsupported("invalidInput", "place");
    }
    if (item.intention) {
      if (!charge() || !source(item.intention.source)) return unsupported("limit", "intention");
      if (!Number.isFinite(item.intention.minutes) || item.intention.minutes <= 0) return unsupported("invalidInput", "minutes");
    }
  }
}

/** Ordinary finite interval intersection. The only output type is windows. */
export function overlap(availability: Availability[], limits: Limits = DEFAULT_LIMITS): Windows | Unsupported {
  const failure = preflight([{ availability }], limits); if (failure) return failure;
  if (!availability.length) return unsupported("invalidInput", "availability");
  const normalize = (windows: Window[]) => {
    const sorted = windows.map(w => [...w] as Window).sort((a, b) => a[0] - b[0]);
    const result: Window[] = [];
    for (const current of sorted) {
      const previous = result.at(-1);
      if (previous && current[0] <= previous[1]) previous[1] = Math.max(previous[1], current[1]);
      else result.push(current);
    }
    return result;
  };
  let windows = normalize(availability[0]!.windows), work = 0;
  for (let person = 1; person < availability.length; person++) {
    const next = normalize(availability[person]!.windows), common: Window[] = [];
    let left = 0, right = 0;
    while (left < windows.length && right < next.length) {
      if (++work > limits.work) return unsupported("limit", "intersection");
      const a = windows[left]!, b = next[right]!;
      const start = Math.max(a[0], b[0]), end = Math.min(a[1], b[1]);
      if (start < end) common.push([start, end]);
      if (a[1] < b[1]) left++; else right++;
    }
    windows = common;
  }
  return { kind: "windows", windows, evidence: evidence(availability.map(a => a.source)) };
}

/** Supplied place order is the stable tie-breaker. Unknown observations stay unknown. */
export function matchPlace(preferences: Preference[], places: Place[], limits: Limits = DEFAULT_LIMITS): Options | Unsupported {
  const failure = preflight([{ preferences, places }], limits); if (failure) return failure;
  const quiet = preferences.some(p => p.quiet), seating = preferences.some(p => p.seating);
  const options: string[] = [], unknowns: string[] = [];
  for (const p of places) {
    if (p.open === false || (quiet && p.quiet === false) || (seating && p.seating === false)) continue;
    if (p.open === null || (quiet && p.quiet === null) || (seating && p.seating === null)) unknowns.push(p.id);
    else options.push(p.id);
  }
  return { kind: "options", options, unknowns, evidence: evidence(preferences.map(p => p.source), places.map(p => p.source)) };
}

/** Runtime tags enforce the narrow substitution boundary, even for untyped callers. */
export function assemble(windows: Windows | Options, options: Options | Windows, intention: Intention,
  asOf: number, limits: Limits = DEFAULT_LIMITS): Result | Unsupported {
  if (windows.kind !== "windows" || options.kind !== "options") return unsupported("typeMismatch", "windows/options");
  if (!Number.isFinite(asOf)) return unsupported("invalidInput", "asOf");
  const failure = preflight([{ intention }], limits); if (failure) return failure;
  if (windows.windows.length + options.options.length + windows.evidence.length + options.evidence.length > limits.work) return unsupported("limit", "assembly");
  let characters = 0;
  for (const ref of [...windows.evidence, ...options.evidence]) {
    characters += ref.id.length + ref.revision.length;
    if (characters > limits.characters) return unsupported("limit", "evidence");
  }
  for (const id of options.options) {
    characters += id.length; if (characters > limits.characters) return unsupported("limit", "options");
  }
  let selected: Window | undefined;
  for (const [start, end] of windows.windows) {
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return unsupported("invalidInput", "window");
    const first = Math.max(start, asOf);
    if (first + intention.minutes <= end && (!selected || first < selected[0])) selected = [first, first + intention.minutes];
  }
  const result: Result = { status: "result", options: [], evidence: evidence(windows.evidence, options.evidence, [intention.source]), reasons: [], asOf };
  if (!selected) result.reasons.push("noFeasibleWindow");
  if (!options.options.length) result.reasons.push("noKnownMatchingPlace");
  if (options.unknowns.length) result.reasons.push("somePlacesUnknown");
  if (selected && options.options.length) result.options.push({ place: options.options[0]!, window: selected, tentative: true });
  return result;
}

function sourceCheck(data: Partial<Slots>, states: States): Failure | undefined {
  const dependencies = [
    ...(data.preferences ?? []).map(p => ({ binding: `${p.participant}.preference`, source: p.source })),
    ...(data.availability ?? []).map(a => ({ binding: `${a.participant}.availability`, source: a.source })),
    ...(data.places ?? []).map(p => ({ binding: `place:${p.id}`, source: p.source })),
    ...(data.intention ? [{ binding: "intention", source: data.intention.source }] : []),
  ];
  for (const { binding, source } of dependencies) {
    const state = own(states, source.id);
    if (!state?.available) return { status: "reconsider", reason: "unavailableSource", binding };
    if (!state.eligible) return { status: "reconsider", reason: "ineligibleSource", binding };
    if (state.superseded || state.revision !== source.revision) return { status: "reconsider", reason: "staleSource", binding };
    if (state.validity === "invalid") return { status: "reconsider", reason: "invalidCondition", binding };
    if (state.validity === "unknown") return { status: "missing", slots: [`${binding}.validityEvidence`] };
  }
}

function evaluate(participants: string[], occasion: string, data: Partial<Slots>, states: States,
  asOf: number, applicability: Applicability, limits: Limits): Result | Failure {
  const failure = preflight([data], limits, participants, occasion); if (failure) return failure;
  if (applicability === "doesNotApply") return { status: "notApplicable", reason: "reviewedContext" };
  if (applicability === "unknown") return { status: "missing", slots: ["applicabilityEvidence"] };
  if (!participants.length || new Set(participants).size !== participants.length) return unsupported("invalidInput", "participants");
  const sourceFailure = sourceCheck(data, states); if (sourceFailure) return sourceFailure;
  const participantSet = new Set(participants);
  for (const slot of ["preferences", "availability"] as const) {
    const seen = new Set<string>();
    for (const record of data[slot] ?? []) {
      if (!participantSet.has(record.participant) || record.occasion !== occasion || seen.has(record.participant))
        return { status: "reconsider", reason: "bindingMismatch", binding: `${record.participant}.${slot}` };
      seen.add(record.participant);
    }
  }
  if (data.places && new Set(data.places.map(p => p.id)).size !== data.places.length) return unsupported("invalidInput", "duplicatePlaces");
  const missing: string[] = [];
  for (const participant of participants) {
    if (!data.preferences?.some(p => p.participant === participant)) missing.push(`${participant}.preference`);
    if (!data.availability?.some(a => a.participant === participant)) missing.push(`${participant}.availability`);
  }
  if (!data.places) missing.push("places"); if (!data.intention) missing.push("intention");
  if (missing.length) return { status: "missing", slots: missing };
  const windows = overlap(data.availability!, limits); if ("status" in windows) return windows;
  const options = matchPlace(data.preferences!, data.places!, limits); if ("status" in options) return options;
  if (!options.options.length && options.unknowns.length) return { status: "missing", slots: options.unknowns.map(id => `${id}.placeObservations`) };
  return assemble(windows, options, data.intention!, asOf, limits);
}

/** The ordinary full application is the competent deterministic comparator. */
export function plan(inputs: Inputs, states: States, asOf: number, applicability: Applicability = "applies", limits: Limits = DEFAULT_LIMITS) {
  return evaluate(inputs.participants, inputs.occasion, inputs, states, asOf, applicability, limits);
}

function slotSignature(slot: keyof Slots, value: Slots[keyof Slots]): string {
  const ref = (s: SourceRef) => [s.id, s.revision];
  // Fixed projections exclude arbitrary extra properties and make object key order irrelevant.
  if (slot === "preferences") return JSON.stringify((value as Preference[]).map(p => [p.participant, p.occasion, p.quiet, p.seating, ref(p.source)]).sort());
  if (slot === "availability") return JSON.stringify((value as Availability[]).map(a => [a.participant, a.occasion, a.windows, ref(a.source)]).sort());
  if (slot === "places") return JSON.stringify((value as Place[]).map(p => [p.id, p.quiet, p.seating, p.open, ref(p.source)]));
  const intention = value as Intention; return JSON.stringify([intention.minutes, ref(intention.source)]);
}

/** Residual inputs are ordinary data. Conflicts never silently overwrite a binding. */
export function instantiate(aid: Aid, supplied: Partial<Slots>, states: States, asOf: number,
  applicability: Applicability, limits: Limits = DEFAULT_LIMITS): Result | Failure {
  const failure = preflight([aid.bindings, supplied], limits, aid.participants, aid.occasion); if (failure) return failure;
  if (aid.recipe !== "shared-afternoon") return unsupported("invalidInput", "recipe");
  if (aid.retired) return { status: "notApplicable", reason: "retired" };
  if (applicability === "doesNotApply") return { status: "notApplicable", reason: "reviewedContext" };
  if (applicability === "unknown") return { status: "missing", slots: ["applicabilityEvidence"] };
  for (const slot of slots) {
    if (aid.bindings[slot] !== undefined && supplied[slot] !== undefined && slotSignature(slot, aid.bindings[slot]!) !== slotSignature(slot, supplied[slot]!))
      return { status: "reconsider", reason: "bindingConflict", binding: slot };
  }
  return evaluate(aid.participants, aid.occasion, { ...supplied, ...aid.bindings }, states, asOf, applicability, limits);
}

export function retireAid(aid: Aid): Aid {
  return { ...aid, retired: { reason: "noLongerUseful" } };
}
