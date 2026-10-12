/** Reviewed contextual meaning and finite consistency are separate pure operations. */
export type Domain = { variable: string; values: string[] };
export type Constraint = { id: string; variables: string[]; allowed: string[][] };
export type JointResult =
  | { status: 'compatible'; witness: { [variable: string]: string }; narrowing: { [variable: string]: string[] }; assignmentsExamined: number }
  | { status: 'conflict'; assignmentsExamined: number }
  | { status: 'unknown'; reason: string; assignmentsExamined: number };
const atom = (s: string) => typeof s === 'string' && s.length > 0 && s.length <= 128;
const strings = (xs: string[], cap = 64) => Array.isArray(xs) && xs.length <= cap && xs.every(atom) && new Set(xs).size === xs.length;
const unknown = (reason: string, assignmentsExamined = 0): JointResult => ({ status: 'unknown', reason, assignmentsExamined });
const sorted = (xs: string[]) => [...xs].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
/** Exact bounded enumeration over declared domains. A witness establishes existence, not truth. */
export function checkJoint(domains: Domain[], constraints: Constraint[], assignmentCap: number): JointResult {
  if (!Number.isSafeInteger(assignmentCap) || assignmentCap < 0 || assignmentCap > 100000 ||
    domains.length > 12 || constraints.length > 64) return unknown('input-limit');
  const byVariable = new Map<string, string[]>();
  for (const d of domains) {
    if (!atom(d.variable) || !strings(d.values) || byVariable.has(d.variable)) return unknown('invalid-domain');
    byVariable.set(d.variable, sorted(d.values));
  }
  const ids = new Set<string>();
  const compiled: { variables: string[]; allowed: Set<string> }[] = [];
  let tupleCount = 0;
  for (const c of constraints) {
    if (!atom(c.id) || ids.has(c.id) || !strings(c.variables, 12) || c.variables.some(v => !byVariable.has(v)) ||
      !Array.isArray(c.allowed) || c.allowed.length > 2048 || (tupleCount += c.allowed.length) > 4096) return unknown('invalid-constraint-or-input-limit');
    ids.add(c.id);
    const allowed = new Set<string>();
    for (const tuple of c.allowed) {
      if (!Array.isArray(tuple) || tuple.length !== c.variables.length ||
        tuple.some((value, i) => !atom(value) || !byVariable.get(c.variables[i])!.includes(value))) return unknown('invalid-tuple');
      allowed.add(JSON.stringify(tuple));
    }
    compiled.push({ variables: c.variables, allowed });
  }
  // Narrowing below means domain restriction from unary constraints only, not enumeration of every supported value.
  const narrowing: { [variable: string]: string[] } = Object.create(null);
  for (const [variable, values] of byVariable) narrowing[variable] = values.filter(value =>
    compiled.every(c => c.variables.length !== 1 || c.variables[0] !== variable || c.allowed.has(JSON.stringify([value]))));
  const cardinalities = domains.map(d => d.values.length);
  if (cardinalities.includes(0)) return { status: 'conflict', assignmentsExamined: 0 };
  // Clamp the space size; exact huge products are unnecessary for the bounded decision.
  let total = 1;
  for (const n of cardinalities) total = Math.min(assignmentCap + 1, total * n);
  const count = Math.min(total, assignmentCap);
  for (let index = 0; index < count; index++) {
    let remaining = index;
    const assignment: { [variable: string]: string } = Object.create(null);
    for (let i = domains.length - 1; i >= 0; i--) {
      const values = byVariable.get(domains[i].variable)!;
      assignment[domains[i].variable] = values[remaining % values.length];
      remaining = Math.floor(remaining / values.length);
    }
    if (compiled.every(c => c.allowed.has(JSON.stringify(c.variables.map(v => assignment[v])))))
      return { status: 'compatible', witness: assignment, narrowing, assignmentsExamined: index + 1 };
  }
  return total <= assignmentCap ? { status: 'conflict', assignmentsExamined: count } : unknown('assignment-cap', count);
}
/** A competent pairwise comparator receives the exact same reviewed constraints. */
export function pairwiseChecks(domains: Domain[], constraints: Constraint[], assignmentCap: number) {
  if (constraints.length > 64 || constraints.some(c => !atom(c.id))) return [{ pair: [] as string[], result: unknown('input-limit') }];
  const results: { pair: string[]; result: JointResult }[] = [];
  for (let i = 0; i < constraints.length; i++) for (let j = i + 1; j < constraints.length; j++)
    results.push({ pair: [constraints[i].id, constraints[j].id], result: checkJoint(domains, [constraints[i], constraints[j]], assignmentCap) });
  return results;
}
export type Dimension = { kind: 'set'; values: string[] } |
  { kind: 'interval'; from: number | null | 'unknown'; until: number | null | 'unknown' } |
  { kind: 'unknown' | 'unrestricted' | 'irrelevant' };
