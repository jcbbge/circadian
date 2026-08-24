#!/usr/bin/env bun
/**
 * rem-popmem.ts — the composite REM payload (popmem WS-F, docs/POPULATION-MEMORY.md
 * §12 WS-F, templates/MIND-SPEC.md "The REM payload").
 *
 * Replaces rem.ts's editor-grammar wave as the scheduled job. One run does,
 * in order (the spec's exact sequence): stack(new episodes) -> propagation
 * judgment -> decay -> render -> greeting -> mind commit.
 *
 *   1. ABSORB: every mind/episodes/*.md file not yet in digested.jsonl
 *      (content-hash identity, the rem.ts pattern) is stacked via
 *      stack.ts's exported `stackEpisode` (direct import — one EXTRACT call
 *      per episode, no monolithic prompt, so no AIMD batching is needed the
 *      way rem.ts needed it). Each stacked episode's hash is then recorded
 *      into digested.jsonl by THIS file (stack.ts's own CLI never does this
 *      — it is a pure gauntlet payload that only knows the filenames it was
 *      handed) so wake.ts/status.ts's backlog counts drop.
 *   2. PROPAGATION JUDGMENT (bounded LLM call a, via llm.ts): enumerates the
 *      addresses currently "live" -- the OLD render-manifest.json (SELF.*,
 *      still valid: this cycle's render hasn't run yet) plus NOW.md's
 *      sections (NOW.*, rem.ts's address format) -- and asks which of them
 *      propagated into the episode(s) just stacked in step 1. Output is
 *      recorded on THIS cycle's scoreboard rem event; the NEXT cycle's decay
 *      step (step 3, reading scoreboard rem events by ts) is what actually
 *      turns it into potentiate ledger events. Skipped entirely (no LLM
 *      call) when nothing new was stacked this cycle.
 *   3. DECAY: decay.ts's own pure functions (computePotentiateEvents,
 *      computeSankBelowFloor, DECAY_FACTOR), reused unmodified -- this is
 *      the "direct import" path the brief calls for. Consumes scoreboard
 *      rem events from PRIOR cycles via the ledger's own high-water mark
 *      (decay.ts's `findNewRemEvents`), against the manifest still on disk
 *      from the LAST render. Appends potentiate events then one decay event.
 *   4. RENDER: render.ts's pure `renderSelf`, fold(beliefs/, ledger) ->
 *      SELF.md + render-manifest.json (the canonical filename decay.ts's
 *      CLI already expects -- see the R8/manifest-naming note below).
 *      Immediately re-asserted (R8): fresh readAtoms/readLedger from disk,
 *      re-render, byte-compare against what was just written. A mismatch
 *      aborts BEFORE the greeting/commit phases (obs.fail(), never a
 *      committed divergence).
 *   5. GREETING (bounded LLM call b, via llm.ts): NOW.md + the top-weight
 *      active atoms (by folded weight, across all sections) -> <=3 lines,
 *      anchor-aware (Law 8: orients to the work, never to the memory
 *      system). Structurally validated (line count, non-empty); a malformed
 *      completion writes nothing new -- greeting.md is left untouched and a
 *      degraded event is emitted, never a retry loop (llm.ts's finish_reason
 *      is always "stop"; shape is the only defense).
 *   6. MIND COMMIT: scoreboard rem event (worldview_tokens, propagated from
 *      step 2, composted: [] -- nothing composts in the population-memory
 *      world; the sank-below-floor list lives in the commit body instead),
 *      greeting.md write, git add + one commit. Subject/body convention is
 *      this file's own choice (documented at buildCommitMessage below).
 *
 * MANIFEST NAMING (found this session, not a design decision): decay.ts
 * hard-codes `mind/render-manifest.json` (its MANIFEST_PATH) but migrate.ts's
 * CLI writes its own render's manifest to `mind/manifest.json` (its own
 * `--manifest` flag value) -- the two files are NOT the same name. This file
 * always writes to render-manifest.json (matching decay.ts, the consumer
 * that matters for the live schedule); docs/switchover/RUNBOOK.md's "first
 * render" step uses `--manifest <mind>/render-manifest.json` explicitly so
 * the very first live render already uses the canonical name decay's
 * potentiation logic depends on. migrate.ts's own manifest.json copy is
 * harmless leftover (used only by migrate's own byte-identical review check)
 * and is not read by anything else.
 *
 * SCHEDULING GUARDS (--if-due): own copy of rem.ts's REM_SLOT_HOURS/isDue
 * logic (house style: decay.ts's own countSrcLoc comment -- "each process
 * keeps its own copy of this small helper" -- rem.ts's version is not
 * exported and rem.ts is not to be extended, program brief §3). "due" means
 * the most recent scheduled slot that has already passed has not yet had a
 * successful rem-popmem run (scoreboard's last "rem" event ts).
 *
 * Law 9: every phase emits a context-bound obs event under process "rem"
 * (the union already covers it -- no obs.ts edit needed).
 */

import * as fs from "fs";
import { logInvocation } from "./invocation-ledger.ts";
import * as path from "path";
import { homedir } from "os";
import { createHash } from "crypto";
import { execFileSync, spawnSync } from "child_process";
import {
  readAtoms,
  readLedger,
  appendLedger,
  foldWeights,
  type Atom,
  type AtomState,
  type LedgerEvent,
} from "./atoms.ts";
import { renderSelf, RENDER_FLOOR, type RenderManifestEntry } from "./render.ts";
import { stackEpisode, type StackCounts, type StackEpisodeResult } from "./stack.ts";
import { DECAY_FACTOR, computePotentiateEvents, computeSankBelowFloor, type RemPropagationEvent } from "./decay.ts";
import { detectSelfStutter } from "./immune.ts";
import { adaptRenderedForStutterCheck, parseSelfSections } from "./migrate.ts";
import { sweepMeals } from "./janitor.ts";
import { buildIndex, updateIndex, loadIndex, saveIndex } from "./relindex.ts";
import { complete } from "./llm.ts";
import { ok, idle, degraded, fail, correlation } from "./obs.ts";

// ---------------------------------------------------------------------
// paths (per MIND-SPEC.md / rem.ts's CIRCADIAN_HOME contract)
// ---------------------------------------------------------------------
const CIRCADIAN_HOME = process.env.CIRCADIAN_HOME || path.join(homedir(), "circadian");
const MIND_DIR = path.join(CIRCADIAN_HOME, "mind");
const BELIEFS_DIR = path.join(MIND_DIR, "beliefs");
const LEDGER_PATH = path.join(MIND_DIR, "beliefs.jsonl");
const MANIFEST_PATH = path.join(MIND_DIR, "render-manifest.json"); // canonical -- see module header
const SELF_PATH = path.join(MIND_DIR, "SELF.md");
const NOW_PATH = path.join(MIND_DIR, "NOW.md");
const GREETING_PATH = path.join(MIND_DIR, "greeting.md");
const SCOREBOARD_PATH = path.join(MIND_DIR, "scoreboard.jsonl");
const DIGESTED_PATH = path.join(MIND_DIR, "digested.jsonl");
const EPISODES_DIR = path.join(MIND_DIR, "episodes");
const IO_LOG_PATH = path.join(CIRCADIAN_HOME, "logs", "stacker-io.jsonl");
const VITALS_PATH = path.join(CIRCADIAN_HOME, "logs", ".population-vitals.json");
// Single-flight lock for --if-due: wake.ts fires one catch-up per session, so a
// slow/hung LLM run could otherwise stack N duplicates (18 reaped 2026-08-06).
// The scoreboard due-check only guards on COMPLETED slots; an in-flight run that
// never writes its completion event is invisible to it. This lock closes that
// gap structurally — a live holder means bail immediately.
const IFDUE_LOCK_PATH = path.join(CIRCADIAN_HOME, "logs", ".rem-popmem.ifdue.lock");

// Acquire the --if-due single-flight lock. Returns a release fn on success, or
// null if a LIVE process already holds it (caller must bail). Stale locks (dead
// PID, or older than maxAgeMs) are reclaimed. Never throws — lock failure must
// not take wake down (Law 7).
function acquireIfDueLock(maxAgeMs = 30 * 60 * 1000): (() => void) | null {
  try {
    fs.mkdirSync(path.dirname(IFDUE_LOCK_PATH), { recursive: true });
    if (fs.existsSync(IFDUE_LOCK_PATH)) {
      let holderPid = 0;
      let heldMs = Infinity;
      try {
        const raw = JSON.parse(fs.readFileSync(IFDUE_LOCK_PATH, "utf8"));
        holderPid = Number(raw.pid) || 0;
        heldMs = Date.now() - (Number(raw.ts) || 0);
      } catch {
        // unparseable lock -> treat as stale, reclaim below
      }
      let holderAlive = false;
      if (holderPid > 0) {
        try { process.kill(holderPid, 0); holderAlive = true; } catch { holderAlive = false; }
      }
      if (holderAlive && heldMs < maxAgeMs) return null; // live holder -> bail
      try { fs.unlinkSync(IFDUE_LOCK_PATH); } catch { /* reclaim best-effort */ }
    }
    fs.writeFileSync(IFDUE_LOCK_PATH, JSON.stringify({ pid: process.pid, ts: Date.now() }), { flag: "wx" });
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      try {
        const raw = JSON.parse(fs.readFileSync(IFDUE_LOCK_PATH, "utf8"));
        if (Number(raw.pid) === process.pid) fs.unlinkSync(IFDUE_LOCK_PATH);
      } catch { /* already gone / not ours */ }
    };
    process.once("exit", release);
    return release;
  } catch {
    // wx race (another run won the create) or FS error -> treat as "held", bail.
    return null;
  }
}

