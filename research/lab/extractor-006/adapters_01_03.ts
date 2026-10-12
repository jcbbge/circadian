import { makeView, type Record as ViewRecord, type Limits as ViewLimits } from '../../prototypes/01-views';
import { compareContexts, type Account, type Alignment, type Dimension } from '../../prototypes/02-compatibility';
import { composeReports, type Record as RelationRecord, type Query } from '../../prototypes/03-relations';
import { arr, envelope, exact, obj, oneOf, str, type Adapter, type Candidate, type Fixture } from './contract';

type Claim = { path: string; sourceId: string };
const boundedStrings = (v: unknown, cap = 8) => {
  const values = arr(v, cap).map(x => str(x, 128));
  if (new Set(values).size !== values.length) throw new Error('Duplicate values');
  return values;
};
function sourceId(value: unknown, fixture: Fixture): string {
  return oneOf(value, fixture.sources.map(s => s.id));
}
function sourceEntries(raw: unknown, fixture: Fixture) {
  const entries = arr(raw, 8).map(x => obj(x));
  const ids = entries.map(x => sourceId(x.sourceId, fixture));
  if (new Set(ids).size !== ids.length || ids.length !== fixture.sources.length || ids.some((id, i) => id !== fixture.sources[i]!.id))
    throw new Error('Supply exactly one entry per source in source order');
  return entries;
}
function evidenceFor(candidate: Candidate, claims: Claim[], unknownPaths: string[]) {
  const required = new Map(claims.map(c => [c.path, c.sourceId]));
  for (const e of candidate.evidence) {
    if (required.get(e.path) !== e.sourceId) throw new Error('Evidence path/source does not identify a populated claim');
  }
  for (const path of required.keys()) {
    if (!candidate.evidence.some(e => e.path === path)) throw new Error(`Missing field evidence: ${path}`);
  }
  if (new Set(candidate.unknown).size !== candidate.unknown.length ||
      JSON.stringify([...candidate.unknown].sort()) !== JSON.stringify([...unknownPaths].sort()))
    throw new Error('Unknown list must name exactly the unresolved field paths');
  // Presence and field binding are mechanical. Textual entailment is independently graded.
}
const envelopeInstructions = `Return only a JSON object with exactly these top-level keys:
{"data": PAYLOAD, "evidence": [{"path":"data.<field path>","sourceId":"supplied source id","quote":"exact nonempty source substring"}], "unknown":["data.<unresolved field path>"]}.
Use one evidence entry per populated claim field, or multiple entries for the same permitted path when needed. Only the evidence paths listed below are accepted; entries for any other path are rejected. Every quote must occur verbatim in the named source and genuinely support that field. No evidence is accepted for sourceId itself. Evidence cannot substitute for missing information. The unknown array must list exactly the paths whose value is null or whose dimension kind is unknown; it is empty when no such field occurs. No extra keys, authority/status fields, or invented IDs. Evidence verifies quote presence only; your interpretation remains a candidate. Return data entries in source order. Data arrays are bounded to eight entries unless a smaller limit is specified; evidence allows at most 64 entries and unknown at most 16.`;

