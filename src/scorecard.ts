#!/usr/bin/env bun
/**
 * scorecard.ts — THE DAILY READING (popmem WS-0, docs/POPULATION-MEMORY.md
 * §17): "nobody waits a week to learn anything." At the first wake of every
 * calendar day, a three-line scorecard renders EXPECTED vs ACTUAL vs a
 * one-word verdict for yesterday's prediction, plus the build-phase metrics
 * that stand in for the population-memory vitals until WS-B/C/D exist.
 *
 * Pure decision logic (isFirstWakeToday, evaluateYesterdaysPrediction,
 * resolveOutgoingPrediction, buildScorecard) is separated from the file
 * reads that gather live metrics (renderDailyReading), so the decisions are
 * unit-testable against fixture data with no mind interaction (mirrors the
 * rem.ts freeze-decision / sleep.ts implicit-ok pattern this program
 * established).
 *
 * wake.ts is the only caller: it detects first-wake-of-day BEFORE appending
 * its own wake event (otherwise this session's own arrival would count as
 * "already woken today"), calls renderDailyReading, and appends the 3-line
 * block after the greeting in the injection payload. Law 7 applies here too
 * — every read is best-effort and a failure must never withhold the wake
 * injection (wake.ts wraps the call in its own try/catch).
 */

import * as fs from "fs";
import * as path from "path";
import { computeVerdictStreak, type ScoreEvent } from "./status.ts";

// The program's day-1 anchor and target run length (docs/POPULATION-MEMORY.md
// §17: "THE DAILY READING ... 30 days minimum").
const PROGRAM_START = "2026-07-27";
const PROGRAM_LENGTH_DAYS = 30;
// src/*.ts total line count the day this program started (wc -l src/*.ts).
const LOC_BASELINE = 9466;
const NO_PREDICTION_TEXT = "(none set — orchestrator seeds via logs/daily-reading.jsonl)";

// ---------------------------------------------------------------------
// ledger shape (logs/daily-reading.jsonl — untracked logs/, NOT the mind)
// ---------------------------------------------------------------------
export type ScorecardMetric = "loc_total" | "tests_pass" | "degraded_today" | "population" | "verdict_streak";
export type ScorecardOp = "<" | "<=" | "==" | ">=" | ">";

export interface DailyReadingPrediction {
  text: string;
  check?: {
    metric: ScorecardMetric;
    op: ScorecardOp;
    value: number;
  };
}

export interface DailyReadingEntry {
  ts: string;
  day: string; // ISO calendar date (YYYY-MM-DD) this entry was emitted for
  lines: string[];
  prediction: DailyReadingPrediction;
}

export interface LiveMetrics {
  loc_total?: number;
  tests_pass?: number;
  degraded_today?: number;
  population?: number;
  verdict_streak?: number; // signed: negative while the streak kind is "bad"
}

// ---------------------------------------------------------------------
// date helpers — plain string arithmetic, no clock reads (every date comes
// in as an argument so these stay pure and testable).
// ---------------------------------------------------------------------
function addDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function dayNumber(today: string): number {
  const start = Date.parse(PROGRAM_START + "T00:00:00.000Z");
  const cur = Date.parse(today + "T00:00:00.000Z");
  return Math.floor((cur - start) / 86_400_000) + 1;
}

