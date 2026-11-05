import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

// Real child processes exercise orchestration only, never the live model or scheduler.
for (const failure of [null, "harvest.ts", "rem-popmem.ts", "doctor.ts", "missing-harvest"] as const) {
  test(`nightly runs all phases and preserves failure: ${failure ?? "none"}`, () => {
    const home = mkdtempSync(join(tmpdir(), "circ-nightly-"));
    try {
      mkdirSync(join(home, "src"));
      for (const script of ["harvest.ts", "rem-popmem.ts", "doctor.ts"]) {
        if (failure === "missing-harvest" && script === "harvest.ts") continue;
        writeFileSync(join(home, "src", script), `
          import { appendFileSync } from "node:fs";
          appendFileSync(${JSON.stringify(join(home, "calls.jsonl"))}, JSON.stringify({ script: ${JSON.stringify(script)}, args: process.argv.slice(2) }) + "\\n");
          process.exitCode = ${failure === script ? 1 : 0};
        `);
      }
      const result = spawnSync(process.execPath, [join(import.meta.dir, "nightly.ts")], {
        env: { ...process.env, CIRCADIAN_HOME: home, CIRCADIAN_BUN_BIN: process.execPath }, encoding: "utf8",
      });
      expect(result.status).toBe(failure ? 1 : 0);
      const calls = readFileSync(join(home, "calls.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
      expect(calls).toEqual([
        ...(failure === "missing-harvest" ? [] : [{ script: "harvest.ts", args: [] }]),
        { script: "rem-popmem.ts", args: ["--drain"] },
        { script: "doctor.ts", args: ["--alert"] },
      ]);
      const events = readFileSync(join(home, "logs/circadian.events.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
      expect(events.filter((e) => e.outcome === "degraded")).toHaveLength(failure ? 1 : 0);
    } finally { rmSync(home, { recursive: true, force: true }); }
  });
}
