import { adapters as legacy } from '../extractor-006/adapters_01_03';
import { arr, exact, obj, str, type Evidence, type Fixture } from '../extractor-006/contract';
import { candidate, support, type DraftAdapter } from './contract';

type Schema = Record<string, unknown>;
const object = (properties: Record<string, Schema>): Schema => ({ type: 'object', properties,
  required: Object.keys(properties), additionalProperties: false });
const text = (maxLength: number): Schema => ({ type: 'string', minLength: 1, maxLength });
const nullable = (schema: Schema): Schema => ({ anyOf: [schema, { type: 'null' }] });
const choice = (values: string[], allowNull = false): Schema => {
  if (!values.length) {
    if (allowNull) return { type: 'null' };
    throw new Error('A nonnullable enum needs supplied values');
  }
  const schema = { type: 'string', enum: values };
  return allowNull ? nullable(schema) : schema;
};
const list = (items: Schema, maxItems: number, minItems = 0): Schema => ({ type: 'array', items, minItems, maxItems });
const perSource = (fixture: Fixture, items: Schema) => list(items, fixture.sources.length, fixture.sources.length);
const finish = (mechanism: DraftAdapter['mechanism'], data: unknown, evidence: Evidence[], unknown: string[], f: Fixture) =>
  legacy.find(a => a.mechanism === mechanism)!.decode(candidate(data, evidence, unknown), f);
function entries(raw: unknown, key: string, names: string[], f: Fixture) {
  const root = obj(raw); exact(root, [key]);
  const values = arr(root[key], 8).map(v => { const entry = obj(v); exact(entry, names); return entry; });
  if (values.length !== f.sources.length) throw new Error('Expected one semantic entry per source in source order');
  return values;
}
const formatRule = 'Return only the JSON object described by the supplied schema, with one entry per source in source order. The output contains semantic fields only; input provenance is attached afterward and does not certify semantic support. Do not add identifiers for sources, evidence, revision/status fields, or an extra envelope.';

const views: DraftAdapter = {
  mechanism: '01',
  semanticInstructions: 'For each source, preserve its main claim, all material qualifications and the known domain of applicability. Keep limits and exceptions attached to the claim. Capture without anticipating a future question or choosing relevance to one. Missing scope remains unknown; omitting a qualification does not establish that no exception exists. The supplied domain vocabulary describes possible scopes, not which claim belongs to which scope.',
  format(f) {
    return { schema: object({ records: perSource(f, object({ claim: text(600),
      qualifications: list(text(400), 4), scope: choice(Object.keys(obj(f.caller.scopes)), true) })) }),
      instructions: `${formatRule} Use records with claim, qualifications, and scope. scope is a supplied scope identifier or null when unsupported. qualifications is an array of preserved conditions; an empty array must not be read as a guarantee that no other exceptions exist.` };
  },
  bind(raw, f) {
    const evidence: Evidence[] = [], unknown: string[] = [];
    const records = entries(raw, 'records', ['claim', 'qualifications', 'scope'], f).map((r, i) => {
      const claim = str(r.claim, 600), qualifications = arr(r.qualifications, 4).map(v => str(v, 400));
      const path = `data.records.${i}`;
      evidence.push(support(f, `${path}.claim`, i));
      qualifications.forEach((_, j) => evidence.push(support(f, `${path}.qualifications.${j}`, i)));
      if (r.scope === null) unknown.push(`${path}.scope`); else evidence.push(support(f, `${path}.scope`, i));
      return { sourceId: f.sources[i]!.id, claim, qualifications, scope: r.scope };
    });
    return finish('01', { records }, evidence, unknown, f);
  },
  operate: legacy.find(a => a.mechanism === '01')!.operate,
};

