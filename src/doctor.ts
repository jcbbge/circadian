#!/usr/bin/env bun
/**
 * doctor.ts — circadian observability surface.
 *
 * The single honest health surface. READS logs/circadian.events.jsonl (the obs
 * ledger) — it does NOT re-derive health by re-running processes. Cheap
 * liveness probes (LLM curl, transcript existence, git status, file sizes)
 * are fine; re-invoking wake/sleep/graze/rem is not.
 *
 * For each process (wake, graze, sleep, rem) it reports:
 *   - when it last emitted (last event timestamp, human-readable age)
 *   - its last outcome (ok / idle / degraded / failed)
 *   - whether any failed/degraded event is recent AND unaddressed (no
 *     subsequent ok from the same process)
 *
 * Cardinal check (the core doctrine): a process that SHOULD have run but
 * produced NO event in its expected window = FAIL. Silent operation is the
 * cardinal sin — the one thing the entire lineage exists to prevent.
 *
 * Expected windows:
 *   rem   — 15h  (scheduled twice daily: 09:00 & 21:00; always expected)
 *   wake  — 48h  (per-session; expected when session evidence exists)
 *   sleep — 48h  (per-session; expected when session evidence exists)
 *   graze — 48h  (per-session; expected when session evidence exists)
 *
 * Exit code: 0 if no FAIL, 1 if any FAIL. --json for machine output.
 * --alert posts a tower bus message when anything is FAIL.
 * --quiet prints only non-OK lines.
 */

import * as fs from "fs";
import * as path from "path";
import { homedir } from "os";
import { execSync } from "child_process";
import { appendFileSync, mkdirSync } from "fs";
import { ok, correlation } from "./obs.ts";

const CIRCADIAN_HOME = process.env.CIRCADIAN_HOME || path.join(homedir(), "circadian");
const LOG_DIR = path.join(CIRCADIAN_HOME, "logs");
const EVENTS_LEDGER = path.join(LOG_DIR, "circadian.events.jsonl");
const MIND_DIR = path.join(CIRCADIAN_HOME, "mind");
const EPISODES_DIR = path.join(MIND_DIR, "episodes");
// FIXED CONTRACT (W1): failed sleep drafts queue here for REM-driven re-run.
const PENDING_SLEEP_QUEUE = path.join(LOG_DIR, "pending-sleep.jsonl");
const LLM_BASE_URL =
  process.env.CIRCADIAN_LLM_BASE_URL || process.env.LOCAL_LLM_BASE_URL || "http://127.0.0.1:10240/v1";
// The mlx-omni-server markup patch (2026-07-23) lives in site-packages — one
// package upgrade away from silently regressing to the episode-killing crash.
const LLM_LOGGER_FILE =
  process.env.CIRCADIAN_LLM_LOGGER_FILE ||
  path.join(homedir(), "local-llm", "venv", "lib", "python3.11", "site-packages", "mlx_omni_server", "utils", "logger.py");

// Transcript dirs for session-evidence probing (cheap liveness probe, not a
// process re-run). Claude Code uses ~/.claude/projects; pi uses ~/.pi/agent/sessions.
const PROJECTS_DIR = process.env.CIRCADIAN_PROJECTS_DIR || path.join(homedir(), ".claude", "projects");
const PI_SESSIONS_DIR = path.join(homedir(), ".pi", "agent", "sessions");

// Expected windows (hours)
const REM_EXPECTED_HOURS = 15; // twice daily at 09:00 & 21:00
const SESSION_EXPECTED_HOURS = 48; // sessions should happen at least every 48h
const UNADDRESSED_WINDOW_HOURS = 24; // degraded/failed within this window is "recent"
const PENDING_ATTEMPTS_CAP = 8; // W1 retry cap — at the cap an entry has survived every automatic drain
const PENDING_STALE_HOURS = 24; // queued longer than this = survived multiple REM drains

const CAPS: Record<string, number> = {
  "SELF.md": 6000,
  "USER.md": 2000,
  "NOW.md": 3000,
  "compost.md": 1000,
};

type Level = "OK" | "IDLE" | "WARN" | "FAIL";

interface CircadianEvent {
  ts: string;
  process: string;
  phase: string;
  outcome: "ok" | "idle" | "degraded" | "failed";
  summary: string;
  context?: Record<string, unknown>;
  cause?: string;
  next_action?: string;
  session_id?: string;
  correlation_id?: string;
}

