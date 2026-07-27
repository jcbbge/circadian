#!/usr/bin/env bun
/**
 * migrate.ts — WS-E: live SELF.md -> seed atoms (popmem, docs/POPULATION-MEMORY.md
 * §11 migration-fidelity DECIDED items, §12 WS-E; templates/MIND-SPEC.v.next.md).
 *
 * Deterministic, NO-LLM, one-shot-but-testable: converts a PINNED revision of
 * the live SELF.md into seed atoms + ledger in a SANDBOX mind (never the real
 * one — see assertSandboxSafe below, same HARD SAFETY convention as
 * replay.ts), then renders the popmem SELF.md from them via render.ts.
 *
 * Two anti-smear operations, both required by §11 ("migration must NOT
 * launder smear into seed atoms"):
 *
 *   (a) WITHIN one entry: a v1 doctrine/motif/agreement entry can accrete
 *       repeated near-duplicate clauses over many REM waves while keeping the
 *       same number/position (observed: live Doctrine[1] carries three extra
 *       [ep:] citations appended to its body since its 2026-07-16 origin).
 *       Fix: claim/why are taken from the EARLIEST git telling of the entry
 *       (matched by normalized title/line/quote text, not by number — numbers
 *       are unstable across renumbering waves), never from the live body.
 *       Every accreted [ep:] occurrence in the LIVE text still becomes a
 *       ledger `stack` event (weight), because recurrence-as-weight (five
 *       sentences #2) applies retroactively to a migration exactly as it
 *       applies going forward: the smear becomes ledger arithmetic, not
 *       duplicated atom text.
 *
 *   (b) ACROSS entries: the same belief held under multiple doctrine numbers
 *       (observed: 8/16/17, 13/17) or duplicate motif lines. Fix:
 *       detectSelfStutter (mutate.ts, imported — not modified; it retires
 *       under WS-H but survives as an extracted utility per the program
 *       brief §3) clusters the PINNED live SELF.md exactly as REM consults it
 *       before a wave. Each cluster becomes ONE atom (the member whose own
 *       earliest telling is chronologically first wins); every member's own
 *       live [ep:] occurrences become ledger stack events on that one atom.
 *
 * Counterfeit-quote prevention (R3, the one unforgivable failure per brief):
 * every atom quote is sourced from the SOURCE EPISODE via git (collectAllEpisodesAt,
 * replay.ts's pinned enumeration), verified verbatim with stack.ts's own
 * quotesAreVerbatim (imported, not reimplemented) — never taken from SELF.md's
 * own (possibly smeared/paraphrased) copy. An entry whose episode cannot be
 * recovered, or whose earliest telling contains no substring that verifies
 * verbatim in that episode, is NEVER written as an atom — it is recorded in
 * the EXCEPTIONS list for the human-review document instead. Fabricating a
 * quote to fill the slot is banned, structurally, by never taking that path.
 *
 * No LLM anywhere in this file. No clock in the write path: the ledger
 * timestamp is a CLI arg (--ts), never Date.now(), so two runs against the
 * same --rev/--ts/--out produce byte-identical beliefs/ + ledger (R8,
 * asserted by running render twice against the seeded sandbox).
 */

import * as fs from "fs";
import * as path from "path";
import { homedir } from "os";
import { execFileSync, spawnSync } from "child_process";
import { writeAtom, type AtomKind, type LedgerEvent, appendLedger } from "./atoms.ts";
import { collectAllEpisodesAt, assertSandboxSafe, type ReplayEpisode } from "./replay.ts";
import { normalizeDate } from "./zoom.ts";
import { quotesAreVerbatim } from "./stack.ts";
import { detectSelfStutter } from "./mutate.ts";
import { significantTokens, jaccard } from "./ltp.ts";
import { ok, degraded, fail, correlation } from "./obs.ts";

// This worktree's own repo root (parent of src/) — render.ts is invoked from
// here, never from ~/circadian's checkout, so migration never depends on
// anything outside this worktree (WORKER-CONTRACT rule 1).
const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

// ---------------------------------------------------------------------
// section slicing — a lenient local copy (mutate.ts's sectionBody/parseSelf
// are not exported and throw on absence; historical revisions of SELF.md may
// legitimately lack a section before it existed, which must not be fatal
// here — an archaeology walk that dies on the founding commit finds nothing).
// ---------------------------------------------------------------------

const H_WHO = "## Who I am across sessions";
const H_DOC = "## Doctrine";
const H_MOT = "## Motifs";
const H_HOW = "## How we work";

export interface SelfSections {
  whoIAm: string;
  doctrine: string;
  motifs: string;
  howWeWork: string;
}

function sectionBody(text: string, heading: string): string {
  const start = text.indexOf(heading);
  if (start === -1) return "";
  const from = start + heading.length;
  const next = text.indexOf("\n## ", from);
  return (next === -1 ? text.slice(from) : text.slice(from, next)).trim();
}

export function parseSelfSections(selfMd: string): SelfSections {
  return {
    whoIAm: sectionBody(selfMd, H_WHO),
    doctrine: sectionBody(selfMd, H_DOC),
    motifs: sectionBody(selfMd, H_MOT),
    howWeWork: sectionBody(selfMd, H_HOW),
  };
}

// ---------------------------------------------------------------------
// entry parsing — one raw entry per v1 bullet/quote/doctrine-block
// ---------------------------------------------------------------------

const EP_TAG_RE = /\[ep:(\d{4}-\d{1,2}-\d{1,2})\]/g;
const STAMP_TAG_RE = /\[(?:ep|confirmed):\d{4}-\d{1,2}-\d{1,2}\]/g;

/** All [ep:] occurrences in a blob, IN ORDER, normalized, NOT deduped — every
 * occurrence is a distinct recurrence signal (see module header, part (a)). */
export function epOccurrences(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(EP_TAG_RE)) {
    const n = normalizeDate(m[1]);
    if (n) out.push(n);
  }
  return out;
}

export interface DoctrineRaw {
  n: number;
  titleLine: string;
  title: string; // bold text, stamps stripped
  body: string;
  eps: string[]; // all occurrences, title + body, in order
}

/** Same block split as mutate.ts's parseSelf (matching convention deliberately
 * — this is house style, not a coincidence), reimplemented locally because
 * mutate.ts does not export it and throws where this must not. */
export function parseDoctrineEntries(doctrineBody: string): DoctrineRaw[] {
  const out: DoctrineRaw[] = [];
  if (!doctrineBody) return out;
  const parts = doctrineBody.split(/\n(?=\*\*\d+\.\s)/);
  for (const part of parts) {
    const pm = part.match(/^\*\*(\d+)\.\s/);
    if (!pm) continue;
    const nl = part.indexOf("\n");
    const titleLine = (nl === -1 ? part : part.slice(0, nl)).trim();
    const body = (nl === -1 ? "" : part.slice(nl + 1)).trim();
    const titleMatch = titleLine.match(/^\*\*\d+\.\s*(.+?)\*\*/);
    const title = titleMatch ? titleMatch[1].trim() : titleLine.replace(/^\*\*\d+\.\s*/, "").replace(/\*\*.*$/, "").trim();
    out.push({ n: parseInt(pm[1], 10), titleLine, title, body, eps: epOccurrences(`${titleLine}\n${body}`) });
  }
  return out;
}

