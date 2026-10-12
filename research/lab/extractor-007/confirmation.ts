import type { Candidate, Evidence, FieldCheck, Fixture } from '../extractor-006/contract';

// Independently authored confirmation data. Pair outcomes are evaluation-only.
const live = (ids: string[]) => Object.fromEntries(ids.map(id => [id, { revision: 'r1', available: true, eligible: true }]));
const evidence = (sourceId: string, quote: string, paths: string[]): Evidence[] => paths.map(path => ({ path, sourceId, quote }));
const check = (path: string, value: unknown, critical = true): FieldCheck => ({ path, value, critical });
const note = 'Fictional confirmation source bundle. Caller supplies reviewed vocabulary and current source state; extraction remains a candidate interpretation.';

const lending = 'The repair desk lends torque wrenches for four days. Borrowers may extend a loan by two days only if a staff member approves before the due date.';
const exhibition = 'The exhibition hall displays local photographs. Its east entrance is closed during deliveries.';
const gateA = 'On Thursday, the equipment gate must stay locked for inventory.';
const gateB = 'On Saturday, the equipment gate must stay unlocked for scheduled pickups.';
const pumpA = 'The maintenance note requires the courtyard pump to remain running throughout Monday.';
const pumpB = 'The safety note requires the courtyard pump to remain stopped throughout Monday.';
const conversation = 'At the pottery studio, Selma said, "Tomas prefers the firmer clay." The note was later entered at the ticket counter.';
const unsigned = 'An unsigned note entered at the ticket kiosk says, "They chose the heavier fabric." Neither the speaker nor the people meant by "they" are identified. The location of the described sewing session is not recorded.';
const planning = 'Asha requires a quiet place but has no seating requirement and is available from 14:07 to 15:11. Bram requires seating but has no quiet requirement and is available from 14:19 to 15:03. The reading alcove is open, quiet, and has seating. They want a 23-minute visit.';
const event = 'At the kite-repair session, Kato replaced a spar and Elin patched a sail. They worked simultaneously at the same bench. They referred to instructions written by Bex. The note does not establish whether Bex attended.';
const reflection = 'Two days later Bex wrote about the kite-repair session: "I see their careful repairs as an example of patience." The reflection does not establish whether Bex was present at the session.';

const textA = 'Ravi wrote in his sketchbook: "For brief evening drawing sessions, I could favor the charcoal pencil over the ink pen."';
const textB = 'Ravi wrote in his sketchbook the following: "For brief evening drawing sessions, I could favor the charcoal pencil over the ink pen."';
const textC = 'Ravi wrote in his sketchbook: "For all drawing sessions, I often favor the charcoal pencil over the ink pen."';
type Annotation = Record<'subject' | 'attribution' | 'circumstance' | 'modality' | 'comparison', string>;

// Each text has its own explicitly reviewed phrases; annotations are never copied
// from another fixture or inferred from the expected pair outcome.
function annotatedText(id: string, sourceId: string, role: 'old' | 'candidate', text: string,
  phrases: Annotation, required: string[], forbidden: string[]): Fixture {
  const data = Object.fromEntries(Object.entries(phrases).map(([name, value]) => [name, { state: 'known', value }]));
  const gold: Candidate = { data, evidence: Object.entries(phrases).map(([path, quote]) => ({ path, sourceId, quote })), unknown: [] };
  return {
    id, mechanism: '06', sources: [{ id: sourceId, revision: 'r1', text }],
    caller: { pairId: 'pair-k63', role, provenancePolicy: 'unchanged-original', mode: 'free', kind: 'memory', origin: 'sketchbook', sourceStates: live([sourceId]) },
    question: 'Whose preference is reported, what is the reporting source, which drawing sessions does it apply to, which tool is favored over which, and what exact strength or uncertainty does the text express?',
    gold,
    checks: Object.entries(phrases).flatMap(([name, value]) => [check(`data.${name}.state`, 'known'), check(`data.${name}.value`, value, false)]),
    rubric: { required, forbidden: [...forbidden, 'Treat the preference as independently verified outside the attributed statement.', 'Declare overall prose or meaning preservation.'], acceptableUnknown: ['Whether the attributed preference holds in reality beyond this statement.'] },
    note,
  };
}

