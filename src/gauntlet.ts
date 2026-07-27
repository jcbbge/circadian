#!/usr/bin/env bun
/**
 * gauntlet.ts — the batch regression harness for a full episode-archive run
 * against a pluggable payload, in a sandbox.
 *
 * WS-G scope (popmem program, harness prep only): the stacker (src/stack.ts)
 * does not exist yet — WS-C builds it. This organ makes "run the whole
 * archive through <payload>, N episodes at a time" a one-command operation
 * TODAY, against a stub payload, so the real stacker has a harness to plug
 * into the moment it lands (`--payload src/stack.ts`, same argv contract).
 *
 * Reuses replay.ts's sandbox machinery (genesis-from-templates, the hard
 * safety assertion, the episode-recovery plumbing) rather than duplicating
 * it — gauntlet only adds what replay didn't need: a rev-PINNED episode
 * universe (collectAllEpisodesAt, so the corpus is deterministic across
 * calls even as the live mind keeps composting), a sandbox that also ships
 * templates/ + src/ (a future payload may resolve CIRCADIAN_HOME/templates
 * or CIRCADIAN_HOME/src directly, unlike rem.ts which always runs from
 * REAL_HOME), and the batch-invoke-collect-report loop itself.
 *
 * DESIGN DECISION a later workstream must know: buildGauntletSandbox seeds
 * EVERY chosen episode into mind/episodes/ up front (replay.ts's buildSandbox
 * behavior, reused as-is to keep this file small) — batching is a property
 * of how the PAYLOAD is invoked (it receives only its batch's filenames as
 * argv), not of what is on disk. A payload that wants a true incremental
 * drip-feed (only ever seeing episodes up to its current batch) must ignore
 * mind/episodes/ entries outside its argv list itself; gauntlet.ts does not
 * hide the other files.
 *
 * HARD SAFETY: inherited from replay.ts's assertSandboxSafe — the sandbox is
 * asserted outside the real home before any write, and reaches the payload
 * only through the subprocess env (obs.ts resolves its ledger at IMPORT
 * time, so gauntlet.ts's own events land on the OUTER process's ledger; the
 * payload subprocess's CIRCADIAN_HOME=sandboxHome is invisible to it).
 */

import * as fs from "fs";
import * as path from "path";
import { homedir } from "os";
import { spawnSync } from "child_process";
import { ok, correlation } from "./obs.ts";
import { assertSandboxSafe, buildSandbox, collectAllEpisodesAt, type ReplayEpisode } from "./replay.ts";

// Two distinct "homes", deliberately not conflated:
//   MIND_HOME    — where the live episode archive lives (CIRCADIAN_HOME, same
//                  convention as replay.ts) — the default --mind target.
//   REPO_ROOT    — the checkout gauntlet.ts itself is running FROM (this
//                  worktree in dev, mainline post-merge). The templates/ +
//                  src/ shipped into the sandbox are THIS running codebase's,
//                  never CIRCADIAN_HOME's — a dev worktree's CIRCADIAN_HOME
//                  target may be a different, unmerged checkout that doesn't
//                  even have gauntlet.ts yet.
const MIND_HOME = process.env.CIRCADIAN_HOME || path.join(homedir(), "circadian");
const REPO_ROOT = path.join(import.meta.dir, "..");
const BUN_BIN = process.env.CIRCADIAN_BUN_BIN || path.join(homedir(), ".bun/bin/bun");
const STUB_PAYLOAD_SCRIPT = path.join(REPO_ROOT, "src", "gauntlet-stub-payload.ts");

// "3-at-a-time batches" (the brief's own phrase for the gauntlet's cadence).
export const GAUNTLET_BATCH_DEFAULT = 3;
// One payload invocation gets the same headroom rem's own subprocess gets in
// replay.ts — a future stacker batch may involve a real LLM call.
const PAYLOAD_TIMEOUT_MS = 30 * 60 * 1000;

export function batchesOf<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** buildSandbox (replay.ts) scaffolds mind/ + logs/ from templates/ at
 * REAL_HOME; gauntlet additionally ships a full templates/ + src/ copy into
 * the sandbox home itself, so a payload run with CIRCADIAN_HOME=sandboxHome
 * is self-contained regardless of how it resolves its own runtime paths. */
export function buildGauntletSandbox(episodes: ReplayEpisode[]): { sandboxHome: string; shimPlanted: boolean } {
  const { sandboxHome, shimPlanted } = buildSandbox(episodes);
  assertSandboxSafe(sandboxHome);
  fs.cpSync(path.join(REPO_ROOT, "templates"), path.join(sandboxHome, "templates"), { recursive: true });
  fs.cpSync(path.join(REPO_ROOT, "src"), path.join(sandboxHome, "src"), { recursive: true });
  return { sandboxHome, shimPlanted };
}

export interface GauntletBatchResult {
  batchIndex: number;
  episodes: string[];
  exitCode: number | null;
  stdoutTail: string;
  stderrTail: string;
}

export interface GauntletReport {
  sandboxHome: string;
  rev: string;
  totalEpisodes: number;
  batchSize: number;
  shimPlanted: boolean;
  batches: GauntletBatchResult[];
}

