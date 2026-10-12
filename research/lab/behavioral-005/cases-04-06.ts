import type { StudyCase } from './contract';
import { instantiate, type Aid, type Slots, type SourceState } from '../../prototypes/04-operations/index';
import { jointOccasions, recallOccasion, type Occasion, type Population, type Sources } from '../../prototypes/05-experiences/index';
import { checkPresentation, CHECKER_VERSION, RULE, type CheckInput, type Fields } from '../../prototypes/06-transformations/index';

const copy = <T>(value: T): T => structuredClone(value);
const ref = (id: string) => ({ id, revision: 'v1' });
const episodeRef = (source: string) => ({ source, revision: 'v1' });
const sourceStates = (ids: string[]): Sources => Object.fromEntries(ids.map(id => [id, { available: true, eligible: true, revision: 'v1' }]));
const withChange = <T>(value: T, change: (v: T) => void): T => { const next = copy(value); change(next); return next; };

type OperationInput = { aid: Aid; supplied: Partial<Slots>; states: Record<string, SourceState>; asOf: number; applicability: 'applies' | 'doesNotApply' | 'unknown' };
function operation(prefix: string, people: string[], windows: [number, number][][], venue: string, minutes: number,
  requirements = { quiet: true, seating: true }): OperationInput {
  const occasion = `${prefix}-occasion`;
  const ids = people.flatMap((_, i) => [`${prefix}-p${i}`, `${prefix}-a${i}`]).concat([`${prefix}-venue`, `${prefix}-intention`]);
  return {
    aid: { recipe: 'shared-afternoon', participants: people, occasion,
      bindings: { preferences: people.map((participant, i) => ({ participant, occasion, ...requirements, source: ref(`${prefix}-p${i}`) })) } },
    supplied: { availability: people.map((participant, i) => ({ participant, occasion, windows: windows[i]!, source: ref(`${prefix}-a${i}`) })),
      places: [{ id: venue, quiet: true, seating: true, open: true, source: ref(`${prefix}-venue`) }],
      intention: { minutes, source: ref(`${prefix}-intention`) } },
    states: Object.fromEntries(ids.map(id => [id, { available: true, eligible: true, revision: 'v1', validity: 'current' }])),
    asOf: 0, applicability: 'applies',
  };
}

const o1 = operation('O1', ['Lina', 'Theo'], [[[540, 565], [580, 640]], [[550, 590], [610, 660]]], 'Willow room', 25);
o1.asOf = 480;
const o2 = operation('O2', ['Lina', 'Theo'], [[[540, 600]], [[550, 610]]], 'Reading room', 20);
o2.asOf = 480;
o2.supplied.availability = o2.supplied.availability!.filter(a => a.participant !== 'Theo');
const o3 = operation('O3', ['Ada', 'Ben'], [[[840, 900]], [[855, 915]]], 'Green room', 20);
o3.asOf = 780;
const o4 = operation('O4', ['Nia', 'Tari'], [[[600, 660]], [[600, 660]]], 'Courtyard bench', 10, { quiet: false, seating: true });
o4.asOf = 540;
o4.supplied.places![0]!.quiet = false;

