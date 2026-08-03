#!/usr/bin/env bun
/**
 * janitor.ts — the meals/ janitor. Excretion for working memory.
 *
 * GRAZE writes mind/meals/<sessionId>.md (the running meal) and
 * mind/meals/.<sessionId>.state.json (throttle checkpoint) — both harnesses,
 * same naming (graze.ts statePath; circadian-mind.ts turn_end hook). SLEEP
 * deletes the meal best-effort and NEVER deletes the state file; sessions
 * that end without SLEEP (crash, quit, lid-close) orphan both. Nothing else
 * reaps them. That accretion is the leak this module stops.
 *
 * A file is swept only when ALL of these hold:
 *   1. its session is NOT in logs/pending-sleep.jsonl (SLEEP still owed —
 *      the meal is the episode's only surviving notes; never delete),
 *   2. its session has NO live transcript — no .jsonl under the transcript
 *      probe dirs whose filename contains the session id with mtime inside
 *      the safety window (claude: <id>.jsonl; pi: <ts>_<id>.jsonl — both
 *      contain the id, so a substring match covers both harnesses),
 *   3. the file's OWN mtime is older than SAFETY_WINDOW (6h) — a slow SLEEP
 *      never outruns 6h, so this races nothing,
 *   4. logs/pending-sleep.lock is absent — a drain in flight skips the
 *      entire sweep for this run.
 *
 * A live transcript also covers the currently-running session: any active
 * session's transcript was written within the window, so it reads as live.
 *
 * Blind-janitor rule: if a top-level transcript probe dir EXISTS but cannot
 * be read, the live check is blind — the sweep deletes NOTHING and emits
 * degraded. Deleting while blind could reap a live session's working memory.
 *
 * Runs as a tail phase of REM (twice daily, after the commit phase — the
 * sweep can never preempt REM's core path; meals/ is gitignored working
 * memory, so no commit rides the deletions). Also runnable standalone:
 *
 *   bun src/janitor.ts [--dry-run]
 *
 * Observability: exactly one event per sweep — process "janitor", phase
 * "sweep" — carrying {deleted_meals, deleted_states, skipped_live,
 * skipped_pending} (plus skipped_young/errors/dry_run). Law 9: nothing silent.
 * The sweep never throws; a host (REM) that imports sweepMeals stays safe.
 */

import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { correlation, degraded, fail, idle, ok } from "./obs.ts";

const CIRCADIAN_HOME = process.env.CIRCADIAN_HOME || join(homedir(), "circadian");
const MEALS_DIR = join(CIRCADIAN_HOME, "mind", "meals");

// FIXED CONTRACT — sleep.ts:70-71 owns these paths; doctor.ts reads the same
// queue. The janitor is a third reader; it never writes either path.
const PENDING_QUEUE = join(CIRCADIAN_HOME, "logs", "pending-sleep.jsonl");
const PENDING_LOCK = join(CIRCADIAN_HOME, "logs", "pending-sleep.lock");

// Transcript probe dirs — the same roots doctor.ts:56-57 probes. doctor.ts
// runs main() unconditionally on import (no import.meta.main guard), so its
// consts cannot be imported without executing doctor; the two paths are
// mirrored here under the same env-override contract (CIRCADIAN_PROJECTS_DIR),
// plus CIRCADIAN_PI_SESSIONS_DIR so tests can sandbox the pi root too.
const PROJECTS_DIR = process.env.CIRCADIAN_PROJECTS_DIR || join(homedir(), ".claude", "projects");
const PI_SESSIONS_DIR = process.env.CIRCADIAN_PI_SESSIONS_DIR || join(homedir(), ".pi", "agent", "sessions");

/** Safety window: never delete a file whose own mtime is newer than this. */
export const SAFETY_WINDOW_MS = 6 * 3_600_000; // 6 hours

const STATE_SUFFIX = ".state.json";

// ---------- pure decision logic (unit-tested; no I/O) ----------

export type MealKind = "meal" | "state";

export interface SweepCandidate {
  path: string;
  sessionId: string;
  kind: MealKind;
  mtimeMs: number;
}

export type SweepAction = "delete" | "skip-pending" | "skip-live" | "skip-young";

