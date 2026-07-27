#!/usr/bin/env bun
/**
 * rem.ts — the REM consolidator of the Circadian memory substrate.
 *
 * Twice-daily launchd job (com.circadian.rem, 09:00 & 21:00 per MIND-SPEC.md "The Cycle
 * > REM"). One run does, in order:
 *
 *   1. loads mind/{SELF,USER,NOW,greeting,compost}.md and all episodes/*.md;
 *      "new" episodes are those modified after the last rem-event ts in
 *      scoreboard.jsonl (all of them if no rem event has ever run).
 *   2. gathers propagation evidence: transcripts under ~/.claude/projects/
 *      modified in the last 24h, bounded per-transcript and in total, plus
 *      an enumeration of the items currently "live" in SELF.md/NOW.md.
 *   3. calls the local LLM (llm.ts — the system mlx-omni-server on :10240,
 *      replacing the old `claude -p` dependency) with both, asking it to
 *      judge each new episode against
 *      SELF.md (confirm/contradict/supersede/deepen), rewrite SELF.md
 *      (shrink-unless-justified), decide compost eligibility under the
 *      digestion-completeness rule, plant one NOW.md serendipity line, and
 *      draft tomorrow's greeting.md.
 *   4. validates everything against MIND-SPEC's caps and rules BEFORE any
 *      file is touched; on any failure to call claude or parse/validate its
 *      output, exits non-zero and leaves every mind file untouched.
 *   5. writes (temp file + rename), appends the rem scoreboard event, and
 *      commits the mind repo — REM is the only regular committer of it.
 *
 * No mocks: the LLM call is real every time this runs for real (i.e.
 * without --dry-run). --dry-run performs steps 1-2 and prints the exact
 * prompt that would be sent, without calling the LLM or writing anything.
 */

import * as fs from "fs";
import * as path from "path";
import { homedir } from "os";
import { execFileSync, spawnSync } from "child_process";
import { createHash } from "crypto";
import { complete } from "./llm.ts";
import { ok, idle, degraded, fail, correlation } from "./obs.ts";
import { MUTATION_GRAMMAR, parseMutations, applyMutations, noChangeGreeting, selfSimilarity, counterfeitQuotes, detectSelfStutter, type Mutation, type ParsedMutations, type StampCorrection, type StutterReport } from "./mutate.ts";
import { USER_MUTATION_GRAMMAR, parseUserMutations, applyUserMutations } from "./usermutate.ts";
import { clusterEpisodes, type EpisodeCluster } from "./ltp.ts";

// ---- paths (per MIND-SPEC.md) ----
// CIRCADIAN_HOME overrides; default ~/circadian. See wake.ts for the contract.
// The mind repo lives at $CIRCADIAN_HOME/mind; it is a git repo with no remote.
const CIRCADIAN_HOME = process.env.CIRCADIAN_HOME || path.join(homedir(), "circadian");
const MIND_DIR = path.join(CIRCADIAN_HOME, "mind");
const SELF_PATH = path.join(MIND_DIR, "SELF.md");
const USER_PATH = path.join(MIND_DIR, "USER.md");
const NOW_PATH = path.join(MIND_DIR, "NOW.md");
const GREETING_PATH = path.join(MIND_DIR, "greeting.md");
const COMPOST_PATH = path.join(MIND_DIR, "compost.md");
const SPEC_PATH = path.join(MIND_DIR, "MIND-SPEC.md");
const SCOREBOARD_PATH = path.join(MIND_DIR, "scoreboard.jsonl");
const EPISODES_DIR = path.join(MIND_DIR, "episodes");

// Where the harness writes session transcripts (propagation evidence). Claude
// Code uses ~/.claude/projects; overridable for other harnesses/users.
const PROJECTS_DIR = process.env.CIRCADIAN_PROJECTS_DIR || path.join(homedir(), ".claude/projects");
// Same bun-binary contract as backfill.ts (used to spawn sleep's drain).
const BUN_BIN = process.env.CIRCADIAN_BUN_BIN || path.join(homedir(), ".bun/bin/bun");

// ---- token caps: chars/4 = tokens (MIND-SPEC.md "Token Caps") ----
// Soft target sizes, NOT hard walls. The mind is a free, open metabolism: it
// AIMS for these, and overshooting by a few or a few hundred tokens never
// kills a digestion. A cap that rejects the whole pass for being 3 tokens over
// is the compost-jam disease in another organ. These are the number the model
// is asked to shrink toward; only a far runaway (RUNAWAY_FACTOR x target) hard
// stops, and even then it says so loudly rather than silently truncating.
const TARGET_SELF_TOKENS = 6000;
const TARGET_USER_TOKENS = 2000;
const TARGET_NOW_TOKENS = 3000;
const TARGET_COMPOST_TOKENS = 1000;
const RUNAWAY_FACTOR = 1.75; // only a gross overshoot (e.g. SELF > 10.5k) is a real fault

// ---- redundancy guard: the instrument size could never provide ----
// Size alone cannot tell a worldview that genuinely grew from one stuttering
// the same sentence fourteen times — both read as "over target". These are the
// thresholds on self-similarity (fraction of the document redundant with
// itself). Unlike size, redundancy has no legitimate reason to rise: a mind
// that repeats itself is not holding more, it is holding the same thing badly.
const SIMILARITY_WARN = 0.10; // surfaced loudly in telemetry and the commit body
const SIMILARITY_FAULT = 0.25; // a wave may not INCREASE similarity past this
const GREETING_MAX_LINES = 3;

// ---- propagation-evidence bounds (this process's own input budget; not a
// MIND-SPEC cap, just keeps the claude call bounded) ----
const TRANSCRIPT_WINDOW_MS = 24 * 60 * 60 * 1000;
// Transcript-excerpt budget is the main variable driver of REM's prompt size.
// At 24k chars the total prompt reached ~19k tokens and the local 4B model
// returned empty content (it cannot complete a ~6k-token structured output
// from that large a context). Held to 12k chars (~3k tokens) so the whole
// prompt stays within the model's proven envelope (~12k tokens in, 6k out).
const PER_TRANSCRIPT_EXCERPT_CHARS = 2500;
const TOTAL_EXCERPT_BUDGET_CHARS = 12000;
const LLM_TIMEOUT_MS = 15 * 60 * 1000; // full SELF.md rewrite on a local model can be slow
const LLM_MAX_TOKENS = 12000; // must exceed a full SELF.md rewrite (~6k) plus the other blocks

function tokensOf(text: string): number {
  return Math.ceil(text.length / 4);
}

function readOrEmpty(p: string): string {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

// ---- human-readable progress log (separate from the obs event ledger) ----
// rem runs as a scheduled launchd job; its stdout/stderr is captured by
// launchd and not easily tailed. rlog() writes a plain timestamped line to
// logs/rem.log so `tail -f logs/rem.log` shows the wave-by-wave drain in
// real time, while the structured obs events carry the auditable trail.
const REM_LOG = path.join(CIRCADIAN_HOME, "logs", "rem.log");
function rlog(msg: string, extra?: Record<string, unknown>): void {
  try {
    fs.mkdirSync(path.dirname(REM_LOG), { recursive: true });
    const line = `${new Date().toISOString()} [rem] ${msg}${extra ? " " + JSON.stringify(extra) : ""}\n`;
    fs.appendFileSync(REM_LOG, line);
  } catch {
    /* logging must never break rem */
  }
}

// ---------------------------------------------------------------------
// scoreboard
// ---------------------------------------------------------------------

interface ScoreEvent {
  ts: string;
  type: "wake" | "sleep" | "rem" | "verdict";
  worldview_tokens: number;
  greeting_verdict?: "ok" | "bad";
  reason?: string;
  propagated?: string[];
  composted?: string[];
  /** Did this wave actually change SELF.md? false = the model echoed its
   * input back — the flatline signal doctor watches for. */
  self_changed?: boolean;
}

function loadScoreboard(): ScoreEvent[] {
  const raw = readOrEmpty(SCOREBOARD_PATH);
  const events: ScoreEvent[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed));
    } catch {
      process.stderr.write(`rem: skipping unparseable scoreboard line: ${trimmed.slice(0, 80)}\n`);
    }
  }
  return events;
}

function lastRemTs(events: ScoreEvent[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === "rem") return events[i].ts;
  }
  return null;
}

function appendScoreboardEvent(event: ScoreEvent) {
  fs.appendFileSync(SCOREBOARD_PATH, JSON.stringify(event) + "\n");
}

// ---------------------------------------------------------------------
// episodes
// ---------------------------------------------------------------------

interface Episode {
  filename: string;
  filepath: string;
  content: string;
  hash: string; // sha256 of on-disk content — stable content identity
  isNew: boolean; // NOT digested yet, per the digested ledger (never mtime)
}

// ---------------------------------------------------------------------
// digested ledger — the single source of truth for "have I absorbed this?"
//
// WHY THIS EXISTS: "new" was previously decided by comparing file mtime to the
// last rem event's timestamp. That is a guess, not state: a rem commit's own
// timestamp buries any episode whose mtime predates it, stranding it as a
// permanent, SILENT backlog (observed: 2 episodes the drain loop could never
// see). Filesystem time, git checkouts, backfills, and re-runs all corrupt an
// mtime heuristic. The ledger replaces the guess with a fact: an episode is
// digested iff its CONTENT HASH is recorded here. Content-keyed, so identity
// survives renames, re-touches, git operations, and duplicate filenames.
//
// INVARIANT (the thing you can trust): every episode fed into a committed rem
// wave as NEW gets its hash appended here inside the same commit. Therefore
// each committed wave strictly shrinks the undigested set, and drain-to-zero
// terminates in finite passes regardless of clocks.
// ---------------------------------------------------------------------
const DIGESTED_PATH = path.join(MIND_DIR, "digested.jsonl");

interface DigestedEntry {
  ts: string;
  hash: string;
  filename: string;
  disposition: "absorbed" | "composted";
}

function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function loadDigestedHashes(): Set<string> {
  const set = new Set<string>();
  let raw = "";
  try {
    raw = fs.readFileSync(DIGESTED_PATH, "utf8");
  } catch {
    return set; // no ledger yet -> nothing digested
  }
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const e = JSON.parse(t) as DigestedEntry;
      if (e && typeof e.hash === "string" && e.hash) set.add(e.hash);
    } catch {
      process.stderr.write(`rem: skipping unparseable digested-ledger line: ${t.slice(0, 80)}\n`);
    }
  }
  return set;
}

// Append entries and return the ledger text to be committed. Writing is
// append-only + atomic via read-modify-rewrite so a crash mid-write cannot
// corrupt prior facts (old file stays intact until rename).
function recordDigested(entries: DigestedEntry[]): void {
  if (entries.length === 0) return;
  const existing = (() => {
    try {
      return fs.readFileSync(DIGESTED_PATH, "utf8");
    } catch {
      return "";
    }
  })();
  const addition = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  const next = existing && !existing.endsWith("\n") ? existing + "\n" + addition : existing + addition;
  const tmp = `${DIGESTED_PATH}.rem-tmp`;
  fs.writeFileSync(tmp, next, "utf8");
  fs.renameSync(tmp, DIGESTED_PATH);
}