function readOrEmpty(p: string): string {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}
function tokensOf(s: string): number {
  return Math.ceil(s.length / 4);
}

// ---------------------------------------------------------------------
// scheduling guard -- own copy, see module header
// ---------------------------------------------------------------------
export const REM_SLOT_HOURS = [9, 21];

export function mostRecentSlot(now: Date): Date {
  const candidates: Date[] = [];
  for (const dayOffset of [0, -1]) {
    for (const h of REM_SLOT_HOURS) {
      const d = new Date(now);
      d.setDate(d.getDate() + dayOffset);
      d.setHours(h, 0, 0, 0);
      if (d.getTime() <= now.getTime()) candidates.push(d);
    }
  }
  return candidates.reduce((a, b) => (a.getTime() >= b.getTime() ? a : b));
}

interface ScoreboardRemTs {
  ts: string;
  type: string;
}

/** Last scoreboard event with type "rem", by array position (append order). */
export function lastRemTs(events: ScoreboardRemTs[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === "rem") return events[i].ts;
  }
  return null;
}

/** "due" iff no rem-popmem run has completed since the current slot opened. */
export function isDue(events: ScoreboardRemTs[], now: Date): boolean {
  const slot = mostRecentSlot(now);
  const last = lastRemTs(events);
  if (!last) return true;
  const lastMs = Date.parse(last);
  if (Number.isNaN(lastMs)) return true;
  return lastMs < slot.getTime();
}

// Consecutive-failure budget (work items 1/3, CORD's ruling; precedent
// PENDING_ATTEMPTS_CAP at src/sleep.ts:83): a failed pass still writes a
// scoreboard "rem" event (burning its slot, same as a success -- isDue()
// above already treats any "rem" event as "ran this slot", no change
// needed there), so N consecutive failed events at the tail of the
// scoreboard mean N consecutive failed SLOTS, not N consecutive calls.
export const CONSECUTIVE_FAILURE_BUDGET = 3;

interface FailableRemEvent {
  type: string;
  failed?: boolean;
  failure_episode?: string;
}

/** How many trailing "rem" events (most-recent first) carry `failed: true`
 * before hitting a non-failed one, or running out. A successful run (manual
 * or --if-due) appends a non-failed "rem" event, which resets this to 0 --
 * that IS the "clean manual run clears the stuck state" clearing surface;
 * no separate stop-state file is needed since scoreboard.jsonl is already
 * durable and append-only. */
export function consecutiveFailedSlotStreak(events: FailableRemEvent[]): number {
  let streak = 0;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type !== "rem") continue;
    if (!events[i].failed) break;
    streak++;
  }
  return streak;
}

/** The `failure_episode` named by the most recent failed "rem" event, or
 * null once the trailing streak has ended. */
export function lastFailureEpisode(events: FailableRemEvent[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type !== "rem") continue;
    if (!events[i].failed) return null;
    return events[i].failure_episode ?? null;
  }
  return null;
}

function readScoreboardEvents(p: string): any[] {
  const events: any[] = [];
  for (const line of readOrEmpty(p).split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      events.push(JSON.parse(t));
    } catch {
      continue;
    }
  }
  return events;
}

function readScoreboardRemEvents(p: string): RemPropagationEvent[] {
  const out: RemPropagationEvent[] = [];
  for (const e of readScoreboardEvents(p)) {
    if (e && e.type === "rem" && typeof e.ts === "string") out.push({ ts: e.ts, propagated: e.propagated });
  }
  return out;
}

// ---------------------------------------------------------------------
// digested ledger -- content-hash identity (rem.ts's pattern); stack.ts's
// CLI does not write this, so this file owns it.
// ---------------------------------------------------------------------
export interface DigestedEntry {
  ts: string;
  hash: string;
  filename: string;
  // "held-aside" (work items 4/5): an episode-level failure. Its hash still
  // lands here so findNewEpisodes() never re-offers it on the next pass --
  // this IS the durable dead-letter, not a separate file -- and the two
  // failure fields let a human see which episode and why.
  disposition: "absorbed" | "composted" | "held-aside";
  failure_phase?: string;
  failure_cause?: string;
}

export function hashEpisodeContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function loadDigestedHashes(digestedPath: string): Set<string> {
  const set = new Set<string>();
  for (const line of readOrEmpty(digestedPath).split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const e = JSON.parse(t);
      if (e && typeof e.hash === "string" && e.hash) set.add(e.hash);
    } catch {
      continue;
    }
  }
  return set;
}

/** Atomic read-modify-rewrite append (rem.ts's recordDigested pattern):
 * a crash mid-write cannot corrupt prior facts (old file stays intact until
 * the rename lands). No-op on an empty entry list. */
export function recordDigested(digestedPath: string, entries: DigestedEntry[]): void {
  if (entries.length === 0) return;
  const existing = readOrEmpty(digestedPath);
  const addition = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  const next = existing && !existing.endsWith("\n") ? existing + "\n" + addition : existing + addition;
  fs.mkdirSync(path.dirname(digestedPath), { recursive: true });
  const tmp = `${digestedPath}.rem-tmp`;
  fs.writeFileSync(tmp, next, "utf8");
  fs.renameSync(tmp, digestedPath);
}

interface EpisodeFile {
  filename: string;
  filepath: string;
  content: string;
  hash: string;
}

/** New episodes (by content-hash, never mtime): every mind/episodes/*.md
 * file whose hash is not yet in digested.jsonl, oldest filename first. */
export function findNewEpisodes(episodesDir: string, digestedHashes: Set<string>): EpisodeFile[] {
  let files: string[] = [];
  try {
    files = fs.readdirSync(episodesDir).filter((f) => f.endsWith(".md"));
  } catch {
    files = [];
  }
  const episodes: EpisodeFile[] = [];
  for (const f of files) {
    const filepath = path.join(episodesDir, f);
    let content: string;
    try {
      content = fs.readFileSync(filepath, "utf8");
    } catch {
      continue;
    }
    const hash = hashEpisodeContent(content);
    if (!digestedHashes.has(hash)) episodes.push({ filename: f, filepath, content, hash });
  }
  episodes.sort((a, b) => a.filename.localeCompare(b.filename));
  return episodes;
}

// ---------------------------------------------------------------------
// propagation-address enumeration (LLM call a's input) -- SELF.* from the
// OLD render manifest (still valid: this cycle's render hasn't run),
// NOW.* from NOW.md's sections, rem.ts's exact address format.
// ---------------------------------------------------------------------
export interface AddressedItem {
  address: string;
  text: string;
}

const NOW_SECTIONS: readonly [string, string][] = [
  ["Arc", "NOW.Arc"],
  ["Flight plan", "NOW.FlightPlan"],
  ["Live tensions", "NOW.LiveTensions"],
  ["Commitments", "NOW.Commitments"],
  ["Serendipity", "NOW.Serendipity"],
];

function enumerateNowSection(md: string, heading: string, idPrefix: string): AddressedItem[] {
  const lines = md.split("\n");
  const items: AddressedItem[] = [];
  let inSection = false;
  let idx = 0;
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      inSection = line.trim() === `## ${heading}`;
      continue;
    }
    if (inSection && line.trim()) {
      idx += 1;
      items.push({ address: `${idPrefix}[${idx}]`, text: line.trim() });
    }
  }
  return items;
}

export function enumerateNowItems(nowMd: string): AddressedItem[] {
  return NOW_SECTIONS.flatMap(([heading, prefix]) => enumerateNowSection(nowMd, heading, prefix));
}

/** Combines the OLD manifest's SELF.* addresses (resolved to their atom's
 * claim text via the current atom set) with NOW.md's enumerated sections.
 * An address whose atom id has no match in `atomsById` is skipped (a stale
 * manifest entry -- atoms are immutable, so this should not happen against
 * a manifest this file itself wrote, but a hand-edited or foreign manifest
 * must not crash the run). */
export function enumeratePropagationAddresses(
  manifest: RenderManifestEntry[],
  atomsById: Map<string, Atom>,
  nowMd: string
): AddressedItem[] {
  const selfItems: AddressedItem[] = [];
  for (const m of manifest) {
    const atom = atomsById.get(m.atom);
    if (!atom) continue;
    selfItems.push({ address: m.address, text: atom.claim });
  }
  return [...selfItems, ...enumerateNowItems(nowMd)];
}

// ---------------------------------------------------------------------
// LLM call (a): propagation judgment -- structural validation only
// ---------------------------------------------------------------------
export interface PropagationJudgment {
  propagated: string[];
  malformed: boolean;
  unrecognizedCount: number;
}

/** raw must parse as a JSON array; each element must be a string address
 * present in `validAddresses` (unknown addresses are dropped and counted,
 * not fatal -- a model that invents one extra address alongside real ones
 * still carries real signal). A response that isn't valid JSON, or whose
 * top level isn't an array at all, is wholly malformed: empty array,
 * `malformed: true` -- never a retry (llm.ts's finish_reason is always
 * "stop"; shape is the only defense, module header). */
export function parsePropagationResponse(raw: string, validAddresses: string[]): PropagationJudgment {
  const valid = new Set(validAddresses);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    return { propagated: [], malformed: true, unrecognizedCount: 0 };
  }
  if (!Array.isArray(parsed)) return { propagated: [], malformed: true, unrecognizedCount: 0 };
  const propagated: string[] = [];
  let unrecognizedCount = 0;
  for (const item of parsed) {
    if (typeof item !== "string") {
      unrecognizedCount++;
      continue;
    }
    if (valid.has(item)) propagated.push(item);
    else unrecognizedCount++;
  }
  return { propagated: [...new Set(propagated)], malformed: false, unrecognizedCount };
}