type ViewData = { records: { sourceId: string; claim: string; qualifications: string[]; scope: string | null }[] };
const views: Adapter = {
  mechanism: '01',
  instructions: `${envelopeInstructions}
PAYLOAD is {"records":[{"sourceId":"...","claim":"concise main claim","qualifications":["condition or exception"],"scope":"caller scope id or null"}]}.
Supply exactly one record per source. Preserve source order; caller assigns rank, revision, eligibility, and coverage. Capture before any future question. Do not infer relevance to a question. Scope IDs are the keys of caller.scopes, matched to their labels in source text; null means unsupported scope. Keep all material qualifications (at most four, each at most 400 characters); claim is at most 600 characters. Evidence paths are data.records.N.claim, data.records.N.qualifications.M, and data.records.N.scope when known. An empty qualifications array makes no assertion that no exceptions exist. Do not invent disagreement resolution; this bounded calibration schema has no disagreement field.`,
  decode(raw, fixture) {
    const c = envelope(raw, fixture), data = obj(c.data); exact(data, ['records']);
    const claims: Claim[] = [], unknown: string[] = [];
    const records = sourceEntries(data.records, fixture).map((r, i) => {
      exact(r, ['sourceId', 'claim', 'qualifications', 'scope']);
      const id = sourceId(r.sourceId, fixture), p = `data.records.${i}`;
      const claim = str(r.claim, 600), qualifications = arr(r.qualifications, 4).map(x => str(x, 400));
      const scope = r.scope === null ? null : oneOf(r.scope, Object.keys(obj(fixture.caller.scopes)));
      claims.push({ path: `${p}.claim`, sourceId: id }, ...qualifications.map((_, j) => ({ path: `${p}.qualifications.${j}`, sourceId: id })));
      if (scope === null) unknown.push(`${p}.scope`); else claims.push({ path: `${p}.scope`, sourceId: id });
      return { sourceId: id, claim, qualifications, scope };
    });
    evidenceFor(c, claims, unknown);
    return { ...c, data: { records } satisfies ViewData };
  },
  operate(candidate, fixture) {
    const data = views.decode(candidate, fixture).data as ViewData;
    const states = obj(fixture.caller.states);
    const records: ViewRecord[] = data.records.map(r => {
      const source = fixture.sources.find(s => s.id === r.sourceId)!;
      return { id: source.id, revision: source.revision, claim: r.claim, qualifications: r.qualifications,
        rank: fixture.sources.indexOf(source), ...(r.scope === null ? {} : { scope: r.scope }), disagreements: [] };
    });
    const current = new Map(fixture.sources.filter(s => Object.hasOwn(states, s.id)).map(s => {
      const state = obj(states[s.id]);
      return [s.id, { revision: str(state.revision, 128), eligible: state.eligible === true, text: s.text }] as const;
    }));
    return { operation: 'makeView', result: makeView(records, current, {}, fixture.caller.limits as ViewLimits,
      { complete: fixture.caller.populationComplete === true }),
      scope: 'Budgeted view of supplied candidate records in source order. Eligibility, revisions and population coverage are caller state; semantic fidelity is not checked. No expansion is performed by this operation.' };
  },
};

type AccountData = { accounts: { sourceId: string; subject: string | null; property: string; values: string[] | null;
  context: { day: Dimension } }[] };