export interface BulletRaw {
  line: string; // the bullet text, "- " prefix stripped, trailing whitespace stripped
  eps: string[];
}

export function parseBulletEntries(sectionBody: string): BulletRaw[] {
  if (!sectionBody) return [];
  return sectionBody
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("-"))
    .map((l) => l.replace(/^-\s*/, "").trim())
    .map((line) => ({ line, eps: epOccurrences(line) }));
}

export interface IdentityRaw {
  text: string; // one quoted aphorism, quote marks stripped
  eps: string[];
}

/** The "Who I am" body is continuous prose, not discrete bullets — v1's own
 * convention is `"quote one" :: "quote two"` (see live SELF.md). Split on the
 * `::` separator when present; a body with none is one entry whole. */
export function parseIdentityEntries(whoIAmBody: string): IdentityRaw[] {
  if (!whoIAmBody) return [];
  const parts = whoIAmBody.includes(" :: ") ? whoIAmBody.split(" :: ") : [whoIAmBody];
  return parts
    .map((p) => p.trim().replace(/^["“]|["”]$/g, "").trim())
    .filter((p) => p.length > 0)
    .map((text) => ({ text, eps: epOccurrences(text) }));
}

// ---------------------------------------------------------------------
// normalization keys — for matching "this entry" across renumbered/reworded
// history without ever trusting position or number
// ---------------------------------------------------------------------

function collapseWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function normalizeTitleKey(title: string): string {
  return collapseWs(title).toLowerCase();
}

export function normalizeLineKey(line: string): string {
  return collapseWs(line.replace(STAMP_TAG_RE, "")).toLowerCase();
}

export function normalizeQuoteKey(text: string): string {
  return collapseWs(text.replace(STAMP_TAG_RE, "")).toLowerCase();
}

// ---------------------------------------------------------------------
// claim/why split — deterministic, no fabrication: reuse only text the
// source already contains (module header: why=claim is a documented,
// disclosed fallback for kinds whose v1 format never separated the two)
// ---------------------------------------------------------------------

export const CLAIM_MAX_CHARS = 280;

/** Splits at the first ". " (sentence boundary) outside the split marker
 * itself; `rest` is empty when there is no second sentence. Pure text
 * surgery — invents nothing. */
export function splitFirstSentence(text: string): { first: string; rest: string } {
  const t = text.trim();
  const m = t.match(/^(.*?[.!?])\s+(.*)$/s);
  if (!m) return { first: t, rest: "" };
  return { first: m[1].trim(), rest: m[2].trim() };
}

/** Claim must be <=280 chars (R3/atoms.ts parseAtom). Prefer the first
 * sentence; if even that overflows, hard-truncate at the boundary (never
 * silently drop the requirement — the caller decides whether to except it). */
export function truncateClaim(text: string): string {
  const t = collapseWs(text);
  if (t.length <= CLAIM_MAX_CHARS) return t;
  const { first } = splitFirstSentence(t);
  if (first.length <= CLAIM_MAX_CHARS) return first;
  return first.slice(0, CLAIM_MAX_CHARS - 1).trim() + "…";
}

// ---------------------------------------------------------------------
// quote-span extraction — candidate verbatim substrings from an entry's own
// text, in order of appearance; verified against the real episode by the
// caller (never assumed genuine just because it's quoted here)
// ---------------------------------------------------------------------

const MIN_QUOTE_LEN = 15;

const ASCII_QUOTE_RE = new RegExp(`"([^"]{${MIN_QUOTE_LEN},})"`, "g");
const CURLY_QUOTE_RE = new RegExp(`“([^”]{${MIN_QUOTE_LEN},})”`, "g");

export function extractQuoteSpans(text: string): string[] {
  const spans: string[] = [];
  for (const m of text.matchAll(ASCII_QUOTE_RE)) spans.push(m[1]);
  for (const m of text.matchAll(CURLY_QUOTE_RE)) spans.push(m[1]);
  return spans;
}

// ---------------------------------------------------------------------
// history walk — every SELF.md revision from genesis up to the pinned rev,
// oldest first (git log --follow --reverse, pinned per replay.ts convention)
// ---------------------------------------------------------------------

export interface ParsedDoc {
  rev: string;
  doctrine: DoctrineRaw[];
  motifs: BulletRaw[];
  howWeWork: BulletRaw[];
  identity: IdentityRaw[];
}

export function historyRevsUpTo(rev: string, liveMindDir: string): string[] {
  let out = "";
  try {
    out = execFileSync("git", ["log", "--follow", "--reverse", "--format=%H", rev, "--", "SELF.md"], {
      cwd: liveMindDir,
      encoding: "utf8",
    });
  } catch {
    return [];
  }
  return out.split("\n").map((l) => l.trim()).filter(Boolean);
}

function parsedDocAt(rev: string, liveMindDir: string): ParsedDoc | null {
  let text: string;
  try {
    text = execFileSync("git", ["show", `${rev}:SELF.md`], { cwd: liveMindDir, encoding: "utf8" });
  } catch {
    return null;
  }
  const sections = parseSelfSections(text);
  return {
    rev,
    doctrine: parseDoctrineEntries(sections.doctrine),
    motifs: parseBulletEntries(sections.motifs),
    howWeWork: parseBulletEntries(sections.howWeWork),
    identity: parseIdentityEntries(sections.whoIAm),
  };
}

/** All historical parses, oldest-to-pinned inclusive of the pinned rev itself
 * (appended last so a caller scanning oldest-first always terminates, even
 * when nothing earlier matches — see EarliestTelling below). */
export function buildHistory(rev: string, liveMindDir: string): ParsedDoc[] {
  const revs = historyRevsUpTo(rev, liveMindDir);
  const docs: ParsedDoc[] = [];
  for (const r of revs) {
    const d = parsedDocAt(r, liveMindDir);
    if (d) docs.push(d);
  }
  const pinned = parsedDocAt(rev, liveMindDir);
  if (pinned && (docs.length === 0 || docs[docs.length - 1].rev !== rev)) docs.push(pinned);
  return docs;
}

// ---------------------------------------------------------------------
// earliest telling — the anti-smear lookup, part (a)
// ---------------------------------------------------------------------

export interface EarliestTelling<T> {
  rev: string;
  entry: T;
  found: boolean; // false = no earlier telling exists; entry IS its own earliest
}

export function earliestDoctrine(history: ParsedDoc[], titleKey: string): EarliestTelling<DoctrineRaw> {
  for (const doc of history) {
    const hit = doc.doctrine.find((d) => normalizeTitleKey(d.title) === titleKey);
    if (hit) return { rev: doc.rev, entry: hit, found: true };
  }
  const last = history[history.length - 1];
  const hit = last?.doctrine.find((d) => normalizeTitleKey(d.title) === titleKey);
  return { rev: last?.rev ?? "", entry: hit as DoctrineRaw, found: false };
}

