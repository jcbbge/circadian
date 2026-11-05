#!/usr/bin/env bun
// Circadian HARVEST — day-scoped sweep of harness-owned conversation stores.
//
// This is deliberately standalone: it is not wired into timers or REM. It
// walks today's native stores on this machine, skips sessions that already
// have an episode, and sends the rest through sleep.ts's drafting core.

import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { correlation } from "./obs.ts";
import { DRAFT_ATTEMPTS, DRAIN_PACE_MS, draftSessionEpisode, hasEpisodeForSession, queuedSleepSessionIds } from "./sleep.ts";
import { resolveEpisodeProvenance } from "./provenance.ts";

export type HarnessName = "Claude" | "Pi" | "Codex" | "Slate";

export interface HarvestSession {
  harness: HarnessName;
  sessionId: string;
  transcriptPath: string;
  mtimeMs: number;
}

interface DayWindow {
  day: string;
  startMs: number;
  endMs: number;
}

function localDay(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function dayWindow(day = localDay()): DayWindow {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("date must be YYYY-MM-DD");
  const [year, month, date] = day.split("-").map(Number);
  const start = new Date(year, month - 1, date);
  if (start.getFullYear() !== year || start.getMonth() !== month - 1 || start.getDate() !== date) {
    throw new Error("date must be a real YYYY-MM-DD day");
  }
  return { day, startMs: start.getTime(), endMs: start.getTime() + 24 * 3_600_000 };
}

function inDay(file: string, day: DayWindow): { ok: boolean; mtimeMs: number } {
  try {
    const stat = statSync(file);
    return { ok: stat.isFile() && stat.mtimeMs >= day.startMs && stat.mtimeMs < day.endMs, mtimeMs: stat.mtimeMs };
  } catch {
    return { ok: false, mtimeMs: 0 };
  }
}

function jsonlFilesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const file = join(dir, name);
    let stat;
    try { stat = statSync(file); } catch { continue; }
    if (stat.isDirectory()) out.push(...jsonlFilesUnder(file));
    else if (stat.isFile() && name.endsWith(".jsonl")) out.push(file);
  }
  return out;
}

function sessionIdFromPath(file: string): string {
  return basename(file).replace(/\.jsonl$/, "");
}

function collectClaude(day: DayWindow): HarvestSession[] {
  return jsonlFilesUnder(join(homedir(), ".claude", "projects")).flatMap((file) => {
    const scoped = inDay(file, day);
    return scoped.ok ? [{ harness: "Claude", sessionId: sessionIdFromPath(file), transcriptPath: realpathSync(file), mtimeMs: scoped.mtimeMs }] : [];
  });
}

function collectPi(day: DayWindow): HarvestSession[] {
  return jsonlFilesUnder(join(homedir(), ".pi", "agent", "sessions")).flatMap((file) => {
    const scoped = inDay(file, day);
    return scoped.ok ? [{ harness: "Pi", sessionId: sessionIdFromPath(file), transcriptPath: realpathSync(file), mtimeMs: scoped.mtimeMs }] : [];
  });
}

function collectCodex(day: DayWindow): HarvestSession[] {
  const [year, month, date] = day.day.split("-");
  const dir = join(homedir(), ".codex", "sessions", year, month, date);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    if (!/^rollout-.*\.jsonl$/.test(name)) return [];
    const file = join(dir, name);
    const scoped = inDay(file, day);
    return scoped.ok ? [{ harness: "Codex", sessionId: sessionIdFromPath(file), transcriptPath: realpathSync(file), mtimeMs: scoped.mtimeMs }] : [];
  });
}

function collectSlate(day: DayWindow): HarvestSession[] {
  const dir = join(homedir(), ".local", "share", "slate", "trace");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    if (!/^ses_.*\.jsonl$/.test(name)) return [];
    const file = join(dir, name);
    const scoped = inDay(file, day);
    return scoped.ok ? [{ harness: "Slate", sessionId: sessionIdFromPath(file), transcriptPath: realpathSync(file), mtimeMs: scoped.mtimeMs }] : [];
  });
}

export function collectHarvestSessions(day: DayWindow): HarvestSession[] {
  return [
    ...collectClaude(day),
    ...collectPi(day),
    ...collectCodex(day),
    ...collectSlate(day),
  ].sort((a, b) => {
    const harnessOrder = ["Claude", "Pi", "Codex", "Slate"].indexOf(a.harness) - ["Claude", "Pi", "Codex", "Slate"].indexOf(b.harness);
    return harnessOrder || a.mtimeMs - b.mtimeMs || a.transcriptPath.localeCompare(b.transcriptPath);
  });
}

function parseArgs(argv: string[]): { day: DayWindow; help: boolean } {
  let day = localDay();
  let help = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") help = true;
    else if (arg === "--date") day = argv[++i] || "";
    else if (arg.startsWith("--date=")) day = arg.slice("--date=".length);
    else if (arg === "--dry-run") continue; // sleep.ts consumes this global flag
    else throw new Error(`unknown argument: ${arg}`);
  }
  return { day: dayWindow(day), help };
}

function printHelp(): void {
  console.log("usage: bun src/harvest.ts [--date YYYY-MM-DD] [--dry-run]");
  console.log("sweeps Claude, Pi, Codex, then Slate conversation stores for one local day");
}

export async function runHarvest(argv = process.argv.slice(2)): Promise<void> {
  const { day, help } = parseArgs(argv);
  if (help) { printHelp(); return; }

  const corr = correlation("harvest");
  const sessions = collectHarvestSessions(day).filter((session) => !hasEpisodeForSession(session.sessionId));
  console.log(`harvest ${day.day}: ${sessions.length} new session(s)`);

  const queued = queuedSleepSessionIds();
  let deferred = 0;
  let drafted = 0;
  let skipped = 0;
  let failed = 0;
  let attempts = 0;

  for (const session of sessions) {
    if (queued.has(session.sessionId)) {
      deferred += 1;
      continue; // drain (or human dead-letter review) owns recovery
    }
    if (attempts > 0 && DRAIN_PACE_MS > 0) await new Promise((r) => setTimeout(r, DRAIN_PACE_MS));
    attempts += 1;
    console.log(`${session.harness}: drafting ${session.sessionId}`);
    const result = await draftSessionEpisode({
      transcriptPath: session.transcriptPath,
      sessionId: session.sessionId,
      corr,
      queueOnFailure: true,
      queueAttempts: DRAFT_ATTEMPTS,
      mode: "harvest",
      scope: "global",
      provenance: resolveEpisodeProvenance(session.transcriptPath, {
        harness: session.harness.toLowerCase(),
        session_id: session.sessionId,
      }),
    });
    if (result.status === "written") drafted += 1;
    else if (result.status === "no-transcript" || result.status === "empty-transcript") skipped += 1;
    else failed += 1;
  }

  console.log(`harvest complete: ${drafted} drafted/already-written, ${skipped} skipped, ${failed} failed, ${deferred} queued/dead-lettered`);
  if (failed > 0 || deferred > 0) process.exitCode = 1;
}

if (import.meta.main) {
  try {
    await runHarvest();
  } catch (e) {
    console.error((e as Error).message);
    process.exitCode = 1;
  }
}
