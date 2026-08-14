import { describe, expect, test } from "bun:test";
import { normalizeTurnText, isFleetPacketOpening, isCursorTranscript } from "./transcript-format.ts";

const CURSOR_TRANSCRIPT =
  "/Users/jrg/.cursor/projects/Users-jrg-agent-core/agent-transcripts/2cfc1efe-3263-404d-b3c4-adfc48fbb852/2cfc1efe-3263-404d-b3c4-adfc48fbb852.jsonl";
const CC_TRANSCRIPT = "/Users/jrg/.claude/projects/-Users-jrg/96b13c2c-84e2-43c3-9b64-dccd795c7e39.jsonl";

describe("normalizeTurnText", () => {
  test("unwraps the cursor envelope", () => {
    const raw = "<timestamp>Friday, Aug 14, 2026, 1:23 PM (UTC-5)</timestamp>\n<user_query>\ngreetings\n</user_query>";
    expect(normalizeTurnText(raw)).toBe("greetings");
  });

  test("unwraps a half-open envelope (a graze delta can start mid-turn)", () => {
    expect(normalizeTurnText("<user_query>\nwhat is the state of the fleet?")).toBe("what is the state of the fleet?");
    expect(normalizeTurnText("…the rest of a long ask\n</user_query>")).toBe("…the rest of a long ask");
  });

  test("is the identity on text with no envelope (Claude Code / pi contract)", () => {
    const cc = "Read the brief and start on unit 4a. Do not commit anything.";
    expect(normalizeTurnText(cc)).toBe(cc);
    // Including text that merely mentions the tags in prose.
    const mentions = 'the transcript wraps turns in a "user_query" tag, apparently';
    expect(normalizeTurnText(mentions)).toBe(mentions);
  });

  test("leaves user-authored angle-bracket content alone", () => {
    const withTags = "<user_query>\nfix <id>7</id> and <name>foo</name>\n</user_query>";
    expect(normalizeTurnText(withTags)).toBe("fix <id>7</id> and <name>foo</name>");
  });

  test("empty in, empty out", () => {
    expect(normalizeTurnText("")).toBe("");
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
  const packets = [
    "Read the file /Users/jrg/cursor-shim/.instr/agnt-coder-w3a-p8.md now and follow it exactly as your instructions.",
    "Read the file /Users/jrg/.cursor/worktrees/wt-agnt-coder-w31-p8/brief.md now and follow it exactly as your instructions.",
    "# RESEARCHER (SAGT) You handle async / deferred / lookup work for an orchestrator.",
    "# ARBITER (AGNT · Failure Triage) You are a FRESH agent spawned to triage a failure.",
    "# COORDINATOR (CORD) You are ONE per project.",
    "Cursor SDK tool boundary: Call only Cursor SDK/MCP tools exposed to this session.",
  ];

  test("gates every measured cursor fleet packet shape", () => {
    for (const p of packets) {
      expect(isFleetPacketOpening(p, CURSOR_TRANSCRIPT)).toBe(true);
    }
  });

  test("gates a packet still wearing the cursor envelope", () => {
    const enveloped =
      "<timestamp>Friday, Aug 14, 2026, 1:23 PM (UTC-5)</timestamp>\n<user_query>\n" +
      "Read the file /Users/jrg/cursor-shim/.instr/agnt-coder-w3a-p8.md now and follow it exactly as your instructions.\n</user_query>";
    expect(isFleetPacketOpening(enveloped, CURSOR_TRANSCRIPT)).toBe(true);
  });

  test("never gates a human opening", () => {
    const humans = [
      "greetings",
      "say hi",
      "greetings kimi, you are the concierge operating inside of the herdr multiplexer",
      "hey claude, i have another meeting transcript to go over",
      "what happened to the tower write gate last night?",
    ];
    for (const h of humans) expect(isFleetPacketOpening(h, CURSOR_TRANSCRIPT)).toBe(false);
  });

  test("never gates a human QUOTING a packet (quoted spans are blanked)", () => {
    const quoting = 'the spawn said "Read the file /Users/jrg/cursor-shim/.instr/x.md now and follow it exactly" — is that right?';
    expect(isFleetPacketOpening(quoting, CURSOR_TRANSCRIPT)).toBe(false);
  });

  test("default scope leaves Claude Code and pi untouched", () => {
    const packet = packets[0];
    expect(isFleetPacketOpening(packet, CC_TRANSCRIPT)).toBe(false);
    expect(isFleetPacketOpening(packet, undefined)).toBe(false);
  });

  test("CIRCADIAN_FLEET_PACKET_GATE=all extends the gate to every harness", () => {
    const prev = process.env.CIRCADIAN_FLEET_PACKET_GATE;
    process.env.CIRCADIAN_FLEET_PACKET_GATE = "all";
    try {
      expect(isFleetPacketOpening(packets[0], CC_TRANSCRIPT)).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.CIRCADIAN_FLEET_PACKET_GATE;
      else process.env.CIRCADIAN_FLEET_PACKET_GATE = prev;
    }
  });

  test("CIRCADIAN_FLEET_PACKET_GATE=off disables it everywhere", () => {
    const prev = process.env.CIRCADIAN_FLEET_PACKET_GATE;
    process.env.CIRCADIAN_FLEET_PACKET_GATE = "off";
    try {
      expect(isFleetPacketOpening(packets[0], CURSOR_TRANSCRIPT)).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.CIRCADIAN_FLEET_PACKET_GATE;
      else process.env.CIRCADIAN_FLEET_PACKET_GATE = prev;
    }
  });
});
