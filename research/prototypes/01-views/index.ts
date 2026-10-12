/** Optional fixture-only view operations. All inputs and current source state are supplied. */
export type Ref = { id: string; revision: string };
export type SourceState = { revision: string; eligible: boolean; text: string };
export type Record = Ref & {
  claim: string; qualifications: string[]; rank: number; scope?: string; time?: number;
  disagreements: { ref: Ref; state: 'open' | 'resolved' }[];
};
export type Selector = { ids?: readonly string[]; scope?: string; since?: number; until?: number };
export type Limits = { chars: number; maxRecords: number; scanCap: number; maxRecordChars: number };
export type Population = { complete: boolean };
export type View = {
  kind: 'view'; text: string; includedRefs: Ref[]; eligibleCount: number;
  omittedCount: number; unresolvedCount: number; unmetCount: number;
  populationComplete: boolean; inspected: number;
};
export type ViewResult = View | { kind: 'invalid-budget' | 'invalid-input'; reason: string };
export const defaults: Limits = { chars: 4000, maxRecords: 20, scanCap: 100, maxRecordChars: 8000 };
const small = (s: string) => typeof s === 'string' && s.length > 0 && s.length <= 128;
const validRef = (r: Ref) => r && small(r.id) && small(r.revision);
const validLimits = (l: Limits) => [l.chars, l.maxRecords, l.scanCap, l.maxRecordChars]
  .every(n => Number.isSafeInteger(n) && n >= 0) && l.scanCap <= 10000 && l.maxRecords <= 10000 && l.maxRecordChars <= 100000;
function validSelector(s: Selector) {
  return (!s.ids || s.ids.length <= 10000 && s.ids.every(small)) &&
    (s.scope === undefined || small(s.scope)) &&
    (s.since === undefined || Number.isFinite(s.since)) &&
    (s.until === undefined || Number.isFinite(s.until)) &&
    !(s.since !== undefined && s.until !== undefined && s.since > s.until);
}
function validRecord(r: Record, maxChars: number): boolean {
  return validRef(r) && typeof r.claim === 'string' && r.claim.length <= maxChars &&
    Number.isFinite(r.rank) && (r.scope === undefined || small(r.scope)) &&
    (r.time === undefined || Number.isFinite(r.time)) &&
    Array.isArray(r.qualifications) && r.qualifications.length <= 16 &&
    r.qualifications.every(q => typeof q === 'string' && q.length <= maxChars) &&
    Array.isArray(r.disagreements) && r.disagreements.length <= 16 &&
    r.disagreements.every(d => validRef(d.ref) && (d.state === 'open' || d.state === 'resolved'));
}
function matches(r: Record, s: Selector): true | false | 'unknown' {
  if (s.ids && !s.ids.includes(r.id)) return false;
  if (s.scope !== undefined && r.scope !== undefined && r.scope !== s.scope) return false;
  if (s.scope !== undefined && r.scope === undefined) return 'unknown';
  if ((s.since !== undefined || s.until !== undefined) && r.time === undefined) return 'unknown';
  if (s.since !== undefined && r.time! < s.since) return false;
  if (s.until !== undefined && r.time! >= s.until) return false;
  return true;
}
/** Restriction is separate from sorting/truncation. No semantic selector is inferred. */
export function restrictRecords(records: readonly Record[], states: ReadonlyMap<string, SourceState>, selector: Selector,
  scanCap = 100, maxRecordChars = 8000) {
  if (!validLimits({ chars: 0, maxRecords: 0, scanCap, maxRecordChars }) || !validSelector(selector))
    throw new Error('Invalid bounded selection inputs');
  const matched: Record[] = [];
  let unresolved = 0;
  const inspected = Math.min(records.length, scanCap);
  const seen = new Set<string>();
  for (let i = 0; i < inspected; i++) {
    const r = records[i];
    if (!validRecord(r, maxRecordChars)) { unresolved++; continue; }
    if (seen.has(r.id)) { unresolved++; continue; }
    seen.add(r.id);
    const state = states.get(r.id);
    if (state && !state.eligible) continue;
    if (!state || state.revision !== r.revision) { unresolved++; continue; }
    const result = matches(r, selector);
    if (result === true) matched.push(r);
    if (result === 'unknown') unresolved++;
  }
  return { matched, unresolved, inspected, complete: inspected === records.length };
}
function bundle(r: Record) {
  const qualifications = r.qualifications.length ? ` | ${r.qualifications.join('; ')}` : '';
  const open = r.disagreements.filter(d => d.state === 'open')
    .map(d => `${d.ref.id}@${d.ref.revision}`).join(',');
  return `[${r.id}@${r.revision}] ${r.claim}${qualifications}${open ? ` | unresolved disagreement: ${open}` : ''}\n`;
}
function footer(eligible: number, omitted: number, unresolved: number, unmet: number, complete: boolean) {
  return `coverage supplied: eligible=${eligible}; omitted=${omitted}; unresolved=${unresolved}; unmet=${unmet}; complete=${complete}`;
}
/** The entire serialized View, not merely text, fits the character budget. */
export function makeView(records: readonly Record[], states: ReadonlyMap<string, SourceState>, selector: Selector,
  limits: Limits = defaults, population: Population = { complete: true }): ViewResult {
  if (!validLimits(limits) || !validSelector(selector)) return { kind: 'invalid-input', reason: 'Invalid bounded inputs' };
  const selected = restrictRecords(records, states, selector, limits.scanCap, limits.maxRecordChars);
  const ordered = selected.matched.map((record, index) => ({ record, index }))
    .sort((a, b) => a.record.rank - b.record.rank || a.index - b.index).map(r => r.record);
  // One population-fixed upper bound keeps budget growth prefix-monotone.
  const n = selected.inspected;
  const reserved: View = { kind: 'view', text: footer(n, n, n, n, false), includedRefs: [],
    eligibleCount: n, omittedCount: n, unresolvedCount: n, unmetCount: n,
    populationComplete: false, inspected: n };
  let used = JSON.stringify(reserved).length;
  if (limits.chars < used) return { kind: 'invalid-budget', reason: `Coverage requires reservation of ${used} characters` };
  const includedRefs: Ref[] = [];
  const lines: string[] = [];
  let unmet = 0;
  for (const r of ordered) {
    if (includedRefs.length >= limits.maxRecords) break;
    const line = bundle(r), ref = { id: r.id, revision: r.revision };
    const extra = JSON.stringify(line).length - 2 + JSON.stringify(ref).length + (includedRefs.length ? 1 : 0);
    if (used + extra > limits.chars) { unmet++; break; }
    used += extra; lines.push(line); includedRefs.push(ref);
  }
  const complete = population.complete && selected.complete;
  const omitted = ordered.length - includedRefs.length;
  const result: View = { kind: 'view', text: lines.join('') + footer(ordered.length, omitted, selected.unresolved, unmet, complete),
    includedRefs, eligibleCount: ordered.length, omittedCount: omitted,
    unresolvedCount: selected.unresolved, unmetCount: unmet, populationComplete: complete, inspected: selected.inspected };
  return result;
}
export type Expansion = { ref: Ref; status: 'available'; text: string } |
  { ref: Ref; status: 'unavailable' | 'ineligible' | 'changed-revision' | 'over-budget' | 'input-limit' };
