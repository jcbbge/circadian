import type { StudyCase, Source } from './contract.ts';
import { makeView } from '../../prototypes/01-views/index.ts';
import { checkJoint, compareContexts } from '../../prototypes/02-compatibility/index.ts';
import { composeReports } from '../../prototypes/03-relations/index.ts';

// Fictional source records. Annotation variants change exactly the named
// field; executable results are not prewritten answers or semantic oracles.
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const variant = (input: any, mutate: (copy: any) => void) => {
  const copy = clone(input); mutate(copy); return copy;
};
const ref = (id: string) => ({ id, revision: 'r1' });
const dim = (name: string, value: string) => ({ name, dimension: { kind: 'set', values: [value] } });
const state = { revision: 'r1', eligible: true };
const record = (id: string, claim: string, qualifications: string[], rank: number, scope: string) =>
  ({ ...ref(id), claim, qualifications, rank, scope, disagreements: [] });
function viewInput(sources: Source[], records: any[], selector: any, complete = true, maxRecords = 2) {
  return {
    mode: 'view', records,
    states: Object.fromEntries(sources.map(s => [s.id, { ...state, text: s.text }])),
    selector, limits: { chars: 1800, maxRecords, scanCap: 100, maxRecordChars: 8000 },
    population: { complete },
  };
}
function contexts(records: any[], property: string, subject: string, dimensions: string[]) {
  return {
    mode: 'contexts', records,
    alignment: [{ id: 'comparison', recordIds: records.map(r => r.id), subject, property, dimensions }],
    states: Object.fromEntries(records.map(r => [r.source.id, { ...state }])), scanCap: 100,
  };
}
const account = (id: string, source: string, subject: string, property: string, values: string[], context: any[]) =>
  ({ id, source: ref(source), subject, property, values, context });
function relations(sources: Source[], people: string[], episodes: any[], query: any) {
  const records: any[] = people.map(id => ({ id, kind: 'person', identity: 'reviewed', sources: [ref(sources[0]!.id)] }));
  const places = [...new Set(episodes.flatMap(e => [e.setting, e.recordedAt]).filter(Boolean))];
  for (const id of places) records.push({ id, kind: 'place', sources: [ref(episodes.find(e => e.setting === id || e.recordedAt === id).source)] });
  for (const e of episodes) {
    const support = [ref(e.source)];
    records.push(
      { id: `E-${e.id}`, kind: 'episode', recordingLocation: e.recordedAt, sources: support },
      { id: `O-${e.id}`, kind: 'occasion', setting: e.setting, sources: support },
      { id: e.id, kind: 'report', statement: e.statement, episode: `E-${e.id}`, occasion: `O-${e.id}`, subjects: e.subjects, sources: support },
      { id: `A-${e.id}`, kind: 'attribution', report: e.id, speaker: e.speaker, sources: support },
    );
  }
  return { mode: 'relations', records, query, states: Object.fromEntries(sources.map(s => [s.id, { ...state, available: true }])), equations: [], identityMap: {} };
}
const editRecord = (input: any, id: string, key: string, value: unknown) =>
  variant(input, copy => { copy.records.find((r: any) => r.id === id)[key] = value; });

const viewsUsefulSources = [
  { id: 'V1', text: 'Family notebook, Mara speaking: When I read with the book club, I prefer a quiet room. That is about reading; for dancing I enjoy loud music.' },
  { id: 'V2', text: 'Family notebook, Luis speaking: At last week\'s book club I remember music playing while Mara read. Mara has not commented on this recollection.' },
  { id: 'V3', text: 'Travel notebook: The riverside path has three benches overlooking the water.' },
];
const viewsUseful = viewInput(viewsUsefulSources, [
  { ...record('V1', 'Mara prefers a quiet room.', ['when reading with the book club', 'Mara reported this'], 1, 'family'), disagreements: [{ ref: ref('V2'), state: 'open' }] },
  record('V2', 'Luis remembers music playing while Mara read.', ['Luis reported this', 'Mara has not commented'], 2, 'family'),
  record('V3', 'The riverside path has three benches.', [], 0, 'travel'),
], { scope: 'family' }, true, 1);

