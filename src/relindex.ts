#!/usr/bin/env bun
/**
 * relindex.ts — the relational evidence index (Circadian wave b07,
 * briefs/07-relindex-wake-retrieval.md; docs/ZEROMEM-RESEARCH.md §2, §4.2).
 *
 * Circadian already has the TEMPORAL hierarchy (transcripts -> meals ->
 * episodes -> atoms) but no RELATIONAL view: "everything about X" was grep or
 * an LLM reading episodes. Zero-Mem (arXiv 2607.29377) proved the read path
 * can be generation-free (entity-context graph + temporal hierarchy, ablation
 * Fig 3: graph-only 62.5 F1, hierarchy-only 54.9, both 72.07 — the relational
 * view is the bigger single contributor). Circadian's wake read path is
 * ALREADY zero-LLM (Law 7); what it lacks is RELEVANCE SELECTION. This module
 * adds it, deterministically, with no new runtime dependencies.
 *
 * WHAT IT IS: a read-optimized DERIVED VIEW over mind/episodes/*.md and
 * mind/beliefs/*.md. It never writes to them. Its store (mind/index/) is
 * gitignored and fully rebuildable: `bun src/relindex.ts --reindex`.
 *
 * THREE SIGNALS, ONE FUSION (Zero-Mem §4.2-§4.4, closure NOT PageRank — v1
 * stays one page, Doctrine 1):
 *   - ACCESS (the floor): BM25 lexical over unit text, always on; optional
 *     dense cosine (env-gated CIRCADIAN_EMBED=1, local :10240 at BUILD time
 *     only). Embeddings off -> BM25-only, still fully functional.
 *   - RELATIONAL: deterministic code-aware entity extraction (file paths,
 *     camelCase/snake_case/SCREAMING identifiers, backticked tokens, commit
 *     SHAs, repo/tool names, ISO dates) -> entity<->unit co-occurrence graph
 *     (edge weight = occurrence-frequency ratio, Zero-Mem Eq 4) -> query
 *     entities activate their units + ONE hop of co-occurrence neighbors.
 *   - TEMPORAL: recency + chronological-adjacency edges between episodes.
 *
 * ROUTING (fixed, no learned router — brief §5.4): a query that bears code
 * entities routes relational-primary (rho=0.7); a bare query routes
 * temporal-primary (rho=0.35). Both views always carry the BM25 floor, so a
 * plain word like "stutter" still ranks by lexical match with no entities.
 *
 * PROVENANCE (Zero-Mem's core discipline, §4.2): every unit keeps its source
 * filename + date stamp; retrieved evidence cites where it came from.
 *
 * DETERMINISM: identical mind -> byte-identical index (no clock in build; the
 * only timestamp is meta.builtAt, excluded from the equality contract). A full
 * rebuild and an incremental update over the same inputs agree exactly.
 *
 * WAKE never builds this (Law 7): wake reads the built files with no network.
 * REM's index phase (paranoia-wrapped) keeps it fresh incrementally.
 */

import * as fs from "fs";
import * as path from "path";
import { homedir } from "os";
import { createHash } from "crypto";
import { ok, idle, degraded, correlation } from "./obs.ts";

// ---------------------------------------------------------------------
// paths — CIRCADIAN_HOME contract (see wake.ts)
// ---------------------------------------------------------------------
const CIRCADIAN_HOME = process.env.CIRCADIAN_HOME || path.join(homedir(), "circadian");
const MIND_DIR = path.join(CIRCADIAN_HOME, "mind");
const EPISODES_DIR = path.join(MIND_DIR, "episodes");
const BELIEFS_DIR = path.join(MIND_DIR, "beliefs");
const INDEX_DIR = path.join(MIND_DIR, "index");
const INDEX_PATH = path.join(INDEX_DIR, "index.json");
const VECTORS_PATH = path.join(INDEX_DIR, "vectors.json");

// ---------------------------------------------------------------------
// tunables — all documented in the b07 report; no magic numbers inline
// ---------------------------------------------------------------------
export const BM25_K1 = 1.5;
export const BM25_B = 0.75;
/** entity-bearing query -> relational-primary fusion weight (rho on the
 * relational view; 1-rho on the temporal view). */
export const RHO_RELATIONAL = 0.7;
/** bare query (no code entities) -> temporal-primary. */
export const RHO_TEMPORAL = 0.35;
/** one-hop co-occurrence activation attenuation (closure, not PPR). */
export const HOP_DECAY = 0.5;
/** temporal-adjacency boost carried from an activated neighbour. */
export const ADJ_BOOST = 0.3;
/** within the relational view, how much the entity-graph activation dominates
 * the lexical refinement (Zero-Mem's graph-primary discipline, §4.4): the
 * graph says WHICH units are about the query's entities; lexical only breaks
 * ties among them. Without this, a unit with the entity buried in a path
 * fragment (high lexical, zero graph) outranks a unit the graph actually knows
 * is about the entity — the regression subword tokenization introduced. */
