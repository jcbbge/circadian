#!/usr/bin/env bun
/**
 * interfere.ts — the interference instrument (wave-optics W3): semantic
 * flock merge over the EXISTING belief population.
 *
 * The population holds paraphrase FLOCKS: one belief wearing dozens of
 * tellings (measured 2026-08-09: 43 atom files contain "mechanical
 * fidelity", 56 contain "verbatim"). The stacker's dedupe pipeline is
 * lexical (jaccard 0.3, ltp.ts) + a borderline COMPARE band — a genuine
 * paraphrase with low token overlap falls below BAND_LOW and is never
 * compared at all. Brief 08 attacks that at extraction time, for FUTURE
 * episodes. This tool attacks the existing population: it clusters
 * paraphrase flocks and proposes supersede events that collapse each flock
 * onto one winner.
 *
 * Multi-plate interference: provenance stays intact at rest — every atom
 * keeps its file, quotes, and [ep:] stamps; supersede transfers weight and
 * preserves lineage (foldWeights, atoms.ts) — but the COMPARISON erases
 * which-plate identity: claims are compared as claims, not as sourced
 * records.
 *
 * Pipeline:
 *   1. load atoms + fold(ledger) — ACTIVE atoms only (superseded atoms are
 *      historical, never merge candidates).
 *   2. cluster candidates, KIND-SCOPED (never cluster across kinds): the
 *      pairwise link decision is ONE injectable function (ClaimLinker).
 *      Semantic path: embeddings from the local endpoint (:10240) with
 *      cosine similarity. Fallback when the endpoint is unreachable (or
 *      --lexical is passed): lexical jaccard at a LOWER threshold (0.15)
 *      than the stacker's 0.3, gated by a shared significant-bigram signal.
 *      The fallback is a real implementation, not a mock — it is what the
 *      tests pin.
 *   3. within each cluster of size >=2: winner = highest folded weight
 *      (tiebreak: earliest [ep:] stamp — the original telling; then id lex
 *      asc for full determinism). Every other member becomes a proposed
 *      supersede line `loser -> winner`.
 *   4. DRY-RUN BY DEFAULT: without --apply, the proposal is written to
 *      briefs/wave-optics/proposals/ (W3-merge-proposal.jsonl +
 *      W3-report.md) and mind/ is never touched. --apply appends the
 *      proposal lines to mind/beliefs.jsonl.
 *
 * Asymmetry doctrine (mirrors stack.ts COMPARE coercion): a false-DISTINCT
 * costs a later pass nothing; a false-SAME loses a belief permanently. Every
 * layer here biases conservative: the lexical linker requires BOTH the
 * jaccard floor AND a shared bigram (or the stacker's own 0.3 auto-SAME
 * threshold outright); clustering never crosses kinds; and the default mode
 * proposes without applying — a human reviews every merge.
 *
 * Law 9: the CLI emits one obs event per run (ok on a clean dry-run/apply,
 * degraded when the semantic endpoint was wanted but unreachable). Library
 * functions are pure and silent, the atoms.ts pattern.
 */

import * as fs from "fs";
import * as path from "path";
import { homedir } from "os";
import {
  readAtoms,
  readLedger,
  appendLedger,
  foldWeights,
  type Atom,
  type AtomKind,
  type AtomState,
  type LedgerEvent,
} from "./atoms.ts";
import { jaccard, significantTokens } from "./ltp.ts";
import { ok, degraded, fail, correlation, type CircadianProcess } from "./obs.ts";

// "interfere" is not yet in obs.ts's CircadianProcess union; obs.ts is
// outside this brief's partition (finding posted to the Tower board — the
// union should gain "interfere" at integration). The cast is runtime-safe:
// obs.ts treats process as an opaque label.
const PROC = "interfere" as CircadianProcess;

// ---------------------------------------------------------------------
// knobs
// ---------------------------------------------------------------------

/** Lexical fallback floor — deliberately LOWER than the stacker's
 * LTP_THRESHOLD (0.3): the stacker already auto-SAMEs above 0.3, so the
 * flocks this tool exists to catch live below it. The bigram gate (below)
 * is what keeps 0.15 from over-merging. */