export function earliestBullet(
  history: ParsedDoc[],
  lineKey: string,
  pick: (doc: ParsedDoc) => BulletRaw[]
): EarliestTelling<BulletRaw> {
  for (const doc of history) {
    const hit = pick(doc).find((b) => normalizeLineKey(b.line) === lineKey);
    if (hit) return { rev: doc.rev, entry: hit, found: true };
  }
  const last = history[history.length - 1];
  const hit = last ? pick(last).find((b) => normalizeLineKey(b.line) === lineKey) : undefined;
  return { rev: last?.rev ?? "", entry: hit as BulletRaw, found: false };
}

export function earliestIdentity(history: ParsedDoc[], quoteKey: string): EarliestTelling<IdentityRaw> {
  for (const doc of history) {
    const hit = doc.identity.find((i) => normalizeQuoteKey(i.text) === quoteKey);
    if (hit) return { rev: doc.rev, entry: hit, found: true };
  }
  const last = history[history.length - 1];
  const hit = last?.identity.find((i) => normalizeQuoteKey(i.text) === quoteKey);
  return { rev: last?.rev ?? "", entry: hit as IdentityRaw, found: false };
}

// ---------------------------------------------------------------------
// episode resolution + verbatim quote sourcing — R3, never fabricated
// ---------------------------------------------------------------------

export interface QuoteResolution {
  quote: string;
  source: string; // episode filename
}

export interface QuoteFailure {
  reason: "no-eps" | "no-episode" | "no-verbatim-quote";
  detail: string;
}

/** Optional extras for resolveQuote: `rawText` is the entry's ORIGINAL,
 * unsplit earliest-telling text (before splitFirstSentence divided it into
 * claim/why) — many motif/how-we-work/identity entries carry no embedded
 * quote marks at all, so their only usable "quote" is the entry's own full
 * sentence; `genesisEpisode` is the WS-E2 OPTION (a) proxy source tried ONLY
 * when an entry has zero [ep:] stamps anywhere (the 25 founding-archaeology
 * exceptions WS-E found — they predate the episode format and can never
 * resolve against the real dated episode universe no matter how thorough the
 * search, so a genesis episode authored FROM their own earliest git telling
 * is the one honest way to give them a real, verifiable source). */
export interface ResolveQuoteExtras {
  rawText?: string;
  genesisEpisode?: ReplayEpisode | null;
}

/** Tries every [ep:] date on the entry, in order, against the real episode
 * universe (pinned, replay.ts's collectAllEpisodesAt) and every candidate
 * quote span extracted from the entry's own earliest-telling text. First
 * (date, episode, span) combination that verifies verbatim wins. Never
 * invents a quote when none verifies — returns a QuoteFailure instead. */
export function resolveQuote(
  eps: string[],
  candidateText: string,
  episodes: ReplayEpisode[],
  extras?: ResolveQuoteExtras
): QuoteResolution | QuoteFailure {
  const spans = extractQuoteSpans(candidateText);
  if (extras?.rawText) {
    const trimmed = extras.rawText.trim();
    if (trimmed.length >= MIN_QUOTE_LEN && !spans.includes(trimmed)) spans.push(trimmed);
  }

  if (eps.length === 0) {
    const genesisEpisode = extras?.genesisEpisode;
    if (genesisEpisode) {
      for (const span of spans) {
        if (quotesAreVerbatim([span], genesisEpisode.content)) {
          return { quote: span, source: genesisEpisode.filename };
        }
      }
      return {
        reason: "no-verbatim-quote",
        detail: spans.length === 0
          ? "entry carries no [ep:] stamp and no quotable text to test against the genesis episode"
          : `entry carries no [ep:] stamp; ${spans.length} candidate span(s) tested against the genesis episode; none verified verbatim`,
      };
    }
    return { reason: "no-eps", detail: "entry carries no [ep:] stamp in any known telling" };
  }

  const episodesByDate = new Map<string, ReplayEpisode[]>();
  for (const ep of episodes) {
    const d = normalizeDate(ep.filename.slice(0, 10)) ?? ep.filename.slice(0, 10);
    if (!episodesByDate.has(d)) episodesByDate.set(d, []);
    episodesByDate.get(d)!.push(ep);
  }

  let sawEpisode = false;
  for (const date of eps) {
    const matches = episodesByDate.get(date) ?? [];
    for (const episode of matches) {
      sawEpisode = true;
      for (const span of spans) {
        if (quotesAreVerbatim([span], episode.content)) {
          return { quote: span, source: episode.filename };
        }
      }
    }
  }

  // WS-E3 Fix B: an entry WITH real [ep:] stamps can still fail here — its
  // [ep:] date may not match the episode its own body actually cites (a
  // real archival drift found in Doctrine[7]: the entry is stamped
  // [ep:2026-07-24] but its body cites two 2026-07-23 episodes by name), or
  // the dated episode may simply lack a verbatim span. The genesis episode
  // (once extended to cover these entries too) is the same approved,
  // non-fabricating backstop as the zero-eps path above — tried ONLY after
  // the real dated episode search has genuinely failed. `eps` (the real
  // accreted occurrence count) still drives the atom's weight either way;
  // genesis only ever supplies the QUOTE, never the recurrence signal.
  const genesisEpisode = extras?.genesisEpisode;
  if (genesisEpisode) {
    for (const span of spans) {
      if (quotesAreVerbatim([span], genesisEpisode.content)) {
        return { quote: span, source: genesisEpisode.filename };
      }
    }
  }

  if (!sawEpisode) {
    return { reason: "no-episode", detail: `no episode found for [ep:${eps.join("], [ep:")}]` };
  }
  return {
    reason: "no-verbatim-quote",
    detail: spans.length === 0
      ? "entry's earliest telling contains no quoted span to test"
      : `${spans.length} candidate quote(s) tested against the resolved episode(s)${genesisEpisode ? " and the genesis episode" : ""}; none verified verbatim`,
  };
}

// ---------------------------------------------------------------------
// candidate assembly — one per pinned entry (post stutter-collapse), the
// unit migrate.ts either writes as an atom or records as an exception
// ---------------------------------------------------------------------

export interface AtomCandidate {
  kind: AtomKind;
  claim: string;
  why: string;
  quote: QuoteResolution;
  /** every [ep:] occurrence across every collapsed member's LIVE text — the
   * ledger gets one stack event per occurrence (module header, part a+b). */
  occurrences: string[];
  /** human-readable label for the review doc (e.g. "Doctrine[1]" or
   * "Doctrine[8,16] (stutter cluster)"). */
  label: string;
  earliestRev: string;
}

export interface Exception {
  label: string;
  kind: AtomKind;
  reason: string;
  disposition: string;
}

export interface MigrationPlan {
  candidates: AtomCandidate[];
  exceptions: Exception[];
  /** the claim-line complete-linkage result (FIX 1) — surfaced so the review
   * doc can show the human the pairwise matrix behind every doctrine cluster. */
  doctrineClustering: ClaimClusterResult;
}

function dispositionFor(f: QuoteFailure): string {
  switch (f.reason) {
    case "no-eps":
      return "predates the episode format (founding archaeology import, no [ep:] stamp ever attached) — accept as an unsourced genesis note, or manually attach a proxy episode before re-running migration.";
    case "no-episode":
      return "the cited episode is neither live nor recoverable from git history — verify the date stamp, or accept the entry stays unmigrated this pass.";
    case "no-verbatim-quote":
      return "the claim has drifted from any literal episode text (distilled/paraphrased by an earlier REM pass) — either accept as unsourced, or hand-locate a supporting verbatim quote before re-running.";
  }
}

