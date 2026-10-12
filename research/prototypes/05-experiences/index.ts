/** Reviewed fixture annotations, not a semantic extractor or a production hook. */
export type Ref = { source: string; revision: string };
export type SourceState = { revision: string; available: boolean; eligible: boolean };
export type Sources = Readonly<Record<string, SourceState>>;
export type Target = { id: string } | { candidates: string[] };
export type Participant = {
  person: string | null; role: string; candidates?: string[]; interval?: [number, number];
};
export type Occasion = {
  id: string; ref: Ref; narrative: string; participants: Participant[];
  mentioned: string[]; coPresence: string[][]; time?: string;
};
export type Interpretation = {
  id: string; ref: Ref; occasion: Target; question: { id: string | null; label: string };
  author: string; account: string; reflectionTime?: string; entry?: boolean;
};
export type Revisit = { id: string; from: string; to: string; ref: Ref; account: string };
export type Population = { occasions: Occasion[]; interpretations: Interpretation[]; revisits: Revisit[] };
export type Limits = { inputCap: number; itemsPerRecord: number; fieldChars: number; depth: number; records: number; outputChars: number };
export const DEFAULT_LIMITS: Limits = { inputCap: 100, itemsPerRecord: 30, fieldChars: 2000, depth: 8, records: 30, outputChars: 12000 };
export type Availability = "eligible" | "unavailable" | "ineligible" | "stale" | "unknown";

function limitsOK(l: Limits): boolean {
  return Object.values(l).every(v => Number.isSafeInteger(v) && v >= 0);
}
export function availability(ref: Ref, sources: Sources): Availability {
  const s = sources[ref.source];
  if (!s) return "unknown";
  if (!s.available) return "unavailable";
  if (!s.eligible) return "ineligible";
  return s.revision === ref.revision ? "eligible" : "stale";
}
function short(s: string | null | undefined, l: Limits): boolean {
  return s == null || s.length <= l.fieldChars;
}
function refFits(r: Ref, l: Limits): boolean { return short(r.source, l) && short(r.revision, l); }
function targetFits(t: Target, l: Limits): boolean {
  return "id" in t ? short(t.id, l) : t.candidates.length <= l.itemsPerRecord && t.candidates.every(x => short(x, l));
}
function occasionFits(o: Occasion, l: Limits): boolean {
  if (o.participants.length > l.itemsPerRecord || o.mentioned.length > l.itemsPerRecord || o.coPresence.length > l.itemsPerRecord) return false;
  return short(o.id, l) && refFits(o.ref, l) && short(o.narrative, l) && short(o.time, l)
    && o.participants.every(p => short(p.person, l) && short(p.role, l)
      && (!p.candidates || p.candidates.length <= l.itemsPerRecord && p.candidates.every(c => short(c, l)))
      && (!p.interval || p.interval.length === 2 && p.interval.every(Number.isFinite) && p.interval[0] < p.interval[1]))
    && o.mentioned.every(x => short(x, l))
    && o.coPresence.every(g => g.length <= l.itemsPerRecord && g.every(x => short(x, l)));
}
function interpretationFits(i: Interpretation, l: Limits): boolean {
  return [i.id, i.author, i.account, i.question.id, i.question.label, i.reflectionTime].every(s => short(s, l)) && refFits(i.ref, l) && targetFits(i.occasion, l);
}
function revisitFits(r: Revisit, l: Limits): boolean {
  return [r.id, r.from, r.to, r.account].every(s => short(s, l)) && refFits(r.ref, l);
}
function bounded<T extends { id: string }>(xs: T[], fits: (x: T, l: Limits) => boolean, l: Limits) {
  const accepted: T[] = [], rejected: string[] = [], seen = new Set<string>();
  let inspected = 0;
  for (let n = 0; n < Math.min(xs.length, l.inputCap); n++) {
    const x = xs[n]; inspected++;
    if (!fits(x, l) || seen.has(x.id)) { rejected.push("invalid-or-duplicate-record"); continue; }
    seen.add(x.id); accepted.push(x);
  }
  return { accepted, rejected, inspected, complete: xs.length <= l.inputCap && !rejected.length };
}

