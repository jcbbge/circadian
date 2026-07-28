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
import { createHash } from "crypto";
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

// R7 greeting-sourced propagation prefixes — sleep.ts's copy of this literal
// (house style: each process keeps its own copy of shared literals, like
// ScoreEvent). Used by computeVerdictStreak to credit a window from raw rem
// propagation, independent of whether a verdict row was ever appended for it.
const GREETING_PROPAGATION_PREFIXES = ["NOW.Arc", "NOW.FlightPlan", "NOW.LiveTensions"];

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

export interface ScoreEvent {
  ts: string;
  type: "wake" | "sleep" | "rem" | "verdict";
  worldview_tokens: number;
  greeting_verdict?: "ok" | "bad";
  reason?: string;
  propagated?: string[];
  composted?: string[];
  /** Did this wave actually change SELF.md? false = the model echoed its
   * input back — the flatline signal doctor watches for. (rem.ts's copy) */
  self_changed?: boolean;
  /** R7 implicit-ok provenance: "propagation" = appended by SLEEP because a
   * greeting-sourced rem judgment propagated; absent = explicit human verdict
   * (--greet-ok / --greet-bad). */
  source?: "propagation";
  /** ts of the rem event this implicit verdict is based on — the dedupe key:
   * one implicit ok per rem judgment, ever. */
  basis?: string;
  /** rem-popmem.ts (popmem WS-F): brand-new atoms / weight bumps this cycle
   * (its own buildCommitMessage counts, mirrored onto the scoreboard event
   * so the strip's last-REM segment can show them — R11). Absent on
   * pre-switchover v1 rem events. */
  stacked?: number;
  bumped?: number;
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

export interface VerdictStreak {
  kind: "ok" | "bad" | "none";
  /** "ok": consecutive recent OK windows. "bad": weighted consecutive
   * zero-ok windows (an explicit bad counts double). */
  count: number;
  killSwitch: boolean;
}

/**
 * R7 fitness streak (docs/POPULATION-MEMORY.md §7 R7 — replaces the old
 * "last 7 verdicts all bad" rule). A wake event opens a greeting window that
 * closes at the next wake; only CLOSED windows are scored — the window since
 * the last wake hasn't had its chance to earn a verdict yet, so scoring it
 * would inflate a bad streak mid-session.
 *
 * Granularity fix (popmem WS-D, live defect: the streak kept growing all day
 * because propagation is only judged at REM-time — twice daily — while this
 * function scored EVERY closed wake-to-wake window, and the many worker-pane
 * windows between REM runs are STRUCTURALLY zero-propagation). The fix scores
 * at the data's real granularity: a rem event's judgment covers ALL windows
 * SINCE THE PREVIOUS REM EVENT — that is literally the span it judged, not
 * just the one window its own ts happens to fall in. A window is therefore
 * either:
 *   - SCORED, because some rem event's span covers it (`prevRemTs < window.end
 *     && remTs >= window.start`, where `prevRemTs` is the ts of the
 *     immediately preceding rem event by ledger order, or -Infinity for the
 *     very first rem event ever — its judgment retroactively covers the dark
 *     ages before verdict tracking existed) OR an explicit/implicit verdict
 *     attributes to it directly; OR
 *   - UNSCORED, when neither applies — this is exactly the trailing windows
 *     newer than the last rem event (they haven't had their judgment yet,
 *     same as the always-excluded open window). Unscored windows are removed
 *     from the walk entirely: they neither extend nor break a streak.
 *
 * A SCORED window credits ok via EITHER route:
 *   1. Verdict attribution: an explicit (--greet-ok) or implicit (R7
 *      propagation) ok verdict is attributable to it. An explicit verdict
 *      (ok or bad) attributes by its OWN ts falling inside the window; an
 *      implicit verdict attributes by its `basis` (the ts of the rem event
 *      it is based on) falling inside the window.
 *   2. Raw propagation: the rem span covering this window belongs to a rem
 *      event whose `propagated` addresses include a greeting-sourced prefix
 *      (GREETING_PROPAGATION_PREFIXES). A span covering the window from a rem
 *      event with NO greeting-sourced propagation is scored, but zero-credit
 *      (bad) — the window WAS judged, and found nothing.
 *
 * Precedence: an explicit bad in a window OVERRIDES that window's
 * propagation credit — a human saying "bad" outranks ambient motion — but
 * does NOT override an explicit/implicit ok verdict landing in the same
 * window. Explicit bad counts DOUBLE against the weighted bad streak
 * regardless of any propagation in its window. The kill switch fires at a
 * weighted streak >= KILL_SWITCH_STREAK consecutive zero-credit SCORED
 * windows, walked newest-first.
 */
export function computeVerdictStreak(events: ScoreEvent[]): VerdictStreak {
  const wakeTimes = events
    .filter((e) => e.type === "wake")
    .map((e) => e.ts)
    .sort();
  if (wakeTimes.length < 2) return { kind: "none", count: 0, killSwitch: false };

  const windows = wakeTimes.slice(0, -1).map((start, i) => ({ start, end: wakeTimes[i + 1] }));

  function windowIndexFor(ts: string): number | null {
    for (let i = windows.length - 1; i >= 0; i--) {
      if (ts >= windows[i].start && ts < windows[i].end) return i;
    }
    return null;
  }

  const hasOk = windows.map(() => false);
  const hasExplicitBad = windows.map(() => false);

  for (const e of events) {
    if (e.type !== "verdict" || !e.greeting_verdict) continue;
    if (e.greeting_verdict === "ok") {
      const attributionTs = e.source === "propagation" && e.basis ? e.basis : e.ts;
      const idx = windowIndexFor(attributionTs);
      if (idx !== null) hasOk[idx] = true;
    } else {
      const idx = windowIndexFor(e.ts);
      if (idx !== null) hasExplicitBad[idx] = true;
    }
  }

  // Span-based rem coverage: sort rem events by ts, pair each with the ts of
  // the immediately preceding one (null = the very first ever, whose span
  // therefore covers back to the dawn of the record — see doc comment).
  const remSpans = events
    .filter((e) => e.type === "rem")
    .map((e) => ({
      ts: e.ts,
      greetingSourced: (e.propagated ?? []).some((addr) =>
        GREETING_PROPAGATION_PREFIXES.some((prefix) => addr.startsWith(prefix))
      ),
    }))
    .sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0))
    .map((r, i, arr) => ({ ...r, prevTs: i === 0 ? null : arr[i - 1].ts }));

  const hasAnyJudgment = windows.map(() => false);
  const hasGreetingJudgment = windows.map(() => false);
  windows.forEach((w, i) => {
    for (const span of remSpans) {
      const prevOk = span.prevTs === null || span.prevTs < w.end;
      if (!prevOk || span.ts < w.start) continue;
      hasAnyJudgment[i] = true;
      if (span.greetingSourced) hasGreetingJudgment[i] = true;
    }
  });

  // Explicit bad overrides propagation credit for its own window, but not a
  // verdict-attributed ok in that same window (see doc comment precedence).
  const credited = windows.map((_, i) => (hasExplicitBad[i] ? hasOk[i] : hasOk[i] || hasGreetingJudgment[i]));
  const scored = windows.map((_, i) => hasOk[i] || hasExplicitBad[i] || hasAnyJudgment[i]);

  const scoredIdx = windows.map((_, i) => i).filter((i) => scored[i]);
  if (scoredIdx.length === 0) return { kind: "none", count: 0, killSwitch: false };

  const newest = scoredIdx[scoredIdx.length - 1];
  if (credited[newest]) {
    let count = 0;
    let k = scoredIdx.length - 1;
    while (k >= 0 && credited[scoredIdx[k]]) {
      count++;
      k--;
    }
    return { kind: "ok", count, killSwitch: false };
  }

  let weighted = 0;
  let k = scoredIdx.length - 1;
  while (k >= 0 && !credited[scoredIdx[k]]) {
    weighted += hasExplicitBad[scoredIdx[k]] ? 2 : 1;
    k--;
  }
  return { kind: "bad", count: weighted, killSwitch: weighted >= KILL_SWITCH_STREAK };
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
function collectVitals(scoreboard: ScoreEvent[]) {
  const nowMd = readOrEmpty(NOW_PATH);
  const selfMd = readOrEmpty(SELF_PATH);
  const userMd = readOrEmpty(USER_PATH);
  const compostMd = readOrEmpty(COMPOST_PATH);

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
  const streak = computeVerdictStreak(scoreboard);

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
      streak,
      kill_switch: streak.killSwitch,
    },
    propagation: {
      total_rem_events: remEvents.length,
      recent: recentRem.map((r) => ({
        ts: r.ts,
        worldview_tokens: r.worldview_tokens,
        propagated: r.propagated?.length ?? 0,
        composted: r.composted?.length ?? 0,
        stacked: r.stacked,
        bumped: r.bumped,
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

  if (vitals.verdicts.streak.kind !== "none") {
    console.log(`\nverdict streak: ${vitals.verdicts.streak.kind}×${vitals.verdicts.streak.count} (closed greeting windows, newest-first)`);
  }

  if (vitals.verdicts.kill_switch) {
    console.log(
      `\n!!! KILL SWITCH: ${KILL_SWITCH_STREAK}+ consecutive greeting windows with zero ok verdict (R7). Per docs/POPULATION-MEMORY.md §7 R7 this is the decommission trigger. The decision to actually decommission is human, not automated.`
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

/** One pass over logs/circadian.events.jsonl computing BOTH the graze
 * checkpoint count (for this session) and today's degraded/failed count
 * (R11 statusline requirement) — the file already grows without bound and
 * --line is called many times a minute, so this must never become two
 * full scans where one will do. */
function scanEventsLog(sessionId: string | null): { grazeCount: number; degradedToday: number } {
  const p = path.join(CIRCADIAN_HOME, "logs", "circadian.events.jsonl");
  const today = new Date().toISOString().slice(0, 10);
  let grazeCount = 0;
  let degradedToday = 0;
  for (const line of readOrEmpty(p).split("\n")) {
    const t = line.trim();
    if (!t) continue;
    // cheap pre-filters before JSON.parse
    const couldBeGraze = sessionId !== null && t.includes(sessionId) && t.includes("checkpoint-digested");
    const couldBeDegraded = t.includes(`"outcome":"degraded"`) || t.includes(`"outcome":"failed"`);
    if (!couldBeGraze && !couldBeDegraded) continue;
    try {
      const e = JSON.parse(t);
      if (couldBeGraze) {
        const sid = e.session_id ?? e.context?.session_id;
        if (e.process === "graze" && e.phase === "checkpoint-digested" && sid === sessionId) grazeCount++;
      }
      if (couldBeDegraded && typeof e.ts === "string" && e.ts.startsWith(today) && (e.outcome === "degraded" || e.outcome === "failed")) {
        degradedToday++;
      }
    } catch {
      // unparseable ledger line: skip — the default render already reports these
    }
  }
  return { grazeCount, degradedToday };
}

/** REM absorb freeze marker (popmem WS-0): $CIRCADIAN_HOME/.rem-freeze. The
 * existence check is a cheap stat — the expensive part (hashing every
 * episode against digested.jsonl to count the backlog) only runs when the
 * marker is actually present, so the unfrozen common case adds no scan. */
function remFreezeStatus(): { frozen: boolean; backlog: number } {
  const markerPath = path.join(CIRCADIAN_HOME, ".rem-freeze");
  if (!fs.existsSync(markerPath)) return { frozen: false, backlog: 0 };

  const episodesDir = path.join(MIND_DIR, "episodes");
  let files: string[] = [];
  try {
    files = fs.readdirSync(episodesDir).filter((f) => f.endsWith(".md"));
  } catch {
    files = [];
  }
  const digested = new Set<string>();
  for (const line of readOrEmpty(path.join(MIND_DIR, "digested.jsonl")).split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const e = JSON.parse(t);
      if (e && typeof e.hash === "string") digested.add(e.hash);
    } catch {
      // unparseable ledger line: skip
    }
  }
  let backlog = 0;
  for (const f of files) {
    try {
      const content = fs.readFileSync(path.join(episodesDir, f), "utf8");
      if (!digested.has(createHash("sha256").update(content, "utf8").digest("hex"))) backlog++;
    } catch {
      // unreadable episode file: skip — must never break the render
    }
  }
  return { frozen: true, backlog };
}

// $CIRCADIAN_HOME/logs/.population-vitals.json — written once per run by
// decay.ts (popmem WS-D), read here as the snapshot pattern WS-0's
// remFreezeStatus established: a cheap existence check gates the (small,
// non-growing) file read, so the common case adds no scan. Immune-size
// (src_loc) stays in the snapshot/obs ledger, not the strip — strip real
// estate is precious and it's already plotted data per R10.
const POPULATION_VITALS_PATH = path.join(CIRCADIAN_HOME, "logs", ".population-vitals.json");
const POPULATION_VITALS_STALE_MS = 36 * 3_600_000;

export interface PopulationVitalsSnapshot {
  ts: string;
  src_loc: number;
  population: number;
  top_weight: number;
  sank_below_floor: string[];
}

/** Pure: renders the `pop N (top W.W)[ · ↓K sank]` segment from a snapshot,
 * or `pop stale` if it's older than POPULATION_VITALS_STALE_MS (degradation
 * must stay visible per R11), or null if there's no snapshot at all (no
 * population yet — pre-switchover reality, not a degraded state). */
export function populationVitalsSegment(snapshot: PopulationVitalsSnapshot | null, nowIso: string): string | null {
  if (!snapshot) return null;
  const ageMs = Date.parse(nowIso) - Date.parse(snapshot.ts);
  if (Number.isNaN(ageMs) || ageMs > POPULATION_VITALS_STALE_MS) return "pop stale";
  let seg = `pop ${snapshot.population} (top ${snapshot.top_weight.toFixed(1)})`;
  if (snapshot.sank_below_floor.length > 0) seg += ` ↓${snapshot.sank_below_floor.length} sank`;
  return seg;
}

function readPopulationVitals(): PopulationVitalsSnapshot | null {
  if (!fs.existsSync(POPULATION_VITALS_PATH)) return null; // cheap stat before any read
  try {
    const parsed = JSON.parse(fs.readFileSync(POPULATION_VITALS_PATH, "utf8"));
    if (typeof parsed.ts !== "string" || typeof parsed.population !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
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

function renderLine(vitals: ReturnType<typeof collectVitals>, scoreboard: ScoreEvent[], sessionId: string | null) {
  const parts: string[] = [];

  const wakes = scoreboard.filter((e) => e.type === "wake");
  parts.push(wakes.length ? `wake ${fmtAge(wakes[wakes.length - 1].ts)}` : "wake NONE");

  const self = vitals.token_counts["SELF.md"];
  parts.push(`self ${self.tokens}/${self.cap}${self.over ? " OVER" : ""}`);

  const { grazeCount, degradedToday } = scanEventsLog(sessionId);

  if (sessionId) {
    parts.push(`graze ${grazeCount}`);
    const delta = vitals.worldview_tokens - sessionBaseline(sessionId, vitals.worldview_tokens);
    parts.push(`Δself ${delta >= 0 ? "+" : ""}${delta}`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const remToday = scoreboard.filter((e) => e.type === "rem" && e.ts.startsWith(today));
  const lastRem = vitals.propagation.recent[vitals.propagation.recent.length - 1];
  const lastRemDetail = lastRem
    ? typeof lastRem.stacked === "number" || typeof lastRem.bumped === "number"
      ? ` (${lastRem.propagated} propagated, stacked ${lastRem.stacked ?? 0}, bumped ${lastRem.bumped ?? 0})`
      : ` (${lastRem.propagated} propagated)`
    : "";
  parts.push(`rem ${remToday.length} today${lastRemDetail}`);

  const freeze = remFreezeStatus();
  if (freeze.frozen) parts.push(`rem FROZEN·backlog ${freeze.backlog}`);

  const popSeg = populationVitalsSegment(readPopulationVitals(), new Date().toISOString());
  if (popSeg) parts.push(popSeg);

  if (vitals.verdicts.streak.kind !== "none") {
    parts.push(`verdict ${vitals.verdicts.streak.kind}×${vitals.verdicts.streak.count}`);
  }

  if (degradedToday > 0) parts.push(`!${degradedToday} degraded`);

  if (vitals.verdicts.kill_switch) parts.push("!!! KILL SWITCH");

  console.log(`circadian · ${parts.join(" · ")}`);
}

function main() {
  const args = process.argv.slice(2);
  const corr = correlation("status");

  if (args.includes("--line")) {
    const scoreboard = loadScoreboard();
    renderLine(collectVitals(scoreboard), scoreboard, sessionIdFromStdin());
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
  const vitals = collectVitals(loadScoreboard());
  renderStatus(vitals);

  ok({
    process: "status",
    phase: "vitals",
    correlation_id: corr,
    summary: "circadian status rendered",
    context: vitals,
  });
}

// import.meta.main guard (mirror zoom.ts/replay.ts/sleep.ts): status.ts
// became importable (popmem WS-0 needs computeVerdictStreak reused by
// scorecard.ts and status.test.ts) — a plain top-level `main()` would render
// vitals and emit an obs event on import.
if (import.meta.main) main();
