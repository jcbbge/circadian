// immune.ts — extraction-time and render-time health checks for the
// worldview. Extracted from mutate.ts (popmem WS-H, dross deletion,
// docs/POPULATION-MEMORY.md §3/§12) when the SELF.md-mutation engine (the
// v1 rem.ts editor path) retired: these are the only pieces of that 926-LOC
// file that carry forward, moved byte-identical (not rewritten).
//
// - makeStampGuard: origin-date enforcement for [ep:] stamps — an [ep:]
//   stamp is a zoom ADDRESS (src/zoom.ts drills provenance by it), so it
//   must name the source episode's date, never a run date (the replay
//   finding, 2026-07-27).
// - counterfeitQuotes: quote integrity — a quoted span is evidence of a
//   voice; a fabricated one is forged provenance (the replay finding,
//   2026-07-27).
// - detectSelfStutter: near-duplicate clustering over a v1-shaped
//   (numbered-Doctrine, bulleted Motifs/HowWeWork) worldview document — the
//   inward-LTP instrument. Callers holding a popmem atom-rendered SELF.md
//   (src/render.ts) must wrap it in the v1 envelope first (see
//   migrate.ts's adaptRenderedForStutterCheck) — this module's parser is
//   unchanged from mutate.ts, not adapted to the new render shape.
// - selfSimilarity: the accretion instrument (redundant-text ratio over a
//   document) — used by doctor.ts's worldview-redundancy check, which
//   survives the mutation grammar's retirement because it measures ANY
//   markdown text, not just the v1 mutation-grammar shape.
//
// Behavior of all four is preserved exactly from mutate.ts; see
// src/immune.test.ts (moved/adapted from mutate.test.ts and
// accretion.test.ts) for the pinned test coverage.

import { significantTokens } from "./ltp.ts";

// ---------------------------------------------------------------------
// shared normalization — containment/overlap used by every check below
// ---------------------------------------------------------------------

/** Normalization for duplicate detection: case, quotes, whitespace, and the
 * ep-stamps all collapse so the same sentence in different dress matches. */
