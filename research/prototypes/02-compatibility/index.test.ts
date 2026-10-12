import { expect, test } from 'bun:test';
import { checkJoint, compareContexts, pairwiseChecks, type Alignment, type Dimension } from './index.ts';
import { account, attendance, binary, expected, group, readingDance, set, states, time, triangle } from './fixtures.ts';
test('C01 different activities preserve both contextual accounts', () => {
  const r = compareContexts(readingDance, [group(readingDance, ['activity'])], states(readingDance));
  expect(r[0].alignment).toBe('separate'); expect(r[0].sourceRefs).toHaveLength(2); expect(r[0].joint).toBeUndefined();
});
test('C02 half-open adjacent periods are separate and unknown endpoints stay unknown', () => {
  const records = [account('early', ['quiet'], [time(1, 5)]), account('late', ['lively'], [time(5, 9)])];
  expect(compareContexts(records, [group(records, ['time'])], states(records))[0].alignment).toBe('separate');
  const uncertain = [records[0], { ...records[1], context: [time('unknown', 9)] }];
  expect(compareContexts(uncertain, [group(uncertain, ['time'])], states(uncertain))[0].alignment).toBe('unknown');
  const open = [records[0], { ...records[1], context: [time(null, 9)] }];
  expect(compareContexts(open, [group(open, ['time'])], states(open))[0].joint?.status).toBe('conflict');
});
test('C03 opposing attendance accounts conflict over one declared occasion', () => {
  const r = compareContexts(attendance, [group(attendance)], states(attendance))[0];
  expect(r.alignment).toBe('aligned'); expect(r.joint).toMatchObject({ status: 'conflict', assignmentsExamined: 2 });
  expect(r.sourceRefs.map(x => x.id)).toEqual(['source-present', 'source-absent']);
});
test('C04 matching labels cannot resolve an unknown subject identity', () => {
  const records = [account('Mira', ['present']), { ...account('M.', ['present']), subject: null }];
  expect(compareContexts(records, [group(records)], states(records))[0]).toMatchObject({ alignment: 'unknown', reason: 'subject-unresolved' });
});
test('C05 different recording machines do not change applicability', () => {
  const records = attendance.map((a, i) => ({ ...a, origin: i ? 'hive' : 'laptop' }));
  expect(compareContexts(records, [group(records)], states(records))[0].joint?.status).toBe('conflict');
});
test('C06 unspecified applicability differs from explicitly unrestricted', () => {
  const records = [account('a', ['quiet'], []), account('b', ['quiet'], [set('activity', ['reading'])])];
  expect(compareContexts(records, [group(records, ['activity'])], states(records))[0].alignment).toBe('unknown');
  const explicit = [{ ...records[0], context: [{ name: 'activity', dimension: { kind: 'unrestricted' as const } }] }, records[1]];
  expect(compareContexts(explicit, [group(explicit, ['activity'])], states(explicit))[0].joint?.status).toBe('compatible');
});
test('C07 pairwise witnesses do not imply a joint witness', () => {
  const pairs = pairwiseChecks(binary, triangle, 8);
  expect(pairs).toHaveLength(3); expect(pairs.map(p => p.result.status)).toEqual(['compatible', 'compatible', 'compatible']);
  expect(checkJoint(binary, triangle, 8)).toEqual({ status: 'conflict', assignmentsExamined: expected.triangleAssignments });
});
test('C08 unary constraints report compatible domain narrowing', () => {
  const r = checkJoint([{ variable: 'A', values: ['0', '1'] }], [{ id: 'A=0', variables: ['A'], allowed: [['0']] }], 2);
  expect(r).toMatchObject({ status: 'compatible', witness: { A: expected.narrowedValue }, narrowing: { A: ['0'] } });
});
test('C09 consistency of wrong annotations does not establish semantic truth', () => {
  const records = [account('a', ['present']), account('b', ['present'])];
  const result = compareContexts(records, [group(records)], states(records))[0];
  expect(result.joint?.status).toBe('compatible');
  if (result.joint?.status !== 'compatible') throw new Error('Expected formal compatibility');
  expect(result.joint.witness.value).not.toBe(expected.annotationTruth);
  expect(result).not.toHaveProperty('truth');
});
test('C10 capped enumeration is unknown until the late witness is reached', () => {
  const domains = Array.from({ length: 8 }, (_, i) => ({ variable: `v${i}`, values: ['0', '1'] }));
  const constraints = [{ id: 'all-ones', variables: domains.map(d => d.variable), allowed: [domains.map(() => '1')] }];
  expect(checkJoint(domains, constraints, 8)).toEqual({ status: 'unknown', reason: 'assignment-cap', assignmentsExamined: expected.capAssignments });
  expect(checkJoint(domains, constraints, 256)).toMatchObject({ status: 'compatible', assignmentsExamined: expected.lateWitnessAssignments });
});
test('C11 unavailable ineligible and stale sources block comparison', () => {
  for (const kind of ['removed', 'ineligible', 'stale']) {
    const state = states(attendance);
    if (kind === 'removed') state.delete('source-present');
    if (kind === 'ineligible') state.set('source-present', { revision: 'r1', eligible: false });
    if (kind === 'stale') state.set('source-present', { revision: 'r2', eligible: true });
    const r = compareContexts(attendance, [group(attendance)], state)[0];
    expect(r.alignment).toBe('unknown'); expect(r.joint).toBeUndefined(); expect(r.reason).toContain('source-');
  }
});
test('C12 different observers retain their attributed feelings', () => {
  const records = [account('a', ['joy']), account('b', ['sadness'])].map((a, i) => ({ ...a, property: 'feeling', observer: i ? 'Noor' : 'Mira' }));
  const aligned: Alignment = { ...group(records), observerRelative: true };
  expect(compareContexts(records, [aligned], states(records))[0]).toMatchObject({ alignment: 'separate', reason: 'distinct-attributed-observers' });
});
test('C13 unrelated groups retain independent compatibility verdicts', () => {
  const others = [account('c', ['quiet'], [set('occasion', ['D2'])]), account('d', ['quiet'], [set('occasion', ['D2'])])];
  const records = [...attendance, ...others];
  const result = compareContexts(records, [group(attendance), group(others, ['occasion'], 'g2')], states(records));
  expect(result.map(r => r.joint?.status)).toEqual(['conflict', 'compatible']);
});
test('C14 an unaligned account cannot poison a known comparison', () => {
  const records = [...attendance, { ...account('r3', ['present']), subject: null }];
  const result = compareContexts(records, [group(attendance)], states(records));
  expect(result[0].joint).toEqual(compareContexts(attendance, [group(attendance)], states(attendance))[0].joint!);
  expect(result[1]).toMatchObject({ recordIds: ['r3'], alignment: 'unknown', reason: 'no-reviewed-group' });
});
test('C15 reviewed overlap regions prevent transitive-overlap conflicts', () => {
  const records = [account('r1', ['0'], [time(0, 2)]), account('r2', ['0', '1'], [time(1, 3)]), account('r3', ['1'], [time(2, 4)])];
  const groups = [
    { ...group(records.slice(0, 2), ['time'], 'left'), region: [time(1, 2)] },
    { ...group(records.slice(1), ['time'], 'right'), region: [time(2, 3)] },
  ];
  const result = compareContexts(records, groups, states(records));
  expect(result.map(r => r.joint)).toMatchObject([{ status: 'compatible', witness: { value: '0' } }, { status: 'compatible', witness: { value: '1' } }]);
  expect(compareContexts(records, [group(records, ['time'])], states(records))[0].alignment).toBe('separate');
});
test('XC01 bounded validation rejects huge domains without visiting values', () => {
  const values = new Array(65);
  Object.defineProperty(values, 0, { get() { throw new Error('Unbounded validation'); } });
  expect(checkJoint([{ variable: 'A', values }], [], 10).status).toBe('unknown');
});
test('XC02 context scans never read past their cap', () => {
  const records = [...attendance];
  Object.defineProperty(records, 1, { get() { throw new Error('Read past cap'); } });
  const result = compareContexts(records, [], states([attendance[0]]), 1);
  expect(result.at(-1)?.reason).toBe('scan-cap');
});
test('XC03 supplied region cannot claim more than the actual overlap', () => {
  const records = [account('a', ['0'], [time(0, 2)]), account('b', ['0'], [time(1, 3)])];
  const bad = { ...group(records, ['time']), region: [time(0, 3)] };
  expect(compareContexts(records, [bad], states(records))[0].alignment).toBe('unknown');
});
test('XC04 first witness does not claim relational domain projection', () => {
  const result = checkJoint(binary.slice(0, 2), [triangle[0]], 4);
  expect(result).toMatchObject({ status: 'compatible', narrowing: { A: ['0', '1'], B: ['0', '1'] } });
});
test('XC05 field insertion order cannot change a reviewed overlap region', () => {
  const records = [account('a', ['0'], [time(0, 2)]), account('b', ['0'], [time(1, 3)])];
  const alignment: Alignment = { ...group(records, ['time']), region: [{ name: 'time', dimension: { until: 2, from: 1, kind: 'interval' } }] };
  expect(compareContexts(records, [alignment], states(records))[0].joint?.status).toBe('compatible');
});
test('XC06 undeclared record restrictions unknowns and unrestricted dimensions require review', () => {
  const variants: Dimension[][] = [
    [{ kind: 'set', values: ['reading'] }, { kind: 'set', values: ['dancing'] }],
    [{ kind: 'unknown' }, { kind: 'unknown' }],
    [{ kind: 'unrestricted' }, { kind: 'unrestricted' }],
  ];
  for (const dimensions of variants) {
    const records = attendance.map((a, i) => ({ ...a, context: [...a.context, { name: 'activity', dimension: dimensions[i] }] }));
    const result = compareContexts(records, [group(records)], states(records))[0];
    expect(result).toMatchObject({ alignment: 'unknown', reason: 'undeclared-record-dimension' });
    expect(result.joint).toBeUndefined();
  }
  const reviewed = attendance.map((a, i) => ({ ...a, context: [...a.context, set('activity', [i ? 'dancing' : 'reading'])] }));
  expect(compareContexts(reviewed, [group(reviewed, ['occasion', 'activity'])], states(reviewed))[0].alignment).toBe('separate');
});
test('XC07 only explicitly irrelevant undeclared dimensions may be ignored', () => {
  const records = attendance.map(a => ({ ...a, context: [...a.context, { name: 'activity', dimension: { kind: 'irrelevant' as const } }] }));
  expect(compareContexts(records, [group(records)], states(records))[0].joint?.status).toBe('conflict');
  const mixed = [records[0], { ...attendance[1], context: [...attendance[1].context, set('activity', ['dancing'])] }];
  const result = compareContexts(mixed, [group(mixed)], states(mixed))[0];
  expect(result).toMatchObject({ alignment: 'unknown', reason: 'undeclared-record-dimension' });
  expect(result.joint).toBeUndefined();
});