const compatibility: DraftAdapter = {
  mechanism: '02',
  semanticInstructions: 'For each source, identify the account’s subject, the permitted values of the supplied comparison property, and the days on which the account applies. This is task-aware account formulation. Keep each account’s circumstances separate; do not invent a common context or conclusion. Unknown permitted values differ from a statement that every allowed value is excluded. Missing day information is unknown, not permission to apply on every day. Only an explicit all-days statement establishes unrestricted applicability. Subject identity and comparison alignment are supplied experimental boundaries, not discoveries certified by extraction.',
  format(f) {
    const values: Schema = nullable({ ...list(choice(arr(f.caller.values, 8).map(v => str(v, 128))), 8), uniqueItems: true });
    const days = { ...list(choice(arr(f.caller.days, 8).map(v => str(v, 128))), 8, 1), uniqueItems: true };
    return { schema: object({ accounts: perSource(f, object({
      subject: choice(Object.keys(obj(f.caller.subjects)), true), values,
      context: object({ day: { anyOf: [object({ kind: { const: 'set' }, values: days }),
        object({ kind: { const: 'unknown' } }), object({ kind: { const: 'unrestricted' } })] } }),
    })) }), instructions: `${formatRule} Use accounts with subject, values, and context.day. The property is caller-supplied and must not be repeated. subject is a supplied subject identifier or null. values=null means unresolved; values=[] is a positive claim that no allowed value is permitted, never a substitute for missing information. context.day is {"kind":"set","values":[...]} for supported days, {"kind":"unknown"} when unresolved, or {"kind":"unrestricted"} only for explicit all-days applicability. A set must contain at least one day.` };
  },
  bind(raw, f) {
    const evidence: Evidence[] = [], unknown: string[] = [];
    const accounts = entries(raw, 'accounts', ['subject', 'values', 'context'], f).map((a, i) => {
      const context = obj(a.context); exact(context, ['day']);
      const day = obj(context.day), path = `data.accounts.${i}`;
      // These full-source references identify input provenance only. Neither property
      // wording nor any model-authored value is asserted to be literally quoted.
      evidence.push(support(f, `${path}.property`, i));
      for (const [field, missing] of [['subject', a.subject === null], ['values', a.values === null], ['context.day', day.kind === 'unknown']] as const) {
        if (missing) unknown.push(`${path}.${field}`); else evidence.push(support(f, `${path}.${field}`, i));
      }
      return { sourceId: f.sources[i]!.id, subject: a.subject, property: str(f.caller.property, 128), values: a.values, context: { day } };
    });
    return finish('02', { accounts }, evidence, unknown, f);
  },
  operate: legacy.find(a => a.mechanism === '02')!.operate,
};

const relations: DraftAdapter = {
  mechanism: '03',
  semanticInstructions: 'For each source, preserve the reported assertion, who made it, whom it describes, where the note was recorded, and where the described event occurred. Capture before seeing a future question. A person mentioned in an assertion is not automatically its speaker. An unresolved pronoun leaves the people described unknown; it does not establish that the statement concerns nobody. Only a positively impersonal assertion has no people as its subject. The note’s recording location does not establish the event’s location. Preserve unknown speaker, people and places separately. Supplied identity vocabulary does not resolve an ambiguous reference by itself.',
  format(f) {
    const people = Object.keys(obj(f.caller.people)), places = Object.keys(obj(f.caller.places));
    return { schema: object({ reports: perSource(f, object({ statement: text(600), speaker: choice(people, true),
      subjects: nullable({ ...list(people.length ? choice(people) : { type: 'string' }, people.length ? 4 : 0), uniqueItems: true }),
      recordingLocation: choice(places, true), occasionSetting: choice(places, true),
    })) }), instructions: `${formatRule} Use reports with statement, speaker, subjects, recordingLocation, and occasionSetting. Use supplied person/place identifiers for known references. Unknown scalar references are null, not false or empty strings. subjects=null means unresolved people; subjects=[] means a positively impersonal assertion. Do not infer an event location from where a record was written. Do not emit sourceId or identity-review status.` };
  },
  bind(raw, f) {
    const evidence: Evidence[] = [], unknown: string[] = [];
    const reports = entries(raw, 'reports', ['statement', 'speaker', 'subjects', 'recordingLocation', 'occasionSetting'], f).map((r, i) => {
      const statement = str(r.statement, 600), subjects = r.subjects === null ? null : arr(r.subjects, 4);
      const path = `data.reports.${i}`;
      evidence.push(support(f, `${path}.statement`, i));
      for (const field of ['speaker', 'recordingLocation', 'occasionSetting']) {
        if (r[field] === null) unknown.push(`${path}.${field}`); else evidence.push(support(f, `${path}.${field}`, i));
      }
      if (subjects === null) unknown.push(`${path}.subjects`);
      else if (!subjects.length) evidence.push(support(f, `${path}.subjects`, i));
      else subjects.forEach((_, j) => evidence.push(support(f, `${path}.subjects.${j}`, i)));
      return { sourceId: f.sources[i]!.id, statement, speaker: r.speaker, subjects,
        recordingLocation: r.recordingLocation, occasionSetting: r.occasionSetting };
    });
    return finish('03', { reports }, evidence, unknown, f);
  },
  operate: legacy.find(a => a.mechanism === '03')!.operate,
};

export const adapters: DraftAdapter[] = [views, compatibility, relations];