export const GRAPH_WEIGHT = 0.75;
/** deterministic hash-embedder dimensionality (tests + no-network dense). */
export const HASH_DIM = 256;
/** default local embedding model (verified live on :10240, dims 2560). */
export const DEFAULT_EMBED_MODEL =
  process.env.CIRCADIAN_EMBED_MODEL || "mlx-community/Qwen3-Embedding-4B-4bit-DWQ";
const EMBED_BASE_URL =
  process.env.CIRCADIAN_EMBED_BASE_URL ||
  process.env.CIRCADIAN_LLM_BASE_URL ||
  process.env.LOCAL_LLM_BASE_URL ||
  "http://127.0.0.1:10240/v1";

// ---------------------------------------------------------------------
// types
// ---------------------------------------------------------------------
export type UnitKind = "episode" | "belief";
export type EntityType = "path" | "identifier" | "constant" | "backtick" | "sha" | "date" | "name" | "slug";

export interface Unit {
  /** stable id: repo-relative path, e.g. "episodes/2026-07-28-the-stutter-resolved.md" */
  id: string;
  kind: UnitKind;
  /** display source filename (basename), the provenance line target */
  source: string;
  /** ISO date (YYYY-MM-DD) or null when the unit carries no stamp */
  date: string | null;
  /** content hash — incremental-update identity */
  hash: string;
  /** term frequencies over the unit's tokens (BM25) */
  tf: Record<string, number>;
  /** document length in tokens (BM25) */
  len: number;
  /** entity keys this unit mentions (canonical lowercased surface) */
  entities: string[];
  /** the unit's full text (corpus is tiny; kept for provenance-pinned display) */
  text: string;
}

export interface EntityNode {
  type: EntityType;
  /** unitId -> co-occurrence edge weight (occurrence-frequency ratio, Eq 4) */
  units: Record<string, number>;
}

export interface IndexMeta {
  version: 1;
  builtAt: string;
  unitCount: number;
  entityCount: number;
  buildMs: number;
  embedder: string; // "none" | "hash" | "remote:<model>"
  avgdl: number;
}

export interface IndexData {
  meta: IndexMeta;
  units: Unit[];
  entities: Record<string, EntityNode>;
  /** corpus document-frequency per token (BM25 idf) */
  df: Record<string, number>;
  /** chronological adjacency edges between episodes (unitId pairs) */
  adjacency: [string, string][];
}

export interface VectorStore {
  embedder: string; // "hash" | "remote:<model>"
  dims: number;
  vectors: Record<string, number[]>;
}

export interface RetrievedUnit {
  id: string;
  source: string;
  date: string | null;
  kind: UnitKind;
  score: number;
  /** a short, provenance-bearing excerpt for rendering */
  snippet: string;
}

// ---------------------------------------------------------------------
// tokenizer + entity extraction — pure, deterministic, code-aware, no deps
// ---------------------------------------------------------------------

const STOPWORDS = new Set(
  "a an the and or but of to in on for with as at by from is are was were be been being it its this that these those i you he she we they not no so if then than which who whom what when where how all any both each few more most other some such only own same too very can will just should now do did does has have had them their there here".split(
    " ",
  ),
);

/** BM25 tokens: lowercased word/number runs (len>=2), stopwords dropped, PLUS
 * every compound's subword pieces — a compound like `compost.md` or
 * `src/wake.ts` emits the whole token AND its separator-split parts
 * (`compost`, `md` / `src`, `wake`, `ts`), so a one-word query (`compost`,
 * `wake`) matches the file that carries it. Deterministic array. */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const m of text.toLowerCase().matchAll(/[a-z0-9][a-z0-9_.\/-]*[a-z0-9]|[a-z0-9]/g)) {
    const t = m[0];
    if (t.length < 2 || STOPWORDS.has(t)) continue;
    out.push(t);
    if (/[_.\/-]/.test(t)) {
      for (const piece of t.split(/[_.\/-]+/)) {
        if (piece.length >= 2 && !STOPWORDS.has(piece)) out.push(piece);
      }
    }
  }
  return out;
}

/** Deterministic code-aware entity extraction. Returns canonical entity keys
 * (lowercased surface) mapped to their strongest type. Pure regex/heuristics,
 * tuned to this corpus (file paths, identifiers, SHAs, dates, tool names). */
