#!/usr/bin/env bun
/** Dedicated bare Git relay for approved Circadian projections only. No mind
 * checkout, source history, USER.md, local paths, or configured mind remote. */
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { approvedMindPath } from "./mind-transfer.ts";

function git(repo: string, ...args: string[]): string {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
const shellQuote = (s: string) => "'" + s.replaceAll("'", "'\\''") + "'";
const zero = /^0{40,64}$/;
const refs = new Set(["refs/circadian/export/m5", "refs/circadian/export/hive"]);

export function validatePush(repo: string, lines: string): void {
  if (!lines.trim()) throw new Error("empty relay update");
  for (const line of lines.trim().split("\n")) {
    const fields = line.split(" ");
    if (fields.length !== 3) throw new Error("malformed relay update");
    const [old, next, ref] = fields;
    if (!refs.has(ref) || zero.test(next)) throw new Error("relay only accepts the two additive export refs");
    if (!zero.test(old)) {
      try { git(repo, "merge-base", "--is-ancestor", old, next); }
      catch { throw new Error("relay rejects non-fast-forward update"); }
    }
    const commits = git(repo, "rev-list", "--parents", next).split("\n");
    for (const row of commits) {
      const [commit, ...parents] = row.split(" ");
      if (parents.length > 1) throw new Error("relay rejects merge ancestry");
      const metadata = git(repo, "show", "-s", "--format=%an%x00%ae%x00%cn%x00%ce%x00%B", commit).split("\0");
      if (metadata.length !== 5 || metadata[0] !== "Circadian" || metadata[1] !== "circadian@localhost" ||
          metadata[2] !== "Circadian" || metadata[3] !== "circadian@localhost" ||
          metadata[4] !== "circadian: approved mind records") throw new Error("relay rejects source commit metadata");
      const entries = git(repo, "ls-tree", "--full-tree", "-rz", commit).split("\0").filter(Boolean);
      for (const entry of entries) {
        const match = /^(\d+) (\w+) ([a-f0-9]+)\t([^\0]+)$/.exec(entry);
        if (!match || match[1] !== "100644" || match[2] !== "blob" || !approvedMindPath(match[4]))
          throw new Error("relay rejects non-approved tree");
      }
    }
  }
}

if (import.meta.main) {
  const [command, arg] = process.argv.slice(2);
  try {
    if (command === "init" && arg) {
      const repo = resolve(arg);
      if (existsSync(repo)) throw new Error("refuse existing relay path");
      execFileSync("git", ["init", "--bare", repo], { stdio: "ignore" });
      chmodSync(repo, 0o700);
      git(repo, "config", "receive.denyNonFastForwards", "true");
      git(repo, "config", "receive.denyDeletes", "true");
      const hook = join(repo, "hooks", "pre-receive");
      writeFileSync(hook, `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(import.meta.filename)} check ${shellQuote(repo)}\n`, { mode: 0o700 });
      chmodSync(hook, 0o700);
      console.log(`relay ready: ${repo} (approved export refs only)`);
    } else if (command === "check" && arg) {
      validatePush(resolve(arg), await Bun.stdin.text());
    } else throw new Error("usage: join-relay.ts init|check <bare relay repo>");
  } catch (e) { console.error((e as Error).message); process.exitCode = 1; }
}
