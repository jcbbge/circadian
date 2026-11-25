#!/usr/bin/env bun
/** Local mind worktrees: a worker publishes to fm/<id>, landing consolidates on main. */
import * as fs from "node:fs";
import * as path from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readAtoms, readLedger, foldBeliefs, type LedgerEvent } from "./atoms.ts";
import { renderSelf } from "./render.ts";
import { correlation, fail, ok, idle } from "./obs.ts";
import { approvedMindPath, incomingMind, type Side } from "./mind-transfer.ts";

const ledgerDriver = `merge.circadian-ledger.driver=${JSON.stringify(process.execPath)} ${JSON.stringify(import.meta.filename)} merge-driver %O %A %B`;

// A live ledger outgrows Node's 1 MiB default output buffer (hive's was 1.9 MB on 2026-11-25); reading it
// must never fail for its size.
function gitOutput(repo: string, ...args: string[]): string {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], maxBuffer: 1 << 30 });
}
function git(repo: string, ...args: string[]): string {
  return gitOutput(repo, ...args).trim();
}
/** A commit's ledger. Empty only when that commit has no ledger; any other failure throws, so a failed read
 * can never pass for an empty ledger (2026-11-25: three lands wrote hive's ledger as empty). */
export function blob(repo: string, ref: string): string {
  const exists = Bun.spawnSync(["git", "-C", repo, "cat-file", "-e", `${ref}:beliefs.jsonl`]).exitCode === 0;
  return exists ? git(repo, "show", `${ref}:beliefs.jsonl`) : "";
}
function lines(raw: string): string[] { return raw.split("\n").filter(x => x.trim().length > 0); }
const hash = (line: string) => createHash("sha256").update(line).digest("hex");
function event(line: string): LedgerEvent | null {
  try { return JSON.parse(line) as LedgerEvent; } catch { return null; }
}
/** Stable union; a repeated line is the same event, not a second stack. */
export function unionLedger(...inputs: string[]): string {
  const unique = new Map<string, string>();
  for (const input of inputs) for (const line of lines(input)) unique.set(hash(line), line);
  return [...unique.values()].sort((a, b) => {
    const at = event(a)?.ts ?? "", bt = event(b)?.ts ?? "";
    return at < bt ? -1 : at > bt ? 1 : hash(a).localeCompare(hash(b));
  }).join("\n") + (unique.size ? "\n" : "");
}
export interface LaneConflict { loser: string; a: string; b: string; ts: string }
/** Compare only events newly introduced on each side of the fork. */
export function divergentSupersedes(base: string, main: string, lane: string): LaneConflict[] {
  const common = new Set(lines(base).map(hash));
  const added = (s: string) => lines(s).filter(l => !common.has(hash(l))).map(event)
    .filter((e): e is LedgerEvent => !!e && e.ev === "supersede" && !!e.loser && !!e.winner);
  const result = new Map<string, LaneConflict>();
  for (const a of added(main)) for (const b of added(lane)) {
    if (a.loser !== b.loser || a.winner === b.winner) continue;
    const [x, y] = [a.winner!, b.winner!].sort();
    result.set(`${a.loser}:${x}:${y}`, { loser: a.loser!, a: x, b: y, ts: [a.ts, b.ts].sort().at(-1)! });
  }
  return [...result.values()].sort((x, y) => x.loser.localeCompare(y.loser) || x.a.localeCompare(y.a) || x.b.localeCompare(y.b));
}
/** Neither supersession can stand: keep both winners active, record the open tension. */
export function consolidate(base: string, main: string, lane: string): { ledger: string; conflicts: LaneConflict[] } {
  const conflicts = divergentSupersedes(base, main, lane);
  const removed = new Set(conflicts.flatMap(c => [`${c.loser}:${c.a}`, `${c.loser}:${c.b}`]));
  const inherited = new Set(lines(base).map(hash));
  const combined = unionLedger(main, lane);
  const kept = lines(combined).filter(line => {
    const e = event(line);
    return inherited.has(hash(line)) || !(e?.ev === "supersede" && removed.has(`${e.loser}:${e.winner}`));
  });
  const contradictions = conflicts.map(c => JSON.stringify({ ev: "contradiction", a: c.a, b: c.b, ts: c.ts }));
  return { ledger: unionLedger([...kept, ...contradictions].join("\n")), conflicts };
}