export interface SweepDecision {
  candidate: SweepCandidate;
  action: SweepAction;
}

/**
 * classifyMealFile — the two leak shapes, both harnesses:
 *   "<sessionId>.md"           → meal
 *   ".<sessionId>.state.json"  → throttle state (graze.ts + circadian-mind.ts)
 * Anything else in meals/ (dotfile meals, stray files) is not ours: null.
 */
export function classifyMealFile(name: string): { kind: MealKind; sessionId: string } | null {
  if (name.startsWith(".")) {
    if (!name.endsWith(STATE_SUFFIX)) return null;
    const sessionId = name.slice(1, name.length - STATE_SUFFIX.length);
    return sessionId ? { kind: "state", sessionId } : null;
  }
  if (name.endsWith(".md")) {
    const sessionId = name.slice(0, -3);
    return sessionId ? { kind: "meal", sessionId } : null;
  }
  return null;
}

/** Live = a recent transcript basename contains the session id (both namings). */
export function isLiveSession(sessionId: string, recentTranscriptNames: string[]): boolean {
  return recentTranscriptNames.some((n) => n.includes(sessionId));
}

/**
 * planSweep — the whole policy, in priority order:
 *   pending (SLEEP owed) → live (recent transcript) → young (inside the
 *   safety window) → delete. Counts derive from the returned decisions, so
 *   dry-run and real runs report identically.
 */
export function planSweep(
  candidates: SweepCandidate[],
  recentTranscriptNames: string[],
  pendingSessionIds: Set<string>,
  nowMs: number,
  safetyWindowMs: number = SAFETY_WINDOW_MS
): SweepDecision[] {
  const cutoff = nowMs - safetyWindowMs;
  return candidates.map((candidate) => {
    let action: SweepAction;
    if (pendingSessionIds.has(candidate.sessionId)) action = "skip-pending";
    else if (isLiveSession(candidate.sessionId, recentTranscriptNames)) action = "skip-live";
    else if (candidate.mtimeMs > cutoff) action = "skip-young";
    else action = "delete";
    return { candidate, action };
  });
}

// ---------- I/O edges ----------

export interface SweepCounts {
  deleted_meals: number;
  deleted_states: number;
  skipped_live: number;
  skipped_pending: number;
  skipped_young: number;
  errors: number;
}

export interface SweepResult extends SweepCounts {
  dry_run: boolean;
  lock_skip: boolean;
  blind: boolean;
  nowMs: number;
  decisions: SweepDecision[];
}

export interface SweepOptions {
  mealsDir?: string;
  pendingQueuePath?: string;
  pendingLockPath?: string;
  transcriptDirs?: string[];
  safetyWindowMs?: number;
  nowMs?: number;
  dryRun?: boolean;
  correlationId?: string;
}

function enumerateCandidates(mealsDir: string): SweepCandidate[] {
  const out: SweepCandidate[] = [];
  for (const name of readdirSync(mealsDir)) {
    const classified = classifyMealFile(name);
    if (!classified) continue;
    const path = join(mealsDir, name);
    try {
      const st = statSync(path);
      if (!st.isFile()) continue;
      out.push({ path, sessionId: classified.sessionId, kind: classified.kind, mtimeMs: st.mtimeMs });
    } catch {
      /* vanished between readdir and stat — not ours to chase */
    }
  }
  return out;
}

/** Tolerant JSONL read — same line shape and tolerance as sleep.ts's reader. */
function readPendingSessionIds(queuePath: string): Set<string> {
  const ids = new Set<string>();
  if (!existsSync(queuePath)) return ids;
  for (const line of readFileSync(queuePath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (typeof e?.session_id === "string" && e.session_id) ids.add(e.session_id);
    } catch {
      /* tolerate a partial trailing line from a crashed append */
    }
  }
  return ids;
}

/**
 * One bounded pass over the transcript roots (depth ≤5, ≤5000 files — the
 * same bounds as doctor's findRecentTranscripts), keeping basenames of
 * .jsonl transcripts modified inside the window. A root that EXISTS but
 * cannot be read lands in `unreadable` — the blind-janitor rule's trigger.
 */
