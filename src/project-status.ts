#!/usr/bin/env bun
/**
 * project-status.ts — portfolio-first wake framing (2026-08-16).
 *
 * Operator framing (not commit noise):
 *   1. Yesterday — what landed previous calendar day
 *   2. Last 7 days — what moved this week so far
 *   3. This week — what can / must be pushed forward
 *
 * Sources: ~/AGENTS.md Active projects (registry), mind/episodes/*.md,
 * NOW.md flight plan + live tensions, scoreboard.jsonl (last REM).
 * Optional commit digests (per-project git log) when callers supply them.
 *
 * Paused projects (e.g. Strudel) are excluded from the registry merge.
 */

import * as fs from "fs";
import * as path from "path";
import { homedir } from "os";
import { execFileSync } from "child_process";
import {
  queryIndex,
  type IndexData,
} from "./relindex.ts";
import type { ScoreEvent } from "./status.ts";

export const DAY_MS = 86_400_000;
export const WEEK_MS = 7 * DAY_MS;
export const PORTFOLIO_TOKEN_BUDGET = 800;

/** Slugs the operator has parked — never surface as active portfolio rows. */
export const PAUSED_SLUGS = new Set(["strudel", "strudel-evals", "evals"]);

export interface ProjectDef {
  slug: string;
  name: string;
  paths: string[];
  terms: string[];
}

export interface EpisodeRef {
  file: string;
  date: string | null;
  arc: string | null;
  text: string;
}

/** One landed unit — commit subject or episode arc. */
export interface LandedItem {
  project: string;
  day: string; // YYYY-MM-DD
  summary: string;
  kind: "commit" | "episode";
}

export interface PortfolioInput {
  projects: ProjectDef[];
  episodes: EpisodeRef[];
  /** Optional git subjects already gathered by the caller (path → lines). */
  commits?: { project: string; day: string; subject: string }[];
  index: IndexData | null;
  nowMd: string;
  scoreboard: ScoreEvent[];
  nowMs?: number;
}

export interface PortfolioSlice {
  block: string;
  reason: "rendered" | "no-projects" | "empty";
  yesterday: LandedItem[];
  last7: LandedItem[];
  forward: string[];
}

export function expandHome(p: string): string {
  const t = p.trim().replace(/^`|`$/g, "");
  if (t.startsWith("~/")) return path.join(homedir(), t.slice(2));
  return t;
}

export function parseActiveProjects(agentsMd: string): ProjectDef[] {
  const projects: ProjectDef[] = [];
  const lines = agentsMd.split("\n");
  let inTable = false;
  for (const line of lines) {
    if (/^##\s+Active projects\s*$/i.test(line.trim())) {
      inTable = true;
      continue;
    }
    if (inTable && /^##\s+/.test(line.trim()) && !/^##\s+Active projects/i.test(line.trim())) {
      break;
    }
    if (!inTable) continue;
    const row = line.match(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|/);
    if (!row) continue;
    const name = row[1].trim();
    const pathCell = row[2].trim();
    if (name === "Project" || name.startsWith("---")) continue;

    const paths = [...pathCell.matchAll(/`([^`]+)`/g)].map((m) => expandHome(m[1]));
    const slug = name
      .toLowerCase()
      .replace(/\([^)]*\)/g, "")
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const terms = new Set<string>([slug]);
    for (const p of paths) terms.add(path.basename(p).toLowerCase());
    for (const word of name.toLowerCase().split(/[^a-z0-9]+/)) {
      if (word.length >= 3) terms.add(word);
    }
    projects.push({ slug, name, paths, terms: [...terms] });
  }
  return projects;
}

export function houseProject(): ProjectDef {
  return {
    slug: "house",
    name: "House (agent-core / circadian)",
    paths: [path.join(homedir(), "agent-core"), path.join(homedir(), "circadian")],
    terms: ["house", "agent-core", "agent_core", "circadian", "herdr", "tup", "tower"],
  };
}

/** Registry minus paused slugs, house prepended. */
export function mergeProjects(parsed: ProjectDef[]): ProjectDef[] {
  const active = parsed.filter((p) => !PAUSED_SLUGS.has(p.slug) && ![...PAUSED_SLUGS].some((s) => p.slug.includes(s)));
  const house = houseProject();
  const slugs = new Set(active.map((p) => p.slug));
  return slugs.has("house") ? active : [house, ...active];
}

export function loadEpisodes(episodesDir: string): EpisodeRef[] {
  if (!fs.existsSync(episodesDir)) return [];
  const files = fs.readdirSync(episodesDir).filter((f) => f.endsWith(".md"));
  const out: EpisodeRef[] = [];
  for (const file of files) {
    try {
      const text = fs.readFileSync(path.join(episodesDir, file), "utf8");
      const date = text.match(/^date:\s*(.+)$/m)?.[1]?.trim() ?? null;
      const arc = text.match(/^arc:\s*(.+)$/m)?.[1]?.trim() ?? null;
      out.push({ file, date, arc, text });
    } catch {
      // skip
    }
  }
  return out;
}

function calendarDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function previousCalendarDay(nowMs: number): string {
  return calendarDay(nowMs - DAY_MS);
}

function parseDay(raw: string | null, fallbackFile?: string): string | null {
  const candidate = raw ?? fallbackFile?.slice(0, 10) ?? null;
  if (!candidate) return null;
  const ms = Date.parse(candidate.includes("T") ? candidate : `${candidate}T12:00:00.000Z`);
  return Number.isNaN(ms) ? null : calendarDay(ms);
}

function episodeMatchesProject(ep: EpisodeRef, def: ProjectDef): boolean {
  const hay = `${ep.arc ?? ""}\n${ep.text}`.toLowerCase();
  for (const term of def.terms) {
    if (term.length >= 3 && hay.includes(term)) return true;
  }
  for (const p of def.paths) {
    const frag = p.replace(homedir(), "~").toLowerCase();
    if (hay.includes(frag) || hay.includes(p.toLowerCase())) return true;
  }
  return false;
}

function matchProject(projects: ProjectDef[], hay: string): ProjectDef | null {
  const lower = hay.toLowerCase();
  for (const p of projects) {
    for (const term of p.terms) {
      if (term.length >= 3 && lower.includes(term)) return p;
    }
  }
  return null;
}

export function collectLanded(input: PortfolioInput): LandedItem[] {
  const items: LandedItem[] = [];

  for (const ep of input.episodes) {
    const day = parseDay(ep.date, ep.file);
    if (!day) continue;
    const proj = matchProject(input.projects, `${ep.arc ?? ""} ${ep.text}`) ??
      input.projects.find((p) => episodeMatchesProject(ep, p));
    if (!proj) continue;
    items.push({
      project: proj.name,
      day,
      summary: ep.arc ?? ep.file.replace(/\.md$/, ""),
      kind: "episode",
    });
  }

  for (const c of input.commits ?? []) {
    items.push({
      project: c.project,
      day: c.day,
      summary: c.subject,
      kind: "commit",
    });
  }

  // Newest first, dedupe identical summary+day+project
  const seen = new Set<string>();
  const deduped: LandedItem[] = [];
  for (const it of items.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))) {
    const key = `${it.project}|${it.day}|${it.summary}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(it);
  }
  return deduped;
}

