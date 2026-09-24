// Recorded at write time; wake never guesses a legacy episode's scope from prose.
import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { readLedger, foldWeights } from "./atoms.ts";

export interface ScopeEntry { slug: string; path: string; status: string }
export function registryPath(mind: string): string {
  return process.env.CIRCADIAN_REGISTRY || path.join(mind, "scopes.tsv");
}
export function readScopes(mind: string): ScopeEntry[] {
  try {
    return fs.readFileSync(registryPath(mind), "utf8").split("\n").flatMap(line => {
      if (!line.trim() || line.startsWith("#")) return [];
      const [slug, location, status] = line.split("\t").map(s => s.trim());
      if (!/^[a-z0-9][a-z0-9_-]*$/.test(slug || "") || !location || !status) return [];
      try { return [{ slug, path: fs.realpathSync(location.replace(/^~(?=\/)/, process.env.HOME || "~")), status }]; }
      catch { return []; }
    });
  } catch { return []; }
}

export function resolveScope(mind: string, cwd = process.cwd(), override = process.env.CIRCADIAN_SCOPE): string {
  if (override && /^[a-z0-9][a-z0-9_-]*$/.test(override)) return override;
  let root = path.resolve(cwd);
  try {
    const git = (args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    root = git(["rev-parse", "--show-toplevel"]);
    // --git-common-dir without --path-format=absolute is relative to cwd,
    // not the checkout root (notably when invoked from a nested directory).
    const common = git(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
    // Worktree common dir is <main>/.git; a normal checkout has the same root.
    if (common !== path.join(root, ".git")) root = path.dirname(common);
  } catch { /* outside git: match the cwd against registered paths */ }
  try { root = fs.realpathSync(root); } catch { /* path may no longer exist */ }
  for (const entry of readScopes(mind)) {
    if (root === entry.path || root.startsWith(entry.path + path.sep)) return entry.slug;
  }
  return "global";
}

export function tagEpisode(text: string, scope: string): string {
  return text.replace(/^arc:.*\n/m, line => `${line}scope: ${scope}\n`);
}
export function scopeNowPath(scope: string): string {
  return scope === "global" ? "NOW.md" : `now/${scope}.md`;
}
export function episodeScope(text: string): string {
  return text.match(/^scope:\s*([a-z0-9_-]+)\s*$/m)?.[1] || "global";
}

export const HERE_TOKENS = 4000;
export const ELSEWHERE_TOKENS = 300;
/** Whole-line budget: a receipt is never cut in half. */
function budget(lines: string[], tokens: number): string {
  let length = 0;
  return lines.filter(line => {
    if (length + line.length + 1 > tokens * 4) return false;
    length += line.length + 1;
    return true;
  }).join("\n");
}
export function scopedView(mind: string, scope: string, nowMs = Date.now(), reserveTokens = 0, sinceMs = 0, depthTokens = HERE_TOKENS): { here: string; elsewhere: string; now: string } {
  const nowFile = path.join(mind, scopeNowPath(scope));
  const now = fs.existsSync(nowFile) ? fs.readFileSync(nowFile, "utf8") : "";
  const active = new Set(readScopes(mind).filter(e => e.status.toLowerCase() === "active").map(e => e.slug));
  const episodes = fs.existsSync(path.join(mind, "episodes")) ? fs.readdirSync(path.join(mind, "episodes")).filter(f => f.endsWith(".md")).sort().reverse() : [];
  const here: string[] = [];
  const elsewhere = new Map<string, string>();
  const ledger = readLedger(path.join(mind, "beliefs.jsonl"));
  const states = foldWeights(ledger);
  for (const file of episodes) {
    const text = fs.readFileSync(path.join(mind, "episodes", file), "utf8");
    const epScope = episodeScope(text);
    const date = file.slice(0, 10);
    const stamp = text.match(/^ts:\s*(\S+)\s*$/m)?.[1];
    // Legacy date-only episodes are noon estimates; new episodes carry exact UTC.
    const episodeTime = Date.parse(stamp || `${date}T12:00:00Z`);
    if (epScope === scope && scope !== "global" && episodeTime >= sinceMs) here.push(`### ${file}\n${text.trim()}`);
    else if (epScope !== "global" && active.has(epScope) && !elsewhere.has(epScope) && nowMs - episodeTime < 48 * 3600_000 && episodeTime <= nowMs) {
      const arc = text.match(/^arc:\s*(.*)$/m)?.[1] || "session";
      elsewhere.set(epScope, `${epScope}, ${date}: ${arc.replace(/\s+/g, " ")} [episode: ${file}]`);
    }
  }
  // Atom origin is the source episode, not the current cwd or claim vocabulary.
  const beliefs = path.join(mind, "beliefs");
  if (scope !== "global" && fs.existsSync(beliefs)) {
    for (const file of fs.readdirSync(beliefs).filter(f => f.endsWith(".md")).sort()) {
      if (states.get(file.slice(0, -3))?.status === "forgotten") continue;
      const atom = fs.readFileSync(path.join(beliefs, file), "utf8");
      const sources = [...atom.matchAll(/^quote: .* \| (.+)$/gm)].map(m => m[1]);
      if (sources.some(source => {
        try { return episodeScope(fs.readFileSync(path.join(mind, "episodes", source), "utf8")) === scope; } catch { return false; }
      })) here.push(`### atom ${file}\n${atom.trim()}`);
    }
  }
  return { now, here: budget(here, Math.max(0, depthTokens - Math.ceil(now.length / 4) - reserveTokens)), elsewhere: budget([...elsewhere.values()], ELSEWHERE_TOKENS) };
}

/** Read-only scope view shared by the wake hook and the pull door. */
export function recallScope(mind: string, scope: string, options: { nowMs?: number; sinceMs?: number; slim?: boolean; evidenceTokens?: number; deep?: boolean } = {}) {
  if (!/^(?:global|[a-z0-9][a-z0-9_-]*)$/.test(scope)) throw new Error("invalid scope");
  const view = scopedView(mind, scope, options.nowMs, options.evidenceTokens, options.sinceMs, options.deep ? 16000 : HERE_TOKENS);
  return { ...view, elsewhere: options.slim ? "" : view.elsewhere };
}
