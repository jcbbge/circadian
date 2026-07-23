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
import { execFileSync } from "child_process";
import { createHash } from "crypto";
import { complete } from "./llm.ts";
import { ok, idle, degraded, fail, correlation } from "./obs.ts";

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
  episodes: Episode[]; // what this pass digests
  deferred: Episode[]; // new episodes deferred to later passes
}
function selectMeal(all: Episode[], batch: number, seenCap = 6): Meal {
  const fresh = all.filter((e) => e.isNew);
  const seen = all.filter((e) => !e.isNew);
  const meal = [...fresh.slice(0, batch), ...seen.slice(0, seenCap)].sort((a, b) =>
    a.filename.localeCompare(b.filename)
  );
  return { episodes: meal, deferred: fresh.slice(batch) };
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
}

function buildPrompt(ctx: MindContext): string {
  const newEpisodes = ctx.episodes.filter((e) => e.isNew);
  const oldEpisodes = ctx.episodes.filter((e) => !e.isNew);

  const episodesBlock =
    ctx.episodes.length === 0
      ? "(none — episodes/ is empty)"
      : ctx.episodes
          .map(
            (e) =>
              `--- episode: ${e.filename} [${e.isNew ? "NEW since last REM" : "already seen"}] ---\n${e.content}`
          )
          .join("\n\n");

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

1. For each episode marked NEW since last REM, judge: does it confirm, contradict, supersede, or deepen the existing worldview in SELF.md? Use that judgment to rewrite SELF.md.

2. Rewrite SELF.md. Prefer shrinking to growing — distill, do not accrete — but this is a guideline you aim for, NOT a hard limit: grow when there is genuinely more worldview to hold, shrink when a belief has been absorbed or superseded. Keep exactly these four sections, in this order: "## Who I am across sessions", "## Doctrine" (each belief stamped with its origin episode as [ep:YYYY-MM-DD]), "## Motifs" (recurring themes, aim for about 10 lines), "## How we work". Aim for around 6000 tokens; a few hundred over is fine. Only a gross runaway (many thousands over — a sign you pasted a transcript instead of a worldview) is a problem.

3. Using the transcript excerpts and the injected-items list, judge which injected items actually propagated (were read, referenced, or built upon) recently. Items with zero observed propagation across their lifetime are compost candidates (Law 6) — candidacy only, this does not by itself compost anything.

4. Decide compost eligibility strictly under the digestion-completeness rule: an episode (new or already-seen) may be composted ONLY if you can state BOTH (a) what it taught, and (b) exactly where that lesson now lives in the rewritten mind (e.g. "SELF.md Doctrine [ep:...]" or "NOW.md Arc"). If you cannot state both with confidence, do not compost it, regardless of its age or token pressure.

5. Plant exactly ONE new serendipity line for NOW.md's Serendipity section: a single line starting exactly "Might be nothing:". This replaces whatever was there before.

6. Draft tomorrow's greeting.md as a DREAM-ECHO: one short spoken first-person voice from the mind to jrg, 1-3 lines. This is NOT a memo with labels ("Arc:" / "First move:") — it is the mind waking up and speaking. Weave in, naturally: what got carried forward from the digested episodes (the thing worth knowing overnight), the live tension that is still open, and the next move. Anchor-aware (Law 8): orient to the WORK — the arc, the tension, the move — never mention Circadian, REM, SELF.md, episodes, or the memory system itself, and never narrate your own process. Speak like a trusted collaborator resuming mid-thought, with jrg's register allowed (he responds to intensity and substance, not coddling). No flattery, no filler, no preamble. It must still pass the Law-3 test: if it isn't good enough to say out loud to him at the top of a session, it isn't earning its keep. Example register (do not copy): "Kept the venue-field guard from silently eating seven deals while you were away. The ACP bidirectional-state question is still the open one — that's where to start."

7. OPTIONAL: if SELF.md grew this pass and the growth is meaningful, you MAY add a one-line note on why in the SELF_GROWTH_JUSTIFICATION block. This is informational only — not required, not a gate. Leave it empty if you have nothing to add.

(USER.md is handled by a separate dedicated pass after this one — do not rewrite it here.)

=== required output format — EXACTLY these six blocks, in this order, nothing else outside them ===

===SELF_MD===
<the full rewritten SELF.md content>
===END_SELF_MD===

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

===SELF_GROWTH_JUSTIFICATION===
<one line if SELF.md grew in token count this pass; leave this block completely empty otherwise>
===END_SELF_GROWTH_JUSTIFICATION===
`;
}

// USER.md gets its own focused call (task 8): a small prompt — current USER.md
// plus only the episodes' user-observed lines — so the local model stays well
// within its output envelope instead of choking on SELF+USER in one shot.
function buildUserPrompt(existingUser: string, userObservations: { ep: string; line: string }[]): string {
  const obs = userObservations.length
    ? userObservations.map((o) => `- [ep:${o.ep}] ${o.line}`).join("\n")
    : "(none this cycle)";
  return `You are the USER-MODEL pass of REM in a circadian memory substrate. You maintain USER.md, the private relational model of the user jrg — who he is to work with: preferences, working style, register, mental models, reaction patterns. NOT code facts.

CURRENT USER.md:
"""
${existingUser || "(empty)"}
"""

NEW OBSERVATIONS from this cycle's episodes (each is a "user-observed:" line a session drafted about jrg):
"""
${obs}
"""

Your task: rewrite USER.md, applying confirm/contradict/supersede/deepen to each new observation against the current file. A genuinely new, well-evidenced observation deepens or adds; a contradicted one is corrected or removed; a confirmed one is left as-is (do not duplicate). Every retained line MUST keep its origin stamp [ep:YYYY-MM-DD] and, where voice matters, a short verbatim quote (ash is banned — "jrg prefers X" with no why or quote is a defect). These are inferences about a person; they self-correct over cycles, so record well-evidenced ones without fear, but never invent beyond the observations. Preserve the section structure. Shrink-unless-justified. Cap: 2000 tokens / 8000 chars.

If there are no new observations, return the current USER.md UNCHANGED.

Output EXACTLY one block, nothing else:

===USER_MD===
<the full rewritten USER.md>
===END_USER_MD===
`;
}

// ---------------------------------------------------------------------
// parsing + validation of claude's output (all pure — no side effects)
// ---------------------------------------------------------------------

interface ParsedOutput {
  selfMd: string;
  serendipityLine: string;
  greetingMd: string;
  compost: { episode: string; taught: string; absorbed_where: string }[];
  propagated: string[];
  growthJustification: string;
}

function extractBlock(raw: string, name: string): string | null {
  const re = new RegExp(`===${name}===\\r?\\n([\\s\\S]*?)\\r?\\n?===END_${name}===`);
  const m = raw.match(re);
  if (!m) return null;
  return m[1];
}

function parseClaudeOutput(raw: string): ParsedOutput {
  const names = [
    "SELF_MD",
    "SERENDIPITY_LINE",
    "GREETING_MD",
    "COMPOST_JSON",
    "PROPAGATED_JSON",
  ];
  // SELF_GROWTH_JUSTIFICATION is OPTIONAL now — growth no longer needs a permission
  // slip. If the model provides it, we keep it as a note; if not, no problem.
  const optional = ["SELF_GROWTH_JUSTIFICATION"];
  const blocks: Record<string, string> = {};
  const missing: string[] = [];
  for (const n of names) {
    const b = extractBlock(raw, n);
    if (b === null) missing.push(n);
    else blocks[n] = b.trim();
  }
  for (const n of optional) {
    const b = extractBlock(raw, n);
    blocks[n] = b === null ? "" : b.trim();
  }
  if (missing.length > 0) {
    throw new Error(`claude output missing required block(s): ${missing.join(", ")}`);
  }

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

  const requiredSelfHeadings = ["## Who I am across sessions", "## Doctrine", "## Motifs", "## How we work"];
  for (const h of requiredSelfHeadings) {
    if (!blocks.SELF_MD.includes(h)) {
      throw new Error(`SELF_MD missing required heading: ${h}`);
    }
  }

  return {
    selfMd: blocks.SELF_MD,
    serendipityLine: blocks.SERENDIPITY_LINE,
    greetingMd: blocks.GREETING_MD,
    compost,
    propagated,
    growthJustification: blocks.SELF_GROWTH_JUSTIFICATION,
  };
}

function validateCompostAgainstEpisodes(compost: ParsedOutput["compost"], episodes: Episode[]) {
  const known = new Set(episodes.map((e) => e.filename));
  for (const m of compost) {
    if (!known.has(m.episode)) {
      throw new Error(`COMPOST_JSON references an episode file that doesn't exist: ${m.episode}`);
    }
  }
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
  newNowMd: string;
  newCompostMd: string;
  dateStr: string;
  pruneInfo: { dropped_sections: number; before_tokens: number; after_tokens: number };
  sizeNotes: string[]; // soft over-target observations to surface as telemetry (never fatal)
}