export type Context = { name: string; dimension: Dimension };
export type Account = {
  id: string; source: { id: string; revision: string }; subject: string | null;
  property: string; values: string[]; context: Context[]; observer?: string | null; origin?: string;
};
export type Alignment = { id: string; recordIds: string[]; subject: string; property: string;
  dimensions: string[]; observerRelative?: boolean; region?: Context[] };
export type SourceState = { revision: string; eligible: boolean };
export type ContextReport = { group: string; recordIds: string[]; alignment: 'aligned' | 'separate' | 'unknown'; reason: string;
  sourceRefs: { id: string; revision: string }[]; region?: Context[]; joint?: JointResult };
function validDimension(d: Dimension) {
  if (!d) return false;
  if (d.kind === 'set') return strings(d.values);
  if (d.kind === 'interval') return [d.from, d.until].every(n => n === null || n === 'unknown' || typeof n === 'number' && Number.isFinite(n)) &&
    !(typeof d.from === 'number' && typeof d.until === 'number' && d.from > d.until);
  return ['unknown', 'unrestricted', 'irrelevant'].includes(d.kind);
}
function validContext(context: Context[]) {
  return Array.isArray(context) && context.length <= 16 && context.every(c => atom(c.name) && validDimension(c.dimension)) &&
    new Set(context.map(c => c.name)).size === context.length;
}
function validAccount(a: Account) {
  return a && atom(a.id) && a.source && atom(a.source.id) && atom(a.source.revision) &&
    (a.subject === null || atom(a.subject)) && atom(a.property) && strings(a.values) && validContext(a.context) &&
    (a.observer === undefined || a.observer === null || atom(a.observer));
}
type Overlap = { status: 'overlap'; dimension: Dimension } | { status: 'separate' | 'unknown' };
function overlap(dimensions: Dimension[]): Overlap {
  let uncertain = false;
  const known: Dimension[] = [];
  for (const d of dimensions) {
    if (d.kind === 'unknown' || d.kind === 'interval' && (d.from === 'unknown' || d.until === 'unknown')) uncertain = true;
    else if (d.kind !== 'unrestricted' && d.kind !== 'irrelevant') known.push(d);
  }
  let result: Dimension = { kind: 'unrestricted' };
  for (const d of known) {
    if (result.kind === 'unrestricted') result = d;
    else if (result.kind === 'set' && d.kind === 'set') result = { kind: 'set', values: result.values.filter(v => d.values.includes(v)) };
    else if (result.kind === 'interval' && d.kind === 'interval') {
      const from = Math.max(result.from === null ? -Infinity : result.from as number, d.from === null ? -Infinity : d.from as number);
      const until = Math.min(result.until === null ? Infinity : result.until as number, d.until === null ? Infinity : d.until as number);
      if (from >= until) return { status: 'separate' };
      result = { kind: 'interval', from: Number.isFinite(from) ? from : null, until: Number.isFinite(until) ? until : null };
    } else return { status: 'unknown' };
    if (result.kind === 'set' && !result.values.length) return { status: 'separate' };
    if (result.kind === 'interval' && typeof result.from === 'number' && typeof result.until === 'number' && result.from === result.until) return { status: 'separate' };
  }
  return uncertain ? { status: 'unknown' } : { status: 'overlap', dimension: result };
}
function sameDimension(a: Dimension, b: Dimension) {
  if (a.kind === 'set' && b.kind === 'set') return JSON.stringify(sorted(a.values)) === JSON.stringify(sorted(b.values));
  if (a.kind === 'interval' && b.kind === 'interval') return a.from === b.from && a.until === b.until;
  return a.kind === b.kind && a.kind !== 'set' && a.kind !== 'interval';
}
/** Caller supplies reviewed groups/regions. No clustering of merely pairwise overlapping contexts. */
export function compareContexts(records: readonly Account[], alignment: readonly Alignment[], sources: ReadonlyMap<string, SourceState>, scanCap = 100): ContextReport[] {
  if (!Number.isSafeInteger(scanCap) || scanCap < 0 || scanCap > 1000 || alignment.length > 128)
    return [{ group: 'input', recordIds: [], alignment: 'unknown', reason: 'input-limit', sourceRefs: [] }];
  const byId = new Map<string, Account>(), invalid = new Set<string>();
  for (let i = 0; i < Math.min(records.length, scanCap); i++) {
    const record = records[i];
    if (!validAccount(record)) { if (record && atom(record.id)) invalid.add(record.id); continue; }
    if (byId.has(record.id)) invalid.add(record.id);
    byId.set(record.id, record);
  }
  const reports: ContextReport[] = [], mentioned = new Set<string>();
  for (const group of alignment) {
    if (!atom(group.id) || !strings(group.recordIds) || !group.recordIds.length || !atom(group.subject) || !atom(group.property) ||
      !strings(group.dimensions, 16) || group.region !== undefined && !validContext(group.region)) {
      reports.push({ group: 'invalid-group', recordIds: [], alignment: 'unknown', reason: 'invalid-reviewed-alignment', sourceRefs: [] }); continue;
    }
    group.recordIds.forEach(id => mentioned.add(id));
    const accounts = group.recordIds.map(id => byId.get(id));
    const base = { group: group.id, recordIds: [...group.recordIds], sourceRefs: accounts.filter((a): a is Account => !!a).map(a => a.source) };
    const report = (status: ContextReport['alignment'], reason: string) => reports.push({ ...base, alignment: status, reason });
    if (accounts.some(a => !a) || group.recordIds.some(id => invalid.has(id))) { report('unknown', 'record-missing-invalid-or-outside-cap'); continue; }
    const current = accounts as Account[];
    const sourceProblem = current.map(a => {
      const state = sources.get(a.source.id);
      return !state ? 'source-unavailable' : !state.eligible ? 'source-ineligible' : state.revision !== a.source.revision ? 'source-stale' : null;
    }).find(Boolean);
    if (sourceProblem) { report('unknown', sourceProblem); continue; }
    if (current.some(a => a.subject === null)) { report('unknown', 'subject-unresolved'); continue; }
    if (current.some(a => a.subject !== group.subject || a.property !== group.property)) { report('unknown', 'reviewed-key-mismatch'); continue; }
    if (current.some(a => a.context.some(c => !group.dimensions.includes(c.name) && c.dimension.kind !== 'irrelevant'))) {
      report('unknown', 'undeclared-record-dimension'); continue;
    }
    if (group.observerRelative) {
      if (current.some(a => !a.observer)) { report('unknown', 'observer-unresolved'); continue; }
      if (new Set(current.map(a => a.observer)).size > 1) { report('separate', 'distinct-attributed-observers'); continue; }
    }
    if (group.region?.some(c => !group.dimensions.includes(c.name))) { report('unknown', 'undeclared-region-dimension'); continue; }
    const region: Context[] = [];
    let separate = false, uncertain = false;
    for (const name of group.dimensions) {
      const dimensions = current.map(a => a.context.find(c => c.name === name)?.dimension ?? { kind: 'unknown' as const });
      const supplied = group.region?.find(c => c.name === name)?.dimension;
      const result = overlap(supplied ? [...dimensions, supplied] : dimensions);
      if (result.status === 'separate') separate = true;
      else if (result.status === 'unknown') uncertain = true;
      else if (supplied && !sameDimension(result.dimension, supplied)) uncertain = true;
      else region.push({ name, dimension: result.dimension });
    }
    if (separate) { report('separate', 'disjoint-applicability'); continue; }
    if (uncertain) { report('unknown', 'applicability-overlap-unresolved'); continue; }
    const values = [...new Set(current.flatMap(a => a.values))];
    if (values.length > 64) { report('unknown', 'value-domain-limit'); continue; }
    const joint = checkJoint([{ variable: 'value', values }], current.map(a => ({ id: a.id, variables: ['value'], allowed: a.values.map(v => [v]) })), 64);
    reports.push({ ...base, alignment: 'aligned', reason: 'reviewed-common-region', region, joint });
  }
  for (const [id, account] of byId) if (!mentioned.has(id))
    reports.push({ group: `unaligned:${id}`, recordIds: [id], alignment: 'unknown', reason: 'no-reviewed-group', sourceRefs: [account.source] });
  if (records.length > scanCap) reports.push({ group: 'coverage', recordIds: [], alignment: 'unknown', reason: 'scan-cap', sourceRefs: [] });
  return reports;
}
