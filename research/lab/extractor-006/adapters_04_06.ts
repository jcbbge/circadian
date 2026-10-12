import { arr, envelope, exact, obj, oneOf, str, type Adapter, type Candidate, type Fixture } from './contract';
import { instantiate, type Aid, type Slots, type SourceState as PlanningState } from '../../prototypes/04-operations';
import { recallOccasion, jointOccasions, type Population, type Sources } from '../../prototypes/05-experiences';
import { checkPresentation, CHECKER_VERSION, FIELD_NAMES, RULE, type Fields } from '../../prototypes/06-transformations';

// Candidate meaning remains unreviewed. Exact quotes establish presence only.
function source(f: Fixture, id: unknown) {
  const value = str(id, 128), found = f.sources.find(s => s.id === value);
  if (!found) throw new Error('Source outside supplied bundle');
  return found;
}
function vocabulary(v: unknown, choices: unknown): string {
  return oneOf(v, arr(choices, 16).map(x => str(x, 128)));
}
function booleanOrUnknown(v: unknown): boolean | null {
  if (v !== null && typeof v !== 'boolean') throw new Error('Expected boolean or null');
  return v as boolean | null;
}
function finite(v: unknown, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Error('Invalid bounded number');
  return v;
}
function unique(xs: string[]) {
  if (new Set(xs).size !== xs.length) throw new Error('Duplicate identity');
}
function support(c: Candidate, path: string, sourceId?: string) {
  if (!c.evidence.some(e => e.path === path && (!sourceId || e.sourceId === sourceId))) throw new Error(`Missing evidence for ${path}`);
}
function evidencePaths(c: Candidate, allowed: Set<string>) {
  if (c.evidence.some(e => !allowed.has(e.path))) throw new Error('Evidence path is not a supported claim');
}
function quote(path: string, sourceId: string, text: string) { return { path, sourceId, quote: text }; }