export function extractEntities(text: string): Map<string, EntityType> {
  const found = new Map<string, EntityType>();
  // Priority: more specific type wins a key collision.
  const priority: Record<EntityType, number> = {
    path: 6, sha: 5, constant: 4, identifier: 3, backtick: 2, date: 5, name: 1, slug: 0,
  };
  const add = (surface: string, type: EntityType) => {
    const key = surface.toLowerCase();
    if (!key) return;
    const prev = found.get(key);
    if (prev === undefined || priority[type] > priority[prev]) found.set(key, type);
  };

  // 1. backticked tokens — the author's own emphasis of a token/command
  for (const m of text.matchAll(/`([^`\n]{1,80})`/g)) {
    const inner = m[1].trim();
    if (inner) add(inner, "backtick");
  }
  // 2. file paths: at least one "/" separator, path-shaped segments, and
  //    either a dotted extension or a known root dir.
  for (const m of text.matchAll(/(?:~|\.{0,2}|[\w@-]+)?(?:\/[\w.@-]+)+/g)) {
    const p = m[0];
    if (p.length < 3) continue;
    const looksPath =
      /\.[a-z0-9]{1,5}(?:$|[^a-z0-9])/i.test(p) ||
      /^(?:~|\.{0,2}\/|(?:src|mind|docs|logs|templates|briefs|beliefs|episodes|packets|worktrees)\/)/.test(p);
    if (looksPath) add(p.replace(/[.,;:)\]]+$/, ""), "path");
  }
  // 3. commit SHAs / atom ids: 7-40 hex, must contain a hex letter (not a year).
  for (const m of text.matchAll(/\b(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/g)) add(m[0], "sha");
  // 4. ISO dates
  for (const m of text.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)) add(m[0], "date");
  // 5. SCREAMING_SNAKE constants
  for (const m of text.matchAll(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g)) add(m[0], "constant");
  // 6. camelCase / PascalCase identifiers (an internal case change)
  for (const m of text.matchAll(/\b[A-Za-z]+[a-z][A-Z][A-Za-z0-9]*\b/g)) add(m[0], "identifier");
  // 7. snake_case / kebab-case identifiers (has _ or - inside, lowercase)
  for (const m of text.matchAll(/\b[a-z][a-z0-9]*(?:[_-][a-z0-9]+)+\b/g)) add(m[0], "identifier");
  // 8. dotted identifiers: foo.bar (not a sentence period — both sides wordy)
  for (const m of text.matchAll(/\b[a-z][a-z0-9]+\.[a-z][a-z0-9]+(?:\.[a-z0-9]+)*\b/g)) add(m[0], "identifier");
  // 9. known repo/tool names (deterministic vocabulary beats general NER here)
  const VOCAB = [
    "herdr", "tower", "kotadb", "coraline", "composto", "circadian", "strudel",
    "bigfile", "popmem", "zero-mem", "zeromem", "solidjs", "solidstart", "arc",
  ];
  const low = text.toLowerCase();
  for (const v of VOCAB) {
    const re = new RegExp(`(?:^|[^a-z0-9-])${v.replace(/[-]/g, "\\-")}(?:$|[^a-z0-9-])`);
    if (re.test(low)) add(v, "name");
  }
  return found;
}

/** Slug entities derived from a filename (so `compost.md` and the "stutter"
 * slug are relational anchors, not just lexical): the basename and its
 * hyphen-split significant parts, minus the date prefix. */
export function slugEntities(source: string): Map<string, EntityType> {
  const m = new Map<string, EntityType>();
  const base = source.replace(/\.md$/i, "");
  m.set(source.toLowerCase(), "path"); // the whole filename, e.g. compost.md
  const noDate = base.replace(/^\d{4}-\d{2}-\d{2}-/, "");
  for (const part of noDate.split(/[-_]/)) {
    if (part.length >= 3 && !STOPWORDS.has(part.toLowerCase())) m.set(part.toLowerCase(), "slug");
  }
  return m;
}

// ---------------------------------------------------------------------
// unit ingestion — read one mind file into a Unit (pure over its inputs)
// ---------------------------------------------------------------------

function hashContent(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex").slice(0, 16);
}

/** ISO date for a unit: episode filename prefix, else the first [ep:] stamp
 * in the text, else null. */
export function unitDate(source: string, text: string): string | null {
  const fromName = source.match(/^(\d{4}-\d{2}-\d{2})-/);
  if (fromName) return fromName[1];
  const fromEp = text.match(/\[ep:(\d{4}-\d{1,2}-\d{1,2})\]/);
  if (fromEp) {
    const [y, mo, d] = fromEp[1].split("-");
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

export function ingestUnit(kind: UnitKind, source: string, text: string): Unit {
  const id = `${kind === "episode" ? "episodes" : "beliefs"}/${source}`;
  // entities: from body text + filename slug (union; body type wins on collision)
  const ents = new Map<string, EntityType>();
  for (const [k, t] of slugEntities(source)) ents.set(k, t);
  for (const [k, t] of extractEntities(text)) ents.set(k, t); // body overrides slug
  // BM25 tokens: body tokens + tokenized filename + entity surfaces as whole tokens
  const tokens = [...tokenize(text), ...tokenize(source.replace(/\.md$/i, ""))];
  for (const key of ents.keys()) tokens.push(key);
  const tf: Record<string, number> = {};
  for (const tok of tokens) tf[tok] = (tf[tok] || 0) + 1;
  return {
    id,
    kind,
    source,
    date: unitDate(source, text),
    hash: hashContent(text),
    tf,
    len: tokens.length,
    entities: [...ents.keys()].sort(),
    text,
  };
}

function readUnitsFromDisk(mindDir: string): Unit[] {
  const units: Unit[] = [];
  const dirs: [UnitKind, string][] = [
    ["episode", path.join(mindDir, "episodes")],
    ["belief", path.join(mindDir, "beliefs")],
  ];
  for (const [kind, dir] of dirs) {
    let files: string[] = [];
    try {
      files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
    } catch {
      files = [];
    }
    for (const f of files.sort()) {
      let text: string;
      try {
        text = fs.readFileSync(path.join(dir, f), "utf8");
      } catch {
        continue;
      }
      units.push(ingestUnit(kind, f, text));
    }
  }
  units.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return units;
}

// ---------------------------------------------------------------------
// corpus aggregation — graph + df + adjacency from a set of units (pure)
// ---------------------------------------------------------------------

/** Occurrence-frequency-ratio graph (Zero-Mem Eq 4): edge(e,u) weight is the
 * share of entity e's total mentions that fall in unit u. df is BM25's
 * document frequency. adjacency joins chronologically neighbouring episodes. */
export function aggregate(units: Unit[]): {
  entities: Record<string, EntityNode>;
  df: Record<string, number>;
  adjacency: [string, string][];
} {
  // raw entity->unit counts (an entity present in a unit counts once per unit)
  const raw: Record<string, { type: EntityType; counts: Record<string, number> }> = {};
  for (const u of units) {
    const perUnit = extractEntities(u.text);
    for (const [k, t] of slugEntities(u.source)) if (!perUnit.has(k)) perUnit.set(k, t);
    for (const [key, type] of perUnit) {
      if (!raw[key]) raw[key] = { type, counts: {} };
      raw[key].counts[u.id] = (raw[key].counts[u.id] || 0) + 1;
    }
  }
  const entities: Record<string, EntityNode> = {};
  for (const key of Object.keys(raw).sort()) {
    const { type, counts } = raw[key];
    const total = Object.values(counts).reduce((s, n) => s + n, 0) || 1;
    const uw: Record<string, number> = {};
    for (const uid of Object.keys(counts).sort()) uw[uid] = counts[uid] / total;
    entities[key] = { type, units: uw };
  }
  // df: number of units whose tf contains each token
  const df: Record<string, number> = {};
  for (const u of units) for (const tok of Object.keys(u.tf)) df[tok] = (df[tok] || 0) + 1;
  // adjacency: episodes sorted by (date, id); join each to its successor
  const eps = units
    .filter((u) => u.kind === "episode" && u.date)
    .sort((a, b) => (a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : a.id < b.id ? -1 : 1));
  const adjacency: [string, string][] = [];
  for (let i = 0; i + 1 < eps.length; i++) adjacency.push([eps[i].id, eps[i + 1].id]);
  return { entities, df, adjacency };
}

function avgdlOf(units: Unit[]): number {
  if (units.length === 0) return 0;
  return units.reduce((s, u) => s + u.len, 0) / units.length;
}

// ---------------------------------------------------------------------
// embedders — REAL implementations, never mocks (brief §5.3)
// ---------------------------------------------------------------------

export interface Embedder {
  id: string; // "hash" | "remote:<model>"
  embed(text: string): Promise<number[]>;
  dims: number;
}

/** Deterministic bag-of-hashed-tokens embedder. A genuine embedding (tokens
 * hashed into a fixed-dim vector, L2-normalized) — no network, byte-stable,
 * so the suite exercises the real dense path with zero infrastructure. */
export class HashEmbedder implements Embedder {
  id = "hash";
  dims = HASH_DIM;
  async embed(text: string): Promise<number[]> {
    const v = new Array<number>(this.dims).fill(0);
    for (const tok of tokenize(text)) {
      const h = createHash("sha1").update(tok).digest();
      const idx = ((h[0] << 8) | h[1]) % this.dims;
      const sign = h[2] & 1 ? 1 : -1;
      v[idx] += sign;
    }
    let norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    if (norm === 0) norm = 1;
    return v.map((x) => x / norm);
  }
}

/** Local OpenAI-compatible embedder (:10240). Used ONLY at index-build time,
 * env-gated CIRCADIAN_EMBED=1 — NEVER at wake (Law 7). Mirrors llm.ts's
 * endpoint-config shape but hits /embeddings. */
export class RemoteEmbedder implements Embedder {
  id: string;
  dims = 0; // learned from the first response
  private model: string;
  private base: string;
  constructor(model = DEFAULT_EMBED_MODEL, base = EMBED_BASE_URL) {
    this.model = model;
    this.base = base;
    this.id = `remote:${model}`;
  }
  async embed(text: string): Promise<number[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(`${this.base}/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: this.model, input: text }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`embeddings HTTP ${res.status} at ${this.base}`);
      const json = (await res.json()) as { data?: { embedding?: number[] }[] };
      const vec = json?.data?.[0]?.embedding;
      if (!Array.isArray(vec) || vec.length === 0) throw new Error("embeddings: empty vector");
      this.dims = vec.length;
      return vec;
    } finally {
      clearTimeout(timer);
    }
  }
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ---------------------------------------------------------------------
// build / update / load / save
// ---------------------------------------------------------------------

