#!/usr/bin/env bun
/**
 * doctor.ts — circadian observability surface.
 *
 * The one command that answers "is this actually working, right now, and if
 * not, why?" — the question status.ts does not, because status reports the
 * mind's *vitals* while doctor reports the *machinery's health*.
 *
 * It distinguishes three states per check, because "nothing happened" is
 * ambiguous and that ambiguity is exactly what erodes trust:
 *   OK    — working, and doing/did its job
 *   IDLE  — working, but nothing to do (e.g. no episodes to digest). NOT a fault.
 *   FAIL  — genuinely broken; needs attention
 *   WARN  — degraded / stale / worth a look, but not fatal
 *
 * Checks:
 *   1. prerequisites     — bun present
 *   2. scheduler         — launchd rem jobs loaded + last exit status
 *   3. rem cadence       — did rem actually run within its expected window?
 *   4. rem error log     — recent failures (freshness-aware, not just presence)
 *   5. episode pipeline  — episodes waiting vs. absorbed (idle vs stuck)
 *   6. LLM service       — is the drafting backend reachable right now?
 *   7. session hooks     — are wake/sleep installed in Claude Code settings?
 *   8. mind repo         — is it a clean, committing git repo?
 *   9. token caps        — any whole-mind file over cap
 *
 * Exit code: 0 if no FAIL, 1 if any FAIL. WARN/IDLE do not fail the run.
 * Flags: --json for machine-readable output; --quiet to print only non-OK lines.
 */

import * as fs from "fs";
import * as path from "path";
import { homedir } from "os";
import { execSync } from "child_process";

const CIRCADIAN_HOME = process.env.CIRCADIAN_HOME || path.join(homedir(), "circadian");
const MIND_DIR = path.join(CIRCADIAN_HOME, "mind");
const EPISODES_DIR = path.join(MIND_DIR, "episodes");
const SCOREBOARD_PATH = path.join(MIND_DIR, "scoreboard.jsonl");
const LOG_DIR = path.join(CIRCADIAN_HOME, "logs");
const REM_ERROR_LOG = path.join(LOG_DIR, "rem.error.log");

const CAPS: Record<string, number> = {
  "SELF.md": 6000,
  "USER.md": 2000,
  "NOW.md": 3000,
  "compost.md": 1000,
};

// rem is scheduled twice daily (09:00 & 21:00). If the newest rem event is
// older than this, cadence is suspect. 15h gives slack past the 12h interval.
const REM_STALE_HOURS = 15;
// rem.error.log entries older than this are treated as historical, not active.
const ERROR_FRESH_HOURS = 26;
const LLM_BASE_URL =
  process.env.CIRCADIAN_LLM_BASE_URL || process.env.LOCAL_LLM_BASE_URL || "http://127.0.0.1:10240/v1";

type Level = "OK" | "IDLE" | "WARN" | "FAIL";
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

interface ScoreEvent {
  ts: string;
  type: string;
  propagated?: string[];
  composted?: string[];
}
function loadScoreboard(): ScoreEvent[] {
  const raw = readOrEmpty(SCOREBOARD_PATH);
  const out: ScoreEvent[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t));
    } catch {
      /* skip */
    }
  }
  return out;
}

function tryExec(cmd: string): { ok: boolean; out: string } {
  try {
    return { ok: true, out: execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim() };
  } catch (e: any) {
    return { ok: false, out: (e.stdout || "") + (e.stderr || e.message || "") };
  }
}

// --- 1. prerequisites -------------------------------------------------------
function checkBun() {
  const r = tryExec("command -v bun && bun --version");
  if (r.ok) add("prerequisites", "OK", `bun present (${r.out.split("\n").pop()})`);
  else add("prerequisites", "FAIL", "bun not found on PATH");
}

// --- 2 & 3. scheduler + cadence --------------------------------------------
function checkScheduler(scoreboard: ScoreEvent[]) {
  const r = tryExec("launchctl list com.circadian.rem");
  if (!r.ok) {
    add("scheduler", "FAIL", "com.circadian.rem is NOT loaded in launchd — REM will never run on schedule");
  } else {
    const m = r.out.match(/"LastExitStatus"\s*=\s*(-?\d+)/);
    const exit = m ? m[1] : "?";
    if (exit === "0") add("scheduler", "OK", `launchd job loaded, last exit status 0`);
    else add("scheduler", "WARN", `launchd job loaded but last exit status = ${exit}`);
  }

  const remEvents = scoreboard.filter((e) => e.type === "rem");
  if (remEvents.length === 0) {
    add("rem cadence", "WARN", "no rem events ever recorded in scoreboard");
    return;
  }
  const last = remEvents[remEvents.length - 1];
  const age = hoursSince(last.ts);
  if (age === null) add("rem cadence", "WARN", `last rem event has unparseable timestamp: ${last.ts}`);
  else if (age > REM_STALE_HOURS)
    add(
      "rem cadence",
      "FAIL",
      `last rem ran ${fmtAge(age)} — expected within ${REM_STALE_HOURS}h (runs 09:00 & 21:00). Scheduler may be silently skipping.`
    );
  else add("rem cadence", "OK", `last rem ran ${fmtAge(age)} (${remEvents.length} total)`);
}