type PlanData = {
  preferences: { participant: string; quiet: boolean | null; seating: boolean | null; sourceId: string }[];
  availability: { participant: string; windows: [number, number][] | null; sourceId: string }[];
  places: { place: string; quiet: boolean | null; seating: boolean | null; open: boolean | null; sourceId: string }[];
  minutes: { value: number; sourceId: string } | null;
};
const planning: Adapter = {
  mechanism: '04',
  instructions: `Extract slots for the caller's one fixed shared-afternoon recipe. This is task-aware bounded planning, not executable recipe generation.
Return exactly {"data":{"preferences":[{"participant":"caller person ID","quiet":true,"seating":true,"sourceId":"source ID"}],"availability":[{"participant":"caller person ID","windows":[[780,840]],"sourceId":"source ID"}],"places":[{"place":"caller place ID","quiet":true,"seating":true,"open":true,"sourceId":"source ID"}],"minutes":{"value":20,"sourceId":"source ID"}},"evidence":[{"path":"preferences.0.quiet","sourceId":"source ID","quote":"exact supporting text"}],"unknown":["unresolved item"]}.
quiet/seating preferences mean a requirement, not an observation. A missing preference is null, never false. Either null preference prevents that participant's preference slot from being supplied to the operation. Place observations permit true, false, or null for unknown. Availability windows are minutes after midnight on the supplied single day; null means unknown, [] means explicitly no availability. minutes is null if duration is unknown. Every array may be empty; maximum eight records or windows per array. Use only caller IDs. List preferences and availability in caller.participants order and places in caller.places order. Caller owns occasion, recipe, time, applicability, retirement, revisions and source eligibility; do not emit them.
For each non-null preference quiet/seating, availability windows (including an explicit empty list), place quiet/seating/open, and minutes.value, provide an evidence entry with that exact dot path and the record's sourceId. Include name/context in quotes to support association. Evidence entries for any other path are rejected, including participant/place/sourceId paths. No quote is required for null. Evidence presence does not establish entailment. Record unresolved facts in unknown. No additional keys.`,
  decode(raw, f) {
    const c = envelope(raw, f), d = obj(c.data); exact(d, ['preferences', 'availability', 'places', 'minutes']);
    const allowed = new Set<string>();
    const preferences = arr(d.preferences, 8).map((v, i) => {
      const x = obj(v); exact(x, ['participant', 'quiet', 'seating', 'sourceId']);
      const participant = vocabulary(x.participant, f.caller.participants), sourceId = source(f, x.sourceId).id;
      const quiet = booleanOrUnknown(x.quiet), seating = booleanOrUnknown(x.seating);
      for (const [key, value] of [['quiet', quiet], ['seating', seating]] as const) {
        const path = `preferences.${i}.${key}`; allowed.add(path); if (value !== null) support(c, path, sourceId);
      }
      return { participant, quiet, seating, sourceId };
    });
    const availability = arr(d.availability, 8).map((v, i) => {
      const x = obj(v); exact(x, ['participant', 'windows', 'sourceId']);
      const participant = vocabulary(x.participant, f.caller.participants), sourceId = source(f, x.sourceId).id;
      const windows = x.windows === null ? null : arr(x.windows, 8).map(w => {
        const xs = arr(w, 2); if (xs.length !== 2) throw new Error('Expected interval pair');
        const start = finite(xs[0], 0, 1440), end = finite(xs[1], 0, 1440);
        if (start >= end) throw new Error('Invalid interval order'); return [start, end] as [number, number];
      });
      const path = `availability.${i}.windows`; allowed.add(path); if (windows !== null) support(c, path, sourceId);
      return { participant, windows, sourceId };
    });
    const places = arr(d.places, 8).map((v, i) => {
      const x = obj(v); exact(x, ['place', 'quiet', 'seating', 'open', 'sourceId']);
      const place = vocabulary(x.place, f.caller.places), sourceId = source(f, x.sourceId).id;
      const quiet = booleanOrUnknown(x.quiet), seating = booleanOrUnknown(x.seating), open = booleanOrUnknown(x.open);
      for (const [key, value] of [['quiet', quiet], ['seating', seating], ['open', open]] as const) {
        const path = `places.${i}.${key}`; allowed.add(path); if (value !== null) support(c, path, sourceId);
      }
      return { place, quiet, seating, open, sourceId };
    });
    let minutes: PlanData['minutes'] = null;
    if (d.minutes !== null) {
      const x = obj(d.minutes); exact(x, ['value', 'sourceId']);
      minutes = { value: finite(x.value, 1, 1440), sourceId: source(f, x.sourceId).id };
      allowed.add('minutes.value'); support(c, 'minutes.value', minutes.sourceId);
    }
    unique(preferences.map(p => p.participant)); unique(availability.map(a => a.participant)); unique(places.map(p => p.place));
    evidencePaths(c, allowed);
    return { ...c, data: { preferences, availability, places, minutes } satisfies PlanData };
  },
  operate(candidate, f) {
    const c = this.decode(candidate, f), d = c.data as PlanData;
    const occasion = str(f.caller.occasion, 128), participants = arr(f.caller.participants, 8).map(x => str(x, 128));
    const ref = (id: string) => ({ id, revision: source(f, id).revision });
    const supplied: Partial<Slots> = {
      preferences: d.preferences.filter(p => p.quiet !== null && p.seating !== null).map(p => ({ participant: p.participant, occasion, quiet: p.quiet!, seating: p.seating!, source: ref(p.sourceId) })),
      availability: d.availability.filter(a => a.windows !== null).map(a => ({ participant: a.participant, occasion, windows: a.windows!, source: ref(a.sourceId) })),
      // An empty candidate place list means no extracted observations, not proven no possible places.
      ...(d.places.length ? { places: d.places.map(p => ({ id: p.place, quiet: p.quiet, seating: p.seating, open: p.open, source: ref(p.sourceId) })) } : {}),
      ...(d.minutes ? { intention: { minutes: d.minutes.value, source: ref(d.minutes.sourceId) } } : {}),
    };
    const aid: Aid = { recipe: 'shared-afternoon', participants, occasion, bindings: {}, ...(f.caller.retired === true ? { retired: { reason: 'noLongerUseful' as const } } : {}) };
    const result = instantiate(aid, supplied, obj(f.caller.sourceStates) as Record<string, PlanningState>, finite(f.caller.asOf, 0, 1440), oneOf(f.caller.applicability, ['applies', 'doesNotApply', 'unknown'] as const));
    return { operation: 'instantiate(shared-afternoon)', result: { computation: result, inputs: supplied, extractionEvidence: c.evidence }, scope: 'One fixed planning recipe, conditional on candidate slots and caller state. No semantic verification or positive explanation trace; reasons may be empty.' };
  },
};

