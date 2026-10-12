/** Exhibition data comes from the actual research functions; no inference or living memory. */
import { makeView, type View } from '../prototypes/01-views/index.ts';
import * as V from '../prototypes/01-views/fixtures.ts';
import { checkJoint, compareContexts, pairwiseChecks } from '../prototypes/02-compatibility/index.ts';
import * as C from '../prototypes/02-compatibility/fixtures.ts';
import { composeReports } from '../prototypes/03-relations/index.ts';
import { fixture as relationFixture } from '../prototypes/03-relations/fixtures.ts';
import { instantiate, retireAid } from '../prototypes/04-operations/index.ts';
import { fixture as operationFixture } from '../prototypes/04-operations/fixtures.ts';
import { jointOccasions, recallOccasion } from '../prototypes/05-experiences/index.ts';
import * as H from '../prototypes/05-experiences/fixtures.ts';
import { checkPresentation, FIELD_NAMES } from '../prototypes/06-transformations/index.ts';
import * as K from '../prototypes/06-transformations/fixtures.ts';

export function createExhibits() {
  const narrow = makeView(V.records, V.sources, V.family, { ...V.limits, chars: 470 });
  const wide = makeView(V.records, V.sources, V.family, V.limits);
  if (narrow.kind !== 'view' || wide.kind !== 'view') throw Error('View fixture refused');
  const pair = checkJoint(C.binary, C.triangle.slice(0, 2), 8);
  const joint = checkJoint(C.binary, C.triangle, 8);
  if (pair.status !== 'compatible' || joint.status !== 'conflict') throw Error('Constraint fixture changed');
  const relation = relationFixture();
  const by = composeReports(relation.records, { select: 'by', person: 'mira', project: 'occasionSetting' }, relation.sources);
  const about = composeReports(relation.records, { select: 'about', person: 'mira', project: 'occasionSetting' }, relation.sources);
  const op = operationFixture();
  const supplied = { availability: op.inputs.availability, places: op.inputs.places, intention: op.inputs.intention };
  const ready = instantiate(op.aid, supplied, op.states, op.asOf, 'applies');
  const missing = instantiate(op.aid, { ...supplied, availability: op.inputs.availability.slice(0, 1) }, op.states, op.asOf, 'applies');
  if (!('options' in ready) || missing.status !== 'missing') throw Error('Operation fixture changed');
  const people = ['narrator', 'Mira', 'Noor'];
  const shared = jointOccasions(people, [H.dinner], H.sources);
  const pairs = jointOccasions(people, H.pairs, H.sources);
  if (shared.status !== 'ok' || pairs.status !== 'ok') throw Error('Experience fixture refused');
  const faithful = checkPresentation(K.faithful);
  const changed = checkPresentation(K.changedField('modality', { state: 'known', value: 'always' }));
  const proseInput = { ...structuredClone(K.faithful), mode: 'free' as const };
  proseInput.candidate.bytes = K.expected.misleadingProse;
  const free = checkPresentation(proseInput);
  if (faithful.status !== 'checked' || changed.status !== 'checked' || free.status !== 'checked') throw Error('Transformation fixture refused');
  const viewLines = (v: View) => v.text.split('\n').filter(x => x.startsWith('[')).map(x => x.replace(/^\[[^\]]+\] /, ''));
  return [
    {
      id: '01', title: 'Coordinated views', verb: 'Choose the right detail', question: 'How little can we show without changing the meaning?',
      premise: '“Mira prefers quiet” is incomplete. She said it about reading. The qualification belongs with the claim, even in a small memory view.',
      mechanism: 'A sliding aperture over source cards. Opening it reveals more cards; closing it never rewrites what a card says.',
      benefit: 'A compact, inspectable selection that keeps qualifications and disagreement references attached, while saying what was omitted.',
      where: 'A possible optional reader at recall or wake. Circadian already has scope and budget selection; this adds explicit preservation and coverage rules.',
      math: 'Restriction and expansion: choose a subset, then reopen its source. A fixed ordering makes a larger budget keep the prefix already shown.',
      limit: 'The prototype selects whole annotated records. It has not learned when to expand, built a hierarchy of summaries, or demonstrated better model recall.',
      states: [
        { key: 'a', label: 'Small window', readout: `${narrow.includedRefs.length} shown · ${narrow.omittedCount} omitted`, title: 'Less room; the qualification stays.', explanation: 'The reading condition and unresolved disagreement travel with the first claim. Other eligible records are counted as omitted.', inputs: ['Family records only', '470-character complete-output budget', 'At most two records'], lines: viewLines(narrow), raw: narrow },
        { key: 'b', label: 'Larger window', readout: `${wide.includedRefs.length} shown · ${wide.omittedCount} omitted`, title: 'More room; more of the same evidence.', explanation: 'The second source now fits. The first is retained. A third eligible record is still omitted by the two-record cap.', inputs: ['The same family records', '2,000-character complete-output budget', 'The same two-record cap'], lines: viewLines(wide), raw: wide },
      ],
      extra: { note: 'These budgets count the complete serialized output in JavaScript character units, not model tokens. Source references remain available; expansion rechecks current availability, eligibility and revision.' },
    },
    {
      id: '02', title: 'Contextual compatibility', verb: 'Keep the circumstances', question: 'Can these accounts fit together under the same conditions?',
      premise: 'Quiet for reading and lively for dancing can both be right. A comparison must first ask whether the circumstances even overlap.',
      mechanism: 'A fitting jig with coded bars. Two bars can fit; adding the third can make the complete assembly impossible.',
      benefit: 'Separate situated differences from genuine structured conflicts, and detect combinations that pairwise checks miss.',
      where: 'An optional comparison over recalled evidence or a consolidation candidate. It would supplement Circadian’s existing contradiction records.',
      math: 'Joint consistency: find one assignment satisfying every declared condition. A witness means the encoded conditions can coexist; it does not prove reality.',
      limit: 'A person or future model must supply the meanings and context. Incorrect annotations can still be internally consistent. A search cap returns unknown.',
      states: [
        { key: 'a', label: 'Two conditions', readout: `${pair.assignmentsExamined} assignment checked · fits`, title: 'A = B and B = C can coexist.', explanation: `One witness is A=${pair.witness.A}, B=${pair.witness.B}, C=${pair.witness.C}. Think of three decisions choosing between options 0 and 1.`, inputs: ['A chooses the same option as B', 'B chooses the same option as C', 'Each choice is 0 or 1'], lines: ['One complete assignment satisfies both conditions.'], raw: pair },
        { key: 'b', label: 'Add the third', readout: `${joint.assignmentsExamined} assignments checked · no fit`, title: 'Now also require A ≠ C.', explanation: 'Every pair of these three conditions can fit. All three together cannot. The checker examines all eight assignments before returning conflict.', inputs: ['A = B', 'B = C', 'A ≠ C'], lines: ['No assignment satisfies the complete set.', 'This verdict applies to these encoded conditions.'], raw: joint },
      ],
      extra: { note: 'The same prototype keeps the reading and dancing preferences separate. It also refuses to ignore a relevant context dimension missing from the comparison.', raw: { contextualAccounts: compareContexts(C.readingDance, [C.group(C.readingDance, ['activity'])], C.states(C.readingDance)), allPairwiseChecks: pairwiseChecks(C.binary, C.triangle, 8) } },
    },
    {
      id: '03', title: 'Typed relations', verb: 'Follow justified connections', question: 'Who said it—and who was it about?',
      premise: 'Noor saying something about Mira does not make it Mira’s self-report. Nor does the place where a note was written become the place where the event happened.',
      mechanism: 'A sorting jig with separate channels for speaker and subject. Choosing a channel follows a different relationship through the same cards.',
      benefit: 'Answer a relationship question while carrying the supporting path, source references, unresolved identities and inconsistencies into the answer.',
      where: 'An optional structured query beside ordinary recall. The current lexical/entity index does not by itself define these speaker/subject rules.',
      math: 'Typed composition: join only relationships with the required roles. Check an equation only when the caller declared that two paths should agree.',
      limit: 'The roles and identities are supplied annotations. A normal typed join answers the same positive query; the additional value here is the explicit evidence and boundary reporting.',
      states: [
        { key: 'a', label: 'Said by Mira', readout: `${by.rows.length} supported reports`, title: 'Follow the speaker channel.', explanation: 'The garden and library reports include an attribution to Mira. The café report was attributed to Noor.', inputs: ['Select speaker: Mira', 'Return the occasion setting', 'Keep evidence paths'], lines: by.rows.map(r => `${r.setting}: “${r.statement}”`), raw: by },
        { key: 'b', label: 'About Mira', readout: `${about.rows.length} supported reports`, title: 'Follow the subject channel.', explanation: 'The café report now belongs in the result because it concerns Mira. Its speaker still remains Noor.', inputs: ['Select subject: Mira', 'Return the occasion setting', 'The same supplied records'], lines: about.rows.map(r => `${r.setting}: “${r.statement}”`), raw: about },
      ],
      extra: { note: 'A relationship path explains how an answer was obtained. It does not certify that the original speaker was truthful or that a repeated report becomes a permanent trait.' },
    },
    {
      id: '04', title: 'Reusable operations', verb: 'Reuse what is already settled', question: 'What can we prepare once—and what must be fresh?',
      premise: 'Planning a quiet afternoon may reuse known preferences. Today’s calendars and whether a place is open still need fresh evidence.',
      mechanism: 'An assembly fixture holds the already-fitted pieces. A missing input leaves a visible empty slot; the fixture cannot manufacture it.',
      benefit: 'Store a specialization of a known operation, expose its remaining inputs, reject stale/conflicting bindings, and retire the aid without deleting its source experience.',
      where: 'An optional aid during a relevant task. This is a small data record for a known recipe, not a new workflow language or mandatory startup step.',
      math: 'Partial application: fixing some inputs leaves a smaller job. Completing that job must agree with running the whole function on the same inputs.',
      limit: 'One known planning recipe is implemented. Automatic mnemonic invention, learning which aid is useful, and actual time/cost savings have not been demonstrated.',
      states: [
        { key: 'a', label: 'All inputs supplied', readout: `${ready.options[0].window[1] - ready.options[0].window[0]}-minute tentative option`, title: 'Reuse preferences; supply today’s facts.', explanation: 'The supplied calendars overlap and the place observations fit. The result proposes a 15-minute window at place G, using fixture-relative minutes.', inputs: ['Bound: quiet + seating preferences', 'Fresh: both calendars and place observations', 'Intention: 15 minutes'], lines: ready.options.map(o => `Place ${o.place} · minute ${o.window[0]} to ${o.window[1]} · tentative`), raw: ready },
        { key: 'b', label: 'Remove one calendar', readout: `${missing.slots.length} missing input · no invented plan`, title: 'The gap stays a gap.', explanation: 'Removing Noor’s availability produces a named missing input. The stored preferences do not authorize a guessed appointment.', inputs: ['Same stored preferences', 'Mira’s calendar only', 'Same place and intention'], lines: missing.slots.map(s => `Needed: ${s.replace('.', ' · ')}`), raw: missing },
      ],
      extra: { note: 'Your temporary mnemonic fits this direction: keep an aid while it helps, check whether it applies, retire it when it stops helping. This prototype does not measure usefulness decay or invent a mnemonic.', raw: instantiate(retireAid(op.aid), supplied, op.states, op.asOf, 'applies') },
    },
    {
      id: '05', title: 'Joint experiences', verb: 'Keep the event—and its retellings', question: 'Were we together, or did we merely meet in pairs?',
      premise: 'You, Mira and Noor sharing one dinner is different from three separate pair meetings. Later interpretations are also different from new events or new attendance.',
      mechanism: 'An album clasp holds participant tabs on a shared page. Three pair pages do not turn into a single shared page merely because everyone appears somewhere.',
      benefit: 'Represent who participated in one occasion, retain distinct attributed interpretations, and follow checked links without silently hiding omitted accounts.',
      where: 'Optional enrichment beside committed episodes and their later recollections. The original episode remains the source; the addition supplies event and interpretation relationships.',
      math: 'Incidence and shared boundaries: membership in one event is a multi-person relation. A reinterpretation link must preserve the occasion and the local question it revisits.',
      limit: 'Occasion IDs and interpretation links are supplied. This does not infer attendance, discover unknown links, or prove that retrieval is better than direct occasion lookup.',
      states: [
        { key: 'a', label: 'One shared dinner', readout: `${shared.matches.length} jointly supported occasion`, title: 'All three belong to the same occasion.', explanation: 'The dinner fixture supplies all three participants and an explicit co-presence group. Roles stay attached: Noor cooked; the others were guests.', inputs: ['One dinner record', 'Narrator, Mira and Noor participated', 'Shared presence explicitly supplied'], lines: shared.matches.flatMap(m => m.roles.map(p => `${p.person}: ${p.role}`)), raw: shared },
        { key: 'b', label: 'Three pair meetings', readout: `${pairs.matches.length} jointly supported occasions`, title: 'Three pairs do not establish a shared dinner.', explanation: 'Each pair record lacks supplied evidence for the third participant. The system reports that missing support; it does not conclude the third person was absent.', inputs: ['Narrator met Mira', 'Mira met Noor', 'Noor met the narrator'], lines: [`${pairs.unresolved.length} records have unresolved participation for this three-person query.`], raw: pairs },
      ],
      extra: { note: `The interpretation example preserves “${H.first.account}” alongside “${H.later.account}” Removing their link leaves an explicit omission and incomplete coverage, rather than pretending the later account never existed.`, raw: { linked: recallOccasion('D1', H.population, H.sources), withoutLink: recallOccasion('D1', { ...H.population, revisits: [] }, H.sources) } },
    },
    {
      id: '06', title: 'Checked transformations', verb: 'Inspect what a rewrite changed', question: 'Did “often” quietly turn into “always”?',
      premise: 'A memory can become shorter while becoming wrong. A few named distinctions—who, when, uncertainty, degree—are worth checking explicitly.',
      mechanism: 'A checking press compares two impressions. One altered notch prevents a match; matching notches only certify the features the gauge measures.',
      benefit: 'Check designated fields and a fixed rendering, expose changed text separately, and bind a receipt to exact inputs so an old result cannot silently validate edited material.',
      where: 'An optional checker of a proposed memory transformation. It can return an inspectable report; it does not itself approve or publish a rewrite.',
      math: 'Invariance: name what should survive a transformation, then compare it. A hash establishes input identity; neither equality nor a hash proves the meaning of free prose.',
      limit: 'Faithful and misleading prose can carry identical annotations. The checker explicitly leaves free-prose preservation unassessed. It is not a general truth detector.',
      states: [
        { key: 'a', label: 'Often stays often', readout: `${faithful.properties.filter(p => (FIELD_NAMES as readonly string[]).includes(p.name) && p.status === 'pass').length} named fields match`, title: 'The supplied fixed representation matches.', explanation: 'The same designated fields and exact template pass their checks. This is a limited structural result, not a judgment that the remembered preference is true.', inputs: ['Subject: narrator', 'Circumstance: a tiring day', 'Modality: often → often'], lines: [`Text: ${faithful.byteChange}`, `Failed properties: ${faithful.differences.length}`, 'General prose preservation: not checked'], raw: faithful },
        { key: 'b', label: 'Often becomes always', readout: `${changed.differences.length} named property fails`, title: 'A small word changes the claim.', explanation: 'The modality field changes from often to always. The checker names that difference, and independently reports changed text.', inputs: ['Same subject and circumstance', 'Modality: often → always', 'Fixed rendering rebuilt from the changed fields'], lines: [`Changed property: ${changed.differences.join(', ')}`, `Text: ${changed.byteChange}`, 'General prose preservation: not checked'], raw: changed },
      ],
      extra: { note: 'The hard limit: “The narrator dislikes social occasions” can retain all the old metadata. This returns no field differences, changed text, and prose unassessed. Matching metadata cannot certify the sentence.', raw: free },
    },
  ];
}
