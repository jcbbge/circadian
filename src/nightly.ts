#!/usr/bin/env bun
// Preserve each phase's failure without stranding successfully harvested episodes.
import { execFileSync, spawnSync } from "node:child_process";
import { receive } from "./join-sync.ts";
import { importLane, landLane } from "./lane.ts";
import { homedir } from "node:os";
import { join } from "node:path";
import { correlation, degraded, ok } from "./obs.ts";

export function runNightly(): number {
  const home = process.env.CIRCADIAN_HOME || join(homedir(), "circadian");
  const bun = process.env.CIRCADIAN_BUN_BIN || process.execPath;
  const corr = correlation("nightly");
  let failed = false;
  const mind = join(home, "mind");
  // Opt-in on hive only. Fetch a local relay ref, never connect to M5.
  // Transfer must land before REM reads main; leave M5's export untouched
  // and report failures without skipping the other nightly phases.
  let relay = "";
  try { relay = execFileSync("git", ["-C", mind, "config", "--local", "--get", "circadian.relayPath"], { encoding: "utf8" }).trim(); }
  catch { /* no join configured */ }
  if (relay) {
    try {
      if (!relay.startsWith("/")) throw new Error("relay path must be absolute and local to hive");
      const tip = receive(mind, "m5", relay);
      importLane(mind, "m5", { preserveLocalScopes: true });
      // An interrupted prior run can have committed the lane without landing;
      // retry that land rather than incorrectly declaring transfer covered.
      const landed = spawnSync("git", ["-C", mind, "merge-base", "--is-ancestor", "fm/m5", "main"]);
      if (landed.status !== 0) landLane(mind, "m5", { preserveLocalScopes: true });
      ok({ process: "ops", phase: "mind-transfer", correlation_id: corr,
        summary: "M5 projection available on hive main before REM", context: { tip } });
    } catch (e) {
      failed = true;
      degraded({ process: "ops", phase: "mind-transfer", correlation_id: corr,
        summary: "M5 projection not landed; local nightly phases continue",
        cause: (e as Error).message, next_action: "inspect fm/m5 and relay refs, then retry import/land without altering local edits", context: {} });
    }
  }
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
