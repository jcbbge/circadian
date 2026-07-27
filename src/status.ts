#!/usr/bin/env bun
/**
 * status.ts — circadian instrument.
 *
 * Default run renders vitals for the mind memory substrate (MIND-SPEC.md):
 *   - last-sleep age (NOW.md "Last sleep", falling back to the last sleep
 *     event in scoreboard.jsonl)
 *   - token counts vs caps for SELF/USER/NOW/compost, flagged loudly if over
 *   - last 7 greeting verdicts, with a KILL SWITCH warning if all 7 are
 *     "bad" (MIND-SPEC.md "Kill Switch": 7 consecutive bad verdicts is the
 *     decommission trigger — the decision to decommission stays human)
 *   - a propagation summary drawn from recent rem events
 *
 * `--greet-ok` / `--greet-bad "<reason>"` append a verdict event to
 * scoreboard.jsonl and exit; they do not render the status report.
 *
 * Migrated onto obs (mirror sleep.ts @ d21e47c): every run emits a context-
 * bound event to logs/circadian.events.jsonl. The default render emits ok
 * with the full vitals payload as context; --greet-ok emits ok; --greet-bad
 * emits degraded (a bad greeting is a trust signal that needs a look, so it
 * reaches the tower bus). No silent exits — every path surfaces.
 */

import * as fs from "fs";
import * as path from "path";
import { homedir } from "os";
import { ok, degraded, correlation } from "./obs.ts";

// CIRCADIAN_HOME overrides; default ~/circadian. See wake.ts for the contract.
const CIRCADIAN_HOME = process.env.CIRCADIAN_HOME || path.join(homedir(), "circadian");
const MIND_DIR = path.join(CIRCADIAN_HOME, "mind");
const SELF_PATH = path.join(MIND_DIR, "SELF.md");
const USER_PATH = path.join(MIND_DIR, "USER.md");
const NOW_PATH = path.join(MIND_DIR, "NOW.md");
const COMPOST_PATH = path.join(MIND_DIR, "compost.md");
const SCOREBOARD_PATH = path.join(MIND_DIR, "scoreboard.jsonl");

// Token caps: chars/4 = tokens (MIND-SPEC.md "Token Caps"). No cap listed
// for episodes/ here — status reports on the four whole-mind files only.
const CAPS: Record<string, number> = {
  "SELF.md": 6000,
  "USER.md": 2000,
  "NOW.md": 3000,
  "compost.md": 1000,
};

const KILL_SWITCH_STREAK = 7;
const RECENT_REM_EVENTS = 5;

function tokensOf(text: string): number {
  return Math.ceil(text.length / 4);
}

function readOrEmpty(p: string): string {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

interface ScoreEvent {
  ts: string;
  type: "wake" | "sleep" | "rem" | "verdict";
  worldview_tokens: number;
  greeting_verdict?: "ok" | "bad";
  reason?: string;
  propagated?: string[];
  composted?: string[];
}

function loadScoreboard(): ScoreEvent[] {
  const raw = readOrEmpty(SCOREBOARD_PATH);
  const events: ScoreEvent[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      events.push(JSON.parse(t));
    } catch {
      process.stderr.write(`status: skipping unparseable scoreboard line: ${t.slice(0, 80)}\n`);
    }
  }
  return events;
}

