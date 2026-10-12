/** Optional, read-only views over current atoms. No inference, index, or historical recovery. */
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { foldBeliefs, parseAtom, type Atom, type LedgerEvent } from "./atoms.ts";
import { episodeScope } from "./scopes.ts";

export type ViewRef = { id: string; revision: string };
export type ViewOptions = { chars?: number; maxRecords?: number; scanCap?: number };
export type ViewError = { kind: "invalid-input" | "invalid-budget" | "unavailable"; reason: string };
type Source = { source: string; status: "available"; revision: string } |
  { source: string; status: "unavailable"; reason: string };
type ExpandedSource = Source & { content?: string };
export type ViewRecord = {
  ref: ViewRef; atom: Atom; weight: number; sources: Source[];
  disagreements: { edge: string; other: string }[];
};
export type MemoryView = {
  kind: "view"; scope: string; records: ViewRecord[];
  coverage: { inspected: number; total: number; eligible: number; included: number; omitted: number; unresolved: number; complete: boolean };
};
type ExpansionEntry = { ref: ViewRef; status: "available"; record: ViewRecord; content: string; sources: ExpandedSource[] } |
  { ref: ViewRef; status: "ineligible" | "changed-revision" | "unavailable" | "over-budget" };
export type MemoryExpansion = { kind: "expansion"; entries: ExpansionEntry[]; inspected: number; complete: boolean };

/** Fixed I/O ceilings also apply when callers raise selection limits. */
export const VIEW_IO_LIMITS = { atomBytes: 64 * 1024, sourceBytes: 256 * 1024, ledgerBytes: 8 * 1024 * 1024,
  requestBytes: 16 * 1024 * 1024, sourcesPerAtom: 32 } as const;
const ID = /^[a-f0-9]{12}$/;
const REVISION = /^[a-f0-9]{64}$/;
const SCOPE = /^[a-z0-9][a-z0-9_-]*$/;
const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const size = (value: unknown) => JSON.stringify(value).length;
const invalid = (reason: string): ViewError => ({ kind: "invalid-input", reason });
const budgetError = (minimum: number): ViewError => ({ kind: "invalid-budget", reason: `Coverage requires at least ${minimum} characters` });
const bounded = (value: unknown, max: number) => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= max;
const eligible = (status: string | undefined) => status === "active" || status === "pinned";

type ReadResult = { content: string; revision: string } | { reason: string };

