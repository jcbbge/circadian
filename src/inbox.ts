// Optional supplemental input. No I/O at import time; memory never depends on it.
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hookLayout, HOOK_OUTPUT_LIMIT, WAKE_PARTS } from "./wake-payload.ts";

export const INBOX_UNAVAILABLE = "[Circadian] Inbox unavailable.";
export const CHECKPOINT_UNAVAILABLE = "[Circadian] Inbox checkpoint unavailable; shown notes may repeat.";
const RESERVE = 128;
export type Cursor = { v: 1; url: string; offset: string; delivered: string[] };
type Note = { id: string; text: string; createdAt: string; source: "mac" };
export type InboxDelivery = { attempt: string; url: string; candidates: { cursor: Cursor; parts: number[] }[] };
export type InboxRead = { notice: string; reason: string; duration: number; cursor?: Cursor; notes?: Note[]; hashes?: string[]; next?: string; caughtUp?: boolean; rebase?: Cursor };
const root = (home: string) => join(home, "logs", "inbox");
const hash = (n: Note) => createHash("sha256").update(JSON.stringify([n.id, n.text, n.createdAt, n.source])).digest("hex");
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validNote(n: any): n is Note {
  return n && Object.keys(n).length === 4 && typeof n.id === "string" && uuid.test(n.id) &&
    typeof n.text === "string" && n.text.length > 0 && Buffer.byteLength(n.text, "utf8") <= 16384 &&
    typeof n.createdAt === "string" && Number.isFinite(Date.parse(n.createdAt)) && new Date(n.createdAt).toISOString() === n.createdAt && n.source === "mac";
}
function privateDir(path: string): void { mkdirSync(path, { recursive: true, mode: 0o700 }); chmodSync(path, 0o700); }
function atomic(path: string, value: unknown): void {
  privateDir(join(path, ".."));
  const tmp = `${path}.${randomUUID()}.tmp`;
  try { writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 }); renameSync(tmp, path); }
  finally { try { unlinkSync(tmp); } catch {} }
}
function prune(home: string): void {
  const dir = join(root(home), "receipts");
  let names: string[];
  try { names = readdirSync(dir); } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return; throw e; }
  for (const name of names) {
    if (Date.now() - statSync(join(dir, name)).mtimeMs > 86400000) rmSync(join(dir, name), { recursive: true, force: true });
  }
}
export async function readInbox(home: string, env = process.env): Promise<InboxRead> {
  const started = performance.now();
  if (env.MW_WORKER === "1" || env.CIRCADIAN_INTERNAL === "1" || env.CIRCADIAN_INBOX_SKIP === "1") return { notice: "", reason: "disabled", duration: 0 };
  if (!env.CIRCADIAN_INBOX_URL) return { notice: "", reason: "disabled", duration: 0 };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let complete = false;
  let reason = "configuration";
  try {
    const url = new URL(env.CIRCADIAN_INBOX_URL);
    if (url.protocol !== "http:" || !["127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password || url.search || url.hash) throw new Error();
    reason = "state";
    prune(home);
    let cursor: Cursor = { v: 1, url: url.href, offset: "-1", delivered: [] };
    try {
      const saved = JSON.parse(readFileSync(join(root(home), "state.json"), "utf8"));
      if (saved.v !== 1 || saved.url !== url.href || typeof saved.offset !== "string" || !saved.offset || !Array.isArray(saved.delivered) || !saved.delivered.every((h: unknown) => typeof h === "string" && /^[a-f0-9]{64}$/.test(h))) throw new Error();
      cursor = saved;
    } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
    reason = "request";
    controller = new AbortController();
    const deadline = performance.now() + 1000;
    timer = setTimeout(() => controller!.abort(), 1000);
    url.searchParams.set("offset", cursor.offset);
    const response = await fetch(url, { signal: controller.signal, redirect: "error" });
    if (!response.ok || response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new Error();
    const next = response.headers.get("stream-next-offset");
    if (!next?.trim()) throw new Error();
    reader = response.body?.getReader();
    if (!reader) throw new Error();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const chunk = await reader.read();
      if (performance.now() >= deadline) throw new Error();
      if (chunk.done) { complete = true; break; }
      chunks.push(chunk.value);
    }
    reason = "response";
    const notes = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!Array.isArray(notes) || !notes.every(validNote)) throw new Error();
    const hashes = notes.map(hash);
    const prefix = cursor.delivered;
    if (prefix.slice(0, hashes.length).some((h, i) => hashes[i] !== h)) throw new Error();
    const caughtUp = response.headers.get("stream-up-to-date")?.toLowerCase() === "true";
    if (prefix.length > hashes.length) {
      if (!hashes.length) throw new Error();
      return { notice: "", reason: "rebase", duration: performance.now() - started, cursor, notes: [], hashes: [], next, caughtUp: false, rebase: { ...cursor, offset: next, delivered: prefix.slice(hashes.length) } };
    }
    return { notice: "", reason: "read", duration: performance.now() - started, cursor, notes: notes.slice(prefix.length), hashes: hashes.slice(prefix.length), next, caughtUp };
  } catch {
    return { notice: INBOX_UNAVAILABLE, reason, duration: performance.now() - started };
  } finally {
    if (timer) clearTimeout(timer);
    if (!complete) { controller?.abort(); try { await reader?.cancel(); } catch {} }
    reader?.releaseLock();
  }
}
function render(note: Note): string {
  return `[Circadian] Dictation data\nId: ${note.id}\nTimestamp: ${note.createdAt}\n${note.text}\n\n`;
}
function backlog(read: InboxRead, count: number): string {
  const remaining = (read.notes?.length ?? 0) - count;
  return read.caughtUp ? (remaining ? `[Circadian] ${remaining} notes waiting.\n\n` : "") :
    remaining ? `[Circadian] ${remaining}+ notes waiting; more remain beyond this response.\n\n` : "[Circadian] More notes waiting; count unavailable from this response.\n\n";
}
export function prepareInbox(read: InboxRead, memory: string, spool?: string, memoryFirst = false): { payload: string; outputs: string[]; delivery?: InboxDelivery } {
  const format = (payload: string) => spool ? hookLayout(payload, spool, [], RESERVE).outputs : [payload];
  if (!read.cursor) {
    const payload = !read.notice ? memory : memoryFirst ? memory + "\n\n" + read.notice : read.notice + "\n\n" + memory;
    return { payload, outputs: read.notice ? format(payload) : spool ? hookLayout(payload, spool).outputs : [payload] };
  }
  const notes = read.notes ?? [];
  let selected = Math.min(20, notes.length);
  let payload = "";
  let layout: ReturnType<typeof hookLayout> | undefined;
  let ranges: { start: number; end: number }[] = [];
  for (;;) {
    let block = memoryFirst ? memory + "\n\n" : "";
    ranges = notes.slice(0, selected).map(n => { const start = block.length; block += render(n); return { start, end: block.length }; });
    payload = block + backlog(read, selected) + (memoryFirst ? "" : memory);
    layout = spool ? hookLayout(payload, spool, ranges, RESERVE) : undefined;
    const fits = memoryFirst ? Buffer.byteLength(payload) + 1 + RESERVE <= HOOK_OUTPUT_LIMIT :
      !layout || layout.ranges.every(parts => parts.every(p => p < WAKE_PARTS)) && layout.outputs.slice(0, WAKE_PARTS - 1).every(o => Buffer.byteLength(o) + 1 + RESERVE <= HOOK_OUTPUT_LIMIT);
    if (fits || selected === 0) break;
    selected--;
  }
  const candidates: InboxDelivery["candidates"] = [];
  for (let i = 0; i < selected; i++) {
    const all = i + 1 === notes.length;
    candidates.push({ cursor: { ...read.cursor, offset: all ? read.next! : read.cursor.offset, delivered: all ? [] : [...read.cursor.delivered, ...read.hashes!.slice(0, i + 1)] },
      parts: Array.from({ length: Math.max(...(layout?.ranges[i] ?? [1])) }, (_, j) => j + 1) });
  }
  if (!notes.length) candidates.push({ cursor: read.rebase ?? { ...read.cursor, offset: read.next!, delivered: [] }, parts: [1] });
  return { payload, outputs: layout?.outputs ?? [payload], delivery: { attempt: randomUUID(), url: read.cursor.url, candidates } };
}
export function acknowledgeInbox(home: string, delivery: InboxDelivery, part: number): void {
  if (!uuid.test(delivery.attempt)) throw new Error("invalid inbox attempt");
  privateDir(root(home));
  privateDir(join(root(home), "receipts"));
  const dir = join(root(home), "receipts", delivery.attempt);
  atomic(join(dir, `${part}.json`), { part });
  const receipts = new Set(readdirSync(dir));
  let cursor: Cursor | undefined;
  for (const candidate of delivery.candidates) {
    if (!candidate.parts.every(p => receipts.has(`${p}.json`))) break;
    cursor = candidate.cursor;
  }
  if (cursor) atomic(join(root(home), "state.json"), cursor);
}