function probeRecentTranscripts(
  dirs: string[],
  nowMs: number,
  windowMs: number
): { names: string[]; unreadable: string[] } {
  const cutoff = nowMs - windowMs;
  const names: string[] = [];
  const unreadable: string[] = [];
  const maxDepth = 5;
  const maxFiles = 5000;
  let fileCount = 0;

  function walk(d: string, depth: number): void {
    if (depth > maxDepth || fileCount > maxFiles) return;
    let entries: ReturnType<typeof readdirSync>;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      if (depth === 0) unreadable.push(d);
      return;
    }
    for (const e of entries) {
      if (fileCount > maxFiles) return;
      const full = join(d, e.name);
      if (e.isDirectory()) walk(full, depth + 1);
      else if (e.name.endsWith(".jsonl")) {
        fileCount++;
        try {
          const st = statSync(full);
          if (st.mtimeMs >= cutoff) names.push(basename(full));
        } catch {
          /* ignore */
        }
      }
    }
  }

  for (const dir of dirs) {
    if (existsSync(dir)) walk(dir, 0);
  }
  return { names, unreadable };
}

function zeroCounts(): SweepCounts {
  return { deleted_meals: 0, deleted_states: 0, skipped_live: 0, skipped_pending: 0, skipped_young: 0, errors: 0 };
}

function countsFromDecisions(decisions: SweepDecision[]): SweepCounts {
  const c = zeroCounts();
  for (const d of decisions) {
    if (d.action === "delete") {
      if (d.candidate.kind === "meal") c.deleted_meals++;
      else c.deleted_states++;
    } else if (d.action === "skip-live") c.skipped_live++;
    else if (d.action === "skip-pending") c.skipped_pending++;
    else c.skipped_young++;
  }
  return c;
}

/**
 * sweepMeals — enumerate, plan, delete (unless dry-run), emit ONE event.
 * Never throws: every I/O edge is guarded; a failure degrades the event
 * instead of cracking the host (REM) that called us.
 */
