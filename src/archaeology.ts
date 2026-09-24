#!/usr/bin/env bun
/** Read-only belief archaeology. Git is the archive; the ledger is the timeline. */
import * as fs from "node:fs";
import * as path from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { readAtoms, readLedger, type Atom, type LedgerEvent } from "./atoms.ts";
import { collectEpisodes } from "./zoom.ts";
import { normalizeQuoteKey } from "./migrate.ts";
import { correlation, fail, idle, ok } from "./obs.ts";

function git(mind: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: mind, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trimEnd();
}

/** A single-file --follow walk preserves the atom's birth across renames. */
export function birthCommit(mind: string, id: string): string | null {
  const history = git(mind, "log", "--follow", "--format=%H", "--", `beliefs/${id}.md`).trim();
  return history ? history.split("\n").at(-1)! : null;
}

/** First reachable commit whose changed episode text contains the claim.
 * Walk changes, not just the present tree: deleted/composted and subsequently
 * reworded episodes still count. -S alone misses case/whitespace variants. */
export function firstMention(mind: string, claim: string): { commit: string; episode: string } | null {
  const needle = normalizeQuoteKey(claim);
  if (!needle) return null;
  const commits = git(mind, "log", "--reverse", "--format=%H", "--", "episodes/").split("\n").filter(Boolean);
  for (const commit of commits) {
    const changed = git(mind, "diff-tree", "--root", "--no-commit-id", "--name-only", "--diff-filter=AMCR", "-r", commit, "--", "episodes/");
    for (const file of changed.split("\n").filter((f) => f.startsWith("episodes/") && f.endsWith(".md"))) {
      const text = git(mind, "show", `${commit}:${file}`);
      if (normalizeQuoteKey(text).includes(needle)) return { commit, episode: file.slice("episodes/".length) };
    }
  }
  return null;
}

/** All supersede edges touching the atom, including its winner/loser chain.
 * Preserve ledger append order, not timestamps (which may be backfilled). */
export function supersedeLineage(events: LedgerEvent[], id: string): LedgerEvent[] {
  const edges = events.filter((e) => e.ev === "supersede" && e.winner && e.loser);
  const related = new Set([id]);
  let size: number;
  do {
    size = related.size;
    for (const e of edges) {
      if (related.has(e.winner!) || related.has(e.loser!)) {
        related.add(e.winner!);
        related.add(e.loser!);
      }
    }
  } while (related.size !== size);
  return edges.filter((e) => related.has(e.winner!) && related.has(e.loser!));
}

export function when(mind: string, query: string): string {
  const atoms = readAtoms(path.join(mind, "beliefs"));
  const key = normalizeQuoteKey(query);
  const matches = atoms.filter((a) => a.id === query || (key && normalizeQuoteKey(a.claim).includes(key)));
  if (!matches.length) throw new Error(`no belief matches ${JSON.stringify(query)}`);
  if (matches.length > 1) throw new Error(`ambiguous belief: ${matches.map((a) => `${a.id} (${a.claim})`).join("; ")}`);
  const atom: Atom = matches[0];
  const events = readLedger(path.join(mind, "beliefs.jsonl"));
  const stacks = events.filter((e) => e.ev === "stack" && e.atom === atom.id);
  const episodes = new Set(collectEpisodes(mind).map((e) => e.filename));
  const label = (e: LedgerEvent) => `${e.ep ?? "(episode not recorded)"}${e.ep && !episodes.has(e.ep) ? " (episode unavailable)" : ""} [${e.ts ?? "unknown time"}]`;
  const birth = birthCommit(mind, atom.id);
  const lines = [
    `when: ${atom.id} — ${atom.claim}`,
    `birth: ${stacks.length ? label(stacks[0]) : "(no stack event)"}; commit ${birth ?? "(not committed)"}`,
    `bump count: ${Math.max(0, stacks.length - 1)}`,
    `last bump: ${stacks.length > 1 ? label(stacks.at(-1)!) : "(none)"}`,
    "stack episodes:",
    ...stacks.map((e, i) => `  ${i === 0 ? "birth" : "bump"}: ${label(e)}`),
    "supersede lineage:",
  ];
  const lineage = supersedeLineage(events, atom.id);
  if (!lineage.length) lines.push("  (none)");
  for (const e of lineage) lines.push(`  ${e.winner} won over ${e.loser} [${e.ts ?? "unknown time"}]${e.winner === atom.id ? " (won)" : e.loser === atom.id ? " (lost)" : ""}`);
  return lines.join("\n");
}

export function bisect(mind: string, claim: string): string {
  const found = firstMention(mind, claim);
  return found ? `bisect: first mention of ${JSON.stringify(claim)} — commit ${found.commit}, episodes/${found.episode}`
    : `bisect: no episode mentions ${JSON.stringify(claim)}`;
}

export function archaeologyMain(args: string[]): void {
  const corr = correlation("archaeology");
  const idx = args.indexOf("--mind");
  const mind = idx < 0 ? path.join(process.env.CIRCADIAN_HOME || path.join(homedir(), "circadian"), "mind") : args[idx + 1];
  const terms = idx < 0 ? args : args.filter((_, i) => i !== idx && i !== idx + 1);
  const [command, ...rest] = terms;
  const query = rest.join(" ").trim();
  if (!mind || !["when", "bisect"].includes(command) || !query || query.startsWith("-")) {
    fail({ process: "archaeology", phase: "usage", correlation_id: corr, summary: "when needs an id/claim; bisect needs a claim",
      context: { args }, cause: "missing or invalid command, query, or mind path",
      next_action: "run circadian when <id|claim-substring> or circadian bisect <claim> [--mind <path>]" });
  }
  try {
    // Explicitly reject a nonexistent mind rather than reporting a misleading miss.
    if (!fs.existsSync(mind)) throw new Error(`mind directory does not exist: ${mind}`);
    const result = command === "when" ? when(mind, query) : bisect(mind, query);
    console.log(result);
    const event = { process: "archaeology" as const, phase: command, correlation_id: corr,
      summary: `${command} ${JSON.stringify(query)}: ${result.split("\n")[0]}`, context: { query, mind } };
    if (result.startsWith("bisect: no episode")) idle(event); else ok(event);
  } catch (error) {
    fail({ process: "archaeology", phase: command, correlation_id: corr, summary: `could not trace ${JSON.stringify(query)}`,
      context: { query, mind }, cause: (error as Error).message,
      next_action: "check the claim/id, mind path, and mind git history, then retry" });
  }
}

if (import.meta.main) {
  if (process.argv[2] === "lane") {
    const { laneMain } = await import("./lane.ts");
    laneMain(process.argv.slice(3));
  } else archaeologyMain(process.argv.slice(2));
}