type ExperienceData = { narrative: string | null; participants: { person: string; role: string }[]; mentioned: string[]; coPresence: string[][]; interpretations: { sourceId: string; author: string; account: string }[] };
const experiences: Adapter = {
  mechanism: '05',
  instructions: `Capture this supplied occasion and attributed interpretations before seeing any future recall question. Return exactly {"data":{"narrative":"concise source-grounded narrative or null","participants":[{"person":"caller person ID","role":"supported role"}],"mentioned":["caller person ID"],"coPresence":[["caller person ID","caller person ID"]],"interpretations":[{"sourceId":"account source ID","author":"caller person ID","account":"source-grounded interpretation"}]},"evidence":[{"path":"participants.0","sourceId":"event source ID","quote":"exact supporting text"}],"unknown":["unresolved item"]}.
narrative may be null. Include only evidenced participants; being mentioned, designing an object, or authoring a later reflection does not establish attendance. Omission is unknown, never evidence of absence. mentioned holds people mentioned without evidenced participation. coPresence needs explicit simultaneous-presence evidence and at least two already listed participants. Do not infer simultaneity merely from shared event identity. Include at most eight entries per array. Order participant/mention lists by caller.people and interpretations by supplied source order. Interpretations are attributed accounts, not asserted event facts. Use caller person IDs; stable occasion/account IDs, source revisions/eligibility and entry policy are caller-owned. Do not emit reviewed, entry, attendance, occasion IDs, revisions or eligibility.
Provide exact evidence paths narrative (if non-null), participants.i, mentioned.i, coPresence.i and interpretations.i. Evidence entries for any other path are rejected. Event facts must quote caller.eventSourceId; each interpretation must quote its own sourceId. Include names/context in supporting quotes. Record important unresolved facts in unknown. No additional keys.`,
  decode(raw, f) {
    const c = envelope(raw, f), d = obj(c.data); exact(d, ['narrative', 'participants', 'mentioned', 'coPresence', 'interpretations']);
    const allowed = new Set<string>(), event = source(f, f.caller.eventSourceId).id;
    const narrative = d.narrative === null ? null : str(d.narrative, 600);
    if (narrative !== null) { allowed.add('narrative'); support(c, 'narrative', event); }
    const participants = arr(d.participants, 8).map((v, i) => {
      const x = obj(v); exact(x, ['person', 'role']);
      const path = `participants.${i}`; allowed.add(path); support(c, path, event);
      return { person: vocabulary(x.person, f.caller.people), role: str(x.role, 120) };
    }); unique(participants.map(p => p.person));
    const mentioned = arr(d.mentioned, 8).map((v, i) => {
      const path = `mentioned.${i}`; allowed.add(path); support(c, path, event); return vocabulary(v, f.caller.people);
    }); unique(mentioned);
    if (mentioned.some(p => participants.some(a => a.person === p))) throw new Error('Mention-only and participant sets overlap');
    const coPresence = arr(d.coPresence, 8).map((v, i) => {
      const xs = arr(v, 8).map(x => vocabulary(x, participants.map(p => p.person))); unique(xs);
      if (xs.length < 2) throw new Error('Co-presence requires two participants');
      const path = `coPresence.${i}`; allowed.add(path); support(c, path, event); return xs;
    });
    const interpretations = arr(d.interpretations, 8).map((v, i) => {
      const x = obj(v); exact(x, ['sourceId', 'author', 'account']);
      const sourceId = source(f, x.sourceId).id;
      if (!Object.hasOwn(obj(f.caller.interpretationIds), sourceId)) throw new Error('Account source outside reviewed occasion boundary');
      const path = `interpretations.${i}`; allowed.add(path); support(c, path, sourceId);
      return { sourceId, author: vocabulary(x.author, f.caller.people), account: str(x.account, 600) };
    }); unique(interpretations.map(x => x.sourceId)); evidencePaths(c, allowed);
    return { ...c, data: { narrative, participants, mentioned, coPresence, interpretations } satisfies ExperienceData };
  },
  operate(candidate, f) {
    const c = this.decode(candidate, f), d = c.data as ExperienceData;
    const event = source(f, f.caller.eventSourceId), occasionId = str(f.caller.occasionId, 128);
    const ids = obj(f.caller.interpretationIds);
    oneOf(f.caller.entryPolicy, ['all-supplied-account-records']);
    const records: Population = {
      occasions: [{ id: occasionId, ref: { source: event.id, revision: event.revision }, narrative: d.narrative ?? '', participants: d.participants, mentioned: d.mentioned, coPresence: d.coPresence }],
      interpretations: d.interpretations.map(i => ({ id: str(ids[i.sourceId], 128), ref: { source: i.sourceId, revision: source(f, i.sourceId).revision }, occasion: { id: occasionId }, question: { id: null, label: 'occasion interpretation' }, author: i.author, account: i.account, entry: true })),
      revisits: [],
    };
    const states = obj(f.caller.sourceStates) as Sources;
    return { operation: 'recallOccasion + jointOccasions', result: { recall: recallOccasion(occasionId, records, states), participation: jointOccasions(arr(f.caller.people, 8).map(x => str(x, 128)), records.occasions, states), extractionEvidence: c.evidence, unknown: c.unknown }, scope: 'Caller supplies accepted occasion/account identity; all supplied accounts are entry seeds. Missing participation is unknown, not absent. This calibration does not test revisit discovery or longitudinal benefit.' };
  },
};