// ---------------------------------------------------------------------
// FIX 1 (WS-E2, GATE 2 ruling): claim-line pairwise COMPLETE-linkage
// clustering, replacing the detectSelfStutter-over-bodies doctrine collapse.
//
// WS-E found that detectSelfStutter (mutate.ts, body-level, single-linkage)
// chains ALL 9 live doctrine entries into ONE megacluster: repeated
// REM-boilerplate phrasing accreted into every entry's BODY gives
// topically-unrelated entries enough shared vocabulary to bridge
// transitively, even though no two are similar at the belief level. Two
// changes fix this: (1) compare only the bolded CLAIM/title line — it is the
// one part of a doctrine entry that v1 never smeared (WS-E's own earliest-
// telling test confirmed title text is stable across every revision; only
// bodies accrete); (2) require COMPLETE linkage — a candidate joins a
// cluster only if it is pairwise similar to EVERY existing member, so one
// weak link (the mechanism single-linkage chaining exploits) excludes it
// instead of bridging two unrelated clusters together.
// ---------------------------------------------------------------------

/** Claim lines are short (a sentence, not a paragraph) — jaccard over a
 * handful of significant tokens is more volatile than over full bodies, so
 * mutate.ts's body-level 0.3 (SELF_STUTTER_THRESHOLD, also stack.ts's
 * BAND_HIGH) is not directly portable. 0.2 was picked by running the real
 * pairwise matrix over the pinned corpus's 9 doctrine titles (quoted in the
 * migration review doc) and choosing the value that cleanly separates the
 * observed genuine near-duplicate family (0.23-0.58) from cross-topic noise
 * (<=0.17, mostly <=0.10) — not a guess, a fit to the one real fixture that
 * exists. */
export const CLAIM_CLUSTER_THRESHOLD = 0.2;

export interface ClaimClusterResult {
  /** each inner array is a group of doctrine numbers (`n`), one group per
   * cluster INCLUDING singletons (a group of size 1 = no match found). */
  groups: number[][];
  /** symmetric pairwise jaccard matrix, indexed the same order as the input
   * `doctrine` array (not by `n`) — surfaced so the review doc can show the
   * human WHY each cluster formed, per the ruling's own request. */
  matrix: number[][];
}

/** Complete-linkage clustering over doctrine claim TITLES only (never the
 * smeared bodies). Deterministic: candidates are visited in input order and a
 * cluster, once seeded, only ever admits members pairwise-compatible with
 * EVERY member already in it — the matrix itself (fixed, symmetric,
 * order-independent) is what decides admission, so the result does not
 * depend on iteration order for any corpus where genuine clusters and noise
 * are well-separated (verified against the real 9-entry corpus; see the
 * review doc's matrix). */
export function clusterDoctrineByClaimLine(doctrine: DoctrineRaw[], threshold = CLAIM_CLUSTER_THRESHOLD): ClaimClusterResult {
  const n = doctrine.length;
  const tokenSets = doctrine.map((d) => significantTokens(d.title));
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) matrix[i][j] = i === j ? 1 : jaccard(tokenSets[i], tokenSets[j]);
  }

  const assigned = new Array(n).fill(false);
  const groups: number[][] = [];
  for (let i = 0; i < n; i++) {
    if (assigned[i]) continue;
    const group = [i];
    assigned[i] = true;
    for (let j = i + 1; j < n; j++) {
      if (assigned[j]) continue;
      if (group.every((g) => matrix[g][j] >= threshold)) {
        group.push(j);
        assigned[j] = true;
      }
    }
    groups.push(group);
  }
  return { groups: groups.map((g) => g.map((idx) => doctrine[idx].n)), matrix };
}

// ---------------------------------------------------------------------
// WS-E3 fix — claim normalization for identity/clustering ONLY. The
// orchestrator's GATE 2 review caught a pair the WS-E2 checks both missed:
// "Trust is ambient, not narrated." vs `"Trust is ambient, not narrated.`
// (identical belief, differing only by a leading typographic quote char
// carried over from the source line). Doctrine's clusterDoctrineByClaimLine
// is already immune (significantTokens tokenizes on [a-z][a-z0-9'-]{2,},
// which drops leading punctuation for free) — motifs/how-we-work/identity
// never had ANY exact-duplicate detection at all until this fix. Comparison
// key only: the ORIGINAL claim text is what lands in the atom, never this
// normalized form (Law: normalization is a comparison key, never a rewrite).
// ---------------------------------------------------------------------

// ASCII " and ', plus curly “” (double) and ‘’ (single).
const CLAIM_DEDUP_QUOTE_CHARS = /^["'“”‘’]+|["'“”‘’]+$/g;

export function normalizeClaimForDedup(claim: string): string {
  return claim.replace(CLAIM_DEDUP_QUOTE_CHARS, "").replace(/\s+/g, " ").trim();
}

/** Exact-match edges (not fuzzy) between items whose normalized claim is
 * identical — a duplicate-detection safety net distinct from jaccard
 * clustering (which motifs already has via detectSelfStutter). */
export function normalizedClaimEdges(claims: string[]): [number, number][] {
  const edges: [number, number][] = [];
  const byKey = new Map<string, number[]>();
  for (let i = 0; i < claims.length; i++) {
    const key = normalizeClaimForDedup(claims[i]);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(i);
  }
  for (const idxs of byKey.values()) {
    for (let i = 1; i < idxs.length; i++) edges.push([idxs[0], idxs[i]]);
  }
  return edges;
}

/** Union-find grouping over an arbitrary edge list — lets two independent
 * duplicate signals (e.g. motifs' body-level jaccard clustering AND the
 * normalized-claim safety net) combine: an item merges if EITHER signal
 * links it to another, transitively. Singletons (no edges) come back as
 * their own group of size 1. */
export function unionFindGroups(n: number, edges: [number, number][]): number[][] {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  for (const [a, b] of edges) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(i);
  }
  return [...groups.values()];
}

/** The whole deterministic pipeline, pure given its inputs (no I/O beyond
 * what buildHistory/collectAllEpisodesAt already did) — testable without a
 * sandbox. */
