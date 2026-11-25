#!/usr/bin/env bun
/** Build additive transfer refs from approved committed records. This is Git
 * object plumbing, not a merge: no checkout or original ancestor is copied. */
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { join } from "node:path";

export const approvedMindPath = (path: string): boolean =>
  path === "beliefs.jsonl" || path === "digested.jsonl" ||
  /^beliefs\/[a-f0-9]{12}\.md$/.test(path) || /^episodes\/[a-zA-Z0-9][a-zA-Z0-9_.-]*\.md$/.test(path);
type Entry = { mode: string; kind: string; id: string; path: string };
type Side = "hive" | "m5";

function git(repo: string, args: string[], options: { input?: string; index?: string; optional?: boolean } = {}): string {
  const env = { ...process.env, GIT_NO_REPLACE_OBJECTS: "1", GIT_OPTIONAL_LOCKS: "0",
    GIT_AUTHOR_NAME: "Circadian", GIT_COMMITTER_NAME: "Circadian",
    GIT_AUTHOR_EMAIL: "circadian@localhost", GIT_COMMITTER_EMAIL: "circadian@localhost",
    ...(options.index ? { GIT_INDEX_FILE: options.index } : {}) };
  const result = spawnSync("git", ["-C", repo, ...args], {
    encoding: "utf8", input: options.input, env, maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "ignore"],
  });
  if (result.status !== 0 && !options.optional) throw new Error(`transfer git ${args[0]} failed`);
  return result.status === 0 ? result.stdout : "";
}
function tree(repo: string, ref: string): Entry[] {
  return git(repo, ["ls-tree", "--full-tree", "-rz", ref]).split("\0").filter(Boolean).map(row => {
    const tab = row.indexOf("\t");
    const [mode, kind, id] = row.slice(0, tab).split(" ");
    return { mode, kind, id, path: row.slice(tab + 1) };
  });
}
function userObjects(repo: string): Set<string> {
  const raw = git(repo, ["rev-list", "--all", "--ignore-missing", "--objects", "--", "USER.md"]);
  return new Set(raw.split("\n").flatMap(line => {
    const hit = /^(\w+) USER\.md$/.exec(line);
    return hit ? [hit[1]] : [];
  }));
}
function approved(entry: Entry, forbidden: Set<string>): boolean {
  return approvedMindPath(entry.path) && entry.mode === "100644" &&
    entry.kind === "blob" && !forbidden.has(entry.id);
}
function validate(repo: string, tip: string, forbidden: Set<string>): void {
  const history = git(repo, ["rev-list", "--parents", tip]).trim().split("\n");
  for (const line of history) {
    const [commit, ...parents] = line.split(" ");
    if (parents.length > 1 || tree(repo, commit).some(entry => !approved(entry, forbidden)))
      throw new Error("transfer ancestry contains a non-approved object");
  }
}

export function exportMind(repo: string, side: Side): string {
  if (side !== "hive" && side !== "m5") throw new Error("invalid transfer side");
  const ref = `refs/circadian/export/${side}`;
  const source = git(repo, ["rev-parse", "--verify", "HEAD"]).trim();
  const before = git(repo, ["rev-parse", "--verify", ref], { optional: true }).trim();
  const forbidden = userObjects(repo);
  if (before) validate(repo, before, forbidden);
  const files = tree(repo, source).filter(entry => approvedMindPath(entry.path));
  if (files.some(entry => !approved(entry, forbidden))) throw new Error("approved path has an invalid or machine-local object");
  const dir = git(repo, ["rev-parse", "--absolute-git-dir"]).trim();
  const index = join(dir, `index-transfer-${randomUUID()}`);
  try {
    git(repo, ["read-tree", "--empty"], { index });
    git(repo, ["update-index", "-z", "--index-info"], { index,
      input: files.map(entry => `100644 ${entry.id}\t${entry.path}\0`).join("") });
    const snapshot = git(repo, ["write-tree"], { index }).trim();
    if (before && snapshot === git(repo, ["rev-parse", before + "^{tree}"]).trim()) return before;
    const tip = git(repo, ["commit-tree", snapshot, ...(before ? ["-p", before] : []),
      "-m", "circadian: approved mind records"]).trim();
    git(repo, ["update-ref", ref, tip, before]);
    return tip;
  } finally { rmSync(index, { force: true }); }
}

if (import.meta.main) {
  const [side, repo] = process.argv.slice(2);
  if ((side !== "hive" && side !== "m5") || !repo) throw new Error("usage: mind-transfer.ts hive|m5 <mind repo>");
  console.log(exportMind(repo, side));
}