const PROPAGATION_TIMEOUT_MS = 90 * 1000;

/** Response budget for the propagation judgment. The artifact is BOUNDED by
 * the input: at most one address string per enumerated item, each rendering
 * as `  "SELF.HowWeWork[13]",\n` — about 10 tokens. The old flat 500 was
 * under that ceiling for a live population (69 items needed ~430-500) and the
 * judge routinely returns nearly every address, so the array was being cut
 * off mid-string; `parsePropagationResponse` then (correctly) called the
 * fragment malformed and the cycle recorded `propagated: []`. That is the
 * whole propagation flatline of 2026-08-12..14 — a budget bug wearing a
 * judgment's clothes (audit 2026-08-14 §P0-1). Sizing from the actual item
 * count removes the ceiling instead of moving it. */
export function propagationMaxTokens(itemCount: number): number {
  return Math.max(500, itemCount * 12 + 64);
}

function buildPropagationPrompt(items: AddressedItem[], newEpisodes: EpisodeFile[]): string {
  const itemLines = items.map((it) => `${it.address}: ${it.text}`).join("\n");
  const episodeBlocks = newEpisodes
    .map((e) => `--- ${e.filename} ---\n${e.text ?? e.content}`)
    .join("\n\n");
  return (
    `You judge which of the mind's current beliefs and current-session items were ` +
    `referenced, acted on, or reinforced by newly recorded episodes.\n\n` +
    `ITEMS (address: text):\n${itemLines}\n\n` +
    `NEW EPISODE(S):\n${episodeBlocks}\n\n` +
    `Respond with ONLY a JSON array of the addresses (strings) whose item clearly ` +
    `propagated into the new episode(s). If none did, respond with []. No prose, ` +
    `no explanation, no markdown fences -- a JSON array literal only.`
  );
}

// ---------------------------------------------------------------------
// LLM call (b): greeting -- structural validation only (Law 8: anchors to
// the work, never to the memory system; semantic anchoring is not
// mechanically checkable, only line-count/non-empty shape is)
// ---------------------------------------------------------------------
export const GREETING_MAX_LINES = 3;

export interface GreetingResult {
  lines: string[];
  malformed: boolean;
}

export function parseGreetingResponse(raw: string, nowMd?: string): GreetingResult {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
  if (lines.length === 0) return { lines: [], malformed: true };
  const capped = lines.slice(0, GREETING_MAX_LINES);
  // Shape gate (Law 8 in the machine): a greeting that names no concrete
  // anchor is a category error -- it mirrors register instead of orienting to
  // the work (Constitution Art. 11/15), which IS the R7 collapse. When NOW.md
  // is supplied we reject an anchorless draft as malformed, so greeting.md is
  // left untouched -- the same safe branch an empty completion already takes.
  // Called with no nowMd, the gate is skipped (pure structural validation),
  // so callers that only care about line-count shape are unaffected.
  if (nowMd !== undefined && !greetingHasAnchor(capped, nowMd)) {
    return { lines: capped, malformed: true };
  }
  // Speakability gate (MIND-SPEC Law 3: "Every wake opens with a greeting
  // composed from memory, placed in the user's face. If it isn't good enough
  // to say out loud, it isn't earning its keep."). The anchor gate above
  // catches the abstraction failure; this one catches its mirror image, which
  // is what the generator ACTUALLY collapsed into once the anchor gate went
  // in — a bare list of addresses that satisfies "name a concrete anchor"
  // while saying nothing. Eight consecutive REM runs shipped greetings like
  //     `CONSUMER-MATRIX.md` in `briefs/tower/w2-consumer-resilience-evidence/`
  //     `tower/w2-consumer-resilience`
  //     `workers/consumer-audit.done`
  // (mind commit 0b27f81; the same shape back through 91a4cbf). Nobody can
  // say that out loud, so nothing it points at can propagate, so no ok
  // verdict is ever earned — the R7 collapse with the anchor test passing.
  // Same safe branch as an anchorless draft: malformed, greeting.md untouched.
  if (nowMd !== undefined && !capped.every(greetingLineIsSpeakable)) {
    return { lines: capped, malformed: true };
  }
  return { lines: capped, malformed: false };
}

/** Minimum spoken words a greeting line must carry OUTSIDE its anchors. Low
 * on purpose: "Verify the write gate under real load" clears it four times
 * over, while a bare path or a lone backticked command clears nothing. */
export const GREETING_MIN_SPOKEN_WORDS = 3;

/** True iff this line is a sentence that happens to contain an anchor, rather
 * than an anchor pretending to be a sentence. Strip the code spans and the
 * path-shaped tokens — the address material — and what is left must still be
 * language. */
export function greetingLineIsSpeakable(line: string): boolean {
  const residue = line
    .replace(/`[^`]*`/g, " ")
    .replace(/[A-Za-z0-9_-]+\/[A-Za-z0-9_./-]+/g, " ")
    .replace(/[A-Za-z0-9_-]+\.[a-z]{1,6}\b/g, " ");
  return (residue.match(/[A-Za-z][A-Za-z0-9'’-]*/g) ?? []).length >= GREETING_MIN_SPOKEN_WORDS;
}

// Common words that carry no anchoring specificity -- their presence in a
// greeting proves nothing about whether it named real work.
const GREETING_STOPWORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "any", "can", "our",
  "out", "has", "how", "new", "now", "its", "let", "put", "say", "too", "use",
  "that", "this", "with", "from", "have", "will", "your", "must", "into", "than",
  "then", "them", "they", "been", "when", "what", "which", "were", "would",
  "there", "their", "about", "these", "those", "some", "such", "only", "over",
  "also", "more", "most", "work", "works", "working", "being", "across",
  "without", "again", "should", "still", "just", "next", "here", "onto", "upon",
]);

// A path/filename (dotted extension or a slash) or a backtick-quoted command:
// unambiguous concrete anchors independent of NOW.md's vocabulary.
const GREETING_PATH_RE = /[A-Za-z0-9_-]+\/[A-Za-z0-9_./-]+|[A-Za-z0-9_-]+\.[a-z]{1,6}\b/;
const CIRCADIAN_REPO_ROOT = path.join(import.meta.dir, "..");

/** Candidate paths for a path-shaped greeting token; directories do not count. */
function greetingPathResolveCandidates(token: string): string[] {
  if (path.isAbsolute(token)) return [token];
  if (token.startsWith("~/")) return [path.join(homedir(), token.slice(2))];
  return [path.join(CIRCADIAN_REPO_ROOT, token), path.join(MIND_DIR, token)];
}

function greetingPathTokenExists(token: string): boolean {
  const normalized = token.replace(/[.,;:!?)]+$/, "");
  for (const candidate of greetingPathResolveCandidates(normalized)) {
    try {
      if (fs.statSync(candidate).isFile()) return true;
    } catch {
      // absent or unreadable — try next candidate
    }
  }
  return false;
}

/** True when a backtick span names a runnable command, not a path dressed as one. */
function greetingHasCommandAnchor(text: string): boolean {
  for (const m of text.matchAll(/`([^`]+)`/g)) {
    if (GREETING_PATH_RE.test(m[1]!)) continue;
    return true;
  }
  return false;
}

/** Distinctive lowercased content tokens from a string (>= 4 chars,
 * non-stopword). The unit of concrete meaning a greeting can reuse. */
function distinctiveTokens(text: string): string[] {
  const out: string[] = [];
  for (const tok of text.match(/[A-Za-z][A-Za-z0-9_.-]{3,}/g) ?? []) {
    const lower = tok.toLowerCase();
    if (!GREETING_STOPWORDS.has(lower)) out.push(lower);
  }
  return out;
}

interface AnchorVocab {
  tokens: Set<string>; // distinctive single tokens from NOW.md's BODY (not headings)
  bigrams: Set<string>; // adjacent distinctive-token pairs, per line, "a\u0000b"
}

/** Extracts the anchor vocabulary from NOW.md's BODY only (headings and the
 * cap comment excluded, so "Arc"/"Flight"/"tensions" never count as anchors).
 * Bigrams are the robust signal: a single shared common word ("truth", "flow")
 * is coincidence, but a shared adjacent PHRASE ("constitution builder",
 * "memory engine") is genuine reuse of the work's own nouns -- exactly what
 * later propagates into NOW.Arc/FlightPlan/LiveTensions, the only thing R7
 * credits (src/status.ts GREETING_PROPAGATION_PREFIXES). */
function extractAnchorVocab(nowMd: string): AnchorVocab {
  const tokens = new Set<string>();
  const bigrams = new Set<string>();
  for (const line of nowMd.split("\n")) {
    if (line.startsWith("#") || line.trimStart().startsWith("<!--")) continue;
    const toks = distinctiveTokens(line);
    for (let i = 0; i < toks.length; i++) {
      tokens.add(toks[i]);
      if (i + 1 < toks.length) bigrams.add(`${toks[i]}\u0000${toks[i + 1]}`);
    }
  }
  return { tokens, bigrams };
}

/** True iff the greeting names at least one concrete, addressable anchor:
 *   1. a file path that exists on disk (`src/rem-popmem.ts`) or `backtick` command;
 *   2. a proper noun (Capitalized, >= 4 chars) it shares with NOW.md's body
 *      ("RELEASE.md", "Circadian") -- the brief's "proper noun from NOW.md";
 *   3. a distinctive bigram it shares with NOW.md ("constitution builder").
 * A single lowercase common word shared with NOW.md is deliberately NOT enough
 * -- that is the coincidence that let register-echo ("motion is the only
 * truth", with "truth" also in a NOW tension) slip through. Register-echo
 * ("the board holds the pulse", "slice engaged, motion driving") names none of
 * these and is rejected. */