function loadEpisodes(): Episode[] {
  let files: string[] = [];
  try {
    files = fs.readdirSync(EPISODES_DIR).filter((f) => f.endsWith(".md"));
  } catch {
    files = [];
  }
  const digested = loadDigestedHashes();
  return files
    .map((f) => {
      const filepath = path.join(EPISODES_DIR, f);
      const content = fs.readFileSync(filepath, "utf8");
      const hash = hashContent(content);
      return { filename: f, filepath, content, hash, isNew: !digested.has(hash) };
    })
    .sort((a, b) => a.filename.localeCompare(b.filename));
}

// Peristalsis: REM digests at most `batch` new episodes per pass (oldest
// first), and carries at most a handful of already-seen episodes as compost
// candidates. A backlog (e.g. a backfill, or a heavy week) is therefore
// drained wave by wave across passes instead of being shoved into one
// monolithic prompt that blows the model's context and the compost cap in a
// single all-or-nothing transaction. Biology: one enzyme, one substrate.
interface Meal {
  episodes: Episode[]; // what this pass digests (cluster representatives for LTP'd groups)
  deferred: Episode[]; // new episodes deferred to later passes
  /** LTP: weight + absorbed members per representative filename. A weight-14
   * representative carries thirteen collapsed near-duplicates — repetition as
   * signal strength, not signal volume. */
  ltp: Map<string, { weight: number; members: Episode[] }>;
}
function selectMeal(all: Episode[], batch: number, seenCap = 6): Meal {
  const fresh = all.filter((e) => e.isNew);
  const seen = all.filter((e) => !e.isNew);

  // LONG-TERM POTENTIATION: collapse near-duplicate NEW episodes into one
  // potentiated representative BEFORE batching. Fourteen sync-test episodes
  // are one lesson told fourteen times — one synapse strengthened, not
  // fourteen grown. Members ride along: their hashes enter the digested
  // ledger with the representative, and compost sheds the whole cluster.
  const clusters = clusterEpisodes(fresh);
  const ltp = new Map<string, { weight: number; members: Episode[] }>();
  const potentiated: Episode[] = [];
  for (const c of clusters) {
    potentiated.push(c.representative);
    if (c.weight > 1) ltp.set(c.representative.filename, { weight: c.weight, members: c.members });
  }

  const meal = [...potentiated.slice(0, batch), ...seen.slice(0, seenCap)].sort((a, b) =>
    a.filename.localeCompare(b.filename)
  );
  return { episodes: meal, deferred: potentiated.slice(batch), ltp };
}

// ---------------------------------------------------------------------
// propagation evidence: recent transcripts + enumerated injected items
// ---------------------------------------------------------------------

function extractText(obj: any): string {
  const msg = obj?.message;
  if (!msg) return "";
  const content = msg.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b: any) => b && b.type === "text" && typeof b.text === "string")
      .map((b: any) => b.text)
      .join("\n");
  }
  return "";
}

interface TranscriptExcerpt {
  path: string;
  excerpt: string;
}

function gatherTranscriptExcerpts(): TranscriptExcerpt[] {
  const results: TranscriptExcerpt[] = [];
  let projectDirs: string[] = [];
  try {
    projectDirs = fs.readdirSync(PROJECTS_DIR);
  } catch {
    return results;
  }
  const cutoff = Date.now() - TRANSCRIPT_WINDOW_MS;
  const candidates: { p: string; mtime: number }[] = [];
  for (const dir of projectDirs) {
    const dirPath = path.join(PROJECTS_DIR, dir);
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(dirPath).filter((f) => f.endsWith(".jsonl"));
    } catch {
      continue;
    }
    for (const f of entries) {
      const fp = path.join(dirPath, f);
      try {
        const stat = fs.statSync(fp);
        if (stat.mtimeMs >= cutoff) candidates.push({ p: fp, mtime: stat.mtimeMs });
      } catch {
        continue;
      }
    }
  }
  candidates.sort((a, b) => b.mtime - a.mtime); // most recent first

  let totalBudget = TOTAL_EXCERPT_BUDGET_CHARS;
  for (const { p } of candidates) {
    if (totalBudget <= 0) break;
    let lines: string[];
    try {
      lines = fs.readFileSync(p, "utf8").split("\n");
    } catch {
      continue;
    }
    let text = "";
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      try {
        const obj = JSON.parse(t);
        const extracted = extractText(obj);
        if (extracted) text += extracted + "\n";
      } catch {
        continue;
      }
    }
    if (!text) continue;
    const perBudget = Math.min(PER_TRANSCRIPT_EXCERPT_CHARS, totalBudget);
    // tail slice: the most recent content in a transcript is the most
    // relevant evidence for "did this propagate in the live session."
    const excerpt = text.length > perBudget ? text.slice(-perBudget) : text;
    results.push({ path: p, excerpt });
    totalBudget -= excerpt.length;
  }
  return results;
}

function enumerateSection(md: string, heading: string, idPrefix: string): string[] {
  const lines = md.split("\n");
  const items: string[] = [];
  let inSection = false;
  let idx = 0;
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      inSection = line.trim() === `## ${heading}`;
      continue;
    }
    if (inSection && line.trim()) {
      idx += 1;
      items.push(`${idPrefix}[${idx}] ${line.trim()}`);
    }
  }
  return items;
}

function enumerateInjectedItems(selfMd: string, nowMd: string): string[] {
  return [
    ...enumerateSection(selfMd, "Doctrine", "SELF.Doctrine"),
    ...enumerateSection(selfMd, "Motifs", "SELF.Motifs"),
    ...enumerateSection(nowMd, "Arc", "NOW.Arc"),
    ...enumerateSection(nowMd, "Flight plan", "NOW.FlightPlan"),
    ...enumerateSection(nowMd, "Live tensions", "NOW.LiveTensions"),
    ...enumerateSection(nowMd, "Commitments", "NOW.Commitments"),
    ...enumerateSection(nowMd, "Serendipity", "NOW.Serendipity"),
  ];
}

// ---------------------------------------------------------------------
// prompt assembly
// ---------------------------------------------------------------------

interface MindContext {
  specMd: string;
  selfMd: string;
  userMd: string;
  nowMd: string;
  greetingMd: string;
  compostMd: string;
  episodes: Episode[];
  transcripts: TranscriptExcerpt[];
  injectedItems: string[];
  ltp: Map<string, { weight: number; members: Episode[] }>;
  /** Inward LTP: near-duplicate doctrine/motif groups detected in the CURRENT
   * SELF.md before this wave — rendered as an explicit merge directive so the
   * model is handed addresses, not a vibe. Null when the worldview is clean. */
  stutter: StutterReport | null;
}

/** Inward-LTP merge directive. When detectSelfStutter finds near-duplicate
 * doctrine entries or motif lines in the CURRENT worldview, the prompt names
 * them explicitly and demands the merge — a directive with addresses, because
 * "look for two doctrines saying the same thing" (the standing rule above)
 * demonstrably did not find 8/16/17 on its own. Empty when the worldview is
 * clean, so a clean wave pays zero prompt tokens for it. */
function renderStutterDirective(stutter: StutterReport | null): string {
  if (!stutter || (stutter.doctrine.length === 0 && stutter.motifs.length === 0)) return "";
  const parts: string[] = [
    "",
    "=== STUTTER DETECTED — MERGE DIRECTIVE (mechanically measured on the current SELF.md; not optional) ===",
    "The worldview is currently holding one belief in multiple entries. Your FIRST mutations this wave must collapse each group below:",
  ];
  for (const group of stutter.doctrine) {
    parts.push(
      `- Doctrine entries ${group.map((d) => `[${d.n}] "${d.title}"`).join(", ")} carry one belief. ` +
        `MERGE them into ONE entry with a single N-way line into the lowest-numbered member (e.g. MERGE Doctrine[${group[0].n}] <- ${group.slice(1).map((d) => `Doctrine[${d.n}]`).join(" <- ")} :: <unified body>). ` +
        `Keep the fullest why-chain; every distinct [ep:YYYY-MM-DD] stamp is preserved automatically — the stamps are provenance addresses and must survive the fold.`
    );
  }
  for (const group of stutter.motifs) {
    parts.push(
      `- These motif lines are one theme told ${group.length} ways: ${group.map((l) => `"${l.replace(/^-\s*/, "").slice(0, 70)}"`).join(" / ")}. ` +
        `Keep the fullest single line and RETRACT MOTIF the others (a motif is a recurring theme, not a log of its recurrences).`
    );
  }
  return parts.join("\n");
}

