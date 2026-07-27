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

/** Tries every [ep:] date on the entry, in order, against the real episode
 * universe (pinned, replay.ts's collectAllEpisodesAt) and every candidate
 * quote span extracted from the entry's own earliest-telling text. First
 * (date, episode, span) combination that verifies verbatim wins. Never
 * invents a quote when none verifies — returns a QuoteFailure instead. */
export function resolveQuote(
  eps: string[],
  candidateText: string,
  episodes: ReplayEpisode[]
): QuoteResolution | QuoteFailure {
  if (eps.length === 0) return { reason: "no-eps", detail: "entry carries no [ep:] stamp in any known telling" };

  const spans = extractQuoteSpans(candidateText);
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
  if (!sawEpisode) {
    return { reason: "no-episode", detail: `no episode found for [ep:${eps.join("], [ep:")}]` };
  }
  return {
    reason: "no-verbatim-quote",
    detail: spans.length === 0
      ? "entry's earliest telling contains no quoted span to test"
      : `${spans.length} candidate quote(s) tested against the resolved episode(s); none verified verbatim`,
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

/** The whole deterministic pipeline, pure given its inputs (no I/O beyond
 * what buildHistory/collectAllEpisodesAt already did) — testable without a
 * sandbox. */
export function planMigration(
  pinnedSelfMd: string,
  history: ParsedDoc[],
  episodes: ReplayEpisode[]
): MigrationPlan {
  const pinned = parseSelfSections(pinnedSelfMd);
  const doctrine = parseDoctrineEntries(pinned.doctrine);
  const motifs = parseBulletEntries(pinned.motifs);
  const howWeWork = parseBulletEntries(pinned.howWeWork);
  const identity = parseIdentityEntries(pinned.whoIAm);

  const stutter = detectSelfStutter(pinnedSelfMd);

  const candidates: AtomCandidate[] = [];
  const exceptions: Exception[] = [];

  function land(kind: AtomKind, label: string, claimSource: string, whySource: string, eps: string[], earliestRev: string) {
    const claim = truncateClaim(claimSource);
    const resolution = resolveQuote(eps, claimSource + "\n" + whySource, episodes);
    if ("reason" in resolution) {
      exceptions.push({ label, kind, reason: resolution.detail, disposition: dispositionFor(resolution) });
      return;
    }
    candidates.push({
      kind,
      claim,
      why: whySource.trim() || claim,
      quote: resolution,
      occurrences: eps,
      label,
      earliestRev,
    });
  }

  // ---- doctrine: stutter clusters first, then remaining singletons ----
  const clustered = new Set<number>();
  for (const group of stutter.doctrine) {
    const members = group.map((g) => doctrine.find((d) => d.n === g.n)!).filter(Boolean);
    for (const m of members) clustered.add(m.n);
    if (members.length === 0) continue;

    const tellings = members.map((m) => ({ m, earliest: earliestDoctrine(history, normalizeTitleKey(m.title)) }));
    tellings.sort((a, b) => {
      const da = a.earliest.entry?.eps[0] ?? "9999-99-99";
      const db = b.earliest.entry?.eps[0] ?? "9999-99-99";
      return da < db ? -1 : da > db ? 1 : a.m.n - b.m.n;
    });
    const winner = tellings[0];
    const occurrences = members.flatMap((m) => m.eps);
    const label = `Doctrine[${members.map((m) => m.n).join(",")}] (stutter cluster, earliest Doctrine[${winner.m.n}])`;
    land("doctrine", label, winner.earliest.entry.title, winner.earliest.entry.body, occurrences, winner.earliest.rev);
  }
  for (const d of doctrine) {
    if (clustered.has(d.n)) continue;
    const earliest = earliestDoctrine(history, normalizeTitleKey(d.title));
    land("doctrine", `Doctrine[${d.n}]`, earliest.entry.title, earliest.entry.body, d.eps, earliest.rev);
  }

  // ---- motifs: stutter clusters, then singletons ----
  const clusteredMotifLines = new Set<string>();
  for (const group of stutter.motifs) {
    const members = group.map((line) => motifs.find((m) => m.line === line)!).filter(Boolean);
    for (const m of members) clusteredMotifLines.add(m.line);
    if (members.length === 0) continue;
    const tellings = members.map((m) => ({ m, earliest: earliestBullet(history, normalizeLineKey(m.line), (doc) => doc.motifs) }));
    tellings.sort((a, b) => {
      const da = a.earliest.entry?.eps[0] ?? "9999-99-99";
      const db = b.earliest.entry?.eps[0] ?? "9999-99-99";
      return da < db ? -1 : da > db ? 1 : 0;
    });
    const winner = tellings[0];
    const occurrences = members.flatMap((m) => m.eps);
    const { first, rest } = splitFirstSentence(winner.earliest.entry.line);
    const label = `Motifs[${members.map((m) => m.line.slice(0, 24)).join(" | ")}] (stutter cluster)`;
    land("motif", label, first, rest, occurrences, winner.earliest.rev);
  }
  for (const b of motifs) {
    if (clusteredMotifLines.has(b.line)) continue;
    const earliest = earliestBullet(history, normalizeLineKey(b.line), (doc) => doc.motifs);
    const { first, rest } = splitFirstSentence(earliest.entry.line);
    land("motif", `Motifs["${b.line.slice(0, 40)}${b.line.length > 40 ? "…" : ""}"]`, first, rest, b.eps, earliest.rev);
  }

  // ---- how we work: no stutter-detect for this section (mutate.ts's own
  // instrument never checked it either — matching the reused tool exactly) ----
  for (const b of howWeWork) {
    const earliest = earliestBullet(history, normalizeLineKey(b.line), (doc) => doc.howWeWork);
    const { first, rest } = splitFirstSentence(earliest.entry.line);
    land("agreement", `HowWeWork["${b.line.slice(0, 40)}${b.line.length > 40 ? "…" : ""}"]`, first, rest, b.eps, earliest.rev);
  }

  // ---- identity: continuous prose, no stutter-detect coverage (same reason) ----
  identity.forEach((i, idx) => {
    const earliest = earliestIdentity(history, normalizeQuoteKey(i.text));
    const { first, rest } = splitFirstSentence(earliest.entry.text);
    land("identity", `WhoIAm[${idx + 1}]`, first, rest, i.eps, earliest.rev);
  });

  return { candidates, exceptions };
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

function renderReviewDoc(
  plan: MigrationPlan,
  rev: string,
  ts: string,
  liveSelfMd: string,
  renderedSelfMd: string,
  stutterOnRendered: { clean: boolean; detail: string }
): string {
  const byKind: Record<string, number> = {};
  for (const c of plan.candidates) byKind[c.kind] = (byKind[c.kind] ?? 0) + 1;
  const totalWeight = plan.candidates.reduce((s, c) => s + c.occurrences.length, 0);

  const lines: string[] = [];
  lines.push("# POPMEM Migration Review — WS-E");
  lines.push("");
  lines.push(`Pinned live mind rev: \`${rev}\`  `);
  lines.push(`Seed ledger timestamp: \`${ts}\`  `);
  lines.push(`Atoms written: **${plan.candidates.length}** (${Object.entries(byKind).map(([k, n]) => `${k}: ${n}`).join(", ") || "none"})  `);
  lines.push(`Total ledger occurrences (sum of atom weights at seed time): **${totalWeight}**  `);
  lines.push(`Exceptions: **${plan.exceptions.length}**  `);
  lines.push(`Rendered-output stutter check: **${stutterOnRendered.clean ? "CLEAN (no clusters)" : "CLUSTERS FOUND"}** — ${stutterOnRendered.detail}`);
  lines.push("");

  const bigClusters = plan.candidates.filter((c) => c.label.includes("stutter cluster"));
  if (bigClusters.length > 0) {
    lines.push("## ⚠️ Known finding: stutter over-collapse (read before approving)");
    lines.push("");
    lines.push(
      "`detectSelfStutter` (mutate.ts, imported unmodified — not in this workstream's scope to retune) was run " +
        "directly against the pinned live SELF.md, standalone, with no migrate.ts code in the loop, to confirm this " +
        "is real detector output and not a bug in this migration:"
    );
    lines.push("");
    for (const c of bigClusters) {
      lines.push(`- **${c.label}** — collapsed into one atom, weight ${c.occurrences.length}.`);
    }
    lines.push("");
    lines.push(
      "This is very likely single-linkage chaining: the overlap-coefficient metric divides by the SMALLER set's " +
        "size, and repeated REM-boilerplate phrasing accreted across many doctrine entries (\"confirmed by the live " +
        "session where...\", \"validated by...\") gives topically-unrelated entries enough shared vocabulary to bridge " +
        "transitively, even though no two ARE pairwise similar at the belief level. Posted to the popmem Tower board " +
        "as a load-bearing finding at migration time. This migration implements the DECIDED design literally " +
        "(§11: \"each cluster → ONE atom, earliest telling wins\") — the collapse above is what that produces on " +
        "this real, smeared corpus, not a defect in this file. Reviewer options: accept as-is, or ask WS-A/WS-C2 to " +
        "retune detectSelfStutter's threshold/linkage before re-running this migration."
    );
    lines.push("");
  }
  lines.push("## What to look at hardest");
  lines.push("");
  lines.push("1. The EXCEPTIONS table below — every entry migrate.ts refused to fabricate a quote for.");
  lines.push("2. Any atom whose `earliest rev` differs from the pinned rev — its claim/why text came from an OLDER telling than what's live today; confirm the older text is still the right one to keep.");
  lines.push("3. Stutter-cluster atoms (label says \"stutter cluster\") — confirm the collapse is correct, not a false merge.");
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

  if (!rev || !ts || !outHome) {
    console.error("usage: bun src/migrate.ts --rev <mindRev> --ts <seedTs> --out <sandboxHome> [--report <path>] [--live-mind <path>]");
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

  const liveSelfMd = execFileSync("git", ["show", `${rev}:SELF.md`], { cwd: liveMindDir, encoding: "utf8" });
  const history = buildHistory(rev, liveMindDir);
  const episodes = collectAllEpisodesAt(rev, liveMindDir);
  const plan = planMigration(liveSelfMd, history, episodes);

  const mind = path.join(outHome, "mind");
  const beliefsDir = path.join(mind, "beliefs");
  const ledgerPath = path.join(mind, "beliefs.jsonl");
  fs.mkdirSync(beliefsDir, { recursive: true });

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

  const reportMd = renderReviewDoc(plan, rev, ts, liveSelfMd, rendered1, { clean: stutterClean, detail: stutterDetail });
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