interface Check {
  name: string;
  level: Level;
  detail: string;
}

const checks: Check[] = [];
function add(name: string, level: Level, detail: string) {
  checks.push({ name, level, detail });
}

function readOrEmpty(p: string): string {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

function tokensOf(text: string): number {
  return Math.ceil(text.length / 4);
}

function hoursSince(iso: string): number | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / 3_600_000;
}

function fmtAge(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m ago`;
  if (hours < 48) return `${hours.toFixed(1)}h ago`;
  return `${(hours / 24).toFixed(1)}d ago`;
}

function tryExec(cmd: string): { ok: boolean; out: string } {
  try {
    return { ok: true, out: execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim() };
  } catch (e: any) {
    return { ok: false, out: (e.stdout || "") + (e.stderr || e.message || "") };
  }
}

// ---------- read the ledger ----------

function readLedger(): CircadianEvent[] {
  const raw = readOrEmpty(EVENTS_LEDGER);
  const events: CircadianEvent[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      events.push(JSON.parse(t));
    } catch {
      // skip unparseable lines — but note them
    }
  }
  // Sort by timestamp ascending so "last" = most recent
  return events.sort((a, b) => (a.ts < b.ts ? -1 : 1));
}

function eventsFor(events: CircadianEvent[], process: string): CircadianEvent[] {
  return events.filter((e) => e.process === process);
}

// ---------- unaddressed failures ----------

/**
 * A degraded/failed event is "unaddressed" if it is recent (within
 * UNADDRESSED_WINDOW_HOURS) and no subsequent ok event from the SAME process
 * has been emitted — meaning the issue was never resolved.
 */
function findUnaddressed(procEvents: CircadianEvent[]): CircadianEvent[] {
  const cutoff = Date.now() - UNADDRESSED_WINDOW_HOURS * 3_600_000;
  const unaddressed: CircadianEvent[] = [];
  for (const e of procEvents) {
    if (e.outcome !== "degraded" && e.outcome !== "failed") continue;
    const evtTime = Date.parse(e.ts);
    if (Number.isNaN(evtTime) || evtTime < cutoff) continue;
    // Recovery = a subsequent ok from the same process
    const hasRecovery = procEvents.some((f) => f.outcome === "ok" && Date.parse(f.ts) > evtTime);
    if (!hasRecovery) unaddressed.push(e);
  }
  return unaddressed;
}

// ---------- session evidence (cheap probe) ----------

/**
 * Walk transcript directories for .jsonl files modified within the expected
 * window. This is a cheap filesystem probe — NOT a process re-run. It tells
 * us whether a session "should have" triggered wake/sleep/graze.
 */
function findRecentTranscripts(dirs: string[], maxAgeHours: number): { found: boolean; latest: number | null } {
  const cutoff = Date.now() - maxAgeHours * 3_600_000;
  let latest = 0;
  const maxDepth = 5;
  const maxFiles = 5000;
  let fileCount = 0;

  function walk(d: string, depth: number) {
    if (depth > maxDepth || fileCount > maxFiles) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (fileCount > maxFiles) return;
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full, depth + 1);
      else if (e.name.endsWith(".jsonl")) {
        fileCount++;
        try {
          const st = fs.statSync(full);
          if (st.mtimeMs > cutoff && st.mtimeMs > latest) latest = st.mtimeMs;
        } catch {
          /* ignore */
        }
      }
    }
  }

  for (const dir of dirs) {
    if (fs.existsSync(dir)) walk(dir, 0);
  }

  return { found: latest > 0, latest: latest || null };
}

// ---------- context summariser ----------

function summarizeContext(ctx: Record<string, unknown> | undefined): string {
  if (!ctx) return "";
  const parts: string[] = [];
  if (ctx.payload_tokens) parts.push(`payload ${ctx.payload_tokens}t`);
  if (ctx.worldview_tokens) parts.push(`worldview ${ctx.worldview_tokens}t`);
  if (ctx.missing_files && Array.isArray(ctx.missing_files) && (ctx.missing_files as string[]).length > 0)
    parts.push(`missing ${(ctx.missing_files as string[]).length}`);
  if (ctx.absorbed !== undefined) parts.push(`absorbed ${ctx.absorbed}`);
  if (ctx.shed !== undefined) parts.push(`shed ${ctx.shed}`);
  if (ctx.backlog_remaining !== undefined) parts.push(`backlog ${ctx.backlog_remaining}`);
  if (ctx.arc) parts.push(`arc: ${ctx.arc}`);
  if (ctx.transcript_chars) parts.push(`${ctx.transcript_chars} chars`);
  if (ctx.stale === true) parts.push("STALE");
  if (ctx.over_cap === true) parts.push("OVER-CAP");
  if (ctx.checkpoints !== undefined) parts.push(`${ctx.checkpoints} checkpoints`);
  if (ctx.dropped_sections !== undefined) parts.push(`pruned ${ctx.dropped_sections}`);
  return parts.length > 0 ? ` — ${parts.join(", ")}` : "";
}

// ---------- per-process check ----------

function checkProcess(
  name: string,
  events: CircadianEvent[],
  expectedWindowHours: number,
  shouldHaveRun: boolean
): void {
  const procEvents = eventsFor(events, name);

  if (procEvents.length === 0) {
    // Cardinal check: process should have run but produced NO event at all
    if (shouldHaveRun) {
      add(
        name,
        "FAIL",
        `no ${name} event in ledger — expected within ${expectedWindowHours}h but produced NO event (SILENT OPERATION — cardinal sin)`
      );
    } else {
      add(
        name,
        "WARN",
        `no ${name} event in ledger — no session evidence to confirm it should have run`
      );
    }
    return;
  }

  const last = procEvents[procEvents.length - 1];
  const lastAgeH = hoursSince(last.ts);
  const lastAgeStr = lastAgeH === null ? "unknown age" : fmtAge(lastAgeH);

  // Unaddressed degraded/failed events (recent, no subsequent ok from same process)
  const unaddressed = findUnaddressed(procEvents);

  let detail = `last event ${lastAgeStr}: ${last.outcome} in ${last.phase}`;
  if (last.summary) detail += ` — ${last.summary}`;
  detail += summarizeContext(last.context);

  // Determine level — most severe wins
  let level: Level;

  if (unaddressed.length > 0 || last.outcome === "failed") {
    // Unaddressed failure or last event is failed → FAIL
    level = "FAIL";
    if (unaddressed.length > 0) {
      const details = unaddressed
        .map((e) => `${e.phase}: ${e.summary} (${fmtAge(hoursSince(e.ts) ?? 0)})`)
        .join("; ");
      detail += `\n           ${unaddressed.length} unaddressed ${unaddressed.length === 1 ? "event" : "events"}: ${details}`;
    }
  } else if (lastAgeH !== null && lastAgeH > expectedWindowHours && shouldHaveRun) {
    // Cardinal check: should have run but last event is too old
    level = "FAIL";
    detail += `\n           CARDINAL: expected ${name} within ${expectedWindowHours}h, last event ${lastAgeStr} (SILENT OPERATION)`;
  } else if (lastAgeH !== null && lastAgeH > expectedWindowHours && !shouldHaveRun) {
    // Stale but no session evidence — can't confirm it should have run
    level = "WARN";
    detail += `\n           stale (${lastAgeStr}) but no session evidence to confirm ${name} should have run`;
  } else if (last.outcome === "degraded") {
    level = "WARN";
  } else if (last.outcome === "idle") {
    level = "IDLE";
  } else {
    level = "OK";
  }

  add(name, level, detail);
}

// ---------- supplementary cheap probes ----------

function checkLedger(events: CircadianEvent[]): void {
  if (!fs.existsSync(EVENTS_LEDGER)) {
    add(
      "events ledger",
      "FAIL",
      `${EVENTS_LEDGER} does not exist — no process has emitted any event; the system is operating silently (cardinal sin)`
    );
  } else if (events.length === 0) {
    add(
      "events ledger",
      "FAIL",
      `${EVENTS_LEDGER} exists but is empty — no process has emitted any event; the system is operating silently (cardinal sin)`
    );
  } else {
    const last = events[events.length - 1];
    const age = hoursSince(last.ts);
    add(
      "events ledger",
      "OK",
      `${events.length} events, last ${age === null ? "unknown" : fmtAge(age)} (${last.process}/${last.phase} ${last.outcome})`
    );
  }
}

function checkLLM(): void {
  const url = LLM_BASE_URL.replace(/\/$/, "") + "/models";
  const r = tryExec(`curl -s -m 5 -o /dev/null -w "%{http_code}" ${JSON.stringify(url)}`);
  if (r.ok && r.out.trim() === "200") {
    add("LLM service", "OK", `reachable at ${LLM_BASE_URL}`);
  } else {
    add(
      "LLM service",
      "WARN",
      `not reachable at ${LLM_BASE_URL} (http ${r.out.trim() || "?"}) — rem/sleep drafting will fail until it's up`
    );
  }
}