function buildPrompt(ctx: MindContext): string {
  const newEpisodes = ctx.episodes.filter((e) => e.isNew);
  const oldEpisodes = ctx.episodes.filter((e) => !e.isNew);

  // LTP rendering: a potentiated representative announces its weight so the
  // model reads recurrence as evidence strength — "this lesson was lived x14"
  // — instead of receiving fourteen copies that drown the rest of the meal.
  const epHeader = (e: Episode): string => {
    const pot = ctx.ltp.get(e.filename);
    const freshness = e.isNew ? "NEW since last REM" : "already seen";
    if (!pot) return `--- episode: ${e.filename} [${freshness}] ---`;
    return `--- episode: ${e.filename} [${freshness}] [POTENTIATED x${pot.weight}: this same lesson was drafted ${pot.weight} times this cycle (${pot.members.map((m) => m.filename).join(", ")}) — treat recurrence as strong evidence, absorb it ONCE] ---`;
  };

  // Provenance-leak guard (2026-07-27, found via replay): a composted episode
  // carries a "taught -> absorbed-where: ... -> SELF.md Doctrine[N]" footer
  // whose N was valid in the SELF.md of its composting day. Fed to the model,
  // that stale address reads as an instruction — every replayed ACP episode
  // made the model emit DEEPEN Doctrine[5] against a document with 3 entries.
  // ltp.ts already strips these lines for similarity; the prompt gets the same
  // hygiene. The footer is provenance for humans and zoom, never model input.
  const stripAbsorbedWhere = (c: string): string =>
    c
      .split("\n")
      .filter((l) => !/^\*\*taught -> absorbed-where:\*\*/i.test(l.trim()))
      .join("\n");

  const episodesBlock =
    ctx.episodes.length === 0
      ? "(none — episodes/ is empty)"
      : ctx.episodes.map((e) => `${epHeader(e)}\n${stripAbsorbedWhere(e.content)}`).join("\n\n");

  const transcriptsBlock =
    ctx.transcripts.length === 0
      ? "(none — no transcripts modified in the last 24h)"
      : ctx.transcripts.map((t) => `--- transcript: ${t.path} ---\n${t.excerpt}`).join("\n\n");

  const injectedBlock = ctx.injectedItems.length === 0 ? "(none currently loaded)" : ctx.injectedItems.join("\n");

  return `You are REM, the twice-daily consolidation pass of the Circadian memory substrate (the mind repo). Follow MIND-SPEC.md exactly — it is the design authority. You do not chat; you produce exactly the delimited output blocks specified at the end of this prompt and nothing else outside them.

=== MIND-SPEC.md (authority for this process) ===
${ctx.specMd}

=== current SELF.md ===
${ctx.selfMd || "(empty)"}

=== current USER.md (private, relational — read-only here; a separate pass updates it) ===
${ctx.userMd || "(empty)"}

=== current NOW.md ===
${ctx.nowMd || "(empty)"}

=== current greeting.md ===
${ctx.greetingMd || "(empty)"}

=== current compost.md ===
${ctx.compostMd || "(empty)"}

=== episodes: ALL of episodes/ (${newEpisodes.length} new since last REM, ${oldEpisodes.length} already seen) ===
${episodesBlock}

=== injected items currently live (candidates for propagation judgment and zero-propagation compost candidacy) ===
${injectedBlock}

=== recent transcript excerpts, last 24h, bounded tail slices (evidence for whether the injected items above actually recurred or were built on) ===
${transcriptsBlock}

=== your tasks, in order ===

1. For each episode marked NEW since last REM, judge it against the current SELF.md above: does it confirm, contradict, supersede, or deepen the existing worldview?

2. Express EVERY judgment as MUTATIONS. You never output SELF.md — you emit mutation lines and the engine applies them mechanically. This is deliberate: a full rewrite makes copying the safest move; mutations make change cheaper than stagnation.

${MUTATION_GRAMMAR}

Mutation rules:
- Prefer the smallest mutation that carries the lesson. One DEEPEN beats a paragraph.
- BEFORE adding anything, check whether the worldview already holds it. If a doctrine, motif, bullet, or identity sentence already carries this substance, the correct mutation is CONFIRM (it earned residence again) or REVISE (it can be said better) — NEVER a second copy. A repeated belief is not a stronger belief.
- SHRINKING IS THE WORK, not the cleanup afterward. RETRACT, SUPERSEDE, MERGE and REVISE count as much as DEEPEN and ADD. A wave with zero catabolic mutations is a digestion that absorbed without excreting, and it will be reported as such.
- Specifically look for: two doctrines saying the same thing (MERGE them), a HowWeWork bullet that has drifted into a paragraph (REVISE it shorter), identity prose that has accumulated restatements (REVISE WhoIAm with a distilled version), a motif that is really a log of its own recurrences (RETRACT MOTIF).
- The worldview has a redundancy budget. If the digest above reports high redundancy, your FIRST mutations must reduce it.
- DEEPEN and ADD must carry the why-chain — the reasoning, a verbatim quote where voice matters — never a bare conclusion. Ash is banned.
- QUOTE INTEGRITY (hard rule): quotation marks are RESERVED for text that appears VERBATIM in an episode or transcript above. If you distill, synthesize, or paraphrase, write it UNQUOTED — a synthesized sentence wearing quotation marks is a forged quote, and every quoted span you emit is checked mechanically against the sources after this pass. When in doubt, drop the quotation marks.
- CONFIRM is real work: a belief that keeps earning its residence should say so; beliefs nobody confirms are drifting toward compost.
- If genuinely nothing moved, emit exactly ONE line: NO-CHANGE :: <justification>. The justification must name the WORK-side reason (e.g. "six sync-test episodes repeat a lesson Doctrine[5] already holds — the work is circling the same validation loop"), because it will be spoken to jrg at the next wake, to his face.
- An empty MUTATIONS block is invalid. Mutate or confess — silence is not an option.
${renderStutterDirective(ctx.stutter)}

3. Using the transcript excerpts and the injected-items list, judge which injected items actually propagated (were read, referenced, or built upon) recently. Items with zero observed propagation across their lifetime are compost candidates (Law 6) — candidacy only, this does not by itself compost anything.

4. Decide compost eligibility strictly under the digestion-completeness rule: an episode (new or already-seen) may be composted ONLY if you can state BOTH (a) what it taught, and (b) exactly where that lesson now lives in the rewritten mind (e.g. "SELF.md Doctrine [ep:...]" or "NOW.md Arc"). If you cannot state both with confidence, do not compost it, regardless of its age or token pressure.

5. Plant exactly ONE new serendipity line for NOW.md's Serendipity section: a single line starting exactly "Might be nothing:". This replaces whatever was there before.

6. Draft tomorrow's greeting.md as a DREAM-ECHO: one short spoken first-person voice from the mind to jrg, 1-3 lines. This is NOT a memo with labels ("Arc:" / "First move:") — it is the mind waking up and speaking. Weave in, naturally: what got carried forward from the digested episodes (the thing worth knowing overnight), the live tension that is still open, and the next move. Anchor-aware (Law 8): orient to the WORK — the arc, the tension, the move — never mention Circadian, REM, SELF.md, episodes, or the memory system itself, and never narrate your own process. Speak like a trusted collaborator resuming mid-thought, with jrg's register allowed (he responds to intensity and substance, not coddling). No flattery, no filler, no preamble. It must still pass the Law-3 test: if it isn't good enough to say out loud to him at the top of a session, it isn't earning its keep. Example register (do not copy): "Kept the venue-field guard from silently eating seven deals while you were away. The ACP bidirectional-state question is still the open one — that's where to start."

(USER.md is handled by a separate dedicated pass after this one — do not rewrite it here.)

=== required output format — EXACTLY these five blocks, in this order, nothing else outside them ===

===MUTATIONS===
<one mutation per line, following the grammar exactly; NEVER empty — mutate or confess NO-CHANGE>
===END_MUTATIONS===

===SERENDIPITY_LINE===
<the single new NOW.md Serendipity line; must start with "Might be nothing:"; must be exactly one line>
===END_SERENDIPITY_LINE===

===GREETING_MD===
<the full new greeting.md dream-echo; a short first-person voice, 1-3 lines, no labels>
===END_GREETING_MD===

===COMPOST_JSON===
<a JSON array, possibly empty ([]), of objects: {"episode": "<filename in episodes/, exactly as given above>", "taught": "<what it taught>", "absorbed_where": "<file/section it now lives in>"}>
===END_COMPOST_JSON===

===PROPAGATED_JSON===
<a JSON array, possibly empty ([]), of strings identifying which injected items above propagated recently>
===END_PROPAGATED_JSON===
`;
}

// USER.md gets its own focused call (task 8): a small prompt — current USER.md
// plus only the episodes' user-observed lines — so the local model stays well
// within its output envelope instead of choking on SELF+USER in one shot.
function buildUserPrompt(existingUser: string, userObservations: { ep: string; line: string }[]): string {
  const obs = userObservations.length
    ? userObservations.map((o) => `- [ep:${o.ep}] ${o.line}`).join("\n")
    : "(none this cycle)";
  // The model was previously told the CAP but never its CURRENT SIZE, so it had
  // no way to know it was already over and no signal to shrink. Stating the
  // overage explicitly is the difference between a rule and an instruction.
  const curTokens = tokensOf(existingUser);
  // A BUDGET, NOT A SCOLDING. First attempt here just told the model it was over
  // target; the live wave then emitted 5 catabolic ops that saved 844 chars and 3
  // anabolic ops that added 836 — net minus eight. Every instruction was obeyed
  // and nothing moved, because "you are over target" does not say how much to
  // cut, and an unquantified goal loses to a concrete one every time.
  //
  // So the overage is converted into a CHARACTER QUOTA with a stated deadline in
  // waves, and the anabolic side is explicitly capped against it. Same three
  // rubrics as everywhere else: bounded loop, explicit termination condition.
  const overTokens = curTokens - TARGET_USER_TOKENS;
  const budget =
    overTokens > 0
      ? `\n\nSIZE STATUS: USER.md is ${curTokens} tokens against a target of ${TARGET_USER_TOKENS} — OVER by ${overTokens} tokens (${overTokens * 4} characters).\n\nYOUR QUOTA THIS WAVE: remove at least ${Math.max(400, Math.min(overTokens * 4, 1200))} characters NET. Count as you go: a MERGE of two ~400-char lines into one ~200-char line nets about -600; a REVISE that halves a 300-char line nets about -150; an OBSERVE of a new 400-char line nets +400 and spends your quota. Do the cutting FIRST, then add only what the cuts leave room for. A wave that ends net-flat has failed even if every single mutation was valid — that is exactly what happened last wave (844 characters cut, 836 added back, net -8).`
      : `\n\nSIZE STATUS: USER.md is ${curTokens} tokens against a target of ${TARGET_USER_TOKENS} — under target, with ${TARGET_USER_TOKENS - curTokens} tokens of room. Add only what is genuinely new, and prefer DEEPEN of a held line over a new one.`;

  return `You are the USER-MODEL pass of REM in a circadian memory substrate. You maintain USER.md, the private relational model of the user jrg — who he is to work with: preferences, working style, register, mental models, reaction patterns. NOT code facts.${budget}

You do NOT output USER.md. You emit MUTATIONS which an engine applies mechanically. This is deliberate: when this pass asked for a full rewrite, the model returned the file byte-identically while 919 tokens over target, because copying input to output is the cheapest valid answer. One mutation line is cheaper than a copy, so the cheapest answer is now a real change.

CURRENT USER.md:
"""
${existingUser || "(empty)"}
"""

NEW OBSERVATIONS from this cycle's episodes (each is a "user-observed:" line a session drafted about jrg):
"""
${obs}
"""

Your task: express every judgment about the new observations as MUTATIONS against the current USER.md.

${USER_MUTATION_GRAMMAR}

Rules:
- A genuinely new, well-evidenced observation is OBSERVE. One that adds evidence to a trait already held is DEEPEN. One that says an existing line better is REVISE. Several lines describing ONE trait are MERGE. A trait that no longer holds is RETRACT.
- Never OBSERVE something already held — the engine will refuse it and report you as circling.
- Ash is banned: every line carries its why or a short verbatim quote. "jrg prefers X" with no reasoning is a defect.
- Keep origin stamps [ep:YYYY-MM-DD]; the engine adds one if you omit it.
- These are inferences about a person and they self-correct over cycles — record well-evidenced ones without fear, but never invent beyond the observations given.
- If nothing about jrg moved this cycle, emit exactly ONE line: NO-CHANGE :: <justification>.

Output EXACTLY one block, nothing else:

===USER_MUTATIONS===
<one mutation per line, following the grammar exactly; NEVER empty>
===END_USER_MUTATIONS===
`;
}

// ---------------------------------------------------------------------
// parsing + validation of claude's output (all pure — no side effects)
// ---------------------------------------------------------------------

