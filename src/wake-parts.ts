// wake-parts.ts — the spool that hands a Claude Code wake's later parts to
// its `wake.ts --part k` hook slots (circ-29).
//
// Claude Code caps each hook output at HOOK_OUTPUT_LIMIT characters (see
// wake-payload.ts for the source), so a wake larger than that is delivered as
// ordered parts, one per SessionStart hook slot. The slots run in parallel.
// Part 1 (`wake.ts`) is the only one that composes the payload — it alone
// reads the scoreboard it then appends to — and it writes every part here
// once; parts 2..n only read. One composition, so the parts can never
// disagree about where a cut fell. File I/O only (Law 7: no network).

import { mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** `scope` is the scope this wake resolved (the SessionStart notice names
 * it); spools written before it existed carry none, and readers accept that. */
export type Spool = { written_at: number; outputs: string[]; scope?: string };

// A reader accepts only a spool written by this wake's part 1: the
// SessionStart slots start together, so one written well before the reader
// started belongs to an earlier wake of the same session (resume, compact).
export const SPOOL_SKEW_MS = 10_000;

export function spoolDir(circadianHome: string): string {
  return join(circadianHome, "logs", "wake-parts");
}

/** One spool file per Claude Code session id (sanitized to a file name). */
export function spoolPath(circadianHome: string, sessionId: string): string {
  const name = sessionId.replace(/[^A-Za-z0-9_-]/g, "_") || "unknown-session";
  return join(spoolDir(circadianHome), `${name}.json`);
}

/** Atomic write (tmp + rename): a reading slot sees the whole spool or none. */
export function writeSpool(path: string, outputs: string[], nowMs = Date.now(), scope?: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify({ written_at: nowMs, outputs, ...(scope ? { scope } : {}) } satisfies Spool));
  renameSync(tmp, path);
}

/** The spool at `path` if it was written at or after `notBeforeMs`, else
 * null. A same-session spool from an earlier wake (resume, compact) is older
 * than this wake's slots and must not be served as this wake. */
export function readFreshSpool(path: string, notBeforeMs: number): Spool | null {
  try {
    const spool = JSON.parse(readFileSync(path, "utf8")) as Spool;
    if (typeof spool.written_at !== "number" || !Array.isArray(spool.outputs)) return null;
    return spool.written_at >= notBeforeMs ? spool : null;
  } catch {
    return null;
  }
}

/** Wait (bounded) for part 1 to publish this wake's spool. */
export async function waitForSpool(path: string, notBeforeMs: number, timeoutMs: number, pollMs = 25): Promise<Spool | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const spool = readFreshSpool(path, notBeforeMs);
    if (spool || Date.now() >= deadline) return spool;
    await Bun.sleep(pollMs);
  }
}

/** Remove spool files older than `maxAgeMs` (they have been served). */
export function pruneSpool(dir: string, maxAgeMs: number, nowMs = Date.now()): void {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    const p = join(dir, name);
    try {
      if (nowMs - statSync(p).mtimeMs > maxAgeMs) unlinkSync(p);
    } catch {
      // a concurrent prune or write — never fatal
    }
  }
}

/** What hook slot k prints: its own part, except the last slot, which also
 * carries any parts beyond WAKE_PARTS (over its cap, so Claude Code saves it
 * to a file — announced by wake's degraded event, never silent). */
export function outputForSlot(outputs: string[], k: number, slots: number): string {
  return k < slots ? outputs[k - 1] ?? "" : outputs.slice(k - 1).join("\n");
}
