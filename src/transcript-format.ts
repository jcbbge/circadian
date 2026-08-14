// transcript-format.ts — harness transcript shape normalizer.
//
// The JSONL row shape is ALREADY common across harnesses the extractors care
// about: Claude Code writes {message:{role,content:[blocks]}}, pi writes the
// same, and cursor writes {role, message:{content:[blocks]}} — the
// `entry?.message?.role ?? entry?.role` / `entry?.message?.content ??
// entry?.content` pair in sleep.ts, graze.ts and provenance.ts reads all
// three. What is NOT common is the TEXT inside a user block.
//
// Cursor wraps every user turn in its own envelope before it ever reaches
// the transcript:
//
//   <timestamp>Friday, Aug 14, 2026, 1:23 PM (UTC-5)</timestamp>
//   <user_query>
//   Read the file … and follow it exactly as your instructions.
//   </user_query>
//
// Measured over the cursor corpus (~/.cursor/projects/*/agent-transcripts):
// 389 <timestamp> + 390 <user_query> envelopes; no other structural wrapper
// appears (every other tag counted was user-pasted content).
//
// That envelope is not cosmetic. Two things break without this normalizer:
//
//  1. THE FLEET-DRONE GUARD (provenance.ts, the 2026-08-09 poisoning
//     post-mortem). Its strongest patterns are ANCHORED — /^you are (the|a|an)?
//     …(worker|orchestrat|…)/ and /^say ok\b/ — and they are anchored on
//     purpose (a human quoting a brief mid-session must not gate). Under the
//     cursor envelope the opening user turn begins "<timestamp>Friday, Aug…",
//     so every anchored pattern misses and cursor drone sessions deposit
//     episodes as if they were lived experience. Cursor is where the fleet
//     runs (cursor-fleet / cursor-spine), so this is the harness where the
//     guard matters most.
//
//  2. DRAFTING QUALITY. The envelope reaches the LLM prompt, and SLEEP's
//     verbatim-quote requirement invites the model to quote "<user_query>"
//     tags back into an episode that is then digested forever.
//
// Contract: pure, allocation-cheap, and a NO-OP on text that carries no
// cursor envelope — Claude Code and pi transcripts pass through
// byte-identical (asserted in transcript-format.test.ts).

/** Cursor's per-turn clock stamp. Always its own leading line. */
const CURSOR_TIMESTAMP = /<timestamp>[\s\S]*?<\/timestamp>[ \t]*\n?/g;

/** Cursor's user-message envelope, closed. */
const CURSOR_USER_QUERY = /<user_query>\s*([\s\S]*?)\s*<\/user_query>/g;

/** Same envelope with no closing tag — a graze delta can begin or end
 * mid-turn, and a half-open envelope must still unwrap rather than leak. */
const CURSOR_USER_QUERY_OPEN = /<user_query>[ \t]*\n?/g;
const CURSOR_USER_QUERY_CLOSE = /\n?[ \t]*<\/user_query>/g;

/**
 * Strip harness envelopes from one turn's text, leaving what the human (or
 * the assistant) actually said. Currently only cursor has an envelope; the
 * function is the single place a future harness's wrapper gets taught, so
 * the extractors never grow a per-harness branch.
 */
export function normalizeTurnText(text: string): string {
  if (!text) return text;
  // Fast path: nothing to do for the overwhelming majority of turns
  // (all of Claude Code and pi, and every cursor assistant turn). The test
  // matches "user_query>" rather than "<user_query>" on purpose — a delta
  // slice can open mid-turn and carry only the CLOSING tag, which an
  // "<user_query>" test misses and leaks straight into the prompt.
  if (text.indexOf("user_query>") === -1 && text.indexOf("<timestamp>") === -1) {
    return text;
  }
  let out = text.replace(CURSOR_TIMESTAMP, "");
  out = out.replace(CURSOR_USER_QUERY, "$1");
  // Whatever survives is a half-open envelope from a truncated slice.
  out = out.replace(CURSOR_USER_QUERY_OPEN, "").replace(CURSOR_USER_QUERY_CLOSE, "");
  return out.trim();
}

// ---------------------------------------------------------------------------
// FLEET-PACKET GATE — the cursor dialect of provenance.ts's drone guard.
//
// Measured before wiring anything (2026-08-14, full corpus of 1,085 cursor
// transcripts that carry a user turn): provenance.ts's DRONE_OPENINGS gated
// 11. Eleven. The other 1,074 open as fleet work — 800+ of them the literal
// cursor-shim handoff "Read the file …/.instr/<role>-<pane>.md now and follow
// it exactly as your instructions", the rest inline role packets ("# ARBITER
// (AGNT · Failure Triage)", "# COORDINATOR (CORD)") and the SDK tool-boundary
// preamble. Cursor is where the fleet runs, so cursor's corpus is ~99% drone.
//
// Wiring SLEEP to cursor's sessionEnd without this gate would replay the
// 2026-08-09 poisoning (134 drone episodes rewrote SELF into obedience
// doctrine) at an order of magnitude more volume. The gate is a PRECONDITION
// of the cursor write side, not a refinement of it.
//
// These patterns live here rather than in provenance.ts only because that
// file sits outside this unit's write partition; folding them into
// DRONE_OPENINGS is the right end state and costs nothing but a move.
const FLEET_PACKET_OPENINGS: RegExp[] = [
  // cursor-shim's instruction packet — the path IS the provenance, exactly as
  // provenance.ts already treats /\.madewell\/work\/packages\//.
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
 * Scope of the fleet-packet gate. Default "cursor": the gate applies only to
 * cursor transcripts, so Claude Code and pi keep the exact gating behavior
 * they had before this unit — a deliberate blast-radius choice, not a belief
 * that the other harnesses are clean. They are not: over the corpora on this
 * machine the same patterns identify 43 CC sessions and 71 pi sessions
 * (openings measured 2026-08-14: all of them "# CODER (AGNT) …" / "#
 * ORCHESTRATOR (ORCH) …" role packets, zero human sessions) that deposit
 * episodes today and should not. Set CIRCADIAN_FLEET_PACKET_GATE=all to close
 * that hole everywhere; it is the operator's call, not this unit's.
 */
function gateApplies(transcriptPath: string | undefined): boolean {
  const scope = (process.env.CIRCADIAN_FLEET_PACKET_GATE || "cursor").toLowerCase();
  if (scope === "off") return false;
  if (scope === "all") return true;
  return isCursorTranscript(transcriptPath);
}

/**
 * True when a session's opening user turn is a fleet instruction packet.
 * Same preprocessing contract as provenance.ts's isDroneOpening — first 600
 * chars, quoted spans blanked so a human QUOTING a packet is never gated —
 * and meant to be OR'd with it, never to replace it.
 *
 * transcriptPath decides scope (see gateApplies). Passing nothing means "no
 * scope information", which under the default scope gates nothing.
 */
export function isFleetPacketOpening(firstUserTurn: string, transcriptPath?: string): boolean {
  if (!gateApplies(transcriptPath)) return false;
  const head = normalizeTurnText(firstUserTurn).slice(0, 600).trim();
  if (!head) return false;
  const unquoted = head.replace(/"[^"]*"|'[^']*'|“[^”]*”|‘[^’]*’/g, " ");
  return FLEET_PACKET_OPENINGS.some((re) => re.test(unquoted));
}
