// provenance.test.ts — the session-provenance guards: which sessions may
// deposit memory at all. Covers both halves of the judgment that now lives in
// one file: isDroneOpening (the 2026-08-09 poisoning post-mortem patterns) and
// isFleetPacketOpening (the instruction-packet dialect, folded in from
// transcript-format.ts on 2026-08-14 along with its default flip to ALL
// harnesses).
import { describe, expect, test } from "bun:test";
import { isDroneOpening, isFleetPacketOpening, isCursorTranscript, firstUserTurnFromText } from "./provenance.ts";

const CURSOR_TRANSCRIPT =
  "/Users/jrg/.cursor/projects/Users-jrg-agent-core/agent-transcripts/2cfc1efe-3263-404d-b3c4-adfc48fbb852/2cfc1efe-3263-404d-b3c4-adfc48fbb852.jsonl";
const CC_TRANSCRIPT = "/Users/jrg/.claude/projects/-Users-jrg/96b13c2c-84e2-43c3-9b64-dccd795c7e39.jsonl";

/** Run `fn` with CIRCADIAN_FLEET_PACKET_GATE forced to `scope` (undefined =
 * unset), restoring whatever the ambient environment had. */
function withGateScope(scope: string | undefined, fn: () => void): void {
  const prev = process.env.CIRCADIAN_FLEET_PACKET_GATE;
  if (scope === undefined) delete process.env.CIRCADIAN_FLEET_PACKET_GATE;
  else process.env.CIRCADIAN_FLEET_PACKET_GATE = scope;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env.CIRCADIAN_FLEET_PACKET_GATE;
    else process.env.CIRCADIAN_FLEET_PACKET_GATE = prev;
  }
}

const PACKETS = [
  "Read the file /Users/jrg/cursor-shim/.instr/agnt-coder-w3a-p8.md now and follow it exactly as your instructions.",
  "Read the file /Users/jrg/.cursor/worktrees/wt-agnt-coder-w31-p8/brief.md now and follow it exactly as your instructions.",
  "# RESEARCHER (SAGT) You handle async / deferred / lookup work for an orchestrator.",
  "# ARBITER (AGNT · Failure Triage) You are a FRESH agent spawned to triage a failure.",
  "# COORDINATOR (CORD) You are ONE per project.",
  "Cursor SDK tool boundary: Call only Cursor SDK/MCP tools exposed to this session.",
];

// Openings measured on this machine's Claude Code and pi corpora (2026-08-14)
// — the 43 CC + 71 pi fleet sessions that were depositing episodes under the
// old cursor-only default.
const CC_AND_PI_PACKETS = [
  "# CODER (AGNT)\n\nYou are a coding agent. Implement exactly the unit described below.",
  "# ORCHESTRATOR (ORCH)\n\nYou own one committed unit of work.",
];

const HUMAN_OPENINGS = [
  "greetings",
  "say hi",
  "greetings kimi, you are the concierge operating inside of the herdr multiplexer",
  "hey claude, i have another meeting transcript to go over",
  "what happened to the tower write gate last night?",
  "read the file src/graze.ts and tell me what the throttle does",
];

describe("isDroneOpening — the 2026-08-09 post-mortem patterns", () => {
  test("gates worker/orchestrator brief openings", () => {
    const drones = [
      "[drill] wiring check, reply when ready",
      "You are ws-c, a worker on the popmem brief.",
      "Read and execute your brief at ~/briefs/x.md",
      "Reply with exactly the word ACK",
      "say ok when you have read it",
      "work out of /Users/jrg/.madewell/work/packages/unit-3",
      "post a claim to the tower board before you start",
    ];
    for (const d of drones) expect(isDroneOpening(d)).toBe(true);
  });

  test("never gates a human opening, including one QUOTING a drone phrase", () => {
    for (const h of HUMAN_OPENINGS) expect(isDroneOpening(h)).toBe(false);
    expect(isDroneOpening('we discussed "Reply with exactly" earlier — what came of it?')).toBe(false);
  });

  test("empty in, no gate", () => {
    expect(isDroneOpening("")).toBe(false);
    expect(isDroneOpening("   ")).toBe(false);
  });
});

describe("isCursorTranscript", () => {
  test("recognizes the cursor transcript home", () => {
    expect(isCursorTranscript(CURSOR_TRANSCRIPT)).toBe(true);
  });
  test("rejects Claude Code paths and undefined", () => {
    expect(isCursorTranscript(CC_TRANSCRIPT)).toBe(false);
    expect(isCursorTranscript(undefined)).toBe(false);
  });
});