export function extractFlightPlan(nowMd: string): string | null {
  const m = nowMd.match(/##\s*Flight plan\s*\n+([\s\S]*?)(?=\n##\s|\n*$)/i);
  if (!m) return null;
  const line = m[1]
    .split("\n")
    .map((l) => l.replace(/^[-*]\s*/, "").trim())
    .find((l) => l.length > 0);
  return line ?? null;
}

export function extractLiveTensions(nowMd: string): string[] {
  const m = nowMd.match(/##\s*Live tensions\s*\n+([\s\S]*?)(?=\n##\s|\n*$)/i);
  if (!m) return [];
  return m[1]
    .split("\n")
    .map((l) => l.replace(/^[-*]\s*/, "").trim())
    .filter((l) => l.length > 0);
}

export function latestRemSummary(scoreboard: ScoreEvent[]): string | null {
  for (let i = scoreboard.length - 1; i >= 0; i--) {
    const e = scoreboard[i];
    if (e.type !== "rem") continue;
    const day = e.ts.slice(0, 10);
    const parts: string[] = [day];
    if (e.self_changed === true) parts.push("SELF changed");
    else if (e.self_changed === false) parts.push("SELF flat");
    const motion = (e.stacked ?? 0) + (e.bumped ?? 0);
    if (motion > 0) parts.push(`${motion} atoms moved`);
    else if (e.propagated?.length) parts.push(`${e.propagated.length} propagated`);
    return parts.join(" · ");
  }
  return null;
}

function formatLanded(it: LandedItem): string {
  return `- **${it.project}** (${it.day}): ${it.summary}`;
}

function buildForward(input: PortfolioInput, last7: LandedItem[]): string[] {
  const forward: string[] = [];
  const roadmap = extractFlightPlan(input.nowMd);
  if (roadmap) forward.push(roadmap);
  for (const t of extractLiveTensions(input.nowMd)) forward.push(t);

  // Unfinished arcs from the last 7 days that aren't already in forward text
  const seen = new Set(forward.map((f) => f.toLowerCase()));
  for (const it of last7) {
    const key = it.summary.toLowerCase();
    if (seen.has(key)) continue;
    // Episodes named as framing / tests / hi are noise for forward
    if (/^(hi|model|test)\b/i.test(it.summary)) continue;
    forward.push(`Continue: ${it.project} — ${it.summary}`);
    seen.add(key);
    if (forward.length >= 6) break;
  }
  return forward;
}

/** Render yesterday / last-7 / this-week-forward portfolio block. */
export function renderPortfolio(input: PortfolioInput): PortfolioSlice {
  if (input.projects.length === 0) {
    return { block: "", reason: "no-projects", yesterday: [], last7: [], forward: [] };
  }

  const nowMs = input.nowMs ?? Date.now();
  const yesterdayDay = previousCalendarDay(nowMs);
  const weekStart = calendarDay(nowMs - WEEK_MS);

  const all = collectLanded(input);
  const yesterday = all.filter((i) => i.day === yesterdayDay);
  const last7 = all.filter((i) => i.day >= weekStart && i.day <= calendarDay(nowMs));
  const forward = buildForward(input, last7);

  const lines: string[] = [
    "<mind:portfolio>",
    "Portfolio — yesterday / last 7 days / this week forward.",
    "",
  ];

  lines.push("**Yesterday**");
  if (yesterday.length === 0) lines.push("- (nothing recorded)");
  else lines.push(...yesterday.slice(0, 8).map(formatLanded));
  lines.push("");

  lines.push("**Last 7 days**");
  if (last7.length === 0) lines.push("- (nothing recorded)");
  else lines.push(...last7.slice(0, 12).map(formatLanded));
  lines.push("");

  lines.push("**This week — push forward**");
  if (forward.length === 0) lines.push("- [UNKNOWN] — no flight plan or live tensions");
  else lines.push(...forward.map((f) => `- ${f}`));
  lines.push("");

  const rem = latestRemSummary(input.scoreboard);
  if (rem) {
    lines.push("**Memory**", `- last REM: ${rem}`, "");
  }

  // Active projects (paused excluded) — one-line presence
  const activeNames = input.projects.map((p) => p.name).join("; ");
  lines.push("**Active**", `- ${activeNames}`, "");
  lines.push("</mind:portfolio>");

  let block = lines.join("\n").replace(/\n{3,}/g, "\n\n");
  if (Math.ceil(block.length / 4) > PORTFOLIO_TOKEN_BUDGET) {
    block = block.slice(0, PORTFOLIO_TOKEN_BUDGET * 4) + "…\n</mind:portfolio>";
  }

  return { block, reason: "rendered", yesterday, last7, forward };
}

/** Best-effort git log digest for a project path (Law 7: failure → empty). */
export function gitDigest(projectPath: string, sinceDays = 7): { day: string; subject: string }[] {
  try {
    if (!fs.existsSync(projectPath)) return [];
    const out = execFileSync(
      "git",
      ["-C", projectPath, "log", `--since=${sinceDays} days ago`, "--format=%ad|%s", "--date=short"],
      { encoding: "utf8", timeout: 5000 },
    );
    return out
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [day, ...rest] = line.split("|");
        return { day, subject: rest.join("|") };
      });
  } catch {
    return [];
  }
}

