import { describe, expect, test } from 'bun:test';
import { adapters, fixtures, compareTransformations } from './adapters_04_06';
import { fieldAt, type Candidate, type Fixture } from './contract';

const adapter = (id: string) => adapters.find(a => a.mechanism === id)!;
const fixture = (id: string) => fixtures.find(f => f.mechanism === id)!;
const clone = <T>(x: T): T => structuredClone(x);

describe('04–06 extraction boundaries', () => {
  test('all four source-derived gold packages decode and operate', () => {
    for (const f of fixtures) {
      const a = adapter(f.mechanism), c = a.decode(f.gold, f);
      expect(c).toEqual(f.gold);
      expect(a.operate(c, f).operation.length).toBeGreaterThan(0);
      for (const check of f.checks) expect(fieldAt(c, check.path)).toEqual(check.value);
    }
  });
  test('every adapter rejects malformed roots, unknown keys, false references and invented quotes', () => {
    for (const f of fixtures) {
      const a = adapter(f.mechanism);
      for (const bad of [null, [], { ...f.gold, reviewed: true }, { ...f.gold, data: [] }]) expect(() => a.decode(bad, f)).toThrow();
      for (const change of [{ sourceId: 'not-in-bundle' }, { quote: 'This invented quotation does not exist.' }, { path: 'arbitrary.authority' }]) {
        const c = clone(f.gold); Object.assign(c.evidence[0]!, change); expect(() => a.decode(c, f)).toThrow();
      }
      expect(() => a.decode({ ...f.gold, evidence: [] }, f)).toThrow();
      expect(() => a.decode({ ...f.gold, unknown: ['x'.repeat(601)] }, f)).toThrow();
    }
  });
  test('operate validates again instead of accepting an unchecked candidate', () => {
    for (const f of fixtures) expect(() => adapter(f.mechanism).operate({ ...f.gold, data: null }, f)).toThrow();
  });
});

describe('04 actual bounded recipe', () => {
  const f = fixture('04'), a = adapter('04');
  const compute = (c: Candidate, state: Fixture = f) => (a.operate(c, state).result as any).computation;
  test('calculates earliest feasible window with trusted source revision', () => {
    expect(compute(f.gold)).toMatchObject({ status: 'result', options: [{ place: 'conservatory', window: [800, 825], tentative: true }], asOf: 790 });
  });
  test('unknown requirement remains a missing preference rather than false', () => {
    const c = clone(f.gold) as any; c.data.preferences[0].quiet = null;
    c.evidence = c.evidence.filter((e: any) => e.path !== 'preferences.0.quiet'); c.unknown = ['Inez quiet requirement unresolved'];
    expect(a.decode(c, f).data).toMatchObject({ preferences: [{ quiet: null }, { quiet: false }] });
    expect(compute(c)).toEqual({ status: 'missing', slots: ['Inez.preference'] });
  });
  test('unknown availability and explicit no-availability differ', () => {
    const c = clone(f.gold) as any; c.data.availability[0].windows = null;
    expect(compute(c)).toEqual({ status: 'missing', slots: ['Inez.availability'] });
    c.data.availability[0].windows = [];
    // This mechanical test is intentionally not a semantic gold annotation.
    expect(compute(c)).toMatchObject({ status: 'result', options: [], reasons: ['noFeasibleWindow'] });
  });
  test('state can retire, invalidate or leave applicability unresolved; model cannot override it', () => {
    const retired = clone(f); retired.caller.retired = true;
    expect(compute(f.gold, retired)).toEqual({ status: 'notApplicable', reason: 'retired' });
    const unknown = clone(f); unknown.caller.applicability = 'unknown';
    expect(compute(f.gold, unknown)).toEqual({ status: 'missing', slots: ['applicabilityEvidence'] });
    const stale = clone(f); (stale.caller.sourceStates as any)['cal-04-note'].revision = 'r2';
    expect(compute(f.gold, stale)).toMatchObject({ status: 'reconsider', reason: 'staleSource' });
    const c = clone(f.gold) as any; c.data.applicability = 'applies'; expect(() => a.decode(c, retired)).toThrow();
  });
  test('rejects unsupported identities, malformed windows and unbounded payloads', () => {
    const c = clone(f.gold) as any; c.data.preferences[0].participant = 'Invented'; expect(() => a.decode(c, f)).toThrow();
    c.data.preferences[0].participant = 'Inez'; c.data.availability[0].windows = [[840, 780]]; expect(() => a.decode(c, f)).toThrow();
    c.data.availability[0].windows = Array(9).fill([780, 840]); expect(() => a.decode(c, f)).toThrow();
  });
});