function ageStr(iso: string, nowIso: string): string {
  const ms = Date.parse(nowIso) - Date.parse(iso);
  if (Number.isNaN(ms)) return "unknown age";
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.max(0, Math.round(ms / 60000))}m ago`;
  if (hours < 48) return `${hours.toFixed(1)}h ago`;
  return `${(hours / 24).toFixed(1)}d ago`;
}

// ---------------------------------------------------------------------
// first-wake-of-day detection (must run BEFORE this run's own wake event is
// appended to the scoreboard, or every morning's first wake would see its
// own arrival and conclude the day already had one).
// ---------------------------------------------------------------------
export function isFirstWakeToday(scoreboard: { type: string; ts: string }[], today: string): boolean {
  return !scoreboard.some((e) => e.type === "wake" && e.ts.startsWith(today));
}

// ---------------------------------------------------------------------
// yesterday's prediction: HELD / BROKE / UNJUDGED / NONE
// ---------------------------------------------------------------------
function findEntryForDay(ledger: DailyReadingEntry[], day: string): DailyReadingEntry | null {
  for (let i = ledger.length - 1; i >= 0; i--) {
    if (ledger[i].day === day) return ledger[i];
  }
  return null;
}

function compareMetric(actual: number, op: ScorecardOp, value: number): boolean {
  switch (op) {
    case "<":
      return actual < value;
    case "<=":
      return actual <= value;
    case "==":
      return actual === value;
    case ">=":
      return actual >= value;
    case ">":
      return actual > value;
    default:
      return false;
  }
}

export type PredictionVerdict = "HELD" | "BROKE" | "UNJUDGED" | "NONE";

/** Evaluates the prediction recorded for YESTERDAY (today - 1 day) against
 * today's live metrics. NONE = no ledger entry for yesterday at all (e.g.
 * day 1 of the program — the missing-ledger path). UNJUDGED = a prediction
 * exists but either carries no machine-checkable `check`, or names a metric
 * this wave can't compute (e.g. `population` before WS-B exists). */
export function evaluateYesterdaysPrediction(
  ledger: DailyReadingEntry[],
  today: string,
  liveMetrics: LiveMetrics
): { text: string | null; verdict: PredictionVerdict } {
  const yesterday = addDays(today, -1);
  const entry = findEntryForDay(ledger, yesterday);
  if (!entry || !entry.prediction || !entry.prediction.text) return { text: null, verdict: "NONE" };
  const { text, check } = entry.prediction;
  if (!check) return { text, verdict: "UNJUDGED" };
  const actual = liveMetrics[check.metric];
  if (actual === undefined) return { text, verdict: "UNJUDGED" };
  return { text, verdict: compareMetric(actual, check.op, check.value) ? "HELD" : "BROKE" };
}

// ---------------------------------------------------------------------
// tomorrow's outgoing prediction: WS-0 has no domain knowledge to invent a
// meaningful claim about atom population/redundancy trends — that's the
// orchestrator's call. It pre-seeds by appending a ledger line dated
// tomorrow (today+1) carrying just a `prediction`; the newest ledger line
// is checked for exactly that shape. No pre-seed => the honest fallback.
// ---------------------------------------------------------------------
export function resolveOutgoingPrediction(
  ledger: DailyReadingEntry[],
  today: string
): { prediction: DailyReadingPrediction; seeded: boolean } {
  const tomorrow = addDays(today, 1);
  const newest = ledger.length > 0 ? ledger[ledger.length - 1] : null;
  if (newest && newest.day === tomorrow && newest.prediction && newest.prediction.text) {
    return { prediction: newest.prediction, seeded: true };
  }
  return { prediction: { text: NO_PREDICTION_TEXT }, seeded: false };
}

// ---------------------------------------------------------------------
// the 3-line block + the ledger entry it gets recorded as
// ---------------------------------------------------------------------
export interface ScorecardInputs {
  today: string; // ISO date (YYYY-MM-DD)
  nowIso: string;
  ledger: DailyReadingEntry[];
  locTotal: number;
  locBaseline: number;
  degradedToday: number;
  verdictStreak: { kind: "ok" | "bad" | "none"; count: number };
  lastRem: { ts: string; propagated: number; composted: number; self_changed: boolean } | null;
}

export interface ScorecardResult {
  lines: [string, string, string];
  entry: DailyReadingEntry;
}

export function buildScorecard(inputs: ScorecardInputs): ScorecardResult {
  const dayNum = dayNumber(inputs.today);
  const locDelta = inputs.locTotal - inputs.locBaseline;
  const line1 = `day ${dayNum}/${PROGRAM_LENGTH_DAYS} · LOC ${inputs.locTotal} (baseline ${inputs.locBaseline}, ${locDelta >= 0 ? "+" : ""}${locDelta})`;

  const streakStr = inputs.verdictStreak.kind === "none" ? "none yet" : `${inputs.verdictStreak.kind}×${inputs.verdictStreak.count}`;
  const remStr = inputs.lastRem
    ? `last rem ${ageStr(inputs.lastRem.ts, inputs.nowIso)}: propagated ${inputs.lastRem.propagated}, composted ${inputs.lastRem.composted}, self_changed ${inputs.lastRem.self_changed}`
    : "last rem: none yet";
  const line2 = `degraded ${inputs.degradedToday} today · verdict streak ${streakStr} · ${remStr}`;

  const liveMetrics: LiveMetrics = {
    loc_total: inputs.locTotal,
    degraded_today: inputs.degradedToday,
    verdict_streak: inputs.verdictStreak.kind === "bad" ? -inputs.verdictStreak.count : inputs.verdictStreak.count,
    // tests_pass / population: not computable from file reads alone this
    // wave (tests_pass needs running the suite; population needs WS-B) —
    // left undefined so a prediction naming either metric resolves UNJUDGED.
  };

  const yesterday = evaluateYesterdaysPrediction(inputs.ledger, inputs.today, liveMetrics);
  const yesterdayStr =
    yesterday.verdict === "NONE"
      ? `yesterday's prediction: (none recorded)`
      : `yesterday's prediction: "${yesterday.text}" → ${yesterday.verdict}`;

  const outgoing = resolveOutgoingPrediction(inputs.ledger, inputs.today);
  const tomorrowStr = outgoing.seeded ? `prediction: "${outgoing.prediction.text}"` : `prediction: ${outgoing.prediction.text}`;

  const line3 = `${yesterdayStr} · ${tomorrowStr}`;

  const entry: DailyReadingEntry = {
    ts: inputs.nowIso,
    day: inputs.today,
    lines: [line1, line2, line3],
    prediction: outgoing.prediction,
  };

  return { lines: [line1, line2, line3], entry };
}