/** Deliberate alias: ordinary incidence is this operation, not an independent benchmark. */
export function ordinaryIncidence(people: string[], occasions: Occasion[], sources: Sources, l: Limits = DEFAULT_LIMITS) {
  return jointOccasions(people, occasions, sources, l);
}

/** Budget includes all successful response metadata. A refusal carries no memory payload. */
function fitOutput<T extends { outputChars: number }>(result: T, l: Limits): T | { status: "unsupported"; reason: "output-limit" } {
  for (let n = 0; n < 4; n++) result.outputChars = JSON.stringify(result).length;
  return result.outputChars <= l.outputChars ? result : { status: "unsupported", reason: "output-limit" };
}

export function jointOccasions(people: string[], occasions: Occasion[], sources: Sources, l: Limits = DEFAULT_LIMITS) {
  if (!limitsOK(l) || !people.length || people.length > l.itemsPerRecord || !people.every(p => short(p, l))) return { status: "unsupported" as const, reason: "limit-or-empty-query" };
  const pop = bounded(occasions, occasionFits, l);
  const matches: { id: string; roles: { person: string; role: string }[]; simultaneous: "supported" | "unknown" }[] = [];
  const unresolved: { id: string; reason: string }[] = [];
  let chars = 0, complete = pop.complete;
  for (const o of pop.accepted) {
    const state = availability(o.ref, sources);
    if (state !== "eligible") { unresolved.push({ id: o.id, reason: state }); continue; }
    const ps = people.map(person => o.participants.find(p => p.person === person));
    if (ps.some(p => !p)) {
      unresolved.push({ id: o.id, reason: "participation-unknown" });
      continue;
    }
    const participants = ps as Participant[];
    const intervals = participants.map(p => p.interval);
    const overlap = intervals.every(i => i !== undefined) && Math.max(...intervals.map(i => i![0])) < Math.min(...intervals.map(i => i![1]));
    const group = o.coPresence.some(g => people.every(p => g.includes(p)));
    const entry = { id: o.id, roles: participants.map(p => ({ person: p.person!, role: p.role })), simultaneous: group || overlap ? "supported" as const : "unknown" as const };
    const size = JSON.stringify(entry).length;
    if (matches.length >= l.records || chars + size > l.outputChars) { complete = false; continue; }
    matches.push(entry); chars += size;
  }
  return fitOutput({ status: "ok" as const, matches, unresolved, coverage: { complete, inspected: pop.inspected, rejected: pop.rejected.length }, outputChars: chars }, l);
}

export function checkRevisit(a: Interpretation, b: Interpretation, relation: Revisit, sources: Sources, l: Limits = DEFAULT_LIMITS) {
  if (!limitsOK(l) || !interpretationFits(a, l) || !interpretationFits(b, l) || !revisitFits(relation, l)) return { status: "unknown" as const, reason: "limit" };
  if (relation.from !== a.id || relation.to !== b.id || !relation.account.trim()) return { status: "unknown" as const, reason: "missing-relation-account-or-endpoints" };
  for (const ref of [a.ref, b.ref, relation.ref]) {
    const state = availability(ref, sources);
    if (state !== "eligible") return { status: "unknown" as const, reason: state };
  }
  if (!("id" in a.occasion) || !("id" in b.occasion) || a.question.id === null || b.question.id === null) return { status: "unknown" as const, reason: "unresolved-boundary" };
  if (a.occasion.id !== b.occasion.id) return { status: "mismatchedBoundary" as const, reason: "occasion" };
  if (a.question.id !== b.question.id) return { status: "mismatchedBoundary" as const, reason: "question" };
  return { status: "sameBoundary" as const };
}

