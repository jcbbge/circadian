#!/usr/bin/env bun
/**
 * replay.ts — the replay-divergence audit. Identity path-dependence as telemetry.
 *
 * SELF.md is not computed, it is GROWN: every REM pass hands the worldview to
 * a stochastic model and writes back what returns. Run the same episodes
 * through the same metabolism twice and you will not get the same worldview —
 * sampling noise, batch boundaries, and prompt ordering all leave
 * fingerprints. That path-dependence is not a bug to fix (a mind IS its
 * history), but it must be a NUMBER we can watch, not a vibe: how far has the
 * living SELF.md drifted from what a from-genesis rebuild would say? A drift
 * we cannot measure is accretion's favorite hiding place (SELF.md
 * Doctrine[1]: accretion must be a visible number with a guard on it).
 *
 * So replay rebuilds the worldview from scratch — in a SANDBOX — and diffs:
 *   1. scaffold a fresh mind at a temp dir (templates/, git init, seed
 *      SELF.md from templates/SELF.md — genesis conditions);
 *   2. restore every episode the mind has EVER had, in chronological order:
 *      the live ones from episodes/ plus every composted one recovered from
 *      git history (MIND-SPEC "Compost Rules": git history is the permanent
 *      archive — replay is that archive doing load-bearing work);
 *   3. run the REAL rem.ts against the sandbox (CIRCADIAN_HOME=<sandbox> in
 *      the SUBPROCESS env only) until the digestion ledger says every restored
 *      episode is absorbed, or progress stalls — no mocks, the actual organ;
 *   4. diff sandbox SELF.md against the living one: per-section token counts
 *      (chars/4, MIND-SPEC "Token Targets") plus a unified diff.
 *
 * HARD SAFETY — this process NEVER writes under the real mind/. The sandbox
 * path is asserted to live outside it before any write (assertSandboxSafe),
 * and it reaches rem exclusively through the subprocess environment. replay's
 * own obs import resolves the ledger from THIS process's env at import time
 * (see obs.ts), which replay never mutates — so events land on the REAL
 * ledger at logs/circadian.events.jsonl while the subprocess writes only to
 * the sandbox. Law 9: the default DRY RUN and a completed --run each emit one
 * ok event; a stalled or failed rebuild fails loudly with the sandbox path
 * preserved for inspection.
 *
 * Deliberately NOT inside doctor.ts: doctor's charter forbids re-running
 * processes. Replay re-runs the biggest one there is, so it is its own organ.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { homedir } from "os";
import { execFileSync, spawnSync } from "child_process";
import { createHash } from "crypto";
import { ok, fail, correlation } from "./obs.ts";
import { detectSelfStutter } from "./mutate.ts";

// The REAL home — replay reads from it and never writes under its mind/.
// CIRCADIAN_HOME overrides; default ~/circadian. See wake.ts for the contract.
const REAL_HOME = process.env.CIRCADIAN_HOME || path.join(homedir(), "circadian");
const REAL_MIND = path.join(REAL_HOME, "mind");
const REAL_EPISODES = path.join(REAL_MIND, "episodes");
const REAL_SELF = path.join(REAL_MIND, "SELF.md");
const TEMPLATES_DIR = path.join(REAL_HOME, "templates");
const REM_SCRIPT = path.join(REAL_HOME, "src", "rem.ts");
// Same bun-binary contract as backfill.ts / rem.ts.
const BUN_BIN = process.env.CIRCADIAN_BUN_BIN || path.join(homedir(), ".bun/bin/bun");

// Mirrors rem.ts's peristalsis constants (REM_BATCH_DEFAULT=4, REM_MAX_PASSES=30)
// — used only to ESTIMATE the dry-run plan; the subprocess is the authority.
const REM_BATCH_DEFAULT = 4;
const REM_MAX_PASSES = 30;
// Hard ceiling on rem invocations — the no-runaway guard for the outer loop.
const MAX_REM_INVOCATIONS = 30;
// One invocation may sit through a full local-LLM rewrite (rem's own LLM
// timeout is 15 min); give the subprocess room, but never forever.
const REM_INVOCATION_TIMEOUT_MS = 30 * 60 * 1000;

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
// digestion progress — read the sandbox ledger the way rem writes it
// ---------------------------------------------------------------------

function digestedHashes(sandboxHome: string): Set<string> {
  const set = new Set<string>();
  let raw = "";
  try {
    raw = fs.readFileSync(path.join(sandboxHome, "mind", "digested.jsonl"), "utf8");
  } catch {
    return set;
  }
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const e = JSON.parse(t);
      if (e && typeof e.hash === "string") set.add(e.hash);
    } catch {
      /* malformed line skipped, same tolerance as rem */
    }
  }
  return set;
}

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
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