export function sweepMeals(opts: SweepOptions = {}): SweepResult {
  const mealsDir = opts.mealsDir ?? MEALS_DIR;
  const pendingQueuePath = opts.pendingQueuePath ?? PENDING_QUEUE;
  const pendingLockPath = opts.pendingLockPath ?? PENDING_LOCK;
  const transcriptDirs = opts.transcriptDirs ?? [PROJECTS_DIR, PI_SESSIONS_DIR];
  const safetyWindowMs = opts.safetyWindowMs ?? SAFETY_WINDOW_MS;
  const nowMs = opts.nowMs ?? Date.now();
  const dryRun = opts.dryRun ?? false;
  const corr = opts.correlationId ?? correlation("janitor");

  const base: Omit<SweepResult, keyof SweepCounts> = {
    dry_run: dryRun,
    lock_skip: false,
    blind: false,
    nowMs,
    decisions: [],
  };

  // Guard 1: a pending-sleep drain is in flight — skip the sweep entirely.
  if (existsSync(pendingLockPath)) {
    idle({
      process: "janitor", phase: "sweep", correlation_id: corr,
      summary: "pending-sleep drain in flight (lock present); sweep skipped this run",
      context: { lock: pendingLockPath, dry_run: dryRun },
    });
    return { ...base, ...zeroCounts(), lock_skip: true };
  }

  // Enumerate the leak. A missing meals dir is a clean slate, not an error.
  let candidates: SweepCandidate[];
  if (!existsSync(mealsDir)) {
    idle({
      process: "janitor", phase: "sweep", correlation_id: corr,
      summary: "no meals/ dir yet — nothing to sweep",
      context: { meals_dir: mealsDir, dry_run: dryRun },
    });
    return { ...base, ...zeroCounts() };
  }
  try {
    candidates = enumerateCandidates(mealsDir);
  } catch (err) {
    degraded({
      process: "janitor", phase: "sweep", correlation_id: corr,
      summary: "meals/ exists but cannot be read; sweep aborted with zero deletions",
      context: { meals_dir: mealsDir, dry_run: dryRun },
      cause: (err as Error).message,
      next_action: "fix permissions on the meals dir, then re-run `bun src/janitor.ts --dry-run`",
    });
    return { ...base, ...zeroCounts(), errors: 1 };
  }

  // Probe for live transcripts. Blind-janitor rule: an unreadable probe root
  // means the live check cannot be trusted — delete nothing, emit degraded.
  const probe = probeRecentTranscripts(transcriptDirs, nowMs, safetyWindowMs);
  if (probe.unreadable.length > 0) {
    degraded({
      process: "janitor", phase: "sweep", correlation_id: corr,
      summary: "transcript probe root unreadable — the live-session check is blind; sweep aborted with zero deletions",
      context: { unreadable: probe.unreadable, candidates: candidates.length, dry_run: dryRun },
      cause: "a transcript directory exists but readdir failed (permissions)",
      next_action: "restore read access to the dir(s) in context.unreadable, then re-run `bun src/janitor.ts --dry-run`",
    });
    return { ...base, ...zeroCounts(), blind: true, errors: 1 };
  }

  const pendingIds = readPendingSessionIds(pendingQueuePath);
  const decisions = planSweep(candidates, probe.names, pendingIds, nowMs, safetyWindowMs);
  const counts = countsFromDecisions(decisions);

  if (!dryRun) {
    for (const d of decisions) {
      if (d.action !== "delete") continue;
      try {
        unlinkSync(d.candidate.path);
      } catch {
        // The SLEEP pattern: a single failed unlink is not fatal — count it,
        // degrade the event, keep sweeping the rest.
        counts.errors++;
        if (d.candidate.kind === "meal") counts.deleted_meals--;
        else counts.deleted_states--;
      }
    }
  }

  const summary =
    `${dryRun ? "dry-run: would delete" : "swept"} ${counts.deleted_meals} meal(s), ${counts.deleted_states} state file(s)` +
    `; skipped ${counts.skipped_live} live, ${counts.skipped_pending} pending-sleep, ${counts.skipped_young} inside the 6h window`;
  const context = {
    ...counts,
    dry_run: dryRun,
    candidates: candidates.length,
    pending_sessions: pendingIds.size,
    recent_transcripts: probe.names.length,
    safety_window_hours: safetyWindowMs / 3_600_000,
    meals_dir: mealsDir,
  };

  if (counts.errors > 0) {
    degraded({
      process: "janitor", phase: "sweep", correlation_id: corr,
      summary: `${summary} — ${counts.errors} unlink(s) failed`,
      context,
      cause: "unlinkSync threw on individual files (see counts.errors); the rest of the sweep completed",
      next_action: "inspect the meals dir for locked/perm-denied files; the next REM run retries the sweep",
    });
  } else if (candidates.length === 0) {
    idle({
      process: "janitor", phase: "sweep", correlation_id: corr,
      summary: "meals/ is already clean — nothing to sweep",
      context,
    });
  } else {
    ok({
      process: "janitor", phase: "sweep", correlation_id: corr,
      summary,
      context,
    });
  }

  return { ...base, ...counts, decisions };
}

// ---------- standalone CLI ----------

if (import.meta.main) {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  try {
    const result = sweepMeals({ dryRun });
    if (dryRun) {
      for (const d of result.decisions) {
        if (d.action !== "delete") continue;
        const ageH = ((result.nowMs - d.candidate.mtimeMs) / 3_600_000).toFixed(1);
        console.log(`would-delete ${d.candidate.path} (age ${ageH}h)`);
      }
    }
    console.log(
      `janitor sweep${dryRun ? " (dry-run)" : ""}: ${result.deleted_meals} meal(s), ${result.deleted_states} state file(s) ` +
      `${dryRun ? "would be " : ""}deleted; skipped ${result.skipped_live} live, ${result.skipped_pending} pending, ` +
      `${result.skipped_young} young${result.lock_skip ? "; lock present — skipped entirely" : ""}${result.blind ? "; blind probe — aborted" : ""}`
    );
  } catch (err) {
    // sweepMeals is built never to throw; if it ever does, fail loud, not silent.
    fail({
      process: "janitor", phase: "sweep",
      summary: "janitor sweep threw past its internal guards",
      context: {},
      cause: (err as Error).message,
      next_action: "reproduce with `bun src/janitor.ts --dry-run` and inspect the meals dir",
    });
  }
}