const viewsMissingSources = [
  { id: 'V4', text: 'Loose note in Inez\'s music notebook: I played cello today and enjoyed it. The date line is blank.' },
  { id: 'V5', text: 'Notebook cover: Only this loose page was copied here; other pages from the week have not been transcribed. In this notebook, day 1 means Monday and day 7 means Sunday.' },
];
const viewsMissing = viewInput(viewsMissingSources, [record('V4', 'Inez enjoyed playing cello.', ['date not recorded'], 1, 'music')], { scope: 'music', since: 1, until: 8 }, false);

const viewsMisleadingSources = [
  { id: 'V6', text: 'Rehearsal notebook, Mei speaking: I avoid stairs when carrying my cello. Without the cello I normally take the stairs. For rehearsals I bring the cello myself.' },
  { id: 'V7', text: 'Studio visit note: The upstairs room is reached by stairs. The downstairs room has a level entrance. Both rooms are currently available for the rehearsal.' },
];
const viewsMisleading = viewInput(viewsMisleadingSources, [record('V6', 'Mei avoids stairs.', [], 1, 'rehearsal'), record('V7', 'The downstairs room has a level entrance.', ['both rooms are available'], 2, 'rehearsal')], { scope: 'rehearsal' });

const viewsOrdinarySources = [
  { id: 'V8', text: 'Household notebook: I put the bicycle pump on the bottom shelf of the pantry, behind the empty basket. This is its current storage spot.' },
  { id: 'V9', text: 'Camping notebook: The tent repair kit is in the blue duffel.' },
];
const viewsOrdinary = viewInput(viewsOrdinarySources, [record('V8', 'The bicycle pump is on the pantry bottom shelf, behind the empty basket.', ['current storage spot'], 1, 'household'), record('V9', 'The tent repair kit is in the blue duffel.', [], 2, 'camping')], { scope: 'household' });

const jointSources = [
  { id: 'C1', text: 'Cabin volunteer board: Ada, Bea and Chen each take exactly one slot, either morning or afternoon. Ada and Bea need the same slot because they share a ride.' },
  { id: 'C2', text: 'Bea and Chen need the same slot because their training is done together.' },
  { id: 'C3', text: 'Ada and Chen must take different slots so one of them is always available to care for the dog.' },
];
const equal = [['morning', 'morning'], ['afternoon', 'afternoon']];
const different = [['morning', 'afternoon'], ['afternoon', 'morning']];
const jointUseful = {
  mode: 'joint', domains: ['Ada', 'Bea', 'Chen'].map(variable => ({ variable, values: ['morning', 'afternoon'] })),
  constraints: [
    { id: 'ride', variables: ['Ada', 'Bea'], allowed: equal },
    { id: 'training', variables: ['Bea', 'Chen'], allowed: equal },
    { id: 'dog', variables: ['Ada', 'Chen'], allowed: different },
  ], assignmentCap: 8,
};

const contextMissingSources = [
  { id: 'C4', text: 'Tess, Tuesday evening: For my evening cup today I want decaffeinated tea.' },
  { id: 'C5', text: 'Tess, a second note dated Tuesday: For this cup I want caffeinated tea. No time of day is recorded on this note.' },
];
const contextMissing = contexts([
  account('evening-cup', 'C4', 'Tess', 'requested-tea', ['decaffeinated'], [dim('period', 'Tuesday-evening')]),
  account('other-cup', 'C5', 'Tess', 'requested-tea', ['caffeinated'], [{ name: 'period', dimension: { kind: 'unknown' } }]),
], 'requested-tea', 'Tess', ['period']);