describe('05 participation and attributed experience', () => {
  const f = fixture('05'), a = adapter('05');
  test('actual recall returns interpretation with unknown author attendance', () => {
    const result = a.operate(f.gold, f).result as any;
    expect(result.recall.accounts[0]).toMatchObject({ author: 'Jules', attendance: 'unknown' });
    expect(result.participation.matches).toEqual([]);
    expect(result.participation.unresolved).toContainEqual({ id: 'lantern-workshop', reason: 'participation-unknown' });
  });
  test('co-presence requires extracted participants, not mentioned people', () => {
    const c = clone(f.gold) as any; c.data.coPresence[0].push('Jules'); expect(() => a.decode(c, f)).toThrow();
    c.data.coPresence = [['Mira']]; expect(() => a.decode(c, f)).toThrow();
  });
  test('a matching quote does not prove the attribution; semantic review remains necessary', () => {
    const c = clone(f.gold) as any; c.data.interpretations[0].author = 'Mira';
    // Both are caller-reviewed people and the quote exists: decoder is not an entailment judge.
    expect(() => a.decode(c, f)).not.toThrow();
  });
  test('source eligibility belongs to caller and an interpretation cannot assert attendance', () => {
    const state = clone(f); (state.caller.sourceStates as any)['cal-05-reflection'].eligible = false;
    const result = a.operate(f.gold, state).result as any;
    expect(result.recall.accounts).toEqual([]);
    expect(result.recall.unresolved).toContainEqual({ id: 'lantern-reflection', reason: 'ineligible' });
    const c = clone(f.gold) as any; c.data.interpretations[0].attendance = 'supported'; expect(() => a.decode(c, f)).toThrow();
  });
  test('future recall question is not embedded in capture task', () => { expect(f.task).toBeUndefined(); });
});

describe('06 independently annotated transformations', () => {
  const old = fixtures[2]!, next = fixtures[3]!, a = adapter('06');
  test('actual checker detects modality change without a spurious provenance difference', () => {
    const r = compareTransformations(old.gold, old, next.gold, next).result;
    expect(r.status).toBe('checked');
    if (r.status !== 'checked') throw new Error('Expected checked');
    expect(r.differences).toEqual(['modality']);
    expect(r.properties).toContainEqual({ name: 'prose-preservation', status: 'notChecked', reason: 'free-prose-unassessed', conditionalOn: [] });
  });
  test('an identical rewrite passes named fields but never certifies free prose', () => {
    const benign = clone(next); benign.sources[0]!.text = old.sources[0]!.text;
    benign.gold = clone(old.gold); benign.gold.evidence = benign.gold.evidence.map(e => ({ ...e, sourceId: benign.sources[0]!.id }));
    const r = compareTransformations(old.gold, old, benign.gold, benign).result;
    expect(r.status).toBe('checked');
    if (r.status === 'checked') { expect(r.differences).toEqual([]); expect(r.representationCoverage.prose).toBe('unassessed'); }
  });
  test('unknown and absent are different, unknown never produces field equality pass', () => {
    const c = clone(next.gold) as any; c.data.modality = { state: 'unknown' }; c.evidence = c.evidence.filter((e: any) => e.path !== 'modality'); c.unknown = ['Modality unresolved'];
    const r = compareTransformations(old.gold, old, c, next).result;
    if (r.status !== 'checked') throw new Error('Expected checked');
    expect(r.properties.find(p => p.name === 'modality')?.status).toBe('notChecked');
    c.data.modality = { state: 'absent' }; expect(() => a.decode(c, next)).toThrow();
    c.evidence.push({ path: 'modality', sourceId: next.sources[0]!.id, quote: next.sources[0]!.text });
    const absent = compareTransformations(old.gold, old, c, next).result;
    if (absent.status === 'checked') expect(absent.properties.find(p => p.name === 'modality')?.status).toBe('fail');
  });
  test('field values must be quoted phrases and pair caller identity is checked', () => {
    const c = clone(old.gold) as any; c.data.subject.value = 'Someone never mentioned'; expect(() => a.decode(c, old)).toThrow();
    expect(() => compareTransformations(next.gold, next, old.gold, old)).toThrow();
    const wrong = clone(next); wrong.caller.pairId = 'unrelated'; expect(() => compareTransformations(old.gold, old, wrong.gold, wrong)).toThrow();
  });
  test('caller stale revision prevents source validation without rewriting annotation refs', () => {
    const stale = clone(old); (stale.caller.sourceStates as any)[old.sources[0]!.id].revision = 'r2';
    const r = compareTransformations(stale.gold, stale, next.gold, next).result;
    if (r.status !== 'checked') throw new Error('Expected checked');
    expect(r.properties.some(p => p.reason === 'stale-source-revision' && p.status === 'notChecked')).toBe(true);
  });
  test('unavailable candidate bytes remain unavailable in actual checker', () => {
    const unavailable = clone(next); (unavailable.caller.sourceStates as any)[next.sources[0]!.id].available = false;
    const r = compareTransformations(old.gold, old, unavailable.gold, unavailable).result;
    if (r.status !== 'checked') throw new Error('Expected checked');
    expect(r.byteChange).toBe('unavailable');
    expect(r.properties.find(p => p.name === 'input-bytes')?.status).toBe('notChecked');
  });
});
