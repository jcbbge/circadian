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
import { normalizeTurnText } from "./transcript-format.ts";

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

// ---------------------------------------------------------------------------
// FLEET-PACKET GATE — the instruction-packet dialect of the drone guard.
//
// Folded here from transcript-format.ts (2026-08-14) so session-provenance
// judgment has ONE home; transcript-format.ts stays the format/normalizer
// module it is named for and keeps only normalizeTurnText.
//
// Measured before wiring anything (2026-08-14, full corpus of 1,085 cursor
// transcripts that carry a user turn): DRONE_OPENINGS above gated 11. Eleven.
// The other 1,074 open as fleet work — 800+ of them the literal cursor-shim
// handoff "Read the file …/.instr/<role>-<pane>.md now and follow it exactly
// as your instructions", the rest inline role packets ("# ARBITER (AGNT ·
// Failure Triage)", "# COORDINATOR (CORD)") and the SDK tool-boundary
// preamble. These patterns identify 1,067 of those 1,085 with ZERO human
// false positives.
//
// The same patterns also match 43 Claude Code and 71 pi sessions on this
// machine — every one of them a "# CODER (AGNT) …" / "# ORCHESTRATOR (ORCH) …"
// instruction packet, zero human sessions — and those deposit episodes TODAY.
// That is the same class of contamination as the 2026-08-09 poisoning (134
// drone episodes rewrote SELF into obedience doctrine), still running.
//
// Hence the default below is ALL HARNESSES: a memory system that ingests drone
// transcripts by default is contaminated by default. A fleet instruction
// packet is a fleet instruction packet no matter which harness wrote the
// transcript, so harness is not a reason to lower the guard.
const FLEET_PACKET_OPENINGS: RegExp[] = [
  // cursor-shim's instruction packet — the path IS the provenance, exactly as
  // DRONE_OPENINGS already treats /\.madewell\/work\/packages\//.
  /\.instr\//,
  // The handoff sentence itself, independent of where the packet lives
  // (some spawns point at a path inside the worktree instead of .instr/).
  /^read the file\b[\s\S]{0,200}\bnow and follow it exactly/i,
  // Inline role packets: "# RESEARCHER (SAGT) …", "# COORDINATOR (CORD) …".
  /^#\s*[A-Z][A-Z0-9 .·\/-]{2,40}\((SAGT|AGNT|ORCH|CORD|ARBITER)\b/,
  // The SDK tool-boundary preamble prepended to shim-spawned panes.
  /^cursor sdk tool boundary/i,
];

/** A cursor transcript by its on-disk home:
 * ~/.cursor/projects/<slug>/agent-transcripts/<uuid>/<uuid>.jsonl */
export function isCursorTranscript(transcriptPath: string | undefined): boolean {
  return !!transcriptPath && /[\\/]\.cursor[\\/]projects[\\/].*[\\/]agent-transcripts[\\/]/.test(transcriptPath);
}

/**
 * Scope of the fleet-packet gate, from CIRCADIAN_FLEET_PACKET_GATE.
 *
 *   (unset) | "all"          — every harness. THE DEFAULT.
 *   "cursor-only" | "cursor" — cursor transcripts only (the pre-2026-08-14
 *                              blast-radius default, kept as an opt-out).
 *   "off"                    — gate disabled everywhere.
 *
 * Anything unrecognized FAILS CLOSED to "all": a typo in an env var must not
 * quietly reopen the mind to drone transcripts.
 */
function gateApplies(transcriptPath: string | undefined): boolean {
  const scope = (process.env.CIRCADIAN_FLEET_PACKET_GATE || "all").trim().toLowerCase();
  if (scope === "off") return false;
  if (scope === "cursor-only" || scope === "cursor") return isCursorTranscript(transcriptPath);
  return true;
}

/**
 * True when a session's opening user turn is a fleet instruction packet.
 * Same preprocessing contract as isDroneOpening — first 600 chars, quoted
 * spans blanked so a human QUOTING a packet is never gated — plus
 * normalizeTurnText, because cursor's <timestamp>/<user_query> envelope would
 * otherwise push the packet off every anchored pattern. Meant to be OR'd with
 * isDroneOpening, never to replace it.
 *
 * transcriptPath only narrows scope under the "cursor-only" opt-out; under the
 * default it is informational, so omitting it gates on the text alone.
 */
export function isFleetPacketOpening(firstUserTurn: string, transcriptPath?: string): boolean {
  if (!gateApplies(transcriptPath)) return false;
  const head = normalizeTurnText(firstUserTurn).slice(0, 600).trim();
  if (!head) return false;
  const unquoted = head.replace(/"[^"]*"|'[^']*'|“[^”]*”|‘[^’]*’/g, " ");
  return FLEET_PACKET_OPENINGS.some((re) => re.test(unquoted));
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
