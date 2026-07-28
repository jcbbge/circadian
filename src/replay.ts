#!/usr/bin/env bun
/**
 * replay.ts — sandbox-construction machinery for from-genesis worldview
 * rebuilds, plus the standalone `--stutter` read-only check.
 *
 * HISTORICAL NOTE (popmem WS-H, dross deletion): this file's original
 * charter was the replay-divergence audit — rebuild the worldview from
 * scratch in a sandbox by looping the REAL rem.ts over every episode the
 * mind has ever had, then diff the result against the living SELF.md
 * (identity path-dependence as telemetry: a v1 REM pass hands the worldview
 * to a stochastic model, so repeated rebuilds diverge, and that drift needed
 * to be a NUMBER, not a vibe). rem.ts retired with the population-memory
 * switchover; the v1-vs-popmem comparison this file existed to produce was
 * captured by WS-G before the deletion landed (docs/POPULATION-MEMORY.md
 * §12 WS-G). `bun src/replay.ts` now fails loudly rather than loop forever
 * with nothing to invoke.
 *
 * WHAT SURVIVES: the sandbox-construction exports below (buildSandbox,
 * collectAllEpisodes/collectAllEpisodesAt, assertSandboxSafe, the genesis
 * bootstrap shim, sectionTokens) are unchanged and load-bearing — WS-G's
 * gauntlet.ts drives the identical sandbox pattern against the stacker
 * (src/stack.ts) instead of rem.ts, and migrate.ts/zoom.test.ts/stack.test.ts
 * reuse the episode-recovery and shim helpers directly.
 *
 * HARD SAFETY — every export here still asserts the sandbox path lives
 * outside the real mind before any write (assertSandboxSafe).
 *
 * Deliberately NOT inside doctor.ts: doctor's charter forbids re-running
 * processes; the sandbox helpers here back organs that do.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { homedir } from "os";
import { execFileSync } from "child_process";
import { ok, fail, correlation } from "./obs.ts";
import { detectSelfStutter } from "./immune.ts";

// The REAL home — replay reads from it and never writes under its mind/.
// CIRCADIAN_HOME overrides; default ~/circadian. See wake.ts for the contract.
const REAL_HOME = process.env.CIRCADIAN_HOME || path.join(homedir(), "circadian");
const REAL_MIND = path.join(REAL_HOME, "mind");
const REAL_SELF = path.join(REAL_MIND, "SELF.md");
const TEMPLATES_DIR = path.join(REAL_HOME, "templates");

// The four SELF.md sections, exactly (MIND-SPEC "File Formats").
const SELF_SECTIONS = ["Who I am across sessions", "Doctrine", "Motifs", "How we work"] as const;

function tokensOf(text: string): number {
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------
// HARD SAFETY — the one assertion that makes everything else survivable
// ---------------------------------------------------------------------

/** Throws unless `sandboxHome` resolves OUTSIDE the real mind (and outside
 * the real home entirely — a sandbox at $CIRCADIAN_HOME/anything could still
 * collide with logs/ or mind/ via a future refactor; temp dirs are free, so
 * demand full separation). Called before ANY write. */
export function assertSandboxSafe(sandboxHome: string, realHome: string = REAL_HOME): void {
  const sb = path.resolve(sandboxHome);
  const real = path.resolve(realHome);
  if (sb === real || sb.startsWith(real + path.sep)) {
    throw new Error(
      `HARD SAFETY: sandbox path ${sb} is inside the real circadian home ${real} — replay must never write there`
    );
  }
}

// ---------------------------------------------------------------------
// the episode universe (shared shape with zoom.ts — live ∪ git-recovered)
// ---------------------------------------------------------------------

export interface ReplayEpisode {
  filename: string;
  content: string;
  source: "live" | "git";
}

