import { expect, test } from 'bun:test';
import { expand, makeView, restrictRecords, simpleSelection, type View, type ViewResult } from './index.ts';
import { expected, family, limits, records, sources } from './fixtures.ts';
const view = (r: ViewResult): View => { if (r.kind !== 'view') throw new Error(JSON.stringify(r)); return r; };
const ids = (r: View) => r.includedRefs.map(x => x.id);
test('V01 restriction precedes the record cap', () => {
  const r = view(makeView(records, sources, family, limits));
  expect(ids(r)).toEqual(expected.firstTwo); expect(r.eligibleCount).toBe(3); expect(r.omittedCount).toBe(1);
  expect(simpleSelection(records, sources, family, 2)).toEqual(expected.firstTwo);
});
test('V02 globally highest unrelated record cannot exhaust selection', () => {
  expect(ids(view(makeView(records, sources, family, { ...limits, maxRecords: 1 })))).toEqual(['b']);
  // Explicitly lossy ablation, not the competent same-information comparator.
  expect(restrictRecords(records.slice(0, 1), sources, family).matched).toEqual([]);
  expect(simpleSelection(records, sources, family, 1)).toEqual(['b']);
});
test('V03 restriction composes before lossy ranking', () => {
  const first = restrictRecords(records, sources, family).matched;
  expect(restrictRecords(first, sources, { ids: ['b', 'd'] }).matched.map(r => r.id)).toEqual(expected.restricted);
  expect(restrictRecords(records, sources, { ...family, ids: ['b', 'd'] }).matched.map(r => r.id)).toEqual(expected.restricted);
  expect(restrictRecords(records, sources, {}).matched).toEqual(records);
  const forgotten = new Map(sources); forgotten.set('b', { ...sources.get('b')!, eligible: false });
  expect(restrictRecords(records, forgotten, {}).matched.map(r => r.id)).toEqual(['a', 'c', 'd']);
});
test('V04 represented qualification survives rendering', () => {
  const r = view(makeView(records, sources, { ids: ['b'] }, limits));
  expect(r.text).toContain('when reading'); expect(r.text).not.toContain('when family');
});
test('V05 omitted opponent retains an open marker and expands from source', () => {
  const r = view(makeView(records, sources, family, { ...limits, chars: 470 }));
  expect(ids(r)).toEqual(['b']); expect(r.text).toContain('unresolved disagreement: c@r1');
  expect(expand([{ id: 'c', revision: 'r1' }], sources, 500)).toMatchObject({ entries: [{ status: 'available', text: sources.get('c')!.text }] });
  const resolved = records.map(r => ({ ...r, disagreements: r.disagreements.map(d => ({ ...d, state: 'resolved' as const })) }));
  expect(view(makeView(resolved, sources, { ids: ['b'] }, limits)).text).not.toContain('unresolved disagreement');
});
test('V06 a nonfitting qualification cannot leave its bare claim', () => {
  const r = view(makeView(records, sources, { ids: ['b'] }, { ...limits, chars: 350 }));
  expect(r.includedRefs).toEqual([]); expect(r.text).not.toContain('Mira prefers quiet'); expect(r.unmetCount).toBe(1);
});
test('V07 supplied population coverage is explicitly partial', () => {
  const r = view(makeView(records, sources, family, limits, { complete: false }));
  expect(r.populationComplete).toBe(false); expect(r.eligibleCount).toBe(3); expect(r.text).toContain('complete=false');
});
test('V08 ineligible selection and unavailable expansion cannot resurrect text', () => {
  const state = new Map(sources); state.set('b', { ...sources.get('b')!, eligible: false });
  expect(ids(view(makeView(records, state, family, limits)))).toEqual(['c', 'd']);
  expect(expand([{ id: 'b', revision: 'r1' }], state, 500)).toMatchObject({ entries: [{ status: 'ineligible' }] });
  state.delete('b');
  const r = expand([{ id: 'b', revision: 'r1' }], state, 500);
  expect(r).toMatchObject({ entries: [{ status: 'unavailable' }] }); expect(JSON.stringify(r)).not.toContain('Mira prefers');
});
test('V09 changed source revision cannot silently expand', () => {
  const changed = new Map(sources); changed.set('b', { ...sources.get('b')!, revision: 'r2' });
  expect(expand([{ id: 'b', revision: 'r1' }], changed, 500)).toMatchObject({ entries: [{ status: 'changed-revision' }] });
});
test('V10 required absent timestamp remains unresolved', () => {
  const r = view(makeView(records, sources, { ...family, since: 1 }, limits));
  expect(r.unresolvedCount).toBe(1); expect(r.eligibleCount).toBe(2); expect(ids(r)).toEqual(['b', 'c']);
});
test('V11 all fitting records occur once with accounted overhead', () => {
  const r = view(makeView(records, sources, {}, { ...limits, maxRecords: 10 }));
  expect(ids(r)).toEqual(expected.all); expect(r.omittedCount).toBe(0); expect(JSON.stringify(r).length).toBeLessThanOrEqual(limits.chars);
  expect(simpleSelection(records, sources, {}, 10)).toEqual(expected.all);
});
test('V12 scan cap bounds access and reports incomplete supplied coverage', () => {
  const many = Array.from({ length: 21 }, (_, i) => ({ ...records[0], id: `r${i}` }));
  const states = new Map(many.map(r => [r.id, sources.get('a')!]));
  Object.defineProperty(many, 20, { get() { throw new Error('Beyond cap read'); } });
  const r = view(makeView(many, states, {}, { ...limits, scanCap: 20 }));
  expect(r.inspected).toBe(20); expect(r.populationComplete).toBe(false); expect(JSON.stringify(r).length).toBeLessThanOrEqual(limits.chars);
});
test('V13 greater budgets extend a stable qualified prefix', () => {
  const results = [350, 470, 1000].map(chars => view(makeView(records, sources, family, { ...limits, chars, maxRecords: 10 })));
  expect(results.map(r => ids(r))).toEqual([[], ['b'], ['b', 'c', 'd']]);
  for (let i = 1; i < results.length; i++) {
    expect(ids(results[i]).slice(0, results[i - 1].includedRefs.length)).toEqual(ids(results[i - 1]));
    expect(results[i].omittedCount).toBeLessThanOrEqual(results[i - 1].omittedCount);
    expect(results[i].text).toContain('unresolved disagreement: c@r1');
  }
});
test('V14 zero budget returns a control error without a rendered view', () => {
  expect(makeView(records, sources, family, { ...limits, chars: 0 }).kind).toBe('invalid-budget');
});
test('XV01 escaped text and metadata stay within the serialized budget', () => {
  const tricky = [{ ...records[0], claim: '"\\\n'.repeat(50) }];
  for (let chars = 330; chars <= 1100; chars += 17) {
    const r = makeView(tricky, sources, {}, { ...limits, chars });
    if (r.kind === 'view') expect(JSON.stringify(r).length).toBeLessThanOrEqual(chars);
  }
});
test('XV02 oversized source fields are rejected before content traversal', () => {
  const r = view(makeView([{ ...records[0], claim: 'x'.repeat(100) }], sources, {}, { ...limits, maxRecordChars: 50 }));
  expect(r.unresolvedCount).toBe(1); expect(r.includedRefs).toEqual([]);
});
