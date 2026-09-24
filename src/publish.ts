#!/usr/bin/env bun
/** Single-ref publication. Metadata is local to this repository, never staged. */
import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { ok, idle, degraded } from "./obs.ts";
import { parseAtom } from "./atoms.ts";

export interface PublishIntent {
  id: string;
  /** paths relative to the mind root; replacements must be validated by the caller. */
  files?: Record<string, string>;
  /** Append whole lines (including newline) to plain files, on the current tip. */
  appends?: Record<string, string>;
  subject?: string;
}
export interface Receipt { id: string; commit: string; ts: string }

function git(mind: string, args: string[], opts: { input?: string; index?: string } = {}): string {
  return execFileSync("git", ["-C", mind, ...args], {
    encoding: "utf8", input: opts.input,
    env: opts.index ? { ...process.env, GIT_INDEX_FILE: opts.index } : process.env,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}
function atomic(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${randomUUID()}`;
  try { fs.writeFileSync(tmp, content); const fd = fs.openSync(tmp, "r"); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } fs.renameSync(tmp, file); }
  finally { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); }
}
function safePath(p: string): void {
  if (!p || path.isAbsolute(p) || p.split("/").some(x => x === ".." || x === "" || x === ".") || p.startsWith(".git/") || p === ".git" || p.startsWith("intents/") || p.startsWith("receipts/")) throw new Error(`invalid publication path: ${p}`);
}
function metadataPath(mind: string, dir: string, id: string): string {
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(id)) throw new Error("invalid request id");
  return path.join(mind, dir, `${id}.json`);
}
function blob(mind: string, ref: string, p: string): string {
  const r = Bun.spawnSync(["git", "-C", mind, "show", `${ref}:${p}`]);
  return r.exitCode === 0 ? r.stdout.toString() : "";
}
function current(mind: string): { ref: string; old: string } {
  const ref = git(mind, ["symbolic-ref", "HEAD"]);
  const old = git(mind, ["rev-parse", "--verify", ref]);
  return { ref, old };
}
function validate(intent: PublishIntent): void {
  for (const p of [...Object.keys(intent.files ?? {}), ...Object.keys(intent.appends ?? {})]) safePath(p);
  if (Object.keys(intent.files ?? {}).some(p => p in (intent.appends ?? {}))) throw new Error("file cannot be both replaced and appended");
  for (const [p, value] of Object.entries(intent.files ?? {})) {
    if ((p.startsWith("beliefs/") || p.startsWith("proposed/")) && p.endsWith(".md")) {
      const atom = parseAtom(value);
      if (p !== `beliefs/${atom.id}.md` && p !== `proposed/${atom.id}.md`) throw new Error(`atom path mismatches claim: ${p}`);
    }
  }
  for (const [p, value] of Object.entries(intent.appends ?? {})) {
    if (!value.endsWith("\n")) throw new Error("append must end with newline");
    if (p.endsWith(".jsonl")) for (const line of value.trimEnd().split("\n")) JSON.parse(line);
  }
}
function committedRequest(mind: string, ref: string, id: string): string {
  return git(mind, ["log", "-1", "--format=%H", `--grep=^Circadian-Request: ${id}$`, ref]);
}
function receipt(mind: string, id: string): Receipt | null {
  try { return JSON.parse(fs.readFileSync(metadataPath(mind, "receipts", id), "utf8")); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; }
}
/** Publish exactly one request. The intent is durable before any candidate is built.
 * On CAS loss, rebuild every touched blob from the new tip; never reuse an index.
 * A commit containing the request trailer is itself the crash-recovery receipt. */
export function publish(mind: string, intent: PublishIntent, beforeCAS?: () => void): Receipt {
  validate(intent);
  const intentPath = metadataPath(mind, "intents", intent.id);
  const receiptPath = metadataPath(mind, "receipts", intent.id);
  const found = receipt(mind, intent.id);
  if (found) {
    if (fs.existsSync(intentPath)) { syncPublished(mind, [...Object.keys(intent.files ?? {}), ...Object.keys(intent.appends ?? {})]); fs.unlinkSync(intentPath); }
    idle({ process: "ops", phase: "publish-receipt", summary: "request already published", context: { id: intent.id, commit: found.commit } }); return found;
  }
  fs.mkdirSync(path.dirname(intentPath), { recursive: true });
  try {
    const fd = fs.openSync(intentPath, "wx");
    try { fs.writeSync(fd, JSON.stringify({ ...intent, owner_pid: process.pid }) + "\n"); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
  }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    const stored = JSON.parse(fs.readFileSync(intentPath, "utf8"));
    const { owner_pid, ...same } = stored;
    if (JSON.stringify(same) !== JSON.stringify(intent)) throw new Error(`request id reused with different intent: ${intent.id}`);
  }
  const { ref } = current(mind);
  // A crash after CAS but before receipt is recovered by finding the request trailer.
  const prior = committedRequest(mind, ref, intent.id);
  if (prior) {
    const commit = prior;
    const done = { id: intent.id, commit, ts: new Date().toISOString() };
    atomic(receiptPath, JSON.stringify(done) + "\n");
    syncPublished(mind, [...Object.keys(intent.files ?? {}), ...Object.keys(intent.appends ?? {})]);
    fs.unlinkSync(intentPath);
    idle({ process: "ops", phase: "publish-replay", summary: "recovered published request", context: { id: intent.id, commit } });
    return done;
  }
  // A burst of SessionEnd publishers can move the ref repeatedly. Every CAS
  // loss rebuilds from the new tip; two attempts are not enough for five peers.
  for (let attempt = 0; attempt < 64; attempt++) {
    const { old } = current(mind);
    const index = path.join(git(mind, ["rev-parse", "--absolute-git-dir"]), `index-publish-${randomUUID()}`);
    const changed: Record<string, string> = { ...intent.files };
    for (const p of Object.keys(changed)) {
      if ((p.startsWith("beliefs/") || p.startsWith("proposed/")) && blob(mind, old, p)) delete changed[p]; // immutable atom
    }
    for (const [p, lines] of Object.entries(intent.appends ?? {})) changed[p] = blob(mind, old, p) + lines;
    try {
      git(mind, ["read-tree", old], { index });
      for (const [p, contents] of Object.entries(changed)) {
        const hash = git(mind, ["hash-object", "-w", "--stdin"], { input: contents });
        git(mind, ["update-index", "--add", "--cacheinfo", "100644", hash, p], { index });
      }
      const tree = git(mind, ["write-tree"], { index });
      const commit = git(mind, ["commit-tree", tree, "-p", old, "-m", `${intent.subject ?? "circadian: publish"}\n\nCircadian-Request: ${intent.id}`]);
      if (attempt === 0) beforeCAS?.();
      try { git(mind, ["update-ref", ref, commit, old]); }
      catch (e) {
        // The competing writer may have published the same request id.
        const winner = committedRequest(mind, ref, intent.id);
        if (winner) {
          const done = { id: intent.id, commit: winner, ts: new Date().toISOString() };
          atomic(receiptPath, JSON.stringify(done) + "\n");
          syncPublished(mind, [...Object.keys(intent.files ?? {}), ...Object.keys(intent.appends ?? {})]);
          fs.unlinkSync(intentPath);
          idle({ process: "ops", phase: "publish-replay", summary: "concurrent duplicate request already published", context: { id: intent.id, commit: done.commit } });
          return done;
        }
        degraded({ process: "ops", phase: "publish-conflict", summary: "CAS lost; rebuilding on new tip", context: { id: intent.id, old, attempt }, cause: "published ref advanced", next_action: attempt < 63 ? "retrying against new tip" : "retry request after inspecting competing writer" });
        if (attempt < 63) continue;
        throw e;
      }
      const done = { id: intent.id, commit, ts: new Date().toISOString() };
      atomic(receiptPath, JSON.stringify(done) + "\n");
      // Working files are a view, not the publication authority. Avoid stale
      // checkout overwrites by reading the latest ref under an exclusive lock.
      syncPublished(mind, Object.keys(changed));
      fs.unlinkSync(intentPath);
      ok({ process: "ops", phase: "publish", summary: "candidate published", context: { id: intent.id, commit, attempt } });
      return done;
    } finally { try { fs.unlinkSync(index); } catch {} }
  }
  throw new Error("CAS exhausted");
}
export function syncPublished(mind: string, paths: string[] = []): void {
  const lock = path.join(git(mind, ["rev-parse", "--absolute-git-dir"]), "circadian-checkout.lock");
  // mkdir is atomic. Do not break an unknown holder's lock: it could be alive.
  let held = false;
  for (let i = 0; i < 200; i++) {
    try { fs.mkdirSync(lock); held = true; break; }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e; Bun.sleepSync(10); }
  }
  if (!held) throw new Error("published checkout lock busy");
  try {
    const { old } = current(mind);
    for (const p of paths) {
      safePath(p);
      const content = blob(mind, old, p);
      if (!fs.existsSync(path.join(mind, p)) || fs.readFileSync(path.join(mind, p), "utf8") !== content) atomic(path.join(mind, p), content);
    }
    // update-ref changes the checked-out ref, but leaves its index at the old
    // tree (published files appear staged-deleted and untracked). Refresh only
    // a non-bare worktree on the ref we just synced, under the checkout lock.
    if (git(mind, ["rev-parse", "--is-bare-repository"]) === "false") {
      git(mind, ["read-tree", "HEAD"]);
      git(mind, ["update-index", "-q", "--refresh"]);
    }
  } finally { fs.rmdirSync(lock); }
}
/** Replay stale intents before a process reads the mind. Receipts expire after 30 days. */
export function recoverPublications(mind: string): void {
  const dir = path.join(mind, "intents");
  if (!fs.existsSync(path.join(mind, ".git"))) return;
  const receipts = path.join(mind, "receipts");
  if (fs.existsSync(receipts)) for (const name of fs.readdirSync(receipts).filter(n => n.endsWith(".json"))) {
    const file = path.join(receipts, name);
    if (Date.now() - fs.statSync(file).mtimeMs > 30 * 86400_000) fs.unlinkSync(file);
  }
  if (fs.existsSync(dir)) for (const name of fs.readdirSync(dir).filter(n => n.endsWith(".json"))) {
    const { owner_pid, ...intent } = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as PublishIntent & { owner_pid?: number };
    if (owner_pid) {
      try { process.kill(owner_pid, 0); continue; }
      catch (e) { if ((e as NodeJS.ErrnoException).code === "EPERM") continue; }
    }
    publish(mind, intent);
  }
  // Never checkout the whole mind: other organs may have unpublished work.
}