type JointInput = { operation: 'joint'; people: string[]; occasions: Occasion[]; sources: Sources };
type RecallInput = { operation: 'recall'; occasionId: string; population: Population; sources: Sources };
const e1: RecallInput = {
  operation: 'recall', occasionId: 'harbor-evening', sources: sourceStates(['E1-event', 'E1-first', 'E1-later', 'E1-link']),
  population: {
    occasions: [{ id: 'harbor-evening', ref: episodeRef('E1-event'), narrative: 'Ari and Jo sat on the harbor wall after the choir rehearsal. They spent part of the evening without speaking.',
      participants: [{ person: 'Ari', role: 'companion' }, { person: 'Jo', role: 'companion' }], mentioned: [], coPresence: [['Ari', 'Jo']], time: 'first evening' }],
    interpretations: [
      { id: 'first-account', ref: episodeRef('E1-first'), occasion: { id: 'harbor-evening' }, question: { id: 'why-silence-helped', label: 'what the silence meant to Ari' }, author: 'Ari', account: 'I felt relieved because there was no conversation to keep up.', reflectionTime: 'that night', entry: true },
      { id: 'later-account', ref: episodeRef('E1-later'), occasion: { id: 'harbor-evening' }, question: { id: 'why-silence-helped', label: 'what the silence meant to Ari' }, author: 'Ari', account: 'I now think being allowed to say nothing was a form of trust; perhaps that was part of the relief.', reflectionTime: 'six weeks later', entry: false },
    ],
    revisits: [{ id: 'revisit', from: 'first-account', to: 'later-account', ref: episodeRef('E1-link'), account: 'Ari explicitly returns to the harbor evening and reconsiders why its silence brought relief.' }],
  },
};
const e2: JointInput = {
  operation: 'joint', people: ['Mira', 'Sam'], sources: sourceStates(['E2-event']),
  occasions: [{ id: 'story-circle', ref: episodeRef('E2-event'), narrative: 'Mira listened while a guest whose name sounded like Sam or Sami told a story.',
    participants: [{ person: 'Mira', role: 'listener' }, { person: null, role: 'storyteller', candidates: ['Sam', 'Sami'] }], mentioned: [], coPresence: [] }],
};
const e3: JointInput = {
  operation: 'joint', people: ['Mira', 'Dana'], sources: sourceStates(['E3-event']),
  occasions: [{ id: 'seed-exchange', ref: episodeRef('E3-event'), narrative: 'Mira and Rowan exchanged seeds and talked about Dana’s balcony garden.',
    participants: [{ person: 'Mira', role: 'seed sharer' }, { person: 'Rowan', role: 'seed sharer' }, { person: 'Dana', role: 'visitor' }],
    mentioned: ['Dana'], coPresence: [['Mira', 'Rowan']] }],
};
const e4: JointInput = {
  operation: 'joint', people: ['Tari', 'Nia'], sources: sourceStates(['E4-event']),
  occasions: [{ id: 'pottery-afternoon', ref: episodeRef('E4-event'), narrative: 'Tari shaped mug handles while Nia glazed the mugs beside him.',
    participants: [{ person: 'Tari', role: 'handle maker' }, { person: 'Nia', role: 'glazer' }], mentioned: [], coPresence: [['Tari', 'Nia']] }],
};

const known = (value: string) => ({ state: 'known' as const, value });
function fields(subject: string, attribution: string, circumstance: string, modality: string, comparison: string): Fields {
  return { subject: known(subject), attribution: known(attribution), circumstance: known(circumstance), modality: known(modality), comparison: known(comparison) };
}
function transformation(id: string, oldText: string, candidateText: string, annotation: Fields): CheckInput {
  const presentation = { id: `${id}-memory`, bytes: oldText, fields: copy(annotation), refs: [{ source: `${id}-original`, revision: 'v1', quote: oldText }], kind: 'preference', origin: 'personal' };
  return { old: presentation, candidate: { ...copy(presentation), bytes: candidateText }, sources: [{ id: `${id}-original`, revision: 'v1', bytes: oldText, eligible: true }],
    assumptions: [], rule: { ...RULE }, checkerVersion: CHECKER_VERSION, mode: 'free' };
}
const t1 = transformation('T1', 'Ravi: After a long journey, I often prefer an evening alone to a party.', 'After a long journey, Ravi always prefers an evening alone to a party.',
  fields('Ravi', 'Ravi self-report', 'after a long journey', 'often', 'an evening alone over a party'));
t1.candidate.fields.modality = known('always');
const t2 = transformation('T2', '', 'After evening classes, Elin usually prefers a walk to a bus ride.',
  fields('Elin', 'Elin self-report', 'after evening classes', 'usually', 'a walk over a bus ride'));
t2.old.bytes = null;
t2.old.fields = { subject: { state: 'unknown' }, attribution: { state: 'unknown' }, circumstance: { state: 'unknown' }, modality: { state: 'unknown' }, comparison: { state: 'unknown' } };
t2.sources[0]!.bytes = null;
const t3 = transformation('T3', 'Leah’s note: Owen told me, “After travel, I usually prefer a quiet cup of tea to a busy conversation.”', 'After travel, Leah usually prefers a quiet cup of tea to a busy conversation.',
  fields('Leah', 'Leah self-report', 'after travel', 'usually', 'a quiet cup of tea over a busy conversation'));