// --- 4. rem error log (freshness-aware) ------------------------------------
function checkErrorLog() {
  if (!fs.existsSync(REM_ERROR_LOG)) {
    add("rem errors", "OK", "no error log");
    return;
  }
  const st = fs.statSync(REM_ERROR_LOG);
  if (st.size === 0) {
    add("rem errors", "OK", "error log empty");
    return;
  }
  const ageH = (Date.now() - st.mtimeMs) / 3_600_000;
  const lastLine = readOrEmpty(REM_ERROR_LOG).trim().split("\n").pop() || "";
  if (ageH > ERROR_FRESH_HOURS) {
    add("rem errors", "OK", `error log has entries but is stale (${fmtAge(ageH)}) — historical, not active`);
  } else {
    add("rem errors", "FAIL", `recent failure (${fmtAge(ageH)}): ${lastLine.slice(0, 120)}`);
  }
}

// --- 5. episode pipeline (idle vs stuck) -----------------------------------
function checkEpisodes(scoreboard: ScoreEvent[]) {
  let waiting: string[] = [];
  try {
    waiting = fs.readdirSync(EPISODES_DIR).filter((f) => f.endsWith(".md") && f !== ".gitkeep");
  } catch {
    add("episode pipeline", "FAIL", `episodes/ dir missing at ${EPISODES_DIR}`);
    return;
  }
  const remEvents = scoreboard.filter((e) => e.type === "rem");
  const last = remEvents[remEvents.length - 1];

  if (waiting.length === 0) {
    add(
      "episode pipeline",
      "IDLE",
      "no episodes waiting to digest — this is why rem reports 'absorbed 0'. Not a fault; run a session (sleep deposits an episode at session end)."
    );
    return;
  }
  // Episodes present. If the last rem still absorbed 0, they may be stuck.
  if (last && (last.propagated?.length ?? 0) === 0 && (last.composted?.length ?? 0) === 0) {
    add(
      "episode pipeline",
      "WARN",
      `${waiting.length} episode(s) present but last rem absorbed/composted nothing — possible stuck digest`
    );
  } else {
    add("episode pipeline", "OK", `${waiting.length} episode(s) present; last rem processed content`);
  }
}

// --- 6. LLM service --------------------------------------------------------
function checkLLM() {
  const url = LLM_BASE_URL.replace(/\/$/, "") + "/models";
  const r = tryExec(`curl -s -m 5 -o /dev/null -w "%{http_code}" ${JSON.stringify(url)}`);
  if (r.ok && r.out.trim() === "200") add("LLM service", "OK", `reachable at ${LLM_BASE_URL}`);
  else
    add(
      "LLM service",
      "WARN",
      `not reachable at ${LLM_BASE_URL} (http ${r.out.trim() || "?"}) — rem/sleep drafting will fail until it's up`
    );
}

// --- 7. session hooks ------------------------------------------------------
function checkHooks() {
  const settings = path.join(homedir(), ".claude", "settings.json");
  const raw = readOrEmpty(settings);
  if (!raw) {
    add("session hooks", "WARN", `~/.claude/settings.json not found — wake/sleep hooks can't be verified`);
    return;
  }
  const wake = raw.includes("wake.ts");
  const sleep = raw.includes("sleep.ts");
  if (wake && sleep) add("session hooks", "OK", "wake + sleep hooks installed in Claude Code");
  else
    add(
      "session hooks",
      "WARN",
      `hooks incomplete: wake=${wake ? "yes" : "MISSING"}, sleep=${sleep ? "yes" : "MISSING"} — memory won't inject/deposit`
    );
}

// --- 8. mind repo ----------------------------------------------------------
function checkMindRepo() {
  const r = tryExec(`cd ${JSON.stringify(MIND_DIR)} && git rev-parse --is-inside-work-tree 2>/dev/null`);
  if (!r.ok || r.out.trim() !== "true") {
    add("mind repo", "FAIL", `${MIND_DIR} is not a git repo — history/archive is not being kept`);
    return;
  }
  const lastCommit = tryExec(`cd ${JSON.stringify(MIND_DIR)} && git log -1 --format=%ci 2>/dev/null`);
  if (lastCommit.ok && lastCommit.out) {
    const age = hoursSince(lastCommit.out.replace(" ", "T").replace(" ", ""));
    const ageStr = age === null ? lastCommit.out : fmtAge(age);
    add("mind repo", "OK", `git repo, last commit ${ageStr}`);
  } else {
    add("mind repo", "WARN", "git repo with no commits yet");
  }
}

// --- 9. token caps ---------------------------------------------------------
function checkCaps() {
  const over: string[] = [];
  for (const [name, cap] of Object.entries(CAPS)) {
    const tk = tokensOf(readOrEmpty(path.join(MIND_DIR, name)));
    if (tk > cap) over.push(`${name} ${tk}/${cap}`);
  }
  if (over.length === 0) add("token caps", "OK", "all whole-mind files under cap");
  else add("token caps", "WARN", `over cap: ${over.join(", ")}`);
}

// --- render ----------------------------------------------------------------
const ICON: Record<Level, string> = { OK: "✓", IDLE: "•", WARN: "!", FAIL: "✗" };

function main() {
  const args = process.argv.slice(2);
  const scoreboard = loadScoreboard();

  checkBun();
  checkScheduler(scoreboard);
  checkErrorLog();
  checkEpisodes(scoreboard);
  checkLLM();
  checkHooks();
  checkMindRepo();
  checkCaps();

  const anyFail = checks.some((c) => c.level === "FAIL");

  if (args.includes("--json")) {
    console.log(
      JSON.stringify({ ts: new Date().toISOString(), healthy: !anyFail, checks }, null, 2)
    );
    process.exit(anyFail ? 1 : 0);
  }

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

  process.exit(anyFail ? 1 : 0);
}

main();
