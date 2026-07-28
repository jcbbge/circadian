// circadian-mind.ts — Pi extension that closes the Pi.dev coverage gap.
//
// WAKE on session_start, GRAZE during (turn_end, throttled), SLEEP on
// session_shutdown — routed THROUGH strudel's surface where applicable,
// with specific cooks (detached subprocess workers) for the heavy lifting.
//
// Strudel composition:
//   - before_agent_start: our handler returns { message: {...} } to inject the
//     wake payload; strudel's handler returns { systemPrompt } to manage the
//     tool surface. Pi merges return values from multiple handlers, so they
//     compose naturally — we do NOT bypass strudel.
//   - session_start, turn_end, session_shutdown: extension-specific hooks that
//     don't conflict with strudel's registered tools/events.
//
// Specific cooks (shell out directly per jrg's constraint):
//   - WAKE: spawn wake.ts (file reads + stdout, exits 0 per Law 7)
//   - GRAZE: spawn graze.ts --worker (LLM digest of transcript delta)
//   - SLEEP: spawn sleep.ts --worker (LLM drafting of episode + NOW.md)
//   These are purpose-built one-shot workers — exactly what "specific cook"
//   means. They do LLM calls and file writes that must never block the Pi
//   event loop or session teardown.
//
// Observability: every touchpoint emits through obs.ts with
// context.harness = "pi" so the ledger distinguishes Pi from Claude Code.
// See docs/OBSERVABILITY.md — no silent paths.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { spawn } from "node:child_process";
import { existsSync, statSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ok, degraded, correlation } from "./obs.ts";

const CIRCADIAN_HOME = process.env.CIRCADIAN_HOME || join(homedir(), "circadian");
const BUN_BIN = process.env.CIRCADIAN_BUN_BIN || join(homedir(), ".bun/bin/bun");
const GRAZE_INTERVAL_MS = 15 * 60 * 1000; // 15 min, matching Claude Code path
const MIN_DELTA_BYTES = 4 * 1024; // 4KB minimum delta for graze checkpoint
const MIN_TRANSCRIPT_BYTES = 10 * 1024; // 10KB minimum for sleep (matches sleep.ts)

// Helper: every event from this extension is tagged harness: "pi"
function piContext(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { harness: "pi", ...extra };
}

