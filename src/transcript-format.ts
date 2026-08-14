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

// The fleet-packet gate that used to live here (FLEET_PACKET_OPENINGS,
// isCursorTranscript, isFleetPacketOpening) moved to src/provenance.ts on
// 2026-08-14: it is a judgment about a session's PROVENANCE, not about a
// transcript's FORMAT, and provenance.ts is the single home for that call.
// This module stays the normalizer it is named for. provenance.ts imports
// normalizeTurnText from here; the dependency runs one way only.