/** Checks fresh supplied state before expanding; never reconstructs absent text. */
export function expand(refs: readonly Ref[], states: ReadonlyMap<string, SourceState>, chars: number, scanCap = 100) {
  if (!Number.isSafeInteger(chars) || chars < 0 || !Number.isSafeInteger(scanCap) || scanCap < 0 || scanCap > 10000)
    return { kind: 'invalid-input' as const };
  const minimum = JSON.stringify({ kind: 'expansion', entries: [], inspected: Math.min(refs.length, scanCap), complete: false }).length;
  if (chars < minimum) return { kind: 'invalid-budget' as const };
  const entries: Expansion[] = [];
  let inspected = 0, complete = refs.length <= scanCap;
  for (let i = 0; i < Math.min(refs.length, scanCap); i++) {
    const ref = refs[i]; inspected++;
    if (!validRef(ref)) { complete = false; break; }
    const state = states.get(ref.id);
    let entry: Expansion;
    if (!state) entry = { ref, status: 'unavailable' };
    else if (!state.eligible) entry = { ref, status: 'ineligible' };
    else if (state.revision !== ref.revision) entry = { ref, status: 'changed-revision' };
    else if (state.text.length > chars) entry = { ref, status: 'over-budget' };
    else entry = { ref, status: 'available', text: state.text };
    const size = (e: Expansion) => JSON.stringify({ kind: 'expansion', entries: [...entries, e], inspected: Math.min(refs.length, scanCap), complete: false }).length;
    if (size(entry) > chars && entry.status === 'available') entry = { ref, status: 'over-budget' };
    if (size(entry) > chars) { complete = false; break; }
    entries.push(entry);
  }
  return { kind: 'expansion' as const, entries, inspected, complete };
}
/** Competent same-information comparator: ordinary filter-sort-prefix, without preservation/coverage rendering. */
export function simpleSelection(records: readonly Record[], states: ReadonlyMap<string, SourceState>, selector: Selector, cap: number) {
  if (!Number.isSafeInteger(cap) || cap < 0 || cap > 10000) throw new Error('Invalid selection cap');
  return restrictRecords(records, states, selector).matched.map((record, index) => ({ record, index }))
    .sort((a, b) => a.record.rank - b.record.rank || a.index - b.index).slice(0, cap).map(({ record }) => record.id);
}