export default function circadianMind(pi: ExtensionAPI) {
  // Module-level state for this extension instance.
  // On /reload, the extension is re-instantiated, so these reset.
  let wakePayload: string | null = null;
  let wakeInjected = false;

  // -----------------------------------------------------------------------
  // WAKE: session_start → before_agent_start
  //
  // On session_start (not reload), spawn wake.ts to capture the mind injection
  // payload from stdout. On before_agent_start (first prompt only), inject it
  // as a persistent message into the Pi session.
  //
  // wake.ts is a specific cook: it does file reads and exits 0 per Law 7.
  // The injection happens through Pi's native before_agent_start event
  // (composes with strudel's handler which manages the tool surface).
  // -----------------------------------------------------------------------
  pi.on("session_start", async (event, ctx) => {
    // Skip reload — the session is already in progress, no need to re-inject.
    if (event.reason === "reload") return;

    const corr = correlation("wake");
    const sessionId = ctx.sessionManager.getSessionId();
    const transcriptPath = ctx.sessionManager.getSessionFile();

    try {
      const child = spawn(BUN_BIN, ["run", join(CIRCADIAN_HOME, "src/wake.ts")], {
        env: { ...process.env, CIRCADIAN_HOME, CIRCADIAN_BUN_BIN: BUN_BIN },
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (d) => (stdout += d.toString()));
      child.stderr?.on("data", (d) => (stderr += d.toString()));

      const exitCode = await new Promise<number>((resolve) => {
        child.on("close", resolve);
      });

      if (stdout) {
        wakePayload = stdout;
        ok({
          process: "wake",
          phase: "inject",
          correlation_id: corr,
          summary: "wake injection captured and queued for Pi session via before_agent_start",
          context: piContext({
            session_id: sessionId,
            session_reason: event.reason,
            payload_tokens: Math.ceil(stdout.length / 4),
            transcript_path: transcriptPath,
          }),
        });
      } else {
        degraded({
          process: "wake",
          phase: "inject",
          correlation_id: corr,
          summary: "wake produced no output payload",
          context: piContext({
            session_id: sessionId,
            session_reason: event.reason,
            exit_code: exitCode,
            stderr_tail: stderr.slice(0, 500),
          }),
          cause: "wake.ts exited with no stdout — mind files may be missing or unreadable",
          next_action:
            "check logs/circadian.events.jsonl for wake/read-mind events and verify mind/ files exist",
        });
      }
    } catch (e) {
      degraded({
        process: "wake",
        phase: "hook",
        correlation_id: corr,
        summary: "wake subprocess failed to spawn or run",
        context: piContext({
          session_id: sessionId,
          error: (e as Error).message,
        }),
        cause: (e as Error).message,
        next_action: "verify CIRCADIAN_HOME and BUN_BIN are correct in the environment",
      });
    }
  });

  // Inject the wake payload as a persistent message on the first agent start.
  // This composes with strudel's before_agent_start (which returns systemPrompt)
  // — Pi merges return values from multiple handlers in extension load order.
  pi.on("before_agent_start", async (_event, _ctx) => {
    if (wakePayload && !wakeInjected) {
      wakeInjected = true;
      return {
        message: {
          customType: "circadian-wake",
          content: wakePayload,
          display: true,
        },
      };
    }
  });

  // -----------------------------------------------------------------------
  // GRAZE: turn_end (throttled to ~15min)
  //
  // The cheap-frequent trigger on Pi is turn_end. We replicate graze.ts's
  // hook-mode throttle logic (15-min interval, 4KB min delta) and spawn the
  // graze.ts --worker subprocess when a checkpoint is due.
  //
  // The worker is a specific cook — it does LLM calls and file writes that
  // must not block the Pi event loop.
  // -----------------------------------------------------------------------
  pi.on("turn_end", async (_event, ctx) => {
    const sessionId = ctx.sessionManager.getSessionId();
    const transcriptPath = ctx.sessionManager.getSessionFile();

    if (!transcriptPath || !existsSync(transcriptPath)) return;

    // Replicate graze.ts hook-mode throttle logic
    const mealsDir = join(CIRCADIAN_HOME, "mind", "meals");
    const statePath = join(mealsDir, `.${sessionId}.state.json`);
    let state = { lastCheckpointTs: 0, byteOffset: 0, checkpoints: 0 };
    try {
      state = JSON.parse(readFileSync(statePath, "utf8"));
    } catch {
      // First checkpoint — no state yet
    }

    const now = Date.now();
    if (now - state.lastCheckpointTs < GRAZE_INTERVAL_MS) return;

    let size = 0;
    try {
      size = statSync(transcriptPath).size;
    } catch {
      return;
    }
    if (size - state.byteOffset < MIN_DELTA_BYTES) return;

    // Claim the slot BEFORE spawning (prevents double-fire from concurrent hooks)
    try {
      mkdirSync(mealsDir, { recursive: true });
      writeFileSync(statePath, JSON.stringify({ ...state, lastCheckpointTs: now }));
    } catch {
      return;
    }

    // Spawn graze worker (specific cook)
    const corr = correlation("graze");
    try {
      const grazeEvent = JSON.stringify({ transcript_path: transcriptPath, session_id: sessionId });
      const worker = spawn(
        BUN_BIN,
        ["run", join(CIRCADIAN_HOME, "src/graze.ts"), "--worker"],
        {
          detached: true,
          stdio: ["ignore", "ignore", "ignore"],
          env: { ...process.env, CIRCADIAN_HOME, CIRCADIAN_BUN_BIN: BUN_BIN, CIRCADIAN_GRAZE_EVENT: grazeEvent },
        }
      );
      worker.unref();

      ok({
        process: "graze",
        phase: "checkpoint-due",
        correlation_id: corr,
        summary: "graze checkpoint due, worker spawned",
        context: piContext({
          session_id: sessionId,
          delta_bytes: size - state.byteOffset,
          pid: worker.pid,
        }),
      });
    } catch (e) {
      degraded({
        process: "graze",
        phase: "spawn-worker",
        correlation_id: corr,
        summary: "failed to spawn graze worker",
        context: piContext({
          session_id: sessionId,
          error: (e as Error).message,
        }),
        cause: (e as Error).message,
        next_action: "check BUN_BIN and CIRCADIAN_HOME are correct",
      });
    }
  });

  // -----------------------------------------------------------------------
  // SLEEP: session_shutdown
  //
  // On session_shutdown (quit/new/resume/fork, NOT reload), spawn the
  // sleep.ts --worker subprocess with the transcript path and session ID.
  //
  // This is the "specific cook" explicitly called out in the brief —
  // shelling out is correct because sleep does LLM drafting + file writes
  // that must not block session teardown. The worker reads the event from
  // CIRCADIAN_SLEEP_EVENT env var (same contract as the Claude Code hook).
  // -----------------------------------------------------------------------
  pi.on("session_shutdown", async (event, ctx) => {
    // Skip reload — the session is continuing, not ending.
    if (event.reason === "reload") return;

    const corr = correlation("sleep");
    const sessionId = ctx.sessionManager.getSessionId();
    const transcriptPath = ctx.sessionManager.getSessionFile();

    if (!transcriptPath) {
      degraded({
        process: "sleep",
        phase: "session-end",
        correlation_id: corr,
        summary: "no transcript path available at session shutdown",
        context: piContext({
          session_id: sessionId,
          shutdown_reason: event.reason,
        }),
        cause: "ctx.sessionManager.getSessionFile() returned null",
        next_action: "verify the session was properly initialized with a file",
      });
      return;
    }

    if (!existsSync(transcriptPath)) {
      // Pi writes the transcript lazily on the first session entry. No file
      // at shutdown therefore means zero entries were ever written — an
      // empty session (opened and quit before the first prompt) with nothing
      // to metabolize. Absence ⇔ empty session, deterministically: had any
      // entry been written, the file would exist. This is idle, not a
      // failure — 2026-07-28: an 8-second open-and-quit session paged the
      // doctor as DEGRADED over a non-event (sleep-ms3y2esz-4x7g).
      ok({
        process: "sleep",
        phase: "session-end",
        correlation_id: corr,
        summary: "no transcript on disk — empty session, nothing to sleep",
        context: piContext({
          session_id: sessionId,
          transcript_path: transcriptPath,
          shutdown_reason: event.reason,
        }),
      });
      return;
    }

    const tsize = statSync(transcriptPath).size;
    if (tsize < MIN_TRANSCRIPT_BYTES) {
      // Transcript too small — one-shot sessions leave tiny transcripts.
      // This is idle, not a failure.
      ok({
        process: "sleep",
        phase: "session-end",
        correlation_id: corr,
        summary: "session too short for an episode; no sleep worker spawned",
        context: piContext({
          session_id: sessionId,
          transcript_bytes: tsize,
          shutdown_reason: event.reason,
        }),
      });
      return;
    }

    // Spawn sleep worker (specific cook)
    try {
      const sleepEvent = JSON.stringify({
        transcript_path: transcriptPath,
        session_id: sessionId,
      });
      const worker = spawn(
        BUN_BIN,
        ["run", join(CIRCADIAN_HOME, "src/sleep.ts"), "--worker"],
        {
          detached: true,
          stdio: ["ignore", "ignore", "ignore"],
          env: { ...process.env, CIRCADIAN_HOME, CIRCADIAN_BUN_BIN: BUN_BIN, CIRCADIAN_SLEEP_EVENT: sleepEvent },
        }
      );
      worker.unref();

      ok({
        process: "sleep",
        phase: "session-end",
        correlation_id: corr,
        summary: "sleep worker spawned for session end",
        context: piContext({
          session_id: sessionId,
          transcript_path: transcriptPath,
          transcript_bytes: tsize,
          shutdown_reason: event.reason,
          pid: worker.pid,
        }),
      });
    } catch (e) {
      degraded({
        process: "sleep",
        phase: "spawn-worker",
        correlation_id: corr,
        summary: "failed to spawn sleep worker",
        context: piContext({
          session_id: sessionId,
          error: (e as Error).message,
        }),
        cause: (e as Error).message,
        next_action: "check BUN_BIN and CIRCADIAN_HOME are correct",
      });
    }
  });
}
