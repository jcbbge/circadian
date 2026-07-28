// wake.test.ts — popmem WS-F: verifies the REM catch-up spawn target was
// repointed at rem-popmem.ts. wake.ts's own runHook() fires unconditionally
// at import time (it is a SessionStart hook script, not import-safe) — so
// this is a source-text assertion on the spawn call itself, never a live
// import or a live spawn (per the brief's done-when: "the spawn target
// string, not a live spawn").
import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const WAKE_SRC = fs.readFileSync(path.join(import.meta.dir, "wake.ts"), "utf8");

describe("wake.ts REM catch-up spawn target", () => {
  test("spawns rem-popmem.ts, not rem.ts", () => {
    const spawnCallMatch = WAKE_SRC.match(/const child = spawn\(bun, \[[^\]]+\]/);
    expect(spawnCallMatch).not.toBeNull();
    const spawnCall = spawnCallMatch![0];
    expect(spawnCall).toContain("src/rem-popmem.ts");
    expect(spawnCall).toContain("--if-due");
  });

  test("the old rem.ts spawn invocation string is gone", () => {
    // A prose mention of rem.ts in a comment (documenting the retirement) is
    // fine; the OLD spawn argv literal must not remain anywhere in the file.
    expect(WAKE_SRC).not.toContain(`"src/rem.ts"), "--if-due"`);
  });

  test("still fires --if-due (catch-up semantics unchanged by the repoint)", () => {
    const spawnCallMatch = WAKE_SRC.match(/const child = spawn\(bun, \[[^\]]+\]/)!;
    expect(spawnCallMatch[0]).toMatch(/--if-due/);
  });
});
