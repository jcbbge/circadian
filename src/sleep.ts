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
<narrative body in markdown. Requirements: at least 2 VERBATIM quotes from the transcript above, each wrapped in double quotes exactly as they appeared; explicit why-chains for any conclusion you record (state the reasoning, not just the conclusion); end with one line starting exactly with "what-changed:" followed by one of confirm/contradict/supersede/deepen and a short reason relative to the current worldview above. Keep the whole episode body under 3500 characters total — this is memory, not a transcript, be economical.>
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

async function runWorker(): Promise<void> {
  const corr = correlation("sleep");
  slog("worker", "start");
  try {
    // Event arrives via env (see runHook spawn). Fall back to stdin for any
    // caller that still pipes it (e.g. manual `bun run sleep.ts --worker`).
    const evtRaw = process.env.CIRCADIAN_SLEEP_EVENT || (await readStdinText());
    const evt = parseEvent(evtRaw);
    const transcriptPath = evt?.transcript_path;
    const sessionId = evt?.session_id ?? "unknown";
    if (!transcriptPath || !existsSync(transcriptPath)) {
      slog("worker", "abort: transcript missing", { transcriptPath: transcriptPath ?? null });
      // A missing transcript at SLEEP means this session leaves NO letter to
      // the next instance — a discontinuity event. Surface it, do not swallow.
      degraded({
        process: "sleep", phase: "read-transcript", correlation_id: corr, session_id: sessionId,
        summary: "no transcript to digest at session end; no episode written",
        context: { transcript_path: transcriptPath ?? null },
        cause: "SessionEnd event carried no existing transcript_path (session may have produced no on-disk transcript)",
        next_action: "if this recurs, verify the SessionEnd hook passes transcript_path; inspect logs/sleep.log for the raw event",
      });
      return;
    }

    const transcriptText = extractTranscriptText(transcriptPath, TRANSCRIPT_CAP_CHARS);
    if (!transcriptText) {
      slog("worker", "abort: transcript extracted to empty text");
      degraded({
        process: "sleep", phase: "extract-transcript", correlation_id: corr, session_id: sessionId,
        summary: "transcript had no user/assistant text; no episode written",
        context: { transcript_path: transcriptPath },
        cause: "extractTranscriptText found zero user/assistant turns in the JSONL",
        next_action: "confirm the transcript format matches the parser (message.role/content); this session yields no episode",
      });
      return;
    }
    slog("worker", "transcript extracted", { chars: transcriptText.length });

    // Fold in meal notes from graze (in-session checkpoints) — pre-chewed
    // context that SLEEP digests alongside the full transcript.
    const mealPath = join(MEALS_DIR, `${sessionId}.md`);
    let mealNotes = "";
    let mealCheckpoints = 0;
    if (existsSync(mealPath)) {
      mealNotes = readFileSync(mealPath, "utf8");
      mealCheckpoints = (mealNotes.match(/## checkpoint \d+/g) || []).length;
      slog("worker", "meal notes found", { meal: mealPath, checkpoints: mealCheckpoints });
    }

    const existingNow = readFileSync(join(MIND, "NOW.md"), "utf8");
    const existingSelf = existsSync(join(MIND, "SELF.md")) ? readFileSync(join(MIND, "SELF.md"), "utf8") : "";

    const prompt = buildPrompt(transcriptText, sessionId, existingSelf, existingNow, mealNotes);

    let draft: ReturnType<typeof parseDraft> = null;
    let lastReason = "";
    for (let attempt = 0; attempt < 2 && !draft; attempt += 1) {
      slog("worker", "LLM draft attempt", { attempt: attempt + 1 });
      const output = await draftViaLLM(prompt);
      if (!output) {
        lastReason = "LLM returned nothing (call failed or timed out)";
        slog("worker", lastReason, { attempt: attempt + 1 });
        continue;
      }
      draft = parseDraft(output);
      if (!draft) {
        lastReason = `LLM output did not parse into an episode (${output.length} chars returned)`;
        slog("worker", "LLM output did not parse (malformed draft)", { attempt: attempt + 1, output_chars: output.length });
      }
    }
    if (!draft) {
      slog("worker", "abort: no valid draft after 2 attempts — NO episode written");
      degraded({
        process: "sleep", phase: "llm-draft", correlation_id: corr, session_id: sessionId,
        summary: "episode draft failed twice; this session leaves no episode",
        context: { transcript_chars: transcriptText.length, attempts: 2 },
        cause: lastReason || "LLM produced no parseable EPISODE/NOW blocks on either attempt",
        next_action: "check the local LLM at :10240 (curl http://127.0.0.1:10240/v1/models); the full run is in logs/sleep.log",
      });
      return; // real call failed or output malformed twice — no partial write
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
    slog("worker", "SUCCESS: episode written", { episode: epPath, arc: draft.arc });
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
        slog("worker", "meal file deleted", { meal: mealPath });
      } catch (e) {
        slog("worker", "failed to delete meal file", { error: (e as Error).message });
        // not fatal — the episode is already written
      }
    }
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

if (process.argv.includes("--worker")) {
  await runWorker();
  process.exit(0);
} else {
  await runHook();
}
