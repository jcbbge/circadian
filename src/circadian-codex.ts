#!/usr/bin/env bun
// circadian-codex.ts — Codex CLI lifecycle adapter.
//
// Codex stores the native session as rollout JSONL under
// ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl. This adapter is the small
// harness-specific edge: it locates that native file, projects Codex message
// rows into the transcript shape SLEEP/GRAZE already read, then delegates to
// the existing organs.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

const CIRCADIAN_HOME = process.env.CIRCADIAN_HOME || join(homedir(), "circadian");
const BUN_BIN = process.env.CIRCADIAN_BUN_BIN || join(homedir(), ".bun/bin/bun");
const CODEX_SESSIONS = process.env.CIRCADIAN_CODEX_SESSIONS || join(homedir(), ".codex", "sessions");

const TEXT_BLOCK_TYPES = new Set(["input_text", "output_text", "text"]);

type HookEvent = Record<string, unknown>;

type Organ = "wake" | "graze" | "sleep";

function readStdinText(): Promise<string> {
  return new Promise((resolve) => {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (buf += chunk));
    process.stdin.on("end", () => resolve(buf));
  });
}

function parseEvent(raw: string): HookEvent {
  if (!raw.trim()) return {};
  try {
    const event = JSON.parse(raw);
    return event && typeof event === "object" ? event : {};
  } catch {
    return {};
  }
}

function stringField(obj: HookEvent, names: string[]): string | undefined {
  for (const name of names) {
    const value = obj[name];
    if (typeof value === "string" && value) return value;
  }
}

function sessionIdOf(event: HookEvent): string | undefined {
  return stringField(event, ["session_id", "sessionId", "thread_id", "threadId", "conversation_id", "conversationId"]);
}

function eventNameOf(event: HookEvent): string | undefined {
  return stringField(event, ["hook_event_name", "hook_event", "event", "event_name", "name"]);
}

function organFromArg(argv: string[]): Organ | undefined {
  for (const arg of argv) {
    if (arg === "wake" || arg === "--wake") return "wake";
    if (arg === "graze" || arg === "--graze") return "graze";
    if (arg === "sleep" || arg === "--sleep") return "sleep";
  }
}

function organFromEvent(event: HookEvent): Organ | undefined {
  const name = eventNameOf(event)?.toLowerCase().replace(/[^a-z]/g, "") || "";
  if (!name) return;
  if (name.includes("sessionstart") || name === "start") return "wake";
  if (name.includes("sessionend") || name.includes("sessionstop") || name.includes("sessionshutdown") || name === "stop") return "sleep";
  if (name.includes("posttool") || name.includes("tool") || name.includes("userprompt") || name.includes("turnend")) return "graze";
}

function childEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { ...process.env, CIRCADIAN_HOME, CIRCADIAN_BUN_BIN: BUN_BIN, ...extra };
}

function runScript(script: string, args: string[], input: string, envExtra: Record<string, string> = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(BUN_BIN, ["run", join(CIRCADIAN_HOME, "src", script), ...args], {
      cwd: CIRCADIAN_HOME,
      env: childEnv(envExtra),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr?.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", (error) => resolve({ code: 1, stdout, stderr: `${stderr}${error.message}\n` }));
    child.on("close", (code) => resolve({ code: code ?? 0, stdout, stderr }));
    child.stdin?.on("error", () => {});
    child.stdin?.end(input);
  });
}

function rolloutFiles(root = CODEX_SESSIONS): string[] {
  const files: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 4) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry);
      let st;
      try {
        st = statSync(path);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(path, depth + 1);
      else if (st.isFile() && entry.startsWith("rollout-") && entry.endsWith(".jsonl")) files.push(path);
    }
  };
  walk(root, 0);
  return files;
}

export function findCodexTranscript(sessionId?: string, root = CODEX_SESSIONS): string | null {
  const files = rolloutFiles(root);
  if (sessionId) {
    const match = files.find((path) => basename(path).includes(sessionId));
    if (match) return match;
  }
  let latest: { path: string; mtimeMs: number } | null = null;
  for (const path of files) {
    try {
      const mtimeMs = statSync(path).mtimeMs;
      if (!latest || mtimeMs > latest.mtimeMs) latest = { path, mtimeMs };
    } catch {
      // Ignore disappearing live transcripts.
    }
  }
  return latest?.path ?? null;
}

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block && typeof block === "object" && TEXT_BLOCK_TYPES.has(String((block as any).type)) && typeof (block as any).text === "string")
    .map((block) => (block as any).text)
    .join("\n")
    .trim();
}

