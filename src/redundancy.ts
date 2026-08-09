// Render redundancy — the mode-collapse gauge (2026-08-09 poisoning
// post-mortem, "the danger model").
//
// Source-entropy would NOT have caught the August poisoning: 134 distinct
// drone episode files look diverse by filename. What collapsed was
// SEMANTIC — 26 of 48 rendered atoms telling the same obedience sentence
// in light lexical variation.
//
// FALSIFIED FIRST DESIGN (kept for the record): "fraction of claim pairs
// with jaccard >= LTP_THRESHOLD (0.3)" measured ZERO on the real poisoned
// render — short claims share a mode, not enough literal tokens. The
// calibration on real corpses killed it before it shipped.
//
// SURVIVING DESIGN — two cheap signals, both measured on the real corpses
// (poisoned render at mind commit 7c4dc18 vs the clean 2026-08-09 render):
//
//   mean pairwise jaccard   poisoned 0.0235   clean 0.0107   (2.2x)
//   modal-token share       poisoned 0.42     clean 0.24     (1.8x)
//
// The alarm trips on EITHER meanOverlap >= 0.018 OR modalShare >= 0.35 —
// sensitivity over specificity: the cost of a false alarm is one loud strip
// marker and a human glance; the cost of a miss was nine days of obedience
// doctrine. The instrument watches DAMAGE, not provenance: whatever floods
// the mind next shows up here before a human reads a hollow greeting.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { significantTokens, jaccard } from "./ltp.ts";

export interface RedundancyReport {
  /** rendered atoms measured */
  rendered: number;
  /** unique source episode files across rendered atoms */
  sources: number;
  /** mean pairwise jaccard across rendered claims (0 when fewer than 2) */
  meanOverlap: number;
  /** largest share of claims containing one significant token (0..1) */
  modalShare: number;
  /** the token holding that share (empty when no claims) */
  modalToken: string;
  /** true when either signal clears its threshold */
  collapse: boolean;
}

/** Calibrated on the real corpses above; see redundancy.test.ts. */
export const MEAN_OVERLAP_THRESHOLD = 0.018;
export const MODAL_SHARE_THRESHOLD = 0.35;
/** Below this many rendered claims the statistics are noise (a singleton
 * corpus puts every token at 100% share) — the instrument stays silent. */
export const MIN_CORPUS = 8;

/** Pure core — measurable on any set of claims (prod, tests, and
 * git-history calibration all share this). */
export function computeRedundancy(claims: string[], sourceFiles: string[] = []): RedundancyReport {
  const sets = claims.map((c) => significantTokens(c));
  const n = sets.length;

  let simSum = 0;
  let pairs = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      pairs++;
      simSum += jaccard(sets[i], sets[j]);
    }
  }
  const meanOverlap = pairs === 0 ? 0 : simSum / pairs;

  const df = new Map<string, number>();
  for (const s of sets) for (const t of s) df.set(t, (df.get(t) ?? 0) + 1);
  let modalToken = "";
  let modalCount = 0;
  for (const [t, c] of df) {
    if (c > modalCount) {
      modalCount = c;
      modalToken = t;
    }
  }
  const modalShare = n === 0 ? 0 : modalCount / n;

  return {
    rendered: n,
    sources: new Set(sourceFiles).size,
    meanOverlap,
    modalShare,
    modalToken,
    collapse:
      n >= MIN_CORPUS &&
      (meanOverlap >= MEAN_OVERLAP_THRESHOLD || modalShare >= MODAL_SHARE_THRESHOLD),
  };
}

const CLAIM_RE = /^claim:\s*"?([\s\S]*?)"?\s*$/m;
const SOURCE_RE = /\|\s*([\w.-]+\.md)/g;

/** Measure the live render: render-manifest.json -> beliefs/<id>.md claims.
 * File reads only (Law 7-compatible); any unreadable atom is skipped, and a
 * missing manifest returns null (instrument absent, never fatal). */
export function renderRedundancy(mindDir: string): RedundancyReport | null {
  let manifest: { atom: string }[];
  try {
    manifest = JSON.parse(readFileSync(join(mindDir, "render-manifest.json"), "utf8"));
  } catch {
    return null;
  }
  const claims: string[] = [];
  const sources: string[] = [];
  for (const { atom } of manifest) {
    let body = "";
    try {
      body = readFileSync(join(mindDir, "beliefs", `${atom}.md`), "utf8");
    } catch {
      continue;
    }
    const claim = body.match(CLAIM_RE)?.[1];
    if (claim) claims.push(claim);
    for (const m of body.matchAll(SOURCE_RE)) sources.push(m[1]);
  }
  return computeRedundancy(claims, sources);
}
