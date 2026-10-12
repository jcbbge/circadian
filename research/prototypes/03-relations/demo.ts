import { composeReports, ordinaryReportJoin, type Report } from "./index";
import { fixture } from "./fixtures";
export function demo() {
  const { records, sources } = fixture();
  const input = "Where did Mira actually speak, and which account supports each result?";
  const query = { select: "by", person: "mira", project: "occasionSetting" } as const;
  const useful = composeReports(records, query, sources);
  const inconsistent = structuredClone(records);
  (inconsistent.find(r => r.id === "R1") as Report).declaredOccasionSetting = "cafe";
  return { input, useful, challenge: composeReports(inconsistent, query, sources, ["declaredOccasionSetting"]),
    simplerComparison: { precondition: "bounded reviewed eligible fixture", result: ordinaryReportJoin(records, "mira", "by"),
      conclusion: "The ordinary join answers the same positive query; the addition retains paths and explicit consistency/unknown reports." } };
}
if (import.meta.main) console.log(JSON.stringify(demo(), null, 2));
