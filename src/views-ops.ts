/** Operator receipts. Reads memory only on explicit check; no inference or lifecycle run. */
import * as fs from "node:fs";
import * as path from "node:path";
import { readExtensions } from "./extensions.ts";
import { memoryView, memoryExpand } from "./views.ts";

type RequestReceipt = { at: string; operation: string; surface: string; outcome: string };
export function viewsStatus(home: string) {
  let lastRequest: RequestReceipt | null = null;
  let activityError: string | undefined;
  let fd: number | undefined;
  try {
    fd = fs.openSync(path.join(home, "logs", "circadian.events.jsonl"), "r");
    const length = fs.fstatSync(fd).size;
    const start = Math.max(0, length - 65536);
    const buffer = Buffer.alloc(length - start);
    const read = fs.readSync(fd, buffer, 0, buffer.length, start);
    const lines = buffer.subarray(0, read).toString("utf8").split("\n");
    if (start) lines.shift(); // never parse a partial first event
    for (const line of lines.reverse()) {
      let event; try { event = JSON.parse(line); } catch { continue; }
      const match = typeof event?.phase === "string" && /^(cli|mcp|pi)-(?:memory_)?(view|expand)$/.exec(event.phase);
      if (!match || typeof event.ts !== "string" || typeof event.outcome !== "string") continue;
      lastRequest = { at: event.ts, operation: match[2], surface: match[1], outcome: event.outcome };
      break;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") activityError = "Activity log could not be read.";
  } finally { if (fd !== undefined) fs.closeSync(fd); }
  return { ...readExtensions(home), configFile: path.join(home, "extensions.json"), lastRequest,
    activityWindow: "last 64 KiB of the event log", ...(activityError ? { activityError } : {}) };
}

export type ViewsCheck = {
  check: "PASS" | "INCOMPLETE" | "FAIL" | "OFF";
  detail: string;
  checks?: Record<string, boolean>;
  coverage?: { inspected: number; total: number; included: number; omitted: number; unresolved: number; complete: boolean };
  sourceCount?: number;
};

export function checkViews(home: string): ViewsCheck {
  const state = readExtensions(home);
  if (state.error) return { check: "FAIL", detail: state.error };
  if (!state.views) return { check: "OFF", detail: "Views are disabled. Enable with: circadian extensions enable views" };
  const mind = path.join(home, "mind");
  // Check the actual installed reader with a generous bounded budget. No fixtures
  // enter the real mind; an empty population cannot prove expansion works.
  const view = memoryView(mind, "global", { chars: 128000, maxRecords: 1, scanCap: 10000 });
  if (view.kind !== "view") return { check: "FAIL", detail: view.reason };
  const coverage = view.coverage;
  if (!view.records.length) return { check: "INCOMPLETE", detail: "Reader ran, but no eligible global memory fit. Expansion was not exercised; project-only or new minds may legitimately have none.", coverage };
  const expansion = memoryExpand(mind, [view.records[0].ref], { chars: 128000 });
  if (expansion.kind !== "expansion") return { check: "FAIL", detail: expansion.reason, coverage };
  const entry = expansion.entries[0];
  if (!entry || entry.status !== "available") return { check: "INCOMPLETE", detail: `Expansion returned ${entry?.status ?? "no receipt"}; no successful evidence read is claimed.`, coverage };
  const checks: Record<string, boolean> = {
    viewWithinBudget: JSON.stringify(view).length <= 128000,
    expansionWithinBudget: JSON.stringify(expansion).length <= 128000,
    atomMatchesFile: false,
    sourcesMatchFiles: false,
  };
  try {
    checks.atomMatchesFile = entry.content === fs.readFileSync(path.join(mind, "beliefs", `${entry.ref.id}.md`), "utf8");
    const available = entry.sources.filter(source => source.status === "available");
    checks.sourcesMatchFiles = available.length === entry.sources.length && available.length > 0 &&
      available.every(source => !!source.content?.trim() && source.content === fs.readFileSync(path.join(mind, "episodes", source.source), "utf8"));
  } catch { /* changing/missing files make this check incomplete, never a pass */ }
  const passed = Object.values(checks).every(Boolean);
  return { check: passed ? "PASS" : "INCOMPLETE", detail: passed
    ? "Live view and expansion work; whole atom and source text match current files. No memory was written and no model was called."
    : "A selected source is empty, unavailable or changed during the check. No complete evidence match is claimed.",
    checks, coverage, sourceCount: entry.sources.length };
}
