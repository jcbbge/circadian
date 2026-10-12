#!/usr/bin/env bun
/** On-demand, local MCP stdio read door. No model calls or network listener.
 * One JSON-RPC message per line (MCP stdio framing); stdout is protocol-only.
 * Change requests are durable suggestions under logs/change-requests, NEVER
 * publication intents (recoverPublications would publish those automatically).
 * Only the stacker may decide whether to promote a suggestion into an atom.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { loadIndex, queryIndex } from "./relindex.ts";
import { dig } from "./dig.ts";
import { hotLimit } from "./strata.ts";
import { collectEpisodes, matchEpisodes, parseQuery, selfLinesForDate, taughtLine, compostEntriesFor } from "./zoom.ts";
import { statusSnapshot } from "./status.ts";
import { recallScope } from "./scopes.ts";
import { ok, idle, degraded, correlation } from "./obs.ts";
import { readExtensions, requireViews } from "./extensions.ts";

const tools = [
  { name: "memory_search", description: "Search provenance-pinned mind evidence; depth >= 0 includes deeper and below-floor atoms via dig (0 searches all atoms).", inputSchema: { type: "object", properties: { query: { type: "string" }, k: { type: "integer", minimum: 1, maximum: 50 }, depth: { type: "integer", minimum: 0 } }, required: ["query"], additionalProperties: false } },
  { name: "memory_read", description: "Read a belief or episode by its search result id, or drill to an episode by date/slug (including composted episodes).", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false } },
  { name: "memory_history", description: "Trace episode provenance, including composted git history, SELF citations and taught lines.", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false } },
  { name: "memory_recall", description: "Full-resolution read of a named scope (same path as wake and CLI).", inputSchema: { type: "object", properties: { scope: { type: "string" }, since: { type: "string" }, depth: { type: "string" } }, required: ["scope"], additionalProperties: false } },
  { name: "memory_status", description: "Read the mind vitals from circadian status.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "memory_request_change", description: "Suggest a change to the stacker. Records an intent only; never edits or publishes an atom.", inputSchema: { type: "object", properties: { change: { type: "string", description: "Proposed change and why" }, source: { type: "string", description: "Optional provenance for the stacker to verify" } }, required: ["change"], additionalProperties: false } },
] as const;

const viewOptions = { chars: { type: "integer", minimum: 0, maximum: 128000 }, scanCap: { type: "integer", minimum: 0, maximum: 10000 } };
const viewTools = [
  { name: "memory_view", description: "Optional scoped, whole-atom view with a serialized character budget, omission counts and revision-pinned expansion references. Reads current files only.", inputSchema: { type: "object", properties: { scope: { type: "string", pattern: "^[a-z0-9][a-z0-9_-]*$", maxLength: 80 }, ...viewOptions, maxRecords: { type: "integer", minimum: 0, maximum: 100 } }, required: ["scope"], additionalProperties: false } },
  { name: "memory_expand", description: "Expand references from memory_view after checking fresh eligibility and observed file revisions; returns explicit changed/ineligible/unavailable statuses without substituting other content.", inputSchema: { type: "object", properties: { refs: { type: "array", minItems: 1, maxItems: 10000, items: { type: "object", properties: { id: { type: "string", pattern: "^[a-f0-9]{12}$" }, revision: { type: "string", pattern: "^[a-f0-9]{64}$" } }, required: ["id", "revision"], additionalProperties: false } }, ...viewOptions }, required: ["refs"], additionalProperties: false } },
] as const;

type Args = Record<string, unknown>;
function text(a: Args, key: string, max = 4096): string {
  const v = a[key];
  if (typeof v !== "string" || !v.trim() || v.length > max) throw new Error(`${key} must be a nonempty string of at most ${max} characters`);
  return v.trim();
}
function count(v: unknown, fallback: number, max: number): number {
  if (v === undefined) return fallback;
  if (!Number.isSafeInteger(v) || (v as number) < 0 || (v as number) > max) throw new Error(`expected integer between 0 and ${max}`);
  return v as number;
}
function safeId(id: string): boolean {
  return /^(?:episodes|beliefs)\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.md$/.test(id) && !id.includes("..");
}

/** Tool dispatcher exported for deterministic tests; server calls it without a write-capable publication path. */
export async function callTool(home: string, name: string, args: Args): Promise<unknown> {
  const mind = path.join(home, "mind");
  const optional = viewTools.some(t => t.name === name);
  if (optional) requireViews(home);
  else if (!tools.some(t => t.name === name)) throw new Error(`unknown tool: ${name}`);
  if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("arguments must be an object");
  const allowed: Record<string, string[]> = { memory_search: ["query", "k", "depth"], memory_read: ["id"], memory_history: ["query"], memory_status: [], memory_recall: ["scope", "since", "depth"], memory_request_change: ["change", "source"], memory_view: ["scope", "chars", "maxRecords", "scanCap"], memory_expand: ["refs", "chars", "scanCap"] };
  if (Object.keys(args).some(k => !allowed[name].includes(k))) throw new Error("unknown argument");
  if (optional) {
    const { memoryView, memoryExpand } = await import("./views.ts");
    const options = { chars: count(args.chars, name === "memory_view" ? 6000 : 32000, 128000), scanCap: count(args.scanCap, name === "memory_view" ? 500 : 12, 10000) };
    if (name === "memory_view") return memoryView(mind, text(args, "scope", 80), { ...options, maxRecords: count(args.maxRecords, 12, 100) });
    if (!Array.isArray(args.refs) || !args.refs.length || args.refs.length > 10000 || args.refs.some(ref => !ref || typeof ref !== "object" || Array.isArray(ref) || Object.keys(ref).some(key => !["id", "revision"].includes(key)) || typeof ref.id !== "string" || !/^[a-f0-9]{12}$/.test(ref.id) || typeof ref.revision !== "string" || !/^[a-f0-9]{64}$/.test(ref.revision))) throw new Error("refs must contain 1 to 10000 objects with only a 12-hex id and 64-hex revision");
    return memoryExpand(mind, args.refs, options);
  }
  if (name === "memory_search") {
    const query = text(args, "query");
    const k = count(args.k, 5, 50);
    if (k === 0) throw new Error("k must be positive");
    if (args.depth !== undefined) {
      const depth = count(args.depth, 0, Number.MAX_SAFE_INTEGER);
      // Dig's numeric mode lists atoms by depth; text mode finds below-hot and
      // below-floor atoms. For a text query with depth, filter the full atom
      // population at/after that stratum, then rank using dig's BM25 scores.
      const [all, deep] = await Promise.all([dig(mind, query, -1), dig(mind, String(depth))]);
      const eligible = new Set(deep.map(h => h.atom.id));
      return all.filter(h => eligible.has(h.atom.id)).slice(0, k).map(h => ({
        id: `beliefs/${h.atom.id}.md`, kind: "belief", source: `${h.atom.id}.md`, date: h.stratum.lastStackDate,
        score: h.score, snippet: h.atom.claim, depth: h.stratum.depth,
        provenance: { episode: h.stratum.lastStack, quotes: h.atom.quotes.map(q => q.source) },
      }));
    }
    const loaded = loadIndex(mind);
    if (!loaded) throw new Error("index unavailable; run bun src/relindex.ts --reindex");
    return queryIndex(loaded.index, query, { k }); // deterministic, no remote embedding
  }
  if (name === "memory_status") return statusSnapshot(mind);
  if (name === "memory_recall") {
    const scope = text(args, "scope", 80);
    const since = args.since === undefined ? 0 : /^\d+d$/.test(text(args, "since")) ? Date.now() - parseInt(args.since as string) * 86400000 : NaN;
    if (!Number.isFinite(since) || (args.depth !== undefined && args.depth !== "deep")) throw new Error("invalid recall options");
    return recallScope(mind, scope, { sinceMs: since, deep: args.depth === "deep" });
  }
  if (name === "memory_request_change") {
    const change = text(args, "change");
    const source = args.source === undefined ? undefined : text(args, "source", 1024);
    const id = randomUUID();
    const dir = path.join(home, "logs", "change-requests");
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const file = path.join(dir, `${id}.json`);
    const fd = fs.openSync(file, "wx", 0o600);
    try { fs.writeSync(fd, JSON.stringify({ id, change, source, ts: new Date().toISOString(), state: "pending-stacker-review" }) + "\n"); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    return { id, state: "pending-stacker-review" };
  }
  const id = name === "memory_read" ? text(args, "id", 256) : text(args, "query", 256);
  if (name === "memory_read" && safeId(id)) {
    const p = path.join(mind, id);
    if (fs.existsSync(p)) {
      if (!fs.realpathSync(p).startsWith(fs.realpathSync(mind) + path.sep)) throw new Error("memory id escapes mind");
      return { id, content: fs.readFileSync(p, "utf8"), provenance: id };
    }
  }
  if ((id.startsWith("beliefs/") || id.startsWith("episodes/")) && !safeId(id)) throw new Error("invalid memory id");
  if (name === "memory_read" && id.startsWith("beliefs/")) return [];
  // Zoom handles deleted episodes via git; a belief id can be opened through
  // its stamped episode(s), with the immutable belief file returned by read.
  const query = id.startsWith("episodes/") ? id.slice("episodes/".length) : id;
  const records = collectEpisodes(mind);
  let matches = id.startsWith("episodes/") && safeId(id)
    ? records.filter(r => r.filename === query)
    : matchEpisodes(records, parseQuery(query));
  if (id.startsWith("beliefs/") && safeId(id) && name === "memory_history") {
    const file = path.join(mind, id);
    if (!fs.existsSync(file)) return [];
    const stamps = [...fs.readFileSync(file, "utf8").matchAll(/\[ep:(\d{4}-\d{2}-\d{2})\]/g)].map(m => m[1]);
    matches = records.filter(r => stamps.some(date => r.filename.startsWith(`${date}-`)));
  }
  const self = fs.existsSync(path.join(mind, "SELF.md")) ? fs.readFileSync(path.join(mind, "SELF.md"), "utf8") : "";
  const compost = fs.existsSync(path.join(mind, "compost.md")) ? fs.readFileSync(path.join(mind, "compost.md"), "utf8") : "";
  return matches.slice(0, 50).map(r => ({
    id: `episodes/${r.filename}`, composted: r.composted, deletingCommit: r.deletingCommit ?? null,
    ...(name === "memory_read" ? { content: r.content } : {
      taught: taughtLine(r.content), compost: compostEntriesFor(compost, r.filename),
      citations: selfLinesForDate(self, r.filename.slice(0, 10)),
    }),
  }));
}

interface Request { jsonrpc?: string; id?: string | number | null; method?: string; params?: any }
/** A single MCP JSON-RPC envelope. Notifications get no response. */
export async function handle(home: string, request: Request): Promise<object | null> {
  if (!request || request.jsonrpc !== "2.0" || typeof request.method !== "string") return { jsonrpc: "2.0", id: request?.id ?? null, error: { code: -32600, message: "Invalid Request" } };
  if (request.id === undefined) return null;
  const id = request.id;
  try {
    let result: unknown;
    if (request.method === "initialize") result = { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "circadian", version: "0.1.0" } };
    else if (request.method === "ping") result = {};
    else if (request.method === "tools/list") result = { tools: readExtensions(home).views ? [...tools, ...viewTools] : tools };
    else if (request.method === "tools/call") {
      const name = request.params?.name;
      const start = performance.now();
      try {
        const data = await callTool(home, name, request.params?.arguments ?? {});
        const optional = viewTools.some(t => t.name === name);
        const view = optional ? data as { kind: string; reason?: string; coverage?: { complete: boolean; inspected: number; included: number; omitted: number; unresolved: number }; complete?: boolean; inspected?: number; entries?: { status: string; sources?: { status: string }[] }[] } : undefined;
        const rejected = !!view && !["view", "expansion"].includes(view.kind);
        const partial = view?.coverage?.complete === false || view?.complete === false || view?.entries?.some(entry => entry.status !== "available" || entry.sources?.some(source => source.status !== "available"));
        const count = Array.isArray(data) ? data.length : 1;
        const counts = view?.coverage ? view.coverage : view?.entries ? { inspected: view.inspected, entries: view.entries.length, available: view.entries.filter(entry => entry.status === "available").length } : {};
        const event = { process: "ops" as const, phase: `mcp-${name}`, correlation_id: correlation("serve"), summary: rejected ? "optional memory request rejected" : partial ? "optional memory request returned partial coverage" : `${name} returned ${count} result(s)`, context: { count, ...counts, ...(partial ? { complete: false } : {}), ms: Math.round(performance.now() - start) } };
        if (rejected) degraded({ ...event, cause: view?.reason || "invalid request", next_action: "check extension status and tool arguments" });
        else if (count === 0) idle(event); else ok(event);
        result = { ...(rejected ? { isError: true } : {}), content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (e) {
        degraded({ process: "ops", phase: "mcp-tool", summary: "tool request failed", context: { name }, cause: (e as Error).message, next_action: "check tool arguments and mind index, then retry" });
        result = { isError: true, content: [{ type: "text", text: (e as Error).message }] };
      }
    } else throw new Error("Method not found");
    return { jsonrpc: "2.0", id, result };
  } catch (e) { return { jsonrpc: "2.0", id, error: { code: -32601, message: (e as Error).message } }; }
}

if (import.meta.main) {
  const home = process.env.CIRCADIAN_HOME || path.join(homedir(), "circadian");
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    try {
      const response = await handle(home, JSON.parse(line));
      if (response) process.stdout.write(JSON.stringify(response) + "\n");
    } catch (e) {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }) + "\n");
      degraded({ process: "ops", phase: "mcp-parse", summary: "invalid JSON-RPC input", cause: (e as Error).message, next_action: "send one JSON object per line" });
    }
  }
}