function normalizeForDup(s: string): string {
  return s
    .toLowerCase()
    .replace(/\[(ep|confirmed):\d{4}-\d{2}-\d{2}\]/g, "")
    .replace(/["'“”‘’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Fallback for paraphrase-grade duplication: if >=80% of one text's 4-word
 * shingles appear in the other, it is the same substance. Comparing in both
 * directions catches a superset (the held sentence plus one extra clause). */
function substantialOverlap(a: string, b: string): boolean {
  const shingles = (t: string): Set<string> => {
    const w = t.split(" ").filter(Boolean);
    const out = new Set<string>();
    for (let i = 0; i + 4 <= w.length; i++) out.add(w.slice(i, i + 4).join(" "));
    return out;
  };
  const sa = shingles(a);
  const sb = shingles(b);
  if (sa.size < 3 || sb.size < 3) return false; // too short to judge by shingles
  let shared = 0;
  for (const s of sb) if (sa.has(s)) shared++;
  return shared / Math.min(sa.size, sb.size) >= 0.8;
}

// ---------------------------------------------------------------------
// SELF-SIMILARITY — the accretion instrument (doctor.ts's redundancy check)
// ---------------------------------------------------------------------

/** SELF-SIMILARITY: the fraction of a document that is redundant with
 * itself, measured on normalized units (paragraph-ish lines >= 40 chars).
 * Counts both exact repeats and paraphrase-grade repeats. Returned as a
 * ratio 0..1 of redundant characters over total characters. */
export function selfSimilarity(text: string): {
  ratio: number;
  redundantChars: number;
  totalChars: number;
  worstOffender: { text: string; copies: number } | null;
} {
  const totalChars = text.length;
  const units = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length >= 40 && !l.startsWith("#"));

  const seen: { norm: string; raw: string; copies: number }[] = [];
  let redundantChars = 0;

  for (const raw of units) {
    const norm = normalizeForDup(raw);
    if (!norm) continue;
    const prior = seen.find((s) => s.norm === norm || s.norm.includes(norm) || norm.includes(s.norm) || substantialOverlap(s.norm, norm));
    if (prior) {
      prior.copies += 1;
      redundantChars += raw.length;
    } else {
      seen.push({ norm, raw, copies: 1 });
    }
  }

  const worst = seen.filter((s) => s.copies > 1).sort((a, b) => b.copies - a.copies)[0];
  return {
    ratio: totalChars === 0 ? 0 : redundantChars / totalChars,
    redundantChars,
    totalChars,
    worstOffender: worst ? { text: worst.raw.slice(0, 120), copies: worst.copies } : null,
  };
}

// ---------------------------------------------------------------------
// ORIGIN-DATE STAMPING (the replay finding, 2026-07-27)
// ---------------------------------------------------------------------

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeStampDate(s: string): string | null {
  const m = s.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

export interface StampCorrection {
  op: string;
  from: string;
  to: string;
}

interface StampGuard {
  /** the deterministic default stamp for unstamped/mis-stamped content */
  origin: string;
  /** rewrite out-of-set [ep:] stamps in mutation text; records corrections */
  fix: (text: string, opLabel: string) => string;
  corrections: StampCorrection[];
}

/** an [ep:] stamp is a zoom ADDRESS — it must point at the episode a belief
 * came from. A stamp is VALID if it names a date in this wave's episode
 * batch, or a date the current worldview already carries (preserved
 * history); an out-of-set stamp is corrected deterministically to the
 * batch's origin date (the newest episode date in the meal). */
export function makeStampGuard(selfMd: string, episodeDates?: string[]): StampGuard {
  const corrections: StampCorrection[] = [];
  // No batch dates given (older call sites, unit fixtures): behave as before —
  // today's stamp, no correction pass. Enforcement is opt-in by evidence.
  if (!episodeDates || episodeDates.length === 0) {
    return { origin: todayStamp(), fix: (t) => t, corrections };
  }
  const batch = episodeDates.map(normalizeStampDate).filter((d): d is string => d !== null).sort();
  if (batch.length === 0) return { origin: todayStamp(), fix: (t) => t, corrections };
  const origin = batch[batch.length - 1]; // newest episode in the meal
  const allowed = new Set<string>(batch);
  // Preserve history: any stamp the worldview already carries stays legal.
  for (const m of selfMd.matchAll(/\[ep:(\d{4}-\d{1,2}-\d{1,2})\]/g)) {
    const d = normalizeStampDate(m[1]);
    if (d) allowed.add(d);
  }
  const fix = (text: string, opLabel: string): string =>
    text.replace(/\[ep:(\d{4}-\d{1,2}-\d{1,2})\]/g, (whole, raw) => {
      const d = normalizeStampDate(raw);
      if (d && allowed.has(d)) return `[ep:${d}]`; // normalize the zero-pad while we're here
      corrections.push({ op: opLabel, from: raw, to: origin });
      return `[ep:${origin}]`;
    });
  return { origin, fix, corrections };
}

// ---------------------------------------------------------------------
// QUOTE INTEGRITY (the replay finding, 2026-07-27)
// ---------------------------------------------------------------------

/** Whitespace-collapse + typographic-quote/dash unification. Deliberately
 * NOT lowercasing or stripping punctuation: a verbatim quote is verbatim. */
function normalizeForQuoteMatch(s: string): string {
  return s
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract double-quoted spans (straight or curly) of at least `minLen`
 * chars from `text` and return those that appear VERBATIM (whitespace-
 * normalized substring) in none of the `sources`. Short spans are ignored:
 * a four-word scare quote is style, forty characters is testimony. */
export function counterfeitQuotes(text: string, sources: string[], minLen = 40): string[] {
  const haystacks = sources.map(normalizeForQuoteMatch);
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(/["“]([^"“”]{40,}?)["”]/gs)) {
    const span = m[1].trim();
    if (span.length < minLen) continue;
    const norm = normalizeForQuoteMatch(span);
    if (seen.has(norm)) continue;
    seen.add(norm);
    if (!haystacks.some((h) => h.includes(norm))) missing.push(span);
  }
  return missing;
}

// ---------------------------------------------------------------------
// INWARD LTP — stutter detection on a v1-shaped worldview document
// ---------------------------------------------------------------------

interface DoctrineEntry {
  n: number;
  titleLine: string; // "**N. Title.** [ep:...] [confirmed:...]"
  body: string; // paragraph(s) after the title line, trimmed
}

interface SelfDoc {
  whoIAm: string;
  doctrine: DoctrineEntry[];
  motifs: string[]; // "- ..." lines
  howWeWork: string[]; // "- ..." lines
}

const H_WHO = "## Who I am across sessions";
const H_DOC = "## Doctrine";
const H_MOT = "## Motifs";
const H_HOW = "## How we work";

function sectionBody(text: string, heading: string): string {
  const start = text.indexOf(heading);
  if (start === -1) throw new Error(`SELF.md missing required heading: ${heading}`);
  const from = start + heading.length;
  const next = text.indexOf("\n## ", from);
  return (next === -1 ? text.slice(from) : text.slice(from, next)).trim();
}

function parseSelf(text: string): SelfDoc {
  const whoIAm = sectionBody(text, H_WHO);
  const doctrineRaw = sectionBody(text, H_DOC);
  const motifsRaw = sectionBody(text, H_MOT);
  const howRaw = sectionBody(text, H_HOW);

  // Doctrine entries: blocks starting "**N. "
  const doctrine: DoctrineEntry[] = [];
  const parts = doctrineRaw.split(/\n(?=\*\*\d+\.\s)/);
  for (const part of parts) {
    const pm = part.match(/^\*\*(\d+)\.\s/);
    if (!pm) continue;
    const nl = part.indexOf("\n");
    const titleLine = (nl === -1 ? part : part.slice(0, nl)).trim();
    const body = (nl === -1 ? "" : part.slice(nl + 1)).trim();
    doctrine.push({ n: parseInt(pm[1], 10), titleLine, body });
  }
  if (doctrine.length === 0) {
    throw new Error("SELF.md Doctrine section has no parseable **N. ...** entries");
  }

  const motifs = motifsRaw.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("-"));
  const howWeWork = howRaw.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("-"));

  return { whoIAm, doctrine, motifs, howWeWork };
}

export const SELF_STUTTER_THRESHOLD = 0.3;

export interface StutterReport {
  threshold: number;
  /** groups of doctrine entries carrying one belief (2+ members each) */
  doctrine: { n: number; title: string }[][];
  /** groups of motif lines carrying one theme (2+ members each) */
  motifs: string[][];
}

function overlapCoefficient(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const t of small) if (large.has(t)) inter++;
  return inter / Math.min(a.size, b.size);
}

function clusterIndices(tokenSets: Set<string>[], threshold: number): number[][] {
  const parent = tokenSets.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  for (let i = 0; i < tokenSets.length; i++) {
    for (let j = i + 1; j < tokenSets.length; j++) {
      if (overlapCoefficient(tokenSets[i], tokenSets[j]) >= threshold) {
        const ri = find(i), rj = find(j);
        if (ri !== rj) parent[ri] = rj;
      }
    }
  }
  const groups = new Map<number, number[]>();
  tokenSets.forEach((_, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(i);
  });
  return [...groups.values()].filter((g) => g.length > 1);
}

/** Read-only. Never throws on a malformed SELF.md — a document the parser
 * cannot read has bigger problems that the digestion path already reports;
 * the stutter instrument just returns silence. */
export function detectSelfStutter(selfMd: string, threshold = SELF_STUTTER_THRESHOLD): StutterReport {
  const empty: StutterReport = { threshold, doctrine: [], motifs: [] };
  let doc: SelfDoc;
  try {
    doc = parseSelf(selfMd);
  } catch {
    return empty;
  }
  const doctrineTokens = doc.doctrine.map((d) => significantTokens(`${d.titleLine}\n${d.body}`));
  const doctrine = clusterIndices(doctrineTokens, threshold).map((g) =>
    g
      .map((i) => ({
        n: doc.doctrine[i].n,
        title: doc.doctrine[i].titleLine.replace(/^\*\*\d+\.\s*/, "").replace(/\.?\*\*.*$/, "").trim(),
      }))
      .sort((a, b) => a.n - b.n)
  );
  const motifTokens = doc.motifs.map((l) => significantTokens(l));
  const motifs = clusterIndices(motifTokens, threshold).map((g) => g.map((i) => doc.motifs[i]));
  return { threshold, doctrine, motifs };
}
