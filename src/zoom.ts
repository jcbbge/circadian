#!/usr/bin/env bun
/**
 * zoom.ts — the provenance drill. Every belief opens all the way down.
 *
 * OptMem-zoom semantics for the mind: a doctrine line in SELF.md carries an
 * origin stamp ([ep:YYYY-MM-DD]); the episode behind that stamp may still be
 * live in mind/episodes/, or it may have been composted — git rm'd by a REM
 * pass, with git history as the permanent archive (MIND-SPEC "Compost Rules":
 * "Git history is the permanent archive of the raw episode"). Zoom is the
 * instrument that makes that archive contract REAL: give it a stamp, a date,
 * a filename, or a slug fragment, and it drills from the belief all the way
 * down to the raw episode — recovering composted ones from the deleting
 * commit's parent tree — plus the taught->absorbed-where line, the compost.md
 * entry, and every SELF.md line still citing the episode's date.
 *
 * A memory system you cannot audit is one you cannot trust (SELF.md
 * Doctrine[1] — the cliff is complexity accretion; the countermeasure is
 * everything verifiable by reading). Zoom is that audit, one belief at a time.
 *
 * READ-ONLY, always. Zoom never writes under mind/ — it reads the working
 * tree and the git object store, nothing else. Law 9 (nothing silent): each
 * run emits exactly one context-bound event to the obs ledger — ok on a hit,
 * idle on a miss. A miss is a lookup that found nothing, not a system fault,
 * so it does NOT go through fail() (which would post a tower alert for what
 * may be a typo — the same render-noise jam status --line documents); the
 * idle event carries the query and the nearest dates, then the process exits
 * 1 so scripts can branch on it. Nothing silent, nothing crying wolf.
 *
 * Date stamps are normalized before matching (zero-padded), because at least
 * one malformed stamp exists in the wild ([ep:2026-07-6], SELF.md
 * Doctrine[2]) — a provenance drill that can't find the belief with the
 * sloppy stamp would fail exactly where auditing matters most.
 */

import * as fs from "fs";
import * as path from "path";
import { homedir } from "os";
import { execFileSync } from "child_process";
import { ok, idle, correlation } from "./obs.ts";

// CIRCADIAN_HOME overrides; default ~/circadian. See wake.ts for the contract.
const CIRCADIAN_HOME = process.env.CIRCADIAN_HOME || path.join(homedir(), "circadian");
const MIND_DIR = path.join(CIRCADIAN_HOME, "mind");
const EPISODES_DIR = path.join(MIND_DIR, "episodes");
const SELF_PATH = path.join(MIND_DIR, "SELF.md");
const COMPOST_PATH = path.join(MIND_DIR, "compost.md");

// ---------------------------------------------------------------------
// query parsing — a stamp, a date, a filename, or a slug fragment
// ---------------------------------------------------------------------

export interface ZoomQuery {
  raw: string;
  kind: "date" | "name";
  /** normalized YYYY-MM-DD when kind=date */
  date?: string;
  /** lowercase substring needle when kind=name */
  needle?: string;
}

