import { describe, expect, test } from 'bun:test';
import { fixtures } from '../extractor-006/adapters_04_06';
import type { Fixture } from './contract';
import { adapters, compareTransformations } from './adapters_04_06';

const adapter = (id: string) => adapters.find(a => a.mechanism === id)!;
const fixture = (id: string) => fixtures.find(f => f.mechanism === id)!;
const clone = <T>(value: T): T => structuredClone(value);
const plan = () => ({
  participants: [
    { participant: 'Inez', quiet: true, seating: true, windows: [['13:00', '14:00']] },
    { participant: 'Pavel', quiet: false, seating: true, windows: [['13:20', '14:10']] },
  ],
  places: [{ place: 'conservatory', quiet: true, seating: true, open: true }],
  minutes: 25,
});
const occasion = () => ({
  narrative: 'Mira cut paper and Soren assembled frames at a shared table during the lantern-making workshop.',
  participants: [{ person: 'Mira', role: 'cut paper' }, { person: 'Soren', role: 'assembled frames' }],
  mentioned: ['Jules'], coPresence: [['Mira', 'Soren']],
  interpretations: [{ author: 'Jules', account: 'The shared table made the workshop an exercise in cooperation.' }],
});
const annotation = (modality = 'might prefer') => ({
  person: { state: 'known', value: 'Noor' },
  attribution: { state: 'known', value: 'Noor wrote in her travel journal' },
  circumstance: { state: 'known', value: 'For short winter walks' },
  modality: { state: 'known', value: modality },
  comparison: { state: 'known', value: 'the canal path to the hill trail' },
});
const cases = () => [
  { f: fixtures[0]!, raw: plan() }, { f: fixtures[1]!, raw: occasion() },
  { f: fixtures[2]!, raw: annotation() }, { f: fixtures[3]!, raw: annotation('always prefer') },
];
function hiddenEvaluation(f: Fixture): Fixture {
  const input = clone(f);
  for (const field of ['gold', 'checks', 'rubric', 'question']) Object.defineProperty(input, field, { get() { throw new Error(`Forbidden evaluation access: ${field}`); } });
  return input;
}

