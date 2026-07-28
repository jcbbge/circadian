#!/usr/bin/env bun
/**
 * rem-popmem.ts — the composite REM payload (popmem WS-F, docs/POPULATION-MEMORY.md
 * §12 WS-F, templates/MIND-SPEC.v.next.md "The REM payload").
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
import { stackEpisode, type StackCounts } from "./stack.ts";
import { DECAY_FACTOR, computePotentiateEvents, computeSankBelowFloor, type RemPropagationEvent } from "./decay.ts";
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
  disposition: "absorbed" | "composted";
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
const PROPAGATION_MAX_TOKENS = 500;

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

export function parseGreetingResponse(raw: string): GreetingResult {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
  if (lines.length === 0) return { lines: [], malformed: true };
  return { lines: lines.slice(0, GREETING_MAX_LINES), malformed: false };
}

const GREETING_TIMEOUT_MS = 60 * 1000;
const GREETING_MAX_TOKENS = 300;

function buildGreetingPrompt(nowMd: string, topAtoms: Atom[]): string {
  const topLines = topAtoms.map((a) => `- ${a.claim}`).join("\n");
  return (
    `Draft a greeting of at most ${GREETING_MAX_LINES} short lines that orients to the ` +
    `CURRENT WORK -- never to the memory system, the mind, or "atoms"/"beliefs" ` +
    `itself (that would be a category error: the greeting is for the work, not about ` +
    `its own remembering).\n\n` +
    `NOW.md:\n${nowMd}\n\n` +
    `Strongest-held current beliefs (for grounding tone, not for quoting verbatim):\n${topLines}\n\n` +
    `Respond with ONLY the greeting lines, one per line, no preamble, no markdown ` +
    `headers, at most ${GREETING_MAX_LINES} lines.`
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
  sank: number; // atoms whose folded weight fell below RENDER_FLOOR this cycle
  population: number; // total atom files on disk (regardless of render-floor status)
  sankIds: string[];
}

/** `rem: <date> — stacked N, bumped M, sank K, population P` + a body that
 * auto-records the sank-below-floor id list (MIND-SPEC's REM payload
 * section: "commit body auto-records the sank below floor list"). */
