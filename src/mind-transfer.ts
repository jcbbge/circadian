#!/usr/bin/env bun
/** Build additive transfer refs from approved committed records. This is Git
 * object plumbing, not a merge: no checkout or original ancestor is copied. */
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { join } from "node:path";

export const approvedMindPath = (path: string): boolean =>
  path === "beliefs.jsonl" || path === "digested.jsonl" ||
  /^beliefs\/[a-f0-9]{12}\.md$/.test(path) || /^episodes\/[a-zA-Z0-9][a-zA-Z0-9_.-]*\.md$/.test(path);
type Entry = { mode: string; kind: string; id: string; path: string };
export type Side = "hive" | "m5";

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

export function validateIncomingRef(repo: string, ref: string): string {
  if (!/^refs\/circadian\/(?:import\/(?:hive|m5)|pending\/[a-f0-9-]{36})$/.test(ref)) throw new Error("invalid incoming transfer ref");
  const tip = git(repo, ["rev-parse", "--verify", `${ref}^{commit}`]).trim();
  validate(repo, tip, userObjects(repo));
  return tip;
}
export function incomingMind(repo: string, side: Side): string {
  if (side !== "hive" && side !== "m5") throw new Error("invalid transfer side");
  return validateIncomingRef(repo, `refs/circadian/import/${side}`);
}

export const HIVE_FETCH_MS = 1500;
const hiveImport = "refs/circadian/import/hive";

/** Opt in on the M5 only, with Josh's verified SSH URL for a transfer-only
 * repository. No remote, tags, FETCH_HEAD, or local history negotiation. */
export function hiveTransfer(repo: string): string {
  return git(repo, ["config", "--local", "--get-all", "circadian.hiveTransfer"], { optional: true }).trim();
}

export async function fetchHive(repo: string, url: string): Promise<boolean> {
  if (!/^ssh:\/\/(?:[\w.-]+@)?[a-zA-Z0-9][\w.-]*(?::\d+)?\/[\w./-]+$/.test(url)) return false;
  const pending = `refs/circadian/pending/${randomUUID()}`;
  try {
    const fetched = await new Promise<boolean>(resolve => {
      const child = spawn("git", ["-C", repo, "-c", "protocol.allow=never", "-c", "protocol.ssh.allow=always",
        "-c", "fetch.negotiationAlgorithm=noop", "-c", "core.sshCommand=ssh -o BatchMode=yes -o StrictHostKeyChecking=yes",
        "fetch", "--no-tags", "--no-recurse-submodules", "--no-write-fetch-head", "--no-auto-maintenance", "--refmap=",
        "--", url, `refs/circadian/export/hive:${pending}`], {
        detached: true, stdio: "ignore", env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_NO_REPLACE_OBJECTS: "1" },
      });
      const timer = setTimeout(() => {
        if (child.pid) try { process.kill(-child.pid, "SIGKILL"); } catch { /* already exited */ }
      }, HIVE_FETCH_MS);
      child.once("error", () => { clearTimeout(timer); resolve(false); });
      child.once("close", code => { clearTimeout(timer); resolve(code === 0); });
    });
    if (!fetched) return false;
    const tip = git(repo, ["rev-parse", "--verify", `${pending}^{commit}`]).trim();
    const before = git(repo, ["rev-parse", "--verify", hiveImport], { optional: true }).trim();
    if (before) git(repo, ["merge-base", "--is-ancestor", before, tip]);
    git(repo, ["update-ref", hiveImport, tip, before]);
    return true;
  } catch { return false; }
  finally { git(repo, ["update-ref", "-d", pending], { optional: true }); }
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