export const FALLBACK_JACCARD = 0.15;

/** At or above the stacker's own auto-SAME threshold, no bigram evidence is
 * required — the stacker itself would have stacked this pair. */
export const AUTO_SAME_JACCARD = 0.3;

/** Cosine-similarity floor for the embeddings path. UNTESTED against live
 * embeddings — the endpoint was down the session this was built
 * (2026-08-09); calibrate against real vectors before trusting --apply on
 * an embeddings-clustered proposal. */
export const EMBED_COSINE_THRESHOLD = 0.85;

const EMBED_BASE_URL =
  process.env.CIRCADIAN_LLM_BASE_URL || process.env.LOCAL_LLM_BASE_URL || "http://127.0.0.1:10240/v1";
const EMBED_MODEL = process.env.CIRCADIAN_EMBED_MODEL || "mlx-community/Qwen3-Embedding-4B-4bit-DWQ";
const PROBE_TIMEOUT_MS = 3000;

// ---------------------------------------------------------------------
// the injectable comparison surface
// ---------------------------------------------------------------------

/** Decides whether two claims are the same belief in different words.
 * This is the ONE seam where semantics enters the pipeline: inject an
 * embeddings- or COMPARE-backed function when the endpoint is up; the
 * lexical fallback below when it is not. */
export type ClaimLinker = (a: string, b: string) => boolean | Promise<boolean>;

/** Ordered significant tokens: same tokenizer + stopword logic as ltp.ts
 * (reused via significantTokens — the stopword list is not duplicated
 * here), but order-preserving, so consecutive pairs carry phrase signal. */
export function orderedSignificantTokens(claim: string): string[] {
  const sig = significantTokens(claim);
  const out: string[] = [];
  for (const m of claim.toLowerCase().matchAll(/[a-z][a-z0-9'-]{2,}/g)) {
    if (sig.has(m[0])) out.push(m[0]);
  }
  return out;
}

/** Count of significant-token bigrams two claims share (e.g. both saying
 * "mechanical fidelity" share the bigram mechanical→fidelity). A shared
 * bigram is phrase-level evidence that a below-0.3 jaccard pair is one
 * belief, not two beliefs with overlapping vocabulary. */
export function sharedBigramCount(a: string, b: string): number {
  const bigrams = (tokens: string[]): Set<string> => {
    const s = new Set<string>();
    for (let i = 0; i + 1 < tokens.length; i++) s.add(`${tokens[i]}\u0000${tokens[i + 1]}`);
    return s;
  };
  const ba = bigrams(orderedSignificantTokens(a));
  const bb = bigrams(orderedSignificantTokens(b));
  let n = 0;
  for (const g of ba) if (bb.has(g)) n++;
  return n;
}

/** The lexical fallback linker — a real implementation, not a mock.
 * Links two claims iff:
 *   - jaccard >= 0.3 (the stacker's own auto-SAME threshold), OR
 *   - jaccard >= 0.15 AND they share at least one significant bigram.
 * Conservative by construction: a pair below 0.3 needs BOTH the token floor
 * and phrase-level evidence — false-DISTINCT is cheap, false-SAME is a
 * permanently lost belief. */
export function lexicalLinker(a: string, b: string): boolean {
  const jac = jaccard(significantTokens(a), significantTokens(b));
  if (jac >= AUTO_SAME_JACCARD) return true;
  if (jac >= FALLBACK_JACCARD && sharedBigramCount(a, b) >= 1) return true;
  return false;
}

/** Embeddings-backed linker factory. Mirrors relindex.ts's /embeddings call
 * shape (single input, data[0].embedding). Vectors are cached per claim so
 * a full pairwise pass costs N embedding calls, not N^2. NEVER called when
 * the endpoint probe fails — the CLI falls back to lexicalLinker and emits
 * a degraded event instead. */
export function makeEmbeddingLinker(
  baseUrl: string = EMBED_BASE_URL,
  model: string = EMBED_MODEL,
  threshold: number = EMBED_COSINE_THRESHOLD
): ClaimLinker {
  const cache = new Map<string, number[]>();
  async function embed(text: string): Promise<number[]> {
    const hit = cache.get(text);
    if (hit) return hit;
    const res = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: text }),
    });
    if (!res.ok) throw new Error(`embeddings HTTP ${res.status} at ${baseUrl}`);
    const json = (await res.json()) as { data?: { embedding?: number[] }[] };
    const vec = json?.data?.[0]?.embedding;
    if (!Array.isArray(vec) || vec.length === 0) throw new Error("embeddings: empty vector");
    cache.set(text, vec);
    return vec;
  }
  return async (a: string, b: string): Promise<boolean> => {
    const [va, vb] = await Promise.all([embed(a), embed(b)]);
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < va.length; i++) {
      dot += va[i] * vb[i];
      na += va[i] * va[i];
      nb += vb[i] * vb[i];
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom > 0 && dot / denom >= threshold;
  };
}

