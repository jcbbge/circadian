import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findCodexTranscript, normalizeCodexTranscript } from "./circadian-codex.ts";

describe("circadian-codex", () => {
  test("normalizes Codex rollout messages into circadian transcript rows", () => {
    const dir = mkdtempSync(join(tmpdir(), "circadian-codex-test-"));
    try {
      const rollout = join(dir, "rollout-2026-10-25T23-39-09-session-1.jsonl");
      writeFileSync(rollout, [
        { type: "session_meta", payload: { session_id: "session-1", cwd: "/repo" } },
        { type: "response_item", payload: { type: "message", role: "developer", content: [{ type: "input_text", text: "ignore me" }] } },
        { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "fix it" }] } },
        { type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "fixed" }] } },
      ].map((row) => JSON.stringify(row)).join("\n") + "\n");

      const normalized = normalizeCodexTranscript(rollout, join(dir, "out"));
      expect(normalized).toMatchObject({ sessionId: "session-1", cwd: "/repo", turns: 2 });
      expect(readFileSync(normalized.path, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line))).toEqual([
        { message: { role: "user", content: [{ type: "text", text: "fix it" }] } },
        { message: { role: "assistant", content: [{ type: "text", text: "fixed" }] } },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("finds a rollout by session id under the Codex date tree", () => {
    const root = mkdtempSync(join(tmpdir(), "circadian-codex-sessions-"));
    try {
      const day = join(root, "2026", "10", "25");
      mkdirSync(day, { recursive: true });
      const rollout = join(day, "rollout-2026-10-25T23-39-09-session-2.jsonl");
      writeFileSync(rollout, "{}\n");
      expect(findCodexTranscript("session-2", root)).toBe(rollout);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
