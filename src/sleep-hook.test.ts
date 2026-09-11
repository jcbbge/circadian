import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "circadian-sleep-hook-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

for (const [name, path] of [["missing event path", undefined], ["missing file", join(root, "gone.jsonl")], ["directory", root]] as const) {
  test(`native hook reports degradation for ${name}`, async () => {
    const child = Bun.spawn([process.execPath, join(import.meta.dir, "sleep.ts")], {
      env: { ...process.env, CIRCADIAN_HOME: root, CIRCADIAN_INTERNAL: "0" },
      stdin: new Blob([JSON.stringify({ session_id: "hook-evidence", transcript_path: path })]),
      stdout: "pipe", stderr: "pipe",
    });
    const stderr = await new Response(child.stderr).text();
    expect(await child.exited).toBe(0); // Hooks must not prevent harness shutdown.
    expect(stderr).toContain("native session history unavailable");
    expect(stderr).not.toContain("empty session");
  });
}