const transformations: Adapter = {
  mechanism: '06',
  instructions: `Independently annotate ONLY the text supplied in this package. You cannot see the other member of its transformation pair. Return exactly {"data":{"subject":{"state":"known","value":"exact source phrase"},"attribution":{"state":"known","value":"exact source phrase"},"circumstance":{"state":"known","value":"exact source phrase"},"modality":{"state":"known","value":"exact source phrase"},"comparison":{"state":"known","value":"exact source phrase"}},"evidence":[{"path":"subject","sourceId":"package source ID","quote":"exact supporting text"}],"unknown":["unresolved item"]}.
Each field is exactly one of {"state":"known","value":"nonempty exact source phrase"}, {"state":"absent"}, or {"state":"unknown"}. subject names whom the preference is about; attribution gives the reporting-author phrase; circumstance gives applicability conditions; modality gives the strength/uncertainty phrase including its preference verb; comparison gives the contrasted alternatives. Use the smallest exact phrase carrying that meaning. Absent means this finite text specifies no such field, not that the real world lacks it; unknown means it cannot be resolved. Known and absent fields each require an evidence entry at the field name; absent quotes the relevant whole text. Do not emit values for absent/unknown. Record unresolved items in unknown. Do not emit pair status, preserved meaning, a receipt, IDs, revisions, rule, mode or eligibility; these are caller-owned. No additional keys.`,
  decode(raw, f) {
    const c = envelope(raw, f), d = obj(c.data); exact(d, [...FIELD_NAMES]);
    const fields = {} as Fields;
    for (const name of FIELD_NAMES) {
      const x = obj(d[name]);
      const state = oneOf(x.state, ['known', 'absent', 'unknown'] as const);
      exact(x, state === 'known' ? ['state', 'value'] : ['state']);
      if (state === 'known') {
        const value = str(x.value, 500); support(c, name);
        if (!c.evidence.some(e => e.path === name && e.quote.includes(value))) throw new Error('Known field phrase is not contained in its evidence');
        fields[name] = { state, value };
      } else {
        if (state === 'absent') support(c, name);
        fields[name] = { state };
      }
    }
    evidencePaths(c, new Set(FIELD_NAMES)); return { ...c, data: fields };
  },
  operate(candidate, f) {
    const c = this.decode(candidate, f);
    return { operation: 'independent field inspection (pair pending)', result: { fields: c.data, evidence: c.evidence, unknown: c.unknown }, scope: 'One text only. No comparison or preservation verdict exists until independently extracted old/candidate artifacts are supplied to compareTransformations.' };
  },
};