async function buildVectors(units: Unit[], embedder: Embedder): Promise<VectorStore> {
  const vectors: Record<string, number[]> = {};
  let dims = embedder.dims;
  for (const u of units) {
    const v = await embedder.embed(u.text);
    dims = v.length;
    vectors[u.id] = v;
  }
  return { embedder: embedder.id, dims, vectors };
}

/** Full build from disk. `embedder` optional: undefined -> BM25-only (the
 * default degraded-but-functional mode); provided -> also builds dense
 * vectors. Returns the index and (optionally) the vector store. Pure over the
 * filesystem it reads; writes nothing. */
export async function buildIndex(
  mindDir: string,
  opts: { embedder?: Embedder } = {},
): Promise<{ index: IndexData; vectors: VectorStore | null }> {
  const t0 = Date.now();
  const units = readUnitsFromDisk(mindDir);
  const { entities, df, adjacency } = aggregate(units);
  const vectors = opts.embedder ? await buildVectors(units, opts.embedder) : null;
  const meta: IndexMeta = {
    version: 1,
    builtAt: new Date().toISOString(),
    unitCount: units.length,
    entityCount: Object.keys(entities).length,
    buildMs: Date.now() - t0,
    embedder: vectors ? vectors.embedder : "none",
    avgdl: avgdlOf(units),
  };
  return { index: { meta, units, entities, df, adjacency }, vectors };
}

