#!/usr/bin/env bun
/** Backfill historical sessions through SLEEP's existing episode drafter.
 * No extraction or recurrence happens here: REM sees each episode once. */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { normalizeTurnText } from "./transcript-format.ts";
import { correlation, degraded, ok, idle } from "./obs.ts";

export type Source = "claude" | "pi";
export function transcriptId(path: string, source: Source): string {
  // Pi header has a UUID; Claude's sessionId is present on message rows.
  // Filename/path fallback scopes ids from unrelated project directories.
  let id = "";
  try {
    for (const line of readFileSync(path, "utf8").split("\n").slice(0, 20)) {
      try {
        const row = JSON.parse(line);
        id = source === "pi" ? (row.type === "session" ? row.id : "") : row.sessionId;
        if (typeof id === "string" && id) break;
      } catch { /* partial row */ }
    }
  } catch { /* missing transcript: skip upstream */ }
  return createHash("sha256").update(`${source}\0${id || path}`).digest("hex").slice(0, 24);
}

export function hasConversation(path: string): boolean {
  try {
    let user = false, assistant = false;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      try {
        const row = JSON.parse(line);
        const role = row.message?.role ?? row.role;
        const content = row.message?.content ?? row.content;
        const blocks = Array.isArray(content) ? content : [{ type: "text", text: content }];
        if (!blocks.some((b: any) => b?.type === "text" && typeof b.text === "string" && normalizeTurnText(b.text).trim())) continue;
        if (role === "user") user = true;
        if (role === "assistant") assistant = true;
      } catch { /* partial row */ }
    }
    return user && assistant;
  } catch { return false; }
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : e.isFile() && e.name.endsWith(".jsonl") ? [p] : [];
  });
}

export function runBackfill(args: string[], opts: {
  home?: string; claudeDir?: string; piDir?: string; bun?: string; sleep?: string;
} = {}): { written: number; skipped: number; failed: number } {
  const home = opts.home ?? process.env.CIRCADIAN_HOME ?? join(homedir(), "circadian");
  const mind = join(home, "mind");
  const corr = correlation("backfill");
  const value = (name: string) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
  const source = value("--source");
  if (source && source !== "claude" && source !== "pi") throw new Error("--source must be claude or pi");
  const since = value("--since");
  if (args.includes("--since") && (!since || !/^\d{4}-\d\d-\d\d$/.test(since) || Number.isNaN(Date.parse(since)))) throw new Error("--since requires YYYY-MM-DD");
  const manifest = join(home, "logs", "backfill.jsonl");
  const done = new Set<string>();
  if (existsSync(manifest)) for (const line of readFileSync(manifest, "utf8").split("\n")) {
    try { const r = JSON.parse(line); if (r.status === "ok" && typeof r.id === "string") done.add(r.id); } catch { /* partial line */ }
  }
  const sources: [Source, string][] = [
    ["claude", opts.claudeDir ?? join(homedir(), ".claude", "projects")],
    ["pi", opts.piDir ?? join(homedir(), ".pi", "agent", "sessions")],
  ];
  let written = 0, skipped = 0, failed = 0;
  for (const [kind, dir] of sources) {
    if (source && kind !== source) continue;
    for (const path of walk(dir).sort()) {
      if (kind === "claude" && /^agent-/.test(basename(path))) continue;
      if (since && statSync(path).mtimeMs < Date.parse(since)) continue;
      if (!hasConversation(path)) { skipped++; continue; }
      const id = `backfill-${kind}-${transcriptId(path, kind)}`;
      // Reconcile a crash between SLEEP publishing and manifest append, including
      // episodes created by an earlier invocation of this command.
      const present = existsSync(join(mind, "episodes")) && readdirSync(join(mind, "episodes")).some((f) => f.endsWith(`${id}.md`));
      if (done.has(id) || present) { skipped++; continue; }
      const result = spawnSync(opts.bun ?? process.execPath, [opts.sleep ?? join(home, "src", "sleep.ts"), "--worker"], {
        env: { ...process.env, CIRCADIAN_HOME: home, CIRCADIAN_SLEEP_EVENT: JSON.stringify({ session_id: id, transcript_path: path }) },
        encoding: "utf8", timeout: 8 * 60 * 1000,
      });
      const produced = result.status === 0 && existsSync(join(mind, "episodes")) &&
        readdirSync(join(mind, "episodes")).some((f) => f.endsWith(`${id}.md`));
      if (produced) { written++; done.add(id); } else failed++;
      mkdirSync(join(home, "logs"), { recursive: true });
      appendFileSync(manifest, JSON.stringify({ id, source: kind, status: produced ? "ok" : "no-episode", ts: new Date().toISOString() }) + "\n");
      if (!produced) degraded({ process: "backfill", phase: "transcript", correlation_id: corr,
        summary: "SLEEP produced no episode", context: { id, source: kind }, cause: result.error?.message || result.stderr?.trim() || `SLEEP exited ${result.status} without an episode`,
        next_action: "inspect sleep.log and retry backfill" });
    }
  }
  (failed ? degraded : written ? ok : idle)({ process: "backfill", phase: "summary", correlation_id: corr,
    summary: `${written} written, ${skipped} skipped, ${failed} failed`, context: { written, skipped, failed },
    ...(failed ? { cause: "one or more drafts failed", next_action: "retry backfill after checking sleep.log" } : {}) });
  return { written, skipped, failed };
}

if (import.meta.main) {
  try {
    const result = runBackfill(process.argv.slice(2));
    console.log(`backfill: ${result.written} written, ${result.skipped} skipped, ${result.failed} failed`);
    if (result.failed) process.exitCode = 1;
  } catch (e) { console.error((e as Error).message); process.exitCode = 1; }
}
