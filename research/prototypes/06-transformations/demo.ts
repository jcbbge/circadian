import { checkPresentation, compareFields, makeReceipt, verifyApplicability, type Receipt } from "./index";
import { changedField, expected, faithful } from "./fixtures";
export function demo() {
  const wrongModality = changedField("modality", { state: "known", value: "always" });
  const free = { ...structuredClone(faithful), mode: "free" as const }; free.candidate.bytes = expected.misleadingProse;
  const saved = makeReceipt(faithful) as Receipt;
  const edited = structuredClone(faithful); edited.candidate.bytes += " added";
  return { proposal: "06 transformations", input: "A qualified preference shortened under a fixed presentation rule", usefulResult: checkPresentation(faithful), challenge: checkPresentation(wrongModality), semanticBoundary: checkPresentation(free), laterInspection: verifyApplicability(saved, edited), simplerComparison: compareFields(wrongModality.old.fields, wrongModality.candidate.fields), comparisonConclusion: "Ordinary field equality detects the same modality change. Artifact binding separately detects an edited candidate. No semantic or downstream benefit has been measured." };
}
if (import.meta.main) console.log(JSON.stringify(demo(), null, 2));
