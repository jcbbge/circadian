import type { Record, SourceState } from "./index";

export const ref = (id: string) => ({ id, revision: "v1" });
export function fixture(): { records: Record[]; sources: { [id: string]: SourceState } } {
  const source = (id: string) => [ref(id)];
  return {
    sources: Object.fromEntries(["identity", "e1", "e2", "e3", "e4", "e5"].map(id => [id, { available: true, eligible: true, revision: "v1" }])),
    records: [
      { id: "mira", kind: "person", identity: "reviewed", sources: source("identity") },
      { id: "noor", kind: "person", identity: "reviewed", sources: source("identity") },
      { id: "m-dot", kind: "person", identity: "unresolved", sources: source("identity") },
      ...["garden", "cafe", "library", "home"].map(id => ({ id, kind: "place" as const, sources: source("identity") })),
      { id: "E1", kind: "episode", recordingLocation: "home", sources: source("e1") },
      { id: "E2", kind: "episode", recordingLocation: "home", sources: source("e2") },
      { id: "E3", kind: "episode", recordingLocation: "home", sources: source("e3") },
      { id: "E4", kind: "episode", recordingLocation: null, sources: source("e4") },
      { id: "O1", kind: "occasion", setting: "garden", sources: source("e1") },
      { id: "O2", kind: "occasion", setting: "cafe", sources: source("e2") },
      { id: "O3", kind: "occasion", setting: "library", sources: source("e3") },
      { id: "O4", kind: "occasion", setting: null, sources: source("e4") },
      { id: "R1", kind: "report", statement: "I prefer reading somewhere quiet on this afternoon.", episode: "E1", occasion: "O1", subjects: ["mira"], declaredOccasionSetting: "garden", sources: source("e1") },
      { id: "R2", kind: "report", statement: "Mira wanted to read at the cafe today.", episode: "E2", occasion: "O2", subjects: ["mira"], sources: source("e2") },
      { id: "R3", kind: "report", statement: "We both enjoyed reading here this evening.", episode: "E3", occasion: "O3", subjects: ["mira", "noor"], sources: source("e3") },
      { id: "R4", kind: "report", statement: "The room has six windows.", episode: "E4", occasion: "O4", subjects: [], sources: source("e4") },
      { id: "A1", kind: "attribution", report: "R1", speaker: "mira", sources: source("e1") },
      { id: "A2", kind: "attribution", report: "R2", speaker: "noor", sources: source("e2") },
      { id: "A3m", kind: "attribution", report: "R3", speaker: "mira", sources: source("e3") },
      { id: "A3n", kind: "attribution", report: "R3", speaker: "noor", sources: source("e3") },
      { id: "A4", kind: "attribution", report: "R4", speaker: null, sources: source("e4") },
    ],
  };
}
export const expected = {
  byMira: ["R1", "R3"], aboutMira: ["R1", "R2", "R3"],
  settingsByMira: [{ report: "R1", setting: "garden" }, { report: "R3", setting: "library" }],
  jointSpeakers: ["mira", "noor"],
};