interface ParsedOutput {
  mutations: Mutation[];
  malformedMutations: string[];
  droppedConfession: string | null;
  serendipityLine: string;
  greetingMd: string;
  compost: { episode: string; taught: string; absorbed_where: string }[];
  propagated: string[];
}

function extractBlock(raw: string, name: string): string | null {
  const re = new RegExp(`===${name}===\\r?\\n([\\s\\S]*?)\\r?\\n?===END_${name}===`);
  const m = raw.match(re);
  if (!m) return null;
  return m[1];
}

function parseClaudeOutput(raw: string): ParsedOutput {
  const names = [
    "MUTATIONS",
    "SERENDIPITY_LINE",
    "GREETING_MD",
    "COMPOST_JSON",
    "PROPAGATED_JSON",
  ];
  const blocks: Record<string, string> = {};
  const missing: string[] = [];
  for (const n of names) {
    const b = extractBlock(raw, n);
    if (b === null) missing.push(n);
    else blocks[n] = b.trim();
  }
  if (missing.length > 0) {
    throw new Error(`claude output missing required block(s): ${missing.join(", ")}`);
  }

  // parseMutations is a forgiving reader of a strict grammar: malformed lines
  // and incoherent confessions are collected for loud telemetry, and it only
  // throws (back-pressure) when nothing valid survives at all.
  const pm: ParsedMutations = parseMutations(blocks.MUTATIONS);
  const mutations = pm.mutations;

  let compost: any;
  try {
    compost = JSON.parse(blocks.COMPOST_JSON || "[]");
  } catch (e) {
    throw new Error(`COMPOST_JSON block is not valid JSON: ${(e as Error).message}`);
  }
  if (!Array.isArray(compost)) throw new Error("COMPOST_JSON block must be a JSON array");
  for (const m of compost) {
    if (
      !m ||
      typeof m.episode !== "string" ||
      typeof m.taught !== "string" ||
      typeof m.absorbed_where !== "string" ||
      !m.taught.trim() ||
      !m.absorbed_where.trim()
    ) {
      throw new Error(`COMPOST_JSON entry fails the digestion-completeness rule: ${JSON.stringify(m)}`);
    }
  }

  let propagated: any;
  try {
    propagated = JSON.parse(blocks.PROPAGATED_JSON || "[]");
  } catch (e) {
    throw new Error(`PROPAGATED_JSON block is not valid JSON: ${(e as Error).message}`);
  }
  if (!Array.isArray(propagated) || !propagated.every((p: any) => typeof p === "string")) {
    throw new Error("PROPAGATED_JSON block must be a JSON array of strings");
  }

  if (!blocks.SERENDIPITY_LINE.startsWith("Might be nothing:")) {
    throw new Error(`SERENDIPITY_LINE must start with "Might be nothing:", got: ${blocks.SERENDIPITY_LINE.slice(0, 60)}`);
  }
  if (blocks.SERENDIPITY_LINE.includes("\n")) {
    throw new Error("SERENDIPITY_LINE must be exactly one line");
  }

  const greetingLines = blocks.GREETING_MD.split("\n").filter((l) => l.length > 0);
  // Soft target like everything else: the dream-echo aims for <=3 lines; only a
  // gross overrun (a whole monologue) is refused.
  if (greetingLines.length > GREETING_MAX_LINES * 2) {
    throw new Error(`GREETING_MD is a monologue (${greetingLines.length} lines) — the dream-echo should be a few spoken lines, not a briefing`);
  }

  return {
    mutations,
    malformedMutations: pm.malformed,
    droppedConfession: pm.droppedConfession,
    serendipityLine: blocks.SERENDIPITY_LINE,
    greetingMd: blocks.GREETING_MD,
    compost,
    propagated,
  };
}

function validateCompostAgainstEpisodes(compost: ParsedOutput["compost"], episodes: Episode[]): { kept: ParsedOutput["compost"]; dropped: string[] } {
  const known = new Set(episodes.map((e) => e.filename));
  const kept: ParsedOutput["compost"] = [];
  const dropped: string[] = [];
  for (const m of compost) {
    if (known.has(m.episode)) kept.push(m);
    else dropped.push(m.episode);
  }
  // A hallucinated/typo'd filename in the model's compost list must NOT stall
  // the whole metabolism — drop the invalid refs, keep the valid ones, and
  // surface the drops as telemetry. Digestion-completeness still governs the
  // kept entries; this only stops a naming slip from blocking everything.
  if (dropped.length > 0) {
    degraded({
      process: "rem", phase: "compost-select",
      summary: `dropped ${dropped.length} compost reference(s) to nonexistent episode file(s)`,
      context: { dropped, kept_count: kept.length },
      cause: "model emitted COMPOST_JSON filenames not present in episodes/ (hallucination or typo)",
      next_action: "no action needed — valid composts proceeded; the referenced episodes remain for future passes",
    });
  }
  return { kept, dropped };
}

// Soft size check. Returns a status the caller surfaces as telemetry — it does
// NOT throw for normal overshoot. Only a runaway (well past target) is a fault,
// and it is returned, never silently applied. "over target" is informational.
function checkSize(name: string, text: string, targetTokens: number): {
  tokens: number;
  target: number;
  status: "under" | "over-target" | "runaway";
} {
  const tk = tokensOf(text);
  const runawayAt = Math.floor(targetTokens * RUNAWAY_FACTOR);
  const status = tk > runawayAt ? "runaway" : tk > targetTokens ? "over-target" : "under";
  return { tokens: tk, target: targetTokens, status };
}

function replaceSection(md: string, heading: string, newBody: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let i = 0;
  let replaced = false;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === `## ${heading}`) {
      out.push(line);
      out.push("");
      out.push(newBody);
      out.push("");
      i += 1;
      while (i < lines.length && !/^##\s+/.test(lines[i])) i += 1;
      replaced = true;
      continue;
    }
    out.push(line);
    i += 1;
  }
  if (!replaced) {
    throw new Error(`NOW.md has no "## ${heading}" section to replace`);
  }
  return out.join("\n");
}

function appendCompostEntries(compostMd: string, compost: ParsedOutput["compost"], dateStr: string): string {
  if (compost.length === 0) return compostMd;
  const base = compostMd.endsWith("\n") ? compostMd.slice(0, -1) : compostMd;
  const entries = compost
    .map((m) => `- Composted: ${m.episode} — ${m.taught} — lesson lives at ${m.absorbed_where}`)
    .join("\n");
  return `${base}\n\n## ${dateStr}\n${entries}\n`;
}

