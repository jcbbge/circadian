/** Optional read-only checks over current memory evidence. No inference or publication.
 * Exact copying and comparisons of annotations are checked; semantic truth is UNKNOWN.
 */
import { memoryExpand, type ViewRef } from './views.ts';

type Obj = Record<string, unknown>;
type Selection = { atomId: string; source: string; sourceRevision: string; start: number; end: number };
type Field = { state: 'known'; selection: number } | { state: 'absent' | 'unknown' };
type Account = { subject: string; property: string; values: string[] | null;
  day: { kind: 'set'; values: string[] } | { kind: 'unknown' | 'unrestricted' }; evidence: number[] };
type Comparison = { kind: 'fields'; left: Record<string, Field>; right: Record<string, Field> } |
  { kind: 'contexts'; left: Account; right: Account };
type Claim = { relation: 'recording-location' | 'event-location' | 'participation'; subject: string; value: string; selection: number };
export type MemoryCheckArgs = { refs: ViewRef[]; selections: Selection[]; chars?: number; comparison?: Comparison; claims?: Claim[] };
type CheckedSelection = Selection & { status: string; semantic: 'UNKNOWN'; label?: string; labelKind?: 'document-title' | 'filename'; quote?: string };

const object = (properties: Record<string, unknown>, required = Object.keys(properties)) =>
  ({ type: 'object', properties, required, additionalProperties: false });
const string = { type: 'string', minLength: 1, maxLength: 160 };
const integer = { type: 'integer', minimum: 0 };
const index = { ...integer, maximum: 31 };
const strings = { type: 'array', items: string, maxItems: 32, uniqueItems: true };
const field = { oneOf: [object({ state: { const: 'known' }, selection: index }), object({ state: { enum: ['absent', 'unknown'] } })] };
const fieldMap = { type: 'object', additionalProperties: field, minProperties: 1, maxProperties: 32,
  propertyNames: { type: 'string', minLength: 1, maxLength: 80 } };
const day = { oneOf: [object({ kind: { const: 'set' }, values: { ...strings, minItems: 1 } }), object({ kind: { enum: ['unknown', 'unrestricted'] } })] };
const account = object({ subject: string, property: string, values: { anyOf: [strings, { type: 'null' }] }, day,
  evidence: { type: 'array', items: index, minItems: 1, maxItems: 32, uniqueItems: true } });
export const memoryCheckSchema = object({
  refs: { type: 'array', minItems: 1, maxItems: 12, items: object({
    id: { type: 'string', pattern: '^[a-f0-9]{12}$' }, revision: { type: 'string', pattern: '^[a-f0-9]{64}$' } }) },
  selections: { type: 'array', minItems: 1, maxItems: 32, items: object({
    atomId: { type: 'string', pattern: '^[a-f0-9]{12}$' }, source: { type: 'string', minLength: 1, maxLength: 256 },
    sourceRevision: { type: 'string', pattern: '^[a-f0-9]{64}$' }, start: integer, end: integer }) },
  chars: { ...integer, maximum: 128000 },
  comparison: { oneOf: [object({ kind: { const: 'fields' }, left: fieldMap, right: fieldMap }),
    object({ kind: { const: 'contexts' }, left: account, right: account })] },
  claims: { type: 'array', maxItems: 32, items: object({
    relation: { enum: ['recording-location', 'event-location', 'participation'] }, subject: string, value: string, selection: index }) },
}, ['refs', 'selections']);

