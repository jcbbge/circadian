import { describe, expect, test } from 'bun:test';
import { fixtures } from '../extractor-007/confirmation';
import type { Fixture } from '../extractor-006/contract';
import { adapters } from '../extractor-007/adapters_04_06';
import { bindSourceSpan, bindTransformationSpans, compareSpanTransformations, compatibilityMemory, sourcePhrase } from './source-spans';

function ungraded(f: Fixture): Fixture {
  return new Proxy({ id: f.id, mechanism: f.mechanism, sources: f.sources, caller: f.caller, task: f.task }, {
    get(target, key) {
      if (['question', 'gold', 'checks', 'rubric'].includes(String(key))) throw new Error('Grading access');
      return Reflect.get(target, key);
    },
  }) as Fixture;
}
function selection(f: Fixture) {
  return Object.fromEntries(Object.entries(f.gold.data as Record<string, any>).map(([name, field]) => {
    const start = f.sources[0]!.text.indexOf(field.value);
    expect(start).toBeGreaterThanOrEqual(0);
    return [name === 'subject' ? 'person' : name, { state: 'known', span: { start, end: start + field.value.length } }];
  }));
}

describe('code-bound phrases and real transformation consumer', () => {
  const texts = fixtures.filter(f => f.mechanism === '06');
  test('source spans prevent recopy corruption while retaining frozen consumer acceptance', () => {
    for (const f of texts) {
      const candidate = bindTransformationSpans(selection(f), ungraded(f));
      expect(candidate.data).toEqual(f.gold.data);
      expect(() => adapters.find(a => a.mechanism === '06')!.operate(candidate, ungraded(f))).not.toThrow();
      expect(JSON.stringify(candidate.data)).not.toMatch(/sketchbookbook|ForFor/);
      const recopy = structuredClone(selection(f));
      recopy.attribution = { state: 'known', value: 'sketchbookbook' } as any;
      expect(() => bindTransformationSpans(recopy, ungraded(f))).toThrow();
    }
  });
  test('actual paired checker still detects changed circumstance and modality', () => {
    const old = texts.find(f => f.caller.role === 'old')!, changed = texts.find(f => (f.gold.data as any).modality.value === 'often favor')!;
    const result = compareSpanTransformations(selection(old), ungraded(old), selection(changed), ungraded(changed));
    expect((result.result as any).differences).toContain('modality');
    expect((result.result as any).differences).toContain('circumstance');
  });
  test('unknown and absent remain distinct, without attached spans or values', () => {
    const f = texts[0]!, raw = selection(f);
    raw.person = { state: 'unknown' } as any;
    raw.attribution = { state: 'absent' } as any;
    const candidate = bindTransformationSpans(raw, ungraded(f));
    expect((candidate.data as any).subject).toEqual({ state: 'unknown' });
    expect((candidate.data as any).attribution).toEqual({ state: 'absent' });
    expect(candidate.unknown).toContain('subject');
    raw.person = { state: 'unknown', span: { start: 0, end: 1 } } as any;
    expect(() => bindTransformationSpans(raw, ungraded(f))).toThrow();
  });
  test('valid but semantically wrong selection is preserved, not certified or corrected', () => {
    const f = texts[0]!, raw = selection(f);
    raw.modality = structuredClone(raw.person);
    expect((bindTransformationSpans(raw, ungraded(f)).data as any).modality.value).toBe('Ravi');
  });
  test('rejects malformed, empty, oversize and out-of-bounds selections', () => {
    for (const span of [{ start: -1, end: 1 }, { start: 0, end: 4 }, { start: 1, end: 1 },
      { start: 2, end: 1 }, { start: 0.5, end: 1 }, { start: '0', end: 1 },
      { start: 0, end: Infinity }, { start: 0, end: 1, value: 'a' }]) {
      expect(() => sourcePhrase('abc', span)).toThrow();
    }
    expect(() => sourcePhrase('abc', { start: 0, end: 3 }, 2)).toThrow();
    expect(() => sourcePhrase(' ', { start: 0, end: 1 })).toThrow();
  });
  test('UTF-16 offsets preserve whole non-BMP characters and reject surrogate splits', () => {
    expect(sourcePhrase('A😀B', { start: 1, end: 3 })).toBe('😀');
    expect(() => sourcePhrase('A😀B', { start: 1, end: 2 })).toThrow();
    expect(() => sourcePhrase('A😀B', { start: 2, end: 3 })).toThrow();
  });
  test('explicit span references bind current identity/revision and reject ambiguous sources', () => {
    const sources = [{ id: 'source-a', revision: 'r2', text: 'A😀B' }];
    const span = { sourceId: 'source-a', revision: 'r2', start: 1, end: 3 };
    expect(bindSourceSpan(sources, span)).toEqual({ ...span, text: '😀' });
    expect(() => bindSourceSpan(sources, { ...span, revision: 'r1' })).toThrow();
    expect(() => bindSourceSpan(sources, { ...span, sourceId: 'missing' })).toThrow();
    expect(() => bindSourceSpan([...sources, ...sources], span)).toThrow();
    expect(() => bindSourceSpan(sources, { ...span, start: 2 })).toThrow();
  });
});

describe('caller-owned labels reach compatibility reader with stable source identity', () => {
  const f = fixtures.find(f => f.id === 'confirm-v26')!;
  function raw(input: Fixture) {
    return { accounts: (input.gold.data as any).accounts.map(({ sourceId, property, ...fields }: any) => fields) };
  }
  const labels = { 'src-i47': { revision: 'r1', label: 'maintenance note' }, 'src-s96': { revision: 'r1', label: 'safety note' } };
  test('labels survive projection without full-source leakage or changing actual operation', () => {
    const packet = compatibilityMemory(raw(f), ungraded(f), labels);
    expect(packet.candidate.accounts.map(a => [a.sourceId, a.sourceLabel])).toEqual([
      ['src-i47', 'maintenance note'], ['src-s96', 'safety note'],
    ]);
    expect((packet.operation.result as any).reports[0].joint.status).toBe('conflict');
    expect(JSON.stringify(packet)).not.toContain(f.sources[0]!.text);
    const missing = compatibilityMemory(raw(f), ungraded(f));
    expect(missing.candidate.accounts.every(a => a.sourceLabel === null)).toBe(true);
    expect(missing.operation).toEqual(packet.operation);
  });
  test('source order changes cannot attach a label to the wrong identity', () => {
    const reversed = structuredClone(f);
    reversed.sources.reverse(); (reversed.gold.data as any).accounts.reverse();
    const packet = compatibilityMemory(raw(reversed), ungraded(reversed), labels);
    expect(packet.candidate.accounts.map(a => a.sourceLabel)).toEqual(['safety note', 'maintenance note']);
  });
  test('unknown labels stay null; stale, unknown and malformed metadata fail', () => {
    expect(compatibilityMemory(raw(f), ungraded(f), { 'src-i47': { revision: 'r1', label: null } }).candidate.accounts[0]!.sourceLabel).toBeNull();
    for (const bad of [{ 'src-i47': { revision: 'r0', label: 'note' } },
      { invented: { revision: 'r1', label: 'note' } }, { 'src-i47': { revision: 'r1', label: '' } }]) {
      expect(() => compatibilityMemory(raw(f), ungraded(f), bad)).toThrow();
    }
  });
});
