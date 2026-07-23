#!/usr/bin/env bun
// Circadian SLEEP — SessionEnd hook + detached worker in one file (mirrors
// the alembic-ingest / pi-ingest.ts split: a thin hook that never blocks the
// session, and a worker that does the real drafting). See
// mind/MIND-SPEC.md for the file formats and caps enforced below.
//
// Hook mode (default): read the SessionEnd event, and if there is a
// transcript to work with, spawn this same file with --worker, detached,
// and return immediately. SessionEnd must never wait on an LLM call.
//
// Worker mode (--worker): read the event from stdin, extract the session's
// user/assistant text from the transcript JSONL, call the local LLM (llm.ts)
// to draft an episode file and a rewritten NOW.md, then write both (temp-then-move,
// caps validated before the move). SLEEP never commits the mind repo — only REM
// does (MIND-SPEC "REM" section).
//
// Pending-queue durability (added after the 2026-07-23 outage, when a dead
// LLM made two real sessions leave NO episode — the letter-never-written
// discontinuity this system exists to prevent): a worker whose draft fails
// appends the session to logs/pending-sleep.jsonl BEFORE reporting the
// failure, and `--drain` (which REM also runs before digesting) replays that
// queue oldest-first through the SAME drafting path. A line leaves the queue
// only when its episode is written or its transcript is gone for good; at 8
// attempts the drain stops and fails loud for a human decision.

import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { complete } from "./llm.ts";
import { ok, degraded, fail, correlation } from "./obs.ts";

// ---------- observability ----------
// SLEEP used to fail silently (every early return / swallowed catch left no
// trace), which made 'nothing digested' indistinguishable from 'ran fine'.
// Every decision point now writes one line to logs/sleep.log so the pipeline
// is auditable: `tail logs/sleep.log` tells you exactly why an episode was or
// wasn't produced for a given session.
const SLEEP_LOG = join(process.env.CIRCADIAN_HOME || join(homedir(), "circadian"), "logs", "sleep.log");
function slog(mode: string, msg: string, extra?: Record<string, unknown>): void {
  try {
    mkdirSync(dirname(SLEEP_LOG), { recursive: true });
    const line = `${new Date().toISOString()} [${mode}] ${msg}${extra ? " " + JSON.stringify(extra) : ""}\n`;
    appendFileSync(SLEEP_LOG, line);
  } catch {
    /* logging must never break the hook */
  }
}

// See wake.ts for the path-resolution contract. CIRCADIAN_HOME overrides;
// default ~/circadian. The drafting call now goes to the system local-LLM
// service (see llm.ts) instead of a cloud CLI — no binary path to configure.
const CIRCADIAN_HOME = process.env.CIRCADIAN_HOME || join(homedir(), "circadian");
const MIND = join(CIRCADIAN_HOME, "mind");
const EPISODES_DIR = join(MIND, "episodes");
const MEALS_DIR = join(MIND, "meals");
const BUN_BIN = process.env.CIRCADIAN_BUN_BIN || join(homedir(), ".bun/bin/bun");
const RESERVED_SLUG = "the-forest-session"; // reserved for Worker D's archaeology episode
const EPISODE_CAP_CHARS = 4000; // 1k tokens
const NOW_CAP_CHARS = 12000; // 3k tokens
// Local models have a bounded context window; keep the prompt well within it.
// (Was 100k chars for a cloud CLI; the local Qwen3 context is far smaller.)
const TRANSCRIPT_CAP_CHARS = 48000; // ~12k tokens of transcript
const LLM_TIMEOUT_MS = 6 * 60 * 1000; // local generation of both artifacts can be slow
const LLM_MAX_TOKENS = 6000; // must exceed episode (~1k) + NOW (~3k) with headroom
const MIN_TRANSCRIPT_BYTES = 10 * 1024; // one-shot -p sessions leave tiny transcripts; episodes from them are noise

// ---------- pending queue (durability) ----------
// FIXED CONTRACT — doctor.ts (W3) reads this exact path and line shape.
const PENDING_QUEUE = join(CIRCADIAN_HOME, "logs", "pending-sleep.jsonl");
const PENDING_LOCK = join(CIRCADIAN_HOME, "logs", "pending-sleep.lock");
const DRAFT_ATTEMPTS = 2; // LLM tries per drafting round (live worker or one drain pass)
const PENDING_ATTEMPTS_CAP = 8; // at/above this a human must decide — retrying is no longer obviously right
const LOCK_STALE_MS = 15 * 60 * 1000; // a lock older than this belonged to a drain that died mid-run