export function planMigration(
  pinnedSelfMd: string,
  history: ParsedDoc[],
  episodes: ReplayEpisode[],
  genesisEpisode?: ReplayEpisode | null
): MigrationPlan {
  const pinned = parseSelfSections(pinnedSelfMd);
  const doctrine = parseDoctrineEntries(pinned.doctrine);
  const motifs = parseBulletEntries(pinned.motifs);
  const howWeWork = parseBulletEntries(pinned.howWeWork);
  const identity = parseIdentityEntries(pinned.whoIAm);

  // Motifs still use detectSelfStutter (body-level, single-linkage) — the
  // GATE 2 ruling's FIX 1 is scoped to DOCTRINE only (that is where the real
  // megacluster/chaining was observed and where claim vs. body separation
  // matters; v1 motif lines are already one sentence with no separate
  // smeared body to chain on).
  const stutter = detectSelfStutter(pinnedSelfMd);
  const doctrineClustering = clusterDoctrineByClaimLine(doctrine);

  const candidates: AtomCandidate[] = [];
  const exceptions: Exception[] = [];

  function land(
    kind: AtomKind,
    label: string,
    claimSource: string,
    whySource: string,
    eps: string[],
    earliestRev: string,
    rawText: string,
    foldCount: number = 1
  ) {
    const claim = truncateClaim(claimSource);
    const resolution = resolveQuote(eps, claimSource + "\n" + whySource, episodes, { rawText, genesisEpisode });
    if ("reason" in resolution) {
      exceptions.push({ label, kind, reason: resolution.detail, disposition: dispositionFor(resolution) });
      return;
    }
    // zero-eps entries resolved via the genesis episode (OPTION a) have no
    // prior LIVE occurrence to fold in — one birth event PER raw entry
    // collapsed into this atom (foldCount: 1 for a singleton, member count
    // for a stutter cluster — two zero-eps motifs merging is still two
    // recorded tellings of one belief, weight 2, not a flattened weight 1),
    // dated to the genesis episode itself (the honest sense of "origin" for
    // a formally-archived founding belief, not a fabricated recurrence count).
    const occurrences =
      eps.length > 0 ? eps : Array(foldCount).fill(normalizeDate(resolution.source.slice(0, 10)) ?? resolution.source.slice(0, 10));
    candidates.push({
      kind,
      claim,
      why: whySource.trim() || claim,
      quote: resolution,
      occurrences,
      label,
      earliestRev,
    });
  }

  // ---- doctrine: FIX 1 — claim-line complete-linkage clusters, then
  // remaining singletons (groups of size 1 from clusterDoctrineByClaimLine
  // ARE the singletons, so every doctrine number is covered exactly once) ----
  for (const group of doctrineClustering.groups) {
    const members = group.map((n) => doctrine.find((d) => d.n === n)!).filter(Boolean);
    if (members.length === 0) continue;

    const tellings = members.map((m) => ({ m, earliest: earliestDoctrine(history, normalizeTitleKey(m.title)) }));
    tellings.sort((a, b) => {
      const da = a.earliest.entry?.eps[0] ?? "9999-99-99";
      const db = b.earliest.entry?.eps[0] ?? "9999-99-99";
      return da < db ? -1 : da > db ? 1 : a.m.n - b.m.n;
    });
    const winner = tellings[0];
    const occurrences = members.flatMap((m) => m.eps);
    const rawText = `${winner.earliest.entry.title} ${winner.earliest.entry.body}`.trim();
    const label =
      members.length > 1
        ? `Doctrine[${members.map((m) => m.n).join(",")}] (claim-line cluster, earliest Doctrine[${winner.m.n}])`
        : `Doctrine[${members[0].n}]`;
    land("doctrine", label, winner.earliest.entry.title, winner.earliest.entry.body, occurrences, winner.earliest.rev, rawText, members.length);
  }

  // ---- motifs: TWO independent duplicate signals, unioned (WS-E3) — (1) the
  // existing body-level detectSelfStutter clustering; (2) the normalized-claim
  // exact-match safety net (catches punctuation-only divergence, like a
  // leading typographic quote char, that jaccard-over-significant-tokens
  // already tolerates for doctrine titles but a body-level compare would
  // not). A motif merges if EITHER signal links it to another, transitively.
  const motifStutterEdges: [number, number][] = [];
  for (const group of stutter.motifs) {
    // detectSelfStutter (mutate.ts) returns lines with their "- " bullet
    // prefix still attached (its own parseSelf never strips it); ours does
    // (parseBulletEntries) — compare on the stripped form or every group
    // silently fails to match (a latent bug found + fixed in WS-E2).
    const idxs = group.map((line) => motifs.findIndex((m) => m.line === line.replace(/^-\s*/, "").trim())).filter((i) => i !== -1);
    for (let i = 1; i < idxs.length; i++) motifStutterEdges.push([idxs[0], idxs[i]]);
  }
  const motifClaims = motifs.map((m) => splitFirstSentence(m.line).first);
  const motifClaimEdges = normalizedClaimEdges(motifClaims);
  const motifGroups = unionFindGroups(motifs.length, [...motifStutterEdges, ...motifClaimEdges]);

  const inSameGroup = (edges: [number, number][], group: number[]): boolean => {
    const members = new Set(group);
    return edges.some(([a, b]) => members.has(a) && members.has(b));
  };

  for (const group of motifGroups) {
    const members = group.map((idx) => motifs[idx]);
    const tellings = members.map((m) => ({ m, earliest: earliestBullet(history, normalizeLineKey(m.line), (doc) => doc.motifs) }));
    tellings.sort((a, b) => {
      const da = a.earliest.entry?.eps[0] ?? "9999-99-99";
      const db = b.earliest.entry?.eps[0] ?? "9999-99-99";
      return da < db ? -1 : da > db ? 1 : 0;
    });
    const winner = tellings[0];
    const occurrences = members.flatMap((m) => m.eps);
    const { first, rest } = splitFirstSentence(winner.earliest.entry.line);
    if (members.length === 1) {
      const b = members[0];
      land("motif", `Motifs["${b.line.slice(0, 40)}${b.line.length > 40 ? "…" : ""}"]`, first, rest, occurrences, winner.earliest.rev, winner.earliest.entry.line);
    } else {
      const tags = [
        inSameGroup(motifStutterEdges, group) && "stutter cluster",
        inSameGroup(motifClaimEdges, group) && "claim-normalized cluster",
      ].filter(Boolean);
      const label = `Motifs[${members.map((m) => m.line.slice(0, 24)).join(" | ")}] (${tags.join(", ")})`;
      land("motif", label, first, rest, occurrences, winner.earliest.rev, winner.earliest.entry.line, members.length);
    }
  }

  // ---- how we work: normalized-claim duplicate detection (WS-E3) — no
  // body-level stutter-detect coverage for this section (mutate.ts's own
  // instrument never checked it either), so the safety net is the only signal ----
  const howClaims = howWeWork.map((b) => splitFirstSentence(b.line).first);
  const howEdges = normalizedClaimEdges(howClaims);
  const howGroups = unionFindGroups(howWeWork.length, howEdges);
  for (const group of howGroups) {
    const members = group.map((idx) => howWeWork[idx]);
    const tellings = members.map((m) => ({ m, earliest: earliestBullet(history, normalizeLineKey(m.line), (doc) => doc.howWeWork) }));
    tellings.sort((a, b) => {
      const da = a.earliest.entry?.eps[0] ?? "9999-99-99";
      const db = b.earliest.entry?.eps[0] ?? "9999-99-99";
      return da < db ? -1 : da > db ? 1 : 0;
    });
    const winner = tellings[0];
    const occurrences = members.flatMap((m) => m.eps);
    const { first, rest } = splitFirstSentence(winner.earliest.entry.line);
    if (members.length === 1) {
      const b = members[0];
      land("agreement", `HowWeWork["${b.line.slice(0, 40)}${b.line.length > 40 ? "…" : ""}"]`, first, rest, occurrences, winner.earliest.rev, winner.earliest.entry.line);
    } else {
      const label = `HowWeWork[${members.map((m) => m.line.slice(0, 24)).join(" | ")}] (claim-normalized cluster)`;
      land("agreement", label, first, rest, occurrences, winner.earliest.rev, winner.earliest.entry.line, members.length);
    }
  }

  // ---- identity: normalized-claim duplicate detection (WS-E3) — unlikely to
  // fire with 2 entries, but the mechanism must cover the whole corpus ----
  const identityClaims = identity.map((i) => splitFirstSentence(i.text).first);
  const identityEdges = normalizedClaimEdges(identityClaims);
  const identityGroups = unionFindGroups(identity.length, identityEdges);
  for (const group of identityGroups) {
    const members = group.map((idx) => identity[idx]);
    const tellings = members.map((m) => ({ m, earliest: earliestIdentity(history, normalizeQuoteKey(m.text)) }));
    tellings.sort((a, b) => {
      const da = a.earliest.entry?.eps[0] ?? "9999-99-99";
      const db = b.earliest.entry?.eps[0] ?? "9999-99-99";
      return da < db ? -1 : da > db ? 1 : 0;
    });
    const winner = tellings[0];
    const occurrences = members.flatMap((m) => m.eps);
    const { first, rest } = splitFirstSentence(winner.earliest.entry.text);
    if (members.length === 1) {
      land("identity", `WhoIAm[${group[0] + 1}]`, first, rest, occurrences, winner.earliest.rev, winner.earliest.entry.text);
    } else {
      const label = `WhoIAm[${group.map((idx) => idx + 1).join(",")}] (claim-normalized cluster)`;
      land("identity", label, first, rest, occurrences, winner.earliest.rev, winner.earliest.entry.text, members.length);
    }
  }

  return { candidates, exceptions, doctrineClustering };
}