export function compareTransformations(oldCandidate: Candidate, oldFixture: Fixture, newCandidate: Candidate, newFixture: Fixture) {
  if (oldFixture.mechanism !== '06' || newFixture.mechanism !== '06' || oldFixture.caller.role !== 'old' || newFixture.caller.role !== 'candidate' || oldFixture.caller.pairId !== newFixture.caller.pairId) throw new Error('Transformation pair identity/role mismatch');
  const old = transformations.decode(oldCandidate, oldFixture), next = transformations.decode(newCandidate, newFixture);
  if (oldFixture.sources.length !== 1 || newFixture.sources.length !== 1) throw new Error('Calibration requires one text per package');
  const original = oldFixture.sources[0]!, replacement = newFixture.sources[0]!;
  for (const f of [oldFixture, newFixture]) {
    oneOf(f.caller.provenancePolicy, ['unchanged-original']); oneOf(f.caller.mode, ['free']);
  }
  // The caller declares unchanged original provenance for this rewrite pair.
  // Annotation-package evidence is separate; it never becomes new provenance.
  const refs = [{ source: original.id, revision: original.revision, quote: original.text }];
  const state = obj(obj(oldFixture.caller.sourceStates)[original.id]);
  const newState = obj(obj(newFixture.caller.sourceStates)[replacement.id]);
  const available = (s: Record<string, unknown>, revision: string) => s.available === true && s.eligible === true && s.revision === revision;
  const input = {
    old: { id: oldFixture.id, bytes: available(state, original.revision) ? original.text : null, fields: old.data as Fields, refs, kind: str(oldFixture.caller.kind, 128), origin: str(oldFixture.caller.origin, 128) },
    candidate: { id: newFixture.id, bytes: available(newState, replacement.revision) ? replacement.text : null, fields: next.data as Fields, refs, kind: str(newFixture.caller.kind, 128), origin: str(newFixture.caller.origin, 128) },
    sources: [{ id: original.id, revision: str(state.revision, 128), bytes: state.available === true ? original.text : null, eligible: state.eligible === true }],
    assumptions: [], rule: RULE, checkerVersion: CHECKER_VERSION, mode: 'free' as const,
  };
  return { operation: 'checkPresentation', result: checkPresentation(input), scope: 'Checks annotated equality and caller-declared unchanged provenance. Quotes establish presence only; arbitrary prose and annotation truth remain unassessed.' };
}