describe("isFleetPacketOpening", () => {
  test("gates every measured cursor fleet packet shape", () => {
    withGateScope(undefined, () => {
      for (const p of PACKETS) expect(isFleetPacketOpening(p, CURSOR_TRANSCRIPT)).toBe(true);
    });
  });

  test("gates a packet still wearing the cursor envelope", () => {
    const enveloped =
      "<timestamp>Friday, Aug 14, 2026, 1:23 PM (UTC-5)</timestamp>\n<user_query>\n" +
      "Read the file /Users/jrg/cursor-shim/.instr/agnt-coder-w3a-p8.md now and follow it exactly as your instructions.\n</user_query>";
    withGateScope(undefined, () => {
      expect(isFleetPacketOpening(enveloped, CURSOR_TRANSCRIPT)).toBe(true);
    });
  });

  test("never gates a human opening", () => {
    withGateScope(undefined, () => {
      for (const h of HUMAN_OPENINGS) {
        expect(isFleetPacketOpening(h, CURSOR_TRANSCRIPT)).toBe(false);
        expect(isFleetPacketOpening(h, CC_TRANSCRIPT)).toBe(false);
      }
    });
  });

  test("never gates a human QUOTING a packet (quoted spans are blanked)", () => {
    const quoting = 'the spawn said "Read the file /Users/jrg/cursor-shim/.instr/x.md now and follow it exactly" — is that right?';
    withGateScope(undefined, () => {
      expect(isFleetPacketOpening(quoting, CURSOR_TRANSCRIPT)).toBe(false);
    });
  });
});

describe("CIRCADIAN_FLEET_PACKET_GATE scope", () => {
  test("DEFAULT (unset) gates every harness — Claude Code and pi included", () => {
    withGateScope(undefined, () => {
      for (const p of [...PACKETS, ...CC_AND_PI_PACKETS]) {
        expect(isFleetPacketOpening(p, CC_TRANSCRIPT)).toBe(true);
        expect(isFleetPacketOpening(p, undefined)).toBe(true);
      }
    });
  });

  test('explicit "all" is the same as the default', () => {
    withGateScope("all", () => {
      expect(isFleetPacketOpening(PACKETS[0], CC_TRANSCRIPT)).toBe(true);
      for (const h of HUMAN_OPENINGS) expect(isFleetPacketOpening(h, CC_TRANSCRIPT)).toBe(false);
    });
  });

  test('opt-out "cursor-only" narrows the gate back to cursor transcripts', () => {
    withGateScope("cursor-only", () => {
      expect(isFleetPacketOpening(PACKETS[0], CURSOR_TRANSCRIPT)).toBe(true);
      expect(isFleetPacketOpening(PACKETS[0], CC_TRANSCRIPT)).toBe(false);
      expect(isFleetPacketOpening(PACKETS[0], undefined)).toBe(false);
    });
  });

  test('legacy "cursor" is accepted as an alias for "cursor-only"', () => {
    withGateScope("cursor", () => {
      expect(isFleetPacketOpening(PACKETS[0], CURSOR_TRANSCRIPT)).toBe(true);
      expect(isFleetPacketOpening(PACKETS[0], CC_TRANSCRIPT)).toBe(false);
    });
  });

  test('opt-out "off" disables the gate everywhere', () => {
    withGateScope("off", () => {
      expect(isFleetPacketOpening(PACKETS[0], CURSOR_TRANSCRIPT)).toBe(false);
      expect(isFleetPacketOpening(PACKETS[0], CC_TRANSCRIPT)).toBe(false);
    });
  });

  test("an unrecognized value FAILS CLOSED to all — a typo must not reopen the mind", () => {
    withGateScope("cusror-only", () => {
      expect(isFleetPacketOpening(PACKETS[0], CC_TRANSCRIPT)).toBe(true);
    });
    withGateScope("", () => {
      // Empty string is falsy — it takes the default branch, which is "all".
      expect(isFleetPacketOpening(PACKETS[0], CC_TRANSCRIPT)).toBe(true);
    });
  });

  test("scope is read per call, never cached at import", () => {
    withGateScope("off", () => expect(isFleetPacketOpening(PACKETS[0], CC_TRANSCRIPT)).toBe(false));
    withGateScope("all", () => expect(isFleetPacketOpening(PACKETS[0], CC_TRANSCRIPT)).toBe(true));
  });
});

describe("firstUserTurnFromText", () => {
  test("pulls the opening user turn out of flattened transcript text", () => {
    const text = "User: # CODER (AGNT)\nimplement unit 4\n\nAssistant: on it\n\nUser: also fix the test";
    expect(firstUserTurnFromText(text)).toBe("# CODER (AGNT)\nimplement unit 4");
  });

  test("empty when there is no user turn", () => {
    expect(firstUserTurnFromText("Assistant: hello?")).toBe("");
  });

  test("the flattened-text path feeds the gate the string the gate expects", () => {
    const text = "User: # ORCHESTRATOR (ORCH)\n\nYou own one committed unit.\n\nAssistant: understood";
    withGateScope(undefined, () => {
      expect(isFleetPacketOpening(firstUserTurnFromText(text), CC_TRANSCRIPT)).toBe(true);
    });
  });
});