const compatibility: Adapter = {
  mechanism: '02',
  instructions: `${envelopeInstructions}
PAYLOAD is {"accounts":[{"sourceId":"...","subject":"caller subject id or null","property":"caller property id","values":["allowed value"],"context":{"day":{"kind":"set","values":["day"]}}}]}.
Supply exactly one account per source. This is task-aware account formulation: compare the supplied accounts using the caller-reviewed alignment, without inventing a shared context. subject comes from caller.subjects or is null when unresolved. property is caller.property. values is a nonempty subset of caller.values when supported; null means unknown, while [] is permitted ONLY when the source explicitly excludes every allowed value (a conflict, not uncertainty). day is exactly one of {"kind":"set","values":["caller day"]}, {"kind":"unknown"}, or {"kind":"unrestricted"}. A set must be nonempty; unrestricted requires explicit all-days applicability, and missing day means unknown. Evidence paths are data.accounts.N.subject when known, data.accounts.N.property, data.accounts.N.values when not null (support the whole allowed set), and data.accounts.N.context.day when not unknown. The unknown list names null subject, null values, and unknown day fields. Do not output a conclusion, reviewed alignment, source status, or assignment cap.`,
  decode(raw, fixture) {
    const c = envelope(raw, fixture), data = obj(c.data); exact(data, ['accounts']);
    const claims: Claim[] = [], unknown: string[] = [];
    const accounts = sourceEntries(data.accounts, fixture).map((a, i) => {
      exact(a, ['sourceId', 'subject', 'property', 'values', 'context']);
      const id = sourceId(a.sourceId, fixture), p = `data.accounts.${i}`;
      const subject = a.subject === null ? null : oneOf(a.subject, Object.keys(obj(fixture.caller.subjects)));
      const property = oneOf(a.property, [str(fixture.caller.property, 128)]);
      const values = a.values === null ? null : boundedStrings(a.values).map(v => oneOf(v, boundedStrings(fixture.caller.values)));
      const context = obj(a.context); exact(context, ['day']);
      const d = obj(context.day), kind = oneOf(d.kind, ['set', 'unknown', 'unrestricted'] as const);
      let day: Dimension;
      if (kind === 'set') {
        exact(d, ['kind', 'values']);
        const days = boundedStrings(d.values).map(v => oneOf(v, boundedStrings(fixture.caller.days)));
        if (!days.length) throw new Error('An empty context set is not unknown');
        day = { kind, values: days };
      } else { exact(d, ['kind']); day = { kind }; }
      claims.push({ path: `${p}.property`, sourceId: id });
      for (const [field, missing] of [['subject', subject === null], ['values', values === null], ['context.day', kind === 'unknown']] as const) {
        if (missing) unknown.push(`${p}.${field}`); else claims.push({ path: `${p}.${field}`, sourceId: id });
      }
      return { sourceId: id, subject, property, values, context: { day } };
    });
    evidenceFor(c, claims, unknown);
    return { ...c, data: { accounts } satisfies AccountData };
  },
  operate(candidate, fixture) {
    const data = compatibility.decode(candidate, fixture).data as AccountData;
    // Account.values cannot express unknown. Keep that account missing from the join,
    // which yields an explicit unknown result instead of an invented empty domain.
    const unresolvedValues = data.accounts.filter(a => a.values === null).map(a => a.sourceId);
    const records: Account[] = data.accounts.filter(a => a.values !== null).map(a => ({ id: a.sourceId,
      source: { id: a.sourceId, revision: fixture.sources.find(s => s.id === a.sourceId)!.revision },
      subject: a.subject, property: a.property, values: a.values!, context: [{ name: 'day', dimension: a.context.day }] }));
    const supplied = obj(fixture.caller.states);
    const states = new Map(Object.entries(supplied).map(([id, value]) => {
      const state = obj(value); return [id, { revision: str(state.revision, 128), eligible: state.eligible === true }] as const;
    }));
    return { operation: 'compareContexts', result: { reports: compareContexts(records, fixture.caller.alignment as Alignment[], states, 8), unresolvedValues },
      scope: 'Reviewed caller alignment, one finite day dimension and declared values only. Unknown values omit the account and force an unresolved join. A compatible witness would establish existence within the annotations, not source truth.' };
  },
};

type RelationData = { reports: { sourceId: string; statement: string; speaker: string | null; subjects: string[] | null;
  recordingLocation: string | null; occasionSetting: string | null }[] };