const planText = 'Inez requires a quiet place with seating and is available from 13:00 to 14:00. Pavel has no quiet requirement but does require seating and is available from 13:20 to 14:10. The conservatory is open, quiet, and has seating. They want a 25-minute visit.';
const planSource = 'cal-04-note';
const planningFixture: Fixture = {
  id: 'cal-04-conservatory', mechanism: '04', sources: [{ id: planSource, revision: 'r1', text: planText }],
  caller: { participants: ['Inez', 'Pavel'], places: ['conservatory'], occasion: 'conservatory-visit', asOf: 790, applicability: 'applies', retired: false, sourceStates: { [planSource]: { revision: 'r1', available: true, eligible: true, validity: 'current' } } },
  task: 'Use the shared-afternoon recipe to find the earliest feasible 25-minute visit today. Times are minutes after midnight on one day; current time comes from caller.asOf.',
  question: 'Where and during what earliest 25-minute time window can Inez and Pavel make their visit, given the current time and supplied requirements? Clock time or minutes after midnight are both acceptable.',
  gold: { data: { preferences: [{ participant: 'Inez', quiet: true, seating: true, sourceId: planSource }, { participant: 'Pavel', quiet: false, seating: true, sourceId: planSource }], availability: [{ participant: 'Inez', windows: [[780, 840]], sourceId: planSource }, { participant: 'Pavel', windows: [[800, 850]], sourceId: planSource }], places: [{ place: 'conservatory', quiet: true, seating: true, open: true, sourceId: planSource }], minutes: { value: 25, sourceId: planSource } }, evidence: ['preferences.0.quiet', 'preferences.0.seating', 'preferences.1.quiet', 'preferences.1.seating', 'availability.0.windows', 'availability.1.windows', 'places.0.quiet', 'places.0.seating', 'places.0.open', 'minutes.value'].map(path => quote(path, planSource, planText)), unknown: [] },
  checks: [{ path: 'data.preferences.0.quiet', value: true, critical: true }, { path: 'data.preferences.1.quiet', value: false, critical: true }, { path: 'data.availability.0.windows', value: [[780, 840]], critical: true }, { path: 'data.availability.1.windows', value: [[800, 850]], critical: true }, { path: 'data.minutes.value', value: 25, critical: true }],
  rubric: { required: ['Conservatory during 13:20–13:45 OR 800–825 minutes after midnight; either form is sufficient.'], forbidden: ['Invented travel times, closures, or reasons beyond the source.', 'Treat Pavel as requiring quiet.'], acceptableUnknown: ['A tentative option is appropriate; no booking or current real-world opening has been verified.'] },
  note: 'Fictional task-aware calibration, not a test of autonomous recipe creation or multi-use savings.',
};
const eventText = 'At the lantern-making workshop, Mira cut paper and Soren assembled frames. Their work overlapped at the same table. They talked about a pattern designed by Jules. The note does not say whether Jules attended.';
const reflectionText = 'The next morning Jules wrote about the lantern-making workshop: "To me, the shared table made this an exercise in cooperation." This reflection does not state whether Jules was present.';
const eventId = 'cal-05-event', reflectionId = 'cal-05-reflection';
const experienceFixture: Fixture = {
  id: 'cal-05-lanterns', mechanism: '05', sources: [{ id: eventId, revision: 'r1', text: eventText }, { id: reflectionId, revision: 'r1', text: reflectionText }],
  caller: { people: ['Mira', 'Soren', 'Jules'], occasionId: 'lantern-workshop', eventSourceId: eventId, interpretationIds: { [reflectionId]: 'lantern-reflection' }, entryPolicy: 'all-supplied-account-records', sourceStates: { [eventId]: { revision: 'r1', available: true, eligible: true }, [reflectionId]: { revision: 'r1', available: true, eligible: true } } },
  question: 'What did Jules think the workshop illustrated, and does the record establish that Jules attended?',
  gold: { data: { narrative: 'Mira cut paper and Soren assembled frames together at a lantern-making workshop; they discussed a pattern by Jules.', participants: [{ person: 'Mira', role: 'cut paper' }, { person: 'Soren', role: 'assembled frames' }], mentioned: ['Jules'], coPresence: [['Mira', 'Soren']], interpretations: [{ sourceId: reflectionId, author: 'Jules', account: 'The shared table made the workshop an exercise in cooperation.' }] }, evidence: [quote('narrative', eventId, eventText), quote('participants.0', eventId, eventText), quote('participants.1', eventId, eventText), quote('mentioned.0', eventId, eventText), quote('coPresence.0', eventId, eventText), quote('interpretations.0', reflectionId, reflectionText)], unknown: ['Whether Jules attended is not established.'] },
  checks: [{ path: 'data.participants.0.person', value: 'Mira', critical: true }, { path: 'data.participants.1.person', value: 'Soren', critical: true }, { path: 'data.mentioned', value: ['Jules'], critical: true }, { path: 'data.interpretations.0.author', value: 'Jules', critical: true }],
  rubric: { required: ['Attribute the cooperation interpretation to Jules.', 'Attendance is unknown/not established.'], forbidden: ['Claim that Jules attended.', 'Claim that Jules was absent.', 'Present the attributed interpretation as an independently established event fact.'], acceptableUnknown: ['Whether Jules personally observed the shared table.'] },
  note: 'Question-blind capture. Caller supplies common event/account boundary; calibration does not establish automatic identity resolution.',
};
const oldText = 'Noor wrote in her travel journal: "For short winter walks, I might prefer the canal path to the hill trail."';
const newText = 'Noor wrote in her travel journal: "For short winter walks, I always prefer the canal path to the hill trail."';
function transformationFixture(role: 'old' | 'candidate', text: string): Fixture {
  const id = `cal-06-journal-${role}`, sourceId = role === 'old' ? 'cal-06-text-a' : 'cal-06-text-b';
  const values = { subject: 'Noor', attribution: 'Noor wrote in her travel journal', circumstance: 'For short winter walks', modality: role === 'old' ? 'might prefer' : 'always prefer', comparison: 'the canal path to the hill trail' };
  const data = Object.fromEntries(FIELD_NAMES.map(name => [name, { state: 'known', value: values[name] }]));
  return {
    id, mechanism: '06', sources: [{ id: sourceId, revision: 'r1', text }],
    caller: { pairId: 'pair-a', role, provenancePolicy: 'unchanged-original', mode: 'free', kind: 'memory', origin: 'travel-journal', sourceStates: { [sourceId]: { revision: 'r1', available: true, eligible: true } } },
    question: 'What preference does this text attribute to Noor, under what circumstances, and with what strength or uncertainty?',
    gold: { data, evidence: FIELD_NAMES.map(name => quote(name, sourceId, text)), unknown: [] },
    checks: FIELD_NAMES.map(name => ({ path: `data.${name}.state`, value: 'known', critical: true })),
    rubric: { required: [`Noor ${role === 'old' ? 'might prefer' : 'always prefers'} the canal path to the hill trail for short winter walks.`, 'Treat this as attributed journal content.'], forbidden: ['Drop the short-winter-walk condition.', role === 'old' ? 'Turn tentative preference into certainty.' : 'Turn the explicit always into a tentative might.', 'Declare global meaning preservation.'], acceptableUnknown: ['Whether this preference is true outside the quoted journal statement.'] },
    note: 'Independent annotation package. Old/candidate pairing happens only after extraction; deterministic check should flag changed modality, with prose still unassessed.',
  };
}

export const adapters: Adapter[] = [planning, experiences, transformations];
export const fixtures: Fixture[] = [planningFixture, experienceFixture, transformationFixture('old', oldText), transformationFixture('candidate', newText)];
