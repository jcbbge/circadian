// File/git-only changes since this scope's previous wake. No model or network.
import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { episodeScope, readScopes } from "./scopes.ts";

export function whileAway(home: string, scope: string, nowMs = Date.now(), session = "", lane = ""): string {
  const mind = path.join(home, "mind");
  let wake = 0;
  try {
    for (const line of fs.readFileSync(path.join(mind, "scoreboard.jsonl"), "utf8").split("\n")) {
      try { const e = JSON.parse(line); if (e.type === "wake" && e.scope === scope && (e.lane || "") === lane) wake = Math.max(wake, Date.parse(e.ts) || 0); } catch { /* malformed row */ }
    }
  } catch { /* first wake */ }
  if (!wake) return "";
  const lines: string[] = [];
  const repo = readScopes(mind).find(e => e.slug === scope)?.path;
  if (repo) {
    const git = (args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    try {
      let branch = "main";
      try { branch = git(["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]).replace(/^origin\//, ""); } catch { /* local-only repo */ }
      let ref: string;
      try { ref = git(["rev-parse", "--verify", "refs/heads/" + branch]); }
      catch { ref = git(["rev-parse", "--verify", "refs/remotes/origin/" + branch]); }
      const commits = git(["log", ref, `--since=${new Date(wake).toISOString()}`, "--format=%h %s", "-20"]);
      if (commits) lines.push("Commits on " + branch + ":", ...commits.split("\n"));
      // Compare the ledger at the last pre-wake commit with today's tracked file.
      const prior = git(["rev-list", "-1", `--before=${new Date(wake).toISOString()}`, ref]);
      if (prior) {
        for (const name of ["TASKS.md", "tasks.md"]) {
          const diff = git(["diff", "--unified=0", prior, ref, "--", name]);
          const changes = diff.split("\n").filter(l => /^[+-]/.test(l) && !/^(?:\+\+\+|---)/.test(l));
          if (changes.length) lines.push(`Ledger ${name}:`, ...changes.slice(0, 20));
        }
      }
    } catch { /* no default branch, no history, or unavailable git */ }
  }
  try {
    for (const file of fs.readdirSync(path.join(mind, "episodes")).filter(f => f.endsWith(".md")).sort()) {
      const text = fs.readFileSync(path.join(mind, "episodes", file), "utf8");
      if (episodeScope(text) !== scope || (Date.parse(text.match(/^ts:\s*(\S+)/m)?.[1] || "") || 0) <= wake) continue;
      if (session && text.match(/^session:\s*(.*)$/m)?.[1] === session) continue;
      lines.push(`Other session: ${file} [episode: ${file}]`);
    }
  } catch { /* no episodes yet */ }
  return lines.length ? `While you were away (since ${new Date(wake).toISOString()}):\n${lines.join("\n")}` : "";
}