/** Opens only regular files below real directories in the supplied mind, never symlinks. */
class Reader {
  readonly root: string;
  private remaining = VIEW_IO_LIMITS.requestBytes;
  private sources = new Map<string, ReadResult>();
  constructor(mind: string) { this.root = fs.realpathSync(mind); }
  location(relative: string): string {
    const parts = relative.split("/");
    if (parts.some(part => !part || part === "." || part === ".." || part.includes("\\") || part.includes("\0"))) throw new Error("unsafe-path");
    let location = this.root;
    for (const part of parts.slice(0, -1)) {
      location = path.join(location, part);
      if (!fs.lstatSync(location).isDirectory()) throw new Error("unsafe-path");
    }
    return path.join(location, parts.at(-1)!);
  }
  files(): string[] {
    const location = this.location("beliefs/.entry");
    return fs.readdirSync(path.dirname(location)).filter(file => file.endsWith(".md"));
  }
  read(relative: string, limit: number): ReadResult {
    let fd: number | undefined;
    try {
      const location = this.location(relative);
      const named = fs.lstatSync(location);
      if (named.isSymbolicLink()) return { reason: "unsafe-path" };
      if (!named.isFile()) return { reason: "not-regular-file" };
      fd = fs.openSync(location, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
      const before = fs.fstatSync(fd);
      if (!before.isFile()) return { reason: "not-regular-file" };
      if (before.size > limit) return { reason: "oversized" };
      if (before.size > this.remaining) return { reason: "read-limit" };
      // A fixed-length read prevents a growing file from bypassing either byte ceiling.
      const bytes = Buffer.alloc(before.size);
      let read = 0;
      while (read < bytes.length) {
        const n = fs.readSync(fd, bytes, read, bytes.length - read, read);
        if (!n) break;
        read += n;
      }
      this.remaining -= read;
      const after = fs.fstatSync(fd);
      if (read !== bytes.length || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs)
        return { reason: "changed-during-read" };
      const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return { content, revision: hash(bytes) };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      return { reason: code === "ENOENT" ? "missing" : code === "ELOOP" || (error as Error).message === "unsafe-path" ? "unsafe-path" : "unreadable" };
    } finally { if (fd !== undefined) fs.closeSync(fd); }
  }
  source(name: string): ReadResult {
    if (!/^[^/\\\0]+\.md$/.test(name) || name === "..md") return { reason: "unsafe-path" };
    let value = this.sources.get(name);
    if (!value) { value = this.read(`episodes/${name}`, VIEW_IO_LIMITS.sourceBytes); this.sources.set(name, value); }
    return value;
  }
}

type Context = { reader: Reader; folded: ReturnType<typeof foldBeliefs> };
function context(mind: string): Context | ViewError {
  try {
    const reader = new Reader(mind);
    const ledger = reader.read("beliefs.jsonl", VIEW_IO_LIMITS.ledgerBytes);
    if ("reason" in ledger) return { kind: "unavailable", reason: `Cannot establish current eligibility: ledger ${ledger.reason}` };
    // Same malformed-line tolerance as readLedger, with bounded/no-symlink I/O.
    const events: LedgerEvent[] = [];
    for (const line of ledger.content.split("\n")) {
      try { const event = JSON.parse(line); if (event && typeof event === "object" && !Array.isArray(event)) events.push(event); } catch { /* malformed ledger line */ }
    }
    const folded = foldBeliefs(events);
    if ([...folded.states.values()].some(state => !Number.isFinite(state.weight) || state.weight < 0))
      return { kind: "unavailable", reason: "Cannot establish eligibility from invalid ledger weights" };
    return { reader, folded };
  } catch { return { kind: "unavailable", reason: "Cannot read current mind or fold its ledger" }; }
}

type Observed = { record: ViewRecord; content: string; expandedSources: ExpandedSource[]; scopes: string[]; missingSource: boolean };
function observe(ctx: Context, id: string): Observed | undefined {
  const read = ctx.reader.read(`beliefs/${id}.md`, VIEW_IO_LIMITS.atomBytes);
  if ("reason" in read) return;
  let atom: Atom;
  try { atom = parseAtom(read.content); } catch { return; }
  if (atom.id !== id || typeof atom.claim !== "string" || typeof atom.why !== "string" || atom.quotes.some(q => typeof q.text !== "string")) return;
  const names = [...new Set(atom.quotes.map(quote => quote.source))].sort();
  if (names.length > VIEW_IO_LIMITS.sourcesPerAtom) return;
  const sources: Source[] = [], expandedSources: ExpandedSource[] = [], scopes: string[] = [];
  for (const source of names) {
    const read = ctx.reader.source(source);
    if ("reason" in read) {
      const entry = { source, status: "unavailable" as const, reason: read.reason };
      sources.push(entry); expandedSources.push(entry);
    } else {
      const entry = { source, status: "available" as const, revision: read.revision };
      sources.push(entry); expandedSources.push({ ...entry, content: read.content }); scopes.push(episodeScope(read.content));
    }
  }
  const disagreements = [...ctx.folded.contradictions.values()].filter(edge => edge.a === id || edge.b === id)
    .map(edge => ({ edge: edge.edge, other: edge.a === id ? edge.b : edge.a })).sort((a, b) => a.edge.localeCompare(b.edge));
  const revision = hash(JSON.stringify({ atom: read.revision, sources, disagreements }));
  const record = { ref: { id, revision }, atom, weight: ctx.folded.states.get(id)!.weight, sources, disagreements };
  return { record, content: read.content, expandedSources, scopes, missingSource: sources.some(source => source.status === "unavailable") };
}

/** Scope selection and source observations precede record/budget selection. All records remain whole. */
export function memoryView(mind: string, scope: string, options: ViewOptions = {}): MemoryView | ViewError {
  if (!options || typeof options !== "object" || Array.isArray(options)) return invalid("Invalid view options");
  const chars = options.chars ?? 6000, maxRecords = options.maxRecords ?? 12, scanCap = options.scanCap ?? 500;
  if (typeof scope !== "string" || !SCOPE.test(scope) || scope.length > 128 || !bounded(chars, 128000) || !bounded(maxRecords, 100) || !bounded(scanCap, 10000))
    return invalid("Use a valid scope and bounded integer chars, maxRecords, and scanCap");
  const ctx = context(mind);
  if ("kind" in ctx) return ctx;
  let files: string[];
  try { files = ctx.reader.files(); } catch { return { kind: "unavailable", reason: "Cannot list the current beliefs directory safely" }; }
  files.sort((a, b) => (ctx.folded.states.get(b.slice(0, -3))?.weight ?? 0) - (ctx.folded.states.get(a.slice(0, -3))?.weight ?? 0) || a.localeCompare(b));
  const inspected = Math.min(files.length, scanCap), matched: ViewRecord[] = [];
  let unresolved = files.length - inspected;
  for (const file of files.slice(0, inspected)) {
    const id = file.slice(0, -3);
    if (!ID.test(id)) { unresolved++; continue; }
    if (!eligible(ctx.folded.states.get(id)?.status)) continue;
    const value = observe(ctx, id);
    if (!value) { unresolved++; continue; }
    const matches = value.record.atom.scope !== undefined ? value.record.atom.scope === scope : value.scopes.includes(scope);
    if (matches) matched.push(value.record);
    else if (!value.record.atom.scope && value.missingSource) unresolved++;
  }
  const result: MemoryView = { kind: "view", scope, records: [], coverage: {
    inspected, total: files.length, eligible: matched.length, included: 0, omitted: matched.length, unresolved, complete: false,
  } };
  // Reserve fixed upper-bound count widths so a larger budget never displaces an earlier record.
  const reserved = { ...result, coverage: { ...result.coverage, included: matched.length, omitted: matched.length } };
  let used = size(reserved);
  if (used > chars) return budgetError(used);
  for (const record of matched) {
    if (result.records.length >= maxRecords) break;
    const extra = size(record) + (result.records.length ? 1 : 0);
    if (used + extra > chars) break;
    used += extra; result.records.push(record);
  }
  result.coverage.included = result.records.length;
  result.coverage.omitted = matched.length - result.records.length;
  result.coverage.complete = unresolved === 0 && result.coverage.omitted === 0;
  return result;
}

/** Expand only the exact observed revision while it remains eligible in the freshly folded ledger. */
export function memoryExpand(mind: string, refs: readonly ViewRef[], options: { chars?: number; scanCap?: number } = {}): MemoryExpansion | ViewError {
  if (!options || typeof options !== "object" || Array.isArray(options)) return invalid("Invalid expansion options");
  const chars = options.chars ?? 32000, scanCap = options.scanCap ?? 12;
  if (!Array.isArray(refs) || refs.length > 10000 || refs.some(ref => !ref || typeof ref.id !== "string" || typeof ref.revision !== "string" || !ID.test(ref.id) || !REVISION.test(ref.revision)) || !bounded(chars, 128000) || !bounded(scanCap, 10000))
    return invalid("Use bounded integer chars/scanCap and references containing a 12-hex id and 64-hex revision");
  const result: MemoryExpansion = { kind: "expansion", entries: [], inspected: 0, complete: false };
  const inspectedLimit = Math.min(refs.length, scanCap);
  const reserved = { ...result, inspected: inspectedLimit };
  if (size(reserved) > chars) return budgetError(size(reserved));
  const ctx = context(mind);
  if ("kind" in ctx) return ctx;
  for (const ref of refs.slice(0, inspectedLimit)) {
    result.inspected++;
    const state = ctx.folded.states.get(ref.id);
    let entry: ExpansionEntry;
    if (!state) entry = { ref, status: "unavailable" };
    else if (!eligible(state.status)) entry = { ref, status: "ineligible" };
    else {
      const observed = observe(ctx, ref.id);
      if (!observed) entry = { ref, status: "unavailable" };
      else if (observed.record.ref.revision !== ref.revision) entry = { ref, status: "changed-revision" };
      else entry = { ref, status: "available", record: observed.record, content: observed.content, sources: observed.expandedSources };
    }
    const fits = (entry: ExpansionEntry) => size({ ...reserved, entries: [...result.entries, entry] }) <= chars;
    if (!fits(entry) && entry.status === "available") entry = { ref, status: "over-budget" };
    if (!fits(entry)) break;
    result.entries.push(entry);
  }
  result.complete = result.entries.length === refs.length;
  return result;
}