function unifiedDiff(livePath: string, sandboxPath: string): string {
  // diff exits 1 when the files differ — that is the expected case here.
  const r = spawnSync("diff", ["-u", "--label", "SELF.md (living)", "--label", "SELF.md (replayed)", livePath, sandboxPath], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (r.status === 0) return "(no divergence — the replayed worldview is byte-identical)";
  return r.stdout || `(diff failed: ${r.stderr})`;
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
      console.log(`\nREM's next wave receives these as an explicit MERGE directive (rem.ts renderStutterDirective).`);
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

  const all = collectAllEpisodes();
  const chosen = Number.isFinite(limit) ? all.slice(0, limit) : all;
  const liveCount = all.filter((e) => e.source === "live").length;
  const gitCount = all.filter((e) => e.source === "git").length;
  const estPasses = Math.ceil(chosen.length / REM_BATCH_DEFAULT);
  const estInvocations = Math.max(1, Math.ceil(estPasses / REM_MAX_PASSES));

  if (!run) {
    console.log("=== replay — DRY RUN (pass --run to execute) ===\n");
    console.log(`episodes ever known to the mind: ${all.length}`);
    console.log(`  live in ${REAL_EPISODES}: ${liveCount}`);
    console.log(`  composted, recoverable from git history: ${gitCount}`);
    console.log(`episodes this replay would restore: ${chosen.length}${Number.isFinite(limit) ? ` (--limit ${limit}, chronological)` : ""}`);
    console.log(`timeline: ${chosen[0]?.filename ?? "(none)"} → ${chosen[chosen.length - 1]?.filename ?? "(none)"}`);
    console.log(`estimated REM waves at batch ${REM_BATCH_DEFAULT}: ${estPasses} (≈ ${estInvocations} rem invocation(s), each capped at ${REM_MAX_PASSES} passes)`);
    console.log(`plan: sandbox mind at a temp dir (genesis from templates/), restore chronologically,`);
    console.log(`      loop \`CIRCADIAN_HOME=<sandbox> bun src/rem.ts\` until the digestion ledger drains`);
    console.log(`      (cap ${MAX_REM_INVOCATIONS} invocations, stop on no-progress), then diff SELF.md living vs replayed.`);
    console.log(`safety: the real mind at ${REAL_MIND} is never written; the sandbox reaches rem only via the subprocess env.`);
    ok({
      process: "replay", phase: "dry-run", correlation_id: corr,
      summary: `replay plan: ${chosen.length} episode(s) (${liveCount} live, ${gitCount} git-recovered), ≈${estPasses} rem wave(s)`,
      context: { episodes_total: all.length, live: liveCount, git_recovered: gitCount, restoring: chosen.length, est_waves: estPasses, est_invocations: estInvocations, limit: Number.isFinite(limit) ? limit : null },
    });
    return;
  }

  if (chosen.length === 0) {
    fail({
      process: "replay", phase: "plan", correlation_id: corr,
      summary: "nothing to replay — no episodes found, live or in git history",
      context: { mind: REAL_MIND },
      cause: "the episode universe is empty",
      next_action: "verify the mind repo exists and has episode history (git -C mind log --diff-filter=D -- episodes/)",
    });
  }

  console.log(`replay: rebuilding a worldview from genesis with ${chosen.length} episode(s) (${chosen.filter((e) => e.source === "live").length} live, ${chosen.filter((e) => e.source === "git").length} git-recovered)`);
  const { sandboxHome, shimPlanted } = buildSandbox(chosen);
  console.log(`replay: sandbox mind at ${sandboxHome} (the real mind at ${REAL_MIND} is untouched by construction)`);
  if (shimPlanted) {
    console.log(
      `replay: genesis bootstrap shim planted in the SANDBOX SELF.md — templates/SELF.md has an empty Doctrine ` +
        `section, which mutate.ts parseSelf rejects; one labeled scaffold entry grafts the metabolism onto genesis`
    );
  }

  const wanted = new Map(chosen.map((e) => [e.filename, sha256(e.content)]));
  let previous = -1;
  let invocations = 0;
  let stalled = false;
  let lastStderrTail = "";

  for (; invocations < MAX_REM_INVOCATIONS; ) {
    const digested = digestedHashes(sandboxHome);
    const done = [...wanted.values()].filter((h) => digested.has(h)).length;
    if (done === wanted.size) break;
    if (done === previous) {
      // two consecutive reads with zero progress → the metabolism is stuck
      if (previous !== -1) {
        stalled = true;
        break;
      }
    }
    previous = done;
    invocations++;
    console.log(`replay: rem invocation ${invocations} — ${done}/${wanted.size} episode(s) digested so far`);
    const r = spawnSync(BUN_BIN, [REM_SCRIPT], {
      env: { ...process.env, CIRCADIAN_HOME: sandboxHome },
      cwd: REAL_HOME,
      encoding: "utf8",
      timeout: REM_INVOCATION_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
    });
    lastStderrTail = (r.stderr || "").split("\n").filter(Boolean).slice(-12).join("\n");
    if (lastStderrTail) console.log(lastStderrTail.replace(/^/gm, "  [rem] "));
    if (r.status !== 0) {
      // rem failed loudly in the sandbox (its own obs ledger there has the
      // full story). One failure is not fatal to the loop — the no-progress
      // guard decides; but say so.
      console.error(`replay: rem invocation ${invocations} exited ${r.status}`);
    }
  }

  const digested = digestedHashes(sandboxHome);
  const finalDone = [...wanted.values()].filter((h) => digested.has(h)).length;

  if (finalDone < wanted.size) {
    const undigested = [...wanted.entries()].filter(([, h]) => !digested.has(h)).map(([f]) => f);
    fail({
      process: "replay", phase: "rebuild", correlation_id: corr,
      summary: `replay rebuild incomplete: ${finalDone}/${wanted.size} digested after ${invocations} rem invocation(s)${stalled ? " (stalled — no progress between consecutive runs)" : " (invocation cap reached)"}`,
      context: { sandbox: sandboxHome, digested: finalDone, total: wanted.size, invocations, stalled, undigested: undigested.slice(0, 10), rem_stderr_tail: lastStderrTail },
      cause: stalled ? "the rem subprocess made no digestion progress between two consecutive runs" : `invocation cap (${MAX_REM_INVOCATIONS}) reached with backlog remaining`,
      next_action: `inspect the preserved sandbox: ${sandboxHome} — its logs/circadian.events.jsonl and logs/rem.log carry rem's own account; re-run with a smaller --limit to bisect`,
    });
  }

  // ---- divergence report ----
  const livingSelf = fs.readFileSync(REAL_SELF, "utf8");
  const replayedSelfPath = path.join(sandboxHome, "mind", "SELF.md");
  const replayedSelf = fs.readFileSync(replayedSelfPath, "utf8");
  const livingSections = sectionTokens(livingSelf);
  const replayedSections = sectionTokens(replayedSelf);

  console.log(`\n=== replay divergence report ===`);
  console.log(`episodes replayed: ${chosen.length} · rem invocations: ${invocations}${shimPlanted ? " · genesis bootstrap shim: planted (sandbox-only)" : ""}`);
  console.log(`worldview tokens: living ${tokensOf(livingSelf)} · replayed ${tokensOf(replayedSelf)} · Δ ${tokensOf(replayedSelf) - tokensOf(livingSelf)}\n`);
  console.log(`per-section tokens (chars/4):`);
  for (const name of SELF_SECTIONS) {
    const a = livingSections[name];
    const b = replayedSections[name];
    console.log(`  ${name.padEnd(26)} living ${String(a).padStart(5)} · replayed ${String(b).padStart(5)} · Δ ${b - a >= 0 ? "+" : ""}${b - a}`);
  }
  console.log(`\n--- unified diff (living → replayed) ---`);
  console.log(unifiedDiff(REAL_SELF, replayedSelfPath));
  console.log(`\nsandbox preserved for inspection: ${sandboxHome}`);

  // ONE event, on the REAL ledger (obs resolved its path from replay's own
  // untouched env at import time — the sandbox only ever lived in the
  // subprocess env above).
  ok({
    process: "replay", phase: "divergence", correlation_id: corr,
    summary: `replay complete: ${chosen.length} episode(s) rebuilt in ${invocations} rem invocation(s); worldview Δ ${tokensOf(replayedSelf) - tokensOf(livingSelf)} tokens vs living SELF.md`,
    context: {
      sandbox: sandboxHome,
      episodes_replayed: chosen.length,
      episodes_live: chosen.filter((e) => e.source === "live").length,
      episodes_git_recovered: chosen.filter((e) => e.source === "git").length,
      rem_invocations: invocations,
      bootstrap_shim: shimPlanted,
      living_tokens: tokensOf(livingSelf),
      replayed_tokens: tokensOf(replayedSelf),
      sections_living: livingSections,
      sections_replayed: replayedSections,
    },
  });
}

if (import.meta.main) await main();
