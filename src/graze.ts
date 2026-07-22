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
  if (!transcriptPath || !sessionId || !existsSync(transcriptPath)) process.exit(0);

  const st = loadState(sessionId);
  const now = Date.now();
  if (now - st.lastCheckpointTs < GRAZE_INTERVAL_MS) process.exit(0); // not time yet — silent, instant

  let size = 0;
  try {
    size = statSync(transcriptPath).size;
  } catch {
    process.exit(0);
  }
  if (size - st.byteOffset < MIN_DELTA_BYTES) process.exit(0); // nothing meaningful eaten yet

  // Claim the slot BEFORE spawning (prevents double-fire from concurrent hooks).
  saveState(sessionId, { ...st, lastCheckpointTs: now });

  try {
    const worker = spawn(BUN_BIN, ["run", import.meta.path, "--worker"], {
      detached: true,
      stdio: ["ignore", "ignore", "ignore"],
      env: { ...process.env, CIRCADIAN_GRAZE_EVENT: JSON.stringify({ transcript_path: transcriptPath, session_id: sessionId }) },
    });
    worker.unref();
    glog("hook", "checkpoint due — worker spawned", { sessionId, delta_bytes: size - st.byteOffset });
  } catch (e) {
    glog("hook", "spawn FAILED", { error: (e as Error).message });
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
  const evt = parseEvent(process.env.CIRCADIAN_GRAZE_EVENT || (await readStdinText()));
  const transcriptPath = evt?.transcript_path;
  const sessionId = evt?.session_id;
  if (!transcriptPath || !sessionId || !existsSync(transcriptPath)) {
    glog("worker", "abort: bad event", { transcriptPath: transcriptPath ?? null });
    return;
  }
  try {
    const st = loadState(sessionId);
    const { text, newOffset } = extractDeltaText(transcriptPath, st.byteOffset);
    if (!text) {
      glog("worker", "abort: delta extracted empty");
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
      return;
    }

    mkdirSync(MEALS_DIR, { recursive: true });
    const mealPath = join(MEALS_DIR, `${sessionId}.md`);
    const stamp = new Date().toISOString();
    appendFileSync(mealPath, `\n## checkpoint ${n} — ${stamp}\n\n${bullets}\n`);
    saveState(sessionId, { lastCheckpointTs: Date.now(), byteOffset: newOffset, checkpoints: n });
    glog("worker", "checkpoint digested", { sessionId, n, delta_chars: text.length, meal: mealPath });
  } catch (e) {
    glog("worker", "EXCEPTION", { error: (e as Error).message });
  }
}

if (process.argv.includes("--worker")) {
  await runWorker();
  process.exit(0);
} else {
  await runHook();
}
