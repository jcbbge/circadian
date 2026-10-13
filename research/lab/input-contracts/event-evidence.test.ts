import { describe, expect, test } from 'bun:test';
import { composeReviewedLocations, recallReviewedParticipation, reviewEventFacts, type EventFact, type EventReview } from './event-evidence';
import type { Record as RelationRecord } from '../../prototypes/03-relations';
import type { Interpretation } from '../../prototypes/05-experiences';

const source = { id: 'note', revision: 'r1', text: 'Recorded at the kiosk. The workshop was at the studio. Ada repaired a kite using instructions by Bex.' };
const span = (text: string) => ({ sourceId: source.id, revision: source.revision, start: source.text.indexOf(text), end: source.text.indexOf(text) + text.length });
const fact = (relation: EventFact['relation'], owner: string, subject: string, value: string, text: string): EventFact => ({ relation, owner, subject, value, span: span(text) });
const approved = (claim: EventFact): EventReview => ({ claim: structuredClone(claim), decision: 'supported', reviewer: 'independent source reviewer' });
const event = fact('event-location', 'occasion', 'occasion', 'studio', 'The workshop was at the studio.');
const recording = fact('recording-location', 'episode', 'episode', 'kiosk', 'Recorded at the kiosk.');
const refs = [{ id: source.id, revision: source.revision }];
const states = { note: { revision: 'r1', available: true, eligible: true } };
const records: RelationRecord[] = [
  { id: 'ada', kind: 'person', identity: 'reviewed', sources: refs },
  { id: 'studio', kind: 'place', sources: refs }, { id: 'kiosk', kind: 'place', sources: refs },
  { id: 'episode', kind: 'episode', recordingLocation: 'kiosk', sources: refs },
  { id: 'occasion', kind: 'occasion', setting: 'kiosk', sources: refs },
  { id: 'report', kind: 'report', statement: 'Ada repaired a kite.', episode: 'episode', occasion: 'occasion', subjects: ['ada'], sources: refs },
];
const compose = (facts: EventFact[], reviews: EventReview[]) => composeReviewedLocations(records,
  { select: 'about', person: 'ada', project: 'occasionSetting' }, states, [source], facts, reviews);

describe('prospective relation-specific event evidence', () => {
  test('recording evidence cannot promote an unreviewed event location', () => {
    const copied = { ...event, value: 'kiosk', span: recording.span };
    const out = compose([recording, copied], [approved(recording)]);
    expect(out.decisions.map(d => d.status)).toEqual(['supported', 'pending']);
    expect(out.composition.rows).toEqual([]);
    expect(out.composition.unresolved.length).toBeGreaterThan(0);
    expect(records.find(r => r.id === 'occasion')).toHaveProperty('setting', 'kiosk');
  });
  test('affirmative independently reviewed event location reaches composeReports', () => {
    const out = compose([recording, event], [approved(recording), approved(event)]);
    expect(out.composition.rows.map(r => r.setting)).toEqual(['studio']);
    expect(out.composition.semantics).toBe('notChecked');
    expect(out.decisions[1]!.evidence.text).toBe('The workshop was at the studio.');
  });
  test('equal recording/event values are allowed with separate approved relations', () => {
    const local = { ...source, text: source.text.replace('studio', 'kiosk') };
    const start = local.text.indexOf('The workshop was at the kiosk.');
    const same = { ...event, value: 'kiosk', span: { ...event.span, start, end: start + 'The workshop was at the kiosk.'.length } };
    // The positive fixture supplies affirmative event evidence and a separate review.
    const out = composeReviewedLocations(records, { select: 'about', person: 'ada', project: 'occasionSetting' },
      states, [local], [recording, same], [approved(recording), approved(same)]);
    expect(out.composition.rows.map(r => r.setting)).toEqual(['kiosk']);
  });
  test('unsupported and unknown remain distinguishable from absence', () => {
    expect(reviewEventFacts([source], [event], [{ ...approved(event), decision: 'unsupported' }])[0]!.status).toBe('unsupported');
    expect(reviewEventFacts([source], [event], [{ ...approved(event), decision: 'unknown' }])[0]!.status).toBe('pending');
  });
  test('review cannot replay onto another relation, owner, value, subject or span', () => {
    for (const change of [{ relation: 'recording-location' }, { owner: 'other' }, { value: 'kiosk' }, { subject: 'other' },
      { span: { ...event.span, start: event.span.start + 1 } }, { span: { ...event.span, sourceId: 'other' } }, { span: { ...event.span, revision: 'r2' } }]) {
      const review = { ...approved(event), claim: { ...event, ...change } } as EventReview;
      expect(reviewEventFacts([source], [event], [review])[0]!.status).toBe('pending');
    }
  });
  test('duplicate reviews reject and stale runtime source suppresses an approved location', () => {
    expect(() => compose([event], [approved(event), approved(event)])).toThrow();
    const out = composeReviewedLocations(records, { select: 'about', person: 'ada', project: 'occasionSetting' },
      { note: { ...states.note, revision: 'r2' } }, [source], [event], [approved(event)]);
    expect(out.composition.rows).toEqual([]);
    expect(out.composition.unavailable.length).toBeGreaterThan(0);
  });
  test('invalid source spans and packet ownership reject before composition', () => {
    for (const change of [{ sourceId: 'missing' }, { revision: 'r0' }, { start: -1 }, { end: 9999 }]) {
      expect(() => compose([{ ...event, span: { ...event.span, ...change } }], [approved(event)])).toThrow();
    }
    expect(() => compose([{ ...event, owner: 'episode' }], [])).toThrow();
    expect(() => compose([event, event], [])).toThrow();
  });
});

