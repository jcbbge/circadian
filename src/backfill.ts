#!/usr/bin/env bun
/**
 * backfill.ts — one-shot: run SLEEP over the entire history of past sessions
 * from BOTH agents (Claude Code + Pi), depositing an episode for each
 * substantial conversation, so REM can then digest a lifetime of prior work
 * into the mind. Not a scheduled process — run once (or re-run; it resumes).
 *
 * Design choices, deliberate:
 *   - MAIN sessions only. Claude sub-agent transcripts (agent-*.jsonl) are
 *     delegated task fragments, not conversations — backfilling them would
 *     flood the mind with noise (violates 'load-bearing or dead'). Skipped.
 *   - Substantial only. Files below --min-bytes (default 100KB) are skipped;
 *     tiny/aborted sessions carry no episode worth keeping.
 *   - Synchronous, one at a time. We call sleep's worker inline (not the
 *     detached hook) so we can watch progress and not spawn hundreds of procs.
 *   - Resumable. A manifest (logs/backfill.jsonl) records every processed
 *     transcript; re-running skips only ones that produced an episode
 *     (status "ok"). Failures (status "no-episode") are RETRIED on re-run —
 *     a dead-LLM night no longer marks those transcripts done forever.
 *   - SLEEP writes episodes; REM (run after) does the absorbing. This script
 *     never touches SELF.md.
 *
 * Usage:
 *   bun run src/backfill.ts                 # both sources, >=100KB, main only
 *   bun run src/backfill.ts --min-bytes 200000
 *   bun run src/backfill.ts --limit 20      # cap N (test run)
 *   bun run src/backfill.ts --days 7        # only sessions modified in last 7 days
 *   bun run src/backfill.ts --dry-run       # list what WOULD be processed
 *   bun run src/backfill.ts --claude-only | --pi-only
 */

import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { ok, degraded, correlation } from "./obs.ts";

const CIRCADIAN_HOME = process.env.CIRCADIAN_HOME || join(homedir(), "circadian");
const BUN_BIN = process.env.CIRCADIAN_BUN_BIN || join(homedir(), ".bun/bin/bun");
const SLEEP_TS = join(CIRCADIAN_HOME, "src", "sleep.ts");
const MANIFEST = join(CIRCADIAN_HOME, "logs", "backfill.jsonl");
const EPISODES_DIR = join(CIRCADIAN_HOME, "mind", "episodes");

const corr = correlation("backfill");

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const opt = (n: string, d: number) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : d;
};

const MIN_BYTES = opt("--min-bytes", 100_000);
const LIMIT = opt("--limit", Infinity);
const DAYS = opt("--days", Infinity); // only transcripts modified within N days
const maxAgeMs = DAYS === Infinity ? Infinity : DAYS * 24 * 60 * 60 * 1000;
const DRY = flag("--dry-run");
const CLAUDE_ONLY = flag("--claude-only");
const PI_ONLY = flag("--pi-only");

