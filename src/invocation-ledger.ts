/**
 * invocation-ledger.ts — WHO INVOKED ME, every single time.
 *
 * Built 2026-08-23 because the question "what is spawning all these circadian
 * processes" could not be answered from any existing log. Every log we had
 * recorded what a process DID; none recorded who STARTED it. So a fan-out of
 * ~1,400 invocations/hour had no identifiable source.
 *
 * This module answers exactly one question and does nothing else: for every
 * entry into a circadian executable, append one JSONL line naming the FULL
 * ANCESTRY of the process — pid/ppid walked up to launchd — plus the hook
 * event, session, argv, and mode.
 *
 * Contract:
 *   - Append-only JSONL at CIRCADIAN_HOME/logs/invocations.jsonl.
 *   - NEVER throws. An instrument that can break the thing it measures is
 *     worse than no instrument. Every failure path swallows.
 *   - Cheap: one `ps` call, bounded to 12 ancestors. Hook mode must stay <10ms
 *     so this must not become the load it is measuring.
 *   - Off switch: CIRCADIAN_INVOCATION_LEDGER=off.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";

const CIRCADIAN_HOME = process.env.CIRCADIAN_HOME || join(homedir(), "circadian");
const LEDGER_PATH = join(CIRCADIAN_HOME, "logs", "invocations.jsonl");
const MAX_ANCESTORS = 12;

export interface Ancestor {
  pid: number;
  ppid: number;
  comm: string;
}

/** Walk the process tree upward from `startPid` to launchd (pid 1).
 *
 * ONE `ps` invocation for the whole table, then an in-memory walk — a `ps` per
 * generation would make the instrument cost more than the thing it measures. */
export function ancestry(startPid: number = process.pid): Ancestor[] {
  const out: Ancestor[] = [];
  try {
    const raw = execFileSync("/bin/ps", ["-Ao", "pid=,ppid=,comm="], {
      encoding: "utf8",
      timeout: 2000,
      maxBuffer: 8 * 1024 * 1024,
    });
    const table = new Map<number, { ppid: number; comm: string }>();
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
      if (!m) continue;
      table.set(Number(m[1]), { ppid: Number(m[2]), comm: m[3].trim() });
    }
    let cur = startPid;
    for (let i = 0; i < MAX_ANCESTORS; i++) {
      const row = table.get(cur);
      if (!row) break;
      out.push({ pid: cur, ppid: row.ppid, comm: row.comm });
      if (row.ppid <= 1) break;
      cur = row.ppid;
    }
  } catch {
    // instrument failure is never the caller's problem
  }
  return out;
}

/** The nearest ancestor that is not bun/node/sh — i.e. the actual invoker.
 *
 * This is the field that answers "who is doing this to me". A chain of
 * bun -> bun -> claude reads as "claude", which is the useful answer. */
export function attributedTo(chain: Ancestor[]): string {
  const noise = /(^|\/)(bun|node|sh|zsh|bash|env|ps|login)$/;
  for (const a of chain.slice(1)) {
    const base = a.comm.split("/").pop() || a.comm;
    if (!noise.test(base)) return base;
  }
  return chain.length > 1 ? chain[chain.length - 1].comm : "unknown";
}

export interface InvocationEntry {
  /** which executable: "graze" | "sleep" | "wake" | "rem-popmem" | "status" */
  script: string;
  /** "hook" | "worker" | "cli" | "launchd" */
  mode?: string;
  /** hook event name if the caller knows it (PostToolUse, SessionEnd, ...) */
  hook_event?: string;
  session_id?: string;
  /** anything the caller wants pinned to this invocation */
  context?: Record<string, unknown>;
}

/** Record one invocation. Returns the ancestry it logged (or [] if disabled),
 * so a caller can reuse it without a second `ps`. */
export function logInvocation(entry: InvocationEntry): Ancestor[] {
  if (process.env.CIRCADIAN_INVOCATION_LEDGER === "off") return [];
  try {
    const chain = ancestry();
    const line = {
      ts: new Date().toISOString(),
      script: entry.script,
      mode: entry.mode ?? (process.argv.includes("--worker") ? "worker" : "hook"),
      hook_event: entry.hook_event ?? process.env.CLAUDE_HOOK_EVENT ?? null,
      session_id: entry.session_id ?? null,
      pid: process.pid,
      ppid: chain[0]?.ppid ?? null,
      // THE ANSWER: who actually started this, skipping interpreter noise
      attributed_to: attributedTo(chain),
      // the full receipt, so nobody has to trust attributed_to
      chain: chain.map((a) => `${a.pid}:${a.comm}`),
      argv: process.argv.slice(1),
      cwd: process.cwd(),
      ppid_env: {
        // hook runners often identify themselves in the environment
        term_program: process.env.TERM_PROGRAM ?? null,
        claude_session: process.env.CLAUDE_SESSION_ID ?? null,
      },
      ...(entry.context ? { context: entry.context } : {}),
    };
    mkdirSync(join(CIRCADIAN_HOME, "logs"), { recursive: true });
    appendFileSync(LEDGER_PATH, JSON.stringify(line) + "\n");
    return chain;
  } catch {
    return [];
  }
}
