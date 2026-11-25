#!/usr/bin/env bun
// Preserve each phase's failure without stranding successfully harvested episodes.
import { execFileSync, spawnSync } from "node:child_process";
import { receive, send } from "./join-sync.ts";
import { fetchHive } from "./mind-transfer.ts";
import { importLane, landLane } from "./lane.ts";
import { homedir } from "node:os";
import { join } from "node:path";
import { correlation, degraded, ok } from "./obs.ts";

export async function runNightly(): Promise<number> {
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
  // The M5's role (a hiveTransfer URL, set only there): hive consolidates both minds, so the M5 lands hive's
  // consolidated mind (keeping its machine-local edits), drafts its own episodes, sends them, and never runs
  // REM itself; two REMs fading the same beliefs is what the join removes (Josh, 2026-11-25).
  let hiveUrl = "";
  try { hiveUrl = execFileSync("git", ["-C", mind, "config", "--local", "--get", "circadian.hiveTransfer"], { encoding: "utf8" }).trim(); }
  catch { /* not the M5, or no join */ }
  if (hiveUrl) {
    try {
      if (!(await fetchHive(mind, hiveUrl))) throw new Error("hive's export could not be fetched");
      importLane(mind, "hive", { preserveLocalScopes: true });
      const landed = spawnSync("git", ["-C", mind, "merge-base", "--is-ancestor", "fm/hive", "main"]);
      if (landed.status !== 0) landLane(mind, "hive", { preserveLocalScopes: true });
      ok({ process: "ops", phase: "mind-transfer", correlation_id: corr, summary: "hive's consolidated mind landed on the M5", context: {} });
    } catch (e) {
      failed = true;
      degraded({ process: "ops", phase: "mind-transfer", correlation_id: corr,
        summary: "hive's mind not landed on the M5; local phases continue", cause: (e as Error).message,
        next_action: "inspect refs/circadian/import/hive and fm/hive, then retry without altering local edits", context: {} });
    }
  }
  const phases = hiveUrl ? [["harvest.ts"], ["doctor.ts", "--alert"]] : [["harvest.ts"], ["rem-popmem.ts", "--drain"], ["doctor.ts", "--alert"]];
  for (const [script, ...args] of phases) {
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
  // Publish this machine's approved records for the other side: the M5 its new episodes, hive its
  // consolidated mind for the M5's next land.
  if (hiveUrl || relay) {
    try {
      const tip = hiveUrl ? send(mind, "m5", hiveUrl) : send(mind, "hive", relay);
      ok({ process: "ops", phase: "mind-transfer", correlation_id: corr, summary: `${hiveUrl ? "M5" : "hive"} projection published to the relay`, context: { tip } });
    } catch (e) {
      failed = true;
      degraded({ process: "ops", phase: "mind-transfer", correlation_id: corr, summary: "projection not published to the relay",
        cause: (e as Error).message, next_action: "retry join-sync send; local episodes and commits remain", context: {} });
    }
  }
  return failed ? 1 : 0;
}

if (import.meta.main) process.exitCode = await runNightly();