/**
 * Guards the 2026-07-23 root-cause patch: mlx-omni-server's RichHandler must
 * keep markup=False, or bracketed payloads crash request logging mid-request
 * (500/empty -> clients see "empty content" while /models stays 200). The
 * patch is in site-packages, so an upgrade silently reverts it — this check
 * makes the regression loud instead of silent. FAIL on markup=True (the exact
 * killer state), WARN when the file is gone (package changed; re-verify).
 */
function checkLLMPatchIntegrity(): void {
  const raw = readOrEmpty(LLM_LOGGER_FILE);
  if (!raw) {
    add(
      "LLM patch integrity",
      "WARN",
      `${LLM_LOGGER_FILE} not found — mlx-omni-server moved or was upgraded; re-verify the markup=False patch (see ~/dotfiles/launchagents/LOCALLLM.md)`
    );
    return;
  }
  if (raw.includes("markup=False")) {
    add("LLM patch integrity", "OK", "markup=False patch present — bracketed payloads cannot crash request logging");
  } else if (raw.includes("markup=True")) {
    add(
      "LLM patch integrity",
      "FAIL",
      `markup=True in ${LLM_LOGGER_FILE} — the episode-killing rich-markup crash is BACK (site-packages upgraded?). Fix: set markup=False in that file, then launchctl kickstart -k gui/$UID/com.localllm.server`
    );
  } else {
    add(
      "LLM patch integrity",
      "WARN",
      `no markup setting found in ${LLM_LOGGER_FILE} — package layout changed; re-verify manually`
    );
  }
}