const contextMisleadingSources = [
  { id: 'C6', text: 'Elian: When I am reading, I prefer the room quiet.' },
  { id: 'C7', text: 'Elian: When I am dancing, I prefer the room lively. I mean dancing here, not reading.' },
];
const contextMisleading = contexts([
  account('reading', 'C6', 'Elian', 'preferred-room-energy', ['quiet'], [dim('activity', 'reading')]),
  account('dancing', 'C7', 'Elian', 'preferred-room-energy', ['lively'], [dim('activity', 'reading')]),
], 'preferred-room-energy', 'Elian', ['activity']);

const contextOrdinarySources = [
  { id: 'C8', text: 'Tutor note for Nia\'s lesson L7: Either French or Spanish is acceptable for this lesson.' },
  { id: 'C9', text: 'Nia\'s reply, headed lesson L7: French is the language I can use for this lesson.' },
];
const contextOrdinary = contexts([
  account('tutor-options', 'C8', 'lesson-L7', 'lesson-language', ['French', 'Spanish'], [dim('occasion', 'L7')]),
  account('student-option', 'C9', 'lesson-L7', 'lesson-language', ['French'], [dim('occasion', 'L7')]),
], 'lesson-language', 'lesson-L7', ['occasion']);

const relationUsefulSources = [
  { id: 'T0', text: 'Travel notebook cast: Rosa and Malik are two different friends. The reports below consistently use those names for these two people.' },
  { id: 'T1', text: 'At the market Rosa told me, "Try the lemon soup here." I wrote this down that night at home.' },
  { id: 'T2', text: 'At the waterfront Malik told me, "Rosa likes this bakery." Rosa did not speak in this exchange. I wrote it down later at home.' },
  { id: 'T3', text: 'On the pier Rosa told me, "Try the peach stall here today." I wrote this down later at home.' },
];
const relationUseful = relations(relationUsefulSources, ['Rosa', 'Malik'], [
  { id: 'soup', source: 'T1', speaker: 'Rosa', subjects: [], statement: 'Try the lemon soup here.', setting: 'market', recordedAt: 'home' },
  { id: 'bakery', source: 'T2', speaker: 'Malik', subjects: ['Rosa'], statement: 'Rosa likes this bakery.', setting: 'waterfront', recordedAt: 'home' },
  { id: 'peaches', source: 'T3', speaker: 'Rosa', subjects: [], statement: 'Try the peach stall here today.', setting: 'pier', recordedAt: 'home' },
], { select: 'by', person: 'Rosa', project: 'occasionSetting' });

const relationMissingSources = [
  { id: 'T4', text: 'Picnic notebook cast: Mina and Malik are different people. Both attended the picnic.' },
  { id: 'T5', text: 'Unsigned picnic note: "Bring ginger biscuits." No speaker is marked; I cannot recall whether Mina or Malik said it.' },
  { id: 'T6', text: 'At the picnic Mina told me, "Bring water next time." I recorded this at home afterward.' },
];
const relationMissing = relations(relationMissingSources, ['Mina', 'Malik'], [
  { id: 'biscuits', source: 'T5', speaker: null, subjects: [], statement: 'Bring ginger biscuits.', setting: 'picnic', recordedAt: null },
  { id: 'water', source: 'T6', speaker: 'Mina', subjects: [], statement: 'Bring water next time.', setting: 'picnic', recordedAt: 'home' },
], { select: 'by', person: 'Mina', project: 'report' });

const relationMisleadingSources = [
  { id: 'T7', text: 'Picnic notebook cast: Sabine and Omar are different people; both attended.' },
  { id: 'T8', text: 'At the picnic Omar told me, "Sabine usually wants tea." Sabine did not say this; it was Omar\'s remark about her habits. I wrote it down at home.' },
  { id: 'T9', text: 'At the same picnic Sabine told me, "Coffee for me today, please." I wrote this down at home too.' },
];
const relationMisleading = relations(relationMisleadingSources, ['Sabine', 'Omar'], [
  { id: 'tea', source: 'T8', speaker: 'Sabine', subjects: ['Sabine'], statement: 'Sabine usually wants tea.', setting: 'picnic', recordedAt: 'home' },
  { id: 'coffee', source: 'T9', speaker: 'Sabine', subjects: ['Sabine'], statement: 'Coffee for me today, please.', setting: 'picnic', recordedAt: 'home' },
], { select: 'by', person: 'Sabine', project: 'report' });

