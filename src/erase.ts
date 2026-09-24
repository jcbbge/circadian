#!/usr/bin/env bun
/** Destructive, operator-confirmed rewrite of the local mind repository.
 * No remote is supported; all local refs are rewritten and old objects pruned. */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseAtom, readAtoms, readLedger, foldWeights } from "./atoms.ts";
import { renderSelf } from "./render.ts";
import { correlation, ok, fail, idle } from "./obs.ts";

const git = (mind: string, ...args: string[]) => execFileSync("git", args, { cwd: mind, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const scrub = (text: string, needles: string[]) => needles.reduce((s, n) => s.split(n).join("[erased]"), text);

// Invoked by git filter-branch with a temporary checkout as cwd. Config is
// carried only in the process environment; never persisted in the mind repo.
function filterTree(config: { id: string; needles: string[] }): void {
  const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
  for (const file of files) {
    if (file === `beliefs/${config.id}.md`) {
      unlinkSync(file);
      continue;
    }
    if (lstatSync(file).isSymbolicLink()) {
      if (config.needles.some((n) => readlinkSync(file).includes(n))) throw new Error(`secret in symlink: ${file}`);
      continue;
    }
    if (!lstatSync(file).isFile()) continue;
    const buffer = readFileSync(file);
    if (buffer.includes(0)) {
      if (config.needles.some((n) => buffer.includes(Buffer.from(n)))) throw new Error(`secret in binary file: ${file}`);
      continue;
    }
    let text = buffer.toString("utf8");
    if (file === "beliefs.jsonl") text = text.split("\n").filter((line) => {
      if (!line) return false;
      try {
        const e = JSON.parse(line);
        return ![e.atom, e.winner, e.loser, e.a, e.b].includes(config.id) &&
          !(typeof e.edge === "string" && e.edge.split(":").includes(config.id));
      } catch { return true; }
    }).join("\n") + (text.endsWith("\n") ? "\n" : "");
    const redacted = scrub(text, config.needles);
    if (redacted !== buffer.toString("utf8")) writeFileSync(file, redacted);
  }
}

export function erase(mind: string, id: string, reason: string, yes = false): boolean {
  if (!/^[a-f0-9]{12}$/.test(id)) throw new Error("erase requires a 12-hex atom id");
  if (!reason.trim()) throw new Error("erase requires --reason");
  if (!existsSync(join(mind, ".git"))) throw new Error("mind must be a git repository");
  if (git(mind, "status", "--porcelain")) throw new Error("mind must be clean before erase");
  if (git(mind, "remote")) throw new Error("erase refuses a repo with a remote (no force-push policy)");
  if (!git(mind, "symbolic-ref", "--quiet", "HEAD")) throw new Error("detached HEAD");
  const path = join(mind, "beliefs", `${id}.md`);
  if (!existsSync(path)) throw new Error(`atom ${id} does not exist`);
  const atom = parseAtom(readFileSync(path, "utf8"));
  if (atom.id !== id) throw new Error("atom id mismatch");
  // Every slot in the removed atom is forgotten, not only its claim. Quotes
  // also occur in source episodes; remove all occurrences throughout history.
  const needles = [...new Set([atom.claim, atom.why, ...atom.quotes.map((q) => q.text)].filter(Boolean))].sort((a, b) => b.length - a.length);
  if (needles.some((n) => reason.includes(n))) throw new Error("reason must not repeat erased text");
  const refs = git(mind, "for-each-ref", "--format=%(refname)").split("\n").filter(Boolean);
  if (refs.some((r) => !r.startsWith("refs/heads/"))) throw new Error("erase requires only local branch refs; remove or resolve other refs first");
  console.log(`erase ${id}: remove atom, redact its claim/why/${atom.quotes.length} quote(s) in all reachable history across ${refs.length} local branch(es), remove its ledger events, prune old objects; record id and reason only in compost.md.`);
  if (!yes) { console.log("No changes made. Re-run with --yes to confirm."); return false; }

  const config = JSON.stringify({ id, needles });
  const command = `"${process.execPath}" "${import.meta.path}" --filter-tree`;
  const message = `"${process.execPath}" "${import.meta.path}" --filter-message`;
  const result = spawnSync("git", ["filter-branch", "--force", "--prune-empty", "--tree-filter", command,
    "--msg-filter", message, "--", "--all"], {
    cwd: mind, encoding: "utf8", env: { ...process.env, CIRCADIAN_ERASE_CONFIG: config, FILTER_BRANCH_SQUELCH_WARNING: "1" },
  });
  if (result.status !== 0) throw new Error(`history rewrite failed; backups preserved: ${result.stderr || result.stdout}`);
  const events = readLedger(join(mind, "beliefs.jsonl"));
  const { md, manifest } = renderSelf(readAtoms(join(mind, "beliefs")), foldWeights(events), undefined, { events });
  writeFileSync(join(mind, "SELF.md"), md);
  writeFileSync(join(mind, "render-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  const compost = join(mind, "compost.md");
  // Compost is historic, not a source for re-extraction. Remove any existing
  // occurrences before appending the audit record (without the erased text).
  const old = existsSync(compost) ? scrub(readFileSync(compost, "utf8"), needles) : "";
  writeFileSync(compost, old + `${old && !old.endsWith("\n") ? "\n" : ""}- erased ${id}: ${reason.trim()}\n`);
  git(mind, "add", "-A");
  git(mind, "commit", "--allow-empty", "-m", `erase: ${id}`);
  // filter-branch leaves refs/original and reflogs pointing to pre-erasure
  // commits; remove those before garbage collection so the old blobs die.
  for (const ref of git(mind, "for-each-ref", "--format=%(refname)", "refs/original").split("\n").filter(Boolean))
    git(mind, "update-ref", "-d", ref);
  git(mind, "reflog", "expire", "--expire=now", "--expire-unreachable=now", "--all");
  git(mind, "gc", "--prune=now");
  // Check every reachable blob and commit (not just the working tree).
  const objects = git(mind, "rev-list", "--objects", "--all").split("\n").filter(Boolean);
  for (const line of objects) {
    const oid = line.split(" ")[0];
    const blob = execFileSync("git", ["cat-file", "-p", oid], { cwd: mind });
    if (needles.some((n) => blob.includes(Buffer.from(n)))) throw new Error(`erased text remains in reachable object ${oid}`);
  }
  return true;
}

if (import.meta.main) {
  if (process.argv[2] === "--filter-tree") filterTree(JSON.parse(process.env.CIRCADIAN_ERASE_CONFIG!));
  else if (process.argv[2] === "--filter-message") {
    const config = JSON.parse(process.env.CIRCADIAN_ERASE_CONFIG!);
    const text = await new Response(Bun.stdin.stream()).text();
    process.stdout.write(scrub(text, config.needles));
  } else {
    const args = process.argv.slice(2);
    const i = args.indexOf("--reason"), m = args.indexOf("--mind");
    const reason = i < 0 ? "" : args[i + 1] ?? "";
    const mind = m < 0 ? join(process.env.CIRCADIAN_HOME || join(homedir(), "circadian"), "mind") : args[m + 1];
    const id = args.find((a) => /^[a-f0-9]{12}$/.test(a)) ?? "";
    const corr = correlation("erase");
    try {
      const done = erase(mind, id, reason, args.includes("--yes"));
      (done ? ok : idle)({ process: "erase", phase: "rewrite", correlation_id: corr, summary: done ? `erased ${id}` : `previewed ${id}`, context: { id, mind } });
    } catch (e) {
      fail({ process: "erase", phase: "rewrite", correlation_id: corr, summary: `could not erase ${id}`,
        context: { id, mind }, cause: (e as Error).message, next_action: "inspect mind refs and worktree before retrying; preserve backups after any failed rewrite", code: 1 });
    }
  }
}