/** GET /models liveness probe with a hard timeout. Returns false on any
 * failure — never throws, never hangs (contract: a down endpoint degrades
 * loudly, it does not block). */
export async function probeEndpoint(baseUrl: string = EMBED_BASE_URL): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}/models`, { signal: controller.signal });
    return res.status === 200;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------
// clustering — union-find over pairwise links, kind-scoped by the caller
// ---------------------------------------------------------------------

export interface ClaimItem {
  id: string;
  claim: string;
}

/** Single-linkage clustering over the injected pairwise linker. O(n^2)
 * pairwise — the population is hundreds of <=280-char claims, a nested loop
 * you can read beats an index you have to trust (the ltp.ts argument).
 * Returns every cluster, singletons included; callers filter size>=2. */
export async function clusterClaims<T extends ClaimItem>(items: T[], linker: ClaimLinker): Promise<T[][]> {
  const parent = items.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (find(i) === find(j)) continue; // already linked transitively
      if (await linker(items[i].claim, items[j].claim)) union(i, j);
    }
  }

  const groups = new Map<number, T[]>();
  items.forEach((item, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(item);
  });
  // Deterministic order: by lowest member id.
  const clusters = [...groups.values()];
  for (const c of clusters) c.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  clusters.sort((a, b) => (a[0].id < b[0].id ? -1 : a[0].id > b[0].id ? 1 : 0));
  return clusters;
}

// ---------------------------------------------------------------------
// winner selection + proposal
// ---------------------------------------------------------------------

function weightOf(states: Map<string, AtomState>, id: string): number {
  return states.get(id)?.weight ?? 0;
}

function earliestEp(a: Atom): string {
  // ISO dates sort lexically; an atom always has >=1 [ep:] stamp (shape).
  return [...a.eps].sort()[0] ?? "9999-99-99";
}

/** Winner = highest folded weight; tiebreak earliest [ep:] stamp (the
 * original telling); final tiebreak id lex asc (full determinism). */
export function pickWinner(cluster: Atom[], states: Map<string, AtomState>): Atom {
  return [...cluster].sort((a, b) => {
    const wa = weightOf(states, a.id), wb = weightOf(states, b.id);
    if (wa !== wb) return wb - wa;
    const ea = earliestEp(a), eb = earliestEp(b);
    if (ea !== eb) return ea < eb ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  })[0];
}

export interface MergeCluster {
  kind: AtomKind;
  winner: Atom;
  losers: Atom[];
  /** what the winner would hold after the merge (sum of current folded
   * member weights) — pre-decay, informational for review. */
  combinedWeight: number;
}

export interface InterfereResult {
  clusters: MergeCluster[];
  /** proposed supersede lines, exactly the ledger event shape. */
  proposals: LedgerEvent[];
  /** active atom count before / after applying the proposal. */
  before: number;
  after: number;
}

/** The pure pipeline: active atoms in, proposal out. No I/O, no writes —
 * the CLI owns files. Clustering is KIND-SCOPED: atoms are partitioned by
 * kind before any pair is compared; a cross-kind paraphrase never merges
 * (an identity fact and a doctrine are different beliefs even when worded
 * alike — and the four render sections must each keep their strongest
 * telling). */
export async function interfere(
  atoms: Atom[],
  states: Map<string, AtomState>,
  linker: ClaimLinker,
  ts: string = new Date().toISOString()
): Promise<InterfereResult> {
  const active = atoms.filter((a) => (states.get(a.id)?.status ?? "active") === "active");

  const kinds: AtomKind[] = ["identity", "doctrine", "motif", "agreement"];
  const clusters: MergeCluster[] = [];
  for (const kind of kinds) {
    const pool = active.filter((a) => a.kind === kind);
    const grouped = await clusterClaims(pool, linker);
    for (const group of grouped) {
      if (group.length < 2) continue;
      const winner = pickWinner(group, states);
      const losers = group.filter((a) => a.id !== winner.id);
      const combinedWeight = group.reduce((s, a) => s + weightOf(states, a.id), 0);
      clusters.push({ kind, winner, losers, combinedWeight });
    }
  }
  // Deterministic order: heaviest merge first, then winner id.
  clusters.sort((a, b) => b.combinedWeight - a.combinedWeight || (a.winner.id < b.winner.id ? -1 : 1));

  const proposals: LedgerEvent[] = [];
  for (const c of clusters) {
    for (const loser of c.losers) {
      proposals.push({ ev: "supersede", ts, winner: c.winner.id, loser: loser.id });
    }
  }

  return { clusters, proposals, before: active.length, after: active.length - proposals.length };
}

// ---------------------------------------------------------------------
// report
// ---------------------------------------------------------------------

/** Top-N render preview after applying the proposal: fold(ledger +
 * proposals), active atoms, weight desc (id-lex tiebreak — the render's own
 * ordering). */
export function previewTop(
  atoms: Atom[],
  events: LedgerEvent[],
  proposals: LedgerEvent[],
  n: number
): { atom: Atom; weight: number }[] {
  const states = foldWeights([...events, ...proposals]);
  return atoms
    .filter((a) => (states.get(a.id)?.status ?? "active") === "active")
    .map((a) => ({ atom: a, weight: states.get(a.id)?.weight ?? 0 }))
    .sort((x, y) => y.weight - x.weight || (x.atom.id < y.atom.id ? -1 : 1))
    .slice(0, n);
}

export function buildReport(
  result: InterfereResult,
  atoms: Atom[],
  states: Map<string, AtomState>,
  events: LedgerEvent[],
  mode: string,
  generatedTs: string
): string {
  const lines: string[] = [];
  const affected = result.proposals.length + result.clusters.length; // losers + winners
  lines.push(`# W3 merge proposal — semantic flock merge (dry-run)`);
  lines.push(``);
  lines.push(`- Generated: ${generatedTs}`);
  lines.push(`- Clustering mode: ${mode}`);
  lines.push(`- Clusters (size >= 2): ${result.clusters.length}`);
  lines.push(`- Atoms affected: ${affected} (${result.clusters.length} winners + ${result.proposals.length} losers)`);
  lines.push(`- Proposed supersede events: ${result.proposals.length}`);
  lines.push(`- Effective population: ${result.before} -> ${result.after}`);
  lines.push(``);
  lines.push(`Every loser keeps its file, quotes, and [ep:] stamps; supersede transfers`);
  lines.push(`weight to the winner and zoom shows the old telling forever. Nothing here`);
  lines.push(`is applied — the coordinator reviews and applies.`);
  lines.push(``);
  lines.push(`## Clusters`);
  lines.push(``);
  let i = 0;
  for (const c of result.clusters) {
    i++;
    lines.push(`### Cluster ${i} — kind: ${c.kind}, combined weight ${c.combinedWeight.toFixed(3)}`);
    lines.push(``);
    lines.push(
      `- WINNER \`${c.winner.id}\` (weight ${weightOf(states, c.winner.id).toFixed(3)}, earliest ep ${earliestEp(c.winner)}): ${c.winner.claim}`
    );
    for (const l of c.losers) {
      lines.push(
        `- loser \`${l.id}\` (weight ${weightOf(states, l.id).toFixed(3)}, earliest ep ${earliestEp(l)}): ${l.claim}`
      );
    }
    lines.push(``);
  }
  lines.push(`## Top-20 render preview (post-merge fold)`);
  lines.push(``);
  const top = previewTop(atoms, events, result.proposals, 20);
  let rank = 0;
  for (const { atom, weight } of top) {
    rank++;
    lines.push(`${rank}. \`${atom.id}\` [${atom.kind}] w=${weight.toFixed(3)} — ${atom.claim}`);
  }
  lines.push(``);
  return lines.join("\n");
}

