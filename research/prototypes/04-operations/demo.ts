import { instantiate, plan, type Aid } from "./index";
import { fixture } from "./fixtures";
export function demo() {
  const { aid, inputs, states, asOf } = fixture();
  const supplied = { availability: inputs.availability, places: inputs.places, intention: inputs.intention };
  const useful = instantiate(aid, supplied, states, asOf, "applies");
  const otherSpecialization: Aid = { ...aid, bindings: { availability: inputs.availability } };
  return { input: "Reuse the reviewed quiet-conversation preferences while supplying today's calendars and place observations.",
    aid, useful,
    challenge: instantiate(aid, { ...supplied, availability: inputs.availability.slice(0, 1) }, states, asOf, "applies"),
    alternateBinding: instantiate(otherSpecialization, { preferences: inputs.preferences, places: inputs.places, intention: inputs.intention }, states, asOf, "applies"),
    simplerComparison: { result: plan(inputs, states, asOf), conclusion: "The ordinary full function produces the same answer. Persistent bindings expose remaining work; no speedup is claimed." } };
}
if (import.meta.main) console.log(JSON.stringify(demo(), null, 2));