// Compost must itself compost. compost.md was append-only under a hard 1k
// cap — an excretory organ that cannot excrete: after ~4-10 more composted
// episodes the whole metabolism would jam permanently on OVER-CAP. Since git
// history is the permanent archive (MIND-SPEC Compost Rules — the shed commit
// preserves everything), old compost entries lose nothing by being dropped.
// Rule: after appending, drop the OLDEST dated sections until the file fits
// comfortably under cap (90%), preserving the header. The compost log is a
// recent-history window, not a ledger — the ledger is git.
function pruneCompost(compostMd: string, capTokens: number): { md: string; dropped_sections: number; before_tokens: number; after_tokens: number } {
  const target = Math.floor(capTokens * 0.9);
  const before = tokensOf(compostMd);
  if (before <= target) return { md: compostMd, dropped_sections: 0, before_tokens: before, after_tokens: before };
  const lines = compostMd.split("\n");
  // find dated section starts ("## <anything>")
  const sectionStarts: number[] = [];
  for (let i = 0; i < lines.length; i++) if (/^##\s+/.test(lines[i])) sectionStarts.push(i);
  let dropUpTo = 0; // index into sectionStarts: how many oldest sections to drop
  let current = compostMd;
  while (tokensOf(current) > target && dropUpTo < sectionStarts.length - 1) {
    dropUpTo += 1;
    const header = lines.slice(0, sectionStarts[0]).join("\n");
    const rest = lines.slice(sectionStarts[dropUpTo]).join("\n");
    current = `${header}\n${rest}`;
  }
  return { md: current, dropped_sections: dropUpTo, before_tokens: before, after_tokens: tokensOf(current) };
}

function appendTaughtLine(content: string, taught: string, absorbedWhere: string): string {
  const base = content.endsWith("\n") ? content.slice(0, -1) : content;
  return `${base}\n\n**taught -> absorbed-where:** ${taught} -> ${absorbedWhere}\n`;
}

interface ValidatedRem {
  parsed: ParsedOutput;
  oldSelfTokens: number;
  newSelfTokens: number;
  /** Whitespace-normalized comparison of old vs new SELF.md. An unchanged
   * SELF on a wave that absorbed episodes means the model echoed instead of
   * rewriting — digestion was narrated, not performed. Under the mutation
   * engine this is derived from applied mutations, and false ONLY on an
   * explicit, justified NO-CHANGE confession. */
  selfChanged: boolean;
  newSelfMd: string;
  appliedMutations: string[];
  rejectedMutations: { line: string; reason: string }[];
  noChangeJustification: string | null;
  newGreetingMd: string;
  newNowMd: string;
  newCompostMd: string;
  dateStr: string;
  pruneInfo: { dropped_sections: number; before_tokens: number; after_tokens: number };
  sizeNotes: string[]; // soft over-target observations to surface as telemetry (never fatal)
  collapsedMutations: number; // mutations degraded/refused because the substance was already held
  direction: { anabolic: number; catabolic: number; neutral: number };
  similarityBefore: number;
  similarityAfter: number;
  /** Origin-date enforcement: [ep:] stamps the engine rewrote because they
   * named a date outside the batch and outside the worldview's existing
   * stamps. Surfaced as a degraded event by the caller — never fatal. */
  stampCorrections: StampCorrection[];
  /** Quote-integrity misses: quoted spans (>= 40 chars) in the new SELF.md
   * that appear verbatim in neither the batch's episodes nor the prior
   * SELF.md — counterfeit verbatim. Surfaced as a degraded event by the
   * caller; never fatal, never auto-edited. */
  counterfeitSpans: string[];
}

/** Pure: parses + validates claude's raw output against every MIND-SPEC rule.
 * Throws (with no side effects) on any violation — the caller must not write
 * anything to the mind repo unless this returns successfully. */
function validateAndCompute(
  raw: string,
  ctx: { selfMd: string; nowMd: string; compostMd: string; episodes: Episode[] }
): ValidatedRem {
  const parsedRaw = parseClaudeOutput(raw);
  const { kept: keptCompost } = validateCompostAgainstEpisodes(parsedRaw.compost, ctx.episodes);
  const parsed = { ...parsedRaw, compost: keptCompost };

  // MUTATION ENGINE: apply the model's mutations mechanically. Echo is
  // structurally impossible — there is no full document in the model's output
  // to copy. applyMutations throws if every mutation misses its target
  // (back-pressure), and returns the confession on a NO-CHANGE wave.
  // The batch's episode dates ride along so [ep:] stamps stay ORIGIN
  // addresses (zoom-resolvable), never run dates — an out-of-set stamp is
  // corrected deterministically and reported (the replay finding, 2026-07-27).
  const episodeDates = ctx.episodes.filter((e) => e.isNew).map((e) => e.filename.slice(0, 10));
  const applied = applyMutations(ctx.selfMd, parsed.mutations, { episodeDates });

  // QUOTE INTEGRITY: every quoted span the wave leaves in SELF.md must exist
  // verbatim in this batch's episodes or in the prior SELF.md. A miss is a
  // forged quote — named, never silently accepted, never auto-edited.
  const counterfeitSpans = counterfeitQuotes(applied.text, [ctx.selfMd, ...ctx.episodes.map((e) => e.content)]);

  // On a NO-CHANGE wave the greeting is MECHANICAL — the system's own flat
  // voice carrying the confession to jrg's face at wake. The model-drafted
  // dream-echo is only trusted on waves where something actually moved.
  const newGreetingMd = applied.noChange !== null ? noChangeGreeting(applied.noChange) : parsed.greetingMd;

  const oldSelfTokens = tokensOf(ctx.selfMd);
  const newSelfTokens = tokensOf(applied.text);

  // Size is a SOFT target, not a wall. Growth is fine — the worldview is a
  // living, free process; it grows when there is more to hold and shrinks when
  // there is not. We record over-target as telemetry and only FAULT on a gross
  // runaway (a real sign the model dumped a transcript, not a worldview).
  const sizeNotes: string[] = [];
  const runawayFaults: string[] = [];
  const note = (chk: { tokens: number; target: number; status: string }, name: string) => {
    if (chk.status === "over-target") sizeNotes.push(`${name} ${chk.tokens}t (target ${chk.target}, over by ${chk.tokens - chk.target} — allowed)`);
    if (chk.status === "runaway") runawayFaults.push(`${name} ${chk.tokens}t is a runaway (> ${Math.floor(chk.target * RUNAWAY_FACTOR)}t = ${RUNAWAY_FACTOR}x target ${chk.target}) — likely a dumped transcript, not a worldview`);
  };

  note(checkSize("SELF.md", applied.text, TARGET_SELF_TOKENS), "SELF.md");

  // REDUNDANCY GUARD. The accretion disease (2026-07-24) grew SELF.md from 14k
  // to 29k chars over twelve waves while every size check said "over target,
  // allowed" — 42% of it near-duplicate text. Size was the wrong instrument.
  // This one measures self-similarity and, unlike size, it is allowed to be
  // strict: a wave may push the worldview over the SIZE target (there may
  // genuinely be more to hold), but it may never make the worldview MORE
  // repetitive once past the fault line. Growth is welcome; stuttering is not.
  const simBefore = selfSimilarity(ctx.selfMd);
  const simAfter = selfSimilarity(applied.text);
  // The comparison is on redundant VOLUME, not on the ratio. Cutting unique text
  // leaves redundant chars fixed while shrinking the denominator, so a genuinely
  // good distillation can RAISE the ratio — faulting on that would punish
  // exactly the behaviour this whole change exists to encourage. Volume can only
  // rise by actually adding a duplicate.
  const redundancyGrew = simAfter.redundantChars > simBefore.redundantChars;
  if (simAfter.ratio > SIMILARITY_FAULT && redundancyGrew) {
    runawayFaults.push(
      `SELF.md self-similarity ${(simAfter.ratio * 100).toFixed(1)}% exceeds ${(SIMILARITY_FAULT * 100).toFixed(0)}% and this wave INCREASED it (was ${(simBefore.ratio * 100).toFixed(1)}%)` +
      (simAfter.worstOffender ? ` — worst: ${simAfter.worstOffender.copies} copies of "${simAfter.worstOffender.text.slice(0, 70)}"` : "") +
      ` — the worldview is repeating itself, not growing; emit REVISE/MERGE/RETRACT instead of more appends`
    );
  }
  if (simAfter.ratio > SIMILARITY_WARN || redundancyGrew) {
    sizeNotes.push(
      `SELF.md redundancy ${(simAfter.ratio * 100).toFixed(1)}% (warn > ${(SIMILARITY_WARN * 100).toFixed(0)}%, was ${(simBefore.ratio * 100).toFixed(1)}%)` +
      (simAfter.worstOffender ? ` — ${simAfter.worstOffender.copies}x "${simAfter.worstOffender.text.slice(0, 50)}"` : "")
    );
  }
  if (applied.collapsed > 0) {
    sizeNotes.push(`${applied.collapsed} mutation(s) collapsed — substance already held (the model is circling)`);
  }
  // An all-anabolic wave is a digestion that never excreted. Not fatal — some
  // waves genuinely only add — but it must be visible, because 66-to-1 was how
  // the disease stayed invisible for twelve waves.
  if (applied.direction.catabolic === 0 && applied.direction.anabolic > 0) {
    sizeNotes.push(`all-anabolic wave: ${applied.direction.anabolic} growing op(s), 0 shrinking — nothing was distilled or shed`);
  }

  const newNowMd = replaceSection(ctx.nowMd, "Serendipity", parsed.serendipityLine);
  note(checkSize("NOW.md", newNowMd, TARGET_NOW_TOKENS), "NOW.md");

  // Forged-address guard (2026-07-27, found via replay): a compost claim whose
  // absorbed_where names a Doctrine[N] that does not exist in the rewritten
  // SELF.md is a FALSE digestion-completeness statement — and once written to
  // compost.md it feeds every future prompt (observed: six "lesson lives at
  // SELF.md Doctrine[5]" compost lines teaching wave after wave to DEEPEN a
  // phantom entry — the excretory organ as a self-sustaining poison feed).
  // The claim is dropped and the episode STAYS for a later wave to compost
  // with an address that exists. Emitted loud, never fatal (Law 4).
  const doctrineExists = (n: number) => new RegExp(`^\\*\\*${n}\\.\\s`, "m").test(applied.text);
  const forgedAddressClaims = parsed.compost.filter((m) => {
    const idx = m.absorbed_where.match(/Doctrine\[(\d+)\]/);
    return idx !== null && !doctrineExists(parseInt(idx[1], 10));
  });
  if (forgedAddressClaims.length > 0) {
    parsed.compost = parsed.compost.filter((m) => !forgedAddressClaims.includes(m));
    sizeNotes.push(
      `${forgedAddressClaims.length} compost claim(s) rejected for forged addresses — absorbed_where named a Doctrine[N] absent from the rewritten SELF.md; episode(s) retained`
    );
    degraded({
      process: "rem", phase: "compost-address",
      summary: `${forgedAddressClaims.length} compost claim(s) named a nonexistent SELF.md address — rejected, episode(s) retained`,
      context: { rejected: forgedAddressClaims.map((m) => ({ episode: m.episode, absorbed_where: m.absorbed_where })) },
      cause: "the model's absorbed_where cited a Doctrine index that does not exist in the document it just rewrote (stale address from a composted episode's footer or from old compost.md lines)",
      next_action: "none needed this wave — the episode stays and may compost later with a real address; if this recurs every wave, prune stale 'lesson lives at Doctrine[N]' lines from compost.md",
    });
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  // Append, then let the compost log itself compost (oldest sections drop;
  // git history is the ledger). pruneCompost already keeps this near target;
  // the check below is purely informational.
  const pruned = pruneCompost(appendCompostEntries(ctx.compostMd, parsed.compost, dateStr), TARGET_COMPOST_TOKENS);
  note(checkSize("compost.md", pruned.md, TARGET_COMPOST_TOKENS), "compost.md");

  // The ONLY size condition that stops a write: a gross runaway, which is a
  // corruption signal, not normal growth. Everything else proceeds.
  if (runawayFaults.length > 0) {
    throw new Error(`RUNAWAY (not mere over-target): ${runawayFaults.join("; ")}`);
  }

  const selfChanged = applied.applied.length > 0;

  return {
    parsed,
    oldSelfTokens,
    newSelfTokens,
    selfChanged,
    newSelfMd: applied.text,
    appliedMutations: applied.applied,
    rejectedMutations: applied.rejected,
    collapsedMutations: applied.collapsed,
    direction: applied.direction,
    similarityBefore: simBefore.ratio,
    similarityAfter: simAfter.ratio,
    noChangeJustification: applied.noChange,
    newGreetingMd,
    newNowMd,
    newCompostMd: pruned.md,
    dateStr,
    pruneInfo: { dropped_sections: pruned.dropped_sections, before_tokens: pruned.before_tokens, after_tokens: pruned.after_tokens },
    sizeNotes,
    stampCorrections: applied.stampCorrections,
    counterfeitSpans,
  };
}

/** git with stderr CAPTURED into the thrown Error. The default execFileSync
 * error message is just "Command failed: git commit -m <subject>" — git's
 * actual reason (hook rejection, index lock, identity unset, nothing staged)
 * is lost, which made the 2026-07-24 rem/commit failure unrecoverable from its
 * own log. "Fail loudly" requires the failure to say WHY. */
function gitCommit(args: string[]): string {
  const r = spawnSync("git", args, { cwd: MIND_DIR, encoding: "utf8" });
  if (r.error) throw new Error(`git ${args[0]} could not run: ${r.error.message}`);
  if (r.status !== 0) {
    const detail = [r.stderr?.trim(), r.stdout?.trim()].filter(Boolean).join(" | ") || "(git produced no output)";
    // EMPTY COMMIT IS NOT A FAILURE. This was the mystery FAIL of 2026-07-24:
    // "write/commit phase failed AFTER validation passed" with git's actual
    // reason swallowed. Once stderr was captured it read "nothing to commit,
    // working tree clean" — a multi-pass wave where an earlier batch had already
    // committed every changed file, so the last batch had nothing left to write.
    // Reporting that as a hard failure sent the reader hunting a corrupt repo
    // and left a red doctor line and a launchd exit-1 fossil behind it.
    //
    // A no-op commit is reported as such by the caller and the wave continues.
    if (/nothing to commit|nothing added to commit/i.test(detail)) {
      return "__NOTHING_TO_COMMIT__";
    }
    throw new Error(`git ${args[0]} exited ${r.status}: ${detail}`);
  }
  return r.stdout ?? "";
}

function atomicWrite(targetPath: string, content: string) {
  const tmp = `${targetPath}.rem-tmp`;
  fs.writeFileSync(tmp, content, "utf8");
  fs.renameSync(tmp, targetPath);
}

// ---------------------------------------------------------------------
// main
// ---------------------------------------------------------------------

// REM runs on a schedule (09:00 and 21:00) but must also CATCH UP: if a slot
// was missed because the laptop was asleep/off, the next time the machine is
// available (login, wake, restart, or any new session) it should run once for
// that missed slot — and never twice for the same slot. This is that guard.
//
// "due" = the most recent scheduled slot that has already passed today has not
// yet had a successful REM run. --if-due exits 0 without running when not due,
// so it is safe to call from every entry point (SessionStart hook, a
// wake/login LaunchAgent, the scheduled job itself). The scheduled 09:00/21:00
// job runs unconditionally; the opportunistic callers pass --if-due.
const REM_SLOT_HOURS = [9, 21];

function mostRecentSlot(now: Date): Date {
  // Walk back from now to the latest slot boundary at or before now.
  const candidates: Date[] = [];
  for (const dayOffset of [0, -1]) {
    for (const h of REM_SLOT_HOURS) {
      const d = new Date(now);
      d.setDate(d.getDate() + dayOffset);
      d.setHours(h, 0, 0, 0);
      if (d.getTime() <= now.getTime()) candidates.push(d);
    }
  }
  // latest boundary <= now
  return candidates.reduce((a, b) => (a.getTime() >= b.getTime() ? a : b));
}

function isDue(scoreboard: ScoreEvent[], now: Date): boolean {
  const slot = mostRecentSlot(now);
  const last = lastRemTs(scoreboard);
  if (!last) return true; // never run — always due
  const lastMs = Date.parse(last);
  if (Number.isNaN(lastMs)) return true; // unparseable — treat as due, run
  return lastMs < slot.getTime(); // due iff no REM since the current slot opened
}

// Digestion rhythm: how many NEW episodes a single REM pass may take on, and
// the AIMD (additive-increase/multiplicative-decrease) regulator that keeps
// the metabolism at the critical point. On a validation failure the batch
// halves and the pass retries — the failure becomes back-pressure instead of
// a stall. On success with backlog remaining, REM immediately runs another
// pass. A 57-episode backfill and a quiet Tuesday are the same code path.
const REM_BATCH_DEFAULT = 4;
const REM_MAX_PASSES = 30; // hard ceiling per invocation — no runaway loops

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const ifDue = args.includes("--if-due");
  const corr = correlation("rem");

  if (ifDue) {
    const scoreboardCheck = loadScoreboard();
    if (!isDue(scoreboardCheck, new Date())) {
      idle({
        process: "rem", phase: "schedule-guard", correlation_id: corr,
        summary: "--if-due: not due; last REM is newer than the current slot",
        context: { last_rem_ts: lastRemTs(scoreboardCheck) ?? null, slot_hours: REM_SLOT_HOURS },
      });
      return;
    }
    ok({
      process: "rem", phase: "schedule-guard", correlation_id: corr,
      summary: "--if-due: a scheduled slot was missed; catching up now",
      context: { slot_hours: REM_SLOT_HOURS },
    });
  }

  // SLEEP pending-queue drain (W1 durability): episodes the SessionEnd
  // worker could not draft (e.g. a dead LLM overnight) wait in
  // logs/pending-sleep.jsonl. Drain them BEFORE selecting this pass's meal so
  // a recovered episode can be digested in the same run. Absent/empty queue
  // is the common case — silence, no spawn. The drain emits its own events;
  // its exit status only reports how the queue fared and never blocks REM.
  let queuedBefore = 0;
  try {
    const pendingQueue = path.join(CIRCADIAN_HOME, "logs", "pending-sleep.jsonl");
    if (fs.existsSync(pendingQueue)) {
      queuedBefore = fs.readFileSync(pendingQueue, "utf8").split("\n").filter((l) => l.trim()).length;
    }
  } catch {
    // an unreadable queue must not block REM — the drain itself fails loud
  }
  if (queuedBefore > 0) {
    spawnSync(BUN_BIN, ["run", path.join(CIRCADIAN_HOME, "src", "sleep.ts"), "--drain"], { stdio: "ignore", env: process.env });
    ok({
      process: "rem", phase: "pending-drain", correlation_id: corr,
      summary: `ran sleep --drain over ${queuedBefore} pending episode(s) before digesting`,
      context: { queued_before: queuedBefore },
    });
  }

  let batch = REM_BATCH_DEFAULT;
  let pass = 0;
  let anyCommit = false;
  while (pass < REM_MAX_PASSES) {
    pass += 1;
    const result = await runOnePass({ dryRun, batch, pass, corr });
    if (result === "empty") {
      if (!anyCommit) {
        idle({
          process: "rem", phase: "drain", correlation_id: corr,
          summary: "nothing to digest",
          context: { episodes: 0, pass: 1, dry_run: dryRun },
        });
      }
      return;
    }
    if (dryRun) return;
    if (result === "validation-failed") {
      // runOnePass already emitted a degraded event with the error; batch is
      // guaranteed > 1 here (fail() is called at batch=1 inside runOnePass).
      batch = Math.max(1, Math.floor(batch / 2));
      rlog(`validation failed — halving batch to ${batch} and retrying (AIMD back-pressure).`);
      continue;
    }
    // success
    anyCommit = true;
    if (result === "drained") return;
    // backlog remains: additive increase back toward default, next wave
    batch = Math.min(REM_BATCH_DEFAULT, batch + 1);
    rlog(`backlog remains — continuing with next wave (pass ${pass + 1}, batch ${batch}).`);
  }
  degraded({
    process: "rem", phase: "drain", correlation_id: corr,
    summary: `hit the ${REM_MAX_PASSES}-pass ceiling with backlog remaining; the next scheduled run resumes the drain`,
    context: { passes: REM_MAX_PASSES, batch },
    cause: "AIMD drain did not reach zero within the pass ceiling",
    next_action: "the next scheduled REM run resumes the drain from where this left off",
  });
}

type PassResult = "empty" | "validation-failed" | "more-backlog" | "drained";

async function runOnePass(opts: { dryRun: boolean; batch: number; pass: number; corr: string }): Promise<PassResult> {
  const { dryRun, batch, corr } = opts;
  const specMd = readOrEmpty(SPEC_PATH);
  const selfMd = readOrEmpty(SELF_PATH);
  const userMd = readOrEmpty(USER_PATH);
  const nowMd = readOrEmpty(NOW_PATH);
  const greetingMd = readOrEmpty(GREETING_PATH);
  const compostMd = readOrEmpty(COMPOST_PATH);

  const scoreboard = loadScoreboard();
  const allEpisodes = loadEpisodes();
  const { episodes, deferred, ltp } = selectMeal(allEpisodes, batch);
  const backlog = deferred.length;
  if (episodes.length === 0) return "empty";
  if (backlog > 0) rlog(`pass ${opts.pass} — digesting ${episodes.filter((e) => e.isNew).length} of ${backlog + episodes.filter((e) => e.isNew).length} new episodes (batch ${batch}).`);
  const transcripts = gatherTranscriptExcerpts();
  const injectedItems = enumerateInjectedItems(selfMd, nowMd);

  // INWARD LTP: measure the current worldview for stutter BEFORE digesting.
  // Findings become an explicit merge directive in the prompt (addresses, not
  // vibes) and a degraded event — redundancy inside SELF.md is the accretion
  // disease wearing doctrine numbers, and it must never be invisible again.
  const stutterFound = detectSelfStutter(selfMd);
  const hasStutter = stutterFound.doctrine.length > 0 || stutterFound.motifs.length > 0;
  if (hasStutter) {
    degraded({
      process: "rem", phase: "stutter-detect", correlation_id: corr,
      summary: `worldview stutter: ${stutterFound.doctrine.length} doctrine group(s) and ${stutterFound.motifs.length} motif group(s) carry duplicated beliefs`,
      context: {
        threshold: stutterFound.threshold,
        doctrine_groups: stutterFound.doctrine.map((g) => g.map((d) => `Doctrine[${d.n}] ${d.title}`)),
        motif_groups: stutterFound.motifs.map((g) => g.map((l) => l.slice(0, 80))),
        pass: opts.pass,
      },
      cause: "near-duplicate doctrine entries / motif lines in the current SELF.md (overlap-coefficient clustering, same instrument as episode LTP)",
      next_action: "this wave's prompt carries an explicit MERGE directive naming the groups; if the stutter survives several waves, run `bun src/replay.ts --stutter` and inspect whether the model is refusing the merge",
    });
  }

  const prompt = buildPrompt({
    specMd,
    selfMd,
    userMd,
    nowMd,
    greetingMd,
    compostMd,
    episodes,
    transcripts,
    injectedItems,
    ltp,
    stutter: hasStutter ? stutterFound : null,
  });

  if (dryRun) {
    console.log(prompt);
    rlog(`[dry-run] episodes in this meal: ${episodes.length} (${episodes.filter((e) => e.isNew).length} new, batch ${batch}), backlog deferred: ${backlog}. transcripts sampled: ${transcripts.length}. prompt length: ${prompt.length} chars (~${tokensOf(prompt)} tokens). Nothing was called or written.`);
    ok({
      process: "rem", phase: "dry-run", correlation_id: corr,
      summary: "dry-run: prompt assembled, nothing called or written",
      context: { pass: opts.pass, batch, episodes: episodes.length, new_episodes: episodes.filter((e) => e.isNew).length, backlog, transcripts: transcripts.length, prompt_chars: prompt.length, prompt_tokens: tokensOf(prompt) },
    });
    return "drained";
  }

  let raw: string;
  try {
    raw = await complete(prompt, { timeoutMs: LLM_TIMEOUT_MS, maxTokens: LLM_MAX_TOKENS });
  } catch (err) {
    // LLM unreachable is not back-pressure — halving the batch won't fix a
    // dead service. Hard-fail so launchd/doctor surface it.
    fail({
      process: "rem", phase: "llm", correlation_id: corr,
      summary: "local LLM call failed; no mind files were modified",
      context: { error: (err as Error).message, batch, pass: opts.pass, timeout_ms: LLM_TIMEOUT_MS, max_tokens: LLM_MAX_TOKENS },
      cause: (err as Error).message,
      next_action: "check the LLM service at http://127.0.0.1:10240/v1 (curl /v1/models); this is not back-pressure — halving the batch will not help a dead service",
    });
  }

  let computed: ValidatedRem;
  try {
    computed = validateAndCompute(raw!, { selfMd, nowMd, compostMd, episodes });
  } catch (err) {
    // Validation failure IS back-pressure — report it and let the AIMD loop
    // shrink the meal and retry instead of stalling the whole metabolism.
    const errMsg = (err as Error).message;
    if (batch <= 1) {
      // At the minimum batch there is nothing left to halve — this is a
      // genuine give-up, not back-pressure.
      fail({
        process: "rem", phase: "validate", correlation_id: corr,
        summary: "validation failed even at batch=1; giving up this invocation",
        context: { batch: 1, pass: opts.pass, error: errMsg },
        cause: errMsg,
        next_action: "inspect the failing episode or LLM output; the mind repo is untouched this wave; fix and re-run rem",
      });
    }
    // batch > 1: degraded + AIMD halving
    degraded({
      process: "rem", phase: "validate", correlation_id: corr,
      summary: "pass validation failed; AIMD halving batch and retrying",
      context: { batch, pass: opts.pass, error: errMsg },
      cause: errMsg,
      next_action: `AIMD halving: batch halved to ${Math.max(1, Math.floor(batch / 2))} and retried`,
    });
    return "validation-failed";
  }

  const { parsed, oldSelfTokens, newSelfTokens, selfChanged, newSelfMd, appliedMutations, rejectedMutations, noChangeJustification, newGreetingMd, newNowMd, newCompostMd, dateStr, pruneInfo, sizeNotes, collapsedMutations, direction, similarityBefore, similarityAfter, stampCorrections, counterfeitSpans } = computed;

  // ORIGIN-DATE ENFORCEMENT REPORT: stamps the engine had to rewrite because
  // the model addressed a belief to a date outside the batch (typically the
  // run date). The correction already happened mechanically; this event is
  // the paper trail. Warn, never fatal (Law 4 spirit).
  if (stampCorrections.length > 0) {
    degraded({
      process: "rem", phase: "stamp-correct", correlation_id: corr,
      summary: `${stampCorrections.length} [ep:] stamp(s) corrected to origin dates — the model stamped run dates instead of episode dates`,
      context: { corrections: stampCorrections, batch, pass: opts.pass },
      cause: "mutation text carried [ep:] dates that match no episode in this batch and no stamp already in SELF.md",
      next_action: "nothing to do — corrected mechanically to the batch's origin date; if this recurs every wave, the model is ignoring the stamp instruction in MUTATION_GRAMMAR",
    });
  }

  // QUOTE-INTEGRITY REPORT: quoted spans in the new SELF.md that exist in no
  // source (batch episodes + prior SELF.md). Counterfeit verbatim — named
  // loudly, never auto-edited, never fatal: the forgery is now on record and
  // a future wave (or human) can strip the quotes.
  if (counterfeitSpans.length > 0) {
    degraded({
      process: "rem", phase: "quote-integrity", correlation_id: corr,
      summary: `${counterfeitSpans.length} quoted span(s) in the new SELF.md appear verbatim in no source — counterfeit quotes`,
      context: { spans: counterfeitSpans.map((s) => s.slice(0, 160)), batch, pass: opts.pass },
      cause: "the model wrapped synthesized text in quotation marks; quotes are reserved for verbatim source text (Law 5 — a fabricated quote is forged provenance, worse than ash)",
      next_action: "review the named spans in SELF.md and unquote or excise them in a future wave; the write proceeds — this validator warns, it does not jam the metabolism",
    });
  }

  // pruneCompost dropping sections is the compost log excreting old history —
  // normal metabolism (git is the archive), but surface it so a cold reader
  // sees the token churn.
  if (pruneInfo.dropped_sections > 0) {
    ok({
      process: "rem", phase: "prune-compost", correlation_id: corr,
      summary: `compost log pruned ${pruneInfo.dropped_sections} old section(s) to fit under cap`,
      context: { dropped_sections: pruneInfo.dropped_sections, before_tokens: pruneInfo.before_tokens, after_tokens: pruneInfo.after_tokens },
    });
  }

  try {
    // All validation above passed; every write below is now safe to apply.
    // newSelfMd came out of the mutation engine — mechanical application of
    // the model's mutations, never a model-emitted document.
    atomicWrite(SELF_PATH, newSelfMd);
    atomicWrite(NOW_PATH, newNowMd);
    atomicWrite(GREETING_PATH, newGreetingMd);
    atomicWrite(COMPOST_PATH, newCompostMd);

    for (const m of parsed.compost) {
      const ep = episodes.find((e) => e.filename === m.episode);
      if (!ep) continue; // already validated to exist; defensive only
      const withTaughtLine = appendTaughtLine(ep.content, m.taught, m.absorbed_where);
      fs.writeFileSync(ep.filepath, withTaughtLine, "utf8");
    }

    const newEpisodesThisWave = episodes.filter((e) => e.isNew);
    const newEpisodeCount = newEpisodesThisWave.length;

    // Record EVERY new episode this wave digested into the ledger BEFORE the
    // commit stages it. Disposition: composted if it was shed, else absorbed.
    // This is the invariant's write point — hash recorded == will never be
    // re-fed as new. Composted-set membership keyed by filename (validated to
    // exist upstream).
    const compostedNames = new Set(parsed.compost.map((m) => m.episode));
    const nowIso = new Date().toISOString();
    // LTP members were absorbed THROUGH their representative — they enter the
    // ledger with it (never re-fed as new) and inherit its disposition.
    const ledgerEntries: DigestedEntry[] = [];
    for (const e of newEpisodesThisWave) {
      const disposition = compostedNames.has(e.filename) ? ("composted" as const) : ("absorbed" as const);
      ledgerEntries.push({ ts: nowIso, hash: e.hash, filename: e.filename, disposition });
      const pot = ltp.get(e.filename);
      if (pot) {
        for (const m of pot.members) {
          ledgerEntries.push({ ts: nowIso, hash: m.hash, filename: m.filename, disposition });
        }
      }
    }
    recordDigested(ledgerEntries);
    const ltpCollapsed = [...ltp.values()].reduce((n, p) => n + p.members.length, 0);
    if (ltpCollapsed > 0) {
      ok({
        process: "rem", phase: "ltp", correlation_id: corr,
        summary: `long-term potentiation: ${ltpCollapsed} near-duplicate episode(s) collapsed into ${ltp.size} potentiated representative(s)`,
        context: { clusters: [...ltp.entries()].map(([rep, p]) => ({ representative: rep, weight: p.weight, members: p.members.map((m) => m.filename) })) },
      });
    }

    appendScoreboardEvent({
      ts: nowIso,
      type: "rem",
      worldview_tokens: newSelfTokens,
      propagated: parsed.propagated,
      composted: parsed.compost.map((m) => m.episode),
      self_changed: selfChanged,
    });

    // Mutation-engine telemetry: what actually moved, what missed, and — on a
    // NO-CHANGE wave — the confession that will be spoken at the next wake.
    // Under this engine a silent flatline is structurally impossible: echo has
    // no document to copy, and stagnation costs a signed justification.
    if (noChangeJustification !== null) {
      degraded({
        process: "rem", phase: "absorb", correlation_id: corr,
        summary: `NO-CHANGE wave: worldview deliberately untouched despite ${newEpisodeCount} new episode(s)`,
        context: { absorbed: newEpisodeCount, justification: noChangeJustification, batch, pass: opts.pass },
        cause: `model confessed: ${noChangeJustification}`,
        next_action: "the confession is now greeting.md — jrg hears it at next wake and rules on it; no automated action",
      });
    } else {
      ok({
        process: "rem", phase: "absorb", correlation_id: corr,
        summary: `worldview mutated: ${appliedMutations.length} applied${rejectedMutations.length ? `, ${rejectedMutations.length} rejected` : ""}`,
        context: { applied: appliedMutations, ...(rejectedMutations.length ? { rejected: rejectedMutations } : {}), batch, pass: opts.pass },
      });
      if (rejectedMutations.length > 0) {
        degraded({
          process: "rem", phase: "absorb", correlation_id: corr,
          summary: `${rejectedMutations.length} mutation(s) referenced targets that don't exist in SELF.md`,
          context: { rejected: rejectedMutations },
          cause: "model referenced doctrine numbers or motifs not present on disk (stale mental copy or hallucination)",
          next_action: "no action needed — valid mutations applied; if this recurs every wave, the model is not reading the SELF.md it is given",
        });
      }
    }
    if (parsed.malformedMutations.length > 0) {
      degraded({
        process: "rem", phase: "absorb", correlation_id: corr,
        summary: `${parsed.malformedMutations.length} mutation line(s) violated the grammar and were dropped`,
        context: { malformed: parsed.malformedMutations },
        cause: "model emitted lines outside the mutation grammar",
        next_action: "valid mutations proceeded; if malformed lines dominate every wave, tighten the grammar examples in the prompt",
      });
    }
    if (parsed.droppedConfession !== null) {
      degraded({
        process: "rem", phase: "absorb", correlation_id: corr,
        summary: "model claimed NO-CHANGE while also emitting mutations — confession dropped, mutations won",
        context: { dropped_confession: parsed.droppedConfession, applied: appliedMutations.length },
        cause: "incoherent output: stagnation confessed alongside evidence of motion",
        next_action: "nothing lost — the mutations applied; recurring incoherence means the model is padding its output",
      });
    }

    // USER-MODEL pass (task 8): extract this wave's user-observed lines and,
    // if any are substantive, run a SMALL focused call to update USER.md. Its
    // own call keeps the local model within its output envelope (a combined
    // SELF+USER generation overflowed and returned empty). Best-effort: a
    // failure here must not lose the already-absorbed SELF work, so it emits
    // degraded and leaves USER.md untouched rather than aborting the commit.
    // Episodes whose user-observed line was DEFERRED must not be composted this
    // wave. The deferral contract says "reconsidered next wave" — that promise is
    // a lie if the source episode is shed in the same wave, and it WAS: real
    // session data 2026-07-25 deferred four observations and composted both
    // episodes in the same commit. Silent loss of real evidence, exactly the
    // failure class this system exists to prevent.
    let deferredObsEpisodes: string[] = [];

    const userObs = newEpisodesThisWave
      .map((e) => {
        const m = e.content.match(/^user-observed:\s*(.+)$/im);
        const line = m ? m[1].trim() : "";
        const dm = e.filename.match(/(\d{4}-\d{2}-\d{2})/);
        return { ep: dm ? dm[1] : dateStr, line };
      })
      .filter((o) => o.line && !/^nothing new$/i.test(o.line));
    const obsToEpisode = new Map<string, string>();
    for (const e of newEpisodesThisWave) {
      const m = e.content.match(/^user-observed:\s*(.+)$/im);
      if (m) obsToEpisode.set(m[1].trim().slice(0, 60), e.filename);
    }
    if (userObs.length > 0) {
      try {
        const existingUser = readOrEmpty(USER_PATH);
        const userRaw = await complete(buildUserPrompt(existingUser, userObs), {
          timeoutMs: LLM_TIMEOUT_MS,
          maxTokens: 3000,
        });
        // MUTATIONS, not a document. Echo is now structurally impossible in this
        // organ too: there is no USER.md in the model's output to copy. The old
        // ===USER_MD=== full-rewrite block is gone — it was the flatline gradient,
        // and it was caught live returning the file byte-identically while 919
        // tokens over target and reporting success.
        const um = userRaw.match(/===USER_MUTATIONS===\r?\n([\s\S]*?)\r?\n?===END_USER_MUTATIONS===/);
        const block = um ? um[1].trim() : "";
        const userRunawayAt = Math.floor(TARGET_USER_TOKENS * RUNAWAY_FACTOR);

        if (!block) {
          degraded({
            process: "rem", phase: "user-model", correlation_id: corr,
            summary: "USER.md update skipped; model returned no mutations block",
            context: { observations: userObs.length, target: TARGET_USER_TOKENS },
            cause: "USER-model call returned no ===USER_MUTATIONS=== block",
            next_action: "USER.md left unchanged this cycle; observations remain in the episodes and will be reconsidered next REM",
          });
        } else {
          const parsedUser = parseUserMutations(block);
          const uApplied = applyUserMutations(existingUser, parsedUser.mutations, { targetChars: TARGET_USER_TOKENS * 4 });

          // Any episode whose observation was deferred is protected from this
          // wave's compost. Match loosely (the deferral records a truncated
          // prefix) and prefer over-protecting: keeping an episode one extra
          // night costs a file, losing it costs real evidence about jrg.
          if (uApplied.deferred > 0) {
            const deferredLines = uApplied.rejected.filter((x) => /DEFERRED/.test(x.reason)).map((x) => x.line);
            const protectedEps = new Set<string>();
            for (const [obsPrefix, filename] of obsToEpisode) {
              const key = obsPrefix.toLowerCase().slice(0, 40);
              if (deferredLines.some((d) => d.toLowerCase().includes(key))) protectedEps.add(filename);
            }
            // If the mapping is ambiguous, protect EVERY episode that carried an
            // observation this wave — the deferral promised another look.
            if (protectedEps.size === 0) for (const f of obsToEpisode.values()) protectedEps.add(f);
            deferredObsEpisodes = [...protectedEps];
          }

          const ut = tokensOf(uApplied.text);
          const overBy = ut - TARGET_USER_TOKENS;

          if (uApplied.noChange !== null) {
            degraded({
              process: "rem", phase: "user-model", correlation_id: corr,
              summary: `USER.md unchanged — ${uApplied.collapsed > 0 ? "every observation restated a trait already held" : "nothing about jrg moved this cycle"}`,
              context: { observations: userObs.length, user_tokens: ut, target: TARGET_USER_TOKENS, collapsed: uApplied.collapsed, ...(overBy > 0 ? { over_target_by: overBy } : {}), echo: true },
              cause: uApplied.noChange,
              next_action: overBy > 0
                ? "USER.md is over target and nothing consolidated it — if this recurs, the observations are too repetitive to teach anything new"
                : "no action needed if the observations genuinely added nothing",
            });
          } else if (ut <= userRunawayAt) {
            atomicWrite(USER_PATH, uApplied.text);
            // QUOTA ACCOUNTABILITY. A wave that is over target and ends net-flat
            // has failed even though every mutation was valid — the 2026-07-24
            // wave cut 844 chars and added back 836. Direction counts called that
            // a success (5 catabolic!). Net delta is the honest number, so an
            // over-target wave that fails to shrink is reported DEGRADED, not OK.
            const wasOver = tokensOf(existingUser) > TARGET_USER_TOKENS;
            const ctx = {
              observations: userObs.length, applied: uApplied.applied, user_tokens: ut, target: TARGET_USER_TOKENS,
              delta_chars: uApplied.deltaChars,
              anabolic: uApplied.direction.anabolic, catabolic: uApplied.direction.catabolic,
              ...(uApplied.collapsed ? { collapsed: uApplied.collapsed } : {}),
              ...(uApplied.deferred ? { deferred: uApplied.deferred } : {}),
              ...(uApplied.rejected.length ? { rejected: uApplied.rejected } : {}),
              ...(overBy > 0 ? { over_target_by: overBy } : {}),
            };
            if (wasOver && uApplied.deltaChars > -100) {
              degraded({
                process: "rem", phase: "user-model", correlation_id: corr,
                summary: `USER.md mutated but did not shrink: ${uApplied.applied.length} applied, net ${uApplied.deltaChars >= 0 ? "+" : ""}${uApplied.deltaChars} chars while ${overBy}t over target`,
                context: ctx,
                cause: `the wave was over target and every mutation was valid, but the anabolic ops gave back what the catabolic ops saved (${uApplied.direction.catabolic} catabolic, ${uApplied.direction.anabolic} anabolic, net ${uApplied.deltaChars} chars)`,
                next_action: "the mutations are kept (they are real work); if this repeats, the quota in the prompt is not landing and USER.md needs one manual consolidation to get under target",
              });
            } else {
              ok({
                process: "rem", phase: "user-model", correlation_id: corr,
                summary: `USER.md mutated: ${uApplied.applied.length} applied${uApplied.rejected.length ? `, ${uApplied.rejected.length} rejected` : ""}, net ${uApplied.deltaChars >= 0 ? "+" : ""}${uApplied.deltaChars} chars` + (overBy > 0 ? ` (${overBy}t over target)` : ""),
                context: ctx,
              });
            }
          } else {
            degraded({
              process: "rem", phase: "user-model", correlation_id: corr,
              summary: "USER.md mutation refused; result is a runaway",
              context: { observations: userObs.length, out_tokens: ut, target: TARGET_USER_TOKENS, runaway_at: userRunawayAt },
              cause: `mutated USER.md ${ut}t is a runaway (> ${userRunawayAt}t)`,
              next_action: "USER.md left unchanged this cycle; observations remain in the episodes and will be reconsidered next REM",
            });
          }
        }
      } catch (e) {
        degraded({
          process: "rem", phase: "user-model", correlation_id: corr,
          summary: "USER.md update failed; SELF work is safe",
          context: { observations: userObs.length },
          cause: (e as Error).message,
          next_action: "USER.md left unchanged; check the LLM at :10240; observations persist in episodes for next cycle",
        });
      }
    }

    const subject = `rem: ${dateStr} — absorbed ${newEpisodeCount}, shed ${parsed.compost.length}, worldview ${Math.round(
      newSelfTokens / 1000
    )}k tokens`;
    const body =
      noChangeJustification !== null
        ? `\n\nno-change: ${noChangeJustification}`
        : `\n\nmutations:\n${appliedMutations.map((a) => `  - ${a}`).join("\n")}` +
          `\n\nmetabolism: ${direction.anabolic} anabolic, ${direction.catabolic} catabolic, ${direction.neutral} neutral` +
          (collapsedMutations > 0 ? `, ${collapsedMutations} collapsed (already held)` : "") +
          `\nredundancy: ${(similarityBefore * 100).toFixed(1)}% → ${(similarityAfter * 100).toFixed(1)}%` +
          (sizeNotes.length ? `\nsize: ${sizeNotes.join("; ")}` : "");

    // Absorb commit: stage episodes/ wholesale — sleep-drafted episodes are
    // born untracked, and composted ones just gained their taught-line; both
    // must enter history BEFORE any shed ("git history is the archive",
    // MIND-SPEC Compost Rules). git rm on a file with unstaged edits refuses
    // without -f, so the shed must happen against a clean HEAD anyway.
    execFileSync(
      "git",
      ["add", "SELF.md", "USER.md", "NOW.md", "greeting.md", "compost.md", "scoreboard.jsonl", "digested.jsonl", "episodes"],
      { cwd: MIND_DIR }
    );
    // stderr must be CAPTURED, not swallowed. The 2026-07-24 commit failure
    // reported only "Command failed: git commit -m ..." with git's actual
    // complaint lost — an unrecoverable error message is a silent failure
    // wearing a loud coat. execFileSync's default pipes stderr to the parent's
    // buffer but does not attach it to the Error; capture it explicitly.
    const absorbCommit = gitCommit(["commit", "-m", subject + body]);
    const absorbWasNoop = absorbCommit === "__NOTHING_TO_COMMIT__";

    // Shed commit: separate so the archived content sits one revision behind
    // the deletion. Robust to an episode that is untracked (e.g. shed before
    // the absorb staged it): git rm only what git tracks; for anything else,
    // delete the file directly so the shed can never fail on a pathspec.
    // A composted representative sheds its whole potentiated cluster: the
    // members were absorbed through it, so they leave with it. Their content
    // sits one revision back in git like every other shed.
    const shedTargets: string[] = [];
    const spared: string[] = [];
    for (const m of parsed.compost) {
      if (deferredObsEpisodes.includes(m.episode)) {
        spared.push(m.episode);
        continue;
      }
      shedTargets.push(m.episode);
      const pot = ltp.get(m.episode);
      if (pot) shedTargets.push(...pot.members.map((mm) => mm.filename));
    }
    if (shedTargets.length > 0) {
      for (const episodeFile of shedTargets) {
        const rel = path.join("episodes", episodeFile);
        const abs = path.join(MIND_DIR, rel);
        let tracked = true;
        try {
          execFileSync("git", ["ls-files", "--error-unmatch", rel], { cwd: MIND_DIR, stdio: "ignore" });
        } catch {
          tracked = false;
        }
        if (tracked) {
          execFileSync("git", ["rm", "--quiet", rel], { cwd: MIND_DIR });
        } else {
          // Not in the index (born untracked, absorb commit already happened):
          // remove from disk and stage the deletion so history records the shed.
          try {
            fs.rmSync(abs, { force: true });
          } catch {
            /* already gone */
          }
          try {
            execFileSync("git", ["add", "-A", rel], { cwd: MIND_DIR });
          } catch {
            /* best effort */
          }
        }
      }
      gitCommit(["commit", "-m", `rem: ${dateStr} — compost: ${shedTargets.join(", ")}`]);
    }

    ok({
      process: "rem", phase: "commit", correlation_id: corr,
      summary: absorbWasNoop
        ? `wave complete with nothing left to write — an earlier pass already committed these changes (absorbed ${newEpisodeCount}, shed ${shedTargets.length})`
        : `wave committed: absorbed ${newEpisodeCount}, shed ${shedTargets.length}`,
      context: { absorbed: newEpisodeCount, shed: shedTargets.length, ...(spared.length ? { spared_for_deferred_observations: spared } : {}), worldview_tokens: newSelfTokens, self_delta: newSelfTokens - oldSelfTokens, redundancy_before: Number((similarityBefore * 100).toFixed(1)), redundancy_after: Number((similarityAfter * 100).toFixed(1)), anabolic: direction.anabolic, catabolic: direction.catabolic, collapsed: collapsedMutations, backlog_remaining: backlog, pass: opts.pass, batch, ...(sizeNotes.length ? { size_notes: sizeNotes } : {}) },
    });
    rlog(`committed. ${subject}`);
  } catch (err) {
    fail({
      process: "rem", phase: "commit", correlation_id: corr,
      summary: "write/commit phase failed AFTER validation passed",
      context: { error: (err as Error).message, batch, pass: opts.pass, mind_dir: MIND_DIR },
      cause: (err as Error).message,
      next_action: `inspect ~/circadian/mind with 'git -C ${MIND_DIR} status'; the mind repo may be partially written and uncommitted`,
    });
  }

  // No mtime bookkeeping needed: deferred episodes were never recorded in the
  // digested ledger, so they remain isNew=true on the next pass by definition.
  // The ledger, not the clock, is the state.
  return backlog > 0 ? "more-backlog" : "drained";
}

await main();