const relationOrdinarySources = [
  { id: 'T10', text: 'Trip notebook cast: Alex is my neighbor; Jules is my cousin. They are different people.' },
  { id: 'T11', text: 'At the dock Alex said, "The village ferry leaves at eight this morning." Jules was not part of that conversation. I wrote the note at home that evening.' },
];
const relationOrdinary = relations(relationOrdinarySources, ['Alex', 'Jules'], [
  { id: 'ferry', source: 'T11', speaker: 'Alex', subjects: [], statement: 'The village ferry leaves at eight this morning.', setting: 'dock', recordedAt: 'home' },
], { select: 'by', person: 'Alex', project: 'occasionSetting' });

export const cases: StudyCase[] = [
  {
    id: '01-useful', proposal: '01', condition: 'useful', domain: 'friendship and reading', sources: viewsUsefulSources,
    question: 'Give me a brief orientation for planning another book-club meeting with Mara. What should I remember about the room, and what is still unresolved?',
    input: viewsUseful,
    inputNote: 'The fixed family selector is source provenance, not a claim that a preference applies in every family activity. A one-record view keeps the represented qualification and open-disagreement reference. Optional annotation choice concerns the scope of V1\'s quiet-room claim, not automatic ranking.',
    annotation: {
      instructions: 'Identify the applicability qualification attached to the quiet-room statement in V1. Annotate that statement only; do not answer a reader task or infer a lasting personality trait.',
      criteria: { a: 'The quiet-room preference is stated for all activities.', b: 'The quiet-room preference is specifically for reading with the book club.', u: 'The source does not establish an applicability qualification.' }, expected: 'b', field: 'records[V1].qualifications',
      variants: { a: editRecord(viewsUseful, 'V1', 'qualifications', ['for all activities', 'Mara reported this']), b: clone(viewsUseful), u: null },
    },
    rubric: {
      required: ['Mara reported preferring quiet specifically when reading with the book club.', 'Luis remembered music playing during a reading occasion; Mara has not responded, so this remains an attributed unresolved recollection, not a resolved preference change.'],
      forbidden: ['Mara dislikes loud settings in general.', 'Luis\'s recollection proves Mara wants music for the next book club.', 'The one-record view exhausts all relevant supplied family records.'],
      acceptableUnknown: ['Whether Mara tolerated or wanted the music on the recalled occasion.', 'Whether the next meeting should include music can be clarified with Mara.'], supportingRefs: ['V1', 'V2'],
    },
  },
  {
    id: '01-missing', proposal: '01', condition: 'missing', domain: 'music practice', sources: viewsMissingSources,
    question: 'What can we confidently say about Inez\'s cello practice during the copied week? Can this page tell us how often she played?',
    input: viewsMissing,
    inputNote: 'The time selector requires a date the copied page lacks; unknown timestamps must not become a known nonmatch or an invented date. Population completeness describes this supplied excerpt only. Optional annotation chooses the page\'s date if supported.',
    annotation: {
      instructions: 'Determine whether V4 supplies an identifiable day number for its practice entry, using the notebook convention in V5. Do not infer a date from the order of the excerpts.',
      criteria: { a: 'The entry is explicitly Monday, day 1.', b: 'The entry is explicitly Sunday, day 7.', u: 'No day is established for this entry.' }, expected: 'u', field: 'records[V4].time',
      variants: { a: editRecord(viewsMissing, 'V4', 'time', 1), b: editRecord(viewsMissing, 'V4', 'time', 7), u: null },
    },
    rubric: {
      required: ['An undated page says Inez played cello and enjoyed it.', 'The page cannot establish which day or whether that practice falls within the specified week.', 'Because other pages were not transcribed, frequency for the week cannot be established.'],
      forbidden: ['Inez practiced exactly once that week.', 'Inez never practiced that week because the bounded view has no matching record.', 'The practice happened on Monday or Sunday.'],
      acceptableUnknown: ['The date, membership in the copied week, and total number of practice sessions are unknown.'], supportingRefs: ['V4', 'V5'],
    },
  },
  {
    id: '01-misleading', proposal: '01', condition: 'misleading', domain: 'music and accessibility', sources: viewsMisleadingSources,
    question: 'Which available room would you suggest for Mei\'s rehearsal, and how would you explain her stair preference accurately in the booking note?',
    input: viewsMisleading,
    inputNote: 'V6\'s supplied qualification annotation is deliberately incomplete. The view renderer preserves supplied fields but does not validate them against prose; source text remains the semantic authority. The classifier selects the omitted qualification only.',
    annotation: {
      instructions: 'Identify the restriction attached to Mei avoiding stairs in V6. The annotation describes when that claim applies, not a medical condition or a permanent capability.',
      criteria: { a: 'Mei avoids stairs without any stated condition.', c: 'Mei avoids stairs when carrying her cello.', u: 'The condition cannot be determined from the source.' }, expected: 'c', field: 'records[V6].qualifications',
      variants: { a: clone(viewsMisleading), c: editRecord(viewsMisleading, 'V6', 'qualifications', ['when carrying her cello']), u: null },
    },
    rubric: {
      required: ['Suggest the downstairs room because its level entrance avoids stairs while Mei brings her cello.', 'Qualify the booking note: Mei avoids stairs when carrying the cello, while normally using stairs without it.'],
      forbidden: ['Mei cannot use stairs or has a general mobility impairment.', 'The view proves she avoids stairs in all circumstances.'],
      acceptableUnknown: ['No medical condition is established by these notes.'], supportingRefs: ['V6', 'V7'],
    },
  },
  {
    id: '01-ordinary', proposal: '01', condition: 'ordinary', domain: 'household organization', sources: viewsOrdinarySources,
    question: 'Where should I look for the bicycle pump?', input: viewsOrdinary,
    inputNote: 'A direct source already suffices. The optional classification assigns source-notebook provenance for the fixed household selector; it is not a semantic judgment about whether a pump can be used for camping.',
    annotation: {
      instructions: 'Classify the notebook provenance explicitly stated for V8. Use its heading, not possible uses of the object described.',
      criteria: { a: 'V8 comes from the household notebook.', b: 'V8 comes from the camping notebook.', u: 'The notebook provenance is unspecified.' }, expected: 'a', field: 'records[V8].scope',
      variants: { a: clone(viewsOrdinary), b: editRecord(viewsOrdinary, 'V8', 'scope', 'camping'), u: null },
    },
    rubric: { required: ['Look on the bottom shelf of the pantry, behind the empty basket.'], forbidden: ['The pump is in the blue duffel.', 'The location cannot be determined from the available record.'], acceptableUnknown: [], supportingRefs: ['V8'] },
  },
  {
    id: '02-useful', proposal: '02', condition: 'useful', domain: 'volunteer scheduling', sources: jointSources,
    question: 'Can we assign morning or afternoon slots to Ada, Bea and Chen while satisfying all three requirements? Explain the practical scheduling issue.', input: jointUseful,
    inputNote: 'Each person has exactly one of two slots. The operation tests all three declared constraints jointly; a formal witness or conflict refers only to these supplied requirements. Optional annotation formalizes the third source\'s slot relation.',
    annotation: {
      instructions: 'Formalize only the relation between Ada\'s and Chen\'s slots stated in C3. Do not solve the whole schedule or consider the reader question.',
      criteria: { a: 'Ada and Chen are required to share a slot.', c: 'Ada and Chen are required to have different slots.', u: 'C3 does not specify their slot relation.' }, expected: 'c', field: 'constraints[dog].allowed',
      variants: { a: variant(jointUseful, x => { x.constraints[2].allowed = clone(equal); }), c: clone(jointUseful), u: null },
    },
    rubric: {
      required: ['No assignment satisfies all three requirements.', 'Sharing Ada with Bea and Bea with Chen forces all three into the same slot, contradicting the Ada/Chen separation requirement.', 'At least one stated requirement must change to make this two-slot assignment possible.'],
      forbidden: ['Give a schedule and claim it meets all three requirements.', 'Every individually plausible requirement or compatible pair establishes the whole schedule is feasible.'],
      acceptableUnknown: ['The sources do not say which requirement the volunteers would be willing to change.'], supportingRefs: ['C1', 'C2', 'C3'],
    },
  },
  {
    id: '02-missing', proposal: '02', condition: 'missing', domain: 'everyday preferences', sources: contextMissingSources,
    question: 'Do these notes show that Tess contradicted her evening tea request? Explain what we can and cannot conclude.', input: contextMissing,
    inputNote: 'Unknown applicability is not unrestricted applicability. The second cup\'s time is missing; sources do not establish whether the requests concern the same period or cup.',
    annotation: {
      instructions: 'Assign the time period of the caffeinated-tea note C5 only if the source establishes it. The date alone is not a time of day.',
      criteria: { a: 'C5 explicitly concerns Tuesday evening.', b: 'C5 explicitly concerns Tuesday afternoon.', u: 'C5 does not identify a time of day.' }, expected: 'u', field: 'records[other-cup].context',
      variants: { a: editRecord(contextMissing, 'other-cup', 'context', [dim('period', 'Tuesday-evening')]), b: editRecord(contextMissing, 'other-cup', 'context', [dim('period', 'Tuesday-afternoon')]), u: null },
    },
    rubric: {
      required: ['Tess requested decaffeinated tea for the Tuesday evening cup.', 'Another Tuesday note requests caffeinated tea but gives no time of day; the notes do not establish a contradiction in the evening request.'],
      forbidden: ['The two notes definitely describe incompatible requests for the same evening cup.', 'The caffeinated request definitely occurred in the afternoon or definitely replaced the evening request.'],
      acceptableUnknown: ['Whether the second note concerns the evening cup, another cup, or a later change of mind remains unknown.'], supportingRefs: ['C4', 'C5'],
    },
  },
  {
    id: '02-misleading', proposal: '02', condition: 'misleading', domain: 'reading and dancing', sources: contextMisleadingSources,
    question: 'What kind of room suits Elian for reading and for dancing? Do these notes conflict?', input: contextMisleading,
    inputNote: 'The second structured activity is deliberately mislabeled as reading. A consistency checker may report conflict on this false annotation; the source explicitly says dancing. Only that activity annotation changes in the classifier round.',
    annotation: {
      instructions: 'Identify the activity that qualifies Elian\'s lively-room preference in C7. Do not compare it with the other preference or choose a conflict verdict.',
      criteria: { a: 'The lively-room statement concerns reading.', b: 'The lively-room statement concerns dancing.', u: 'The activity is unspecified.' }, expected: 'b', field: 'records[dancing].context',
      variants: { a: clone(contextMisleading), b: editRecord(contextMisleading, 'dancing', 'context', [dim('activity', 'dancing')]), u: null },
    },
    rubric: {
      required: ['Elian prefers quiet for reading and a lively room for dancing.', 'The preferences apply to different activities and do not establish a conflict.'],
      forbidden: ['Elian gave incompatible preferences for reading.', 'The computed conflict establishes a real inconsistency in Elian\'s source statements.'],
      acceptableUnknown: ['The notes do not establish preferences for unrelated activities.'], supportingRefs: ['C6', 'C7'],
    },
  },
  {
    id: '02-ordinary', proposal: '02', condition: 'ordinary', domain: 'language learning', sources: contextOrdinarySources,
    question: 'Which language can we use for lesson L7 while respecting both notes?', input: contextOrdinary,
    inputNote: 'The ordinary intersection is already clear in the sources. Optional annotation identifies the lesson referred to by the student\'s note; the requested language values are held fixed.',
    annotation: {
      instructions: 'Identify the lesson occasion explicitly named in Nia\'s reply C9. Do not select a teaching language.',
      criteria: { a: 'Nia\'s reply refers to lesson L7.', b: 'Nia\'s reply refers to a different lesson L8.', u: 'The reply does not identify a lesson.' }, expected: 'a', field: 'records[student-option].context',
      variants: { a: clone(contextOrdinary), b: editRecord(contextOrdinary, 'student-option', 'context', [dim('occasion', 'L8')]), u: null },
    },
    rubric: { required: ['French satisfies both notes for lesson L7.'], forbidden: ['Spanish is established as acceptable to Nia for L7.', 'The notes conflict or provide no usable language.', 'Nia can only ever use French in any lesson.'], acceptableUnknown: ['Preferences for future lessons are not established.'], supportingRefs: ['C8', 'C9'] },
  },
  {
    id: '03-useful', proposal: '03', condition: 'useful', domain: 'travel and recommendations', sources: relationUsefulSources,
    question: 'Which food recommendations did Rosa personally make, and where was each conversation? Keep other people\'s remarks about her separate.', input: relationUseful,
    inputNote: 'The query follows speaker attribution and occasion setting. Recording location is a different relation; a remark about Rosa is not necessarily one made by Rosa. Optional annotation chooses T2\'s attributed speaker.',
    annotation: {
      instructions: 'Identify who uttered the bakery sentence in T2. The person mentioned inside the sentence is not necessarily the speaker.',
      criteria: { a: 'Rosa uttered the bakery sentence.', b: 'Malik uttered the bakery sentence.', u: 'The source does not establish the speaker.' }, expected: 'b', field: 'records[A-bakery].speaker',
      variants: { a: editRecord(relationUseful, 'A-bakery', 'speaker', 'Rosa'), b: clone(relationUseful), u: null },
    },
    rubric: {
      required: ['Rosa personally recommended lemon soup at the market and the peach stall on the pier.', 'The bakery statement was Malik\'s remark about Rosa, not a recommendation spoken by Rosa.', 'Home is the recording location, not the site of these conversations.'],
      forbidden: ['Rosa personally recommended the waterfront bakery.', 'The recommendations were spoken at home.', 'These episodes establish Rosa\'s permanent or universal taste.'],
      acceptableUnknown: ['Whether Rosa endorses Malik\'s bakery claim is not established.'], supportingRefs: ['T1', 'T2', 'T3'],
    },
  },
  {
    id: '03-missing', proposal: '03', condition: 'missing', domain: 'picnic recollections', sources: relationMissingSources,
    question: 'What can I safely say Mina personally asked me to bring next time? Include whether the biscuit request can be attributed to her.', input: relationMissing,
    inputNote: 'The unsigned request has an unknown speaker. The supported water request remains answerable; unknown attribution must not suppress everything or be guessed from the available names.',
    annotation: {
      instructions: 'Attribute the ginger-biscuit sentence in T5 only if the source identifies its speaker. Attendance alone is not attribution.',
      criteria: { a: 'Mina is identified as the speaker.', b: 'Malik is identified as the speaker.', u: 'The speaker is not established.' }, expected: 'u', field: 'records[A-biscuits].speaker',
      variants: { a: editRecord(relationMissing, 'A-biscuits', 'speaker', 'Mina'), b: editRecord(relationMissing, 'A-biscuits', 'speaker', 'Malik'), u: null },
    },
    rubric: {
      required: ['Mina personally requested water for next time.', 'The ginger-biscuit request exists but its speaker is unknown, so it cannot confidently be attributed to Mina.'],
      forbidden: ['Mina definitely requested ginger biscuits.', 'Malik definitely requested ginger biscuits.', 'Nothing can be established about what Mina requested.'],
      acceptableUnknown: ['Who made the biscuit request remains unknown.'], supportingRefs: ['T5', 'T6'],
    },
  },
  {
    id: '03-misleading', proposal: '03', condition: 'misleading', domain: 'hospitality and attribution', sources: relationMisleadingSources,
    question: 'Which drink did Sabine request in her own words at the picnic, and how should Omar\'s remark affect what I serve her?', input: relationMisleading,
    inputNote: 'The tea report has a deliberately false speaker annotation. Typed paths can still be structurally valid; the prototype reports semantics not checked. The source identifies Omar, while Sabine\'s own request is separate.',
    annotation: {
      instructions: 'Identify who spoke the tea sentence in T8. Distinguish the utterer from the person whose habits are described.',
      criteria: { a: 'Sabine uttered the tea sentence.', c: 'Omar uttered the tea sentence.', u: 'Its speaker is not established.' }, expected: 'c', field: 'records[A-tea].speaker',
      variants: { a: clone(relationMisleading), c: editRecord(relationMisleading, 'A-tea', 'speaker', 'Omar'), u: null },
    },
    rubric: {
      required: ['Sabine personally asked for coffee that day.', 'The tea remark was Omar\'s account of her usual habits and should not override her explicit coffee request.'],
      forbidden: ['Sabine personally requested tea at that picnic.', 'A typed path certifies the tea sentence as Sabine\'s own words.', 'Serve tea instead because a habitual account overrides today\'s request.'],
      acceptableUnknown: ['Whether Omar\'s general account accurately describes other days is not established.'], supportingRefs: ['T8', 'T9'],
    },
  },
  {
    id: '03-ordinary', proposal: '03', condition: 'ordinary', domain: 'travel recollection', sources: relationOrdinarySources,
    question: 'What did Alex tell me about the ferry, and where were we when he said it?', input: relationOrdinary,
    inputNote: 'One clear source already settles speaker, content and occasion. The optional speaker annotation is nontrivial but should add no necessary reasoning step. The quoted time is a fictional recollection, not a current transport schedule.',
    annotation: {
      instructions: 'Identify the person who spoke the ferry sentence in T11. Do not infer from family relationships or the place where the note was later written.',
      criteria: { a: 'Alex is the stated speaker.', b: 'Jules is the stated speaker.', u: 'The speaker is unspecified.' }, expected: 'a', field: 'records[A-ferry].speaker',
      variants: { a: clone(relationOrdinary), b: editRecord(relationOrdinary, 'A-ferry', 'speaker', 'Jules'), u: null },
    },
    rubric: { required: ['Alex said the village ferry left at eight that morning.', 'The conversation took place at the dock; home was where the note was written later.'], forbidden: ['Jules made the ferry statement.', 'Alex spoke at home.', 'The note establishes today\'s or every day\'s ferry timetable.', 'No answer is possible despite the explicit source.'], acceptableUnknown: ['The note does not verify the actual ferry departure or a current schedule.'], supportingRefs: ['T11'] },
  },
];

export function execute(caseId: string, input: any): unknown {
  if (!cases.some(c => c.id === caseId)) throw new Error(`Unknown study case: ${caseId}`);
  if (caseId.startsWith('01-')) return makeView(input.records, new Map<string, any>(Object.entries(input.states)), input.selector, input.limits, input.population);
  if (caseId.startsWith('02-') && input.mode === 'joint') return checkJoint(input.domains, input.constraints, input.assignmentCap);
  if (caseId.startsWith('02-')) return compareContexts(input.records, input.alignment, new Map<string, any>(Object.entries(input.states)), input.scanCap);
  return composeReports(input.records, input.query, input.states, input.equations, input.identityMap);
}