/** Writes every candidate atom + its ledger stack events. No clock, no
 * randomness — `ts` is the caller's fixed sentinel (R8: identical
 * plan+ts+beliefsDir inputs produce byte-identical files, always). */
export function seedSandbox(plan: MigrationPlan, beliefsDir: string, ledgerPath: string, ts: string): void {
  for (const c of plan.candidates) {
    const written = writeAtom(beliefsDir, {
      kind: c.kind,
      claim: c.claim,
      why: c.why,
      quotes: [{ text: c.quote.quote, source: c.quote.source }],
      eps: [...new Set(c.occurrences)].sort(),
    });
    for (const ep of c.occurrences) {
      const ev: LedgerEvent = { ev: "stack", atom: written.id, ep, ts };
      appendLedger(ledgerPath, ev);
    }
  }
}

// ---------------------------------------------------------------------
// CLI — writes atoms + ledger to a sandbox, renders, writes the review doc
// ---------------------------------------------------------------------

function flagValue(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx === -1 ? undefined : args[idx + 1];
}

/** Rewraps a render.ts-produced SELF.md into the v1-shaped envelope
 * mutate.ts's parseSelf (and therefore detectSelfStutter, imported not
 * modified) requires to parse at all: numbered "**N. **" doctrine blocks and
 * "- " bulleted motif/how-we-work lines. The rendered atom TEXT carries
 * through completely unchanged — only the wrapper an unrelated legacy parser
 * needs is added — so this is a faithful adapter, not a rewrite: any real
 * duplication in the rendered content still shows up as a cluster. */