export function greetingHasAnchor(lines: string[], nowMd: string): boolean {
  const text = lines.join(" ");
  const pathRe = new RegExp(GREETING_PATH_RE.source, "g");
  for (const token of text.match(pathRe) ?? []) {
    if (greetingPathTokenExists(token)) return true;
  }
  if (greetingHasCommandAnchor(text)) return true;
  const vocab = extractAnchorVocab(nowMd);
  if (vocab.tokens.size === 0) return false; // nothing concrete exists to name

  // 2. proper noun (capitalized in the greeting) present in NOW.md's body.
  for (const proper of text.match(/\b[A-Z][A-Za-z0-9_.-]{3,}/g) ?? []) {
    const lower = proper.toLowerCase();
    if (!GREETING_STOPWORDS.has(lower) && vocab.tokens.has(lower)) return true;
  }

  // 3. distinctive bigram shared with NOW.md.
  const gToks = distinctiveTokens(text);
  for (let i = 0; i + 1 < gToks.length; i++) {
    if (vocab.bigrams.has(`${gToks[i]}\u0000${gToks[i + 1]}`)) return true;
  }
  return false;
}

const GREETING_TIMEOUT_MS = 60 * 1000;
const GREETING_MAX_TOKENS = 300;

export function buildGreetingPrompt(nowMd: string): string {
  const nowItems = enumerateNowItems(nowMd);
  const anchorMenu =
    nowItems.length > 0
      ? nowItems.map((it) => `- [${it.address}] ${it.text}`).join("\n")
      : "(NOW.md lists no concrete items -- take your anchor from a file, command, or task named in its text below.)";
  return (
    `You are drafting the first thing a mind reads on waking. Its ONLY job is to ` +
    `orient to the CURRENT WORK: point at the next concrete, addressable thing to do.\n\n` +
    `HARD REQUIREMENT 1 -- SAY IT OUT LOUD: every line must be a SENTENCE a person ` +
    `could speak, with a verb. NEVER a bare file path, a bare command, or a list of ` +
    `names. ("` + "`tower/w2-consumer-resilience`" + `", "` + "`workers/audit.done`" + `", ` +
    `"push origin/main" are all FAILURES: they are addresses, not speech. ` +
    `"Pick up the write gate in \`src/gate.ts\` -- the herdr contract is next" is ` +
    `the shape: a sentence that CONTAINS an address.)\n\n` +
    `HARD REQUIREMENT 2 -- NAME SOMETHING REAL: each sentence must name at least one ` +
    `concrete anchor -- a file path, a command, or a specific task/subject drawn from ` +
    `the current work below, reusing its exact nouns. NEVER a mood, a slogan, or an ` +
    `abstraction. ("Motion is the only truth", "the board holds the pulse -- stay in ` +
    `the flow", "slice engaged, motion driving" are all FAILURES: they name nothing ` +
    `you can act on.)\n\n` +
    `Both requirements at once. An address with no sentence around it fails as surely ` +
    `as a sentence with no address in it.\n\n` +
    `Do NOT mention the memory system, the mind, atoms, beliefs, or greetings ` +
    `themselves -- that is a category error: the greeting is for the work, not about ` +
    `its own remembering.\n\n` +
    `The current work (draw your anchor from here):\n${anchorMenu}\n\n` +
    `Full NOW.md for context:\n${nowMd}\n\n` +
    `Respond with ONLY the greeting: at most ${GREETING_MAX_LINES} short sentences, ` +
    `one per line, no preamble, no markdown headers, no bullet points.`
  );
}

// ---------------------------------------------------------------------
// commit message -- this file's own convention (documented per brief)
// ---------------------------------------------------------------------
export interface RemCommitStats {
  date: string; // YYYY-MM-DD
  stacked: number; // brand-new atom files written this cycle (StackCounts.new, summed)
  bumped: number; // existing-atom weight increments this cycle from stacking
  // (StackCounts.stacked + StackCounts.bumped, summed -- deterministic-hash/
  // overlap hits AND COMPARE-won hits both count as "bumped"; potentiate
  // events from propagation are a separate mechanism and are NOT counted
  // here, to keep "bumped" meaning "this episode recurred a belief")
  // Law 9: every counter below means exactly what it says. `newlySank` is a
  // per-run TRANSITION (atoms that crossed from >=floor to <floor THIS run);
  // `belowFloor` is the below-floor STATE total (the number that recurred
  // verbatim across 99b996d/6d585fc/7509352 because it was mislabeled
  // "sank"). They are different quantities and never conflated again.
  newlySank: number; // atoms whose folded weight crossed below RENDER_FLOOR this cycle
  belowFloor: number; // total ACTIVE atoms currently below floor (state, not transition)
  potentiated: number; // potentiate ledger events appended this cycle
  distilled: number; // loser atoms superseded by the distill phase this cycle
  population: number; // total atom files on disk (regardless of render-floor status)
  belowFloorIds: string[];
}

/** `rem: <date> — stacked N, bumped M, sank K · P below floor, potentiated Q,
 * distilled D, population T` + a body that auto-records the below-floor id
 * list. Every counter is a distinct quantity (Law 9): `sank K` is this run's
 * downward floor crossings, `P below floor` is the standing below-floor state,
 * `potentiated Q` and `distilled D` are this run's potentiate/supersede event
 * counts. The body carries the below-floor STATE list (the historical
 * "sank below floor" body, renamed to match what it is). */
export function buildCommitMessage(stats: RemCommitStats): { subject: string; body: string } {
  const subject =
    `rem: ${stats.date} — stacked ${stats.stacked}, bumped ${stats.bumped}, ` +
    `sank ${stats.newlySank} · ${stats.belowFloor} below floor, ` +
    `potentiated ${stats.potentiated}, distilled ${stats.distilled}, population ${stats.population}`;
  const body =
    stats.belowFloorIds.length > 0
      ? `\n\nbelow floor: ${stats.belowFloorIds.join(", ")}`
      : `\n\nbelow floor: (none)`;
  return { subject, body };
}

// ---------------------------------------------------------------------
// DISTILL phase — resolve live semantic-stutter clusters via the ledger's
// existing `supersede` mechanic (atoms.ts fold: loser's weight transfers to
// winner, loser keeps its file + a `superseded-by:` status, so render.ts
// drops it — defocus, never delete). Pure and deterministic: it renders the
// current population, runs the SAME detector pair the migration guard and
// doctor run (detectSelfStutter ∘ adaptRenderedForStutterCheck), and returns
// a supersede plan. No I/O, no obs, no clock beyond the caller-supplied ts —
// the caller appends the events and emits the Law 9 events. detectSelfStutter,
// the adapter, and renderSelf are all reused UNMODIFIED (brief §6).
// ---------------------------------------------------------------------
export const DISTILL_CAP = 10;

export interface DistillCluster {
  kind: "doctrine" | "motif";
  winner: string; // highest current fold weight; tie -> earliest [ep:]; tie -> id asc
  losers: string[];
  transferredWeight: number; // sum of losers' current weights (transfers to winner)
}

export interface DistillPlan {
  clusters: DistillCluster[]; // resolved this run (<= cap)
  deferred: number; // clusters beyond the cap, deferred to the next run
  supersedeEvents: LedgerEvent[]; // one per loser, in resolved order
}

/** Detects stutter clusters over `atoms`/`states` and returns a supersede
 * plan. Winner rule (brief §4, resolved decision 3): highest current
 * fold(ledger) weight; tie -> earliest `[ep:]` stamp; tie -> atom id asc
 * (total order, so the plan is deterministic). Cap `DISTILL_CAP` clusters
 * per run; the overflow is reported as `deferred` and naturally re-detected
 * next run. Reuses the render manifest to map each cluster member's rendered
 * address (`SELF.Doctrine[n]` / `SELF.Motifs[n]`) back to its atom id. */
export function planDistillation(
  atoms: Atom[],
  states: Map<string, AtomState>,
  ts: string,
  cap = DISTILL_CAP
): DistillPlan {
  const { md, manifest } = renderSelf(atoms, states);
  const adapted = adaptRenderedForStutterCheck(md);
  const report = detectSelfStutter(adapted);
  const addrToAtom = new Map(manifest.map((m) => [m.address, m.atom]));
  const atomsById = new Map(atoms.map((a) => [a.id, a]));
  // Reconstruct the motif bullet list exactly as the adapter/parser saw it,
  // so a motif cluster's line string maps back to SELF.Motifs[i+1]. Doctrine
  // clusters already carry their 1-based paragraph number `n` directly.
  const motifBullets = parseSelfSections(adapted)
    .motifs.split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("-"));

  const raw: { kind: "doctrine" | "motif"; ids: string[] }[] = [];
  for (const g of report.doctrine) {
    const ids = g.map((d) => addrToAtom.get(`SELF.Doctrine[${d.n}]`)).filter((x): x is string => !!x);
    if (ids.length >= 2) raw.push({ kind: "doctrine", ids });
  }
  for (const g of report.motifs) {
    const ids = g
      .map((s) => {
        const i = motifBullets.indexOf(s);
        return i >= 0 ? addrToAtom.get(`SELF.Motifs[${i + 1}]`) : undefined;
      })
      .filter((x): x is string => !!x);
    if (ids.length >= 2) raw.push({ kind: "motif", ids });
  }

  const weightOf = (id: string): number => states.get(id)?.weight ?? 0;
  const earliestEp = (id: string): string => (atomsById.get(id)?.eps ?? []).slice().sort()[0] ?? "9999-99-99";

  const all: DistillCluster[] = raw.map(({ kind, ids }) => {
    const ranked = [...ids].sort((a, b) => {
      const dw = weightOf(b) - weightOf(a);
      if (dw !== 0) return dw;
      const ea = earliestEp(a);
      const eb = earliestEp(b);
      if (ea !== eb) return ea < eb ? -1 : 1;
      return a < b ? -1 : a > b ? 1 : 0;
    });
    const [winner, ...losers] = ranked;
    const transferredWeight = losers.reduce((s, l) => s + weightOf(l), 0);
    return { kind, winner, losers, transferredWeight };
  });

  const clusters = all.slice(0, cap);
  const deferred = all.length - clusters.length;
  const supersedeEvents: LedgerEvent[] = [];
  for (const c of clusters) for (const loser of c.losers) supersedeEvents.push({ ev: "supersede", winner: c.winner, loser, ts });
  return { clusters, deferred, supersedeEvents };
}

