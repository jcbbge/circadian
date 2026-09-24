#!/usr/bin/env bun
/** Reconstitute a committed mind without checking it out or modifying it.
 * NOW.md is an authored surface (SLEEP writes it); SELF.md is the deterministic
 * fold of the committed atom population. Neither reads the working tree.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { contradictionEdge, foldWeights, parseAtom, type Atom, type LedgerEvent } from "./atoms.ts";
import { renderSelf } from "./render.ts";
import { correlation, fail, ok } from "./obs.ts";

function git(repo: string, ...args: string[]): Buffer {
  const result = spawnSync("git", ["-C", repo, ...args], { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`git ${args[0]} failed: ${result.error?.message ?? result.stderr.toString().trim()}`);
  return result.stdout;
}

export interface CheckoutResult { sha: string; self: string; now: string; atoms: number; weight: number }

/** Only objects from the named commit are inputs; dirty/untracked files are irrelevant. */
export function checkout(repo: string, ref = "HEAD"): CheckoutResult {
  // Reject paths inside a parent git repo: this must be a mind repo itself.
  const root = realpathSync(repo);
  if (git(root, "rev-parse", "--show-toplevel").toString().trim() !== root) throw new Error("path is not a git repository root");
  const sha = git(root, "rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`).toString().trim();
  if (!/^[a-f0-9]{40,64}$/.test(sha)) throw new Error("ref did not resolve to a commit");
  const names = new Set(git(root, "ls-tree", "-r", "--name-only", "-z", sha).toString().split("\0"));
  const blob = (name: string) => git(root, "show", `${sha}:${name}`).toString("utf8");
  const atoms: Atom[] = [];
  for (const name of [...names].filter((n) => /^beliefs\/[^/]+\.md$/.test(n)).sort()) {
    const atom = parseAtom(blob(name));
    if (name !== `beliefs/${atom.id}.md`) throw new Error(`atom id mismatch: ${name}`);
    atoms.push(atom);
  }
  const events: LedgerEvent[] = [];
  if (names.has("beliefs.jsonl")) {
    for (const [i, line] of blob("beliefs.jsonl").split("\n").entries()) {
      if (!line.trim()) continue;
      let ev: LedgerEvent;
      try { ev = JSON.parse(line); } catch { throw new Error(`ledger line ${i + 1} is not JSON`); }
      if (!ev || typeof ev !== "object" || !["stack", "decay", "potentiate", "supersede", "renorm", "contradiction", "resolve"].includes(ev.ev) ||
          ((ev.ev === "stack" || ev.ev === "potentiate") && (typeof ev.atom !== "string" || !atoms.some((a) => a.id === ev.atom))) ||
          (ev.ev === "supersede" && (typeof ev.winner !== "string" || typeof ev.loser !== "string" || ev.winner === ev.loser || !atoms.some((a) => a.id === ev.winner) || !atoms.some((a) => a.id === ev.loser))) ||
          (ev.ev === "contradiction" && (typeof ev.a !== "string" || typeof ev.b !== "string" || ev.a === ev.b || !atoms.some((a) => a.id === ev.a) || !atoms.some((a) => a.id === ev.b))) ||
          (ev.ev === "resolve" && (typeof ev.edge !== "string" || typeof ev.winner !== "string" || ev.edge.split(":").length !== 2 || ev.edge.split(":")[0] === ev.edge.split(":")[1] || ev.edge !== contradictionEdge(...(ev.edge.split(":") as [string, string])) || !ev.edge.split(":").includes(ev.winner) || !ev.edge.split(":").every((id: string) => atoms.some((a) => a.id === id)))) ||
          (ev.ev === "decay" && ev.factor !== undefined && (typeof ev.factor !== "number" || !Number.isFinite(ev.factor) || ev.factor < 0)) ||
          (ev.ev === "stack" && ev.grain !== undefined && (typeof ev.grain !== "number" || !Number.isFinite(ev.grain) || ev.grain < 0)) ||
          (ev.ev === "renorm" && (typeof ev.target !== "number" || !Number.isFinite(ev.target) || ev.target <= 0))) {
        throw new Error(`ledger line ${i + 1} cannot fold`);
      }
      events.push(ev);
    }
  } else if (atoms.length) throw new Error("beliefs.jsonl missing for committed atoms");
  const states = foldWeights(events);
  const weight = [...states.values()].reduce((sum, s) => sum + s.weight, 0);
  if (![weight, ...[...states.values()].map((s) => s.weight)].every((n) => Number.isFinite(n) && n >= 0)) throw new Error("ledger fold produced invalid weight");
  return { sha, self: renderSelf(atoms, states, undefined, { events }).md, now: names.has("NOW.md") ? blob("NOW.md") : "", atoms: atoms.length, weight };
}

function usage(): never { throw new Error("usage: bun src/checkout.ts [--ref <commit>] [--repo <mind repo>] [--out <directory>]"); }

export function checkoutMain(args: string[]): void {
  const corr = correlation("checkout");
  let ref = "HEAD", repo = process.cwd(), out: string | undefined;
  try {
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === "--ref" || arg === "--repo" || arg === "--out") {
        const val = args[++i];
        if (!val || val.startsWith("--")) usage();
        if (arg === "--ref") ref = val;
        else if (arg === "--repo") repo = val;
        else out = val;
      } else if (!arg.startsWith("-") && i === 0) repo = arg;
      else usage();
    }
    const mind = realpathSync(repo);
    if (out) {
      const dest = resolve(out);
      // Resolve existing ancestors too, so a symlink cannot redirect output into mind/.
      let parent = dest;
      while (!existsSync(parent)) parent = dirname(parent);
      const canonical = resolve(realpathSync(parent), relative(parent, dest));
      if (canonical === mind || canonical.startsWith(mind + "/")) throw new Error("output cannot be inside mind repo");
    }
    const result = checkout(mind, ref);
    if (out) {
      mkdirSync(out, { recursive: true });
      writeFileSync(join(out, "SELF.md"), result.self);
      writeFileSync(join(out, "NOW.md"), result.now);
    } else {
      process.stdout.write(`--- SELF.md ---\n${result.self}--- NOW.md ---\n${result.now}`);
      if (!result.now.endsWith("\n")) process.stdout.write("\n");
    }
    const receipt = `RECONSTITUTED ${result.sha} atoms=${result.atoms} weight=${result.weight}`;
    process.stdout.write(receipt + "\n");
    ok({ process: "checkout", phase: "reconstitute", correlation_id: corr, summary: receipt, context: { repo: mind, ref, out: out ?? "stdout" } });
  } catch (e) {
    fail({ process: "checkout", phase: "reconstitute", correlation_id: corr, code: 2,
      summary: "mind ref could not be reconstituted", context: { repo, ref, out: out ?? "stdout" },
      cause: (e as Error).message, next_action: "verify the ref and committed beliefs/ledger; rerun checkout with a valid mind commit" });
  }
}

if (import.meta.main) checkoutMain(process.argv.slice(2));