function checkHooks(): void {
  const settings = path.join(homedir(), ".claude", "settings.json");
  const raw = readOrEmpty(settings);
  if (!raw) {
    add("session hooks", "WARN", `~/.claude/settings.json not found — wake/sleep/graze hooks can't be verified`);
    return;
  }
  const wake = raw.includes("wake.ts");
  const sleep = raw.includes("sleep.ts");
  const graze = raw.includes("graze.ts");
  if (wake && sleep && graze) {
    add("session hooks", "OK", "wake + sleep + graze hooks installed in Claude Code");
  } else {
    const missing: string[] = [];
    if (!wake) missing.push("wake");
    if (!sleep) missing.push("sleep");
    if (!graze) missing.push("graze");
    add(
      "session hooks",
      "WARN",
      `hooks incomplete: ${missing.join(", ")} missing — memory won't inject/deposit/checkpoint`
    );
  }
}

function checkMindRepo(): void {
  const r = tryExec(`cd ${JSON.stringify(MIND_DIR)} && git rev-parse --is-inside-work-tree 2>/dev/null`);
  if (!r.ok || r.out.trim() !== "true") {
    add("mind repo", "FAIL", `${MIND_DIR} is not a git repo — history/archive is not being kept`);
    return;
  }
  const lastCommit = tryExec(`cd ${JSON.stringify(MIND_DIR)} && git log -1 --format=%ci 2>/dev/null`);
  if (lastCommit.ok && lastCommit.out) {
    const age = hoursSince(lastCommit.out.replace(" ", "T").replace(" ", ""));
    add("mind repo", "OK", `git repo, last commit ${age === null ? lastCommit.out : fmtAge(age)}`);
  } else {
    add("mind repo", "WARN", "git repo with no commits yet");
  }
}

function checkCaps(): void {
  const over: string[] = [];
  for (const [name, cap] of Object.entries(CAPS)) {
    const text = readOrEmpty(path.join(MIND_DIR, name));
    const tk = tokensOf(text);
    if (tk > cap) over.push(`${name} ${tk}/${cap}`);
  }
  if (over.length === 0) add("token caps", "OK", "all whole-mind files under cap");
  else add("token caps", "WARN", `over cap: ${over.join(", ")}`);
}