function extractNowLastSleep(nowMd: string): string | null {
  const m = nowMd.match(/##\s+Last sleep\s*\n+([^\n]+)/);
  if (m && m[1].trim()) return m[1].trim();
  return null;
}

function fmtAge(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return `unparseable timestamp (${iso})`;
  const ms = Date.now() - then;
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.max(0, Math.round(ms / 60000))}m ago`;
  if (hours < 48) return `${hours.toFixed(1)}h ago`;
  return `${(hours / 24).toFixed(1)}d ago`;
}

function appendVerdict(verdict: "ok" | "bad", reason?: string) {
  const selfMd = readOrEmpty(SELF_PATH);
  const event: ScoreEvent = {
    ts: new Date().toISOString(),
    type: "verdict",
    worldview_tokens: tokensOf(selfMd),
    greeting_verdict: verdict,
  };
  if (reason) event.reason = reason;
  fs.appendFileSync(SCOREBOARD_PATH, JSON.stringify(event) + "\n");
  console.log(`status: recorded verdict=${verdict}${reason ? ` (${reason})` : ""}`);
}

/**
 * Collect all vitals into a structured object — used both for rendering and
 * for the obs ok event context. A cold reader of the ledger gets the full
 * vitals payload without re-running status.
 */
function collectVitals() {
  const nowMd = readOrEmpty(NOW_PATH);
  const selfMd = readOrEmpty(SELF_PATH);
  const userMd = readOrEmpty(USER_PATH);
  const compostMd = readOrEmpty(COMPOST_PATH);
  const scoreboard = loadScoreboard();

  // --- last-sleep age ---
  let lastSleepIso = extractNowLastSleep(nowMd);
  let lastSleepSource = "NOW.md";
  if (!lastSleepIso) {
    const sleepEvents = scoreboard.filter((e) => e.type === "sleep");
    if (sleepEvents.length > 0) {
      lastSleepIso = sleepEvents[sleepEvents.length - 1].ts;
      lastSleepSource = "scoreboard.jsonl (fallback — NOW.md had no Last sleep timestamp)";
    }
  }
  const lastSleepAge = lastSleepIso ? fmtAge(lastSleepIso) : null;

  // --- token counts vs caps ---
  const tokenCounts: Record<string, { tokens: number; cap: number; over: boolean }> = {};
  for (const [name, content] of [
    ["SELF.md", selfMd],
    ["USER.md", userMd],
    ["NOW.md", nowMd],
    ["compost.md", compostMd],
  ] as const) {
    const tk = tokensOf(content);
    const cap = CAPS[name];
    tokenCounts[name] = { tokens: tk, cap, over: tk > cap };
  }

  // --- greeting verdicts ---
  const verdicts = scoreboard.filter((e) => e.type === "verdict" && e.greeting_verdict);
  const last7 = verdicts.slice(-7);
  const killSwitch = last7.length >= KILL_SWITCH_STREAK && last7.every((v) => v.greeting_verdict === "bad");

  // --- propagation summary ---
  const remEvents = scoreboard.filter((e) => e.type === "rem");
  const recentRem = remEvents.slice(-RECENT_REM_EVENTS);

  return {
    last_sleep: lastSleepIso ?? null,
    last_sleep_age: lastSleepAge,
    last_sleep_source: lastSleepIso ? lastSleepSource : null,
    token_counts: tokenCounts,
    verdicts: {
      total: verdicts.length,
      recent_7: last7.map((v) => ({ ts: v.ts, verdict: v.greeting_verdict, reason: v.reason ?? null })),
      kill_switch: killSwitch,
    },
    propagation: {
      total_rem_events: remEvents.length,
      recent: recentRem.map((r) => ({
        ts: r.ts,
        worldview_tokens: r.worldview_tokens,
        propagated: r.propagated?.length ?? 0,
        composted: r.composted?.length ?? 0,
      })),
    },
    worldview_tokens: tokensOf(selfMd),
  };
}

function renderStatus(vitals: ReturnType<typeof collectVitals>) {
  console.log("=== circadian status ===\n");

  // --- last-sleep age ---
  if (vitals.last_sleep) {
    console.log(`last sleep: ${vitals.last_sleep_age} [${vitals.last_sleep}] (source: ${vitals.last_sleep_source})`);
  } else {
    console.log("last sleep: unknown — no NOW.md timestamp and no sleep event in scoreboard.jsonl");
  }

  // --- token counts vs caps ---
  console.log("\ntoken counts vs caps:");
  for (const [name, info] of Object.entries(vitals.token_counts)) {
    if (info.over) {
      console.log(`  OVER-CAP: ${name} is ${info.tokens} tokens, cap is ${info.cap} (+${info.tokens - info.cap})`);
    } else {
      console.log(`  ${name}: ${info.tokens} / ${info.cap} tokens`);
    }
  }

  // --- last 7 greeting verdicts ---
  const last7 = vitals.verdicts.recent_7;
  console.log(`\nlast ${last7.length} greeting verdict(s) (of ${vitals.verdicts.total} total):`);
  if (last7.length === 0) {
    console.log("  (none recorded yet)");
  } else {
    for (const v of last7) {
      console.log(`  ${v.ts}: ${v.verdict}${v.reason ? ` — ${v.reason}` : ""}`);
    }
  }

  if (vitals.verdicts.kill_switch) {
    console.log(
      `\n!!! KILL SWITCH: the last ${KILL_SWITCH_STREAK} greeting verdicts are all "bad". Per MIND-SPEC.md "Kill Switch" this is the decommission trigger. The decision to actually decommission is human, not automated.`
    );
  }

  // --- propagation summary from recent rem events ---
  const recentRem = vitals.propagation.recent;
  console.log(`\npropagation summary (last ${recentRem.length} rem event(s) of ${vitals.propagation.total_rem_events} total):`);
  if (recentRem.length === 0) {
    console.log("  (no rem events yet)");
  } else {
    for (const r of recentRem) {
      console.log(`  ${r.ts}: worldview ${r.worldview_tokens} tokens, propagated ${r.propagated}, composted ${r.composted}`);
    }
  }
}

// ---------------------------------------------------------------------------
// --line: the one-line vitals strip. Consumed by two harness surfaces that
// both pass hook JSON on stdin (session_id included): the SessionStart hook
// (visible at the top of every session, next to the wake injection) and the
// Claude Code statusLine (persistently visible, so the end-of-session state
// and the session diff are always on screen). Read-only render of state other
// processes already deposited — it makes no decision and mutates nothing, so
// it does NOT emit to the obs ledger: the statusline re-runs many times a
// minute and would bury real events under render noise (the same jam Law 9
// exists to surface, caused by the instrument built to satisfy it).
// ---------------------------------------------------------------------------

function sessionIdFromStdin(): string | null {
  try {
    if (process.stdin.isTTY) return null;
    const raw = fs.readFileSync(0, "utf8");
    if (!raw.trim()) return null;
    const j = JSON.parse(raw);
    return typeof j.session_id === "string" ? j.session_id : null;
  } catch {
    return null;
  }
}

function grazeCheckpoints(sessionId: string): number {
  const p = path.join(CIRCADIAN_HOME, "logs", "circadian.events.jsonl");
  let n = 0;
  for (const line of readOrEmpty(p).split("\n")) {
    // cheap pre-filter before JSON.parse — this file grows without bound
    if (!line.includes(sessionId) || !line.includes("checkpoint-digested")) continue;
    try {
      const e = JSON.parse(line);
      const sid = e.session_id ?? e.context?.session_id;
      if (e.process === "graze" && e.phase === "checkpoint-digested" && sid === sessionId) n++;
    } catch {
      // unparseable ledger line: skip — the default render already reports these
    }
  }
  return n;
}

/** Worldview tokens at the first --line render of this session, so later
 * renders can show the session's differential. Snapshots live in logs/ as
 * dotfiles; anything older than 7 days is swept on each call. */
function sessionBaseline(sessionId: string, worldview: number): number {
  const logsDir = path.join(CIRCADIAN_HOME, "logs");
  const p = path.join(logsDir, `.status-snap-${sessionId}.json`);
  try {
    for (const f of fs.readdirSync(logsDir)) {
      if (!f.startsWith(".status-snap-")) continue;
      const fp = path.join(logsDir, f);
      if (Date.now() - fs.statSync(fp).mtimeMs > 7 * 86_400_000) fs.unlinkSync(fp);
    }
  } catch {
    // sweep is best-effort; a failed sweep must never break the render
  }
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")).worldview;
  } catch {
    try {
      fs.writeFileSync(p, JSON.stringify({ worldview, ts: new Date().toISOString() }));
    } catch {}
    return worldview;
  }
}

function renderLine(vitals: ReturnType<typeof collectVitals>, sessionId: string | null) {
  const scoreboard = loadScoreboard();
  const parts: string[] = [];

  const wakes = scoreboard.filter((e) => e.type === "wake");
  parts.push(wakes.length ? `wake ${fmtAge(wakes[wakes.length - 1].ts)}` : "wake NONE");

  const self = vitals.token_counts["SELF.md"];
  parts.push(`self ${self.tokens}/${self.cap}${self.over ? " OVER" : ""}`);

  if (sessionId) {
    parts.push(`graze ${grazeCheckpoints(sessionId)}`);
    const delta = vitals.worldview_tokens - sessionBaseline(sessionId, vitals.worldview_tokens);
    parts.push(`Δself ${delta >= 0 ? "+" : ""}${delta}`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const remToday = scoreboard.filter((e) => e.type === "rem" && e.ts.startsWith(today));
  const lastRem = vitals.propagation.recent[vitals.propagation.recent.length - 1];
  parts.push(`rem ${remToday.length} today${lastRem ? ` (${lastRem.propagated} propagated)` : ""}`);

  if (vitals.verdicts.kill_switch) parts.push("!!! KILL SWITCH");

  console.log(`circadian · ${parts.join(" · ")}`);
}

function main() {
  const args = process.argv.slice(2);
  const corr = correlation("status");

  if (args.includes("--line")) {
    renderLine(collectVitals(), sessionIdFromStdin());
    return;
  }

  if (args.includes("--greet-ok")) {
    appendVerdict("ok");
    ok({
      process: "status",
      phase: "greet-verdict",
      correlation_id: corr,
      summary: "greeting verdict recorded: ok",
      context: { verdict: "ok" },
    });
    return;
  }

  const badIdx = args.indexOf("--greet-bad");
  if (badIdx !== -1) {
    const reason = args[badIdx + 1];
    if (!reason || reason.startsWith("--")) {
      console.error(`status: --greet-bad requires a reason string, e.g. --greet-bad "too vague"`);
      process.exit(1);
      return;
    }
    appendVerdict("bad", reason);
    // A bad greeting verdict is a trust signal degradation — it reaches the
    // tower bus so the human sees it without running a command.
    degraded({
      process: "status",
      phase: "greet-verdict",
      correlation_id: corr,
      summary: `greeting verdict recorded: bad — ${reason}`,
      context: { verdict: "bad", reason },
      cause: `user marked the greeting as bad: ${reason}`,
      next_action:
        "review mind/greeting.md and the worldview in SELF.md; a bad greeting means the memory injection was not useful — inspect the last wake event in logs/circadian.events.jsonl",
    });
    return;
  }

  // Default run: render + emit ok with vitals as context.
  const vitals = collectVitals();
  renderStatus(vitals);

  ok({
    process: "status",
    phase: "vitals",
    correlation_id: corr,
    summary: "circadian status rendered",
    context: vitals,
  });
}

main();
