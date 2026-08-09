// Provenance guards — which sessions may deposit memory.
//
// 2026-08-09 poisoning post-mortem: 134 fleet drone sessions (worker and
// orchestrator drills — "You are ws-c…", "Read and execute your brief",
// "Reply with exactly the word ACK") entered the mind as lived experience.
// The extractor attributed their briefs to jrg ("user-observed: jrg
// demands…") and by sheer recurrence the drills rewrote SELF into obedience
// doctrine: 26 of 48 rendered atoms, including all six "Who I am" lines,
// were drone-sourced. The words an orchestrator says to a worker are not
// the user's words. Drone sessions leave no letter.
//
// The gate reads only the session's OPENING user turn: a fleet session
// announces itself in its first breath; a human never opens that way.
// Later mentions of these phrases (jrg discussing a brief, this very
// post-mortem) never trigger the gate.

import { readFileSync } from "node:fs";

const DRONE_OPENINGS: RegExp[] = [
  // SELF-TALK.md rule 3: drills declare themselves. A session opening with
  // the literal [drill] marker is a wiring test by contract — never memory.
  /^\s*\[drill\]/i,
  /^you are (the |a |an )?[\w-]{1,60}\b[\s\S]{0,200}\b(worker|orchestrat|orch-|ws-[a-z0-9]+|telemetry sink|brief)/i,
  /read and execute/i,
  /execute (your|the|this) [\s\S]{0,60}brief/i,
  /reply with exactly/i,
  /^say ok\b/i,
  /\.madewell\/work\/packages\//,
  /claim to the tower board/i,
  /and then stop\.? do not/i,
];

/** True when a session's opening user turn is a worker/orchestrator brief.
 * Quoted spans are stripped first: a drone issues its commands, a human
 * quotes them ("we discussed 'Reply with exactly' earlier" must not gate). */
export function isDroneOpening(firstUserTurn: string): boolean {
  const head = firstUserTurn.slice(0, 600).trim();
  if (!head) return false;
  const unquoted = head.replace(/"[^"]*"|'[^']*'|“[^”]*”|‘[^’]*’/g, " ");
  return DRONE_OPENINGS.some((re) => re.test(unquoted));
}

/** First user turn from flattened "User: …\n\nAssistant: …" transcript text
 * (the shape extractTranscriptText produces). */
export function firstUserTurnFromText(transcriptText: string): string {
  const m = transcriptText.match(/(?:^|\n)User: ([\s\S]*?)(?=\n\n(?:User|Assistant): |$)/);
  return m?.[1] ?? "";
}

/** First user turn straight from a JSONL transcript file (graze path — the
 * delta may start mid-session, so the gate must look at the file's head). */
export function firstUserTurnFromTranscript(transcriptPath: string): string {
  let raw = "";
  try {
    raw = readFileSync(transcriptPath, "utf8");
  } catch {
    return "";
  }
  for (const line of raw.split("\n")) {
    if (!line) continue;
    let entry: any;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const role = entry?.message?.role ?? entry?.role;
    if (role !== "user") continue;
    const content = entry?.message?.content ?? entry?.content;
    const blocks = Array.isArray(content) ? content : [{ type: "text", text: String(content ?? "") }];
    const text = blocks
      .filter((b: any) => b?.type === "text" && typeof b.text === "string")
      .map((b: any) => b.text)
      .join("\n")
      .trim();
    if (text) return text;
  }
  return "";
}