function checkEpisodes(events: CircadianEvent[]): void {
  let waiting: string[] = [];
  try {
    waiting = fs.readdirSync(EPISODES_DIR).filter((f) => f.endsWith(".md") && f !== ".gitkeep");
  } catch {
    add("episode pipeline", "WARN", `episodes/ dir missing at ${EPISODES_DIR}`);
    return;
  }

  const remEvents = eventsFor(events, "rem");
  if (remEvents.length === 0) {
    if (waiting.length === 0) {
      add("episode pipeline", "IDLE", "no episodes waiting, no rem events in ledger");
    } else {
      add("episode pipeline", "WARN", `${waiting.length} episode(s) present but no rem events in ledger — backlog may be stuck`);
    }
    return;
  }

  // Find the last rem event with commit context (absorbed/shed)
  const lastCommit = [...remEvents].reverse().find((e) => e.context?.absorbed !== undefined || e.context?.shed !== undefined);
  if (!lastCommit) {
    const last = remEvents[remEvents.length - 1];
    add("episode pipeline", "IDLE", `no episodes waiting; last rem event: ${last.phase} ${last.outcome}`);
    return;
  }

  const absorbed = (lastCommit.context?.absorbed as number) ?? 0;
  const shed = (lastCommit.context?.shed as number) ?? 0;
  const backlog = (lastCommit.context?.backlog_remaining as number) ?? 0;

  if (waiting.length === 0) {
    add("episode pipeline", "IDLE", `no episodes waiting to digest; last rem: absorbed ${absorbed}, shed ${shed}, backlog ${backlog}`);
  } else if (absorbed === 0 && shed === 0) {
    add("episode pipeline", "WARN", `${waiting.length} episode(s) present but last rem commit absorbed/shed nothing — possible stuck digest`);
  } else {
    add("episode pipeline", "OK", `${waiting.length} episode(s) present; last rem: absorbed ${absorbed}, shed ${shed}, backlog ${backlog}`);
  }
}

// ---------- worldview motion (flatline guard) ----------

/**
 * The anima failure mode: REM commits "absorbed N" every wave while SELF.md
 * never changes — digestion narrated, not performed. rem.ts stamps each
 * scoreboard rem event with self_changed; this check reads the trail.
 * One flatline wave can be legitimate (episodes genuinely taught nothing
 * new). Consecutive flatlines across waves that DID absorb episodes mean
 * the worldview has stopped metabolizing — the greeting goes stale and the
 * whole cycle becomes theater. That is FAIL, not WARN.
 */
function checkWorldviewMotion(): void {
  const raw = readOrEmpty(path.join(MIND_DIR, "scoreboard.jsonl"));
  const remEvents: { ts: string; self_changed?: boolean; composted?: string[] }[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const e = JSON.parse(t);
      if (e.type === "rem") remEvents.push(e);
    } catch {
      /* unparseable lines are checkLedger's problem */
    }
  }
  if (remEvents.length === 0) {
    add("worldview motion", "IDLE", "no rem events in scoreboard yet");
    return;
  }

  // Only waves that digested something count — an idle wave changing nothing
  // is correct behavior, not a flatline.
  const digestingWaves = remEvents.filter((e) => (e.composted?.length ?? 0) > 0);
  const stamped = digestingWaves.filter((e) => e.self_changed !== undefined);
  if (stamped.length === 0) {
    add("worldview motion", "IDLE", "no rem events carry self_changed yet (stamp added 2026-07-24); next wave will report");
    return;
  }

  let consecutiveFlat = 0;
  for (let i = stamped.length - 1; i >= 0; i--) {
    if (stamped[i].self_changed === false) consecutiveFlat++;
    else break;
  }

  if (consecutiveFlat === 0) {
    add("worldview motion", "OK", `last digesting wave rewrote SELF.md (${stamped.length} stamped wave(s) on record)`);
  } else if (consecutiveFlat === 1) {
    add("worldview motion", "WARN", "last digesting wave left SELF.md unchanged — one echo can be legitimate; two is a flatline");
  } else {
    add("worldview motion", "FAIL", `${consecutiveFlat} consecutive digesting waves left SELF.md unchanged — REM is narrating digestion without performing it; the greeting is going stale. Check the LLM at :10240 (echoing input?) and the size of the meal.`);
  }
}

