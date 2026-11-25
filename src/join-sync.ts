#!/usr/bin/env bun
/** Operator-run transfer commands. They do not change a live checkout or
 * install jobs; land and sleep remain explicit, gated operator actions. */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { exportMind, validateIncomingRef } from "./mind-transfer.ts";

function git(repo: string, ...args: string[]): string {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 }).trim();
}
function checkMind(mind: string): void {
  if (git(mind, "remote")) throw new Error("mind must have no configured remote");
  if (git(mind, "branch", "--show-current") !== "main") throw new Error("mind main must be checked out");
}
function ff(mind: string, from: string, to: string): void {
  if (from) git(mind, "merge-base", "--is-ancestor", from, to);
}
export function send(mind: string, side: "m5" | "hive", endpoint: string): string {
  checkMind(mind);
  const tip = exportMind(mind, side);
  const ref = `refs/circadian/export/${side}`;
  // Explicit refspec, no configured remote, no force, no tags. The relay
  // pre-receive hook validates the entire reachable projected ancestry.
  if (side === "m5" && !/^ssh:\/\/(?:[\w.-]+@)?[a-zA-Z0-9][\w.-]*(?::\d+)?\/[\w./-]+$/.test(endpoint))
    throw new Error("M5 transfer requires an explicit SSH URL");
  if (side === "hive" && !endpoint.startsWith("/")) throw new Error("hive transfer requires a local bare relay path");
  git(mind, "-c", "protocol.allow=never", "-c", `protocol.${side === "hive" ? "file" : "ssh"}.allow=always`,
    ...(side === "m5" ? ["-c", "core.sshCommand=ssh -o BatchMode=yes -o StrictHostKeyChecking=yes"] : []),
    "push", "--porcelain", "--", endpoint, `${ref}:${ref}`);
  return tip;
}
export function receive(mind: string, side: "m5" | "hive", endpoint: string): string {
  checkMind(mind);
  const target = `refs/circadian/import/${side}`;
  const pending = `refs/circadian/pending/${randomUUID()}`;
  try {
    git(mind, "-c", "protocol.allow=never", "-c", "protocol.file.allow=always",
      "fetch", "--no-tags", "--no-recurse-submodules", "--no-write-fetch-head",
      "--no-auto-maintenance", "--refmap=", "--", endpoint,
      `refs/circadian/export/${side}:${pending}`);
    let before = "";
    try { before = git(mind, "rev-parse", "--verify", "--quiet", target); } catch { /* first import */ }
    // Validate the complete incoming ancestry before exposing it to land.
    const tip = validateIncomingRef(mind, pending);
    ff(mind, before, tip);
    git(mind, "update-ref", target, tip, before || "");
    return tip;
  } finally {
    try { git(mind, "update-ref", "-d", pending); } catch { /* no fetch */ }
  }
}
if (import.meta.main) {
  const [command, mind, endpoint] = process.argv.slice(2);
  try {
    if (!mind || !endpoint) throw new Error("usage: join-sync.ts m5-send|hive-send|hive-receive <mind> <endpoint>");
    if (command === "m5-send") console.log(send(mind, "m5", endpoint));
    else if (command === "hive-send") console.log(send(mind, "hive", endpoint));
    else if (command === "hive-receive") console.log(receive(mind, "m5", endpoint));
    else throw new Error("unsupported join-sync command");
  } catch (e) { console.error((e as Error).message); process.exitCode = 1; }
}