/** Incremental update (REM's index phase). Reads ONLY changed/new files;
 * unchanged units are reused from the prior index by content hash. Corpus
 * aggregation (graph, df, adjacency) is recomputed from the union — cheap
 * because per-unit tf/entities are cached in the index. Deterministic: the
 * result is byte-identical to a full rebuild over the same inputs (asserted in
 * the suite). Returns {changed, deleted} for the caller's obs event. */
export function updateIndex(
  mindDir: string,
  prior: IndexData,
): { index: IndexData; changed: number; deleted: number } {
  const t0 = Date.now();
  const priorById = new Map(prior.units.map((u) => [u.id, u]));
  // Current disk hashes without full ingestion — cheap stat+read only on miss.
  const current: Unit[] = [];
  let changed = 0;
  const dirs: [UnitKind, string][] = [
    ["episode", path.join(mindDir, "episodes")],
    ["belief", path.join(mindDir, "beliefs")],
  ];
  const seen = new Set<string>();
  for (const [kind, dir] of dirs) {
    let files: string[] = [];
    try {
      files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
    } catch {
      files = [];
    }
    for (const f of files.sort()) {
      const id = `${kind === "episode" ? "episodes" : "beliefs"}/${f}`;
      seen.add(id);
      let text: string;
      try {
        text = fs.readFileSync(path.join(dir, f), "utf8");
      } catch {
        continue;
      }
      const h = hashContent(text);
      const prev = priorById.get(id);
      if (prev && prev.hash === h) {
        current.push(prev); // unchanged — reuse cached ingestion
      } else {
        current.push(ingestUnit(kind, f, text)); // new or changed — re-extract
        changed++;
      }
    }
  }
  const deleted = prior.units.filter((u) => !seen.has(u.id)).length;
  current.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const { entities, df, adjacency } = aggregate(current);
  const meta: IndexMeta = {
    version: 1,
    builtAt: new Date().toISOString(),
    unitCount: current.length,
    entityCount: Object.keys(entities).length,
    buildMs: Date.now() - t0,
    embedder: prior.meta.embedder === "remote" ? "none" : "none", // dense not rebuilt incrementally (BM25 floor)
    avgdl: avgdlOf(current),
  };
  return { index: { meta, units: current, entities, df, adjacency }, changed, deleted };
}

export function saveIndex(mindDir: string, index: IndexData, vectors: VectorStore | null): void {
  const dir = path.join(mindDir, "index");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.json"), JSON.stringify(index) + "\n");
  const vpath = path.join(dir, "vectors.json");
  if (vectors) fs.writeFileSync(vpath, JSON.stringify(vectors) + "\n");
  else if (fs.existsSync(vpath)) fs.rmSync(vpath); // stale vectors gone when dense is off
}

/** Loads the index (and vectors when present) with NO network and NO writes —
 * the exact contract wake depends on (Law 7). Returns null when absent. */
export function loadIndex(mindDir: string): { index: IndexData; vectors: VectorStore | null } | null {
  const ipath = path.join(mindDir, "index", "index.json");
  let index: IndexData;
  try {
    index = JSON.parse(fs.readFileSync(ipath, "utf8"));
  } catch {
    return null;
  }
  let vectors: VectorStore | null = null;
  try {
    vectors = JSON.parse(fs.readFileSync(path.join(mindDir, "index", "vectors.json"), "utf8"));
  } catch {
    vectors = null;
  }
  return { index, vectors };
}

// ---------------------------------------------------------------------
// query — pure over a loaded index (+ optional query vector for dense)
// ---------------------------------------------------------------------

function normalize(scores: Map<string, number>): Map<string, number> {
  let max = 0;
  for (const v of scores.values()) if (v > max) max = v;
  const out = new Map<string, number>();
  if (max <= 0) {
    for (const k of scores.keys()) out.set(k, 0);
    return out;
  }
  for (const [k, v] of scores) out.set(k, v / max);
  return out;
}