// ---------------------------------------------------------------------
// I/O layer: gathers live metrics via file reads only (never a subprocess —
// wake.ts's SessionStart hook must never block a session on `bun test`),
// then hands off to the pure composer above. Every read is best-effort;
// an unreadable/missing source degrades to a zero/empty value rather than
// throwing (the caller, wake.ts, still wraps this in its own try/catch —
// Law 7 belt and suspenders).
// ---------------------------------------------------------------------
function readOrEmpty(p: string): string {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

function loadLedger(ledgerPath: string): DailyReadingEntry[] {
  const entries: DailyReadingEntry[] = [];
  for (const line of readOrEmpty(ledgerPath).split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      entries.push(JSON.parse(t));
    } catch {
      // unparseable ledger line: skip — never let one bad line break the reading
    }
  }
  return entries;
}

/** wc -l semantics (newline count), not String.split("\n").length, so this
 * matches the 9466 baseline exactly (`wc -l src/*.ts`). */
function countSrcLoc(circadianHome: string): number {
  const srcDir = path.join(circadianHome, "src");
  let files: string[] = [];
  try {
    files = fs.readdirSync(srcDir).filter((f) => f.endsWith(".ts"));
  } catch {
    return 0;
  }
  let total = 0;
  for (const f of files) {
    const content = readOrEmpty(path.join(srcDir, f));
    total += (content.match(/\n/g) || []).length;
  }
  return total;
}

function countDegradedToday(eventsLogPath: string, today: string): number {
  let n = 0;
  for (const line of readOrEmpty(eventsLogPath).split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (!t.includes(`"outcome":"degraded"`) && !t.includes(`"outcome":"failed"`)) continue;
    try {
      const e = JSON.parse(t);
      if (typeof e.ts === "string" && e.ts.startsWith(today) && (e.outcome === "degraded" || e.outcome === "failed")) n++;
    } catch {
      // unparseable ledger line: skip
    }
  }
  return n;
}

/** The single entry point wake.ts calls. Gathers everything live (ledger,
 * LOC, today's degraded count, the verdict streak, the last rem event) and
 * returns the rendered 3-line block plus the ledger entry to append. */
export function renderDailyReading(opts: {
  circadianHome: string;
  scoreboard: ScoreEvent[];
  today: string;
  nowIso: string;
}): ScorecardResult {
  const ledger = loadLedger(path.join(opts.circadianHome, "logs", "daily-reading.jsonl"));
  const locTotal = countSrcLoc(opts.circadianHome);
  const degradedToday = countDegradedToday(path.join(opts.circadianHome, "logs", "circadian.events.jsonl"), opts.today);
  const verdictStreak = computeVerdictStreak(opts.scoreboard);
  const remEvents = opts.scoreboard.filter((e) => e.type === "rem");
  const last = remEvents.length > 0 ? remEvents[remEvents.length - 1] : null;
  const lastRem = last
    ? { ts: last.ts, propagated: last.propagated?.length ?? 0, composted: last.composted?.length ?? 0, self_changed: last.self_changed ?? false }
    : null;

  return buildScorecard({
    today: opts.today,
    nowIso: opts.nowIso,
    ledger,
    locTotal,
    locBaseline: LOC_BASELINE,
    degradedToday,
    verdictStreak,
    lastRem,
  });
}

/** Loads the live scoreboard.jsonl — exported so wake.ts's first-wake check
 * and the renderDailyReading call above share one read (no extra scan). */
export function loadScoreboardFile(scoreboardPath: string): ScoreEvent[] {
  const events: ScoreEvent[] = [];
  for (const line of readOrEmpty(scoreboardPath).split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      events.push(JSON.parse(t));
    } catch {
      // unparseable ledger line: skip
    }
  }
  return events;
}

/** Appends this emission to logs/daily-reading.jsonl (untracked logs/ — NOT
 * the mind repo; the ledger's own directory is created if missing). */
export function appendDailyReadingEntry(circadianHome: string, entry: DailyReadingEntry): void {
  const logsDir = path.join(circadianHome, "logs");
  fs.mkdirSync(logsDir, { recursive: true });
  fs.appendFileSync(path.join(logsDir, "daily-reading.jsonl"), JSON.stringify(entry) + "\n");
}