// ---------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------

const CIRCADIAN_HOME = process.env.CIRCADIAN_HOME || path.join(homedir(), "circadian");

async function main() {
  const args = process.argv.slice(2);
  const corr = correlation("interfere");
  const apply = args.includes("--apply");
  const forceLexical = args.includes("--lexical");
  const outIdx = args.indexOf("--out");
  const outDir =
    outIdx !== -1 && args[outIdx + 1]
      ? args[outIdx + 1]
      : path.join(CIRCADIAN_HOME, "briefs", "wave-optics", "proposals");

  const beliefsDir = path.join(CIRCADIAN_HOME, "mind", "beliefs");
  const ledgerPath = path.join(CIRCADIAN_HOME, "mind", "beliefs.jsonl");

  const atoms = readAtoms(beliefsDir);
  if (atoms.length === 0) {
    fail({
      process: PROC,
      phase: "load",
      correlation_id: corr,
      summary: `no atoms readable from ${beliefsDir}`,
      context: { beliefsDir },
      cause: "beliefs directory empty or unreadable",
      next_action: "check CIRCADIAN_HOME and mind/beliefs/",
    });
  }
  const events = readLedger(ledgerPath);
  const states = foldWeights(events);

  // The one injectable semantic seam: embeddings when the endpoint answers,
  // lexical fallback (loud, Law 9) when it does not or when forced.
  let mode: string;
  let linker: ClaimLinker;
  if (forceLexical) {
    mode = `lexical (forced via --lexical; jaccard>=${FALLBACK_JACCARD}+bigram, or >=${AUTO_SAME_JACCARD})`;
    linker = lexicalLinker;
  } else if (await probeEndpoint()) {
    mode = `embeddings (${EMBED_MODEL} @ ${EMBED_BASE_URL}, cosine>=${EMBED_COSINE_THRESHOLD})`;
    linker = makeEmbeddingLinker();
  } else {
    mode = `lexical (endpoint unreachable; jaccard>=${FALLBACK_JACCARD}+bigram, or >=${AUTO_SAME_JACCARD})`;
    linker = lexicalLinker;
    degraded({
      process: PROC,
      phase: "linker",
      correlation_id: corr,
      summary: `embeddings endpoint unreachable — degrading to lexical-cluster dry-run`,
      context: { baseUrl: EMBED_BASE_URL },
      cause: `GET ${EMBED_BASE_URL}/models failed or timed out (${PROBE_TIMEOUT_MS}ms)`,
      next_action: "re-run when :10240 is up for a semantic pass, or accept the lexical proposal",
    });
  }

  const generatedTs = new Date().toISOString();
  const result = await interfere(atoms, states, linker, generatedTs);

  if (apply) {
    for (const ev of result.proposals) appendLedger(ledgerPath, ev);
    ok({
      process: PROC,
      phase: "apply",
      correlation_id: corr,
      summary: `applied ${result.proposals.length} supersede events: population ${result.before} -> ${result.after}`,
      context: { clusters: result.clusters.length, proposals: result.proposals.length, mode, ledgerPath },
    });
    return;
  }

  fs.mkdirSync(outDir, { recursive: true });
  const proposalPath = path.join(outDir, "W3-merge-proposal.jsonl");
  const reportPath = path.join(outDir, "W3-report.md");
  fs.writeFileSync(proposalPath, result.proposals.map((p) => JSON.stringify(p)).join("\n") + (result.proposals.length ? "\n" : ""));
  fs.writeFileSync(reportPath, buildReport(result, atoms, states, events, mode, generatedTs));

  ok({
    process: PROC,
    phase: "dry-run",
    correlation_id: corr,
    summary: `dry-run: ${result.clusters.length} clusters, ${result.proposals.length} proposed supersedes, population ${result.before} -> ${result.after} (nothing applied)`,
    context: { clusters: result.clusters.length, proposals: result.proposals.length, mode, proposalPath, reportPath },
  });
}

if (import.meta.main) await main();
