// echo.test.ts — echo redaction and provenance guards pinned against REAL
// session transcripts on disk (repo doctrine: no mocks): the actual Pi
// session where jrg diagnosed the flatline (its transcript contains both the
// injected wake payload and the assistant speaking the greeting), and the
// actual mind repo's greeting history.
import { describe, test, expect, afterAll } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";
import { missingMindFiles, evidenceName, mindDir } from "./test-evidence.ts";
import { execFileSync } from "child_process";
import { redactMindEcho } from "./sleep.ts";

const MIND = mindDir;
// Never inspect a developer's real Pi sessions. Evidence can be staged in this
// disposable directory by a fixture harness; an empty directory means skip.
const stagedSessions = process.env.CIRCADIAN_TEST_PI_SESSIONS_DIR;
const ownedSessions = !stagedSessions;
const PI_SESSIONS = stagedSessions
  ? fs.realpathSync(stagedSessions)
  : fs.mkdtempSync(path.join(tmpdir(), "circadian-pi-sessions-"));
if (path.relative(fs.realpathSync(tmpdir()), PI_SESSIONS).startsWith("..")) {
  throw new Error("CIRCADIAN_TEST_PI_SESSIONS_DIR must be a temp directory, never the real ~/.pi");
}
afterAll(() => { if (ownedSessions) fs.rmSync(PI_SESSIONS, { recursive: true, force: true }); });

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
    // include custom_message too — the wake payload rides in one. Production's
    // extractTranscriptText filters it out by role; including it here is
    // deliberate, so the redactor is tested against the WORST input it could
    // ever receive rather than the input it happens to get today.
    const content = e?.message?.content ?? e?.content;
    if (role !== "user" && role !== "assistant" && e?.type !== "custom_message") continue;
    const blocks = Array.isArray(content) ? content : [{ type: "text", text: String(content ?? "") }];
    const text = blocks.filter((b: any) => b?.type === "text" && typeof b.text === "string").map((b: any) => b.text).join("\n").trim();
    if (text) turns.push(`${role === "assistant" ? "Assistant: " : role === "user" ? "User: " : ""}${text}`);
  }
  return turns.join("\n\n");
}

/** PINNED BY CONTENT, not by "newest".
 *
 * This selector used to return the newest transcript in the directory, which
 * meant the test's subject changed every time anyone opened a session in this
 * repo — including the session running the suite. On 2026-07-24 both assertions
 * broke exactly that way: they pin phrases from the flatline-diagnosis session,
 * but `newest` had become the audit session running the tests. A fixture that
 * silently retargets is not a fixture; it is a random sample that occasionally
 * agrees with you, and a green suite that proves nothing is worse than a red one.
 *
 * Selecting by CONTENT is deterministic, self-describing, and fails loudly with
 * a real reason if the evidence ever leaves the disk. */
const FIXTURE_PHRASES = ["collapsing into passive reporting", "has this been working?"];

function pinnedFlatlineTranscript(): string {
  const files = fs.readdirSync(PI_SESSIONS).filter((f) => f.endsWith(".jsonl")).sort();
  for (const f of files) {
    const full = path.join(PI_SESSIONS, f);
    let text: string;
    try { text = fs.readFileSync(full, "utf8"); } catch { continue; }
    if (FIXTURE_PHRASES.every((p) => text.includes(p))) return full;
  }
  throw new Error(
    `no transcript in ${PI_SESSIONS} contains the flatline-diagnosis fixture phrases ` +
    `(${FIXTURE_PHRASES.map((p) => JSON.stringify(p)).join(", ")}) — the evidence this suite ` +
    `is pinned to is gone from disk; do not "fix" this by retargeting to the newest session`
  );
}

const missingEchoMind = missingMindFiles("greeting.md", ".git");
const missingEchoTranscript = `missing flatline-diagnosis Pi transcript (phrases: ${FIXTURE_PHRASES.join(", ")}) in temp sessions`;
const echoEvidence = [
  missingEchoMind,
  fs.readdirSync(PI_SESSIONS).some((f) => {
    if (!f.endsWith(".jsonl")) return false;
    const text = fs.readFileSync(path.join(PI_SESSIONS, f), "utf8");
    return FIXTURE_PHRASES.every((p) => text.includes(p));
  }) ? "" : missingEchoTranscript,
].filter(Boolean).join("; ");
test("a transcript with no mind payload passes through untouched", () => {
  // A clean transcript must survive regardless of whether the live evidence exists.
  const clean = "User: does the venue guard still hold?\n\nAssistant: yes — verified against the live row.";
  const { text, redactedLines } = redactMindEcho(clean, []);
  expect(redactedLines).toBe(0);
  expect(text).toBe(clean);
});

describe.skipIf(!!echoEvidence)(evidenceName("echo redaction against the real flatline-diagnosis session", echoEvidence), () => {
  const transcript = echoEvidence ? "" : extractTurns(pinnedFlatlineTranscript());
  const greetings = echoEvidence ? [] : realGreetings();

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

  test("the injected worldview body is cut too, not just the markers", () => {
    // THE HOLE THIS PINS (found 2026-07-24): the redactor stripped the
    // <mind:...> marker lines and the greeting sentences, then let all ~40k
    // chars of SELF.md and USER.md through untouched — doctrine, motifs,
    // working agreements, the private JRG file. Provenance-by-greeting cannot
    // catch it, because the payload's body lines are not greeting lines.
    // Feeding that to the episode drafter re-opens the autophagic loop the
    // whole redactor exists to sever.
    const { text } = redactMindEcho(transcript, greetings);
    for (const heading of ["## Who I am across sessions", "## Doctrine", "## Motifs", "## How we work"]) {
      expect(text).not.toContain(heading);
    }
    // Substance from the payload, not just its headings.
    expect(text).not.toContain("I am Circadian — the mind that persists");
    expect(text).not.toContain("PRIVATE: never leaves this machine");
  });

  test("redaction preserves the user's actual words — the work survives the cut", () => {
    const { text } = redactMindEcho(transcript, greetings);
    // jrg's real turns from the diagnosis session must survive verbatim.
    expect(text).toContain("has this been working?");
  });

  test("structural cut works even with no greeting history", () => {
    const { text, redactedLines } = redactMindEcho(transcript, []);
    expect(redactedLines).toBeGreaterThan(0);
    expect(text).not.toContain("## Doctrine");
  });
});