/** Runs the distill plan against the given population: appends the supersede
 * events to the ledger (unless dryRun) and emits the Law 9 events — one obs
 * per supersede `{winner, loser, transferred_weight}`, one phase summary, and
 * a WARN (degraded) if the cap deferred any clusters. Returns the plan so the
 * caller can re-fold the ledger over the applied events. This is the SINGLE
 * body both the inline REM phase and the standalone `--distill-only` entry
 * call — the supersede appends + obs travel one code path (brief §5). The
 * caller wraps this in the janitor try/catch (a distill bug never cracks the
 * REM host); planDistillation is pure, so a detector throw appends nothing. */
export function runDistillPhase(
  atoms: Atom[],
  states: Map<string, AtomState>,
  ledgerPath: string,
  ts: string,
  corr: string,
  dryRun: boolean,
  cap = DISTILL_CAP
): DistillPlan {
  const plan = planDistillation(atoms, states, ts, cap);

  if (!dryRun) for (const ev of plan.supersedeEvents) appendLedger(ledgerPath, ev);

  for (const c of plan.clusters) {
    for (const loser of c.losers) {
      ok({
        process: "rem", phase: "distill", correlation_id: corr,
        summary: `supersede ${c.kind}: ${loser} -> ${c.winner}${dryRun ? " (dry-run)" : ""}`,
        context: { winner: c.winner, loser, transferred_weight: Math.round((states.get(loser)?.weight ?? 0) * 10000) / 10000, kind: c.kind, dry_run: dryRun },
      });
    }
  }

  if (plan.deferred > 0) {
    degraded({
      process: "rem", phase: "distill", correlation_id: corr,
      summary: `distill cap ${cap} reached: ${plan.clusters.length} cluster(s) resolved, ${plan.deferred} deferred to the next run`,
      context: { resolved: plan.clusters.length, deferred: plan.deferred, cap, dry_run: dryRun },
      cause: `more than ${cap} stutter cluster(s) present this run; the overflow is left for the next REM wave to re-detect and resolve`,
      next_action: "none required — the deferred clusters re-detect and resolve on the next scheduled REM run; this is the designed backpressure",
    });
  }

  const distilled = plan.clusters.reduce((s, c) => s + c.losers.length, 0);
  ok({
    process: "rem", phase: "distill", correlation_id: corr,
    summary: `distill: ${plan.clusters.length} cluster(s) resolved, ${distilled} atom(s) superseded${plan.deferred ? `, ${plan.deferred} deferred` : ""}${dryRun ? " (dry-run, nothing written)" : ""}`,
    context: { clusters: plan.clusters.length, distilled, deferred: plan.deferred, population: atoms.length, dry_run: dryRun },
  });

  return plan;
}

// ---------------------------------------------------------------------
// R8 invariant: render(archive) == committed SELF.md, byte-identical
// ---------------------------------------------------------------------
export interface RenderInvariantResult {
  ok: boolean;
  expectedLength: number;
  actualLength: number;
}

/** Re-reads atoms/ledger fresh from disk and re-renders, comparing against
 * the SELF.md bytes already written this cycle. Pure given the disk state
 * at call time -- this is deliberately a DISK round-trip (not an in-memory
 * re-render of the same objects), so it catches a write/encoding bug the
 * in-memory path would never see. */
export function assertRenderInvariant(beliefsDir: string, ledgerPath: string, committedMd: string): RenderInvariantResult {
  const atoms = readAtoms(beliefsDir);
  const states = foldWeights(readLedger(ledgerPath));
  const { md } = renderSelf(atoms, states);
  return { ok: md === committedMd, expectedLength: md.length, actualLength: committedMd.length };
}

// ---------------------------------------------------------------------
// vitals snapshot -- same shape decay.ts writes, so status.ts's existing
// "pop N (top W) sank K" segment keeps working post-switchover unmodified.
// ---------------------------------------------------------------------
function countSrcLoc(): number {
  const srcDir = path.join(CIRCADIAN_HOME, "src");
  let files: string[] = [];
  try {
    files = fs.readdirSync(srcDir).filter((f) => f.endsWith(".ts"));
  } catch {
    return 0;
  }
  let total = 0;
  for (const f of files) total += (readOrEmpty(path.join(srcDir, f)).match(/\n/g) || []).length;
  return total;
}

// ---------------------------------------------------------------------
// git commit (mind repo) -- rem.ts's captured-stderr pattern: an
// unrecoverable "Command failed" with git's actual reason lost was the
// 2026-07-24 outage's root cause (see rules/debugging-discipline.md #8's
// sibling incident, same lesson, this codebase's own copy of it).
// ---------------------------------------------------------------------
function gitCommit(args: string[]): string {
  const r = spawnSync("git", args, { cwd: MIND_DIR, encoding: "utf8" });
  if (r.error) throw new Error(`git ${args[0]} could not run: ${r.error.message}`);
  if (r.status !== 0) {
    const detail = [r.stderr?.trim(), r.stdout?.trim()].filter(Boolean).join(" | ") || "(git produced no output)";
    if (/nothing to commit|nothing added to commit/i.test(detail)) return "__NOTHING_TO_COMMIT__";
    throw new Error(`git ${args[0]} exited ${r.status}: ${detail}`);
  }
  return r.stdout ?? "";
}

function atomicWrite(targetPath: string, content: string) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const tmp = `${targetPath}.rem-tmp`;
  fs.writeFileSync(tmp, content, "utf8");
  fs.renameSync(tmp, targetPath);
}

