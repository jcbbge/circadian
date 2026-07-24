// echo.test.ts — echo redaction and provenance guards pinned against REAL
// session transcripts on disk (repo doctrine: no mocks): the actual Pi
// session where jrg diagnosed the flatline (its transcript contains both the
// injected wake payload and the assistant speaking the greeting), and the
// actual mind repo's greeting history.
import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { homedir } from "os";
import { execFileSync } from "child_process";
import { redactMindEcho } from "./sleep.ts";

const MIND = path.join(process.env.CIRCADIAN_HOME || path.join(homedir(), "circadian"), "mind");
const PI_SESSIONS = path.join(homedir(), ".pi", "agent", "sessions", "--Users-jrg-circadian--");

function realGreetings(): string[] {
  const texts = new Set<string>();
  const cur = fs.readFileSync(path.join(MIND, "greeting.md"), "utf8").trim();
  if (cur) texts.add(cur);
  const hashes = execFileSync("git", ["log", "--format=%H", "-n", "30", "--", "greeting.md"], { cwd: MIND, encoding: "utf8" });
  for (const h of hashes.split("\n").filter(Boolean)) {
    try {
      const g = execFileSync("git", ["show", `${h}:greeting.md`], { cwd: MIND, encoding: "utf8" }).trim();
      if (g) texts.add(g);
    } catch { /* absent at that revision */ }
  }
  return [...texts];
}

function extractTurns(transcriptPath: string): string {
  const lines = fs.readFileSync(transcriptPath, "utf8").split("\n").filter(Boolean);
  const turns: string[] = [];
  for (const line of lines) {
    let e: any;
    try { e = JSON.parse(line); } catch { continue; }
    const role = e?.message?.role ?? e?.role;
    // include custom_message too — the wake payload rides in one
    const content = e?.message?.content ?? e?.content;
    if (role !== "user" && role !== "assistant" && e?.type !== "custom_message") continue;
    const blocks = Array.isArray(content) ? content : [{ type: "text", text: String(content ?? "") }];
    const text = blocks.filter((b: any) => b?.type === "text" && typeof b.text === "string").map((b: any) => b.text).join("\n").trim();
    if (text) turns.push(text);
  }
  return turns.join("\n\n");
}

function newestRealTranscript(): string {
  const files = fs.readdirSync(PI_SESSIONS).filter((f) => f.endsWith(".jsonl"));
  files.sort();
  return path.join(PI_SESSIONS, files[files.length - 1]);
}

describe("echo redaction against the real flatline-diagnosis session", () => {
  const transcript = extractTurns(newestRealTranscript());
  const greetings = realGreetings();

  test("fixture sanity: the real transcript actually contains the echo", () => {
    // The session opened with the assistant speaking the injected greeting.
    expect(transcript).toContain("collapsing into passive reporting");
    expect(greetings.length).toBeGreaterThanOrEqual(2);
  });

  test("redaction removes every greeting sentence and wake block", () => {
    const { text, redactedLines } = redactMindEcho(transcript, greetings);
    expect(redactedLines).toBeGreaterThan(0);
    for (const g of greetings) {
      for (const line of g.split("\n")) {
        const frag = line.trim();
        if (frag.length < 30) continue;
        expect(text.toLowerCase()).not.toContain(frag.toLowerCase().slice(0, 60));
      }
    }
    expect(text).not.toMatch(/\[Circadian\] WAKE/);
    expect(text).not.toMatch(/<mind:/);
  });

  test("redaction preserves the user's actual words — the work survives the cut", () => {
    const { text } = redactMindEcho(transcript, greetings);
    // jrg's real turns from the diagnosis session must survive verbatim.
    expect(text).toContain("has this been working?");
    expect(text.length).toBeGreaterThan(transcript.length * 0.5);
  });

  test("no greetings → transcript passes through untouched", () => {
    const { text, redactedLines } = redactMindEcho(transcript, []);
    expect(redactedLines).toBe(0);
    expect(text).toBe(transcript);
  });
});
