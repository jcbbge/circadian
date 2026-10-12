import type { Account, Alignment, Constraint, Context, Domain, SourceState } from './index.ts';
export const set = (name: string, values: string[]): Context => ({ name, dimension: { kind: 'set', values } });
export const time = (from: number | null | 'unknown', until: number | null | 'unknown'): Context => ({ name: 'time', dimension: { kind: 'interval', from, until } });
export function account(id: string, values: string[], context: Context[] = [set('occasion', ['D1'])]): Account {
  return { id, source: { id: `source-${id}`, revision: 'r1' }, subject: 'Mira', property: 'attendance', values, context };
}
export function states(records: Account[]) { return new Map<string, SourceState>(records.map(a => [a.source.id, { revision: 'r1', eligible: true }])); }
export function group(records: Account[], dimensions = ['occasion'], id = 'g1'): Alignment {
  return { id, recordIds: records.map(a => a.id), subject: 'Mira', property: records[0]?.property ?? 'attendance', dimensions };
}
export const attendance = [account('present', ['present']), account('absent', ['absent'])];
export const readingDance = [account('reading', ['quiet'], [set('activity', ['reading'])]), account('dancing', ['lively'], [set('activity', ['dancing'])])]
  .map(a => ({ ...a, property: 'preferred-room-energy' }));
export const binary: Domain[] = ['A', 'B', 'C'].map(variable => ({ variable, values: ['0', '1'] }));
export const triangle: Constraint[] = [
  { id: 'A=B', variables: ['A', 'B'], allowed: [['0', '0'], ['1', '1']] },
  { id: 'B=C', variables: ['B', 'C'], allowed: [['0', '0'], ['1', '1']] },
  { id: 'A!=C', variables: ['A', 'C'], allowed: [['0', '1'], ['1', '0']] },
];
export const expected = { triangleAssignments: 8, capAssignments: 8, lateWitnessAssignments: 256,
  narrowedValue: '0', annotationTruth: 'absent' };