// ---------------------------------------------------------------------
// main
// ---------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const ifDue = args.includes("--if-due");
  const distillOnly = args.includes("--distill-only");
  const corr = correlation("rem");

  // Standalone DISTILL verification path (brief §4/§5): a minimal wave that
  // runs DISTILL -> RENDER -> R8 assert -> mind commit against the LIVE
  // population, reusing the EXACT functions a full REM run uses (runDistill-
  // Phase, renderSelf, assertRenderInvariant, atomicWrite, gitCommit) — so
  // the supersede appends, the render, and the mind-repo commit travel the
  // SAME code path REM uses at 21:00. It deliberately does NOT: run the LLM
  // (no propagation/greeting), decay, or write a scoreboard `rem` event — so
  // tonight's unattended 21:00 REM still sees itself as due and absorbs the
  // new episodes normally (the distill and absorb phases are independent,
  // brief §7). --dry-run previews the cluster->winner mapping and the would-
  // be render, writing nothing.
  if (distillOnly) {
    if (!fs.existsSync(BELIEFS_DIR)) {
      idle({
        process: "rem", phase: "distill", correlation_id: corr,
        summary: "--distill-only: no population yet -- mind/beliefs/ missing",
        context: { beliefs_dir: BELIEFS_DIR },
      });
      return;
    }
    const atoms = readAtoms(BELIEFS_DIR);
    const ledgerBefore = readLedger(LEDGER_PATH);
    const statesBefore = foldWeights(ledgerBefore);
    const ts = new Date().toISOString();
    let plan: DistillPlan;
    try {
      plan = runDistillPhase(atoms, statesBefore, LEDGER_PATH, ts, corr, dryRun);
    } catch (err) {
      fail({
        process: "rem", phase: "distill", correlation_id: corr,
        summary: "--distill-only threw past planDistillation's purity; nothing appended",
        context: { dry_run: dryRun },
        cause: (err as Error).message,
        next_action: "inspect the stutter detector / render against the live mind",
      });
    }
    // Re-fold over the (appended, or in dry-run previewed) supersedes and
    // render the distilled population — the SAME renderSelf a full run calls.
    const statesAfter = foldWeights([...ledgerBefore, ...plan.supersedeEvents]);
    const atomsForRender = readAtoms(BELIEFS_DIR);
    const oldSelfMd = readOrEmpty(SELF_PATH);
    const { md: newSelfMd, manifest: newManifest } = renderSelf(atomsForRender, statesAfter);

    if (dryRun) {
      idle({
        process: "rem", phase: "distill", correlation_id: corr,
        summary: `--distill-only --dry-run: ${plan.clusters.length} cluster(s), ${plan.supersedeEvents.length} supersede(s) previewed; render ${newManifest.length}/${atomsForRender.length} atoms above floor; nothing written`,
        context: { clusters: plan.clusters.length, would_supersede: plan.supersedeEvents.length, would_render: newManifest.length, population: atomsForRender.length },
      });
      return;
    }

    atomicWrite(SELF_PATH, newSelfMd);
    atomicWrite(MANIFEST_PATH, JSON.stringify(newManifest, null, 2) + "\n");
    const invariant = assertRenderInvariant(BELIEFS_DIR, LEDGER_PATH, newSelfMd);
    if (!invariant.ok) {
      fail({
        process: "rem", phase: "render", correlation_id: corr,
        summary: "R8 invariant violated in --distill-only: a fresh render from disk does not match the SELF.md just written",
        context: { expected_length: invariant.expectedLength, actual_length: invariant.actualLength },
        cause: "renderSelf(readAtoms(disk), foldWeights(readLedger(disk))) !== the bytes just written to SELF.md",
        next_action: `inspect ${MIND_DIR} for a partial write or an atoms/ledger read discrepancy`,
      });
    }
    ok({
      process: "rem", phase: "render", correlation_id: corr,
      summary: `--distill-only render: ${newManifest.length}/${atomsForRender.length} atoms above floor, SELF.md ${oldSelfMd === newSelfMd ? "unchanged" : "rewritten"}`,
      context: { population: atomsForRender.length, rendered: newManifest.length, self_changed: oldSelfMd !== newSelfMd },
    });

    const distilled = plan.clusters.reduce((s, c) => s + c.losers.length, 0);
    const subject = `rem(distill): ${ts.slice(0, 10)} — ${plan.clusters.length} cluster(s) resolved, ${distilled} atom(s) superseded, population ${atomsForRender.length}`;
    const body = `\n\nstandalone distill verification (brief 06): auto-superseded live semantic-stutter clusters via the ledger's supersede mechanic; no decay/propagation/greeting; scoreboard untouched so the 21:00 REM slot stays due.`;
    try {
      execFileSync("git", ["add", "beliefs.jsonl", "SELF.md", "render-manifest.json"], { cwd: MIND_DIR });
      const commitResult = gitCommit(["commit", "-m", subject + body]);
      ok({
        process: "rem", phase: "commit", correlation_id: corr,
        summary: commitResult === "__NOTHING_TO_COMMIT__" ? "--distill-only: nothing to commit (population already clean)" : `--distill-only committed: ${subject}`,
        context: { clusters: plan.clusters.length, distilled, population: atomsForRender.length, no_op: commitResult === "__NOTHING_TO_COMMIT__" },
      });
    } catch (err) {
      fail({
        process: "rem", phase: "commit", correlation_id: corr,
        summary: "--distill-only mind commit failed after distill + render succeeded",
        context: { error: (err as Error).message, mind_dir: MIND_DIR },
        cause: (err as Error).message,
        next_action: `inspect ${MIND_DIR} with 'git status'; the mind repo may hold uncommitted distill writes`,
      });
    }
    return;
  }

  // Single-flight guard for the WHOLE entry path (work item 2, fact 7), not
  // just --if-due: a prior run hung on the LLM never writes a completion
  // event, so the scoreboard still reads "due" and a concurrent MANUAL
  // invocation could otherwise stack another process right alongside it
  // (18 reaped 2026-08-06, originally --if-due-only). The lock releases on
  // exit so a clean run frees it. --distill-only is deliberately excluded
  // (module header: its whole point is to run independent of, and
  // concurrently with, a full REM pass).
  const releaseLock = acquireIfDueLock();
  if (releaseLock === null) {
    idle({
      process: "rem", phase: "schedule-guard", correlation_id: corr,
      summary: "another rem-popmem run is already in flight; bailing (single-flight lock held)",
      context: { lock_path: IFDUE_LOCK_PATH },
    });
    return;
  }

  if (ifDue) {
    const scoreboardCheck = readScoreboardEvents(SCOREBOARD_PATH);
    // Consecutive-failure budget (work item 3, CORD's ruling, N=3). Checked
    // BEFORE isDue(): a stuck run's failures can be slots old, so isDue()
    // alone would see the current slot as freshly due and re-fire it. Only
    // --if-due is gated -- a manual run is the clearing surface, and it
    // clears the streak just by appending a non-failed "rem" event.
    const failureStreak = consecutiveFailedSlotStreak(scoreboardCheck);
    if (failureStreak >= CONSECUTIVE_FAILURE_BUDGET) {
      const blocker = lastFailureEpisode(scoreboardCheck);
      degraded({
        process: "rem", phase: "schedule-guard", correlation_id: corr,
        summary: `--if-due: ${failureStreak} consecutive failed pass(es) reached the budget (${CONSECUTIVE_FAILURE_BUDGET}); refusing to start until a manual run clears it`,
        context: { failure_episode: blocker, consecutive_failures: failureStreak },
        cause: `${blocker ?? "an episode"} has blocked the last ${failureStreak} REM pass(es)`,
        next_action: `resolve or remove the blocking episode, then run rem-popmem.ts manually (no --if-due) to clear the stuck state`,
      });
      return;
    }
    if (!isDue(scoreboardCheck, new Date())) {
      idle({
        process: "rem", phase: "schedule-guard", correlation_id: corr,
        summary: "--if-due: not due; last rem-popmem run is newer than the current slot",
        context: { last_rem_ts: lastRemTs(scoreboardCheck), slot_hours: REM_SLOT_HOURS },
      });
      return;
    }
  }

  if (!fs.existsSync(BELIEFS_DIR)) {
    idle({
      process: "rem", phase: "population-check", correlation_id: corr,
      summary: "no population yet -- mind/beliefs/ missing; rem-popmem is a no-op until the switchover commits the seed population",
      context: { beliefs_dir: BELIEFS_DIR },
    });
    return;
  }

  // -------------------------------------------------------------------
  // 1. ABSORB
  // -------------------------------------------------------------------
  const digestedHashes = loadDigestedHashes(DIGESTED_PATH);
  const newEpisodes = findNewEpisodes(EPISODES_DIR, digestedHashes);

  const aggCounts: StackCounts = {
    new: 0, superseded: 0, stacked: 0, bumped: 0, rejected: 0, droppedOverCap: 0, compareCalls: 0, compareInvalid: 0,
  };
  let anyRejected = false;
  // Episode-level failure contract (work items 4/5, fact 6): stack.ts
  // reports a bad episode via StackEpisodeResult instead of killing the
  // process. `failureEpisode` feeds the slot-burning scoreboard event
  // below (work item 1) so the NEXT --if-due call can see this slot as
  // both "ran" and "failed".
  let anyEpisodeFailed = false;
  let failureEpisode: string | undefined;

  for (const ep of newEpisodes) {
    if (dryRun) continue;
    const result = (await stackEpisode({
      mindDir: MIND_DIR, beliefsDir: BELIEFS_DIR, ledgerPath: LEDGER_PATH, ioLogPath: IO_LOG_PATH,
      filename: ep.filename, correlationId: corr,
    })) as StackEpisodeResult & { failed?: boolean; failurePhase?: string; failureCause?: string };
    if (result.failed) {
      // Hold aside, not absorbed: recordDigested here (not batched after
      // the loop, fact 4's multiplier) means findNewEpisodes() never
      // re-offers this hash on the next pass, and an episode-level failure
      // no longer wedges the pass -- the remaining episodes still process.
      anyEpisodeFailed = true;
      failureEpisode = ep.filename;
      degraded({
        process: "rem", phase: "absorb", correlation_id: corr,
        summary: `episode held aside: ${ep.filename} failed at ${result.failurePhase ?? "unknown phase"}`,
        context: { filename: ep.filename, failure_phase: result.failurePhase, failure_cause: result.failureCause },
        cause: result.failureCause ?? "stackEpisode reported a failure with no cause",
        next_action: `inspect ${ep.filename} in ${EPISODES_DIR}; it is held aside and will not be retried automatically`,
      });
      recordDigested(DIGESTED_PATH, [
        { ts: new Date().toISOString(), hash: ep.hash, filename: ep.filename, disposition: "held-aside", failure_phase: result.failurePhase, failure_cause: result.failureCause },
      ]);
      continue;
    }
    if (result.counts) {
      for (const k of Object.keys(aggCounts) as (keyof StackCounts)[]) aggCounts[k] += result.counts[k];
      if (result.counts.rejected > 0 || result.counts.compareInvalid > 0) anyRejected = true;
    }
    recordDigested(DIGESTED_PATH, [{ ts: new Date().toISOString(), hash: ep.hash, filename: ep.filename, disposition: "absorbed" }]);
  }

  if (newEpisodes.length === 0) {
    idle({
      process: "rem", phase: "absorb", correlation_id: corr,
      summary: "nothing to absorb -- no new episodes since the last digested hash",
      context: { dry_run: dryRun },
    });
  } else {
    const context = { episodes: newEpisodes.length, ...aggCounts, dry_run: dryRun };
    if (anyRejected) {
      degraded({
        process: "rem", phase: "absorb", correlation_id: corr,
        summary: `absorbed ${newEpisodes.length} episode(s) with ${aggCounts.rejected} rejected candidate(s) / ${aggCounts.compareInvalid} invalid COMPARE token(s)`,
        context,
        cause: "one or more candidates failed shape/counterfeit-quote at extraction, or a COMPARE call returned an unrecognized token",
        next_action: "inspect logs/stacker-io.jsonl for the raw completions behind this correlation id",
      });
    } else {
      ok({
        process: "rem", phase: "absorb", correlation_id: corr,
        summary: `absorbed ${newEpisodes.length} episode(s): ${aggCounts.new} new atom(s), ${aggCounts.stacked + aggCounts.bumped} weight bump(s)`,
        context,
      });
    }
  }

  // -------------------------------------------------------------------
  // 2. PROPAGATION JUDGMENT (skipped when nothing new was stacked)
  // -------------------------------------------------------------------
  let propagatedAddresses: string[] = [];
  // Did the judge actually run and answer this cycle? Recorded onto the
  // scoreboard rem event as `judged` (status.ts remIsJudgment). It stays
  // false when the phase is skipped for want of new episodes, when there is
  // nothing addressable to judge against, and when the call fails or comes
  // back malformed — because in every one of those cases nothing was
  // observed, and R7 must not read an unobserved cycle as a dead greeting.
  let propagationJudged = false;
  if (newEpisodes.length > 0 && !dryRun) {
    const atomsForPropagation = readAtoms(BELIEFS_DIR);
    const atomsById = new Map(atomsForPropagation.map((a) => [a.id, a]));
    const oldManifest = readManifestFile(MANIFEST_PATH);
    const nowMd = readOrEmpty(NOW_PATH);
    const items = enumeratePropagationAddresses(oldManifest ?? [], atomsById, nowMd);

    if (items.length === 0) {
      idle({
        process: "rem", phase: "propagation", correlation_id: corr,
        summary: "no addressed items to judge propagation against yet (empty manifest and NOW.md)",
        context: {},
      });
    } else {
      const maxTokens = propagationMaxTokens(items.length);
      try {
        const prompt = buildPropagationPrompt(items, newEpisodes);
        const raw = await complete(prompt, { timeoutMs: PROPAGATION_TIMEOUT_MS, maxTokens, temperature: 0 });
        const judgment = parsePropagationResponse(raw, items.map((it) => it.address));
        propagatedAddresses = judgment.propagated;
        if (judgment.malformed) {
          degraded({
            process: "rem", phase: "propagation", correlation_id: corr,
            // The raw completion travels IN the event. The old next_action
            // told a reader to "inspect the raw completion under this
            // correlation id" and then never recorded one, so three malformed
            // runs (2026-08-12..14) left nothing to diagnose them with.
            summary: "propagation judgment completion was malformed; treated as empty (no retry)",
            context: { items: items.length, max_tokens: maxTokens, raw_head: raw.slice(0, 200), raw_tail: raw.slice(-120), raw_length: raw.length },
            cause: "LLM response did not parse as a JSON array",
            next_action: "read raw_head/raw_tail in this event's context; a tail cut off mid-string means the response budget is still short of items x 12",
          });
        } else {
          propagationJudged = true;
          ok({
            process: "rem", phase: "propagation", correlation_id: corr,
            summary: `propagation judgment: ${propagatedAddresses.length}/${items.length} item(s) propagated${judgment.unrecognizedCount ? `, ${judgment.unrecognizedCount} unrecognized address(es) dropped` : ""}`,
            context: { items: items.length, propagated: propagatedAddresses.length, unrecognized: judgment.unrecognizedCount, max_tokens: maxTokens },
          });
        }
      } catch (err) {
        degraded({
          process: "rem", phase: "propagation", correlation_id: corr,
          summary: "propagation judgment LLM call failed; treated as empty",
          context: { items: items.length, max_tokens: maxTokens },
          cause: (err as Error).message,
          next_action: "check the local LLM at CIRCADIAN_LLM_BASE_URL; this cycle records zero propagation AND judged:false, so R7 reads it as an unobserved cycle rather than a failed greeting",
        });
      }
    }
  }

  // -------------------------------------------------------------------
  // 3. DECAY (decay.ts's own pure functions, direct-imported)
  // -------------------------------------------------------------------
  const ledgerBeforeDecay = readLedger(LEDGER_PATH);
  const atomsBeforeDecay = readAtoms(BELIEFS_DIR);
  const oldManifestForDecay = readManifestFile(MANIFEST_PATH) ?? [];
  const remEventsForDecay = readScoreboardRemEvents(SCOREBOARD_PATH);
  const decayTs = new Date().toISOString();

  const { events: potentiateEvents, newRemCount, unmappedCount } = computePotentiateEvents(
    ledgerBeforeDecay, remEventsForDecay, oldManifestForDecay, decayTs
  );
  const decayEvent: LedgerEvent = { ev: "decay", factor: DECAY_FACTOR, ts: decayTs };

  if (!dryRun) {
    for (const ev of potentiateEvents) appendLedger(LEDGER_PATH, ev);
    appendLedger(LEDGER_PATH, decayEvent);
  }

  const statesAfterDecay = foldWeights([...ledgerBeforeDecay, ...potentiateEvents, decayEvent]);
  // Below-floor STATE before distill folds in — the baseline the newly-sank
  // TRANSITION is measured against (a distilled loser drops to weight 0, but
  // that is a supersede, not a floor crossing; it must not inflate `sank`).
  const belowFloorPreDistill = new Set(computeSankBelowFloor(atomsBeforeDecay, statesAfterDecay));
  const topWeight = atomsBeforeDecay.reduce((max, a) => Math.max(max, statesAfterDecay.get(a.id)?.weight ?? 0), 0);

  if (unmappedCount > 0) {
    degraded({
      process: "rem", phase: "decay", correlation_id: corr,
      summary: `decay: ${potentiateEvents.length} potentiate event(s), ${unmappedCount} unmapped propagated address(es)`,
      context: { population: atomsBeforeDecay.length, potentiated: potentiateEvents.length, new_rem_events: newRemCount, unmapped_addresses: unmappedCount, below_floor: belowFloorPreDistill.size, dry_run: dryRun },
      cause: `${unmappedCount} propagated address(es) had no matching entry in ${MANIFEST_PATH}`,
      next_action: "check whether render-manifest.json is stale relative to scoreboard.jsonl's rem events",
    });
  } else {
    ok({
      process: "rem", phase: "decay", correlation_id: corr,
      summary: `decay: ${potentiateEvents.length} potentiate event(s) from ${newRemCount} prior rem event(s), 1 decay event${dryRun ? " (dry-run)" : ""}`,
      context: { population: atomsBeforeDecay.length, potentiated: potentiateEvents.length, below_floor: belowFloorPreDistill.size, top_weight: Math.round(topWeight * 10000) / 10000, dry_run: dryRun },
    });
  }

  // -------------------------------------------------------------------
  // 3b. DISTILL (after DECAY, before RENDER — resolved decision 2). Wrapped
  // in the janitor paranoia pattern: planDistillation is pure and
  // detectSelfStutter never throws, but a distill bug must NEVER crack the
  // REM host — a throw here degrades and the run proceeds to RENDER over the
  // undistilled (but still valid) population. One render per run reflects
  // whatever the distill left behind.
  // -------------------------------------------------------------------
  let distilledCount = 0;
  let statesAfterDistill = statesAfterDecay;
  try {
    const distillTs = new Date().toISOString();
    const plan = runDistillPhase(atomsBeforeDecay, statesAfterDecay, LEDGER_PATH, distillTs, corr, dryRun);
    distilledCount = plan.clusters.reduce((s, c) => s + c.losers.length, 0);
    // Re-fold so RENDER, greeting, and the R8 assert all see the distilled
    // population. In dry-run nothing was appended to disk, so fold the plan's
    // events in memory to preview the distilled render truthfully.
    statesAfterDistill = foldWeights([...ledgerBeforeDecay, ...potentiateEvents, decayEvent, ...plan.supersedeEvents]);
  } catch (err) {
    degraded({
      process: "rem", phase: "distill", correlation_id: corr,
      summary: "distill phase threw past planDistillation's purity; REM proceeds to render over the undistilled population",
      context: { dry_run: dryRun },
      cause: (err as Error).message,
      next_action: "reproduce standalone with `bun src/rem-popmem.ts --distill-only --dry-run`",
    });
  }

  // Newly-sank is a TRANSITION: active atoms below floor AFTER distill that
  // were NOT below floor before it. A superseded loser is no longer `active`,
  // so computeSankBelowFloor already excludes it — the set difference is clean
  // and a distilled loser can never inflate the newly-sank count.
  const belowFloorPostDistill = computeSankBelowFloor(atomsBeforeDecay, statesAfterDistill);
  const newlySank = belowFloorPostDistill.filter((id) => !belowFloorPreDistill.has(id));

  // -------------------------------------------------------------------
  // 4. RENDER + R8 assert
  // -------------------------------------------------------------------
  const atomsForRender = readAtoms(BELIEFS_DIR); // fresh: absorb may have added files since atomsBeforeDecay was read
  const oldSelfMd = readOrEmpty(SELF_PATH);
  const { md: newSelfMd, manifest: newManifest } = renderSelf(atomsForRender, statesAfterDistill);

  if (!dryRun) {
    atomicWrite(SELF_PATH, newSelfMd);
    atomicWrite(MANIFEST_PATH, JSON.stringify(newManifest, null, 2) + "\n");
  }

  if (!dryRun) {
    const invariant = assertRenderInvariant(BELIEFS_DIR, LEDGER_PATH, newSelfMd);
    if (!invariant.ok) {
      fail({
        process: "rem", phase: "render", correlation_id: corr,
        summary: "R8 invariant violated: a fresh render from disk does not match the SELF.md just written",
        context: { expected_length: invariant.expectedLength, actual_length: invariant.actualLength },
        cause: "renderSelf(readAtoms(disk), foldWeights(readLedger(disk))) !== the bytes just written to SELF.md",
        next_action: `inspect ${MIND_DIR} for a partial write or an atoms/ledger read discrepancy; this cycle aborts before greeting/commit`,
      });
    }
  }
  const selfChanged = oldSelfMd !== newSelfMd;
  ok({
    process: "rem", phase: "render", correlation_id: corr,
    summary: `SELF.md rendered: ${newManifest.length}/${atomsForRender.length} atoms above floor${dryRun ? " (dry-run, not written)" : ""}`,
    context: { population: atomsForRender.length, rendered: newManifest.length, self_changed: selfChanged, dry_run: dryRun },
  });

  // -------------------------------------------------------------------
  // 5. GREETING
  // -------------------------------------------------------------------
  // The greeting anchors to NOW.md's concrete work only. Abstract top-weight
  // doctrine claims are deliberately NOT fed in: grounding tone on "motion is
  // the metric"/"the board is the pulse" is what mode-collapsed the generator
  // into content-free register-echo and tripped R7 (Constitution Art. 11).
  const nowMdForGreeting = readOrEmpty(NOW_PATH);
  let greetingLines: string[] = [];
  if (!dryRun) {
    try {
      const prompt = buildGreetingPrompt(nowMdForGreeting);
      // AIMD spirit: one reroll at a higher temperature when the first draft
      // names no concrete anchor (shape rejected). If both fail the gate,
      // treat it as malformed and leave greeting.md untouched -- a greeting
      // that names nothing must not ship, exactly as an empty one doesn't.
      const temps = [0.3, 0.7];
      let greeting: GreetingResult = { lines: [], malformed: true };
      for (const temperature of temps) {
        const raw = await complete(prompt, { timeoutMs: GREETING_TIMEOUT_MS, maxTokens: GREETING_MAX_TOKENS, temperature });
        greeting = parseGreetingResponse(raw, nowMdForGreeting);
        if (!greeting.malformed) break;
      }
      if (greeting.malformed) {
        degraded({
          process: "rem", phase: "greeting", correlation_id: corr,
          summary: "greeting named no concrete anchor after reroll; greeting.md left unchanged",
          context: { last_draft: greeting.lines },
          cause: "LLM response was empty or was register-echo naming no file/command/task from NOW.md (shape gate)",
          next_action: "inspect the raw completion under this correlation id in logs/circadian.events.jsonl; check NOW.md has concrete Arc/Flight-plan/tension items to anchor to",
        });
      } else {
        greetingLines = greeting.lines;
        atomicWrite(GREETING_PATH, greetingLines.join("\n") + "\n");
        ok({
          process: "rem", phase: "greeting", correlation_id: corr,
          summary: `greeting drafted: ${greetingLines.length} line(s)`,
          context: { lines: greetingLines },
        });
      }
    } catch (err) {
      degraded({
        process: "rem", phase: "greeting", correlation_id: corr,
        summary: "greeting LLM call failed; greeting.md left unchanged",
        context: {},
        cause: (err as Error).message,
        next_action: "check the local LLM at CIRCADIAN_LLM_BASE_URL",
      });
    }
  }

  if (dryRun) {
    idle({
      process: "rem", phase: "commit", correlation_id: corr,
      summary: "dry-run: no writes, no commit",
      context: { would_absorb: newEpisodes.length, would_distill: distilledCount, would_below_floor: belowFloorPostDistill.length },
    });
    return;
  }

  // -------------------------------------------------------------------
  // 6. MIND COMMIT
  // -------------------------------------------------------------------
  const nowIso = new Date().toISOString();
  appendLedgerScoreboardRemEvent(SCOREBOARD_PATH, {
    ts: nowIso,
    type: "rem",
    worldview_tokens: tokensOf(newSelfMd),
    propagated: propagatedAddresses,
    // Provenance for `propagated` (status.ts ScoreEvent.judged): true only
    // when the judge ran and returned a well-formed answer, so an empty
    // array can be read as "looked, found nothing" rather than "never looked".
    judged: propagationJudged,
    composted: [],
    self_changed: selfChanged,
    stacked: aggCounts.new,
    bumped: aggCounts.stacked + aggCounts.bumped,
    distilled: distilledCount,
    // Work item 1: a failed pass still burns its slot -- this event alone
    // already satisfies isDue() above (it only checks for ANY "rem" event);
    // `failed`/`failure_episode` are what work item 3's budget check reads.
    ...(anyEpisodeFailed ? { failed: true, failure_episode: failureEpisode } : {}),
  });

  const vitals = {
    ts: nowIso,
    src_loc: countSrcLoc(),
    population: atomsForRender.length,
    top_weight: Math.round(topWeight * 10000) / 10000,
    sank_below_floor: belowFloorPostDistill,
  };
  fs.mkdirSync(path.dirname(VITALS_PATH), { recursive: true });
  fs.writeFileSync(VITALS_PATH, JSON.stringify(vitals, null, 2) + "\n");

  const dateStr = nowIso.slice(0, 10);
  const { subject, body } = buildCommitMessage({
    date: dateStr,
    stacked: aggCounts.new,
    bumped: aggCounts.stacked + aggCounts.bumped,
    newlySank: newlySank.length,
    belowFloor: belowFloorPostDistill.length,
    potentiated: potentiateEvents.length,
    distilled: distilledCount,
    population: atomsForRender.length,
    belowFloorIds: belowFloorPostDistill,
  });

  try {
    execFileSync(
      "git",
      ["add", "beliefs", "beliefs.jsonl", "SELF.md", "render-manifest.json", "digested.jsonl", "scoreboard.jsonl", "greeting.md", "episodes"],
      { cwd: MIND_DIR }
    );
    const commitResult = gitCommit(["commit", "-m", subject + body]);
    const wasNoop = commitResult === "__NOTHING_TO_COMMIT__";
    ok({
      process: "rem", phase: "commit", correlation_id: corr,
      summary: wasNoop ? "wave complete with nothing left to write" : `wave committed: ${subject}`,
      context: {
        stacked: aggCounts.new, bumped: aggCounts.stacked + aggCounts.bumped,
        newly_sank: newlySank.length, below_floor: belowFloorPostDistill.length,
        potentiated: potentiateEvents.length, distilled: distilledCount,
        population: atomsForRender.length, propagated: propagatedAddresses.length, no_op: wasNoop,
      },
    });
  } catch (err) {
    fail({
      process: "rem", phase: "commit", correlation_id: corr,
      summary: "mind commit failed after every prior phase succeeded",
      context: { error: (err as Error).message, mind_dir: MIND_DIR },
      cause: (err as Error).message,
      next_action: `inspect ${MIND_DIR} with 'git status'; the mind repo may hold uncommitted writes from this run`,
    });
  }

  // -------------------------------------------------------------------
  // 7. JANITOR SWEEP (meals/ working-memory GC)
  // -------------------------------------------------------------------
  // Tail phase, after the commit: meals/ is gitignored working memory, so
  // deletions ride no commit — and the sweep can never preempt REM's core
  // path. sweepMeals never throws (its own event carries the counts — that
  // line IS the sweep's entry in the REM run log); the catch below is pure
  // paranoia so a janitor bug can never crack the REM host.
  try {
    sweepMeals({ dryRun, correlationId: corr });
  } catch (err) {
    degraded({
      process: "rem", phase: "janitor", correlation_id: corr,
      summary: "janitor sweep threw past its internal guards; REM's core run completed unaffected",
      context: {},
      cause: (err as Error).message,
      next_action: "reproduce standalone with `bun src/janitor.ts --dry-run`",
    });
  }

  // -------------------------------------------------------------------
  // 8. RELATIONAL INDEX (b07, briefs/07-relindex-wake-retrieval.md)
  // -------------------------------------------------------------------
  // Tail phase, after the commit + janitor: mind/index/ is a gitignored,
  // rebuildable DERIVED VIEW over episodes/ + beliefs/, so its writes ride no
  // commit (like meals/) and this phase can never preempt REM's core path.
  // INCREMENTAL by construction (updateIndex re-ingests only changed/new
  // units); a full build only when no prior index exists. Paranoia-wrapped
  // exactly like the janitor: an index bug must NEVER crack the REM host.
  // Dense embeddings are NOT rebuilt here (BM25 floor stays fresh; a full
  // `--reindex` with CIRCADIAN_EMBED=1 refreshes vectors on demand) so the
  // phase never depends on a running service.
  try {
    if (dryRun) {
      idle({
        process: "rem", phase: "relindex", correlation_id: corr,
        summary: "dry-run: relational index not updated",
        context: {},
      });
    } else {
      const t0 = Date.now();
      const loaded = loadIndex(MIND_DIR);
      if (!loaded) {
        const { index } = await buildIndex(MIND_DIR);
        saveIndex(MIND_DIR, index, null);
        ok({
          process: "rem", phase: "relindex", correlation_id: corr,
          summary: `relational index: first build, ${index.meta.unitCount} units, ${index.meta.entityCount} entities in ${Date.now() - t0}ms`,
          context: { units: index.meta.unitCount, entities: index.meta.entityCount, build_ms: Date.now() - t0, mode: "full" },
        });
      } else {
        const { index, changed, deleted } = updateIndex(MIND_DIR, loaded.index);
        if (changed === 0 && deleted === 0) {
          idle({
            process: "rem", phase: "relindex", correlation_id: corr,
            summary: "relational index already fresh — nothing changed",
            context: { units: index.meta.unitCount },
          });
        } else {
          saveIndex(MIND_DIR, index, loaded.vectors); // preserve any existing dense vectors
          ok({
            process: "rem", phase: "relindex", correlation_id: corr,
            summary: `relational index updated: ${changed} changed/new, ${deleted} deleted, ${index.meta.unitCount} units in ${Date.now() - t0}ms`,
            context: { changed, deleted, units: index.meta.unitCount, entities: index.meta.entityCount, build_ms: Date.now() - t0, mode: "incremental" },
          });
        }
      }
    }
  } catch (err) {
    degraded({
      process: "rem", phase: "relindex", correlation_id: corr,
      summary: "relational index update threw; REM's core run completed unaffected",
      context: {},
      cause: (err as Error).message,
      next_action: "reproduce standalone with `bun src/relindex.ts --update`",
    });
  }
}

function readManifestFile(p: string): RenderManifestEntry[] | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf8"));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function appendLedgerScoreboardRemEvent(scoreboardPath: string, event: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(scoreboardPath), { recursive: true });
  fs.appendFileSync(scoreboardPath, JSON.stringify(event) + "\n");
}

// import.meta.main guard (mirror rem.ts/zoom.ts/replay.ts): this file is
// imported directly by its own test suite.
if (import.meta.main) logInvocation({ script: "rem-popmem" });
if (import.meta.main) await main();