export function renderPortfolioFromMind(opts: {
  circadianHome: string;
  agentsMdPath?: string;
  index?: IndexData | null;
  scoreboard?: ScoreEvent[];
  nowMs?: number;
  includeGit?: boolean;
}): PortfolioSlice {
  const mind = path.join(opts.circadianHome, "mind");
  const agentsPath = opts.agentsMdPath ?? path.join(homedir(), "AGENTS.md");
  let agentsMd = "";
  try {
    agentsMd = fs.readFileSync(agentsPath, "utf8");
  } catch {
    return { block: "", reason: "no-projects", yesterday: [], last7: [], forward: [] };
  }

  const projects = mergeProjects(parseActiveProjects(agentsMd));
  const episodes = loadEpisodes(path.join(mind, "episodes"));
  let nowMd = "";
  try {
    nowMd = fs.readFileSync(path.join(mind, "NOW.md"), "utf8");
  } catch {
    nowMd = "";
  }

  let scoreboard = opts.scoreboard ?? [];
  if (scoreboard.length === 0) {
    try {
      const raw = fs.readFileSync(path.join(mind, "scoreboard.jsonl"), "utf8");
      for (const line of raw.split("\n")) {
        if (!line.trim()) continue;
        try {
          scoreboard.push(JSON.parse(line));
        } catch {
          // skip
        }
      }
    } catch {
      scoreboard = [];
    }
  }

  const commits: PortfolioInput["commits"] = [];
  if (opts.includeGit !== false) {
    for (const p of projects) {
      for (const projPath of p.paths) {
        for (const c of gitDigest(projPath, 7)) {
          commits.push({ project: p.name, day: c.day, subject: c.subject });
        }
      }
    }
  }

  // Touch index so the import stays load-bearing when wake passes it
  if (opts.index) {
    for (const p of projects.slice(0, 1)) {
      queryIndex(opts.index, p.terms.slice(0, 3).join(" "), { k: 1 });
    }
  }

  return renderPortfolio({
    projects,
    episodes,
    commits,
    index: opts.index ?? null,
    nowMd,
    scoreboard,
    nowMs: opts.nowMs,
  });
}