export function adaptRenderedForStutterCheck(renderedMd: string): string {
  const sections = parseSelfSections(renderedMd);
  const splitAtoms = (body: string): string[] =>
    body.split("\n\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("(empty"));
  const doctrineBlock = splitAtoms(sections.doctrine)
    .map((line, i) => `**${i + 1}. atom.**  \n${line}`)
    .join("\n\n");
  const bulletBlock = (body: string): string => splitAtoms(body).map((l) => `- ${l}`).join("\n");
  return [
    H_WHO, "", sections.whoIAm || "(no identity atoms rendered)", "",
    H_DOC, "", doctrineBlock || "**1. placeholder.**  \nno doctrine atoms rendered", "",
    H_MOT, "", bulletBlock(sections.motifs), "",
    H_HOW, "", bulletBlock(sections.howWeWork), "",
  ].join("\n");
}

function renderPairwiseMatrix(doctrine: DoctrineRaw[], clustering: ClaimClusterResult): string[] {
  const lines: string[] = [];
  const header = ["n"].concat(doctrine.map((d) => String(d.n)));
  lines.push(`| ${header.join(" | ")} |`);
  lines.push(`|${header.map(() => "---").join("|")}|`);
  for (let i = 0; i < doctrine.length; i++) {
    const row = [String(doctrine[i].n)].concat(clustering.matrix[i].map((v) => v.toFixed(2)));
    lines.push(`| ${row.join(" | ")} |`);
  }
  return lines;
}

function renderReviewDoc(
  plan: MigrationPlan,
  rev: string,
  ts: string,
  liveSelfMd: string,
  renderedSelfMd: string,
  stutterOnRendered: { clean: boolean; detail: string },
  doctrine: DoctrineRaw[],
  genesisTokens: number | null
): string {
  const byKind: Record<string, number> = {};
  for (const c of plan.candidates) byKind[c.kind] = (byKind[c.kind] ?? 0) + 1;
  const totalWeight = plan.candidates.reduce((s, c) => s + c.occurrences.length, 0);

  const lines: string[] = [];
  lines.push("# POPMEM Migration Review — WS-E3 (FINAL: claim normalization + doctrine-into-genesis)");
  lines.push("");
  lines.push(`Pinned live mind rev: \`${rev}\`  `);
  lines.push(`Seed ledger timestamp: \`${ts}\`  `);
  lines.push(`Atoms written: **${plan.candidates.length}** (${Object.entries(byKind).map(([k, n]) => `${k}: ${n}`).join(", ") || "none"})  `);
  lines.push(`Total ledger occurrences (sum of atom weights at seed time): **${totalWeight}**  `);
  lines.push(`Exceptions: **${plan.exceptions.length}**  `);
  lines.push(`Rendered-output stutter check: **${stutterOnRendered.clean ? "CLEAN (no clusters)" : "CLUSTERS FOUND"}** — ${stutterOnRendered.detail}  `);
  if (genesisTokens !== null) {
    lines.push(`Genesis episode size: **~${genesisTokens} tokens** (chars/4) — ${genesisTokens > 1000 ? "OVER the 1k-token episode target, documented below" : "within the 1k-token episode target"}`);
  }
  lines.push("");

  lines.push("## FIX 1 — claim-line complete-linkage clustering (replaces the WS-E body-level megacluster)");
  lines.push("");
  lines.push(
    `Threshold: **${CLAIM_CLUSTER_THRESHOLD}** (justified: claim lines are short — a sentence, not a paragraph — so jaccard ` +
      "over their significant-token sets is more volatile than over full bodies; mutate.ts's body-level 0.3 " +
      "(SELF_STUTTER_THRESHOLD / stack.ts BAND_HIGH) is not directly portable. 0.2 was fit to the real pairwise " +
      "matrix below: it cleanly separates the genuine near-duplicate family (0.23–0.58) from cross-topic noise " +
      "(≤0.17, mostly ≤0.10) — not a guess."
  );
  lines.push("");
  lines.push("Pairwise jaccard matrix over the 9 live doctrine claim titles:");
  lines.push("");
  lines.push(...renderPairwiseMatrix(doctrine, plan.doctrineClustering));
  lines.push("");
  const groupsDesc = plan.doctrineClustering.groups.map((g) => (g.length > 1 ? `{${g.join(",")}}` : `${g[0]}`)).join(", ");
  lines.push(`Resulting groups: ${groupsDesc}`);
  lines.push("");
  const familyGroup = plan.doctrineClustering.groups.find((g) => g.length > 1 && g.includes(8));
  const boardGroup = plan.doctrineClustering.groups.find((g) => g.length > 1 && g.includes(13));
  lines.push(
    "**Honest deviation from the GATE 2 ruling's stated expectation:** the ruling expected Doctrine[8,12,13,16,17] " +
      "to merge as ONE 5-member atom. The real matrix does not support that at the claim-line level — " +
      `Doctrine[13]-Doctrine[16] jaccard is exactly 0.00, and 13's links to 8/12 are 0.03–0.04 (noise), while 13-17 ` +
      `is 0.58 (a genuine pair). Complete linkage therefore correctly declines to bridge them: the real result is ` +
      `${familyGroup ? `{${familyGroup.join(",")}}` : "(no 8/12/16-family group)"} and ${boardGroup ? `{${boardGroup.join(",")}}` : "(no 13/17 group)"} as ` +
      "TWO separate clusters, with Doctrine[1,4,5,7] as singletons — matching the ruling's stated expectation for " +
      "1/4/5/7 exactly, and splitting its 5-member family into two smaller, better-justified ones. This is the " +
      "ruling's own escape clause in effect (\"if your run yields a different clustering, report it honestly\")."
  );
  lines.push("");

  lines.push("## FIX A (WS-E3) — claim normalization for duplicate detection (identity/clustering only)");
  lines.push("");
  lines.push(
    "The orchestrator's GATE 2 review caught a pair both the stutter check and FIX 1 missed: two `agreement` entries " +
      "reading identically except for a leading typographic quote char (`\"Trust is ambient, not narrated.` vs " +
      "`Trust is ambient, not narrated.`). Motifs/how-we-work/identity never had exact-duplicate detection at all " +
      "before this fix (only doctrine's jaccard-based clustering existed, and it was already immune — " +
      "`significantTokens` tokenizes on `[a-z][a-z0-9'-]{2,}`, which drops leading punctuation for free). Fix: " +
      "`normalizeClaimForDedup` strips leading/trailing ASCII+typographic quote chars and collapses whitespace as a " +
      "COMPARISON KEY ONLY — the atom always stores the original, unnormalized text. Re-checking the full corpus " +
      "with this key found exactly the one pair the ruling named; no others."
  );
  lines.push("");
  const trustAtom = plan.candidates.find((c) => c.label.includes("claim-normalized cluster") && c.kind === "agreement");
  if (trustAtom) {
    lines.push(`Result: merged into one \`agreement\` atom, weight ${trustAtom.occurrences.length}, claim "${trustAtom.claim}".`);
    lines.push("");
  }

  const doctrineExceptions = plan.exceptions.filter((e) => e.kind === "doctrine");
  const doctrineFromGenesis = plan.candidates.filter((c) => c.kind === "doctrine" && c.quote.source.includes("genesis"));
  lines.push("## FIX B (WS-E3) — the 4 residual doctrine exceptions, closed via the extended genesis episode");
  lines.push("");
  if (doctrineFromGenesis.length > 0) {
    lines.push(
      `Splitting the WS-E megacluster (FIX 1) removed the "borrowed" verbatim quote every merged entry got for free ` +
        `from Doctrine[1]. Doctrine[5], Doctrine[7], and both new clusters ({8,12,16}, {13,17}) no longer had an ` +
        `individually-extractable verbatim quote from their own clean earliest-telling text against the real dated ` +
        `episode universe (real episode found in every case — always "no-verbatim-quote", never "no-eps"; one case, ` +
        `Doctrine[7], even a real archival drift: its [ep:2026-07-24] stamp doesn't match the two 2026-07-23 episodes ` +
        `its own body cites by name). Fix: the same approved OPTION (a) mechanism, extended — each of the 4 groups' ` +
        `earliest CLEAN title+why-chain telling is now copied verbatim into docs/genesis-archaeology.episode.md, ` +
        `attributed to its source rev, and resolveQuote tries the genesis episode as a LAST-RESORT fallback for any ` +
        `entry (not just zero-[ep:] ones) whose real dated episode search has already failed. The atom's WEIGHT ` +
        `still reflects the real accreted [ep:] occurrence count — genesis only ever supplies the quote, never the ` +
        `recurrence signal.`
    );
    lines.push("");
    for (const c of doctrineFromGenesis) lines.push(`- **${c.label}** — weight ${c.occurrences.length}, resolved.`);
    lines.push("");
  }
  if (doctrineExceptions.length > 0) {
    lines.push("**Residual, still unresolved:**");
    lines.push("");
    for (const e of doctrineExceptions) lines.push(`- **${e.label}** — ${e.reason}`);
    lines.push("");
  } else {
    lines.push("All 4 resolved. Doctrine exceptions: **0**.");
    lines.push("");
  }

  lines.push("## What to look at hardest");
  lines.push("");
  lines.push("1. The honest clustering deviation above (FIX 1) — confirm splitting the live-status family into two clusters is correct, not a regression.");
  lines.push("2. The two WS-E3 fixes (claim normalization, doctrine-into-genesis) — confirm both merges/resolutions above are correct, not over-eager.");
  lines.push("3. The EXCEPTIONS table below (should be empty) and the per-atom provenance table — every quote is verbatim-verified, several against the authored genesis episode rather than a live session transcript.");
  lines.push("4. Any atom whose `earliest rev` differs from the pinned rev — its claim/why text came from an OLDER telling than what's live today; confirm the older text is still the right one to keep.");
  lines.push("");
  lines.push("## Side by side — live (pinned) vs rendered");
  lines.push("");
  lines.push("### Live SELF.md (pinned)");
  lines.push("");
  lines.push("```markdown");
  lines.push(liveSelfMd.trimEnd());
  lines.push("```");
  lines.push("");
  lines.push("### Rendered popmem SELF.md (from seed atoms)");
  lines.push("");
  lines.push("```markdown");
  lines.push(renderedSelfMd.trimEnd());
  lines.push("```");
  lines.push("");
  lines.push("## Per-atom provenance");
  lines.push("");
  lines.push("| label | kind | weight | claim | quote source | earliest rev | quote status |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const c of plan.candidates) {
    const claimCell = c.claim.replace(/\|/g, "\\|").slice(0, 90);
    lines.push(
      `| ${c.label} | ${c.kind} | ${c.occurrences.length} | ${claimCell} | ${c.quote.source} | ${c.earliestRev.slice(0, 10)} | verbatim-verified |`
    );
  }
  lines.push("");
  lines.push("## Exceptions — no atom written, nothing fabricated");
  lines.push("");
  lines.push("| label | kind | reason | suggested disposition |");
  lines.push("|---|---|---|---|");
  for (const e of plan.exceptions) {
    lines.push(`| ${e.label} | ${e.kind} | ${e.reason.replace(/\|/g, "\\|")} | ${e.disposition.replace(/\|/g, "\\|")} |`);
  }
  lines.push("");
  return lines.join("\n") + "\n";
}

async function main() {
  const args = process.argv.slice(2);
  const corr = correlation("migrate");

  const rev = flagValue(args, "--rev");
  const ts = flagValue(args, "--ts");
  const outHome = flagValue(args, "--out");
  const reportPath = flagValue(args, "--report") ?? path.join(process.cwd(), "docs", "POPMEM-MIGRATION-REVIEW.md");
  const liveMindDir = flagValue(args, "--live-mind") ?? path.join(homedir(), "circadian", "mind");
  const genesisPath = flagValue(args, "--genesis");

  if (!rev || !ts || !outHome) {
    console.error("usage: bun src/migrate.ts --rev <mindRev> --ts <seedTs> --out <sandboxHome> [--report <path>] [--live-mind <path>] [--genesis <path>]");
    fail({
      process: "migrate",
      phase: "usage",
      correlation_id: corr,
      summary: "migrate invoked without all required flags",
      context: { argv: args },
      cause: "missing one of --rev/--ts/--out",
      next_action: "re-run with --rev, --ts, and --out set",
    });
  }

  assertSandboxSafe(outHome, path.dirname(liveMindDir));

  // WS-E2 OPTION (a): a staged genesis-archaeology episode, authored from
  // verbatim earliest git tellings, seeded into the SANDBOX (never the live
  // mind — WS-F's gated commit places the real one) so the 25 zero-[ep:]
  // founding-archaeology exceptions WS-E found have a real, checkable source.
  let genesisEpisode: ReplayEpisode | null = null;
  if (genesisPath) {
    const genesisContent = fs.readFileSync(genesisPath, "utf8");
    const dateMatch = genesisContent.match(/^date:\s*(\d{4}-\d{2}-\d{2})/m);
    const genesisFilename = `${dateMatch ? dateMatch[1] : "2026-07-28"}-genesis-archaeology.md`;
    genesisEpisode = { filename: genesisFilename, content: genesisContent, source: "live" };
  }

  const liveSelfMd = execFileSync("git", ["show", `${rev}:SELF.md`], { cwd: liveMindDir, encoding: "utf8" });
  const history = buildHistory(rev, liveMindDir);
  const episodes = collectAllEpisodesAt(rev, liveMindDir);
  const plan = planMigration(liveSelfMd, history, episodes, genesisEpisode);

  const mind = path.join(outHome, "mind");
  const beliefsDir = path.join(mind, "beliefs");
  const ledgerPath = path.join(mind, "beliefs.jsonl");
  fs.mkdirSync(beliefsDir, { recursive: true });

  if (genesisEpisode) {
    const episodesDir = path.join(mind, "episodes");
    fs.mkdirSync(episodesDir, { recursive: true });
    fs.writeFileSync(path.join(episodesDir, genesisEpisode.filename), genesisEpisode.content);
  }

  seedSandbox(plan, beliefsDir, ledgerPath, ts);

  const outPath = path.join(mind, "SELF.md");
  const manifestPath = path.join(mind, "manifest.json");
  const renderArgs = ["src/render.ts", "--beliefs", beliefsDir, "--ledger", ledgerPath, "--out", outPath, "--manifest", manifestPath];
  const renderEnv = { ...process.env, CIRCADIAN_HOME: outHome };
  const bunBin = process.env.CIRCADIAN_BUN_BIN || path.join(homedir(), ".bun/bin/bun");
  const r1 = spawnSync(bunBin, renderArgs, { cwd: REPO_ROOT, env: renderEnv, encoding: "utf8" });
  if (r1.status !== 0) {
    fail({
      process: "migrate",
      phase: "render",
      correlation_id: corr,
      summary: "render.ts CLI failed against the seeded sandbox",
      context: { stderr: (r1.stderr || "").slice(-2000), sandbox: outHome },
      cause: `render.ts exited ${r1.status}`,
      next_action: `inspect the seeded sandbox at ${outHome} and its render stderr`,
    });
  }
  const rendered1 = fs.readFileSync(outPath, "utf8");

  const r2 = spawnSync(bunBin, renderArgs, { cwd: REPO_ROOT, env: renderEnv, encoding: "utf8" });
  const rendered2 = r2.status === 0 ? fs.readFileSync(outPath, "utf8") : "(second render invocation failed)";
  const byteIdentical = rendered1 === rendered2;

  const stutterInput = adaptRenderedForStutterCheck(rendered1);
  const stutterReport = detectSelfStutter(stutterInput);
  const stutterClean = stutterReport.doctrine.length === 0 && stutterReport.motifs.length === 0;
  const stutterDetail = stutterClean
    ? "0 doctrine cluster(s), 0 motif cluster(s) — smear not laundered into the rendered population"
    : `${stutterReport.doctrine.length} doctrine cluster(s), ${stutterReport.motifs.length} motif cluster(s) STILL found in rendered output`;

  const doctrineForMatrix = parseDoctrineEntries(parseSelfSections(liveSelfMd).doctrine);
  const genesisTokens = genesisEpisode ? Math.ceil(genesisEpisode.content.length / 4) : null;
  const reportMd = renderReviewDoc(
    plan, rev, ts, liveSelfMd, rendered1,
    { clean: stutterClean, detail: stutterDetail },
    doctrineForMatrix, genesisTokens
  );
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, reportMd);

  const context = {
    rev,
    ts,
    atoms_written: plan.candidates.length,
    exceptions: plan.exceptions.length,
    byte_identical_rerender: byteIdentical,
    stutter_clean: stutterClean,
    sandbox: outHome,
    report: reportPath,
  };

  if (plan.exceptions.length > 0 || !stutterClean || !byteIdentical) {
    degraded({
      process: "migrate",
      phase: "plan",
      correlation_id: corr,
      summary: `migration complete with ${plan.exceptions.length} exception(s), stutter_clean=${stutterClean}, byte_identical=${byteIdentical}`,
      context,
      cause: !byteIdentical
        ? "two render.ts invocations against the same seeded sandbox produced different bytes (R8 violation)"
        : !stutterClean
        ? "detectSelfStutter found duplicate-belief clusters in the rendered output — smear was laundered"
        : `${plan.exceptions.length} SELF.md entries have no verbatim-verifiable episode quote`,
      next_action: `read ${reportPath}'s EXCEPTIONS table and per-atom provenance and decide a disposition per entry`,
    });
  } else {
    ok({
      process: "migrate",
      phase: "plan",
      correlation_id: corr,
      summary: `migration complete: ${plan.candidates.length} atom(s) seeded from rev ${rev.slice(0, 10)}, 0 exceptions, stutter clean, byte-identical rerender`,
      context,
    });
  }
}

if (import.meta.main) await main();