/** Zero-pad a loose YYYY-M-D into YYYY-MM-DD; null if it isn't a date. */
export function normalizeDate(s: string): string | null {
  const m = s.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

export function parseQuery(raw: string): ZoomQuery {
  // strip stamp dressing: surrounding brackets, then a leading "ep:"
  let q = raw.trim().replace(/^\[|\]$/g, "").trim();
  if (/^ep:/i.test(q)) q = q.slice(3).trim();
  const date = normalizeDate(q);
  if (date) return { raw, kind: "date", date };
  // a filename with or without .md, or any slug fragment → substring match
  return { raw, kind: "name", needle: q.replace(/\.md$/i, "").toLowerCase() };
}

// ---------------------------------------------------------------------
// the episode universe: working tree ∪ git-deleted (composted) episodes
// ---------------------------------------------------------------------

export interface EpisodeRecord {
  filename: string;
  content: string;
  composted: boolean;
  /** short hash of the commit that git rm'd it (content lives at <hash>^) */
  deletingCommit?: string;
}

/** Newest deleting commit per git-deleted episode filename. The log walks
 * newest-first, so the first commit seen for a filename is the most recent
 * shed — the parent of THAT commit holds the final telling (taught-line
 * included, since REM appends it in the absorb commit before the shed). */
export function gitDeletedEpisodes(mindDir: string): Map<string, string> {
  const map = new Map<string, string>();
  let out = "";
  try {
    out = execFileSync(
      "git",
      ["log", "--diff-filter=D", "--name-only", "--pretty=format:%h", "--", "episodes/"],
      { cwd: mindDir, encoding: "utf8" }
    );
  } catch {
    return map; // not a git repo / no history — the live tree is the universe
  }
  let commit = "";
  for (const line of out.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (!t.startsWith("episodes/")) {
      commit = t;
      continue;
    }
    const f = t.replace(/^episodes\//, "");
    if (!map.has(f)) map.set(f, commit);
  }
  return map;
}

/** All episodes ever: live files first (they win a filename collision — the
 * working tree is the present tense), then git-recovered composted ones. */
export function collectEpisodes(mindDir: string): EpisodeRecord[] {
  const records: EpisodeRecord[] = [];
  const seen = new Set<string>();
  let liveFiles: string[] = [];
  try {
    liveFiles = fs.readdirSync(path.join(mindDir, "episodes")).filter((f) => f.endsWith(".md"));
  } catch {
    liveFiles = [];
  }
  for (const f of liveFiles.sort()) {
    records.push({
      filename: f,
      content: fs.readFileSync(path.join(mindDir, "episodes", f), "utf8"),
      composted: false,
    });
    seen.add(f);
  }
  for (const [f, commit] of gitDeletedEpisodes(mindDir)) {
    if (seen.has(f)) continue; // re-drafted after a shed: the live file wins
    let content: string;
    try {
      content = execFileSync("git", ["show", `${commit}^:episodes/${f}`], {
        cwd: mindDir,
        encoding: "utf8",
      });
    } catch {
      continue; // unreachable parent (shallow/rewritten history) — skip, never fabricate
    }
    records.push({ filename: f, content, composted: true, deletingCommit: commit });
  }
  records.sort((a, b) => a.filename.localeCompare(b.filename));
  return records;
}

export function matchEpisodes(records: EpisodeRecord[], q: ZoomQuery): EpisodeRecord[] {
  if (q.kind === "date") return records.filter((r) => r.filename.startsWith(q.date! + "-"));
  return records.filter((r) => r.filename.toLowerCase().includes(q.needle!));
}

// ---------------------------------------------------------------------
// provenance around a match: taught-line, compost.md entry, SELF.md citations
// ---------------------------------------------------------------------

/** The digestion-completeness receipt REM appends before a shed
 * (MIND-SPEC "Compost Rules": what it taught, where the lesson now lives). */
export function taughtLine(content: string): string | null {
  for (const line of content.split("\n")) {
    if (/taught\s*->\s*absorbed-where/i.test(line)) return line.trim();
  }
  return null;
}

/** compost.md lines mentioning the episode file (entries open with the fixed
 * form "Composted: <what> — <why> — lesson lives at <where>"). */
export function compostEntriesFor(compostMd: string, filename: string): string[] {
  return compostMd
    .split("\n")
    .filter((l) => /composted:/i.test(l) && l.includes(filename))
    .map((l) => l.trim());
}

/** Every SELF.md line whose [ep:] stamps include this date — stamps are
 * normalized on BOTH sides so the malformed [ep:2026-07-6] is still found. */
export function selfLinesForDate(selfMd: string, date: string): string[] {
  const hits: string[] = [];
  for (const line of selfMd.split("\n")) {
    for (const m of line.matchAll(/\[ep:(\d{4}-\d{1,2}-\d{1,2})\]/g)) {
      if (normalizeDate(m[1]) === date) {
        hits.push(line.trim());
        break;
      }
    }
  }
  return hits;
}

/** For the miss message: the episode dates that exist, nearest-first when the
 * query itself was a date. */
export function nearestDates(records: EpisodeRecord[], q: ZoomQuery, limit = 5): string[] {
  const dates = [...new Set(records.map((r) => r.filename.slice(0, 10)))];
  if (q.kind === "date") {
    const target = Date.parse(q.date!);
    dates.sort((a, b) => Math.abs(Date.parse(a) - target) - Math.abs(Date.parse(b) - target));
  } else {
    dates.sort().reverse();
  }
  return dates.slice(0, limit);
}

// ---------------------------------------------------------------------
// render + main
// ---------------------------------------------------------------------

function dateOf(filename: string): string {
  return normalizeDate(filename.slice(0, 10)) ?? filename.slice(0, 10);
}

function renderMatch(r: EpisodeRecord, selfMd: string, compostMd: string): void {
  const label = r.composted ? `COMPOSTED (deleted in commit ${r.deletingCommit})` : "LIVE";
  console.log(`\n${"=".repeat(72)}`);
  console.log(`=== episodes/${r.filename} — ${label}`);
  console.log("=".repeat(72));
  console.log(r.content.trimEnd());

  const taught = taughtLine(r.content);
  console.log(`\n--- taught -> absorbed-where ---`);
  console.log(taught ?? "(none — not composted, or shed before the taught-line convention)");

  const compost = compostEntriesFor(compostMd, r.filename);
  console.log(`\n--- compost.md entry ---`);
  console.log(compost.length ? compost.join("\n") : "(no entry in the current compost window — it is a rolling log; git history is the archive)");

  const date = dateOf(r.filename);
  const cites = selfLinesForDate(selfMd, date);
  console.log(`\n--- SELF.md lines citing [ep:${date}] ---`);
  console.log(cites.length ? cites.join("\n") : "(no SELF.md line carries this date stamp)");
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const corr = correlation("zoom");
  if (args.length === 0) {
    console.error('usage: bun src/zoom.ts <query>   — a [ep:YYYY-MM-DD] stamp, a date, a filename, or a slug fragment');
    idle({
      process: "zoom", phase: "usage", correlation_id: corr,
      summary: "zoom invoked without a query — nothing to drill",
      context: { argv: process.argv.slice(2) },
    });
    process.exit(1);
  }

  const q = parseQuery(args.join(" "));
  const records = collectEpisodes(MIND_DIR);
  const matches = matchEpisodes(records, q);
  const selfMd = fs.existsSync(SELF_PATH) ? fs.readFileSync(SELF_PATH, "utf8") : "";
  const compostMd = fs.existsSync(COMPOST_PATH) ? fs.readFileSync(COMPOST_PATH, "utf8") : "";

  if (matches.length === 0) {
    const near = nearestDates(records, q);
    console.error(
      `zoom: no episode matches ${JSON.stringify(q.raw)} (normalized: ${q.kind === "date" ? q.date : q.needle}).\n` +
        `Searched ${records.length} episodes ever known to the mind ` +
        `(${records.filter((r) => !r.composted).length} live in episodes/, ` +
        `${records.filter((r) => r.composted).length} composted but recoverable from git history).\n` +
        `Nearest episode dates: ${near.join(", ") || "(none — the mind has no episodes yet)"}`
    );
    // A miss is a lookup result, not a fault: emit idle (context-bound, Law 9
    // satisfied) rather than fail() — fail() posts to the tower bus, and a
    // possible typo must not cry wolf there. Exit 1 so callers can branch.
    idle({
      process: "zoom", phase: "drill", correlation_id: corr,
      summary: `no episode matched ${JSON.stringify(q.raw)}`,
      context: { query: q.raw, kind: q.kind, normalized: q.kind === "date" ? q.date : q.needle, universe: records.length, nearest_dates: near },
    });
    process.exit(1);
  }

  console.log(
    `zoom: ${matches.length} match(es) for ${JSON.stringify(q.raw)} across ${records.length} episodes ever ` +
      `(${records.filter((r) => !r.composted).length} live, ${records.filter((r) => r.composted).length} composted-in-git)`
  );
  for (const m of matches) renderMatch(m, selfMd, compostMd);

  ok({
    process: "zoom", phase: "drill", correlation_id: corr,
    summary: `provenance drilled: ${matches.length} match(es) for ${JSON.stringify(q.raw)}`,
    context: {
      query: q.raw,
      kind: q.kind,
      normalized: q.kind === "date" ? q.date : q.needle,
      matches: matches.map((m) => ({ filename: m.filename, composted: m.composted, deleting_commit: m.deletingCommit ?? null })),
      universe: { total: records.length, live: records.filter((r) => !r.composted).length, composted: records.filter((r) => r.composted).length },
    },
  });
}

if (import.meta.main) await main();