function obj(value: unknown): Obj {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected object');
  return value as Obj;
}
function keys(value: Obj, required: string[], optional: string[] = []) {
  if (required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => ![...required, ...optional].includes(key))) throw new Error('Invalid object keys');
}
function text(value: unknown, max = 160): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('Invalid bounded text');
  return value;
}
function list(value: unknown, max = 32, min = 0): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw new Error('Invalid bounded list');
  return value;
}
function number(value: unknown, max: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > max) throw new Error('Invalid bounded integer');
  return Number(value);
}
function finiteStrings(value: unknown, min = 0): string[] {
  const values = list(value, 32, min).map(v => text(v));
  if (new Set(values).size !== values.length) throw new Error('Duplicate finite values');
  return values;
}
function parseFields(value: unknown, count: number): Record<string, Field> {
  const fields = obj(value), names = Object.keys(fields);
  if (!names.length || names.length > 32) throw new Error('Invalid field count');
  return Object.fromEntries(names.map(name => {
    text(name, 80); const field = obj(fields[name]);
    if (field.state === 'known') { keys(field, ['state', 'selection']); return [name, { state: 'known', selection: number(field.selection, count - 1) }]; }
    if (field.state !== 'absent' && field.state !== 'unknown') throw new Error('Invalid field state');
    keys(field, ['state']); return [name, { state: field.state }];
  })) as Record<string, Field>;
}
function parseAccount(value: unknown, count: number): Account {
  const a = obj(value); keys(a, ['subject', 'property', 'values', 'day', 'evidence']);
  const d = obj(a.day); let day: Account['day'];
  if (d.kind === 'set') { keys(d, ['kind', 'values']); day = { kind: 'set', values: finiteStrings(d.values, 1) }; }
  else { if (d.kind !== 'unknown' && d.kind !== 'unrestricted') throw new Error('Invalid context kind'); keys(d, ['kind']); day = { kind: d.kind }; }
  const evidence = list(a.evidence, 32, 1).map(v => number(v, count - 1));
  if (new Set(evidence).size !== evidence.length) throw new Error('Duplicate evidence selection');
  return { subject: text(a.subject), property: text(a.property), values: a.values === null ? null : finiteStrings(a.values), day, evidence };
}
function parse(raw: unknown): MemoryCheckArgs {
  const a = obj(raw); keys(a, ['refs', 'selections'], ['chars', 'comparison', 'claims']);
  const refs = list(a.refs, 12, 1).map(value => {
    const r = obj(value); keys(r, ['id', 'revision']);
    if (typeof r.id !== 'string' || !/^[a-f0-9]{12}$/.test(r.id) || typeof r.revision !== 'string' || !/^[a-f0-9]{64}$/.test(r.revision)) throw new Error('Invalid memory ref');
    return { id: r.id, revision: r.revision };
  });
  if (new Set(refs.map(r => r.id)).size !== refs.length) throw new Error('Duplicate atom ref');
  const selections = list(a.selections, 32, 1).map(value => {
    const s = obj(value); keys(s, ['atomId', 'source', 'sourceRevision', 'start', 'end']);
    if (!refs.some(r => r.id === s.atomId)) throw new Error('Selection atom absent from refs');
    const sourceRevision = text(s.sourceRevision, 64);
    if (!/^[a-f0-9]{64}$/.test(sourceRevision)) throw new Error('Invalid source revision');
    const source = text(s.source, 256);
    if (!/^[^/\\\0]+\.md$/.test(source) || source === '..md') throw new Error('Invalid source filename');
    const start = number(s.start, 256 * 1024), end = number(s.end, 256 * 1024);
    if (start >= end || end - start > 4000) throw new Error('Invalid nonempty source span (maximum 4000 code units)');
    return { atomId: s.atomId as string, source, sourceRevision, start, end };
  });
  let comparison: Comparison | undefined;
  if (a.comparison !== undefined) {
    const c = obj(a.comparison); keys(c, ['kind', 'left', 'right']);
    if (c.kind === 'fields') comparison = { kind: 'fields', left: parseFields(c.left, selections.length), right: parseFields(c.right, selections.length) };
    else if (c.kind === 'contexts') {
      const left = parseAccount(c.left, selections.length), right = parseAccount(c.right, selections.length);
      if (left.subject !== right.subject || left.property !== right.property) throw new Error('Context comparison requires explicit equal subject and property');
      comparison = { kind: 'contexts', left, right };
    } else throw new Error('Invalid comparison kind');
  }
  const claims = a.claims === undefined ? undefined : list(a.claims).map(value => {
    const c = obj(value); keys(c, ['relation', 'subject', 'value', 'selection']);
    if (!['recording-location', 'event-location', 'participation'].includes(c.relation as string)) throw new Error('Invalid relation role');
    return { relation: c.relation as Claim['relation'], subject: text(c.subject), value: text(c.value), selection: number(c.selection, selections.length - 1) };
  });
  return { refs, selections, chars: a.chars === undefined ? 32000 : number(a.chars, 128000), comparison, claims };
}
function splitsPair(text: string, offset: number): boolean {
  return offset > 0 && offset < text.length && /[\uD800-\uDBFF]/.test(text[offset - 1]) && /[\uDC00-\uDFFF]/.test(text[offset]);
}
function comparisonResult(c: Comparison | undefined, selections: CheckedSelection[]) {
  if (!c) return undefined;
  const available = (i: number) => selections[i].status === 'source-current-exact';
  if (c.kind === 'fields') {
    const fields = [...new Set([...Object.keys(c.left), ...Object.keys(c.right)])].map(name => {
      const a = Object.hasOwn(c.left, name) ? c.left[name] : undefined;
      const b = Object.hasOwn(c.right, name) ? c.right[name] : undefined;
      let status = 'unknown';
      if (a && b && a.state !== 'unknown' && b.state !== 'unknown' &&
          (a.state !== 'known' || available(a.selection)) && (b.state !== 'known' || available(b.selection))) {
        status = a.state === b.state && (a.state !== 'known' || b.state === 'known' && selections[a.selection].quote === selections[b.selection].quote) ? 'match' : 'different';
      }
      return { name, status };
    });
    return { kind: c.kind, fields, semantic: 'UNKNOWN', guarantee: 'Exact selected-string equality and caller annotations only; free prose and absence judgments are unverified.' };
  }
  const { left: a, right: b } = c;
  let status = 'unknown';
  if ([...a.evidence, ...b.evidence].every(available) && a.day.kind !== 'unknown' && b.day.kind !== 'unknown') {
    if (a.day.kind === 'set' && b.day.kind === 'set' && !a.day.values.some(v => b.day.kind === 'set' && b.day.values.includes(v))) status = 'disjoint';
    else if (a.values !== null && b.values !== null) status = a.values.some(v => b.values!.includes(v)) ? 'compatible' : 'conflict';
  }
  return { kind: c.kind, subject: a.subject, property: a.property, status, semantic: 'UNKNOWN',
    guarantee: 'Finite day/value compatibility within caller annotations only; source entailment and comparison alignment are unverified.' };
}

