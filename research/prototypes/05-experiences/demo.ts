import { checkRevisit, jointOccasions, ordinaryIncidence, recallOccasion } from "./index";
import { dinner, first, later, pairs, population, revisit, sources } from "./fixtures";
export function demo() {
  const people = ["narrator", "Mira", "Noor"];
  return { proposal: "05 experiences", input: "One shared dinner and two supplied, explicitly occasion-linked interpretations", joint: jointOccasions(people, [dinner], sources), reflection: recallOccasion("D1", population, sources), withoutRevisit: recallOccasion("D1", { ...population, revisits: [] }, sources), challenge: jointOccasions(people, pairs, sources), boundaryChallenge: checkRevisit(first, { ...later, question: { id: "Q2", label: "why it mattered" } }, revisit, sources), simplerComparison: ordinaryIncidence(people, [dinner], sources), comparisonConclusion: "Ordinary incidence is an implementation alias, not independent comparison evidence. Checked links connect supplied accounts and reject mismatched questions. Direct occasion lookup already knows I2 is relevant; removing its revisit yields an explicit omission and incomplete coverage. This demonstrates neither lexical discovery nor measured retrieval benefit." };
}
if (import.meta.main) console.log(JSON.stringify(demo(), null, 2));