/** Pure: parses + validates claude's raw output against every MIND-SPEC rule.
 * Throws (with no side effects) on any violation — the caller must not write
 * anything to the mind repo unless this returns successfully. */
function validateAndCompute(
  raw: string,
  ctx: { selfMd: string; nowMd: string; compostMd: string; episodes: Episode[] }
): ValidatedRem {
  const parsed = parseClaudeOutput(raw);
  validateCompostAgainstEpisodes(parsed.compost, ctx.episodes);

  const oldSelfTokens = tokensOf(ctx.selfMd);
  const newSelfTokens = tokensOf(parsed.selfMd);

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

  note(checkSize("SELF.md", parsed.selfMd, TARGET_SELF_TOKENS), "SELF.md");

  const newNowMd = replaceSection(ctx.nowMd, "Serendipity", parsed.serendipityLine);
  note(checkSize("NOW.md", newNowMd, TARGET_NOW_TOKENS), "NOW.md");

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

  return { parsed, oldSelfTokens, newSelfTokens, newNowMd, newCompostMd: pruned.md, dateStr, pruneInfo: { dropped_sections: pruned.dropped_sections, before_tokens: pruned.before_tokens, after_tokens: pruned.after_tokens }, sizeNotes };
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
  const { episodes, deferred } = selectMeal(allEpisodes, batch);
  const backlog = deferred.length;
  if (episodes.length === 0) return "empty";
  if (backlog > 0) rlog(`pass ${opts.pass} — digesting ${episodes.filter((e) => e.isNew).length} of ${backlog + episodes.filter((e) => e.isNew).length} new episodes (batch ${batch}).`);
  const transcripts = gatherTranscriptExcerpts();
  const injectedItems = enumerateInjectedItems(selfMd, nowMd);

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

  const { parsed, oldSelfTokens, newSelfTokens, newNowMd, newCompostMd, dateStr, pruneInfo, sizeNotes } = computed;

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
    atomicWrite(SELF_PATH, parsed.selfMd);
    atomicWrite(NOW_PATH, newNowMd);
    atomicWrite(GREETING_PATH, parsed.greetingMd);
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
    recordDigested(
      newEpisodesThisWave.map((e) => ({
        ts: nowIso,
        hash: e.hash,
        filename: e.filename,
        disposition: compostedNames.has(e.filename) ? ("composted" as const) : ("absorbed" as const),
      }))
    );

    appendScoreboardEvent({
      ts: nowIso,
      type: "rem",
      worldview_tokens: newSelfTokens,
      propagated: parsed.propagated,
      composted: parsed.compost.map((m) => m.episode),
    });

    // USER-MODEL pass (task 8): extract this wave's user-observed lines and,
    // if any are substantive, run a SMALL focused call to update USER.md. Its
    // own call keeps the local model within its output envelope (a combined
    // SELF+USER generation overflowed and returned empty). Best-effort: a
    // failure here must not lose the already-absorbed SELF work, so it emits
    // degraded and leaves USER.md untouched rather than aborting the commit.
    const userObs = newEpisodesThisWave
      .map((e) => {
        const m = e.content.match(/^user-observed:\s*(.+)$/im);
        const line = m ? m[1].trim() : "";
        const dm = e.filename.match(/(\d{4}-\d{2}-\d{2})/);
        return { ep: dm ? dm[1] : dateStr, line };
      })
      .filter((o) => o.line && !/^nothing new$/i.test(o.line));
    if (userObs.length > 0) {
      try {
        const existingUser = readOrEmpty(USER_PATH);
        const userRaw = await complete(buildUserPrompt(existingUser, userObs), {
          timeoutMs: LLM_TIMEOUT_MS,
          maxTokens: 3000,
        });
        const um = userRaw.match(/===USER_MD===\r?\n([\s\S]*?)\r?\n?===END_USER_MD===/);
        const newUser = um ? um[1].trim() : "";
        const userRunawayAt = Math.floor(TARGET_USER_TOKENS * RUNAWAY_FACTOR);
        if (newUser && tokensOf(newUser) <= userRunawayAt) {
          // Soft target: accept normal over-target growth; only a runaway is refused.
          atomicWrite(USER_PATH, newUser);
          const ut = tokensOf(newUser);
          ok({
            process: "rem", phase: "user-model", correlation_id: corr,
            summary: `USER.md updated from ${userObs.length} observation(s)`,
            context: { observations: userObs.length, user_tokens: ut, target: TARGET_USER_TOKENS, ...(ut > TARGET_USER_TOKENS ? { over_target_by: ut - TARGET_USER_TOKENS } : {}) },
          });
        } else {
          degraded({
            process: "rem", phase: "user-model", correlation_id: corr,
            summary: "USER.md update skipped; model output empty or a runaway",
            context: { observations: userObs.length, out_tokens: newUser ? tokensOf(newUser) : 0, target: TARGET_USER_TOKENS, runaway_at: userRunawayAt },
            cause: newUser ? `proposed USER.md ${tokensOf(newUser)}t is a runaway (> ${userRunawayAt}t)` : "USER-model call returned no USER_MD block",
            next_action: "USER.md left unchanged this cycle; observations remain in the episodes and will be reconsidered next REM",
          });
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
    const body = newSelfTokens > oldSelfTokens ? `\n\njustification: ${parsed.growthJustification}` : "";

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
    execFileSync("git", ["commit", "-m", subject + body], { cwd: MIND_DIR });

    // Shed commit: separate so the archived content sits one revision behind
    // the deletion.
    if (parsed.compost.length > 0) {
      for (const m of parsed.compost) {
        execFileSync("git", ["rm", "--quiet", path.join("episodes", m.episode)], { cwd: MIND_DIR });
      }
      execFileSync(
        "git",
        ["commit", "-m", `rem: ${dateStr} — compost: ${parsed.compost.map((m) => m.episode).join(", ")}`],
        { cwd: MIND_DIR }
      );
    }

    ok({
      process: "rem", phase: "commit", correlation_id: corr,
      summary: `wave committed: absorbed ${newEpisodeCount}, shed ${parsed.compost.length}`,
      context: { absorbed: newEpisodeCount, shed: parsed.compost.length, worldview_tokens: newSelfTokens, self_delta: newSelfTokens - oldSelfTokens, backlog_remaining: backlog, pass: opts.pass, batch, ...(sizeNotes.length ? { size_notes: sizeNotes } : {}) },
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