export const fixtures: Fixture[] = [
  {
    id: 'confirm-h31', mechanism: '01',
    sources: [{ id: 'src-j52', revision: 'r1', text: lending }, { id: 'src-f83', revision: 'r1', text: exhibition }],
    caller: { scopes: { 'repair-desk': 'repair desk', 'exhibition-hall': 'exhibition hall' }, states: live(['src-j52', 'src-f83']), populationComplete: true,
      limits: { chars: 900, maxRecords: 1, scanCap: 8, maxRecordChars: 1800 } },
    question: 'How long is a torque-wrench loan, how long may it be extended, and what approval condition must be met for that extension?',
    gold: { data: { records: [
      { sourceId: 'src-j52', claim: 'The repair desk lends torque wrenches for four days.', qualifications: ['Borrowers may extend a loan by two days only if a staff member approves before the due date.'], scope: 'repair-desk' },
      { sourceId: 'src-f83', claim: 'The exhibition hall displays local photographs.', qualifications: ['Its east entrance is closed during deliveries.'], scope: 'exhibition-hall' },
    ] }, evidence: [
      ...evidence('src-j52', lending, ['data.records.0.claim', 'data.records.0.qualifications.0', 'data.records.0.scope']),
      ...evidence('src-f83', exhibition, ['data.records.1.claim', 'data.records.1.qualifications.0', 'data.records.1.scope']),
    ], unknown: [] },
    checks: [check('data.records.0.scope', 'repair-desk', false), check('data.records.1.scope', 'exhibition-hall', false)],
    rubric: { required: ['The loan lasts four days.', 'An extension is for two days.', 'A staff member must approve before the due date.'],
      forbidden: ['Unconditional extensions.', 'Approval after the due date is sufficient.', 'A delivery closure changes wrench return or extension rules.', 'Every supplied record is included in the bounded view.'],
      acceptableUnknown: ['No number of permitted extensions or policy outside this source is established.'] },
    note,
  },
  {
    id: 'confirm-p84', mechanism: '02',
    sources: [{ id: 'src-e29', revision: 'r1', text: gateA }, { id: 'src-o64', revision: 'r1', text: gateB }],
    caller: { subjects: { gate: 'equipment gate' }, property: 'access-state', values: ['locked', 'unlocked'], days: ['Thursday', 'Saturday'],
      states: live(['src-e29', 'src-o64']), alignment: [{ id: 'alignment-q81', recordIds: ['src-e29', 'src-o64'], subject: 'gate', property: 'access-state', dimensions: ['day'] }] },
    task: 'Extract each equipment-gate access requirement and its applicable day for the supplied reviewed comparison.',
    question: 'What state does each note require for the equipment gate on which day, and do those requirements conflict in a shared day context?',
    gold: { data: { accounts: [
      { sourceId: 'src-e29', subject: 'gate', property: 'access-state', values: ['locked'], context: { day: { kind: 'set', values: ['Thursday'] } } },
      { sourceId: 'src-o64', subject: 'gate', property: 'access-state', values: ['unlocked'], context: { day: { kind: 'set', values: ['Saturday'] } } },
    ] }, evidence: [
      ...evidence('src-e29', gateA, ['data.accounts.0.subject', 'data.accounts.0.property', 'data.accounts.0.values', 'data.accounts.0.context.day']),
      ...evidence('src-o64', gateB, ['data.accounts.1.subject', 'data.accounts.1.property', 'data.accounts.1.values', 'data.accounts.1.context.day']),
    ], unknown: [] },
    checks: [check('data.accounts.0.subject', 'gate'), check('data.accounts.1.subject', 'gate'), check('data.accounts.0.values', ['locked']), check('data.accounts.1.values', ['unlocked']),
      check('data.accounts.0.context.day', { kind: 'set', values: ['Thursday'] }), check('data.accounts.1.context.day', { kind: 'set', values: ['Saturday'] })],
    rubric: { required: ['The gate must be locked on Thursday and unlocked on Saturday.', 'The day conditions are separate, so no shared-context conflict is established.'],
      forbidden: ['Both states are required on the same day.', 'The differing states alone prove a shared-context conflict.', 'Guarantees about other days.'], acceptableUnknown: ['Gate requirements on unmentioned days.'] },
    note,
  },
  {
    id: 'confirm-v26', mechanism: '02',
    sources: [{ id: 'src-i47', revision: 'r1', text: pumpA }, { id: 'src-s96', revision: 'r1', text: pumpB }],
    caller: { subjects: { pump: 'courtyard pump' }, property: 'operating-state', values: ['running', 'stopped'], days: ['Monday'],
      states: live(['src-i47', 'src-s96']), alignment: [{ id: 'alignment-l35', recordIds: ['src-i47', 'src-s96'], subject: 'pump', property: 'operating-state', dimensions: ['day'] }] },
    task: 'Extract each courtyard-pump operating requirement and its applicable day for the supplied reviewed comparison.',
    question: 'What state does each note require for the courtyard pump, on which day, and can both requirements be satisfied within their shared day context?',
    gold: { data: { accounts: [
      { sourceId: 'src-i47', subject: 'pump', property: 'operating-state', values: ['running'], context: { day: { kind: 'set', values: ['Monday'] } } },
      { sourceId: 'src-s96', subject: 'pump', property: 'operating-state', values: ['stopped'], context: { day: { kind: 'set', values: ['Monday'] } } },
    ] }, evidence: [
      ...evidence('src-i47', pumpA, ['data.accounts.0.subject', 'data.accounts.0.property', 'data.accounts.0.values', 'data.accounts.0.context.day']),
      ...evidence('src-s96', pumpB, ['data.accounts.1.subject', 'data.accounts.1.property', 'data.accounts.1.values', 'data.accounts.1.context.day']),
    ], unknown: [] },
    checks: [check('data.accounts.0.subject', 'pump'), check('data.accounts.1.subject', 'pump'), check('data.accounts.0.values', ['running']), check('data.accounts.1.values', ['stopped']),
      check('data.accounts.0.context.day', { kind: 'set', values: ['Monday'] }), check('data.accounts.1.context.day', { kind: 'set', values: ['Monday'] })],
    rubric: { required: ['The maintenance note requires running throughout Monday; the safety note requires stopped throughout Monday.', 'These requirements conflict in the same Monday context and cannot both be satisfied.'],
      forbidden: ['The day conditions are separate.', 'Inventing different Monday time slots to avoid the conflict.', 'Choosing one note as authoritative or resolving the conflict without evidence.'], acceptableUnknown: ['Which requirement should govern in practice.'] },
    note,
  },
  {
    id: 'confirm-d57', mechanism: '03', sources: [{ id: 'src-c15', revision: 'r1', text: conversation }],
    caller: { people: { selma: { label: 'Selma', identity: 'reviewed' }, tomas: { label: 'Tomas', identity: 'reviewed' } },
      places: { studio: 'pottery studio', counter: 'ticket counter' }, states: live(['src-c15']) },
    question: 'Who made the statement, whose preference was described and what was it, where did the conversation happen, and where was the note entered later?',
    gold: { data: { reports: [{ sourceId: 'src-c15', statement: 'Tomas prefers the firmer clay.', speaker: 'selma', subjects: ['tomas'], recordingLocation: 'counter', occasionSetting: 'studio' }] },
      evidence: evidence('src-c15', conversation, ['data.reports.0.statement', 'data.reports.0.speaker', 'data.reports.0.subjects.0', 'data.reports.0.recordingLocation', 'data.reports.0.occasionSetting']), unknown: [] },
    checks: [check('data.reports.0.speaker', 'selma'), check('data.reports.0.subjects', ['tomas']), check('data.reports.0.recordingLocation', 'counter'), check('data.reports.0.occasionSetting', 'studio')],
    rubric: { required: ['Selma made the statement about Tomas preferring the firmer clay.', 'The conversation occurred at the pottery studio.', 'The note was later entered at the ticket counter.'],
      forbidden: ['Tomas made the statement.', 'The conversation happened at the ticket counter.', 'Tomas was present for the conversation.'], acceptableUnknown: ['Whether Tomas attended the conversation.'] },
    note,
  },
  {
    id: 'confirm-m93', mechanism: '03', sources: [{ id: 'src-r58', revision: 'r1', text: unsigned }],
    caller: { people: {}, places: { kiosk: 'ticket kiosk' }, states: live(['src-r58']) },
    question: 'What choice is reported, who voiced it and who is it about, where did the sewing session take place, and where was the note entered?',
    gold: { data: { reports: [{ sourceId: 'src-r58', statement: 'They chose the heavier fabric.', speaker: null, subjects: null, recordingLocation: 'kiosk', occasionSetting: null }] },
      evidence: evidence('src-r58', unsigned, ['data.reports.0.statement', 'data.reports.0.recordingLocation']),
      unknown: ['data.reports.0.speaker', 'data.reports.0.subjects', 'data.reports.0.occasionSetting'] },
    checks: [check('data.reports.0.speaker', null), check('data.reports.0.subjects', null), check('data.reports.0.recordingLocation', 'kiosk'), check('data.reports.0.occasionSetting', null)],
    rubric: { required: ['The note reports that unidentified people chose the heavier fabric.', 'The speaker and the people denoted by they are unidentified.', 'The sewing-session location is unknown.', 'The note was entered at the ticket kiosk.'],
      forbidden: ['No people made the choice.', 'Nobody voiced the statement.', 'An empty subject set means unidentified subjects.', 'The sewing session occurred at the ticket kiosk.'],
      acceptableUnknown: ['Unknown identity or location does not establish absence.'] },
    note,
  },
  {
    id: 'confirm-t68', mechanism: '04', sources: [{ id: 'src-b72', revision: 'r1', text: planning }],
    caller: { participants: ['Asha', 'Bram'], places: ['reading alcove'], occasion: 'occasion-g19', asOf: 866, applicability: 'applies', retired: false,
      sourceStates: { 'src-b72': { revision: 'r1', available: true, eligible: true, validity: 'current' } } },
    task: 'Use the shared-afternoon recipe to find the earliest feasible 23-minute visit today. Current time is caller.asOf in minutes after midnight.',
    question: 'What quiet and seating requirements does each person have, when is each available, and where and during what earliest 23-minute window can they visit given the supplied current time? Clock times or minutes after midnight are acceptable.',
    gold: { data: {
      preferences: [{ participant: 'Asha', quiet: true, seating: false, sourceId: 'src-b72' }, { participant: 'Bram', quiet: false, seating: true, sourceId: 'src-b72' }],
      availability: [{ participant: 'Asha', windows: [[847, 911]], sourceId: 'src-b72' }, { participant: 'Bram', windows: [[859, 903]], sourceId: 'src-b72' }],
      places: [{ place: 'reading alcove', quiet: true, seating: true, open: true, sourceId: 'src-b72' }], minutes: { value: 23, sourceId: 'src-b72' },
    }, evidence: evidence('src-b72', planning, ['preferences.0.quiet', 'preferences.0.seating', 'preferences.1.quiet', 'preferences.1.seating', 'availability.0.windows', 'availability.1.windows', 'places.0.quiet', 'places.0.seating', 'places.0.open', 'minutes.value']), unknown: [] },
    checks: [check('data.preferences.0.quiet', true), check('data.preferences.0.seating', false), check('data.preferences.1.quiet', false), check('data.preferences.1.seating', true),
      check('data.availability.0.windows', [[847, 911]]), check('data.availability.1.windows', [[859, 903]]), check('data.minutes.value', 23)],
    rubric: { required: ['Asha requires quiet, has no seating requirement, and is available 14:07–15:11 (847–911).', 'Bram requires seating, has no quiet requirement, and is available 14:19–15:03 (859–903).',
      'The reading alcove is feasible during 14:26–14:49 (866–889), a 23-minute window beginning no earlier than the supplied current time.'],
      forbidden: ['Starting at 14:19 despite caller.asOf=866.', 'Swapping the availability intervals or requirements.', 'Claiming that no seating requirement means seating is forbidden.', 'Invented travel, booking, or closure facts.'],
      acceptableUnknown: ['The option remains tentative; there is no independent booking or live-opening verification.'] },
    note,
  },
  {
    id: 'confirm-c42', mechanism: '05', sources: [{ id: 'src-l38', revision: 'r1', text: event }, { id: 'src-z81', revision: 'r1', text: reflection }],
    caller: { people: ['Kato', 'Elin', 'Bex'], occasionId: 'occasion-p53', eventSourceId: 'src-l38', interpretationIds: { 'src-z81': 'account-n46' },
      entryPolicy: 'all-supplied-account-records', sourceStates: live(['src-l38', 'src-z81']) },
    question: 'What did each documented participant do, how did their work overlap, how was Bex connected to the activity, what did Bex think it illustrated, and is Bex’s attendance established?',
    gold: { data: { narrative: 'Kato replaced a spar and Elin patched a sail simultaneously at the same bench during a kite-repair session; they referred to instructions by Bex.',
      participants: [{ person: 'Kato', role: 'replaced a spar' }, { person: 'Elin', role: 'patched a sail' }], mentioned: ['Bex'], coPresence: [['Kato', 'Elin']],
      interpretations: [{ sourceId: 'src-z81', author: 'Bex', account: 'Their careful repairs were an example of patience.' }],
    }, evidence: [...evidence('src-l38', event, ['narrative', 'participants.0', 'participants.1', 'mentioned.0', 'coPresence.0']), ...evidence('src-z81', reflection, ['interpretations.0'])],
    unknown: ['Whether Bex attended is not established.'] },
    checks: [check('data.participants.0.person', 'Kato'), check('data.participants.1.person', 'Elin'), check('data.participants.length', 2), check('data.mentioned', ['Bex']), check('data.coPresence', [['Kato', 'Elin']]), check('data.interpretations.0.author', 'Bex')],
    rubric: { required: ['Kato replaced a spar and Elin patched a sail, simultaneously at the same bench.', 'Bex wrote the instructions they consulted and later supplied an interpretation.', 'Bex interpreted their careful repairs as an example of patience.', 'Bex’s attendance is unknown/not established.'],
      forbidden: ['Bex attended.', 'Bex was absent.', 'Writing instructions or a later reflection establishes participation.', 'Patience is an independently established event fact rather than Bex’s interpretation.'],
      acceptableUnknown: ['Whether Bex personally witnessed the repair session.'] },
    note,
  },
  annotatedText('confirm-r15', 'src-u13', 'old', textA, {
    subject: 'Ravi', attribution: 'Ravi wrote in his sketchbook', circumstance: 'For brief evening drawing sessions', modality: 'could favor', comparison: 'the charcoal pencil over the ink pen',
  }, ['Ravi is the subject and his sketchbook statement is the attribution.', 'For brief evening drawing sessions, Ravi could favor the charcoal pencil over the ink pen.', 'Could favor expresses a possible preference, not an established regular or certain preference.'],
  ['Drop brief or evening from the condition.', 'Replace could favor with an established or frequent preference.']),
  annotatedText('confirm-b76', 'src-w67', 'candidate', textB, {
    subject: 'Ravi', attribution: 'Ravi wrote in his sketchbook', circumstance: 'For brief evening drawing sessions', modality: 'could favor', comparison: 'the charcoal pencil over the ink pen',
  }, ['Ravi is the subject and his sketchbook statement is the attribution.', 'For brief evening drawing sessions, Ravi could favor the charcoal pencil over the ink pen.', 'Could favor expresses a possible preference, not an established regular or certain preference.'],
  ['Drop brief or evening from the condition.', 'Replace could favor with an established or frequent preference.']),
  annotatedText('confirm-n24', 'src-a92', 'candidate', textC, {
    subject: 'Ravi', attribution: 'Ravi wrote in his sketchbook', circumstance: 'For all drawing sessions', modality: 'often favor', comparison: 'the charcoal pencil over the ink pen',
  }, ['Ravi is the subject and his sketchbook statement is the attribution.', 'Across all drawing sessions, Ravi often favors the charcoal pencil over the ink pen.', 'Often expresses a frequent preference, not merely a possible preference and not a preference on every occasion.'],
  ['Restrict the condition to brief evening sessions.', 'Replace often with could or always.']),
];

export const pairs: { oldId: string; candidateId: string; expected: 'preserved' | 'changed' }[] = [
  { oldId: 'confirm-r15', candidateId: 'confirm-b76', expected: 'preserved' },
  { oldId: 'confirm-r15', candidateId: 'confirm-n24', expected: 'changed' },
];
