import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runBackfill, transcriptId } from "./backfill.ts";

// A fixture SLEEP worker, not a model: asserts the wire contract and writes a
// deterministic episode where SLEEP would publish one.
test("Pi and Claude fixtures backfill once by transcript id, not path; since and source filter", () => {
  const dir = mkdtempSync(join(tmpdir(), "circ-backfill-"));
  try {
    const home = join(dir, "home"), pi = join(dir, "pi"), claude = join(dir, "claude");
    mkdirSync(pi); mkdirSync(claude); mkdirSync(join(home, "mind", "episodes"), { recursive: true });
    const p = join(pi, "one.jsonl"), c = join(claude, "one.jsonl");
    writeFileSync(p, [
      { type: "session", id: "uuid-123", version: 3 },
      { type: "message", id: "a", message: { role: "user", content: "Hi" } },
      { type: "message", id: "b", parentId: "a", message: { role: "assistant", content: [{ type: "text", text: "Hello" }] } },
    ].map(JSON.stringify).join("\n"));
    writeFileSync(c, [
      { type: "user", sessionId: "claude-123", message: { role: "user", content: [{ type: "text", text: "Hi" }] } },
      { type: "assistant", sessionId: "claude-123", message: { role: "assistant", content: [{ type: "text", text: "Hello" }] } },
    ].map(JSON.stringify).join("\n"));
    const worker = join(dir, "worker.ts");
    writeFileSync(worker, `import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const { session_id } = JSON.parse(process.env.CIRCADIAN_SLEEP_EVENT!);
const ep = join(process.env.CIRCADIAN_HOME!, "mind", "episodes");
mkdirSync(ep, { recursive: true });
writeFileSync(join(ep, "2026-09-24-" + session_id + ".md"), "[backfilled]\\n");`);
    const opts = { home, piDir: pi, claudeDir: claude, sleep: worker };
    expect(runBackfill(["--source", "pi"], opts)).toEqual({ written: 1, skipped: 0, failed: 0 });
    expect(runBackfill([], opts)).toEqual({ written: 1, skipped: 1, failed: 0 });
    expect(runBackfill([], opts)).toEqual({ written: 0, skipped: 2, failed: 0 });
    expect(readdirSync(join(home, "mind", "episodes"))).toHaveLength(2);
    expect(readFileSync(join(home, "logs", "backfill.jsonl"), "utf8").trim().split("\n")).toHaveLength(2);
    expect(transcriptId(p, "pi")).not.toBe(transcriptId(c, "claude"));
    expect(runBackfill(["--since", "2099-01-01"], opts).written).toBe(0);
    expect(() => runBackfill(["--source", "unknown"], opts)).toThrow(/source/);
    expect(() => runBackfill(["--since", "yesterday"], opts)).toThrow(/since/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("failed SLEEP draft is retried; a published episode without manifest is reconciled", () => {
  const dir = mkdtempSync(join(tmpdir(), "circ-backfill-retry-"));
  try {
    const home = join(dir, "home"), pi = join(dir, "pi");
    mkdirSync(pi); mkdirSync(join(home, "mind", "episodes"), { recursive: true });
    writeFileSync(join(pi, "session.jsonl"), [
      { type: "session", id: "retry-uuid" },
      { type: "message", message: { role: "user", content: "Question" } },
      { type: "message", message: { role: "assistant", content: [{ type: "text", text: "Answer" }] } },
    ].map(JSON.stringify).join("\n"));
    const worker = join(dir, "worker.ts"), opts = { home, piDir: pi, claudeDir: join(dir, "absent"), sleep: worker };
    writeFileSync(worker, "process.exit(1);");
    expect(runBackfill([], opts).failed).toBe(1);
    expect(runBackfill([], opts).failed).toBe(1); // failure is not an idempotence mark
    const id = `backfill-pi-${transcriptId(join(pi, "session.jsonl"), "pi")}`;
    writeFileSync(join(home, "mind", "episodes", `2026-09-24-${id}.md`), "[backfilled]\n");
    expect(runBackfill([], opts)).toEqual({ written: 0, skipped: 1, failed: 0 });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