const relations: Adapter = {
  mechanism: '03',
  instructions: `${envelopeInstructions}
PAYLOAD is {"reports":[{"sourceId":"...","statement":"reported assertion","speaker":"person id or null","subjects":["person id"],"recordingLocation":"place id or null","occasionSetting":"place id or null"}]}.
Capture exactly one report per source, before any future question. caller.people and caller.places provide reviewed ID vocabulary, not an answer. speaker is the person who made the assertion; subjects are the people it is about. Never infer a speaker from a mentioned person's name. subjects=null means unresolved reference; subjects=[] means an explicitly impersonal assertion (require evidence for that empty set). The place where a note was recorded is recordingLocation. The setting of the event it describes is occasionSetting; one does not establish the other. Unknown scalar fields are null, never false or empty string. statement is at most 600 characters. Evidence paths are data.reports.N.statement, data.reports.N.speaker when known, data.reports.N.subjects.M for each known person (or data.reports.N.subjects for an empty set), and data.reports.N.recordingLocation / occasionSetting when known. No model field can mark identity reviewed or create a source revision.`,
  decode(raw, fixture) {
    const c = envelope(raw, fixture), data = obj(c.data); exact(data, ['reports']);
    const people = Object.keys(obj(fixture.caller.people)), places = Object.keys(obj(fixture.caller.places));
    const claims: Claim[] = [], unknown: string[] = [];
    const reports = sourceEntries(data.reports, fixture).map((r, i) => {
      exact(r, ['sourceId', 'statement', 'speaker', 'subjects', 'recordingLocation', 'occasionSetting']);
      const id = sourceId(r.sourceId, fixture), p = `data.reports.${i}`;
      const statement = str(r.statement, 600);
      const speaker = r.speaker === null ? null : oneOf(r.speaker, people);
      const subjects = r.subjects === null ? null : boundedStrings(r.subjects, 4).map(v => oneOf(v, people));
      const recordingLocation = r.recordingLocation === null ? null : oneOf(r.recordingLocation, places);
      const occasionSetting = r.occasionSetting === null ? null : oneOf(r.occasionSetting, places);
      claims.push({ path: `${p}.statement`, sourceId: id });
      for (const [field, value] of [['speaker', speaker], ['recordingLocation', recordingLocation], ['occasionSetting', occasionSetting]] as const) {
        if (value === null) unknown.push(`${p}.${field}`); else claims.push({ path: `${p}.${field}`, sourceId: id });
      }
      if (subjects === null) unknown.push(`${p}.subjects`);
      else if (!subjects.length) claims.push({ path: `${p}.subjects`, sourceId: id });
      else subjects.forEach((_, j) => claims.push({ path: `${p}.subjects.${j}`, sourceId: id }));
      return { sourceId: id, statement, speaker, subjects, recordingLocation, occasionSetting };
    });
    evidenceFor(c, claims, unknown);
    return { ...c, data: { reports } satisfies RelationData };
  },
  operate(candidate, fixture) {
    const data = relations.decode(candidate, fixture).data as RelationData;
    const people = obj(fixture.caller.people), places = obj(fixture.caller.places);
    const ref = (id: string) => ({ id, revision: fixture.sources.find(s => s.id === id)!.revision });
    const supporting = (id: string) => data.reports.filter(r => r.speaker === id || r.subjects?.includes(id) ||
      r.recordingLocation === id || r.occasionSetting === id).map(r => ref(r.sourceId));
    const records: RelationRecord[] = [
      ...Object.entries(people).map(([id, person]) => ({ id, kind: 'person' as const,
        identity: obj(person).identity === 'reviewed' ? 'reviewed' as const : 'unresolved' as const, sources: supporting(id) })),
      ...Object.keys(places).map(id => ({ id, kind: 'place' as const, sources: supporting(id) })),
    ];
    for (const r of data.reports) {
      const sources = [ref(r.sourceId)], episode = `episode:${r.sourceId}`, occasion = `occasion:${r.sourceId}`, report = `report:${r.sourceId}`;
      records.push({ id: episode, kind: 'episode', recordingLocation: r.recordingLocation, sources },
        { id: occasion, kind: 'occasion', setting: r.occasionSetting, sources },
        { id: report, kind: 'report', statement: r.statement, episode, occasion, subjects: r.subjects, sources },
        { id: `attribution:${r.sourceId}`, kind: 'attribution', report, speaker: r.speaker, sources });
    }
    const states = Object.fromEntries(Object.entries(obj(fixture.caller.states)).map(([id, v]) => {
      const s = obj(v); return [id, { available: s.available === true, eligible: s.eligible === true, revision: str(s.revision, 128) }];
    }));
    const queries: Query[] = [
      ...data.reports.map(r => ({ select: 'speakers' as const, report: `report:${r.sourceId}` })),
      ...Object.keys(people).flatMap(person => [
        { select: 'by' as const, person, project: 'report' as const },
        { select: 'about' as const, person, project: 'report' as const },
        { select: 'about' as const, person, project: 'occasionSetting' as const },
      ]),
    ];
    return { operation: 'composeReports', result: queries.map(query => ({ query, composition: composeReports(records, query, states) })),
      scope: 'Fixed question-blind attribution/by/about/occasion-setting projections. Identity review comes only from caller state. recordingLocation remains an episode field and is never substituted for occasionSetting. Prototype semantics are notChecked.' };
  },
};