export function normalizeCodexTranscript(codexTranscriptPath: string, outDir = join(CIRCADIAN_HOME, "logs", "codex-transcripts")): { path: string; sessionId?: string; cwd?: string; turns: number } {
  const lines = readFileSync(codexTranscriptPath, "utf8").split("\n").filter(Boolean);
  let sessionId: string | undefined;
  let cwd: string | undefined;
  const out: string[] = [];

  for (const line of lines) {
    let entry: any;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    if (entry?.type === "session_meta") {
      sessionId ||= typeof entry.payload?.session_id === "string" ? entry.payload.session_id : undefined;
      cwd ||= typeof entry.payload?.cwd === "string" ? entry.payload.cwd : undefined;
      continue;
    }

    const payload = entry?.type === "response_item" ? entry.payload : entry;
    const role = payload?.role;
    if (payload?.type !== "message" || (role !== "user" && role !== "assistant")) continue;

    const text = textFromContent(payload.content);
    if (!text) continue;
    out.push(JSON.stringify({ message: { role, content: [{ type: "text", text }] } }));
  }

  mkdirSync(outDir, { recursive: true });
  const id = sessionId || basename(codexTranscriptPath).replace(/^rollout-/, "").replace(/\.jsonl$/, "");
  const outPath = join(outDir, `${id}.jsonl`);
  writeFileSync(outPath, out.length ? `${out.join("\n")}\n` : "");
  return { path: outPath, sessionId, cwd, turns: out.length };
}

function resolveCodexTranscript(event: HookEvent): string | null {
  const direct = stringField(event, ["transcript_path", "transcriptPath", "codex_transcript_path", "codexTranscriptPath"]);
  if (direct) {
    const path = resolve(process.cwd(), direct);
    if (existsSync(path)) return path;
  }
  return findCodexTranscript(sessionIdOf(event));
}

async function runWake(event: HookEvent): Promise<void> {
  const payload = JSON.stringify({ ...event, hook_event_name: "SessionStart", session_id: sessionIdOf(event), cwd: stringField(event, ["cwd"]) || process.cwd() });
  const result = await runScript("wake.ts", [], payload);
  if (!result.stdout) return;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: result.stdout } }) + "\n");
}

async function runGraze(event: HookEvent): Promise<void> {
  const transcript = resolveCodexTranscript(event);
  if (!transcript) return;
  const normalized = normalizeCodexTranscript(transcript);
  if (!normalized.turns) return;
  const sessionId = sessionIdOf(event) || normalized.sessionId || basename(normalized.path, ".jsonl");
  await runScript("graze.ts", [], JSON.stringify({ ...event, harness: "codex", session_id: sessionId, transcript_path: normalized.path, cwd: normalized.cwd || process.cwd() }));
}

async function runSleep(event: HookEvent): Promise<void> {
  const transcript = resolveCodexTranscript(event);
  if (!transcript) return;
  const normalized = normalizeCodexTranscript(transcript);
  if (!normalized.turns) return;
  const sessionId = sessionIdOf(event) || normalized.sessionId || basename(normalized.path, ".jsonl");
  await runScript("sleep.ts", [], JSON.stringify({ ...event, harness: "codex", session_id: sessionId, transcript_path: normalized.path, cwd: normalized.cwd || process.cwd() }));
}

export async function runCodexAdapter(raw: string, argv = process.argv.slice(2)): Promise<void> {
  const event = parseEvent(raw);
  const organ = organFromArg(argv) || organFromEvent(event);
  if (organ === "wake") return runWake(event);
  if (organ === "graze") return runGraze(event);
  if (organ === "sleep") return runSleep(event);
}

if (import.meta.main) {
  runCodexAdapter(await readStdinText()).catch((error) => {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(1);
  });
}
