#!/usr/bin/env bun
/**
 * graze.ts — in-session metabolizer. The meal, while it's being eaten.
 *
 * A session IS a meal: appetizers, main, dessert. Digestion cannot wait for
 * the end of a five-hour session — the transcript must be metabolized as it
 * happens. GRAZE is the in-meal checkpoint: it fires from cheap, frequent
 * Claude Code hooks (PostToolUse / UserPromptSubmit), and self-throttles to
 * one real checkpoint per GRAZE_INTERVAL. Everything else exits in <10ms.
 *
 * Each checkpoint:
 *   - reads only the transcript DELTA since the last checkpoint (byte offset)
 *   - digests it via the local LLM into 2-4 bullet notes (what happened,
 *     decisions, tensions — with verbatim quotes where voice matters)
 *   - appends them to mind/meals/<session_id>.md — the running meal log
 *
 * SLEEP (SessionEnd) then digests the WHOLE meal: full transcript + the
 * accumulated meal notes -> final episode + NOW.md rewrite. REM excretes.
 * The meal file is deleted by SLEEP after the episode is drafted (the
 * episode supersedes it; git never sees meals/ — it is working memory).
 *
 * Two modes, same file (mirrors sleep.ts):
 *   hook mode (default): throttle check, then spawn detached worker, exit.
 *   --worker: do the actual delta digest.
 *
 * Observability: every decision point emits an event via obs.ts (the spine).
 * Hook mode emits idle when throttled or guarded; the worker emits ok on
 * checkpoint-digested, degraded on LLM failure or empty delta, fail on
 * exception. Nothing goes silent. See docs/OBSERVABILITY.md.
 */

import { spawn } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { complete } from "./llm.ts";
import { ok, idle, degraded, fail, correlation } from "./obs.ts";

const CIRCADIAN_HOME = process.env.CIRCADIAN_HOME || join(homedir(), "circadian");
const MIND = join(CIRCADIAN_HOME, "mind");
const MEALS_DIR = join(MIND, "meals");
const BUN_BIN = process.env.CIRCADIAN_BUN_BIN || join(homedir(), ".bun/bin/bun");

const GRAZE_INTERVAL_MS = Number(process.env.CIRCADIAN_GRAZE_INTERVAL_MS || 15 * 60 * 1000); // 15 min
const MIN_DELTA_BYTES = 4 * 1024; // don't checkpoint noise — wait for real conversation
const DELTA_CAP_CHARS = 24000; // ~6k tokens of delta per checkpoint
const LLM_TIMEOUT_MS = 90 * 1000;
const LLM_MAX_TOKENS = 800;

const GRAZE_LOG = join(CIRCADIAN_HOME, "logs", "graze.log");
function glog(mode: string, msg: string, extra?: Record<string, unknown>): void {
  try {
    mkdirSync(dirname(GRAZE_LOG), { recursive: true });
    appendFileSync(
      GRAZE_LOG,
      `${new Date().toISOString()} [${mode}] ${msg}${extra ? " " + JSON.stringify(extra) : ""}\n`
    );
  } catch {
    /* logging never breaks a hook */
  }
}