type TransferOptions = { preserveLocalScopes?: boolean };
function clean(repo: string, preserveLocalScopes = false): void {
  // Publication metadata is local to the worktree, not part of the mind ref.
  // NUL framing preserves porcelain's leading space for an unstaged change.
  const dirty = gitOutput(repo, "status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all").split("\0")
    .filter(line => line && !/^\?\? (intents|receipts)\//.test(line) &&
      !(preserveLocalScopes && line === " M scopes.tsv"));
  if (dirty.length) throw new Error(`dirty worktree: ${repo}; inspect local changes before lane operation`);
}
function branch(id: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(id)) throw new Error("invalid lane id (use letters, digits, _ or -)");
  return `fm/${id}`;
}
function root(mind: string): string {
  const real = fs.realpathSync(mind);
  if (git(real, "rev-parse", "--show-toplevel") !== real) throw new Error("mind must be a git repository root");
  if (git(real, "remote")) throw new Error("mind must remain local (no remote)");
  return real;
}
function requireMain(mind: string, preserveLocalScopes = false): void {
  if (git(mind, "branch", "--show-current") !== "main") throw new Error("land/open requires main checked out in the mind root");
  clean(mind, preserveLocalScopes);
}
function lanePath(mind: string, id: string): string { return path.join(path.dirname(mind), "mind-lanes", id); }

