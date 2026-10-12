import { CHECKER_VERSION, RULE, renderFixed, type CheckInput, type Fields } from "./index";

export const fields: Fields = {
  subject: { state: "known", value: "narrator" }, attribution: { state: "known", value: "narrator self-report" },
  circumstance: { state: "known", value: "tiring day" }, modality: { state: "known", value: "often" },
  comparison: { state: "known", value: "quiet conversation with close friends over a big gathering" },
};
export const sourceText = "After a tiring day, I often prefer quiet conversation with close friends over a big gathering. I'm unsure why it mattered.";
export const quote = "I often prefer quiet conversation with close friends over a big gathering.";
const presentation = { id: "same-atom", bytes: renderFixed(fields), fields, refs: [{ source: "episode-1", revision: "v1", quote }], kind: "preference", origin: "personal" };
export const faithful: CheckInput = { old: structuredClone(presentation), candidate: structuredClone(presentation), sources: [{ id: "episode-1", revision: "v1", bytes: sourceText, eligible: true }], assumptions: [], rule: { ...RULE }, checkerVersion: CHECKER_VERSION, mode: "fixed" };
export function changedField(name: keyof Fields, field: Fields[keyof Fields]): CheckInput {
  const value = structuredClone(faithful); value.candidate.fields[name] = field; value.candidate.bytes = renderFixed(value.candidate.fields); return value;
}
export const expected = { fieldNames: ["subject", "attribution", "circumstance", "modality", "comparison"], misleadingProse: "The narrator dislikes social occasions.", faithfulProse: "When tired, I often choose a quiet conversation with close friends rather than a big gathering." };