async function readStdinText(): Promise<string> {
  try {
    return await new Response(Bun.stdin.stream()).text();
  } catch {
    return "";
  }
}
function parseEvent(text: string): Record<string, any> {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

// Per-session checkpoint state: last checkpoint ts + transcript byte offset.
// Lives next to the meal file; tiny JSON.
interface MealState {
  lastCheckpointTs: number;
  byteOffset: number;
  checkpoints: number;
}
function statePath(sessionId: string): string {
  return join(MEALS_DIR, `.${sessionId}.state.json`);
}
function loadState(sessionId: string): MealState {
  try {
    return JSON.parse(readFileSync(statePath(sessionId), "utf8"));
  } catch {
    return { lastCheckpointTs: 0, byteOffset: 0, checkpoints: 0 };
  }
}
function saveState(sessionId: string, st: MealState): void {
  mkdirSync(MEALS_DIR, { recursive: true });
  writeFileSync(statePath(sessionId), JSON.stringify(st));
}

// ---------- hook mode: must be FAST. throttle, maybe spawn, exit. ----------
async function runHook(): Promise<void> {
  const evt = parseEvent(await readStdinText());
  const transcriptPath = evt?.transcript_path;
  const sessionId = evt?.session_id;

  if (!transcriptPath || !sessionId || !existsSync(transcriptPath)) {
    idle({
      process: "graze", phase: "guard",
      summary: "hook fired without a usable transcript or session; nothing to graze",
      context: { transcript_path: transcriptPath ?? null, session_id: sessionId ?? null },
    });
    process.exit(0);
  }

  const st = loadState(sessionId);
  const now = Date.now();
  if (now - st.lastCheckpointTs < GRAZE_INTERVAL_MS) {
    idle({
      process: "graze", phase: "throttle",
      summary: "checkpoint interval not yet elapsed; waiting",
      context: {
        session_id: sessionId,
        elapsed_ms: now - st.lastCheckpointTs,
        interval_ms: GRAZE_INTERVAL_MS,
      },
    });
    process.exit(0);
  }

  let size = 0;
  try {
    size = statSync(transcriptPath).size;
  } catch {
    idle({
      process: "graze", phase: "guard",
      summary: "could not stat transcript; nothing to graze",
      context: { session_id: sessionId, transcript_path: transcriptPath },
    });
    process.exit(0);
  }
  if (size - st.byteOffset < MIN_DELTA_BYTES) {
    idle({
      process: "graze", phase: "guard",
      summary: "delta below minimum size; not enough new content to checkpoint",
      context: {
        session_id: sessionId,
        delta_bytes: size - st.byteOffset,
        min_bytes: MIN_DELTA_BYTES,
      },
    });
    process.exit(0);
  }

  // Claim the slot BEFORE spawning (prevents double-fire from concurrent hooks).
  saveState(sessionId, { ...st, lastCheckpointTs: now });

  try {
    const worker = spawn(BUN_BIN, ["run", import.meta.path, "--worker"], {
      detached: true,
      stdio: ["ignore", "ignore", "ignore"],
      env: {
        ...process.env,
        CIRCADIAN_GRAZE_EVENT: JSON.stringify({ transcript_path: transcriptPath, session_id: sessionId }),
      },
    });
    worker.unref();
    glog("hook", "checkpoint due — worker spawned", { sessionId, delta_bytes: size - st.byteOffset });
  } catch (e) {
    glog("hook", "spawn FAILED", { error: (e as Error).message });
    degraded({
      process: "graze", phase: "spawn-worker",
      summary: "failed to spawn the graze worker",
      context: { session_id: sessionId, error: (e as Error).message },
      cause: (e as Error).message,
      next_action: "check that BUN_BIN is correct and the process can fork; the checkpoint will retry on the next interval",
    });
  }
  process.exit(0);
}

// ---------- worker mode: digest the delta ----------
function extractDeltaText(transcriptPath: string, fromByte: number): { text: string; newOffset: number } {
  const raw = readFileSync(transcriptPath, "utf8");
  const buf = Buffer.from(raw, "utf8");
  const newOffset = buf.length;
  const deltaRaw = buf.subarray(fromByte).toString("utf8");
  const turns: string[] = [];
  for (const line of deltaRaw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    let entry: any;
    try {
      entry = JSON.parse(t);
    } catch {
      continue; // partial line at either edge of the delta — fine
    }
    const role = entry?.message?.role ?? entry?.role;
    if (role !== "user" && role !== "assistant") continue;
    const content = entry?.message?.content ?? entry?.content;
    const blocks = Array.isArray(content) ? content : [{ type: "text", text: String(content ?? "") }];
    const text = blocks
      .filter((b: any) => b?.type === "text" && typeof b.text === "string")
      .map((b: any) => b.text)
      .join("\n")
      .trim();
    if (text) turns.push(`${role === "user" ? "User" : "Assistant"}: ${text}`);
  }
  let text = turns.join("\n\n");
  if (text.length > DELTA_CAP_CHARS) text = text.slice(-DELTA_CAP_CHARS); // most recent wins
  return { text, newOffset };
}

function buildGrazePrompt(delta: string, checkpointN: number): string {
  return `You are GRAZE, the in-session checkpoint of a circadian memory substrate. Below is the LATEST SLICE of a live coding session (checkpoint #${checkpointN}). Digest ONLY this slice into 2-4 terse markdown bullets: what happened, any decision made (with its why), any live tension or unresolved thread. Include a short verbatim quote if the user's voice matters. No preamble, no headers, ONLY the bullets.

=== SLICE ===
${delta}
=== END SLICE ===`;
}

async function runWorker(): Promise<void> {
  const corr = correlation("graze");
  glog("worker", "start");
  try {
    const evt = parseEvent(process.env.CIRCADIAN_GRAZE_EVENT || (await readStdinText()));
    const transcriptPath = evt?.transcript_path;
    const sessionId = evt?.session_id;
    if (!transcriptPath || !sessionId || !existsSync(transcriptPath)) {
      glog("worker", "abort: bad event", { transcriptPath: transcriptPath ?? null });
      degraded({
        process: "graze", phase: "read-event", correlation_id: corr,
        summary: "worker received no usable transcript or session; checkpoint skipped",
        context: { transcript_path: transcriptPath ?? null, session_id: sessionId ?? null },
        cause: "CIRCADIAN_GRAZE_EVENT env var or stdin carried no transcript_path/session_id, or the transcript file does not exist",
        next_action: "verify the hook passes transcript_path + session_id via CIRCADIAN_GRAZE_EVENT; check logs/graze.log for the raw event",
      });
      return;
    }

    const st = loadState(sessionId);
    const { text, newOffset } = extractDeltaText(transcriptPath, st.byteOffset);
    if (!text) {
      glog("worker", "abort: delta extracted empty");
      degraded({
        process: "graze", phase: "extract-delta", correlation_id: corr, session_id: sessionId,
        summary: "delta extracted to empty text; no checkpoint written",
        context: { session_id: sessionId, byte_offset: st.byteOffset, transcript: transcriptPath },
        cause: "extractDeltaText found no user/assistant turns in the delta slice (transcript format mismatch or delta was non-text content)",
        next_action: "confirm the transcript is JSONL with message.role/message.content fields; the offset is NOT advanced, so the next interval will retry",
      });
      return;
    }

    const n = st.checkpoints + 1;
    let bullets: string;
    try {
      bullets = (await complete(buildGrazePrompt(text, n), { timeoutMs: LLM_TIMEOUT_MS, maxTokens: LLM_MAX_TOKENS })).trim();
    } catch (e) {
      glog("worker", "LLM failed — checkpoint skipped, offset NOT advanced (will retry next interval)", {
        error: (e as Error).message,
      });
      degraded({
        process: "graze", phase: "llm-digest", correlation_id: corr, session_id: sessionId,
        summary: "LLM digest failed; checkpoint skipped, offset not advanced",
        context: {
          session_id: sessionId,
          checkpoint: n,
          delta_chars: text.length,
          error: (e as Error).message,
        },
        cause: (e as Error).message,
        next_action: "check the local LLM at :10240 (curl http://127.0.0.1:10240/v1/models); the offset is not advanced so the next interval retries automatically",
      });
      return;
    }

    mkdirSync(MEALS_DIR, { recursive: true });
    const mealPath = join(MEALS_DIR, `${sessionId}.md`);
    const stamp = new Date().toISOString();
    appendFileSync(mealPath, `\n## checkpoint ${n} — ${stamp}\n\n${bullets}\n`);
    saveState(sessionId, { lastCheckpointTs: Date.now(), byteOffset: newOffset, checkpoints: n });
    glog("worker", "checkpoint digested", { sessionId, n, delta_chars: text.length, meal: mealPath });
    ok({
      process: "graze", phase: "checkpoint-digested", correlation_id: corr, session_id: sessionId,
      summary: `checkpoint ${n} digested into meal notes`,
      context: {
        checkpoint: n,
        delta_chars: text.length,
        meal: mealPath,
        model: process.env.CIRCADIAN_LLM_MODEL || "mlx-community/Qwen3-4B-Instruct-2507-4bit",
      },
    });
  } catch (e) {
    glog("worker", "EXCEPTION", { error: (e as Error).message });
    fail({
      process: "graze", phase: "worker", correlation_id: corr,
      summary: "graze worker threw an unhandled exception",
      context: { error: (e as Error).message },
      cause: (e as Error).message,
      next_action: "inspect logs/graze.log and logs/circadian.events.jsonl; the meal file may be partially written",
    });
  }
}

if (process.argv.includes("--worker")) {
  await runWorker();
  process.exit(0);
} else {
  await runHook();
}
