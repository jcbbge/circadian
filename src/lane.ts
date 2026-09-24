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

function git(repo: string, ...args: string[]): string {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}
function blob(repo: string, ref: string): string {
  try { return git(repo, "show", `${ref}:beliefs.jsonl`); }
  catch { return ""; }
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

function clean(repo: string): void {
  // Publication metadata is local to the worktree, not part of the mind ref.
  const dirty = git(repo, "status", "--porcelain", "--untracked-files=all").split("\n")
    .filter(line => line && !/^\?\? (intents|receipts)\//.test(line));
  if (dirty.length) throw new Error(`dirty worktree: ${repo}; commit or stash before lane operation`);
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
function requireMain(mind: string): void {
  if (git(mind, "branch", "--show-current") !== "main") throw new Error("land/open requires main checked out in the mind root");
  clean(mind);
}
function lanePath(mind: string, id: string): string { return path.join(path.dirname(mind), "mind-lanes", id); }

export function openLane(mindPath: string, id: string): string {
  const mind = root(mindPath), ref = branch(id);
  requireMain(mind);
  if (git(mind, "branch", "--list", ref)) throw new Error(`lane ${ref} already exists`);
  const dest = lanePath(mind, id);
  if (fs.existsSync(dest)) throw new Error(`lane path exists: ${dest}`);
  // Attributes are part of the mind ref, so any future merge knows its ledger semantics.
  const attrs = path.join(mind, ".gitattributes");
  const current = fs.existsSync(attrs) ? fs.readFileSync(attrs, "utf8") : "";
  if (!current.split("\n").includes("beliefs.jsonl merge=circadian-ledger")) {
    fs.writeFileSync(attrs, current + (current && !current.endsWith("\n") ? "\n" : "") + "beliefs.jsonl merge=circadian-ledger\n");
    git(mind, "add", ".gitattributes");
    git(mind, "commit", "-m", "mind: enable deterministic ledger union for worker lanes");
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  git(mind, "worktree", "add", "-b", ref, dest, "main");
  return dest;
}

export function laneConflicts(mindPath: string, id: string): LaneConflict[] {
  const mind = root(mindPath), ref = branch(id);
  git(mind, "rev-parse", "--verify", ref);
  if (Bun.spawnSync(["git", "-C", mind, "merge-base", "--is-ancestor", ref, "main"]).exitCode === 0) return [];
  const base = git(mind, "merge-base", "main", ref);
  return divergentSupersedes(blob(mind, base), blob(mind, "main"), blob(mind, ref));
}

export function landLane(mindPath: string, id: string): { conflicts: LaneConflict[]; ledger: string } {
  const mind = root(mindPath), ref = branch(id);
  requireMain(mind);
  const dest = lanePath(mind, id);
  if (!fs.existsSync(dest)) throw new Error(`lane worktree missing: ${dest}`);
  clean(dest);
  if (Bun.spawnSync(["git", "-C", mind, "merge-base", "--is-ancestor", ref, "main"]).exitCode === 0)
    throw new Error(`lane ${ref} has already landed`);
  const mainTip = git(mind, "rev-parse", "main");
  const base = git(mind, "merge-base", "main", ref);
  const result = consolidate(blob(mind, base), blob(mind, "main"), blob(mind, ref));
  // Git handles every other path with its normal 3-way rules. Never hide an
  // atom conflict or a conflict in authored memory behind an automatic choice.
  const driver = `${JSON.stringify(process.execPath)} ${JSON.stringify(import.meta.filename)} merge-driver %O %A %B`;
  try {
    try { git(mind, "-c", `merge.circadian-ledger.driver=${driver}`, "merge", "--no-commit", "--no-ff", ref); }
    catch (e) {
      const unmerged = git(mind, "diff", "--name-only", "--diff-filter=U").split("\n").filter(Boolean);
      if (!unmerged.length || unmerged.some(p => !["SELF.md", "render-manifest.json"].includes(p))) throw e;
      for (const p of unmerged) git(mind, "checkout", "--ours", "--", p);
      git(mind, "add", "--", ...unmerged);
    }
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
  const positional = opt < 0 ? tail : tail.filter((_, i) => i !== opt && i !== opt + 1);
  const id = positional[0];
  try {
    if (!mind || (opt >= 0 && !tail[opt + 1]) || positional.length > 1 || (command !== "conflicts" && !id)) throw new Error("usage: circadian lane open|land <id> | conflicts [id] [--mind <mind repo>]");
    let summary: string;
    if (command === "open") summary = `opened ${branch(id)} at ${openLane(mind, id)}`;
    else if (command === "land") {
      const r = landLane(mind, id);
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
    fail({ process: "lane", phase: command || "usage", correlation_id: corr, summary: "lane operation failed", context: { mind, id, command }, cause: (e as Error).message, next_action: "inspect the mind branch, worktree and merge state; commit or stash local changes before retrying" });
  }
}
if (import.meta.main) {
  if (process.argv[2] === "merge-driver") mergeDriver(process.argv[3], process.argv[4], process.argv[5]);
  else laneMain(process.argv.slice(2));
}