interface PendingSleep {
  ts: string;
  session_id: string;
  transcript_path: string;
  transcript_chars: number;
  attempts: number;
  last_error: string;
  queued_at: string;
}

// Identity of a queue line for the post-drain merge: queued_at is minted at
// enqueue time and never mutated, so it pins the line even when attempts and
// last_error are updated in place by a drain.
function pendingKey(e: PendingSleep): string {
  return `${e.session_id} ${e.transcript_path} ${e.queued_at}`;
}

function readPendingQueue(): PendingSleep[] {
  if (!existsSync(PENDING_QUEUE)) return [];
  const entries: PendingSleep[] = [];
  for (const line of readFileSync(PENDING_QUEUE, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (typeof e?.transcript_path === "string" && typeof e?.session_id === "string") {
        entries.push({ attempts: 0, last_error: "", queued_at: "", ...e });
      }
      // A line we cannot parse is never a line we drop: malformed lines are
      // skipped here but survive the rewrite merge byte-identical.
    } catch {
      /* tolerate a partial trailing line from a crashed append */
    }
  }
  return entries;
}

// Append is atomic enough for JSONL (single write, O_APPEND). A queue-write
// failure must NEVER be swallowed: this line is the episode's only surviving
// handle, so losing it silently IS the original bug. fail() loud instead —
// the caller's degraded event never goes out without its queue line behind it.
function enqueuePendingSleep(entry: PendingSleep, corr: string): void {
  try {
    mkdirSync(dirname(PENDING_QUEUE), { recursive: true });
    appendFileSync(PENDING_QUEUE, JSON.stringify(entry) + "\n");
  } catch (e) {
    fail({
      process: "sleep", phase: "pending-queue", correlation_id: corr, session_id: entry.session_id,
      summary: "FAILED to persist a failed episode draft to the pending queue; the episode is truly lost",
      context: { queue: PENDING_QUEUE, transcript_path: entry.transcript_path, transcript_chars: entry.transcript_chars },
      cause: (e as Error).message,
      next_action: "fix the logs dir, then re-queue manually: append {session_id, transcript_path, attempts:0, queued_at} to logs/pending-sleep.jsonl and run `bun src/sleep.ts --drain`",
      code: 1,
    });
  }
}

// Merge-rewrite the queue after a drain: apply the processed actions (null =
// drop, object = keep with updated attempts/last_error) to the lines read at
// drain start, and keep EVERYTHING else byte-identical — including lines a
// SessionEnd worker appended while this drain was running (the worker does
// not take the drain lock). Tmp+rename so a crash mid-write never halves the
// queue. Returns the number of lines remaining. Throws on write failure;
// the caller releases the lock and fails loud.
function rewritePendingQueue(processed: Map<string, PendingSleep | null>): number {
  const raw = existsSync(PENDING_QUEUE) ? readFileSync(PENDING_QUEUE, "utf8") : "";
  const out: string[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let e: PendingSleep | null = null;
    try {
      e = { attempts: 0, last_error: "", queued_at: "", ...JSON.parse(line) };
    } catch {
      out.push(line); // unparseable — preserved, never silently dropped
      continue;
    }
    if (processed.has(pendingKey(e!))) {
      const action = processed.get(pendingKey(e!));
      if (action) out.push(JSON.stringify(action));
      // null => drop: episode written, or transcript gone for good
    } else {
      out.push(line); // appended during this drain, or after a cap stop — untouched
    }
  }
  const tmp = `${PENDING_QUEUE}.tmp-${process.pid}`;
  writeFileSync(tmp, out.length ? out.join("\n") + "\n" : "", "utf8");
  renameSync(tmp, PENDING_QUEUE);
  return out.length;
}