export function buildCommitMessage(stats: RemCommitStats): { subject: string; body: string } {
  const subject = `rem: ${stats.date} — stacked ${stats.stacked}, bumped ${stats.bumped}, sank ${stats.sank}, population ${stats.population}`;
  const body =
    stats.sankIds.length > 0
      ? `\n\nsank below floor: ${stats.sankIds.join(", ")}`
      : `\n\nsank below floor: (none)`;
  return { subject, body };
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
  const corr = correlation("rem");

  if (ifDue) {
    const scoreboardCheck = readScoreboardEvents(SCOREBOARD_PATH);
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
  const digestedEntries: DigestedEntry[] = [];
  let anyRejected = false;

  for (const ep of newEpisodes) {
    if (dryRun) continue;
    const result = await stackEpisode({
      mindDir: MIND_DIR, beliefsDir: BELIEFS_DIR, ledgerPath: LEDGER_PATH, ioLogPath: IO_LOG_PATH,
      filename: ep.filename, correlationId: corr,
    });
    if (result.counts) {
      for (const k of Object.keys(aggCounts) as (keyof StackCounts)[]) aggCounts[k] += result.counts[k];
      if (result.counts.rejected > 0 || result.counts.compareInvalid > 0) anyRejected = true;
    }
    digestedEntries.push({ ts: new Date().toISOString(), hash: ep.hash, filename: ep.filename, disposition: "absorbed" });
  }
  if (!dryRun) recordDigested(DIGESTED_PATH, digestedEntries);

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
      try {
        const prompt = buildPropagationPrompt(items, newEpisodes);
        const raw = await complete(prompt, { timeoutMs: PROPAGATION_TIMEOUT_MS, maxTokens: PROPAGATION_MAX_TOKENS, temperature: 0 });
        const judgment = parsePropagationResponse(raw, items.map((it) => it.address));
        propagatedAddresses = judgment.propagated;
        if (judgment.malformed) {
          degraded({
            process: "rem", phase: "propagation", correlation_id: corr,
            summary: "propagation judgment completion was malformed; treated as empty (no retry)",
            context: { items: items.length },
            cause: "LLM response did not parse as a JSON array",
            next_action: "inspect the raw completion under this correlation id in logs/circadian.events.jsonl",
          });
        } else {
          ok({
            process: "rem", phase: "propagation", correlation_id: corr,
            summary: `propagation judgment: ${propagatedAddresses.length}/${items.length} item(s) propagated${judgment.unrecognizedCount ? `, ${judgment.unrecognizedCount} unrecognized address(es) dropped` : ""}`,
            context: { items: items.length, propagated: propagatedAddresses.length, unrecognized: judgment.unrecognizedCount },
          });
        }
      } catch (err) {
        degraded({
          process: "rem", phase: "propagation", correlation_id: corr,
          summary: "propagation judgment LLM call failed; treated as empty",
          context: { items: items.length },
          cause: (err as Error).message,
          next_action: "check the local LLM at CIRCADIAN_LLM_BASE_URL; this cycle records zero propagation, not a fatal error",
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
  const sankBelowFloor = computeSankBelowFloor(atomsBeforeDecay, statesAfterDecay);
  const topWeight = atomsBeforeDecay.reduce((max, a) => Math.max(max, statesAfterDecay.get(a.id)?.weight ?? 0), 0);

  if (unmappedCount > 0) {
    degraded({
      process: "rem", phase: "decay", correlation_id: corr,
      summary: `decay: ${potentiateEvents.length} potentiate event(s), ${unmappedCount} unmapped propagated address(es)`,
      context: { population: atomsBeforeDecay.length, potentiated: potentiateEvents.length, new_rem_events: newRemCount, unmapped_addresses: unmappedCount, sank_below_floor: sankBelowFloor, dry_run: dryRun },
      cause: `${unmappedCount} propagated address(es) had no matching entry in ${MANIFEST_PATH}`,
      next_action: "check whether render-manifest.json is stale relative to scoreboard.jsonl's rem events",
    });
  } else {
    ok({
      process: "rem", phase: "decay", correlation_id: corr,
      summary: `decay: ${potentiateEvents.length} potentiate event(s) from ${newRemCount} prior rem event(s), 1 decay event${dryRun ? " (dry-run)" : ""}`,
      context: { population: atomsBeforeDecay.length, potentiated: potentiateEvents.length, sank_below_floor: sankBelowFloor, top_weight: Math.round(topWeight * 10000) / 10000, dry_run: dryRun },
    });
  }

  // -------------------------------------------------------------------
  // 4. RENDER + R8 assert
  // -------------------------------------------------------------------
  const atomsForRender = readAtoms(BELIEFS_DIR); // fresh: absorb may have added files since atomsBeforeDecay was read
  const oldSelfMd = readOrEmpty(SELF_PATH);
  const { md: newSelfMd, manifest: newManifest } = renderSelf(atomsForRender, statesAfterDecay);

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
  const topAtoms = [...atomsForRender]
    .filter((a) => (statesAfterDecay.get(a.id)?.status ?? "active") === "active")
    .sort((a, b) => (statesAfterDecay.get(b.id)?.weight ?? 0) - (statesAfterDecay.get(a.id)?.weight ?? 0))
    .slice(0, 5);
  const nowMdForGreeting = readOrEmpty(NOW_PATH);
  let greetingLines: string[] = [];
  if (!dryRun) {
    try {
      const prompt = buildGreetingPrompt(nowMdForGreeting, topAtoms);
      const raw = await complete(prompt, { timeoutMs: GREETING_TIMEOUT_MS, maxTokens: GREETING_MAX_TOKENS, temperature: 0.3 });
      const greeting = parseGreetingResponse(raw);
      if (greeting.malformed) {
        degraded({
          process: "rem", phase: "greeting", correlation_id: corr,
          summary: "greeting completion was malformed; greeting.md left unchanged",
          context: {},
          cause: "LLM response had no non-empty lines",
          next_action: "inspect the raw completion under this correlation id in logs/circadian.events.jsonl",
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
      context: { would_absorb: newEpisodes.length, would_sank: sankBelowFloor.length },
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
    composted: [],
    self_changed: selfChanged,
    stacked: aggCounts.new,
    bumped: aggCounts.stacked + aggCounts.bumped,
  });

  const vitals = {
    ts: nowIso,
    src_loc: countSrcLoc(),
    population: atomsForRender.length,
    top_weight: Math.round(topWeight * 10000) / 10000,
    sank_below_floor: sankBelowFloor,
  };
  fs.mkdirSync(path.dirname(VITALS_PATH), { recursive: true });
  fs.writeFileSync(VITALS_PATH, JSON.stringify(vitals, null, 2) + "\n");

  const dateStr = nowIso.slice(0, 10);
  const { subject, body } = buildCommitMessage({
    date: dateStr,
    stacked: aggCounts.new,
    bumped: aggCounts.stacked + aggCounts.bumped,
    sank: sankBelowFloor.length,
    population: atomsForRender.length,
    sankIds: sankBelowFloor,
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
        stacked: aggCounts.new, bumped: aggCounts.stacked + aggCounts.bumped, sank: sankBelowFloor.length,
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
if (import.meta.main) await main();