function findFiles(cmd: string): string[] {
  try {
    return execSync(cmd, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

// Claude Code: exclude agent-*.jsonl (sub-agent fragments); main sessions only.
const claudeFiles = CLAUDE_ONLY || !PI_ONLY
  ? findFiles(`find ${homedir()}/.claude/projects -name '*.jsonl' -type f 2>/dev/null`).filter(
      (f) => !/\/agent-[^/]*\.jsonl$/.test(f)
    )
  : [];

// Pi: exclude node_modules cruft; main sessions only.
const piFiles = PI_ONLY || !CLAUDE_ONLY
  ? findFiles(`find ${homedir()}/.pi/agent/sessions -name '*.jsonl' -type f 2>/dev/null`).filter(
      (f) => !f.includes("node_modules")
    )
  : [];

interface Cand {
  path: string;
  source: "claude" | "pi";
  bytes: number;
}
const candidates: Cand[] = [];
for (const [files, source] of [[claudeFiles, "claude"], [piFiles, "pi"]] as const) {
  for (const path of files) {
    let bytes = 0;
    let mtimeMs = 0;
    try {
      const st = statSync(path);
      bytes = st.size;
      mtimeMs = st.mtimeMs;
    } catch {
      continue;
    }
    if (bytes < MIN_BYTES) continue;
    if (maxAgeMs !== Infinity && Date.now() - mtimeMs > maxAgeMs) continue;
    candidates.push({ path, source, bytes });
  }
}
// largest first — richest sessions absorbed before token pressure grows
candidates.sort((a, b) => b.bytes - a.bytes);

// resume: skip already-processed transcripts
const done = new Set<string>();
if (existsSync(MANIFEST)) {
  for (const line of readFileSync(MANIFEST, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line);
      // Only a successful digest bars re-processing. "no-episode" lines
      // record a FAILURE (dead LLM, no parseable draft); skipping them made
      // a transient outage permanently lose those episodes. Re-running now
      // retries them.
      if (rec?.status === "ok" && typeof rec?.path === "string") done.add(rec.path);
    } catch {
      /* skip */
    }
  }
}

const todo = candidates.filter((c) => !done.has(c.path)).slice(0, LIMIT);

console.log(`backfill: ${candidates.length} candidate(s) >= ${(MIN_BYTES / 1024).toFixed(0)}KB` +
  `${DAYS === Infinity ? "" : `, last ${DAYS}d`} ` +
  `(${claudeFiles.length} claude main, ${piFiles.length} pi main scanned)`);
console.log(`backfill: ${done.size} already processed, ${todo.length} to do this run\n`);

if (DRY) {
  for (const c of todo.slice(0, 40)) console.log(`  [${c.source}] ${(c.bytes / 1024).toFixed(0)}KB  ${c.path}`);
  if (todo.length > 40) console.log(`  ... and ${todo.length - 40} more`);
  console.log(`\n(dry run — nothing written)`);
  ok({
    process: "backfill", phase: "dry-run", correlation_id: corr,
    summary: `dry-run: ${todo.length} transcript(s) would be processed`,
    context: { candidates: todo.length, min_bytes: MIN_BYTES, source_counts: { claude: claudeFiles.length, pi: piFiles.length } },
  });
  process.exit(0);
}

mkdirSync(join(CIRCADIAN_HOME, "logs"), { recursive: true });

function episodeCount(): number {
  try {
    return execSync(`ls ${EPISODES_DIR}/*.md 2>/dev/null | wc -l`, { encoding: "utf8" }).trim() === ""
      ? 0
      : Number(execSync(`ls ${EPISODES_DIR}/*.md 2>/dev/null | grep -v gitkeep | wc -l`, { encoding: "utf8" }).trim());
  } catch {
    return 0;
  }
}

let okCount = 0;
let failCount = 0;
const startEpisodes = episodeCount();

for (let i = 0; i < todo.length; i++) {
  const c = todo[i];
  const sessionId = `backfill-${c.source}-${c.path.split("/").pop()?.replace(/\.jsonl$/, "")}`;
  const before = episodeCount();
  process.stdout.write(`[${i + 1}/${todo.length}] ${c.source} ${(c.bytes / 1024).toFixed(0)}KB ... `);

  // call sleep's worker synchronously, event via env (its documented path)
  const res = spawnSync(BUN_BIN, ["run", SLEEP_TS, "--worker"], {
    env: {
      ...process.env,
      CIRCADIAN_SLEEP_EVENT: JSON.stringify({ transcript_path: c.path, session_id: sessionId }),
    },
    stdio: ["ignore", "ignore", "ignore"],
    timeout: 8 * 60 * 1000,
  });

  const after = episodeCount();
  const produced = after > before;
  const status = produced ? "ok" : "no-episode";
  if (produced) okCount++;
  else failCount++;
  console.log(produced ? "episode written" : `skipped (${res.status === null ? "timeout" : "no draft"})`);

  if (produced) {
    ok({
      process: "backfill", phase: "transcript", correlation_id: corr,
      summary: `episode written for ${c.source} transcript`,
      context: { path: c.path, source: c.source, bytes: c.bytes, episode_produced: true },
    });
  } else {
    degraded({
      process: "backfill", phase: "transcript", correlation_id: corr,
      summary: `no episode produced for ${c.source} transcript`,
      context: { path: c.path, source: c.source, bytes: c.bytes, episode_produced: false, exit_status: res.status },
      cause: res.status === null ? `sleep worker timed out after ${8 * 60 * 1000}ms` : "sleep worker produced no episode (LLM draft failed or transcript yielded no content)",
      next_action: "inspect logs/sleep.log for the session_id; re-run backfill for this transcript if the failure is transient",
    });
  }

  appendFileSync(
    MANIFEST,
    JSON.stringify({ ts: new Date().toISOString(), path: c.path, source: c.source, status }) + "\n"
  );
}

const endEpisodes = episodeCount();
console.log(
  `\nbackfill done: ${okCount} episode(s) written, ${failCount} produced nothing. ` +
    `episodes/ went ${startEpisodes} -> ${endEpisodes}.`
);
console.log(`next: run REM to digest them ->  ${BUN_BIN} ${join(CIRCADIAN_HOME, "src", "rem.ts")}`);
ok({
  process: "backfill", phase: "summary", correlation_id: corr,
  summary: `backfill complete: ${okCount} written, ${failCount} skipped`,
  context: { written: okCount, skipped: failCount, source_counts: { claude: claudeFiles.length, pi: piFiles.length }, episodes_before: startEpisodes, episodes_after: endEpisodes },
});
