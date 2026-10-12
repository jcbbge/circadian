import type { Aid, Inputs, SourceState } from "./index";
export const ref = (id: string) => ({ id, revision: "v1" });
export const expectedSuggestion = [{ place: "G", window: [90, 105], tentative: true }];
export const expectedEvidence = ["a-mira", "a-noor", "g", "intention", "p-mira", "p-noor"];
export function fixture(): { inputs: Inputs; aid: Aid; states: { [id: string]: SourceState }; asOf: number } {
  const inputs: Inputs = {
    participants: ["Mira", "Noor"], occasion: "afternoon-1",
    preferences: ["Mira", "Noor"].map(participant => ({ participant, occasion: "afternoon-1", quiet: true, seating: true, source: ref(`p-${participant.toLowerCase()}`) })),
    availability: [
      { participant: "Mira", occasion: "afternoon-1", windows: [[60, 120]], source: ref("a-mira") },
      { participant: "Noor", occasion: "afternoon-1", windows: [[90, 150]], source: ref("a-noor") },
    ],
    places: [{ id: "G", quiet: true, seating: true, open: true, source: ref("g") }],
    intention: { minutes: 15, source: ref("intention") },
  };
  return { inputs, aid: { recipe: "shared-afternoon", participants: [...inputs.participants], occasion: inputs.occasion,
    bindings: { preferences: structuredClone(inputs.preferences) } },
    states: Object.fromEntries([...expectedEvidence, "h"].map(id => [id, { available: true, eligible: true, revision: "v1", validity: "current" }])), asOf: 0 };
}