/** Reuses the same eligibility/revision/path/read ceilings as expansion. */
export function memoryCheck(mind: string, raw: unknown) {
  try {
    const args = parse(raw);
    const expanded = memoryExpand(mind, args.refs, { chars: 128000, scanCap: 12 });
    if (expanded.kind !== 'expansion') return expanded;
    const selections: CheckedSelection[] = args.selections.map(s => {
      const entry = expanded.entries.find(e => e.ref.id === s.atomId);
      const base = { ...s, semantic: 'UNKNOWN' as const };
      if (!entry || entry.status !== 'available') return { ...base, status: entry?.status ?? 'over-budget' };
      const source = entry.sources.find(source => source.source === s.source);
      if (!source || source.status !== 'available' || typeof source.content !== 'string') return { ...base, status: 'source-unavailable' };
      if (source.revision !== s.sourceRevision) return { ...base, status: 'source-changed-revision' };
      if (s.end > source.content.length || splitsPair(source.content, s.start) || splitsPair(source.content, s.end)) throw new Error('Source span outside text or splits UTF-16 character');
      const quote = source.content.slice(s.start, s.end);
      if (!quote.trim()) throw new Error('Source span is blank');
      const title = source.content.slice(0, 4096).match(/^#{1,6} +([^\r\n]+)$/m)?.[1]?.trim();
      const hasTitle = !!title && title.length <= 160;
      return { ...base, status: 'source-current-exact', quote, label: hasTitle ? title : s.source, labelKind: hasTitle ? 'document-title' : 'filename' };
    });
    const result = () => ({ kind: 'check' as const, selections,
      ...(args.comparison ? { comparison: comparisonResult(args.comparison, selections) } : {}),
      ...(args.claims ? { claims: args.claims.map(claim => ({ ...claim, status: 'candidate',
        evidenceStatus: selections[claim.selection].status, semantic: 'UNKNOWN' })) } : {}),
      complete: expanded.complete && expanded.entries.every(e => e.status === 'available') && selections.every(s => s.status === 'source-current-exact'),
      guarantee: 'Current source bytes and exact copying only. Labels are document metadata, not authorship. Claims and comparisons remain annotations; no mind write or semantic approval.' });
    // Whole quotes only. Recompute comparisons after omission so unavailable evidence
    // never yields a confident comparison from material missing in the returned packet.
    while (JSON.stringify(result()).length > args.chars!) {
      const selection = [...selections].reverse().find(s => s.quote !== undefined);
      if (!selection) return { kind: 'invalid-budget' as const, reason: 'Character budget cannot fit check metadata and explicit unknown statuses' };
      delete selection.quote; selection.status = 'over-budget';
    }
    return result();
  } catch (error) { return { kind: 'invalid-input' as const, reason: (error as Error).message }; }
}