const occasion = { id: 'workshop', ref: { source: 'note', revision: 'r1' }, narrative: 'Ada repaired a kite.', mentioned: ['Bex'], coPresence: [] };
const interpretations: Interpretation[] = [{ id: 'reflection', ref: { source: 'note', revision: 'r1' }, occasion: { id: 'workshop' },
  question: { id: null, label: 'reflection' }, author: 'Bex', account: 'Repairs teach patience.', entry: true }];
const ada = fact('participation', 'workshop', 'Ada', 'repaired a kite', 'Ada repaired a kite');
const bex = fact('participation', 'workshop', 'Bex', 'wrote instructions', 'instructions by Bex');
const recall = (facts: EventFact[], reviews: EventReview[], mentioned = ['Bex']) => recallReviewedParticipation({ ...occasion, mentioned },
  interpretations, states, [source], facts, reviews, ['Ada', 'Bex']);

describe('prospective affirmative participation boundary', () => {
  test('authorship and a real mention span leave attendance pending', () => {
    const out = recall([ada, bex], [approved(ada)]);
    expect(out.decisions[1]!.status).toBe('pending');
    expect(out.recall).toHaveProperty('accounts.0.attendance', 'unknown');
    expect(out.participation).toHaveProperty('matches', []);
    expect(out.participation).toHaveProperty('unresolved.0.reason', 'participation-unknown');
  });
  test('an author may also attend with separate affirmative reviewed participation', () => {
    const local = { ...source, text: source.text + ' Bex attended the workshop and wrote instructions.' };
    const start = local.text.indexOf('Bex attended');
    const attendingBex = { ...bex, span: { ...bex.span, start, end: local.text.length } };
    const out = recallReviewedParticipation({ ...occasion, mentioned: [] }, interpretations, states, [local],
      [ada, attendingBex], [approved(ada), approved(attendingBex)], ['Ada', 'Bex']);
    expect(out.recall).toHaveProperty('accounts.0.attendance', 'supported');
    expect(out.participation).toHaveProperty('matches.0.id', 'workshop');
    // Neither independently approved attendance nor shared occasion implies simultaneity.
    expect(out.participation).toHaveProperty('matches.0.simultaneous', 'unknown');
  });
  test('membership/source/mention/co-presence mismatches reject', () => {
    expect(() => recall([{ ...ada, subject: 'Unknown' }], [])).toThrow();
    expect(() => recall([{ ...ada, owner: 'other' }], [])).toThrow();
    expect(() => recall([bex], [approved(bex)])).toThrow();
    expect(() => recallReviewedParticipation({ ...occasion, coPresence: [['Ada', 'Bex']] }, interpretations, states,
      [source], [ada], [approved(ada)], ['Ada', 'Bex'])).toThrow();
  });
});