// O_EXCL create; two drains never run concurrently. A lock younger than
// LOCK_STALE_MS means a live (or just-crashed) drain — refuse loud. Older
// means the holder died mid-drain (fail() paths exit without unlocking by
// design — this stale break is the reaper): break it with a stderr note and
// take over.
function acquireDrainLock(corr: string): void {
  mkdirSync(dirname(PENDING_LOCK), { recursive: true });
  const payload = () => JSON.stringify({ pid: process.pid, ts: new Date().toISOString(), corr }) + "\n";
  try {
    writeFileSync(PENDING_LOCK, payload(), { flag: "wx" });
    return;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
  }
  let ageMs = Infinity; // stat failed => the lock vanished between checks; retry below
  try {
    ageMs = Date.now() - statSync(PENDING_LOCK).mtimeMs;
  } catch {
    /* raced release — fall through to the retry */
  }
  if (ageMs !== Infinity && ageMs <= LOCK_STALE_MS) {
    fail({
      process: "sleep", phase: "drain-lock", correlation_id: corr,
      summary: "another drain holds the pending-sleep lock; refusing a concurrent drain",
      context: { lock: PENDING_LOCK, lock_age_ms: ageMs },
      cause: "lockfile exists and is younger than the 15-minute stale window",
      next_action: "if no drain is actually running, the lock self-breaks after 15 minutes; to force, delete logs/pending-sleep.lock",
      code: 1,
    });
  }
  if (ageMs > LOCK_STALE_MS) {
    process.stderr.write(
      `sleep --drain: breaking stale lock (age ${Math.round(ageMs / 60000)}min > ${LOCK_STALE_MS / 60000}min); the previous holder died mid-drain\n`
    );
    try {
      unlinkSync(PENDING_LOCK);
    } catch {
      /* raced another drainer — the retry below decides */
    }
  }
  try {
    writeFileSync(PENDING_LOCK, payload(), { flag: "wx" });
  } catch (e) {
    fail({
      process: "sleep", phase: "drain-lock", correlation_id: corr,
      summary: "could not take the pending-sleep lock",
      context: { lock: PENDING_LOCK },
      cause: (e as Error).message,
      next_action: "inspect logs/pending-sleep.lock — a concurrent drain may have raced the stale break",
      code: 1,
    });
  }
}

async function readStdinText(): Promise<string> {
  try {
    return await new Response(Bun.stdin.stream()).text();
  } catch {
    return "";
  }
}

