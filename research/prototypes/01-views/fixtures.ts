import { defaults, type Record, type SourceState } from './index.ts';
export const records: Record[] = [
  { id: 'a', revision: 'r1', claim: 'The coastal train had a broad view.', qualifications: [], rank: 1, scope: 'travel', time: 1, disagreements: [] },
  { id: 'b', revision: 'r1', claim: 'Mira prefers quiet.', qualifications: ['when reading', 'Mira reported this'], rank: 2, scope: 'family', time: 2,
    disagreements: [{ ref: { id: 'c', revision: 'r1' }, state: 'open' }] },
  { id: 'c', revision: 'r1', claim: 'Noor recalled music during reading.', qualifications: ['Noor reported this'], rank: 3, scope: 'family', time: 3,
    disagreements: [{ ref: { id: 'b', revision: 'r1' }, state: 'open' }] },
  { id: 'd', revision: 'r1', claim: 'Mira likes lively rooms.', qualifications: ['when dancing'], rank: 4, scope: 'family', disagreements: [] },
];
export const sources = new Map<string, SourceState>(records.map(r => [r.id, { revision: r.revision, eligible: true,
  text: `${r.claim} ${r.qualifications.join('. ')}. Original source ${r.id}.` }]));
export const family = { scope: 'family' };
export const limits = { ...defaults, chars: 2000, maxRecords: 2 };
export const expected = { firstTwo: ['b', 'c'], restricted: ['b', 'd'], familyCount: 3, all: ['a', 'b', 'c', 'd'] };