describe('04–06 minimal extraction boundaries', () => {
  test('reviewed source-derived drafts bind and run actual operations without reading evaluation material', () => {
    for (const { f, raw } of cases()) {
      const a = adapter(f.mechanism), guarded = hiddenEvaluation(f);
      expect(a.format(guarded).schema).toBeObject();
      const c = a.bind(raw, guarded);
      expect(a.operate(c, guarded).operation.length).toBeGreaterThan(0);
      for (const e of c.evidence) expect(e.quote).toBe(f.sources.find(s => s.id === e.sourceId)!.text);
    }
  });
  test('semantic assignment contains no output-format demands or fixture answer text', () => {
    for (const a of adapters) {
      expect(a.semanticInstructions).not.toMatch(/JSON|schema|sourceId|evidence\.|Return exactly|\{"/i);
      expect(a.semanticInstructions).not.toMatch(/Inez|Pavel|Jules|Noor|conservatory|800|825/);
    }
  });
  test('rejects model envelopes, authority fields, omitted fields and malformed roots', () => {
    for (const { f, raw } of cases()) {
      const a = adapter(f.mechanism);
      for (const bad of [null, [], { data: raw, evidence: [], unknown: [] }, { ...raw, reviewed: true }, {}]) expect(() => a.bind(bad, f)).toThrow();
      const missing = { ...raw } as Record<string, unknown>; delete missing[Object.keys(missing)[0]!];
      expect(() => a.bind(missing, f)).toThrow();
      const c = a.bind(raw, f);
      expect(() => a.operate({ ...c, data: null }, f)).toThrow();
    }
  });
  test('schemas require all declared keys and exclude the legacy envelope', () => {
    for (const { f } of cases()) {
      const s = adapter(f.mechanism).format(f).schema as any;
      expect(s.type).toBe('object'); expect(s.additionalProperties).toBe(false);
      expect(s.required).toEqual(Object.keys(s.properties));
      for (const key of ['data', 'sourceId', 'evidence', 'unknown']) expect(s.properties[key]).toBeUndefined();
    }
  });
});

describe('04 participant grouping and clock conversion', () => {
  const f = fixture('04'), a = adapter('04');
  const compute = (raw: unknown, state = f) => (a.operate(a.bind(raw, state), state).result as any).computation;
  test('each participant keeps their own window and the real recipe computes 13:20–13:45', () => {
    expect(a.bind(plan(), f).data).toEqual(f.gold.data);
    expect(compute(plan())).toMatchObject({ status: 'result', options: [{ place: 'conservatory', window: [800, 825], tentative: true }], asOf: 790 });
    const midnight = plan(); midnight.participants[0]!.windows = [['23:50', '24:00']];
    expect((a.bind(midnight, f).data as any).availability[0].windows).toEqual([[1430, 1440]]);
  });
  test('null preference differs from false and null availability differs from []', () => {
    const raw = plan() as any; raw.participants[0].quiet = null;
    expect(compute(raw)).toEqual({ status: 'missing', slots: ['Inez.preference'] });
    expect((a.bind(raw, f).data as any).preferences[1].quiet).toBe(false);
    raw.participants[0].quiet = true; raw.participants[0].windows = null;
    expect(compute(raw)).toEqual({ status: 'missing', slots: ['Inez.availability'] });
    raw.participants[0].windows = [];
    expect(compute(raw)).toMatchObject({ status: 'result', options: [], reasons: ['noFeasibleWindow'] });
  });
  test('missing duration, place observations and maximum unknown arrays stay representable', () => {
    const raw = plan() as any; raw.minutes = null;
    expect(compute(raw)).toMatchObject({ status: 'missing', slots: ['intention'] });
    raw.minutes = 25; raw.places = [];
    expect(compute(raw)).toMatchObject({ status: 'missing', slots: ['places'] });
    const wide = clone(f); wide.caller.participants = Array.from({ length: 8 }, (_, i) => `person-${i}`); wide.caller.places = Array.from({ length: 8 }, (_, i) => `place-${i}`);
    const c = a.bind({ participants: (wide.caller.participants as string[]).map(participant => ({ participant, quiet: null, seating: null, windows: null })), places: (wide.caller.places as string[]).map(place => ({ place, quiet: null, seating: null, open: null })), minutes: null }, wide);
    expect(c.unknown.length).toBeLessThanOrEqual(16);
    expect((a.operate(c, wide).result as any).computation.status).toBe('missing');
  });
  test('malformed clocks, overlong lists, unknown people and duplicate records fail', () => {
    for (const pair of [[780, 840], ['13:60', '14:00'], ['7:00', '14:00'], ['14:00', '13:00'], ['24:00', '24:01'], ['13:00']]) {
      const raw = plan() as any; raw.participants[0].windows = [pair]; expect(() => a.bind(raw, f)).toThrow();
    }
    const raw = plan() as any; raw.participants[0].participant = 'Other'; expect(() => a.bind(raw, f)).toThrow();
    raw.participants[0].participant = 'Inez'; raw.participants.push(raw.participants[0]); expect(() => a.bind(raw, f)).toThrow();
    raw.participants = plan().participants; raw.participants[0].windows = Array(9).fill(['13:00', '14:00']); expect(() => a.bind(raw, f)).toThrow();
    raw.participants = plan().participants; raw.minutes = '25'; expect(() => a.bind(raw, f)).toThrow();
  });
  test('does not repair a semantically wrong clock or requirement using gold', () => {
    const raw = plan(); raw.participants[1]!.windows = [['13:00', '14:00']]; raw.participants[1]!.quiet = true;
    const c = a.bind(raw, hiddenEvaluation(f));
    expect((c.data as any).availability[1].windows).toEqual([[780, 840]]);
    expect((c.data as any).preferences[1].quiet).toBe(true);
    expect(compute(raw).options[0].window).toEqual([790, 815]);
  });
  test('caller state can retire or invalidate the recipe; source ambiguity is rejected', () => {
    const retired = clone(f); retired.caller.retired = true;
    expect(compute(plan(), retired)).toEqual({ status: 'notApplicable', reason: 'retired' });
    const stale = clone(f); (stale.caller.sourceStates as any)[stale.sources[0]!.id].revision = 'r2';
    expect(compute(plan(), stale)).toMatchObject({ status: 'reconsider', reason: 'staleSource' });
    const ambiguous = clone(f); ambiguous.sources.push({ id: 'extra', revision: 'r1', text: 'Another note.' });
    expect(() => a.bind(plan(), ambiguous)).toThrow();
  });
});

describe('05 event and interpretation source slots', () => {
  const f = fixture('05'), a = adapter('05');
  test('actual recall attributes the reflection without establishing author attendance', () => {
    const c = a.bind(occasion(), f), result = a.operate(c, f).result as any;
    expect(result.recall.accounts[0]).toMatchObject({ author: 'Jules', attendance: 'unknown' });
    expect(result.participation.matches).toEqual([]);
    expect(c.evidence.find(e => e.path === 'interpretations.0')?.sourceId).toBe('cal-05-reflection');
  });
  test('source order and nullable slots bind correctly without model source IDs', () => {
    const input = clone(f); input.sources = [f.sources[1]!, f.sources[0]!];
    expect(a.bind(occasion(), input).evidence.find(e => e.path === 'narrative')?.sourceId).toBe(f.caller.eventSourceId as string);
    input.sources.push({ id: 'second-reflection', revision: 'r1', text: 'Mira wrote a second reflection.' });
    input.caller.interpretationIds = { 'second-reflection': 'second-account', 'cal-05-reflection': 'lantern-reflection' };
    const raw = occasion() as any; raw.interpretations = [null, { author: 'Mira', account: 'A second perspective.' }];
    const c = a.bind(raw, input);
    expect((c.data as any).interpretations).toEqual([{ sourceId: 'second-reflection', author: 'Mira', account: 'A second perspective.' }]);
    expect(c.evidence.find(e => e.path === 'interpretations.0')?.sourceId).toBe('second-reflection');
    expect(c.unknown).toContain('interpretations');
    raw.interpretations = []; expect(() => a.bind(raw, input)).toThrow();
  });
  test('null unknown capture is valid; malformed identities, co-presence, and manifest fail', () => {
    const c = a.bind({ narrative: null, participants: [], mentioned: [], coPresence: [], interpretations: [null] }, f);
    expect(c.data).toMatchObject({ narrative: null, interpretations: [] });
    expect((a.operate(c, f).result as any).recall.accounts).toEqual([]);
    const raw = occasion(); raw.coPresence = [['Mira', 'Jules']]; expect(() => a.bind(raw, f)).toThrow();
    raw.coPresence = [['Mira']]; expect(() => a.bind(raw, f)).toThrow();
    raw.coPresence = []; raw.participants[0]!.person = 'Other'; expect(() => a.bind(raw, f)).toThrow();
    const missing = clone(f); missing.caller.interpretationIds = { missing: 'account' }; expect(() => a.bind(occasion(), missing)).toThrow();
    const escaped = occasion() as any; escaped.interpretations[0].sourceId = f.caller.eventSourceId; expect(() => a.bind(escaped, f)).toThrow();
  });
  test('preserves wrong authorship, participation and co-presence as semantic errors', () => {
    const raw = occasion(); raw.interpretations[0]!.author = 'Mira'; raw.mentioned = [];
    raw.participants.push({ person: 'Jules', role: 'attendee' }); raw.coPresence[0]!.push('Jules');
    const c = a.bind(raw, hiddenEvaluation(f));
    expect((c.data as any).interpretations[0].author).toBe('Mira');
    expect((c.data as any).participants[2].person).toBe('Jules');
    expect((c.data as any).coPresence[0]).toContain('Jules');
  });
});

describe('06 person field and independent annotations', () => {
  const old = fixtures[2]!, next = fixtures[3]!, a = adapter('06');
  test('person maps to subject and independent texts reveal changed modality', () => {
    const before = a.bind(annotation(), hiddenEvaluation(old)), after = a.bind(annotation('always prefer'), hiddenEvaluation(next));
    expect(before.data).toEqual(old.gold.data);
    expect((before.data as any).person).toBeUndefined();
    expect(compareTransformations(before, old, after, next).result).toMatchObject({ status: 'checked', differences: ['modality'] });
    expect(a.operate(before, old).operation).toBe('independent field inspection (pair pending)');
  });
  test('known values must occur exactly in this source; legacy subject and pair fields fail', () => {
    const raw = annotation(); raw.person.value = 'Someone else'; expect(() => a.bind(raw, old)).toThrow();
    expect(() => a.bind(annotation('always prefer'), old)).toThrow();
    expect(() => a.bind({ ...annotation(), pairStatus: 'same' }, old)).toThrow();
    const legacy = { ...annotation(), subject: annotation().person } as any; delete legacy.person;
    expect(() => a.bind(legacy, old)).toThrow();
  });
  test('unknown and absent remain distinct and a false absence is not oracle-corrected', () => {
    const raw = annotation('always prefer') as any; raw.modality = { state: 'unknown' };
    const unknown = a.bind(raw, next);
    expect(unknown.unknown).toContain('modality'); expect(unknown.evidence.some(e => e.path === 'modality')).toBe(false);
    const result = compareTransformations(a.bind(annotation(), old), old, unknown, next).result as any;
    expect(result.properties.find((p: any) => p.name === 'modality').status).toBe('notChecked');
    raw.modality = { state: 'absent' };
    const absent = a.bind(raw, next);
    expect((absent.data as any).modality).toEqual({ state: 'absent' });
    expect(absent.evidence.find(e => e.path === 'modality')?.quote).toBe(next.sources[0]!.text);
    raw.modality = { state: 'absent', value: 'always prefer' }; expect(() => a.bind(raw, next)).toThrow();
  });
  test('an exact but semantically wrong phrase is preserved for evaluation', () => {
    const raw = annotation(); raw.person.value = 'the canal path';
    expect((a.bind(raw, old).data as any).subject).toEqual({ state: 'known', value: 'the canal path' });
  });
});