// ---------- pending sleep queue (W1 contract) ----------

interface PendingSleepEntry {
  session_id?: string;
  attempts?: number;
  queued_at?: string;
}

/**
 * Reads logs/pending-sleep.jsonl. The file does not exist until W1 lands and
 * a failure occurs — absent means nothing is awaiting recovery, not an error.
 * A non-empty queue is always at least WARN (work is owed); an entry at the
 * attempts cap or older than PENDING_STALE_HOURS has survived multiple REM
 * drains and needs a human decision -> FAIL.
 */
function checkPendingSleepQueue(): void {
  const raw = readOrEmpty(PENDING_SLEEP_QUEUE);
  if (!raw.trim()) {
    add("pending sleep queue", "IDLE", "no queued episodes; nothing awaiting recovery");
    return;
  }

  const entries: PendingSleepEntry[] = [];
  let unparseable = 0;
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      entries.push(JSON.parse(t));
    } catch {
      unparseable++;
    }
  }

  const stuck = entries.filter(
    (e) => (e.attempts ?? 0) >= PENDING_ATTEMPTS_CAP || (e.queued_at !== undefined && (hoursSince(e.queued_at) ?? 0) > PENDING_STALE_HOURS)
  );
  const ages = entries
    .map((e) => (e.queued_at !== undefined ? hoursSince(e.queued_at) : null))
    .filter((h): h is number => h !== null)
    .sort((a, b) => b - a);
  const countStr = `${entries.length} episode(s) awaiting sleep re-run, oldest ${ages.length > 0 ? fmtAge(ages[0]) : "unknown age"}`;
  const corruptStr = unparseable > 0 ? `; ${unparseable} unparseable line(s) — queue corruption` : "";

  if (stuck.length > 0) {
    const names = stuck.map((e) => e.session_id ?? "unknown").join(", ");
    add(
      "pending sleep queue",
      "FAIL",
      `${stuck.length} stuck (attempts >= ${PENDING_ATTEMPTS_CAP} or queued > ${PENDING_STALE_HOURS}h): ${names} — survived multiple REM drains; human decision required (${countStr})${corruptStr}`
    );
  } else {
    add("pending sleep queue", "WARN", `${countStr}${corruptStr}`);
  }
}

// ---------- launchd agents ----------

/**
 * Parses `launchctl list` columns: PID (or "-"), last-exit Status, Label.
 * Non-zero last exit is WARN, never FAIL — the ledger's unaddressed-failure
 * logic already owns FAIL semantics; failing here too would cry wolf.
 */
function checkLaunchdAgents(): void {
  const r = tryExec("launchctl list");
  if (!r.ok) {
    add("launchd agents", "WARN", `launchctl unavailable — cannot verify scheduled agents (${r.out.split("\n")[0] || "no output"})`);
    return;
  }

  const labels = ["com.circadian.rem", "com.circadian.rem-catchup", "com.circadian.doctor"];
  const statusOf: Record<string, number> = {};
  for (const line of r.out.split("\n")) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 3) continue;
    const status = Number.parseInt(cols[1], 10);
    if (labels.includes(cols[2]) && !Number.isNaN(status)) statusOf[cols[2]] = status;
  }

  const missing = labels.filter((l) => !(l in statusOf));
  const nonzero = labels.filter((l) => statusOf[l] !== undefined && statusOf[l] !== 0);
  if (missing.length === 0 && nonzero.length === 0) {
    add("launchd agents", "OK", `${labels.length} agents loaded, all last exits 0`);
    return;
  }
  const parts: string[] = [];
  if (nonzero.length > 0)
    parts.push(
      nonzero.map((l) => `${l} last exit ${statusOf[l]} — fossil of a loud failure; clears on next healthy scheduled run`).join("; ")
    );
  if (missing.length > 0) parts.push(`missing: ${missing.join(", ")}`);
  add("launchd agents", "WARN", parts.join("; "));
}

// ---------- render ----------

const ICON: Record<Level, string> = { OK: "✓", IDLE: "•", WARN: "!", FAIL: "✗" };