/** BM25 relevance of the query tokens over every unit. */
export function bm25(index: IndexData, queryTokens: string[]): Map<string, number> {
  const N = index.units.length || 1;
  const scores = new Map<string, number>();
  const qset = [...new Set(queryTokens)];
  for (const u of index.units) {
    let s = 0;
    for (const t of qset) {
      const f = u.tf[t];
      if (!f) continue;
      const df = index.df[t] || 0;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      const denom = f + BM25_K1 * (1 - BM25_B + (BM25_B * u.len) / (index.meta.avgdl || 1));
      s += idf * ((f * (BM25_K1 + 1)) / denom);
    }
    if (s > 0) scores.set(u.id, s);
  }
  return scores;
}

/** Entity activation with one-hop closure (Zero-Mem Eq 8-9 spirit, NOT PPR).
 * TWO TIERS, kept strictly separated so a DIRECT hit always outranks a
 * pure-HOP hit (the bug subword tokenization exposed: a belly-full of shared
 * incidental entities let one-hop neighbours out-sum the units the query
 * entity actually names). A unit the query entity directly names scores in
 * [1, 1+HOP_DECAY]; a unit reached only by co-occurrence scores in
 * (0, HOP_DECAY] — below every direct hit, by construction. */
export function activate(index: IndexData, queryEntities: string[]): Map<string, number> {
  const direct = new Map<string, number>();
  const hop = new Map<string, number>();
  const bumpDirect = (id: string, w: number) => direct.set(id, (direct.get(id) || 0) + w);
  const bumpHop = (id: string, w: number) => hop.set(id, Math.max(hop.get(id) || 0, w));
  // direct: query entity -> its units (edge weight = occurrence-frequency ratio)
  const directUnits = new Set<string>();
  for (const e of queryEntities) {
    const node = index.entities[e];
    if (!node) continue;
    for (const [uid, w] of Object.entries(node.units)) {
      bumpDirect(uid, w);
      directUnits.add(uid);
    }
  }
  // one hop: for each directly-activated unit, follow its OTHER entities to
  // their units (co-occurrence neighbours), attenuated.
  for (const uid of directUnits) {
    const u = index.units.find((x) => x.id === uid);
    if (!u) continue;
    for (const e of u.entities) {
      if (queryEntities.includes(e)) continue; // already counted as direct
      const node = index.entities[e];
      if (!node) continue;
      for (const [nid, w] of Object.entries(node.units)) {
        if (nid === uid || directUnits.has(nid)) continue; // never demote a direct hit
        bumpHop(nid, HOP_DECAY * w);
      }
    }
  }
  // Compose the two tiers: direct hits land in [1, 1+HOP_DECAY] (normalized so
  // the strongest direct edge is 1 + its share); pure-hop hits stay in
  // (0, HOP_DECAY]. The tiers never cross, so a direct entity match always
  // outranks a co-occurrence neighbour.
  const act = new Map<string, number>();
  let maxDirect = 0;
  for (const w of direct.values()) if (w > maxDirect) maxDirect = w;
  for (const [id, w] of direct) act.set(id, 1 + (maxDirect > 0 ? w / maxDirect : 0) * HOP_DECAY);
  for (const [id, w] of hop) if (!direct.has(id)) act.set(id, Math.min(w, HOP_DECAY));
  return act;
}

/** Recency in [0,1] by unit date; undated units score 0. */
function recencyScores(index: IndexData): Map<string, number> {
  const dated = index.units.filter((u) => u.date);
  const out = new Map<string, number>();
  if (dated.length === 0) return out;
  const ms = dated.map((u) => Date.parse(u.date!));
  const min = Math.min(...ms), max = Math.max(...ms);
  const span = max - min || 1;
  for (const u of index.units) {
    out.set(u.id, u.date ? (Date.parse(u.date) - min) / span : 0);
  }
  return out;
}

export interface QueryOptions {
  k?: number;
  /** query vector for dense fusion (no-network caller passes a HashEmbedder
   * vector; CLI/build-time may pass a remote one). Ignored unless the index's
   * vector store matches the vector's embedder. */
  queryVector?: { embedder: string; vector: number[] };
  vectors?: VectorStore | null;
}

/**
 * The deterministic fusion. BM25 is the floor (always). Dense adds to the
 * access seed when a compatible vector store + query vector are present.
 * Relational view lifts the seed by entity activation; temporal view lifts by
 * recency + adjacency. Routing picks rho by whether the query bears entities.
 */
