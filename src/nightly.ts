#!/usr/bin/env bun
// Preserve each phase's failure without stranding successfully harvested episodes.
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { correlation, degraded, ok } from "./obs.ts";

export function runNightly(): number {
  const home = process.env.CIRCADIAN_HOME || join(homedir(), "circadian");
  const bun = process.env.CIRCADIAN_BUN_BIN || process.execPath;
  const corr = correlation("nightly");
  let failed = false;
  for (const [script, ...args] of [
    ["harvest.ts"],
    ["rem-popmem.ts", "--drain"],
    ["doctor.ts", "--alert"],
  ]) {
    const result = spawnSync(bun, [join(home, "src", script), ...args], {
      cwd: home, env: { ...process.env, CIRCADIAN_HOME: home }, stdio: "inherit",
    });
    const event = {
      process: "ops" as const, phase: "nightly", correlation_id: corr,
      context: { script, exit_code: result.status, signal: result.signal },
    };
    if (result.error || result.status !== 0) {
      failed = true;
      degraded({ ...event, summary: `${script} failed; remaining nightly phases will still run`,
        cause: result.error?.message || `exit ${result.status}, signal ${result.signal ?? "none"}`,
        next_action: "inspect this phase's events; successful work remains available to the following phases",
      });
    } else {
      ok({ ...event, summary: `${script} completed` });
    }
  }
  return failed ? 1 : 0;
}

if (import.meta.main) process.exitCode = runNightly();
