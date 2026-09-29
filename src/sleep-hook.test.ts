import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "circadian-sleep-hook-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

/** Fire sleep.ts as the SessionEnd hook against its own CIRCADIAN_HOME. */
async function sessionEnd(home: string, sessionId: string, transcriptPath: string | undefined) {
  const child = Bun.spawn([process.execPath, join(import.meta.dir, "sleep.ts")], {
    env: { ...process.env, CIRCADIAN_HOME: home, CIRCADIAN_INTERNAL: "0" },
    stdin: new Blob([JSON.stringify({ session_id: sessionId, transcript_path: transcriptPath })]),
    stdout: "pipe", stderr: "pipe",
  });
  const stderr = await new Response(child.stderr).text();
  const code = await child.exited;
  const events = readFileSync(join(home, "logs", "circadian.events.jsonl"), "utf8")
    .trim().split("\n").map((l) => JSON.parse(l))
    .filter((e) => e.process === "sleep" && e.phase === "session-end");
  return { code, stderr, events };
}

function home(name: string): string {
  const h = join(root, name);
  mkdirSync(join(h, "mind", "meals"), { recursive: true });
  return h;
}

for (const [name, path] of [["missing event path", undefined], ["directory", root]] as const) {
  test(`native hook reports degradation for ${name}`, async () => {
    const { code, stderr } = await sessionEnd(home(name.replace(/ /g, "-")), "hook-evidence", path);
    expect(code).toBe(0); // Hooks must not prevent harness shutdown.
    expect(stderr).toContain("native session history unavailable");
    expect(stderr).not.toContain("empty session");
  });
}

test("a session that was never prompted (no transcript, no graze state) records ok, not degraded", async () => {
  const h = home("never-prompted");
  const { code, events } = await sessionEnd(h, "never-prompted", join(h, "gone.jsonl"));
  expect(code).toBe(0);
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    outcome: "ok",
    summary: "no transcript: session was never prompted; nothing to sleep on",
  });
});

test("a missing transcript for a session graze saw stays degraded: that is lost history", async () => {
  const h = home("grazed");
  writeFileSync(join(h, "mind", "meals", ".grazed.state.json"), JSON.stringify({ lastCheckpointTs: Date.now(), byteOffset: 0, checkpoints: 0 }));
  const { code, stderr, events } = await sessionEnd(h, "grazed", join(h, "gone.jsonl"));
  expect(code).toBe(0);
  expect(stderr).toContain("native session history unavailable");
  expect(events).toHaveLength(1);
  expect(events[0].outcome).toBe("degraded");
});