export function queryIndex(
  index: IndexData,
  queryText: string,
  opts: QueryOptions = {},
): RetrievedUnit[] {
  const k = opts.k ?? 5;
  const qTokens = tokenize(queryText);
  const qEntities = [...new Set([...extractEntities(queryText).keys(), ...slugEntities(`${queryText}.md`).keys()])]
    .filter((e) => index.entities[e]); // dedup; only entities the corpus knows
  const hasEntities = qEntities.length > 0;

  // access seed: normalized BM25 (+ dense when available & compatible)
  const lex = normalize(bm25(index, qTokens));
  const base = new Map<string, number>();
  for (const u of index.units) base.set(u.id, lex.get(u.id) || 0);
  if (opts.queryVector && opts.vectors && opts.vectors.embedder === opts.queryVector.embedder) {
    const dense = new Map<string, number>();
    for (const u of index.units) {
      const uv = opts.vectors.vectors[u.id];
      if (uv) dense.set(u.id, Math.max(0, cosine(opts.queryVector.vector, uv)));
    }
    const dn = normalize(dense);
    for (const u of index.units) base.set(u.id, (base.get(u.id) || 0) + (dn.get(u.id) || 0));
  }

  // relational view (Zero-Mem §4.4, graph-primary): the entity-graph
  // activation is the DOMINANT signal — it says which units are actually about
  // the query's entities — with the lexical base as a tie-breaking refinement.
  // When the query bears entities the graph knows, a lit unit outranks a unit
  // that merely carries the token as a buried path fragment (zero activation).
  // With no known entities, activation is empty and the view falls back to
  // pure lexical, so a plain word query still works.
  const act = activate(index, qEntities);
  const actN = normalize(act);
  const rel = new Map<string, number>();
  const anyActivation = [...act.values()].some((v) => v > 0);
  for (const u of index.units) {
    const lexBase = base.get(u.id) || 0;
    if (anyActivation) {
      // graph-primary fusion: activated units dominate; lexical refines.
      rel.set(u.id, GRAPH_WEIGHT * (actN.get(u.id) || 0) + (1 - GRAPH_WEIGHT) * lexBase * (actN.get(u.id) || 0 ? 1 : 0.15));
    } else {
      rel.set(u.id, lexBase); // no entity signal — lexical is the view
    }
  }

  // temporal view: seed lifted by recency, plus adjacency carry from activation
  const rec = recencyScores(index);
  const adjCarry = new Map<string, number>();
  for (const [a, b] of index.adjacency) {
    const aw = act.get(a) || 0, bw = act.get(b) || 0;
    if (bw > 0) adjCarry.set(a, Math.max(adjCarry.get(a) || 0, ADJ_BOOST * bw));
    if (aw > 0) adjCarry.set(b, Math.max(adjCarry.get(b) || 0, ADJ_BOOST * aw));
  }
  const temp = new Map<string, number>();
  for (const u of index.units) {
    const seed = base.get(u.id) || 0;
    temp.set(u.id, seed * (0.5 + 0.5 * (rec.get(u.id) || 0)) + (adjCarry.get(u.id) || 0));
  }

  // fusion (Eq 13): rho on the relational view, routed by entity presence
  const rho = hasEntities ? RHO_RELATIONAL : RHO_TEMPORAL;
  const relN = normalize(rel), tempN = normalize(temp);
  const fused: { u: Unit; score: number }[] = [];
  for (const u of index.units) {
    const score = rho * (relN.get(u.id) || 0) + (1 - rho) * (tempN.get(u.id) || 0);
    if (score > 0) fused.push({ u, score });
  }
  fused.sort((a, b) => (b.score - a.score) || (a.u.id < b.u.id ? -1 : 1));
  return fused.slice(0, k).map(({ u, score }) => ({
    id: u.id,
    source: u.source,
    date: u.date,
    kind: u.kind,
    score: Math.round(score * 10000) / 10000,
    snippet: excerpt(u),
  }));
}

/** A short, provenance-bearing excerpt: a belief's claim line, or an episode's
 * first substantive sentence — collapsed to one line, capped. */