function gitDeletedEpisodes(mindDir: string): Map<string, string> {
  const map = new Map<string, string>();
  let out = "";
  try {
    out = execFileSync(
      "git",
      ["log", "--diff-filter=D", "--name-only", "--pretty=format:%h", "--", "episodes/"],
      { cwd: mindDir, encoding: "utf8" }
    );
  } catch {
    return map;
  }
  let commit = "";
  for (const line of out.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (!t.startsWith("episodes/")) {
      commit = t;
      continue;
    }
    const f = t.replace(/^episodes\//, "");
    if (!map.has(f)) map.set(f, commit); // newest-first: first hit is the final shed
  }
  return map;
}

/** Every episode the mind has ever had, chronological (filenames are
 * YYYY-MM-DD-<slug>.md, so a lexical sort IS the timeline). Live files win a
 * filename collision with a shed ancestor — the present tense is authoritative. */
export function collectAllEpisodes(mindDir: string = REAL_MIND): ReplayEpisode[] {
  const episodes: ReplayEpisode[] = [];
  const seen = new Set<string>();
  let live: string[] = [];
  try {
    live = fs.readdirSync(path.join(mindDir, "episodes")).filter((f) => f.endsWith(".md"));
  } catch {
    live = [];
  }
  for (const f of live) {
    episodes.push({ filename: f, content: fs.readFileSync(path.join(mindDir, "episodes", f), "utf8"), source: "live" });
    seen.add(f);
  }
  for (const [f, commit] of gitDeletedEpisodes(mindDir)) {
    if (seen.has(f)) continue;
    try {
      const content = execFileSync("git", ["show", `${commit}^:episodes/${f}`], { cwd: mindDir, encoding: "utf8" });
      episodes.push({ filename: f, content, source: "git" });
    } catch {
      /* unreachable parent — skip, never fabricate */
    }
  }
  episodes.sort((a, b) => a.filename.localeCompare(b.filename));
  return episodes;
}

/** Same shed-episode recovery as gitDeletedEpisodes, but the commit walk is
 * constrained to history reachable from `rev` (`git log <rev> -- ...`
 * instead of the default HEAD walk) — so a mind that keeps composting after
 * `rev` never leaks a later deletion into an enumeration pinned to the past. */
function gitDeletedEpisodesAt(mindDir: string, rev: string): Map<string, string> {
  const map = new Map<string, string>();
  let out = "";
  try {
    out = execFileSync(
      "git",
      ["log", rev, "--diff-filter=D", "--name-only", "--pretty=format:%h", "--", "episodes/"],
      { cwd: mindDir, encoding: "utf8" }
    );
  } catch {
    return map;
  }
  let commit = "";
  for (const line of out.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (!t.startsWith("episodes/")) {
      commit = t;
      continue;
    }
    const f = t.replace(/^episodes\//, "");
    if (!map.has(f)) map.set(f, commit); // newest-first: first hit is the final shed
  }
  return map;
}

/** collectAllEpisodes, pinned to a mind git revision instead of the live
 * working tree — deterministic and byte-stable regardless of how many times
 * REM composts between calls (the mind moves twice daily; a gauntlet corpus
 * must not). "live" here means "present in the tree at `rev`", read via
 * `git show <rev>:episodes/<f>` rather than fs.readFileSync, so two calls
 * against the same rev are byte-identical even if the real working tree has
 * since changed. Existing collectAllEpisodes (working-tree + HEAD-history)
 * behavior is untouched. */
export function collectAllEpisodesAt(rev: string, mindDir: string = REAL_MIND): ReplayEpisode[] {
  const episodes: ReplayEpisode[] = [];
  const seen = new Set<string>();
  let liveFiles: string[] = [];
  try {
    const out = execFileSync("git", ["ls-tree", "-r", "--name-only", rev, "--", "episodes/"], { cwd: mindDir, encoding: "utf8" });
    liveFiles = out
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.endsWith(".md"))
      .map((l) => l.replace(/^episodes\//, ""));
  } catch {
    liveFiles = [];
  }
  for (const f of liveFiles) {
    const content = execFileSync("git", ["show", `${rev}:episodes/${f}`], { cwd: mindDir, encoding: "utf8" });
    episodes.push({ filename: f, content, source: "live" });
    seen.add(f);
  }
  for (const [f, commit] of gitDeletedEpisodesAt(mindDir, rev)) {
    if (seen.has(f)) continue;
    try {
      const content = execFileSync("git", ["show", `${commit}^:episodes/${f}`], { cwd: mindDir, encoding: "utf8" });
      episodes.push({ filename: f, content, source: "git" });
    } catch {
      /* unreachable parent — skip, never fabricate */
    }
  }
  episodes.sort((a, b) => a.filename.localeCompare(b.filename));
  return episodes;
}

// ---------------------------------------------------------------------
// sandbox construction — genesis conditions, from templates/
// ---------------------------------------------------------------------

/**
 * GENESIS BOOTSTRAP SHIM — a measured fact, discovered by this organ's first
 * run: the current metabolism cannot start from the template genesis.
 * mutate.ts's parseSelf (line ~278) throws "SELF.md Doctrine section has no
 * parseable **N. ...** entries" on any SELF.md with an empty Doctrine — and
 * templates/SELF.md ships with exactly that. The real lineage never hit this:
 * its founding SELF.md commit (59f611a) is bare headings too, but those
 * passes ran in the pre-mutation-grammar era of rem (whole-file rewrites).
 * With today's organ, the mind's own history is not replayable from genesis
 * without a graft point.
 *
 * So: if the seeded Doctrine has no numbered entry, plant exactly ONE,
 * clearly labeled as scaffold, stamped with an impossible episode date so it
 * can never be confused with an earned belief. This is a SANDBOX-ONLY
 * measurement artifact — the real templates and the real mind are untouched,
 * and the divergence report carries bootstrap_shim so the reader knows the
 * rebuild did not start from a perfectly clean slate. add-doctrine ops let
 * the model grow real doctrine alongside it; RETRACT can shed it.
 */
const GENESIS_SHIM =
  `**1. Genesis (replay scaffold).** [ep:1970-01-01]  \n` +
  `Planted by replay.ts, not by any session: the current metabolism (mutate.ts parseSelf) ` +
  `cannot operate on a Doctrine section with zero numbered entries, so a from-genesis replay ` +
  `needs one seed belief to graft onto. This entry carries no worldview; retract or merge it ` +
  `away once real doctrine exists.`;

export function seedNeedsShim(selfMd: string): boolean {
  const start = selfMd.indexOf("## Doctrine");
  if (start === -1) return false; // malformed template — let rem fail loudly on it
  const end = selfMd.indexOf("\n## ", start + 1);
  const body = selfMd.slice(start, end === -1 ? selfMd.length : end);
  return !/^\*\*\d+\.\s/m.test(body);
}

export function plantGenesisShim(selfMd: string): string {
  const start = selfMd.indexOf("## Doctrine");
  const end = selfMd.indexOf("\n## ", start + 1);
  const head = selfMd.slice(0, start);
  const tail = end === -1 ? "" : selfMd.slice(end);
  return `${head}## Doctrine\n\n${GENESIS_SHIM}\n${tail}`;
}

export function buildSandbox(episodes: ReplayEpisode[]): { sandboxHome: string; shimPlanted: boolean } {
  const sandboxHome = fs.mkdtempSync(path.join(os.tmpdir(), "circadian-replay-"));
  assertSandboxSafe(sandboxHome);
  const mind = path.join(sandboxHome, "mind");
  fs.mkdirSync(path.join(mind, "episodes"), { recursive: true });
  fs.mkdirSync(path.join(sandboxHome, "logs"), { recursive: true });

  // Seed the genesis worldview from templates/ — the same files install.sh
  // scaffolds a fresh mind from. MIND-SPEC rides along because rem reads
  // mind/MIND-SPEC.md as its in-prompt contract.
  for (const f of ["SELF.md", "USER.md", "NOW.md", "greeting.md", "compost.md", "MIND-SPEC.md"]) {
    fs.copyFileSync(path.join(TEMPLATES_DIR, f), path.join(mind, f));
  }

  // Genesis bootstrap shim (see the doctrine block above): graft one labeled
  // scaffold entry iff the template Doctrine is empty, or the first rem pass
  // dies in parseSelf before a single episode can be absorbed.
  const seededSelfPath = path.join(mind, "SELF.md");
  const seededSelf = fs.readFileSync(seededSelfPath, "utf8");
  const shimPlanted = seedNeedsShim(seededSelf);
  if (shimPlanted) fs.writeFileSync(seededSelfPath, plantGenesisShim(seededSelf), "utf8");

  // A mind repo: rem commits it (the only regular committer, MIND-SPEC "REM").
  // Local identity so the sandbox commits regardless of global git config.
  execFileSync("git", ["init", "--quiet"], { cwd: mind });
  execFileSync("git", ["config", "user.name", "circadian-replay"], { cwd: mind });
  execFileSync("git", ["config", "user.email", "replay@circadian.local"], { cwd: mind });
  execFileSync("git", ["add", "-A"], { cwd: mind });
  execFileSync("git", ["commit", "--quiet", "-m", "replay: founding commit (genesis from templates/)"], { cwd: mind });

  // Restore the timeline. Episodes are born untracked, exactly as SLEEP
  // drafts them in the real mind — rem's absorb commit stages them.
  for (const ep of episodes) {
    fs.writeFileSync(path.join(mind, "episodes", ep.filename), ep.content, "utf8");
  }
  return { sandboxHome, shimPlanted };
}

// ---------------------------------------------------------------------
// divergence measurement
// ---------------------------------------------------------------------

export function sectionTokens(selfMd: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (let i = 0; i < SELF_SECTIONS.length; i++) {
    const name = SELF_SECTIONS[i];
    const start = selfMd.indexOf(`## ${name}`);
    if (start === -1) {
      out[name] = 0;
      continue;
    }
    let end = selfMd.length;
    for (const other of SELF_SECTIONS) {
      if (other === name) continue;
      const idx = selfMd.indexOf(`## ${other}`, start + 3);
      if (idx !== -1 && idx < end) end = idx;
    }
    out[name] = tokensOf(selfMd.slice(start, end).trim());
  }
  return out;
}

// ---------------------------------------------------------------------
// main
// ---------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const run = args.includes("--run");
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : Infinity;
  const corr = correlation("replay");

  if (limitIdx !== -1 && (!Number.isFinite(limit) || limit < 1)) {
    console.error("replay: --limit requires a positive integer, e.g. --limit 2");
    process.exit(1);
  }

  // --stutter: the inward-LTP instrument, standalone and READ-ONLY. Runs the
  // same detector REM consults before every wave (detectSelfStutter), against
  // the LIVING SELF.md, and prints the merge-worthy groups. Lives here rather
  // than in a new file because replay is already the organ that measures the
  // worldview against what it should be — stutter is divergence from within.
  if (args.includes("--stutter")) {
    const selfMd = fs.readFileSync(REAL_SELF, "utf8");
    const report = detectSelfStutter(selfMd);
    const clean = report.doctrine.length === 0 && report.motifs.length === 0;
    console.log(`=== SELF.md stutter report (overlap-coefficient clustering, threshold ${report.threshold}) ===\n`);
    if (clean) {
      console.log("no stutter detected — every doctrine entry and motif line carries a distinct belief");
    } else {
      for (const group of report.doctrine) {
        console.log(`doctrine group (one belief, ${group.length} entries):`);
        for (const d of group) console.log(`  Doctrine[${d.n}] — ${d.title}`);
      }
      for (const group of report.motifs) {
        console.log(`motif group (one theme, ${group.length} lines):`);
        for (const l of group) console.log(`  ${l}`);
      }
      console.log(`\nv1's REM would have received these as an explicit MERGE directive; that grammar is retired`);
      console.log(`(popmem WS-H) — this report is now read-only signal for a human or migrate.ts, not a REM input.`);
    }
    ok({
      process: "replay", phase: "stutter", correlation_id: corr,
      summary: clean
        ? "SELF.md stutter check: clean"
        : `SELF.md stutter check: ${report.doctrine.length} doctrine group(s), ${report.motifs.length} motif group(s) carry duplicated beliefs`,
      context: {
        threshold: report.threshold,
        doctrine_groups: report.doctrine.map((g) => g.map((d) => `Doctrine[${d.n}] ${d.title}`)),
        motif_groups: report.motifs.map((g) => g.map((l) => l.slice(0, 80))),
      },
    });
    return;
  }

  // v1 replay (rebuild-from-genesis by looping the REAL rem.ts against a
  // sandbox, then diffing SELF.md) is HISTORICAL — rem.ts retired (popmem
  // WS-H, dross deletion; the v1-vs-popmem comparison this mode existed to
  // produce was captured by WS-G before the deletion landed, per
  // docs/POPULATION-MEMORY.md §12 WS-G). The sandbox-construction exports
  // above (buildSandbox, collectAllEpisodes[At], assertSandboxSafe, the
  // genesis shim, sectionTokens) are UNCHANGED and stay load-bearing —
  // gauntlet.ts drives the identical sandbox pattern against the stacker.
  // Only this CLI entrypoint's rem-invocation loop is gone: failing loudly
  // here beats limping through a stall that would read as a mystery hang.
  fail({
    process: "replay", phase: "plan", correlation_id: corr,
    summary: "rem.ts retired — v1 replay is historical; use git",
    context: { rem_script_path: path.join(REAL_HOME, "src", "rem.ts"), run, limit: Number.isFinite(limit) ? limit : null },
    cause: "popmem WS-H deleted src/rem.ts; the v1 rebuild-from-genesis loop has nothing left to invoke",
    next_action: "for a from-genesis worldview rebuild, drive src/gauntlet.ts against src/stack.ts (the popmem stacker) in a sandbox — see docs/POPULATION-MEMORY.md §12 WS-G",
  });
}

if (import.meta.main) await main();
