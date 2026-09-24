#!/usr/bin/env bun
/** Read-only archaeology of active atoms hidden by depth OR the render floor.
 * No index is persisted: relindex builds its BM25 view from the files on each
 * invocation so even a sunk atom absent from a stale index can be recovered.
 */
import * as path from "node:path";
import { homedir } from "node:os";
import { readAtoms, readLedger, foldWeights, type Atom } from "./atoms.ts";
import { foldStrata, hotLimit, type Stratum } from "./strata.ts";
import { RENDER_FLOOR } from "./render.ts";
import { buildIndex, bm25, tokenize } from "./relindex.ts";
import { correlation, fail, idle, ok } from "./obs.ts";

export interface DigHit { atom: Atom; stratum: Stratum; weight: number; score: number }

/** A numeric query lists atoms at least that deep; a text query searches
 * everything absent from hot SELF.md, including atoms sunk by nightly decay. */
export async function dig(mindDir: string, query: string, limit = hotLimit()): Promise<DigHit[]> {
  const atoms = readAtoms(path.join(mindDir, "beliefs"));
  const events = readLedger(path.join(mindDir, "beliefs.jsonl"));
  const states = foldWeights(events);
  const strata = foldStrata(events);
  const depth = /^\d+$/.test(query) ? Number(query) : null;
  if (depth !== null && !Number.isSafeInteger(depth)) throw new Error("depth must be a safe nonnegative integer");
  const eligible = atoms.filter((a) => {
    const state = states.get(a.id);
    if (!state || state.status !== "active" || !strata.get(a.id)?.lastStack) return false;
    const d = strata.get(a.id)!.depth;
    return depth !== null ? d >= depth : d > limit || state.weight < RENDER_FLOOR;
  });
  // BM25's corpus includes episodes as well as beliefs, but only eligible
  // belief ids can be returned. No dense embedder or network calls.
  const { index } = depth === null ? await buildIndex(mindDir) : { index: null };
  const scores = index ? bm25(index, tokenize(query)) : new Map<string, number>();
  return eligible.map((atom) => ({ atom, stratum: strata.get(atom.id) ?? { depth: 0, lastStack: null, lastStackDate: null },
    weight: states.get(atom.id)!.weight, score: depth === null ? scores.get(`beliefs/${atom.id}.md`) ?? 0 : 0,
  })).filter((hit) => depth !== null || hit.score > 0)
    .sort((a, b) => depth !== null ? b.stratum.depth - a.stratum.depth || a.atom.id.localeCompare(b.atom.id)
      : b.score - a.score || a.atom.id.localeCompare(b.atom.id));
}

export async function digMain(args: string[]): Promise<void> {
  const corr = correlation("dig");
  const idx = args.indexOf("--mind");
  const mind = idx >= 0 ? args[idx + 1] : path.join(process.env.CIRCADIAN_HOME || path.join(homedir(), "circadian"), "mind");
  const terms = idx >= 0 ? args.filter((_, i) => i !== idx && i !== idx + 1) : args;
  const query = terms.join(" ").trim();
  if (!mind || !query || query.startsWith("-")) fail({ process: "dig", phase: "usage", correlation_id: corr,
    summary: "dig needs a query or depth", context: { args }, cause: "missing query/depth or mind path",
    next_action: "run bun src/dig.ts <query|depth> [--mind <path>]" });
  try {
    const hits = await dig(mind, query);
    for (const h of hits) console.log(`[depth ${h.stratum.depth}; last-stack ${h.stratum.lastStackDate ?? "unknown"}; weight ${h.weight.toFixed(4)}] ${h.atom.claim} — atom ${h.atom.id} — stack ${h.stratum.lastStack ?? "unknown"}; quotes ${h.atom.quotes.map((q) => q.source).join(", ")}; ${h.atom.eps.map((e) => `[ep:${e}]`).join(" ")}`);
    const event = { process: "dig" as const, phase: "read", correlation_id: corr,
      summary: `dig ${JSON.stringify(query)} found ${hits.length} atom(s)`, context: { query, mind, hits: hits.map((h) => ({ atom: h.atom.id, depth: h.stratum.depth, episode: h.stratum.lastStack })) } };
    if (hits.length) ok(event); else idle(event);
  } catch (e) {
    fail({ process: "dig", phase: "read", correlation_id: corr, summary: "dig could not read the strata",
      context: { query, mind }, cause: (e as Error).message, next_action: "check the mind path and STRATA_HOT setting, then retry" });
  }
}
if (import.meta.main) await digMain(process.argv.slice(2));