export function openLane(mindPath: string, id: string): string {
  const mind = root(mindPath);
  requireMain(mind);
  return openFromMain(mind, id);
}
function openFromMain(mind: string, id: string): string {
  const ref = branch(id);
  if (git(mind, "branch", "--list", ref)) throw new Error(`lane ${ref} already exists`);
  const dest = lanePath(mind, id);
  if (fs.existsSync(dest)) throw new Error(`lane path exists: ${dest}`);
  // Attributes are part of the mind ref, so any future merge knows its ledger semantics.
  const attrs = path.join(mind, ".gitattributes");
  const current = fs.existsSync(attrs) ? fs.readFileSync(attrs, "utf8") : "";
  const missing = ["beliefs.jsonl", "digested.jsonl"].map(p => `${p} merge=circadian-ledger`)
    .filter(line => !current.split("\n").includes(line));
  if (missing.length) {
    fs.writeFileSync(attrs, current + (current && !current.endsWith("\n") ? "\n" : "") + missing.join("\n") + "\n");
    git(mind, "add", "--", ".gitattributes");
    git(mind, "commit", "--only", "-m", "mind: enable deterministic ledger union for worker lanes", "--", ".gitattributes");
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  git(mind, "worktree", "add", "-b", ref, dest, "main");
  return dest;
}

/** Validate before creating a lane. The ordinary land operation, not the
 * transfer, brings the projected records onto main. */
export function importLane(mindPath: string, side: Side, { preserveLocalScopes = false }: TransferOptions = {}): boolean {
  const mind = root(mindPath);
  requireMain(mind, preserveLocalScopes);
  const tip = incomingMind(mind, side), ref = branch(side);
  const exists = Boolean(git(mind, "branch", "--list", ref));
  const dest = exists ? lanePath(mind, side) : openFromMain(mind, side);
  if (exists && !fs.existsSync(dest)) git(mind, "worktree", "add", dest, ref);
  if (git(dest, "rev-parse", "--path-format=absolute", "--git-common-dir") !==
      git(mind, "rev-parse", "--path-format=absolute", "--git-common-dir") ||
      git(dest, "branch", "--show-current") !== ref) throw new Error(`expected ${ref} checked out at ${dest}`);
  clean(dest);
  if (Bun.spawnSync(["git", "-C", dest, "merge-base", "--is-ancestor", tip, ref]).exitCode === 0) return false;
  try {
    git(dest, "-c", ledgerDriver, "merge", "--allow-unrelated-histories", "--no-autostash", "--no-commit", "--no-ff", tip);
    git(dest, "commit", "-m", `lane: import approved ${side} records`);
    return true;
  } catch (e) {
    try { git(dest, "merge", "--abort"); } catch { /* no merge began */ }
    throw e;
  }
}

export function laneConflicts(mindPath: string, id: string): LaneConflict[] {
  const mind = root(mindPath), ref = branch(id);
  git(mind, "rev-parse", "--verify", ref);
  if (Bun.spawnSync(["git", "-C", mind, "merge-base", "--is-ancestor", ref, "main"]).exitCode === 0) return [];
  const base = git(mind, "merge-base", "main", ref);
  return divergentSupersedes(blob(mind, base), blob(mind, "main"), blob(mind, ref));
}

export function landLane(mindPath: string, id: string, { preserveLocalScopes = false }: TransferOptions = {}): { conflicts: LaneConflict[]; ledger: string } {
  const mind = root(mindPath), ref = branch(id);
  if (preserveLocalScopes && id !== "m5" && id !== "hive") throw new Error("scope preservation is only for mind transfer lanes");
  requireMain(mind, preserveLocalScopes);
  const dest = lanePath(mind, id);
  if (!fs.existsSync(dest)) throw new Error(`lane worktree missing: ${dest}`);
  clean(dest);
  const laneTip = git(mind, "rev-parse", "--verify", `refs/heads/${ref}^{commit}`);
  if (Bun.spawnSync(["git", "-C", mind, "merge-base", "--is-ancestor", laneTip, "main"]).exitCode === 0)
    throw new Error(`lane ${ref} has already landed`);
  const mainTip = git(mind, "rev-parse", "main");
  const base = git(mind, "merge-base", mainTip, laneTip);
  if (preserveLocalScopes) {
    const incoming = incomingMind(mind, id as Side);
    git(mind, "merge-base", "--is-ancestor", incoming, laneTip);
    const changed = gitOutput(mind, "diff", "--name-only", "--no-renames", "-z", base, laneTip).split("\0").filter(Boolean);
    if (changed.some(p => !approvedMindPath(p))) throw new Error("transfer lane changes a machine-local path");
  }
  const result = consolidate(blob(mind, base), blob(mind, mainTip), blob(mind, laneTip));
  // Git handles every other path with its normal 3-way rules. Never hide an
  // atom conflict or a conflict in authored memory behind an automatic choice.
  try {
    try { git(mind, "-c", ledgerDriver, "merge", "--no-autostash", "--no-commit", "--no-ff", laneTip); }
    catch (e) {
      const unmerged = git(mind, "diff", "--name-only", "--diff-filter=U").split("\n").filter(Boolean);
      if (!unmerged.length || unmerged.some(p => !["SELF.md", "render-manifest.json"].includes(p))) throw e;
      for (const p of unmerged) git(mind, "checkout", "--ours", "--", p);
      git(mind, "add", "--", ...unmerged);
    }
    // A land only adds events. A ledger shorter than main's means a read failed; refuse it.
    if (lines(result.ledger).length < lines(blob(mind, mainTip)).length)
      throw new Error("land would shrink the belief ledger; refusing");
    fs.writeFileSync(path.join(mind, "beliefs.jsonl"), result.ledger);
    const atoms = readAtoms(path.join(mind, "beliefs"));
    const events = readLedger(path.join(mind, "beliefs.jsonl"));
    const { states } = foldBeliefs(events);
    const { md, manifest } = renderSelf(atoms, states, undefined, { events });
    fs.writeFileSync(path.join(mind, "SELF.md"), md);
    fs.writeFileSync(path.join(mind, "render-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
    git(mind, "add", "--", "beliefs.jsonl", "SELF.md", "render-manifest.json");
    if (git(mind, "diff", "--name-only", "--diff-filter=U")) throw new Error("unresolved merge conflicts");
    if (git(mind, "rev-parse", "main") !== mainTip) throw new Error("main advanced during landing; retry against the new tip");
    if (preserveLocalScopes) {
      const staged = gitOutput(mind, "diff", "--cached", "--name-only", "--no-renames", "-z").split("\0").filter(Boolean);
      if (staged.some(p => !approvedMindPath(p) && p !== "SELF.md" && p !== "render-manifest.json"))
        throw new Error("transfer land would commit a machine-local path");
    }
    git(mind, "commit", "-m", `lane: land ${ref} (${result.conflicts.length} contradictions)`);
    return result;
  } catch (e) {
    try { git(mind, "merge", "--abort"); } catch { /* no merge began */ }
    throw e;
  }
}

/** Git's three-file merge driver: paths are temporary files, not live mind data. */
function mergeDriver(_base: string, ours: string, theirs: string): void {
  // Conflict conversion needs branch context, so the driver only unions here;
  // landLane does the final consolidation from the branch refs before commit.
  fs.writeFileSync(ours, unionLedger(fs.readFileSync(ours, "utf8"), fs.readFileSync(theirs, "utf8")));
}
export function laneMain(args: string[]): void {
  const corr = correlation("lane");
  const [command, ...tail] = args;
  const opt = tail.indexOf("--mind");
  const mind = opt < 0 ? path.join(process.env.CIRCADIAN_HOME || path.join(homedir(), "circadian"), "mind") : tail[opt + 1];
  const flags = opt < 0 ? tail : tail.filter((_, i) => i !== opt && i !== opt + 1);
  const scopeFlag = "--preserve-local-scopes";
  const preserveLocalScopes = flags.includes(scopeFlag);
  const positional = flags.filter(arg => arg !== scopeFlag);
  const id = positional[0];
  try {
    if (!mind || (opt >= 0 && !tail[opt + 1]) || positional.length > 1 || (command !== "conflicts" && !id) ||
        (preserveLocalScopes && (command !== "import" && command !== "land" || id !== "m5" && id !== "hive"))) {
      throw new Error("usage: circadian lane open|land <id> | import <m5|hive> | conflicts [id] [--mind <mind repo>] [--preserve-local-scopes (transfer import/land only)]");
    }
    let summary: string;
    if (command === "open") summary = `opened ${branch(id)} at ${openLane(mind, id)}`;
    else if (command === "import" && (id === "m5" || id === "hive")) {
      summary = importLane(mind, id, { preserveLocalScopes }) ? `imported ${branch(id)}; ready to land` : `already imported ${branch(id)}`;
    }
    else if (command === "land") {
      const r = landLane(mind, id, { preserveLocalScopes });
      summary = `landed ${branch(id)}: ${r.conflicts.length} contradiction(s)`;
    } else if (command === "conflicts") {
      const ids = id ? [id] : git(root(mind), "branch", "--list", "fm/*", "--format=%(refname:short)")
        .split("\n").filter(Boolean).map(ref => ref.slice(3));
      const conflicts = ids.flatMap(laneId => laneConflicts(mind, laneId).map(c => `${branch(laneId)} ${c.loser}: ${c.a} <> ${c.b}`));
      summary = conflicts.length ? conflicts.join("\n") : "no divergent supersedes";
    } else throw new Error("usage: circadian lane open|land <id> | conflicts [id] [--mind <mind repo>]");
    console.log(summary);
    const context = { mind, id, command };
    if (command === "conflicts" && summary === "no divergent supersedes") idle({ process: "lane", phase: command, correlation_id: corr, summary, context });
    else ok({ process: "lane", phase: command, correlation_id: corr, summary, context });
  } catch (e) {
    fail({ process: "lane", phase: command || "usage", correlation_id: corr, summary: "lane operation failed", context: { mind, id, command }, cause: (e as Error).message, next_action: "inspect the mind branch, worktree and merge state before retrying; preserve local changes" });
    process.exitCode = 1;
  }
}
if (import.meta.main) {
  if (process.argv[2] === "merge-driver") mergeDriver(process.argv[3], process.argv[4], process.argv[5]);
  else laneMain(process.argv.slice(2));
}