export const adapters: Adapter[] = [views, compatibility, relations];
const evidence = (sourceId: string, quote: string, paths: string[]) => paths.map(path => ({ path, sourceId, quote }));
const seedText = 'The seed library lends trays for seven days. Members may renew once only if nobody is waiting.';
const gardenText = 'The courtyard garden opens after sunrise. Access is suspended while the grounds are icy.';
const tuesdayText = 'On Tuesday the community darkroom must be dark for developing prints.';
const wednesdayText = 'On Wednesday the community darkroom must be bright for cleaning.';
const clearText = 'At the riverside shelter, Nia said, "Omar prefers the shorter walking route." The note was later recorded at the town archive.';
const unknownText = 'An unsigned note recorded at the ferry office says, "They preferred the covered route." Neither the speaker nor the people meant by "they" are identified. The place of the described outing is not recorded.';
const live = (ids: string[]) => Object.fromEntries(ids.map(id => [id, { revision: 'r1', available: true, eligible: true }]));

export const fixtures: Fixture[] = [
  {
    id: 'cal-01-qualified-view', mechanism: '01',
    sources: [{ id: 'seed-note', revision: 'r1', text: seedText }, { id: 'garden-note', revision: 'r1', text: gardenText }],
    caller: { scopes: { 'seed-library': 'seed library', 'courtyard-garden': 'courtyard garden' },
      states: live(['seed-note', 'garden-note']), populationComplete: true,
      limits: { chars: 850, maxRecords: 1, scanCap: 8, maxRecordChars: 1800 } },
    question: 'Can members always renew a borrowed seed tray? What limits apply?',
    gold: { data: { records: [
      { sourceId: 'seed-note', claim: 'The seed library lends trays for seven days.', qualifications: ['Members may renew once only if nobody is waiting.'], scope: 'seed-library' },
      { sourceId: 'garden-note', claim: 'The courtyard garden opens after sunrise.', qualifications: ['Access is suspended while the grounds are icy.'], scope: 'courtyard-garden' },
    ] }, evidence: [
      ...evidence('seed-note', seedText, ['data.records.0.claim', 'data.records.0.qualifications.0', 'data.records.0.scope']),
      ...evidence('garden-note', gardenText, ['data.records.1.claim', 'data.records.1.qualifications.0', 'data.records.1.scope']),
    ], unknown: [] },
    checks: [{ path: 'data.records.0.scope', value: 'seed-library', critical: false }, { path: 'data.records.1.scope', value: 'courtyard-garden', critical: false }],
    rubric: { required: ['Renewal is permitted once only if nobody is waiting.'],
      forbidden: ['Unconditional renewal.', 'Claim that the entire memory or every supplied record appears in the view.'], acceptableUnknown: ['No claim about policies or records outside the supplied population.'] },
    note: 'Question-blind capture. Both readers answer the same renewal question. Coverage/omission is checked in deterministic tests, not required of the prose reader, which has no bounded-view operation. Does not test relevance ranking or expansion benefit.',
  },
  {
    id: 'cal-02-disjoint-contexts', mechanism: '02',
    sources: [{ id: 'darkroom-tue', revision: 'r1', text: tuesdayText }, { id: 'darkroom-wed', revision: 'r1', text: wednesdayText }],
    caller: { subjects: { darkroom: 'community darkroom' }, property: 'lighting', values: ['dark', 'bright'], days: ['Tuesday', 'Wednesday'],
      states: live(['darkroom-tue', 'darkroom-wed']), alignment: [{ id: 'lighting-comparison', recordIds: ['darkroom-tue', 'darkroom-wed'], subject: 'darkroom', property: 'lighting', dimensions: ['day'] }] },
    task: 'Task-aware formulation: extract each account of the community darkroom lighting and its day of applicability for the supplied reviewed comparison.',
    question: 'Do these two lighting requirements contradict each other in a shared context?',
    gold: { data: { accounts: [
      { sourceId: 'darkroom-tue', subject: 'darkroom', property: 'lighting', values: ['dark'], context: { day: { kind: 'set', values: ['Tuesday'] } } },
      { sourceId: 'darkroom-wed', subject: 'darkroom', property: 'lighting', values: ['bright'], context: { day: { kind: 'set', values: ['Wednesday'] } } },
    ] }, evidence: [
      ...evidence('darkroom-tue', tuesdayText, ['data.accounts.0.subject', 'data.accounts.0.property', 'data.accounts.0.values', 'data.accounts.0.context.day']),
      ...evidence('darkroom-wed', wednesdayText, ['data.accounts.1.subject', 'data.accounts.1.property', 'data.accounts.1.values', 'data.accounts.1.context.day']),
    ], unknown: [] },
    checks: [{ path: 'data.accounts.0.values', value: ['dark'], critical: true }, { path: 'data.accounts.1.values', value: ['bright'], critical: true },
      { path: 'data.accounts.0.context.day', value: { kind: 'set', values: ['Tuesday'] }, critical: true },
      { path: 'data.accounts.1.context.day', value: { kind: 'set', values: ['Wednesday'] }, critical: true }],
    rubric: { required: ['The requirements apply on different days and the declared contexts are separate.'],
      forbidden: ['A conflict in a shared context.', 'A claim that both lighting requirements apply simultaneously.', 'A guarantee about unmentioned days.'], acceptableUnknown: ['No lighting requirement is established for other days.'] },
    note: 'Task-aware account extraction with explicitly caller-reviewed identity/property/alignment. Does not test autonomous semantic alignment or general finite constraint formulation.',
  },
  {
    id: 'cal-03-speaker-subject', mechanism: '03', sources: [{ id: 'walking-note', revision: 'r1', text: clearText }],
    caller: { people: { nia: { label: 'Nia', identity: 'reviewed' }, omar: { label: 'Omar', identity: 'reviewed' } },
      places: { shelter: 'riverside shelter', archive: 'town archive' }, states: live(['walking-note']) },
    question: 'Who made the statement about Omar, and where did the described conversation take place?',
    gold: { data: { reports: [{ sourceId: 'walking-note', statement: 'Omar prefers the shorter walking route.', speaker: 'nia', subjects: ['omar'], recordingLocation: 'archive', occasionSetting: 'shelter' }] },
      evidence: evidence('walking-note', clearText, ['data.reports.0.statement', 'data.reports.0.speaker', 'data.reports.0.subjects.0', 'data.reports.0.recordingLocation', 'data.reports.0.occasionSetting']), unknown: [] },
    checks: [{ path: 'data.reports.0.speaker', value: 'nia', critical: true }, { path: 'data.reports.0.subjects', value: ['omar'], critical: true },
      { path: 'data.reports.0.recordingLocation', value: 'archive', critical: true }, { path: 'data.reports.0.occasionSetting', value: 'shelter', critical: true }],
    rubric: { required: ['Nia made the statement about Omar.', 'The conversation took place at the riverside shelter.'],
      forbidden: ['Omar made the statement.', 'The conversation took place at the archive.'], acceptableUnknown: ['No claim about whether Omar was present.'] },
    note: 'Question-blind capture; caller supplies reviewed vocabulary. Speaker, subject, event location and recording location are separate candidate claims.',
  },
  {
    id: 'cal-03-unknown-attribution', mechanism: '03', sources: [{ id: 'unsigned-note', revision: 'r1', text: unknownText }],
    caller: { people: {}, places: { 'ferry-office': 'ferry office' }, states: live(['unsigned-note']) },
    question: 'Who expressed the preference, and where did the outing happen?',
    gold: { data: { reports: [{ sourceId: 'unsigned-note', statement: 'They preferred the covered route.', speaker: null, subjects: null, recordingLocation: 'ferry-office', occasionSetting: null }] },
      evidence: evidence('unsigned-note', unknownText, ['data.reports.0.statement', 'data.reports.0.recordingLocation']),
      unknown: ['data.reports.0.speaker', 'data.reports.0.subjects', 'data.reports.0.occasionSetting'] },
    checks: [{ path: 'data.reports.0.speaker', value: null, critical: true }, { path: 'data.reports.0.subjects', value: null, critical: true },
      { path: 'data.reports.0.recordingLocation', value: 'ferry-office', critical: true }, { path: 'data.reports.0.occasionSetting', value: null, critical: true }],
    rubric: { required: ['The speaker and the outing location are unknown from this source.'],
      forbidden: ['The outing happened at the ferry office.', 'Nobody expressed the preference.', 'No people were the subject of the statement.'],
      acceptableUnknown: ['Unidentified speaker and subjects; unrecorded outing location.'] },
    note: 'Question-blind capture. Explicit unknowns must remain null, not empty subject sets, absence, or recording-location substitution.',
  },
];