export interface GauntletOptions {
  /** Mind git revision the episode corpus is pinned to — required, never a
   * live default (MIND-SPEC: the live mind moves twice daily as REM composts). */
  rev: string;
  /** The mind repo to read from (git show/ls-tree only — never written). */
  mindDir: string;
  batchSize?: number;
  /** Cap the pinned universe for a faster run; omit for the full corpus. */
  limit?: number;
  /** argv prefix; each batch's episode filenames are appended. Default: the
   * stub payload (BUN_BIN, STUB_PAYLOAD_SCRIPT). */
  payloadCmd?: string[];
}

/** The batch loop: pin → sandbox → invoke payload per batch → report. Every
 * batch and the run as a whole emits an obs event (Law 9 — a process that
 * runs and produces no event is defective). */
export function runGauntlet(opts: GauntletOptions): GauntletReport {
  const corr = correlation("gauntlet");
  const batchSize = opts.batchSize ?? GAUNTLET_BATCH_DEFAULT;
  const all = collectAllEpisodesAt(opts.rev, opts.mindDir);
  const chosen = opts.limit ? all.slice(0, opts.limit) : all;
  const { sandboxHome, shimPlanted } = buildGauntletSandbox(chosen);
  const groups = batchesOf(chosen, batchSize);
  const payloadCmd = opts.payloadCmd ?? [BUN_BIN, STUB_PAYLOAD_SCRIPT];

  const batches: GauntletBatchResult[] = groups.map((group, i) => {
    const filenames = group.map((e) => e.filename);
    const r = spawnSync(payloadCmd[0], [...payloadCmd.slice(1), sandboxHome, ...filenames], {
      env: { ...process.env, CIRCADIAN_HOME: sandboxHome },
      cwd: sandboxHome,
      encoding: "utf8",
      timeout: PAYLOAD_TIMEOUT_MS,
      maxBuffer: 32 * 1024 * 1024,
    });
    const result: GauntletBatchResult = {
      batchIndex: i,
      episodes: filenames,
      exitCode: r.status,
      stdoutTail: (r.stdout || "").split("\n").filter(Boolean).slice(-5).join("\n"),
      stderrTail: (r.stderr || "").split("\n").filter(Boolean).slice(-5).join("\n"),
    };
    ok({
      process: "replay",
      phase: "gauntlet-batch",
      correlation_id: corr,
      summary: `gauntlet batch ${i + 1}/${groups.length}: ${filenames.length} episode(s), payload exit ${r.status}`,
      context: { batch: i, episodes: filenames, exit_code: r.status, sandbox: sandboxHome },
    });
    return result;
  });

  ok({
    process: "replay",
    phase: "gauntlet",
    correlation_id: corr,
    summary: `gauntlet complete: ${groups.length} batch(es), ${chosen.length} episode(s) at rev ${opts.rev.slice(0, 12)}, sandbox ${sandboxHome}`,
    context: {
      rev: opts.rev,
      total_episodes: chosen.length,
      batches: groups.length,
      batch_size: batchSize,
      sandbox: sandboxHome,
      shim_planted: shimPlanted,
    },
  });

  return { sandboxHome, rev: opts.rev, totalEpisodes: chosen.length, batchSize, shimPlanted, batches };
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.includes("--gauntlet")) {
    console.error(
      "gauntlet: usage: bun src/gauntlet.ts --gauntlet --rev <mind-git-rev> " +
        "[--mind <path>] [--batch-size N] [--limit N] [--payload <bun-script>]"
    );
    process.exit(1);
  }
  const revIdx = args.indexOf("--rev");
  const rev = revIdx !== -1 ? args[revIdx + 1] : undefined;
  if (!rev) {
    console.error("gauntlet: --rev <mind-git-rev> is required — the corpus must be pinned, never live HEAD");
    process.exit(1);
  }
  const mindIdx = args.indexOf("--mind");
  const mindDir = mindIdx !== -1 ? args[mindIdx + 1] : path.join(MIND_HOME, "mind");
  const batchIdx = args.indexOf("--batch-size");
  const batchSize = batchIdx !== -1 ? parseInt(args[batchIdx + 1], 10) : GAUNTLET_BATCH_DEFAULT;
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : undefined;
  const payloadIdx = args.indexOf("--payload");
  const payloadCmd = payloadIdx !== -1 ? [BUN_BIN, args[payloadIdx + 1]] : undefined;

  const report = runGauntlet({ rev, mindDir, batchSize, limit, payloadCmd });

  console.log(`=== gauntlet report ===`);
  console.log(`sandbox: ${report.sandboxHome}`);
  console.log(`pinned rev: ${report.rev}`);
  console.log(`episodes fed: ${report.totalEpisodes} in ${report.batches.length} batch(es) of ${report.batchSize}`);
  for (const b of report.batches) {
    console.log(`  batch ${b.batchIndex + 1}: [${b.episodes.join(", ")}] — payload exit ${b.exitCode}`);
  }
  const failures = report.batches.filter((b) => b.exitCode !== 0).length;
  console.log(failures === 0 ? `all batches: payload exit 0` : `${failures} batch(es) had non-zero payload exit`);
}

if (import.meta.main) await main();
