#!/usr/bin/env bun
/**
 * render.ts — the render (popmem WS-B, docs/POPULATION-MEMORY.md §7 R4,
 * templates/MIND-SPEC.md "The render"): `SELF.md = fold(beliefs/,
 * ledger)`. Deterministic, byte-identical for identical inputs — no clock,
 * no LLM, no randomness anywhere in `renderSelf`. The model never composes
 * this document (five sentences, #5); it only ever compares atoms upstream,
 * in the stacker (WS-C).
 *
 * Four v1 SELF.md sections survive unchanged (templates/MIND-SPEC.md "File
 * Formats"), now folded by kind instead of hand-edited: "Who I am across
 * sessions" (identity), "Doctrine" (doctrine), "Motifs" (motif), "How we
 * work" (agreement). v1's token targets become render budgets (Law 4 lives
 * on): selection within a section walks weight-desc (tiebreak id lex asc)
 * and STOPS at the first atom whose line would push the section over
 * budget — that atom, and every smaller one that would have fit after it,
 * are both left out. Atom text is never truncated (R4); an atom either
 * renders whole or not at all this pass (its file persists regardless —
 * defocus, never delete).
 *
 * Manifest addressing: rem.ts's enumerateInjectedItems (src/rem.ts) walks a
 * rendered SELF.md line-by-line and assigns `SELF.Doctrine[n]` /
 * `SELF.Motifs[n]` to the nth non-blank line under those two headings —
 * that is how scoreboard `propagated` entries get attributed. Every atom
 * entry this module renders is exactly ONE physical line (embedded
 * whitespace in claim/quote text is collapsed), so the nth atom selected
 * into a section IS the nth non-blank line rem.ts would find there — the
 * manifest this module returns is therefore addressing-compatible with
 * rem.ts by construction, not by coincidence. rem.ts only enumerates
 * Doctrine/Motifs today, so `SELF.WhoIAm[n]` / `SELF.HowWeWork[n]` are this
 * module's own addressing for the other two sections — real addresses in
 * the same format, just not yet consumed by rem.ts.
 */

import * as fs from "fs";
import * as path from "path";
import { type Atom, type AtomKind, type AtomState, readAtoms, readLedger, foldWeights } from "./atoms.ts";
import { ok, degraded, fail, correlation } from "./obs.ts";

// ---------------------------------------------------------------------
// budgets — v1 token targets, now per-section render budgets (knobs)
// ---------------------------------------------------------------------

export interface RenderBudgets {
  identity: number;
  doctrine: number;
  motif: number;
  agreement: number;
}

export const DEFAULT_BUDGETS: RenderBudgets = { identity: 600, doctrine: 3400, motif: 800, agreement: 1200 };
export const RENDER_FLOOR = 0.5;

/** chars/4 = tokens (MIND-SPEC.md "Token Targets"), matching status.ts/rem.ts/wake.ts. */
function tokensOf(s: string): number {
  return Math.ceil(s.length / 4);
}

function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------
// section table — kind <-> v1 heading <-> manifest address prefix
// ---------------------------------------------------------------------

interface SectionSpec {
  kind: AtomKind;
  heading: string;
  addressPrefix: string;
}

const SECTIONS: SectionSpec[] = [
  { kind: "identity", heading: "Who I am across sessions", addressPrefix: "SELF.WhoIAm" },
  { kind: "doctrine", heading: "Doctrine", addressPrefix: "SELF.Doctrine" },
  { kind: "motif", heading: "Motifs", addressPrefix: "SELF.Motifs" },
  { kind: "agreement", heading: "How we work", addressPrefix: "SELF.HowWeWork" },
];

function weightOf(states: Map<string, AtomState>, id: string): { weight: number; status: string } {
  const s = states.get(id);
  return s ? { weight: s.weight, status: s.status } : { weight: 0, status: "active" };
}

/** One atom, one physical line: claim, its quote(s) verbatim, its [ep:]
 * stamps — the exact content the spec calls "claim + strongest telling".
 * Embedded whitespace/newlines in free-text fields are collapsed so the
 * one-atom-one-line invariant (see module header) always holds. */
function renderAtomLine(a: Atom): string {
  const claim = collapse(a.claim);
  const quotes = a.quotes.map((q) => `"${collapse(q.text)}" (${q.source})`).join("; ");
  const eps = a.eps.map((e) => `[ep:${e}]`).join(" ");
  return `**${claim}** — ${quotes} ${eps}`.trim();
}

