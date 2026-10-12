import { expand, makeView, simpleSelection } from './index.ts';
import { family, limits, records, sources } from './fixtures.ts';
export function demo() {
  return { name: 'Coordinated memory views', input: { records: records.map(r => r.id), selector: family, budgetUnit: 'serialized JSON characters' },
    useful: makeView(records, sources, family, limits),
    challenge: makeView(records, sources, family, { ...limits, chars: 470 }),
    sourceExpansion: expand([{ id: 'c', revision: 'r1' }], sources, 500),
    simplerSameInformation: simpleSelection(records, sources, family, 2),
    limitation: 'Selection equivalence is expected. Preservation and coverage policy add information to the rendered result; agent usefulness is unmeasured.' };
}
if (import.meta.main) console.log(JSON.stringify(demo(), null, 2));