const t4 = transformation('T4', 'Nia: For unfamiliar recipes, I sometimes prefer sketching the steps to rereading the instructions.', 'Nia sometimes prefers sketching the steps to reading the instructions again when a recipe is unfamiliar.',
  fields('Nia', 'Nia self-report', 'unfamiliar recipes', 'sometimes', 'sketching the steps over rereading the instructions'));

export const cases: StudyCase[] = [
  {
    id: 'B04-01', proposal: '04', condition: 'useful', domain: 'shared creative planning',
    sources: [
      { id: 'O1-p0', text: 'For this sketching visit, Lina requires quiet and a seat.' },
      { id: 'O1-p1', text: 'For this sketching visit, Theo also requires quiet and a seat.' },
      { id: 'O1-a0', text: 'Lina is available today 09:00–09:25 and 09:40–10:40.' },
      { id: 'O1-a1', text: 'Theo is available today 09:10–09:50 and 10:10–11:00.' },
      { id: 'O1-venue', text: 'Willow room has seats and is quiet. Yesterday it was closed for painting; the caretaker confirms it reopened at 08:00 today and remains open until noon.' },
      { id: 'O1-intention', text: 'The sketching visit needs 25 uninterrupted minutes today. It is now 08:00. Choose the earliest feasible start; all times refer to the same day. Minute annotations count from midnight.' },
    ],
    question: 'Suggest the earliest feasible sketching visit for Lina and Theo, explaining the timing and any remaining limits on the suggestion.',
    input: o1,
    inputNote: 'The aid retains this occasion’s reviewed requirements. Availability, venue observations and duration complete it. Time coordinates are minutes after midnight. Source validity is a supplied annotation, not knowledge produced by the recipe.',
    annotation: {
      instructions: 'Classify whether the caretaker’s venue report is current for today’s visit. Read the dated statements about reopening; do not solve a timetable.',
      criteria: { A: 'The report establishes that the room remains closed or otherwise invalid for this visit.', B: 'The report establishes a current open venue observation for today’s visit.', U: 'The venue’s current status cannot be established from the records.' }, expected: 'B', field: 'states.O1-venue.validity',
      variants: { A: withChange(o1, x => { x.states['O1-venue']!.validity = 'invalid'; }), B: copy(o1), U: null },
    },
    rubric: {
      required: ['Offer Willow room at 10:10–10:35 as a tentative suggestion, the earliest shared continuous 25-minute interval.', 'Ground suitability in both participants’ quiet/seating requirements and the current reopening report; no booking has been made.'],
      forbidden: ['Choose 09:10 or 09:40 for a 25-minute visit despite insufficient overlap.', 'Say that yesterday’s closure proves the room is closed today.', 'Claim the visit is booked or that enjoyment is guaranteed.'], acceptableUnknown: ['Reservation or consent beyond the supplied requirements is not established.'],
      supportingRefs: ['O1-p0', 'O1-p1', 'O1-a0', 'O1-a1', 'O1-venue', 'O1-intention'],
    },
  },
  {
    id: 'B04-02', proposal: '04', condition: 'missing', domain: 'language practice',
    sources: [
      { id: 'O2-p0', text: 'Lina wants a quiet seat for this language-practice visit.' },
      { id: 'O2-p1', text: 'Theo also wants a quiet seat for this language-practice visit.' },
      { id: 'O2-a0', text: 'Lina can practice today 09:00–10:00.' },
      { id: 'O2-a1', text: 'Theo said only, “Perhaps after class.” No class end time or bounded availability was given. Last week he could do 09:10–10:10, but he explicitly said not to reuse last week’s time today.' },
      { id: 'O2-venue', text: 'The Reading room is open, quiet and has seats this morning.' },
      { id: 'O2-intention', text: 'They want 20 continuous minutes today. It is 08:00; time annotations count minutes after midnight.' },
    ],
    question: 'Can we select a supported time and place for today’s practice? Explain what can already be used and what still needs to be learned.',
    input: o2,
    inputNote: 'The source supplies no bounded current interval for Theo. The operation receives only Lina’s availability; a historical interval remains visible in source text but is not reused.',
    annotation: {
      instructions: 'Annotate whether Theo’s note supplies a bounded interval valid for today. Distinguish an explicit current interval from a withdrawn historical one; do not select a meeting time.',
      criteria: { A: 'No bounded current interval is supplied; leave Theo’s availability slot unfilled.', C: 'Theo’s 09:10–10:10 interval is explicitly valid for today and can be represented.', U: 'The records are insufficient to determine whether the stated interval is current.' }, expected: 'A', field: 'supplied.availability (Theo record)',
      variants: { A: copy(o2), C: withChange(o2, x => { x.supplied.availability!.push({ participant: 'Theo', occasion: x.aid.occasion, windows: [[550, 610]], source: ref('O2-a1') }); }), U: null },
    },
    rubric: {
      required: ['A supported shared time cannot yet be selected because Theo’s current bounded availability is missing.', 'The Reading room fits the stated venue requirements and Lina’s 09:00–10:00 interval is available; obtain Theo’s current interval before scheduling.'],
      forbidden: ['Use last week’s 09:10–10:10 availability as today’s.', 'Invent a class end time.', 'Assert that no feasible shared time exists rather than that it is unknown.'], acceptableUnknown: ['Whether a 20-minute overlap exists remains unknown.'],
      supportingRefs: ['O2-a0', 'O2-a1', 'O2-venue', 'O2-intention'],
    },
  },
  {
    id: 'B04-03', proposal: '04', condition: 'misleading', domain: 'reading together',
    sources: [
      { id: 'O3-p0', text: 'For today’s reading visit Ada requires quiet and a seat.' },
      { id: 'O3-p1', text: 'Ben requires quiet and a seat for the same visit.' },
      { id: 'O3-a0', text: 'Ada is available 14:00–15:00 today.' },
      { id: 'O3-a1', text: 'Ben is available 14:15–15:15 today.' },
      { id: 'O3-venue', text: 'The Green room is open and has seats. It used to be quiet, but today a drum group is rehearsing there throughout 14:00–16:00 and the caretaker describes it as loud. No other venue has been checked.' },
      { id: 'O3-intention', text: 'The visit needs 20 continuous minutes today; it is 13:00. Time annotations are minutes after midnight.' },
    ],
    question: 'What plan, if any, is supported for Ada and Ben today, and what should we do next?',
    input: o3,
    inputNote: 'The supplied Green room quiet=true annotation is fallible; compare all input annotations with source text. The recipe itself cannot read or repair that annotation.',
    annotation: {
      instructions: 'Annotate the Green room’s quietness during the stated visit period using its current observation rather than its history.',
      criteria: { A: 'The Green room is observed quiet during the visit period.', C: 'The Green room is observed not quiet during the visit period.', U: 'The records leave current quietness unknown.' }, expected: 'C', field: 'supplied.places[0].quiet',
      variants: { A: copy(o3), C: withChange(o3, x => { x.supplied.places![0]!.quiet = false; }), U: null },
    },
    rubric: {
      required: ['There is time overlap for a 20-minute visit, such as 14:15–14:35, but no supported venue satisfies their quiet requirement.', 'Reject the Green room as a suitable quiet venue during rehearsal and obtain another venue observation before recommending a complete plan.'],
      forbidden: ['Recommend the Green room as a suitable quiet venue based on its quiet=true annotation or a generated option.', 'Say there is no time overlap.', 'Claim no suitable venue exists anywhere merely because no other venue was checked.'], acceptableUnknown: ['A suitable alternative venue remains unknown.'],
      supportingRefs: ['O3-p0', 'O3-p1', 'O3-a0', 'O3-a1', 'O3-venue', 'O3-intention'],
    },
  },
  {
    id: 'B04-04', proposal: '04', condition: 'ordinary', domain: 'neighborly catch-up',
    sources: [
      { id: 'O4-p0', text: 'Nia wants a seat for today’s catch-up and says background noise is fine.' },
      { id: 'O4-p1', text: 'Tari also wants a seat and says quiet is not needed today.' },
      { id: 'O4-a0', text: 'Nia is free 10:00–11:00 today.' },
      { id: 'O4-a1', text: 'Tari is free 10:00–11:00 today.' },
      { id: 'O4-venue', text: 'The Courtyard bench is accessible and has seats. The courtyard is noisy today.' },
      { id: 'O4-intention', text: 'Choose the earliest 10-minute catch-up today. It is 09:00. Time annotations count minutes after midnight.' },
    ],
    question: 'Suggest a simple catch-up arrangement for Nia and Tari from these notes.',
    input: o4,
    inputNote: 'This deliberately simple case can be answered directly. The optional annotation job represents today’s quiet requirement for both participants; it does not infer a permanent preference.',
    annotation: {
      instructions: 'Annotate the participants’ stated quiet requirement for this occasion only. Use explicit statements about noise, not what people usually want.',
      criteria: { C: 'Both participants require quiet for this occasion.', B: 'Neither participant requires quiet for this occasion.', U: 'Their quiet requirements are not established.' }, expected: 'B', field: 'aid.bindings.preferences[*].quiet',
      variants: { C: withChange(o4, x => { x.aid.bindings.preferences!.forEach(p => { p.quiet = true; }); }), B: copy(o4), U: null },
    },
    rubric: {
      required: ['Suggest the Courtyard bench for 10:00–10:10, tentatively.', 'Recognize that its noise does not violate either participant’s stated requirements today.'],
      forbidden: ['Reject the bench merely because it is noisy.', 'Abstain from any suggestion despite complete evidence.', 'Turn today’s tolerance of noise into a permanent trait.'], acceptableUnknown: ['The suggestion is not a reservation or completed agreement.'],
      supportingRefs: ['O4-p0', 'O4-p1', 'O4-a0', 'O4-a1', 'O4-venue', 'O4-intention'],
    },
  },
  {
    id: 'B05-01', proposal: '05', condition: 'useful', domain: 'friendship and reflection',
    sources: [
      { id: 'E1-event', text: 'Ari’s diary: After choir rehearsal Jo and I sat together on the harbor wall. We spent part of the evening without speaking.' },
      { id: 'E1-first', text: 'Ari, that night, on why the harbor silence helped: “I felt relieved because there was no conversation to keep up.”' },
      { id: 'E1-later', text: 'Ari, six weeks later: “I now think being allowed to say nothing was a form of trust; perhaps that was part of the relief.”' },
      { id: 'E1-link', text: 'Ari introduces the later paragraph: “I am returning to that harbor evening with Jo, and to the same question I wrote about that night: why did its silence bring me relief?” Jo’s own feelings are not recorded.' },
    ],
    question: 'How did Ari understand that evening at the time and later? Preserve what changed and what we cannot attribute to other people.',
    input: e1,
    inputNote: 'The later account is a non-entry interpretation reached through a source-bearing revisit link. Jev’s bounded annotation is alignment of the later account’s local question, not whether its interpretation is true.',
    annotation: {
      instructions: 'Classify whether the later paragraph explicitly addresses the same local question as Ari’s first account. Use the introduction linking the two passages; do not evaluate the reflection’s truth.',
      criteria: { A: 'The later paragraph addresses a different local question from why the harbor silence brought relief.', B: 'The later paragraph explicitly revisits the same local question about that harbor silence.', U: 'The local question identity cannot be resolved from the passages.' }, expected: 'B', field: 'population.interpretations[1].question.id',
      variants: { A: withChange(e1, x => { x.population.interpretations[1]!.question.id = 'different-question'; }), B: copy(e1), U: null },
    },
    rubric: {
      required: ['Preserve the first account: Ari felt relief from not having to sustain conversation.', 'Preserve the later, tentative interpretation: being allowed to say nothing may have represented trust and contributed to that relief.', 'Attribute both accounts to Ari at their distinct reflection times; Jo’s own feelings are not established.'],
      forbidden: ['Replace the first account with the later one as an objectively corrected final truth.', 'Say both Ari and Jo felt trust or relief.', 'Claim that the checked link proves trust caused the relief.'], acceptableUnknown: ['Jo’s feelings and the objective cause of Ari’s relief remain unestablished.'],
      supportingRefs: ['E1-event', 'E1-first', 'E1-later', 'E1-link'],
    },
  },
  {
    id: 'B05-02', proposal: '05', condition: 'missing', domain: 'community storytelling',
    sources: [{ id: 'E2-event', text: 'Mira’s note: I attended the story circle and listened to the guest storyteller. I could not hear the introduction clearly; the name sounded like Sam or Sami. I have no further identification.' }],
    question: 'What can we establish about whether Mira and Sam took part in the same story circle?',
    input: e2,
    inputNote: 'The guest’s identity is unresolved between Sam and Sami. Missing identity evidence is not evidence that Sam was absent.',
    annotation: {
      instructions: 'Resolve the guest storyteller’s identity only if the note supports one name. Do not select a candidate merely because it is listed first.',
      criteria: { A: 'The note establishes that the storyteller was Sam.', B: 'The note establishes that the storyteller was Sami.', U: 'The note leaves Sam versus Sami unresolved.' }, expected: 'U', field: 'occasions[0].participants[1].person',
      variants: { A: withChange(e2, x => { x.occasions[0]!.participants[1]!.person = 'Sam'; }), B: withChange(e2, x => { x.occasions[0]!.participants[1]!.person = 'Sami'; }), U: null },
    },
    rubric: {
      required: ['Mira attended as a listener and an unidentified guest told a story.', 'Sam’s participation is unresolved because the note cannot distinguish Sam from Sami.'],
      forbidden: ['Confirm that Sam was the storyteller or attended.', 'Assert that Sam was absent.', 'Resolve the identity from the order of candidate names.'], acceptableUnknown: ['The storyteller’s exact identity and Sam’s attendance remain unknown.'],
      supportingRefs: ['E2-event'],
    },
  },
  {
    id: 'B05-03', proposal: '05', condition: 'misleading', domain: 'gardening friendships',
    sources: [{ id: 'E3-event', text: 'Rowan’s journal: Mira and I sat together exchanging seeds. We talked about Dana’s balcony garden. This entry records no arrival, participation or presence for Dana; it only records our conversation about the garden.' }],
    question: 'What does the record support about Dana’s involvement in the seed exchange with Mira?',
    input: e3,
    inputNote: 'The supplied participant list includes a fallible Dana=visitor annotation. Participation and mention are different; the prototype cannot verify the annotation against prose.',
    annotation: {
      instructions: 'Classify the evidence about Dana in the seed-exchange entry, distinguishing explicit participation from being discussed. This classification is about what is recorded, not proof of real-world absence.',
      criteria: { A: 'The entry explicitly supports Dana’s participation.', C: 'Dana is discussed, but the entry supplies no attendance evidence for Dana.', U: 'It is not possible to determine what the entry records about Dana.' }, expected: 'C', field: 'occasions[0].participants (Dana record)',
      variants: { A: copy(e3), C: withChange(e3, x => { x.occasions[0]!.participants = x.occasions[0]!.participants.filter(p => p.person !== 'Dana'); }), U: null },
    },
    rubric: {
      required: ['Mira and Rowan exchanged seeds; Dana’s balcony garden was discussed.', 'Dana’s attendance or participation is not established by this entry, despite the supplied visitor annotation.'],
      forbidden: ['Say Dana participated because the annotated occasion lists Dana.', 'Say Dana was definitely absent.', 'Invent a separate exchange between Dana and Mira.'], acceptableUnknown: ['Dana’s actual whereabouts and attendance are unknown.'],
      supportingRefs: ['E3-event'],
    },
  },
  {
    id: 'B05-04', proposal: '05', condition: 'ordinary', domain: 'creative hobby',
    sources: [{ id: 'E4-event', text: 'Pottery afternoon note: Tari and Nia sat together at the same worktable. Tari shaped the mug handles while Nia applied glaze to the mugs.' }],
    question: 'Remind me what Nia did at the pottery afternoon and whom she worked alongside.',
    input: e4,
    inputNote: 'Ordinary source recall already answers this. The optional source annotation classifies Nia’s role; it does not create another event or infer feelings.',
    annotation: {
      instructions: 'Identify Nia’s role in the recorded pottery activity. Attribute the two actions to their stated people.',
      criteria: { A: 'Nia applied glaze.', B: 'Nia shaped the handles.', U: 'Nia’s activity is not established.' }, expected: 'A', field: 'occasions[0].participants[1].role',
      variants: { A: copy(e4), B: withChange(e4, x => { x.occasions[0]!.participants[1]!.role = 'handle maker'; }), U: null },
    },
    rubric: {
      required: ['Nia glazed the mugs while working beside Tari, who shaped the handles.'],
      forbidden: ['Swap Nia’s and Tari’s activities.', 'Say participation is unknown despite the direct note.', 'Invent a second occasion or an unrecorded emotional response.'], acceptableUnknown: [], supportingRefs: ['E4-event'],
    },
  },
  {
    id: 'B06-01', proposal: '06', condition: 'useful', domain: 'personal recovery preferences',
    sources: [{ id: 'T1-original', text: t1.old.bytes! }, { id: 'T1-candidate', text: `Proposed replacement text: ${t1.candidate.bytes}` }],
    question: 'Should this proposed replacement stand as a faithful restatement of the original memory? Explain any necessary correction.',
    input: t1,
    inputNote: 'The checker compares named supplied fields and source quote presence. Both presentations are free prose; even accurate field comparison is not a semantic guarantee.',
    annotation: {
      instructions: 'Annotate the frequency qualifier explicitly written in the proposed replacement. Do not decide whether the replacement is acceptable.',
      criteria: { A: 'The candidate says often.', B: 'The candidate says always.', U: 'No frequency qualifier can be resolved in the candidate.' }, expected: 'B', field: 'candidate.fields.modality',
      variants: { A: withChange(t1, x => { x.candidate.fields.modality = known('often'); }), B: copy(t1), U: null },
    },
    rubric: {
      required: ['Reject the strengthening from often to always and retain the original often qualification.', 'Keep the circumstance after a long journey and the comparison of an evening alone with a party.'],
      forbidden: ['Accept always as equivalent to often.', 'Turn the situated preference into a dislike of all parties.', 'Claim the machine check establishes the truth of Ravi’s preference or validates all prose.'], acceptableUnknown: ['The preference is Ravi’s supplied self-report, not independent evidence of behavior.'], supportingRefs: ['T1-original', 'T1-candidate'],
    },
  },
  {
    id: 'B06-02', proposal: '06', condition: 'missing', domain: 'commuting recollection',
    sources: [
      { id: 'T2-archive-note', text: 'The earlier Elin note is unavailable. Neither its wording nor a reliable summary of its qualifications was retained. A new draft exists, but it must not be treated as a quotation of the missing note.' },
      { id: 'T2-candidate', text: `Proposed replacement text: ${t2.candidate.bytes}` },
    ],
    question: 'What can we conclude about whether this draft preserves the earlier memory, and what is needed to settle that?',
    input: t2,
    inputNote: 'Old presentation bytes, source bytes and all old field values are unavailable/unknown. The candidate is visible, but cannot supply evidence about the missing original.',
    annotation: {
      instructions: 'Annotate the missing original note’s frequency qualifier only from evidence about that original. Do not copy the new draft’s qualifier backward.',
      criteria: { A: 'The original’s qualifier was often.', B: 'The original’s qualifier was usually.', U: 'The original’s qualifier cannot be established from the retained records.' }, expected: 'U', field: 'old.fields.modality',
      variants: { A: withChange(t2, x => { x.old.fields.modality = known('often'); }), B: withChange(t2, x => { x.old.fields.modality = known('usually'); }), U: null },
    },
    rubric: {
      required: ['Preservation of the earlier memory cannot be established because the original wording and qualifications are unavailable.', 'The visible draft says Elin usually prefers a walk to a bus ride after evening classes; present that only as the draft’s content.', 'Recover the original or another reliable source about it before deciding fidelity.'],
      forbidden: ['Infer the old memory’s modality or scope from the candidate.', 'Certify preservation from matching IDs or incomplete check results.', 'Declare a particular semantic distortion proven without original evidence.'], acceptableUnknown: ['Whether the draft is faithful, and what the earlier note actually said, remain unknown.'], supportingRefs: ['T2-archive-note', 'T2-candidate'],
    },
  },
  {
    id: 'B06-03', proposal: '06', condition: 'misleading', domain: 'reported personal preferences',
    sources: [{ id: 'T3-original', text: t3.old.bytes! }, { id: 'T3-candidate', text: `Proposed replacement text: ${t3.candidate.bytes}` }],
    question: 'Review this proposed restatement. Whose preference is supported, and is the draft faithful enough to retain?',
    input: t3,
    inputNote: 'Both supplied field records identify Leah as the experiencer, a fallible shared annotation. Equality can preserve the same annotation error on both sides. Source text governs attribution.',
    annotation: {
      instructions: 'Identify whose preference is reported in the original and preserve the reporting chain. Distinguish the note’s writer from the person whose speech it quotes; do not grade the draft.',
      criteria: { C: 'The original directly reports Leah’s own preference.', A: 'The original reports Owen’s preference through Leah’s note.', U: 'The original does not resolve whose preference is described.' }, expected: 'A', field: 'old.fields.{subject,attribution}',
      variants: { C: copy(t3), A: withChange(t3, x => { x.old.fields.subject = known('Owen'); x.old.fields.attribution = known('Owen self-report conveyed by Leah'); }), U: null },
    },
    rubric: {
      required: ['The source supports Owen’s reported preference, conveyed by Leah; it does not establish Leah’s own preference.', 'Reject or correct the candidate’s transfer of the preference to Leah while preserving after travel, usually, and the tea-versus-busy-conversation comparison.'],
      forbidden: ['Accept the draft because matching annotations or field checks agree.', 'Treat Leah’s authorship as evidence that she holds Owen’s preference.', 'Present the source as direct observation of Owen’s behavior.'], acceptableUnknown: ['Leah’s own preference remains unknown.'], supportingRefs: ['T3-original', 'T3-candidate'],
    },
  },
  {
    id: 'B06-04', proposal: '06', condition: 'ordinary', domain: 'learning recipes',
    sources: [{ id: 'T4-original', text: t4.old.bytes! }, { id: 'T4-candidate', text: `Proposed replacement text: ${t4.candidate.bytes}` }],
    question: 'Is this rewording a reasonable faithful restatement? Explain your judgment in terms of what the two texts actually say.',
    input: t4,
    inputNote: 'The prose is a straightforward faithful paraphrase. The optional source-annotation job supplies the recipe circumstance; the structural checker is not required to understand or approve the prose.',
    annotation: {
      instructions: 'Annotate the circumstance to which Nia’s original preference applies. Do not broaden it beyond the wording.',
      criteria: { A: 'The preference is stated for all recipes without a familiarity condition.', C: 'The preference is stated for unfamiliar recipes.', U: 'The original’s circumstance cannot be resolved.' }, expected: 'C', field: 'old.fields.circumstance',
      variants: { A: withChange(t4, x => { x.old.fields.circumstance = known('all recipes'); }), C: copy(t4), U: null },
    },
    rubric: {
      required: ['Accept it as a reasonable faithful paraphrase based on reading the texts.', 'Recognize the retained sometimes qualification, unfamiliar-recipe circumstance, and sketching-versus-rereading comparison.'],
      forbidden: ['Reject or abstain solely because free prose is outside the machine checker’s semantic guarantee.', 'Claim the structural checker proves arbitrary prose equivalence.', 'Generalize the preference to every recipe or every occasion.'], acceptableUnknown: [], supportingRefs: ['T4-original', 'T4-candidate'],
    },
  },
];

/** Execute the existing prototypes; this adapter performs no inference or writes. */
export function execute(caseId: string, input: any): unknown {
  const row = cases.find(c => c.id === caseId);
  if (!row) throw new Error(`Unknown case: ${caseId}`);
  if (row.proposal === '04') return instantiate(input.aid, input.supplied, input.states, input.asOf, input.applicability);
  if (row.proposal === '05') {
    if (input.operation === 'joint') return jointOccasions(input.people, input.occasions, input.sources);
    if (input.operation === 'recall') return recallOccasion(input.occasionId, input.population, input.sources);
    throw new Error(`Unknown experience operation: ${input.operation}`);
  }
  return checkPresentation(input);
}