// ---------------------------------------------------------------------
// renderSelf — pure, deterministic
// ---------------------------------------------------------------------

export interface RenderManifestEntry {
  address: string;
  atom: string;
}

export interface RenderResult {
  md: string;
  manifest: RenderManifestEntry[];
}

export function renderSelf(
  atoms: Atom[],
  states: Map<string, AtomState>,
  budgets?: Partial<RenderBudgets>
): RenderResult {
  const merged: RenderBudgets = { ...DEFAULT_BUDGETS, ...budgets };
  const manifest: RenderManifestEntry[] = [];
  const parts: string[] = [];

  for (const section of SECTIONS) {
    const eligible = atoms.filter((a) => {
      if (a.kind !== section.kind) return false;
      const { weight, status } = weightOf(states, a.id);
      return status === "active" && weight >= RENDER_FLOOR;
    });
    eligible.sort((a, b) => {
      const wa = weightOf(states, a.id).weight;
      const wb = weightOf(states, b.id).weight;
      if (wa !== wb) return wb - wa; // weight desc
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; // tiebreak: id lex asc
    });

    const budget = merged[section.kind];
    const selectedLines: string[] = [];
    let used = 0;
    for (const atom of eligible) {
      const line = renderAtomLine(atom);
      const cost = tokensOf(line);
      // Stop entirely at the first overflow — a later, smaller atom is NOT
      // pulled in past it (documented in the module header).
      if (used + cost > budget) break;
      selectedLines.push(line);
      used += cost;
      manifest.push({ address: `${section.addressPrefix}[${selectedLines.length}]`, atom: atom.id });
    }

    parts.push(`## ${section.heading}`);
    parts.push("");
    parts.push(selectedLines.length > 0 ? selectedLines.join("\n\n") : "(empty — no atoms above the render floor yet)");
    parts.push("");
  }

  const md = parts.join("\n").replace(/\n+$/, "") + "\n";
  return { md, manifest };
}

// ---------------------------------------------------------------------
// CLI — folds live state and writes SELF.md + manifest JSON
// ---------------------------------------------------------------------

function flagValue(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx === -1 ? undefined : args[idx + 1];
}

async function main() {
  const args = process.argv.slice(2);
  const corr = correlation("render");

  const beliefsDir = flagValue(args, "--beliefs");
  const ledgerPath = flagValue(args, "--ledger");
  const outPath = flagValue(args, "--out");
  const manifestPath = flagValue(args, "--manifest");

  if (!beliefsDir || !ledgerPath || !outPath || !manifestPath) {
    console.error("usage: bun src/render.ts --beliefs <dir> --ledger <path> --out <selfPath> --manifest <manifestPath>");
    fail({
      process: "render",
      phase: "usage",
      correlation_id: corr,
      summary: "render invoked without all required flags",
      context: { argv: args },
      cause: "missing one of --beliefs/--ledger/--out/--manifest",
      next_action: "re-run with all four flags set",
    });
  }

  let allFiles: string[] = [];
  try {
    allFiles = fs.readdirSync(beliefsDir).filter((f) => f.endsWith(".md"));
  } catch {
    allFiles = [];
  }
  const atoms = readAtoms(beliefsDir);
  const skippedUnparseable = allFiles.length - atoms.length;

  const events = readLedger(ledgerPath);
  const states = foldWeights(events);
  const { md, manifest } = renderSelf(atoms, states);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, md);
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  const sankBelowFloor = atoms.filter((a) => {
    const { weight, status } = weightOf(states, a.id);
    return status === "active" && weight < RENDER_FLOOR;
  }).length;

  const context = {
    population: atoms.length,
    rendered: manifest.length,
    sank_below_floor: sankBelowFloor,
    skipped_unparseable: skippedUnparseable,
  };

  if (skippedUnparseable > 0) {
    degraded({
      process: "render",
      phase: "render",
      correlation_id: corr,
      summary: `render completed with ${skippedUnparseable} unparseable atom file(s) skipped`,
      context,
      cause: `${skippedUnparseable} file(s) in ${beliefsDir} failed parseAtom or had a filename/id mismatch`,
      next_action: `inspect ${beliefsDir} for malformed atom files; re-run bun src/render.ts after fixing or removing them`,
    });
  } else {
    ok({
      process: "render",
      phase: "render",
      correlation_id: corr,
      summary: `SELF.md rendered: ${manifest.length}/${atoms.length} atoms above floor, written to ${outPath}`,
      context,
    });
  }
}

if (import.meta.main) await main();