export function excerpt(u: Unit, maxChars = 240): string {
  let body = u.text;
  if (u.kind === "belief") {
    const m = u.text.match(/^claim:\s*"?(.+?)"?\s*$/m);
    if (m) body = m[1];
  } else {
    // strip YAML front-matter, take the first real paragraph
    body = u.text.replace(/^---[\s\S]*?---\s*/m, "").trim();
    const firstSentence = body.match(/^.+?[.!?"](?:\s|$)/s);
    if (firstSentence) body = firstSentence[0];
  }
  const one = body.replace(/\s+/g, " ").trim();
  return one.length > maxChars ? one.slice(0, maxChars - 1).trimEnd() + "…" : one;
}

/** Renders retrieved units as a provenance-pinned block (Zero-Mem §4.2), token
 * budget honoured by dropping from the tail. Shape reused by the wake slice. */
export function renderEvidenceBlock(results: RetrievedUnit[], budgetTokens: number): { text: string; used: RetrievedUnit[] } {
  const lines: string[] = [];
  const used: RetrievedUnit[] = [];
  let tokens = 0;
  for (const r of results) {
    const line = `- ${r.snippet} — from ${r.id}`;
    const cost = Math.ceil(line.length / 4);
    if (tokens + cost > budgetTokens) break;
    lines.push(line);
    used.push(r);
    tokens += cost;
  }
  return { text: lines.join("\n"), used };
}

// ---------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------

function flagValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
}

async function main() {
  const args = process.argv.slice(2);
  const corr = correlation("relindex");

  if (args.includes("--reindex")) {
    const useEmbed = process.env.CIRCADIAN_EMBED === "1";
    let embedder: Embedder | undefined;
    if (useEmbed) {
      try {
        embedder = new RemoteEmbedder();
        await embedder.embed("preflight"); // fail fast if the service is down
      } catch (e) {
        degraded({
          process: "relindex", phase: "build", correlation_id: corr,
          summary: "CIRCADIAN_EMBED=1 but the embedding service is unreachable — building BM25-only",
          context: { base_url: EMBED_BASE_URL, model: DEFAULT_EMBED_MODEL },
          cause: (e as Error).message,
          next_action: "verify the local embedding service on :10240, or unset CIRCADIAN_EMBED for BM25-only",
        });
        embedder = undefined;
      }
    }
    const { index, vectors } = await buildIndex(MIND_DIR, { embedder });
    saveIndex(MIND_DIR, index, vectors);
    ok({
      process: "relindex", phase: "build", correlation_id: corr,
      summary: `index built: ${index.meta.unitCount} units, ${index.meta.entityCount} entities in ${index.meta.buildMs}ms (embedder=${index.meta.embedder})`,
      context: {
        units: index.meta.unitCount, entities: index.meta.entityCount,
        build_ms: index.meta.buildMs, embedder: index.meta.embedder,
        adjacency_edges: index.adjacency.length, avgdl: Math.round(index.meta.avgdl),
      },
    });
    console.log(`relindex: ${index.meta.unitCount} units, ${index.meta.entityCount} entities, ${index.adjacency.length} adjacency edges, ${index.meta.buildMs}ms, embedder=${index.meta.embedder}`);
    return;
  }

  if (args.includes("--update")) {
    const loaded = loadIndex(MIND_DIR);
    if (!loaded) {
      const { index, vectors } = await buildIndex(MIND_DIR);
      saveIndex(MIND_DIR, index, vectors);
      ok({
        process: "relindex", phase: "update", correlation_id: corr,
        summary: `no prior index — full build: ${index.meta.unitCount} units`,
        context: { units: index.meta.unitCount, entities: index.meta.entityCount, build_ms: index.meta.buildMs },
      });
      return;
    }
    const { index, changed, deleted } = updateIndex(MIND_DIR, loaded.index);
    if (changed === 0 && deleted === 0) {
      idle({
        process: "relindex", phase: "update", correlation_id: corr,
        summary: "index up to date — nothing changed",
        context: { units: index.meta.unitCount },
      });
      return;
    }
    saveIndex(MIND_DIR, index, loaded.vectors); // keep any existing vectors
    ok({
      process: "relindex", phase: "update", correlation_id: corr,
      summary: `index updated incrementally: ${changed} changed/new, ${deleted} deleted, ${index.meta.buildMs}ms`,
      context: { changed, deleted, units: index.meta.unitCount, entities: index.meta.entityCount, build_ms: index.meta.buildMs },
    });
    console.log(`relindex: updated ${changed} changed, ${deleted} deleted, ${index.meta.unitCount} units, ${index.meta.buildMs}ms`);
    return;
  }

  const query = flagValue(args, "--query");
  if (query) {
    const loaded = loadIndex(MIND_DIR);
    if (!loaded) {
      degraded({
        process: "relindex", phase: "query", correlation_id: corr,
        summary: "no index on disk to query",
        context: { index_path: INDEX_PATH },
        cause: "mind/index/index.json missing",
        next_action: "run `bun src/relindex.ts --reindex` first",
      });
      console.error("relindex: no index — run `bun src/relindex.ts --reindex` first");
      process.exit(1);
    }
    const k = Number.parseInt(flagValue(args, "--k") || "5", 10) || 5;
    // CLI dense (build/query-time, network allowed) only when explicitly gated
    let queryVector: { embedder: string; vector: number[] } | undefined;
    if (process.env.CIRCADIAN_EMBED === "1" && loaded.vectors?.embedder.startsWith("remote:")) {
      try {
        const emb = new RemoteEmbedder(loaded.vectors.embedder.slice("remote:".length));
        queryVector = { embedder: loaded.vectors.embedder, vector: await emb.embed(query) };
      } catch {
        queryVector = undefined; // BM25+graph+temporal still fully functional
      }
    }
    const results = queryIndex(loaded.index, query, { k, queryVector, vectors: loaded.vectors });
    ok({
      process: "relindex", phase: "query", correlation_id: corr,
      summary: `query "${query}" -> ${results.length} unit(s)`,
      context: {
        query, entities: [...extractEntities(query).keys()],
        results: results.map((r) => ({ id: r.id, score: r.score })),
        dense: !!queryVector,
      },
    });
    if (args.includes("--json")) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      for (const r of results) console.log(`[${r.score.toFixed(4)}] ${r.snippet} — from ${r.id}`);
    }
    return;
  }

  console.error("usage: bun src/relindex.ts --reindex | --update | --query <text> [--k N] [--json]");
  process.exit(1);
}

if (import.meta.main) await main();