function main() {
  const args = process.argv.slice(2);
  const corr = correlation("doctor");
  const events = readLedger();

  // Session evidence: are there recent transcripts that imply a session
  // should have triggered wake/sleep/graze?
  const sessionEvidence = findRecentTranscripts([PROJECTS_DIR, PI_SESSIONS_DIR], SESSION_EXPECTED_HOURS);

  // Core: read the ledger for each process
  checkLedger(events);
  checkProcess("wake", events, SESSION_EXPECTED_HOURS, sessionEvidence.found);
  checkProcess("graze", events, SESSION_EXPECTED_HOURS, sessionEvidence.found);
  checkProcess("sleep", events, SESSION_EXPECTED_HOURS, sessionEvidence.found);
  checkProcess("rem", events, REM_EXPECTED_HOURS, true); // rem is always expected (time-scheduled)

  // Supplementary cheap probes
  checkLLM();
  checkLLMPatchIntegrity();
  checkHooks();
  checkMindRepo();
  checkCaps();
  checkEpisodes(events);
  checkWorldviewMotion();
  checkPendingSleepQueue();
  checkLaunchdAgents();

  const anyFail = checks.some((c) => c.level === "FAIL");

  // --alert: surface FAILs on the tower bus so they reach the human without
  // anyone running a command. Posts one board message per unhealthy run.
  if (args.includes("--alert") && anyFail) {
    try {
      const board = path.join(homedir(), ".tower", "board.jsonl");
      mkdirSync(path.dirname(board), { recursive: true });
      const fails = checks.filter((c) => c.level === "FAIL").map((c) => `${c.name}: ${c.detail.split("\n")[0]}`);
      appendFileSync(
        board,
        JSON.stringify({
          id: `circadian-doctor-${Date.now().toString(36)}`,
          ts: new Date().toISOString(),
          cwd: CIRCADIAN_HOME,
          type: "alert",
          from: "circadian-doctor",
          topic: "circadian health",
          body: `circadian NOT healthy — ${fails.length} failing: ${fails.join(" | ")}`,
        }) + "\n"
      );
    } catch {
      /* alerting must never crash the check */
    }
  }

  // --json: machine-readable output, exit 1 on any FAIL
  if (args.includes("--json")) {
    console.log(
      JSON.stringify(
        {
          ts: new Date().toISOString(),
          healthy: !anyFail,
          checks,
        },
        null,
        2
      )
    );
    // Doctor's own ok event — it successfully ran the health check
    ok({
      process: "doctor",
      phase: "health-check",
      correlation_id: corr,
      summary: `doctor run complete: ${checks.length} checks, ${anyFail ? "UNHEALTHY" : "healthy"}`,
      context: {
        checks: checks.length,
        healthy: !anyFail,
        session_evidence: sessionEvidence.found,
        events_in_ledger: events.length,
      },
    });
    process.exit(anyFail ? 1 : 0);
  }

  // Human-readable render
  const quiet = args.includes("--quiet");
  console.log("=== circadian doctor ===\n");
  for (const c of checks) {
    if (quiet && c.level === "OK") continue;
    console.log(`  ${ICON[c.level]} ${c.level.padEnd(4)} ${c.name.padEnd(16)} ${c.detail}`);
  }

  const counts = checks.reduce<Record<string, number>>((a, c) => ((a[c.level] = (a[c.level] || 0) + 1), a), {});
  console.log(
    `\nsummary: ${counts.OK || 0} ok, ${counts.IDLE || 0} idle, ${counts.WARN || 0} warn, ${counts.FAIL || 0} fail`
  );
  if (anyFail) console.log("\nVERDICT: NOT HEALTHY — see ✗ lines above.");
  else if (counts.WARN) console.log("\nVERDICT: working, with warnings (! lines) worth a look.");
  else console.log("\nVERDICT: healthy. Everything that should be running is running.");

  // Doctor's own ok event
  ok({
    process: "doctor",
    phase: "health-check",
    correlation_id: corr,
    summary: `doctor run complete: ${checks.length} checks, ${anyFail ? "UNHEALTHY" : "healthy"}`,
    context: {
      checks: checks.length,
      healthy: !anyFail,
      session_evidence: sessionEvidence.found,
      events_in_ledger: events.length,
    },
  });

  process.exit(anyFail ? 1 : 0);
}

main();
