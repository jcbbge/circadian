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
import { complete } from "./llm.ts";

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
const CAP_SELF_TOKENS = 6000;
const CAP_NOW_TOKENS = 3000;
const CAP_COMPOST_TOKENS = 1000;
const GREETING_MAX_LINES = 3;

// ---- propagation-evidence bounds (this process's own input budget; not a
// MIND-SPEC cap, just keeps the claude call bounded) ----
const TRANSCRIPT_WINDOW_MS = 24 * 60 * 60 * 1000;
const PER_TRANSCRIPT_EXCERPT_CHARS = 4000;
const TOTAL_EXCERPT_BUDGET_CHARS = 24000;
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
  isNew: boolean;
}

function loadEpisodes(sinceTs: string | null): Episode[] {
  let files: string[] = [];
  try {
    files = fs.readdirSync(EPISODES_DIR).filter((f) => f.endsWith(".md"));
  } catch {
    files = [];
  }
  const sinceMs = sinceTs ? Date.parse(sinceTs) : null;
  return files
    .map((f) => {
      const filepath = path.join(EPISODES_DIR, f);
      const stat = fs.statSync(filepath);
      const content = fs.readFileSync(filepath, "utf8");
      const isNew = sinceMs === null || Number.isNaN(sinceMs) || stat.mtime.getTime() > sinceMs;
      return { filename: f, filepath, content, isNew };
    })
    .sort((a, b) => a.filename.localeCompare(b.filename));
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

=== current USER.md (private, relational, read-only context — you do not rewrite this file) ===
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

2. Rewrite SELF.md under shrink-unless-justified (Law 4): do not let it grow unless growth is truly warranted. Keep exactly these four sections, in this order: "## Who I am across sessions", "## Doctrine" (each belief stamped with its origin episode as [ep:YYYY-MM-DD]), "## Motifs" (recurring themes, at most 10 lines total), "## How we work". Cap: 6000 tokens / 24000 chars (chars/4=tokens, enforced strictly).

3. Using the transcript excerpts and the injected-items list, judge which injected items actually propagated (were read, referenced, or built upon) recently. Items with zero observed propagation across their lifetime are compost candidates (Law 6) — candidacy only, this does not by itself compost anything.

4. Decide compost eligibility strictly under the digestion-completeness rule: an episode (new or already-seen) may be composted ONLY if you can state BOTH (a) what it taught, and (b) exactly where that lesson now lives in the rewritten mind (e.g. "SELF.md Doctrine [ep:...]" or "NOW.md Arc"). If you cannot state both with confidence, do not compost it, regardless of its age or token pressure.

5. Plant exactly ONE new serendipity line for NOW.md's Serendipity section: a single line starting exactly "Might be nothing:". This replaces whatever was there before.

6. Draft tomorrow's greeting.md: at most 3 lines total — an arc summary, the flight plan (the successor session's first move), and one live tension. Anchor-aware (Law 8): orient to the work itself — the arc, the live tension, the next move — never mention Circadian, REM, SELF.md, or the memory system itself.

7. Compare SELF.md's token count before and after your rewrite (chars/4 for both). If it grew, you MUST supply a one-line justification for why the growth was warranted. If it did not grow, leave that output block completely empty.

=== required output format — EXACTLY these six blocks, in this order, nothing else outside them ===

===SELF_MD===
<the full rewritten SELF.md content>
===END_SELF_MD===

===SERENDIPITY_LINE===
<the single new NOW.md Serendipity line; must start with "Might be nothing:"; must be exactly one line>
===END_SERENDIPITY_LINE===

===GREETING_MD===
<the full new greeting.md content; at most 3 lines>
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
    "SELF_GROWTH_JUSTIFICATION",
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
  if (greetingLines.length > GREETING_MAX_LINES) {
    throw new Error(`GREETING_MD has ${greetingLines.length} lines, cap is ${GREETING_MAX_LINES}`);
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

function enforceCap(name: string, text: string, capTokens: number) {
  const tk = tokensOf(text);
  if (tk > capTokens) {
    throw new Error(`OVER-CAP: ${name} is ${tk} tokens, cap is ${capTokens} tokens (+${tk - capTokens})`);
  }
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
  if (newSelfTokens > oldSelfTokens && !parsed.growthJustification) {
    throw new Error(
      `SELF.md grew ${oldSelfTokens} -> ${newSelfTokens} tokens with no justification (Law 4: shrink-unless-justified)`
    );
  }
  enforceCap("SELF.md", parsed.selfMd, CAP_SELF_TOKENS);

  const newNowMd = replaceSection(ctx.nowMd, "Serendipity", parsed.serendipityLine);
  enforceCap("NOW.md", newNowMd, CAP_NOW_TOKENS);

  const dateStr = new Date().toISOString().slice(0, 10);
  const newCompostMd = appendCompostEntries(ctx.compostMd, parsed.compost, dateStr);
  enforceCap("compost.md", newCompostMd, CAP_COMPOST_TOKENS);

  return { parsed, oldSelfTokens, newSelfTokens, newNowMd, newCompostMd, dateStr };
}

function atomicWrite(targetPath: string, content: string) {
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

  const specMd = readOrEmpty(SPEC_PATH);
  const selfMd = readOrEmpty(SELF_PATH);
  const userMd = readOrEmpty(USER_PATH);
  const nowMd = readOrEmpty(NOW_PATH);
  const greetingMd = readOrEmpty(GREETING_PATH);
  const compostMd = readOrEmpty(COMPOST_PATH);

  const scoreboard = loadScoreboard();
  const sinceTs = lastRemTs(scoreboard);
  const episodes = loadEpisodes(sinceTs);
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
    console.log(
      `\n[dry-run] episodes: ${episodes.length} total, ${episodes.filter((e) => e.isNew).length} new since last REM. transcripts sampled: ${transcripts.length}. prompt length: ${prompt.length} chars (~${tokensOf(prompt)} tokens). Nothing was called or written.`
    );
    return;
  }

  let raw: string;
  try {
    raw = await complete(prompt, { timeoutMs: LLM_TIMEOUT_MS, maxTokens: LLM_MAX_TOKENS });
  } catch (err) {
    console.error(`rem: local LLM call failed: ${(err as Error).message}. No mind files were modified.`);
    process.exit(1);
    return;
  }

  let computed: ValidatedRem;
  try {
    computed = validateAndCompute(raw, { selfMd, nowMd, compostMd, episodes });
  } catch (err) {
    console.error(`rem: FAILED validation — ${(err as Error).message}. No mind files were modified.`);
    process.exit(1);
    return;
  }

  const { parsed, oldSelfTokens, newSelfTokens, newNowMd, newCompostMd, dateStr } = computed;

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

    const newEpisodeCount = episodes.filter((e) => e.isNew).length;

    appendScoreboardEvent({
      ts: new Date().toISOString(),
      type: "rem",
      worldview_tokens: newSelfTokens,
      propagated: parsed.propagated,
      composted: parsed.compost.map((m) => m.episode),
    });

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
      ["add", "SELF.md", "NOW.md", "greeting.md", "compost.md", "scoreboard.jsonl", "episodes"],
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

    console.log(`rem: committed. ${subject}`);
  } catch (err) {
    console.error(
      `rem: write/commit phase failed AFTER validation passed: ${(err as Error).message}. ~/mind may be in a partially-written, uncommitted state — inspect with 'git -C ${MIND_DIR} status'.`
    );
    process.exit(1);
  }
}

await main();