export function recallOccasion(id: string, records: Population, sources: Sources, l: Limits = DEFAULT_LIMITS) {
  if (!limitsOK(l) || !short(id, l)) return { status: "unsupported" as const, reason: "limit" };
  const os = bounded(records.occasions, occasionFits, l), ins = bounded(records.interpretations, interpretationFits, l), rs = bounded(records.revisits, revisitFits, l);
  const o = os.accepted.find(x => x.id === id);
  const occasionState = o ? availability(o.ref, sources) : "unknown";
  let complete = os.complete && ins.complete && rs.complete;
  const unresolved: { id: string; reason: string; candidates?: string[] }[] = [];
  const accountedInterpretations = new Set<string>();
  const accounts: { id: string; author: string; account: string; ref: Ref; reflectionTime?: string; attendance: "supported" | "unknown" }[] = [];
  const all = new Map(ins.accepted.map(i => [i.id, i]));
  const queue: { id: string; depth: number; ancestors: string[] }[] = ins.accepted.filter(i => "id" in i.occasion && i.occasion.id === id && i.entry).sort((a, b) => a.id.localeCompare(b.id)).map(i => ({ id: i.id, depth: 0, ancestors: [] }));
  for (const i of ins.accepted) if (!("id" in i.occasion) && i.occasion.candidates.includes(id)) {
    unresolved.push({ id: i.id, reason: "unresolved-occasion", candidates: i.occasion.candidates });
    accountedInterpretations.add(i.id);
    complete = false;
  }
  let chars = 0;
  let narrative: { text: string; ref: Ref; time?: string } | null = null;
  if (o && occasionState === "eligible") {
    const value = { text: o.narrative, ref: o.ref, time: o.time };
    const size = JSON.stringify(value).length;
    if (size <= l.outputChars) { narrative = value; chars += size; }
    else complete = false;
  }
  const visited = new Set<string>(), cycles: string[] = [];
  let cursor = 0;
  while (cursor < queue.length) {
    const next = queue[cursor++];
    if (visited.has(next.id)) continue;
    if (accounts.length >= l.records) { complete = false; break; }
    visited.add(next.id);
    const i = all.get(next.id)!;
    const state = availability(i.ref, sources);
    if (state !== "eligible") { unresolved.push({ id: i.id, reason: state }); accountedInterpretations.add(i.id); continue; }
    const entry = { id: i.id, author: i.author, account: i.account, ref: i.ref, reflectionTime: i.reflectionTime, attendance: o && occasionState === "eligible" && o.participants.some(p => p.person === i.author) ? "supported" as const : "unknown" as const };
    const size = JSON.stringify(entry).length;
    if (chars + size > l.outputChars) { complete = false; continue; }
    accounts.push(entry); chars += size;
    for (const r of rs.accepted.filter(r => r.from === i.id).sort((a, b) => a.id.localeCompare(b.id))) {
      // A depth cap refuses inspection of the target, including potential cycles.
      if (next.depth >= l.depth) { complete = false; continue; }
      const target = all.get(r.to);
      if (!target) { unresolved.push({ id: r.id, reason: "orphan-target" }); continue; }
      const check = checkRevisit(i, target, r, sources, l);
      if (check.status !== "sameBoundary") { unresolved.push({ id: r.id, reason: check.reason! }); continue; }
      if (r.to === i.id || next.ancestors.includes(r.to)) { cycles.push(r.id); continue; }
      if (!visited.has(r.to)) queue.push({ id: r.to, depth: next.depth + 1, ancestors: [...next.ancestors, i.id] });
    }
  }
  // Seeded traversal is a selected view of the supplied population. Account for
  // every known relevant omission without claiming whether a missing link or a
  // traversal cap caused it. Inspect only the already bounded population.
  const emitted = new Set(accounts.map(account => account.id));
  for (const i of ins.accepted) {
    if (!("id" in i.occasion) || i.occasion.id !== id || emitted.has(i.id)) continue;
    complete = false;
    if (accountedInterpretations.has(i.id)) continue;
    const state = availability(i.ref, sources);
    unresolved.push({ id: i.id, reason: state === "eligible" ? "omittedFromSelectedView" : state });
    accountedInterpretations.add(i.id);
  }
  return fitOutput({ status: "ok" as const, occasion: { id, state: occasionState, narrative }, accounts, unresolved, cycles, coverage: { complete, inspected: os.inspected + ins.inspected + rs.inspected }, outputChars: chars }, l);
}
