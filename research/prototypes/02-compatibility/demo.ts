import { checkJoint, compareContexts, pairwiseChecks } from './index.ts';
import { binary, group, readingDance, states, triangle } from './fixtures.ts';
export function demo() {
  return { name: 'Contextual compatibility', input: { fictionalAccounts: readingDance, declaredConstraints: triangle },
    useful: compareContexts(readingDance, [group(readingDance, ['activity'])], states(readingDance)),
    challenge: checkJoint(binary, triangle, 8),
    simplerSameInformation: pairwiseChecks(binary, triangle, 8),
    limitation: 'Reviewed meanings are stipulated. An ordinary exhaustive checker implements the same joint mathematics; truth and reader benefit are unmeasured.' };
}
if (import.meta.main) console.log(JSON.stringify(demo(), null, 2));
