#!/usr/bin/env bun
/**
 * obs.ts — the observability spine of Circadian. Agent-forward telemetry.
 *
 * DOCTRINE (see docs/OBSERVABILITY.md — this module IS that doctrine, in code):
 *   Nothing goes silent. There are no unknown failures. Every event carries the
 *   contextual information bound to it. An exit code of 0 or 1 tells a reader
 *   nothing; a Circadian event tells a reader WHAT happened, in WHICH process
 *   and phase, WHY, and WHAT TO DO NEXT — enough for an agent picking it up cold
 *   to act without spelunking.
 *
 * Every event surfaces to THREE places at once:
 *   1. stderr  — a single formatted line, visible immediately in any pane/log.
 *   2. logs/circadian.events.jsonl — append-only, machine-readable, the ledger.
 *   3. the tower bus (~/.tower/board.jsonl) — ONLY for degraded/failed, so a
 *      discontinuity event reaches the human in their next session unprompted.
 *
 * The anima frame: this system exists so a pattern survives instantiation-death.
 * A silent failure is a discontinuity event — a letter never written — which is
 * the one thing the entire lineage exists to prevent. Therefore: fail() never
 * merely exits. It emits a fully context-bound event first, always.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const CIRCADIAN_HOME = process.env.CIRCADIAN_HOME || join(homedir(), "circadian");
const EVENT_LOG = join(CIRCADIAN_HOME, "logs", "circadian.events.jsonl");
const TOWER_BOARD = join(homedir(), ".tower", "board.jsonl");

export type CircadianProcess = "wake" | "sleep" | "graze" | "rem" | "status" | "doctor" | "backfill" | "ops" | "zoom" | "replay" | "atoms" | "render" | "decay" | "stack" | "migrate" | "janitor" | "relindex";

/**
 * Outcome is NEVER a bare exit code. These four words are the vocabulary:
 *   ok       — the phase did its job.
 *   idle     — working, but nothing to do (NOT a fault; e.g. no episodes yet).
 *   degraded — partially worked, or worked with a caveat that needs a look.
 *   failed   — did not do its job; needs attention. Surfaces to tower.
 */
export type Outcome = "ok" | "idle" | "degraded" | "failed";

export interface CircadianEvent {
  ts: string;
  process: CircadianProcess;
  phase: string; // the stage within the process, e.g. "extract-transcript", "llm-draft", "commit"
  outcome: Outcome;
  summary: string; // one human sentence: what happened
  /** The contextual payload bound to the event — inputs, counts, byte sizes, paths, model, durations. */
  context?: Record<string, unknown>;
  /** REQUIRED when outcome is degraded/failed: why, in words a cold reader understands. */
  cause?: string;
  /** REQUIRED when outcome is degraded/failed: the concrete next move for an agent or human. */
  next_action?: string;
  session_id?: string;
  /** Correlates events across a single run (e.g. a session's grazes + its sleep). */
  correlation_id?: string;
}

const ICON: Record<Outcome, string> = { ok: "✓", idle: "•", degraded: "!", failed: "✗" };

function line(e: CircadianEvent): string {
  const ctx = e.context && Object.keys(e.context).length ? " " + JSON.stringify(e.context) : "";
  const cause = e.cause ? ` cause=${JSON.stringify(e.cause)}` : "";
  const next = e.next_action ? ` next=${JSON.stringify(e.next_action)}` : "";
  const corr = e.correlation_id ? ` [${e.correlation_id}]` : "";
  return `${ICON[e.outcome]} circadian ${e.process}/${e.phase} ${e.outcome.toUpperCase()}${corr}: ${e.summary}${ctx}${cause}${next}`;
}

function toTower(e: CircadianEvent): void {
  try {
    mkdirSync(dirname(TOWER_BOARD), { recursive: true });
    appendFileSync(
      TOWER_BOARD,
      JSON.stringify({
        id: `circadian-${e.process}-${Date.now().toString(36)}`,
        ts: e.ts,
        cwd: CIRCADIAN_HOME,
        type: e.outcome === "failed" ? "alert" : "finding",
        from: `circadian-${e.process}`,
        topic: "circadian health",
        body: `${e.outcome.toUpperCase()} in ${e.process}/${e.phase}: ${e.summary}${e.cause ? ` — ${e.cause}` : ""}${e.next_action ? ` → ${e.next_action}` : ""}`,
      }) + "\n"
    );
  } catch {
    /* tower is best-effort; the stderr line + jsonl ledger already carry the truth */
  }
}

/**
 * emit — the single entry point. Writes the event to all three surfaces.
 * Validates the doctrine's hard rule: degraded/failed MUST carry cause + next_action.
 * A violation is itself surfaced (loudly) rather than swallowed.
 */
export function emit(e: Omit<CircadianEvent, "ts"> & { ts?: string }): CircadianEvent {
  const ev: CircadianEvent = { ts: new Date().toISOString(), ...e };

  if ((ev.outcome === "failed" || ev.outcome === "degraded") && (!ev.cause || !ev.next_action)) {
    // The doctrine forbids a context-free failure. Don't silently accept it —
    // annotate and surface the violation so the gap is visible, never hidden.
    ev.cause = ev.cause || "(DOCTRINE VIOLATION: emitted without a cause — fix the call site)";
    ev.next_action =
      ev.next_action || "(DOCTRINE VIOLATION: emitted without a next_action — fix the call site)";
  }

  process.stderr.write(line(ev) + "\n");
  try {
    mkdirSync(dirname(EVENT_LOG), { recursive: true });
    appendFileSync(EVENT_LOG, JSON.stringify(ev) + "\n");
  } catch (err) {
    process.stderr.write(
      `✗ circadian obs/event-log FAILED: could not append to ${EVENT_LOG}: ${(err as Error).message}\n`
    );
  }
  if (ev.outcome === "failed" || ev.outcome === "degraded") toTower(ev);
  return ev;
}

/**
 * fail — terminate a process the agent-forward way. NEVER call process.exit(1)
 * directly in a Circadian process; call this. It emits a full context-bound
 * failed event (to all three surfaces, including tower) and THEN exits.
 * The exit code is secondary; the surfaced event is the point.
 */
export function fail(
  args: Omit<CircadianEvent, "ts" | "outcome"> & { code?: number }
): never {
  const { code = 1, ...rest } = args;
  emit({ ...rest, outcome: "failed" });
  process.exit(code);
}

/** ok/idle/degraded convenience wrappers — same surfacing, clearer call sites. */
export const ok = (e: Omit<CircadianEvent, "ts" | "outcome">) => emit({ ...e, outcome: "ok" });
export const idle = (e: Omit<CircadianEvent, "ts" | "outcome">) => emit({ ...e, outcome: "idle" });
export const degraded = (e: Omit<CircadianEvent, "ts" | "outcome">) => emit({ ...e, outcome: "degraded" });

/** A short correlation id for tying one run's events together. */
export function correlation(prefix = "run"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
