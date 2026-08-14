// The fleet-packet gate this file used to cover (isFleetPacketOpening,
// isCursorTranscript) moved to provenance.ts on 2026-08-14 — its tests moved
// with it, to provenance.test.ts. What stays here is the normalizer.
import { describe, expect, test } from "bun:test";
import { normalizeTurnText } from "./transcript-format.ts";

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
