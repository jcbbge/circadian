import { DEFAULT_LIMITS, type Interpretation, type Occasion, type Population, type Revisit, type Sources } from "./index";

export const limits = { ...DEFAULT_LIMITS };
export const sources: Sources = Object.fromEntries(["D1", "D2", "I1", "I2", "I3", "R12", "R23", "R31", "festival", "pair1", "pair2", "pair3", "Dana", "RD"].map(id => [id, { available: true, eligible: true, revision: "v1" }]));
const ref = (source: string) => ({ source, revision: "v1" });
export const dinner: Occasion = {
  id: "D1", ref: ref("D1"), narrative: "Narrator, Mira and Noor sat together. Noor cooked. We discussed Dana.",
  participants: [{ person: "narrator", role: "guest" }, { person: "Mira", role: "guest" }, { person: "Noor", role: "cook" }],
  mentioned: ["Dana"], coPresence: [["narrator", "Mira", "Noor"]], time: "2030-01-01",
};
export const secondDinner: Occasion = {
  ...dinner, id: "D2", ref: ref("D2"), narrative: "Mira cooked at our next dinner.", time: "2030-02-01",
  participants: [{ person: "narrator", role: "guest" }, { person: "Mira", role: "cook" }, { person: "Noor", role: "guest" }],
};
export const first: Interpretation = { id: "I1", ref: ref("I1"), occasion: { id: "D1" }, question: { id: "Q1", label: "why it mattered" }, author: "narrator", account: "I felt at ease during the silence.", reflectionTime: "2030-01-01", entry: true };
export const later: Interpretation = { ...first, id: "I2", ref: ref("I2"), account: "I now think permission to say nothing mattered most.", reflectionTime: "2030-03-01", entry: false };
export const third: Interpretation = { ...first, id: "I3", ref: ref("I3"), account: "The quiet still feels different now.", entry: false };
export const revisit: Revisit = { id: "R12", from: "I1", to: "I2", ref: ref("R12"), account: "The later reflection revisits the narrator's account of D1's silence." };
export const population: Population = { occasions: [dinner, secondDinner], interpretations: [first, later], revisits: [revisit] };
export const pairs: Occasion[] = [["narrator", "Mira"], ["Mira", "Noor"], ["Noor", "narrator"]].map((people, i) => ({ id: `pair${i + 1}`, ref: ref(`pair${i + 1}`), narrative: "A separate two-person meeting.", participants: people.map(person => ({ person, role: "guest" })), mentioned: [], coPresence: [people] }));
export const festival: Occasion = { id: "festival", ref: ref("festival"), narrative: "Mira attended in the morning; Noor attended in the evening.", participants: [{ person: "Mira", role: "visitor", interval: [8, 11] }, { person: "Noor", role: "visitor", interval: [18, 21] }], mentioned: [], coPresence: [] };
export const cyclic: Population = { ...population, interpretations: [first, later, third], revisits: [revisit, { ...revisit, id: "R23", from: "I2", to: "I3", ref: ref("R23") }, { ...revisit, id: "R31", from: "I3", to: "I1", ref: ref("R31") }] };
export const expected = { dinnerIDs: ["D1", "D2"], accountIDs: ["I1", "I2"], cooks: ["Noor", "Mira"] };
