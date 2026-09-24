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
import { ok, idle, degraded, correlation } from "./obs.ts";

const tools = [
  { name: "memory_search", description: "Search provenance-pinned mind evidence; depth >= 0 includes deeper and below-floor atoms via dig (0 searches all atoms).", inputSchema: { type: "object", properties: { query: { type: "string" }, k: { type: "integer", minimum: 1, maximum: 50 }, depth: { type: "integer", minimum: 0 } }, required: ["query"], additionalProperties: false } },
  { name: "memory_read", description: "Read a belief or episode by its search result id, or drill to an episode by date/slug (including composted episodes).", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false } },
  { name: "memory_history", description: "Trace episode provenance, including composted git history, SELF citations and taught lines.", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false } },
  { name: "memory_status", description: "Read the mind vitals from circadian status.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "memory_request_change", description: "Suggest a change to the stacker. Records an intent only; never edits or publishes an atom.", inputSchema: { type: "object", properties: { change: { type: "string", description: "Proposed change and why" }, source: { type: "string", description: "Optional provenance for the stacker to verify" } }, required: ["change"], additionalProperties: false } },
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
  if (!tools.some(t => t.name === name)) throw new Error(`unknown tool: ${name}`);
  if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("arguments must be an object");
  const allowed: Record<string, string[]> = { memory_search: ["query", "k", "depth"], memory_read: ["id"], memory_history: ["query"], memory_status: [], memory_request_change: ["change", "source"] };
  if (Object.keys(args).some(k => !allowed[name].includes(k))) throw new Error("unknown argument");
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
    if (fs.existsSync(p)) return { id, content: fs.readFileSync(p, "utf8"), provenance: id };
  }
  if ((id.startsWith("beliefs/") || id.startsWith("episodes/")) && !safeId(id)) throw new Error("invalid memory id");
  if (name === "memory_read" && id.startsWith("beliefs/")) return [];
  // Zoom handles deleted episodes via git; a belief id can be opened through
  // its stamped episode(s), with the immutable belief file returned by read.
  const query = id.startsWith("episodes/") ? id.slice("episodes/".length) : id;
  const records = collectEpisodes(mind);
  let matches = matchEpisodes(records, parseQuery(query));
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
    else if (request.method === "tools/list") result = { tools };
    else if (request.method === "tools/call") {
      const name = request.params?.name;
      const start = performance.now();
      try {
        const data = await callTool(home, name, request.params?.arguments ?? {});
        const count = Array.isArray(data) ? data.length : 1;
        const event = { process: "ops" as const, phase: `mcp-${name}`, correlation_id: correlation("serve"), summary: `${name} returned ${count} result(s)`, context: { count, ms: Math.round(performance.now() - start) } };
        if (count === 0) idle(event); else ok(event);
        result = { content: [{ type: "text", text: JSON.stringify(data) }] };
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