function parseEvent(text: string): Record<string, any> {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

// ---------- hook mode ----------

async function runHook(): Promise<void> {
  const raw = await readStdinText();
  const evt = parseEvent(raw);
  const transcriptPath = evt?.transcript_path;
  slog("hook", "fired", {
    stdin_bytes: raw.length,
    transcript_path: transcriptPath ?? null,
    session_id: evt?.session_id ?? null,
    keys: Object.keys(evt || {}),
  });

  // Legacy guard from when drafting shelled out to `claude -p` (each such
  // subprocess fired SessionEnd -> another drafting call). Drafting now hits
  // the local LLM over HTTP with no Claude subprocess, so this can no longer
  // recurse; the guard is kept as a cheap belt-and-suspenders no-op.
  if (process.env.CIRCADIAN_INTERNAL === "1") {
    slog("hook", "bail: CIRCADIAN_INTERNAL=1 (recursion guard)");
    process.exit(0);
  }

  if (!transcriptPath) {
    slog("hook", "bail: event carried no transcript_path", { keys: Object.keys(evt || {}) });
    process.exit(0);
  }
  if (!existsSync(transcriptPath)) {
    slog("hook", "bail: transcript_path does not exist", { transcriptPath });
    process.exit(0);
  }
  const tsize = statSync(transcriptPath).size;
  if (tsize < MIN_TRANSCRIPT_BYTES) {
    slog("hook", "bail: transcript too small", { bytes: tsize, min: MIN_TRANSCRIPT_BYTES });
    process.exit(0);
  }

  try {
    const selfPath = import.meta.path;
    // Pass the event via env, NOT piped stdin: the hook exits immediately
    // (process.exit(0) below), and a detached child's piped stdin is not
    // guaranteed to flush before the parent dies — that race delivered empty
    // stdin to the worker every time, so transcript_path arrived as null and
    // the worker aborted silently. Env survives detach+exit deterministically.
    const worker = spawn(BUN_BIN, ["run", selfPath, "--worker"], {
      detached: true,
      stdio: ["ignore", "ignore", "ignore"],
      env: { ...process.env, CIRCADIAN_SLEEP_EVENT: JSON.stringify(evt) },
    });
    worker.unref();
    slog("hook", "spawned worker", { transcript_bytes: tsize, pid: worker.pid });
  } catch (e) {
    // never let a spawn failure block SessionEnd — but do record it
    slog("hook", "spawn FAILED", { error: (e as Error).message });
  }

  process.exit(0);
}

// ---------- worker mode ----------

function extractTranscriptText(transcriptPath: string, capChars: number): string {
  const raw = readFileSync(transcriptPath, "utf8");
  const lines = raw.split("\n").filter(Boolean);
  const turns: string[] = [];

  for (const line of lines) {
    let entry: any;
    try {
      entry = JSON.parse(line);
    } catch {
      continue; // tolerate a partial trailing line from a live transcript
    }
    const role = entry?.message?.role ?? entry?.role;
    if (role !== "user" && role !== "assistant") continue;

    const content = entry?.message?.content ?? entry?.content;
    const blocks = Array.isArray(content) ? content : [{ type: "text", text: String(content ?? "") }];
    const text = blocks
      .filter((b: any) => b?.type === "text" && typeof b.text === "string")
      .map((b: any) => b.text)
      .join("\n")
      .trim();
    if (text) turns.push(`${role === "user" ? "User" : "Assistant"}: ${text}`);
  }

  const full = turns.join("\n\n");
  if (full.length <= capChars) return full;

  // Bounded prompt: keep the opening ask (context) and the most recent
  // activity (outcome) rather than an arbitrary middle slice.
  const headChars = Math.floor(capChars * 0.25);
  const tailChars = capChars - headChars;
  return `${full.slice(0, headChars)}\n\n... [truncated ${full.length - capChars} chars] ...\n\n${full.slice(-tailChars)}`;
}

function extractSection(md: string, heading: string): string {
  // The heading match must stay on its own line (a bounded [^\n]* + a single
  // \n), never a greedy \s* that can swallow the blank-line separator ahead
  // of an EMPTY section and eat straight through to the next heading (or
  // end of string) — verified failure mode: "## Serendipity" immediately
  // followed by "## Last sleep" with no body collapses the lookahead.
  const re = new RegExp(`##\\s*${heading}\\b[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, "i");
  const m = md.match(re);
  return m ? m[1].trim() : "";
}

function buildPrompt(transcriptText: string, sessionId: string, existingSelf: string, existingNow: string, mealNotes: string): string {
  return `You are the SLEEP process of a circadian memory substrate for an AI coding agent (the user's Claude Code). Read the session transcript below and produce EXACTLY two artifacts in the delimited format specified — no commentary before "=== EPISODE ===" or after "=== END ===", no surrounding markdown code fences.

SESSION ID: ${sessionId}

CURRENT WORLDVIEW (SELF.md — may be sparse if this system is early in its life):
"""
${existingSelf || "(empty)"}
"""

CURRENT NOW.md (about to be superseded):
"""
${existingNow}
"""

MEAL NOTES (in-session checkpoints from graze — pre-chewed context, the running meal log):
"""
${mealNotes || "(none — no graze checkpoints fired this session)"}
"""

SESSION TRANSCRIPT (user + assistant text turns, chronological, may be head+tail truncated):
"""
${transcriptText}
"""

Produce your two artifacts in EXACTLY this format:

=== EPISODE ===
ARC: <a short 2-6 word name for this episode's arc>
<narrative body in markdown. Requirements: at least 2 VERBATIM quotes from the transcript above, each wrapped in double quotes exactly as they appeared; explicit why-chains for any conclusion you record (state the reasoning, not just the conclusion). Then, BEFORE the what-changed line, include one line starting exactly with "user-observed:" that records what THIS session revealed about the user jrg as a person to work with — a preference, working style, register, mental model, or reaction pattern — that is NOT a mere code fact and would help a future instance work with him better. It MUST carry a verbatim quote from the transcript as evidence. If the session genuinely revealed nothing new about him, write exactly "user-observed: nothing new". Do NOT invent; infer only what the transcript supports. Then end with one line starting exactly with "what-changed:" followed by one of confirm/contradict/supersede/deepen and a short reason relative to the current worldview above. Keep the whole episode body under 3500 characters total — this is memory, not a transcript, be economical.>
=== NOW ===
## Arc
<1-3 sentences: the current overarching arc/thread of work>

## Flight plan
<1-3 sentences: the concrete first move for the NEXT session>

## Live tensions
<2-4 short bullet lines: open questions or tensions loaded but not resolved>

## Commitments
<any promises made to the user this session, one per line, or "none" if none>

## Serendipity
<leave completely empty — this section is owned exclusively by a separate consolidation process, never write anything here>

## Last sleep
<leave completely empty — the caller fills this in>
=== END ===`;
}

async function draftViaLLM(prompt: string): Promise<string | null> {
  try {
    return await complete(prompt, { timeoutMs: LLM_TIMEOUT_MS, maxTokens: LLM_MAX_TOKENS });
  } catch {
    // transport error, timeout, truncation, or empty content — treated as a
    // failed draft by the caller (no partial write).
    return null;
  }
}

function parseDraft(output: string): { arc: string; episodeBody: string; nowRaw: string } | null {
  const episodeMatch = output.match(/=== EPISODE ===\s*\n([\s\S]*?)\n=== NOW ===/);
  const nowMatch = output.match(/=== NOW ===\s*\n([\s\S]*?)\n=== END ===/);
  if (!episodeMatch || !nowMatch) return null;

  const episodeRaw = episodeMatch[1].trim();
  const arcMatch = episodeRaw.match(/^ARC:\s*(.+)$/m);
  if (!arcMatch) return null;
  const arc = arcMatch[1].trim();
  const episodeBody = episodeRaw.replace(/^ARC:\s*.+$/m, "").trim();

  return { arc, episodeBody, nowRaw: nowMatch[1] };
}

function slugify(arc: string): string {
  let slug = arc
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  if (!slug) slug = "session";
  if (slug === RESERVED_SLUG) slug = `${slug}-alt`; // reserved for Worker D
  return slug;
}

function truncateToCharCap(content: string, capChars: number, label: string): string {
  if (content.length <= capChars) return content;
  const notice = `\n\n<!-- truncated: exceeded ${label} char cap (${capChars}), cut by sleep.ts -->`;
  const budget = capChars - notice.length;
  const cutAt = content.lastIndexOf("\n\n", budget);
  const body = content.slice(0, cutAt > 0 ? cutAt : budget);
  return body + notice;
}

function buildEpisodeContent(date: string, sessionId: string, arc: string, episodeBody: string): string {
  const frontmatter = `---\ndate: ${date}\nsession: ${sessionId}\narc: ${arc}\n---\n`;
  const content = `${frontmatter}\n${episodeBody}\n`;
  return truncateToCharCap(content, EPISODE_CAP_CHARS, "episode");
}

function buildNowContent(nowRaw: string, preservedSerendipity: string, lastSleepIso: string): string {
  const arc = extractSection(nowRaw, "Arc");
  const flightPlan = extractSection(nowRaw, "Flight plan");
  const liveTensions = extractSection(nowRaw, "Live tensions");
  const commitments = extractSection(nowRaw, "Commitments");

  const content = [
    "<!-- cap: 3k tokens (12k chars) -->",
    "",
    "## Arc",
    "",
    arc,
    "",
    "## Flight plan",
    "",
    flightPlan,
    "",
    "## Live tensions",
    "",
    liveTensions,
    "",
    "## Commitments",
    "",
    commitments,
    "",
    "## Serendipity",
    "",
    preservedSerendipity,
    "",
    "## Last sleep",
    "",
    lastSleepIso,
    "",
  ].join("\n");

  return truncateToCharCap(content, NOW_CAP_CHARS, "NOW.md");
}

function writeEpisodeFile(date: string, arc: string, content: string): string {
  const baseSlug = slugify(arc);
  let filename = `${date}-${baseSlug}.md`;
  let counter = 2;
  while (existsSync(join(EPISODES_DIR, filename))) {
    filename = `${date}-${baseSlug}-${counter}.md`;
    counter += 1;
  }
  const finalPath = join(EPISODES_DIR, filename);
  const tmpPath = join(EPISODES_DIR, `.tmp-${process.pid}-${Date.now()}.md`);
  writeFileSync(tmpPath, content, "utf8");
  renameSync(tmpPath, finalPath);
  return finalPath;
}

function writeNowFile(content: string): void {
  const finalPath = join(MIND, "NOW.md");
  const tmpPath = join(MIND, `.NOW.md.tmp-${process.pid}`);
  writeFileSync(tmpPath, content, "utf8");
  renameSync(tmpPath, finalPath);
}

function appendSleepScoreboard(): void {
  try {
    const self = readFileSync(join(MIND, "SELF.md"), "utf8");
    const event = {
      ts: new Date().toISOString(),
      type: "sleep",
      worldview_tokens: Math.ceil(self.length / 4),
    };
    appendFileSync(join(MIND, "scoreboard.jsonl"), JSON.stringify(event) + "\n");
  } catch {
    // scoreboard append failure must not undo the writes above
  }
}

type DraftResult =
  | { status: "written" }
  | { status: "no-transcript" }
  | { status: "empty-transcript" }
  | { status: "draft-failed"; lastError: string };

// The drafting core shared by the live SessionEnd worker and --drain:
// identical episode format, NOW.md write, meal fold-and-delete, scoreboard
// append. queueOnFailure is true ONLY for the live worker — the drain
// replays lines that are already queued, so re-enqueueing would duplicate
// them (and mask the attempts ratchet).
async function draftSessionEpisode(opts: {
  transcriptPath: string | undefined;
  sessionId: string;
  corr: string;
  queueOnFailure: boolean;
  queueAttempts: number; // cumulative queue attempts INCLUDING this round (event context only)
  mode: "worker" | "drain";
}): Promise<DraftResult> {
  const { transcriptPath, sessionId, corr, mode } = opts;
  if (!transcriptPath || !existsSync(transcriptPath)) {
    slog(mode, "abort: transcript missing", { transcriptPath: transcriptPath ?? null });
    // A missing transcript at SLEEP means this session leaves NO letter to
    // the next instance — a discontinuity event. Surface it, do not swallow.
    degraded({
      process: "sleep", phase: "read-transcript", correlation_id: corr, session_id: sessionId,
      summary: "no transcript to digest at session end; no episode written",
      context: { transcript_path: transcriptPath ?? null },
      cause: "SessionEnd event carried no existing transcript_path (session may have produced no on-disk transcript)",
      next_action: "if this recurs, verify the SessionEnd hook passes transcript_path; inspect logs/sleep.log for the raw event",
    });
    return { status: "no-transcript" };
  }

  const transcriptText = extractTranscriptText(transcriptPath, TRANSCRIPT_CAP_CHARS);
  if (!transcriptText) {
    slog(mode, "abort: transcript extracted to empty text");
    degraded({
      process: "sleep", phase: "extract-transcript", correlation_id: corr, session_id: sessionId,
      summary: "transcript had no user/assistant text; no episode written",
      context: { transcript_path: transcriptPath },
      cause: "extractTranscriptText found zero user/assistant turns in the JSONL",
      next_action: "confirm the transcript format matches the parser (message.role/content); this session yields no episode",
    });
    return { status: "empty-transcript" };
  }
  slog(mode, "transcript extracted", { chars: transcriptText.length });

  // Fold in meal notes from graze (in-session checkpoints) — pre-chewed
  // context that SLEEP digests alongside the full transcript.
  const mealPath = join(MEALS_DIR, `${sessionId}.md`);
  let mealNotes = "";
  let mealCheckpoints = 0;
  if (existsSync(mealPath)) {
    mealNotes = readFileSync(mealPath, "utf8");
    mealCheckpoints = (mealNotes.match(/## checkpoint \d+/g) || []).length;
    slog(mode, "meal notes found", { meal: mealPath, checkpoints: mealCheckpoints });
  }

  const existingNow = readFileSync(join(MIND, "NOW.md"), "utf8");
  const existingSelf = existsSync(join(MIND, "SELF.md")) ? readFileSync(join(MIND, "SELF.md"), "utf8") : "";

  const prompt = buildPrompt(transcriptText, sessionId, existingSelf, existingNow, mealNotes);

  let draft: ReturnType<typeof parseDraft> = null;
  let lastReason = "";
  for (let attempt = 0; attempt < DRAFT_ATTEMPTS && !draft; attempt += 1) {
    slog(mode, "LLM draft attempt", { attempt: attempt + 1 });
    const output = await draftViaLLM(prompt);
    if (!output) {
      lastReason = "LLM returned nothing (call failed or timed out)";
      slog(mode, lastReason, { attempt: attempt + 1 });
      continue;
    }
    draft = parseDraft(output);
    if (!draft) {
      lastReason = `LLM output did not parse into an episode (${output.length} chars returned)`;
      slog(mode, "LLM output did not parse (malformed draft)", { attempt: attempt + 1, output_chars: output.length });
    }
  }
  if (!draft) {
    // Queue BEFORE reporting, so the degraded event can truthfully say the
    // episode is preserved. enqueuePendingSleep fail()s loudly on a write
    // error — this event never goes out without its queue line behind it.
    if (opts.queueOnFailure) {
      enqueuePendingSleep(
        {
          ts: new Date().toISOString(),
          session_id: sessionId,
          transcript_path: transcriptPath,
          transcript_chars: transcriptText.length,
          attempts: DRAFT_ATTEMPTS,
          last_error: lastReason,
          queued_at: new Date().toISOString(),
        },
        corr
      );
    }
    slog(mode, `no valid draft after ${DRAFT_ATTEMPTS} attempts — queued, not lost`);
    degraded({
      process: "sleep", phase: "llm-draft", correlation_id: corr, session_id: sessionId,
      summary: `episode draft failed ${DRAFT_ATTEMPTS} times; queued in logs/pending-sleep.jsonl for a later drain`,
      context: { transcript_chars: transcriptText.length, attempts: DRAFT_ATTEMPTS, queued: true, queue_attempts: opts.queueAttempts },
      cause: lastReason || "LLM produced no parseable EPISODE/NOW blocks on either attempt",
      next_action: "check the local LLM at :10240 (curl http://127.0.0.1:10240/v1/models); the queue drains via `bun src/sleep.ts --drain` (REM runs it before digesting); the full run is in logs/sleep.log",
    });
    return { status: "draft-failed", lastError: lastReason };
  }

  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const lastSleepIso = now.toISOString();
  const preservedSerendipity = extractSection(existingNow, "Serendipity"); // REM owns this line; carry it forward as-is

  const episodeContent = buildEpisodeContent(date, sessionId, draft.arc, draft.episodeBody);
  const nowContent = buildNowContent(draft.nowRaw, preservedSerendipity, lastSleepIso);

  const epPath = writeEpisodeFile(date, draft.arc, episodeContent);
  writeNowFile(nowContent);
  appendSleepScoreboard();
  slog(mode, "SUCCESS: episode written", { episode: epPath, arc: draft.arc });
  // The letter was written. Success is as legible as failure.
  ok({
    process: "sleep", phase: "write-episode", correlation_id: corr, session_id: sessionId,
    summary: `episode written for this session: ${draft.arc}`,
    context: {
      episode: epPath,
      arc: draft.arc,
      transcript_chars: transcriptText.length,
      meal_notes_used: mealCheckpoints > 0,
      checkpoints: mealCheckpoints,
    },
  });

  // Fold and delete the meal file — the episode supersedes it; meals/ is
  // working memory, never committed.
  if (existsSync(mealPath)) {
    try {
      unlinkSync(mealPath);
      slog(mode, "meal file deleted", { meal: mealPath });
    } catch (e) {
      slog(mode, "failed to delete meal file", { error: (e as Error).message });
      // not fatal — the episode is already written
    }
  }
  return { status: "written" };
}

async function runWorker(): Promise<void> {
  const corr = correlation("sleep");
  slog("worker", "start");
  try {
    // Event arrives via env (see runHook spawn). Fall back to stdin for any
    // caller that still pipes it (e.g. manual `bun run sleep.ts --worker`).
    const evtRaw = process.env.CIRCADIAN_SLEEP_EVENT || (await readStdinText());
    const evt = parseEvent(evtRaw);
    await draftSessionEpisode({
      transcriptPath: evt?.transcript_path,
      sessionId: evt?.session_id ?? "unknown",
      corr,
      queueOnFailure: true,
      queueAttempts: DRAFT_ATTEMPTS,
      mode: "worker",
    });
  } catch (e) {
    // best-effort detached worker — but record the failure everywhere, never hide it.
    slog("worker", "EXCEPTION", { error: (e as Error).message });
    fail({
      process: "sleep", phase: "worker", correlation_id: corr,
      summary: "sleep worker threw; session may leave no episode",
      context: { error_line: (e as Error).stack?.split("\n")[1]?.trim() },
      cause: (e as Error).message,
      next_action: "inspect logs/sleep.log and logs/circadian.events.jsonl; the transcript is intact, sleep can be re-run manually with CIRCADIAN_SLEEP_EVENT",
      code: 1,
    });
  }
}

// ---------- drain mode ----------

// Replay the pending queue oldest-first through the same drafting core.
// Outcomes per line: episode written => drop; transcript gone => drop with a
// human-visible degraded (unrecoverable, but never silent); draft failed =>
// keep and ratchet attempts; attempts >= CAP => stop the drain and fail loud
// for a human decision (lines processed so far are still merged to disk).
async function runDrain(): Promise<void> {
  const corr = correlation("sleep-drain");
  slog("drain", "start");
  acquireDrainLock(corr);
  let capHit: PendingSleep | null = null;
  let drained = 0;
  let dropped = 0;
  let remaining = 0;
  let fatal: Error | null = null;
  try {
    const entries = readPendingQueue();
    if (entries.length > 0) {
      const processed = new Map<string, PendingSleep | null>();
      for (const entry of entries) {
        if (entry.attempts >= PENDING_ATTEMPTS_CAP) {
          capHit = entry; // leave queued; fail() fires after the merge + unlock
          break;
        }
        const key = pendingKey(entry);
        if (!existsSync(entry.transcript_path)) {
          degraded({
            process: "sleep", phase: "drain-drop", correlation_id: corr, session_id: entry.session_id,
            summary: "dropping queued episode: its transcript is gone; this session can never yield an episode",
            context: { transcript_path: entry.transcript_path, attempts: entry.attempts, queued_at: entry.queued_at },
            cause: "transcript file no longer exists on disk",
            next_action: "nothing to retry — if the transcript survives elsewhere, append a fresh line to logs/pending-sleep.jsonl and re-run --drain",
          });
          slog("drain", "dropped: transcript gone", { session_id: entry.session_id });
          processed.set(key, null);
          dropped += 1;
          continue;
        }
        try {
          const result = await draftSessionEpisode({
            transcriptPath: entry.transcript_path,
            sessionId: entry.session_id,
            corr,
            queueOnFailure: false, // already queued — this IS the drain
            queueAttempts: entry.attempts + DRAFT_ATTEMPTS,
            mode: "drain",
          });
          if (result.status === "written") {
            processed.set(key, null);
            drained += 1;
            slog("drain", "drained: episode written", { session_id: entry.session_id });
          } else if (result.status === "no-transcript") {
            processed.set(key, null); // vanished mid-drain — same as gone
            dropped += 1;
          } else {
            const lastError =
              result.status === "draft-failed" ? result.lastError : "transcript yielded no user/assistant text";
            processed.set(key, { ...entry, attempts: entry.attempts + DRAFT_ATTEMPTS, last_error: lastError });
            slog("drain", "kept: draft failed again", { session_id: entry.session_id, attempts: entry.attempts + DRAFT_ATTEMPTS });
          }
        } catch (e) {
          // One poisonous line must not block the rest of the queue.
          degraded({
            process: "sleep", phase: "drain", correlation_id: corr, session_id: entry.session_id,
            summary: "drain threw on a queued line; keeping it for the next drain",
            context: { transcript_path: entry.transcript_path, attempts: entry.attempts + DRAFT_ATTEMPTS },
            cause: (e as Error).message,
            next_action: "inspect logs/sleep.log; the line stays queued and ratchets toward the attempts cap",
          });
          processed.set(key, { ...entry, attempts: entry.attempts + DRAFT_ATTEMPTS, last_error: (e as Error).message });
        }
      }
      remaining = rewritePendingQueue(processed);
    }
  } catch (e) {
    fatal = e as Error;
  } finally {
    try {
      unlinkSync(PENDING_LOCK);
    } catch {
      /* already gone */
    }
  }
  if (fatal) {
    fail({
      process: "sleep", phase: "drain", correlation_id: corr,
      summary: "drain failed before completing; queue state on disk is intact",
      context: { drained, dropped, queue: PENDING_QUEUE },
      cause: fatal.message,
      next_action: "inspect logs/sleep.log and logs/pending-sleep.jsonl; episodes already written this drain are on disk — re-run `bun src/sleep.ts --drain` (writeEpisodeFile dedupes filenames)",
      code: 1,
    });
  }
  if (capHit) {
    fail({
      process: "sleep", phase: "drain", correlation_id: corr, session_id: capHit.session_id,
      summary: `queued episode hit the ${PENDING_ATTEMPTS_CAP}-attempt cap; human decision required`,
      context: { transcript_path: capHit.transcript_path, attempts: capHit.attempts, queued_at: capHit.queued_at, drained, dropped },
      cause: capHit.last_error || "repeated draft failures",
      next_action: "inspect logs/pending-sleep.jsonl: fix the LLM and re-run `bun src/sleep.ts --drain`, or delete the line to abandon the episode",
      code: 1,
    });
  }
  ok({
    process: "sleep", phase: "drain", correlation_id: corr,
    summary: `drain complete: ${drained} drained, ${dropped} dropped, ${remaining} remaining`,
    context: { drained, remaining, dropped },
  });
  slog("drain", "done", { drained, dropped, remaining });
}

if (process.argv.includes("--worker")) {
  await runWorker();
  process.exit(0);
} else if (process.argv.includes("--drain")) {
  await runDrain();
  process.exit(0);
} else {
  await runHook();
}
