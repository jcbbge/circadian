#!/usr/bin/env bun
/**
 * atoms.ts — the atom store (popmem WS-B, docs/POPULATION-MEMORY.md §7 R1-R3,
 * templates/MIND-SPEC.md "The atom" + "The ledger").
 *
 * Beliefs are immutable weighted atoms (five sentences, #1). A belief file
 * (`mind/beliefs/<id>.md`) is written once and never edited again — weight
 * lives entirely outside the file, in the append-only ledger
 * (`mind/beliefs.jsonl`, the digested.jsonl pattern: malformed lines are
 * skipped, never fatal). Identity is content: `id` is the first 12 hex chars
 * of sha256(claim, whitespace-normalized), so stacking an already-held
 * belief is a weight bump, never a second file — merge-then-readd is
 * INEXPRESSIBLE at this layer (R2).
 *
 * The atom's shape is fixed and rejected structurally, never by validator
 * prose (R3): a missing or malformed slot throws AtomShapeError with a short
 * reason code, nothing more. `parseAtom` recomputes `id` from the claim on
 * every read — the filename on disk is never trusted; `readAtoms` rejects a
 * file whose name disagrees with its own recomputed id.
 *
 * Everything here is pure and silent on purpose (no obs.ts calls): parse and
 * fold are library functions, not processes. The CLI/write layer that calls
 * these (render.ts) is where Law 9 events belong.
 */

import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";

// ---------------------------------------------------------------------
// types
// ---------------------------------------------------------------------

export type AtomKind = "identity" | "doctrine" | "motif" | "agreement";

export interface Atom {
  id: string;
  kind: AtomKind;
  claim: string;
  why: string;
  quotes: { text: string; source: string }[];
  eps: string[];
}

export interface LedgerEvent {
  ev: "stack" | "decay" | "potentiate" | "supersede" | "renorm";
  ts: string;
  atom?: string;
  ep?: string;
  /** fractional deposit multiplier for a stack event (flash exposures).
   * Absent => 1 (full weight). Stack stays the decay-eligibility event
   * regardless of grain. */
  grain?: number;
  factor?: number;
  winner?: string;
  loser?: string;
  target?: number;
}

export interface AtomState {
  weight: number;
  status: "active" | string; // "superseded-by:<id>" when superseded
}

export class AtomShapeError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "AtomShapeError";
  }
}

const KINDS: readonly AtomKind[] = ["identity", "doctrine", "motif", "agreement"];
const EP_LINE_RE = /^\[ep:(\d{4}-\d{2}-\d{2})\]$/;
const CLAIM_MAX_CHARS = 280;

// ---------------------------------------------------------------------
// id — identity is content
// ---------------------------------------------------------------------

/** first 12 hex chars of sha256(claim, whitespace-normalized) */
export function atomId(claim: string): string {
  const normalized = claim.trim().replace(/\s+/g, " ");
  return createHash("sha256").update(normalized, "utf8").digest("hex").slice(0, 12);
}

// ---------------------------------------------------------------------
// serialize / parse — canonical, byte-stable, strict field order
// ---------------------------------------------------------------------

/** Scans a leading JSON string token off `s` (handles backslash escapes),
 * returning its parsed value and whatever text follows it. Free-text fields
 * (claim/why/quote) are stored JSON-encoded on their line so embedded
 * quotes, colons, and separators are never ambiguous with the line format. */
function readLeadingJsonString(s: string): { value: string; rest: string } {
  if (s[0] !== '"') throw new AtomShapeError("expected quoted string");
  let i = 1;
  while (i < s.length) {
    if (s[i] === "\\") {
      i += 2;
      continue;
    }
    if (s[i] === '"') {
      i += 1;
      break;
    }
    i += 1;
  }
  if (s[i - 1] !== '"') throw new AtomShapeError("unterminated quoted string");
  const token = s.slice(0, i);
  let value: string;
  try {
    value = JSON.parse(token);
  } catch {
    throw new AtomShapeError("malformed quoted string");
  }
  return { value, rest: s.slice(i) };
}

/** Canonical markdown for an atom, minus its (derived) id. Deterministic:
 * identical input produces identical bytes, always. Field order is fixed —
 * kind, claim, why, quote(s), [ep:] stamp(s), one per line, LF, trailing
 * newline — and `parseAtom` requires exactly this order (shape rejection,
 * not tolerant parsing). */
export function serializeAtom(a: Omit<Atom, "id">): string {
  const lines: string[] = [];
  lines.push(`kind: ${a.kind}`);
  lines.push(`claim: ${JSON.stringify(a.claim)}`);
  lines.push(`why: ${JSON.stringify(a.why)}`);
  for (const q of a.quotes) lines.push(`quote: ${JSON.stringify(q.text)} | ${q.source}`);
  for (const ep of a.eps) lines.push(`[ep:${ep}]`);
  return lines.join("\n") + "\n";
}

/** Parses canonical atom markdown, recomputing `id` from the claim — the id
 * is NEVER trusted from anywhere but the claim text itself. Throws
 * AtomShapeError (short reason, no prose) on any missing or malformed slot:
 * bad/missing kind, missing/oversized claim, missing why, zero quotes, a
 * quote without a source, zero [ep:] stamps, or a malformed [ep:] date. */
export function parseAtom(md: string): Atom {
  const lines = md.split("\n");
  if (lines[lines.length - 1] !== "") throw new AtomShapeError("missing trailing newline");
  lines.pop();
  let i = 0;

  const kindLine = lines[i++];
  if (kindLine === undefined || !kindLine.startsWith("kind: ")) throw new AtomShapeError("missing kind");
  const kind = kindLine.slice("kind: ".length) as AtomKind;
  if (!KINDS.includes(kind)) throw new AtomShapeError("bad kind");

  const claimLine = lines[i++];
  if (claimLine === undefined || !claimLine.startsWith("claim: ")) throw new AtomShapeError("missing claim");
  let claim: string;
  try {
    claim = JSON.parse(claimLine.slice("claim: ".length));
  } catch {
    throw new AtomShapeError("malformed claim");
  }
  if (!claim) throw new AtomShapeError("empty claim");
  if (claim.length > CLAIM_MAX_CHARS) throw new AtomShapeError("claim exceeds 280 chars");

  const whyLine = lines[i++];
  if (whyLine === undefined || !whyLine.startsWith("why: ")) throw new AtomShapeError("missing why");
  let why: string;
  try {
    why = JSON.parse(whyLine.slice("why: ".length));
  } catch {
    throw new AtomShapeError("malformed why");
  }
  if (!why) throw new AtomShapeError("empty why");

  const quotes: { text: string; source: string }[] = [];
  while (i < lines.length && lines[i].startsWith("quote: ")) {
    const rest0 = lines[i].slice("quote: ".length);
    const { value, rest } = readLeadingJsonString(rest0);
    if (!rest.startsWith(" | ")) throw new AtomShapeError("quote missing source");
    const source = rest.slice(3);
    if (!source) throw new AtomShapeError("quote missing source");
    quotes.push({ text: value, source });
    i++;
  }
  if (quotes.length === 0) throw new AtomShapeError("no quote");

  const eps: string[] = [];
  while (i < lines.length) {
    const m = EP_LINE_RE.exec(lines[i]);
    if (!m) throw new AtomShapeError("malformed [ep:] stamp");
    eps.push(m[1]);
    i++;
  }
  if (eps.length === 0) throw new AtomShapeError("no [ep:] stamp");

  return { id: atomId(claim), kind, claim, why, quotes, eps };
}

// ---------------------------------------------------------------------
// store — one file per belief, never edited after write
// ---------------------------------------------------------------------

/** Writes a new atom file. Immutability is physical: `created: false` (and
 * NO write — the existing file's bytes are left untouched) if the file
 * already exists. Validates shape before writing (round-trips through
 * parseAtom(serializeAtom(a)); an AtomShapeError propagates to the caller
 * rather than ever landing a malformed atom on disk. */
export function writeAtom(beliefsDir: string, a: Omit<Atom, "id">): { id: string; path: string; created: boolean } {
  const md = serializeAtom(a);
  const parsed = parseAtom(md); // throws AtomShapeError on any malformed slot
  fs.mkdirSync(beliefsDir, { recursive: true });
  const filePath = path.join(beliefsDir, `${parsed.id}.md`);
  try {
    fs.writeFileSync(filePath, md, { flag: "wx" }); // exclusive create: atomic never-overwrite
    return { id: parsed.id, path: filePath, created: true };
  } catch (err: any) {
    if (err && err.code === "EEXIST") return { id: parsed.id, path: filePath, created: false };
    throw err;
  }
}

/** Reads every atom file in `beliefsDir`, sorted by id. A file that fails to
 * parse, OR whose filename disagrees with the id recomputed from its own
 * claim, is silently skipped (the digested.jsonl pattern — never fatal;
 * this is a pure read, so Law 9 events belong to the caller, not here). */
export function readAtoms(beliefsDir: string): Atom[] {
  let files: string[];
  try {
    files = fs.readdirSync(beliefsDir).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }
  const atoms: Atom[] = [];
  for (const f of files) {
    let content: string;
    try {
      content = fs.readFileSync(path.join(beliefsDir, f), "utf8");
    } catch {
      continue;
    }
    let atom: Atom;
    try {
      atom = parseAtom(content);
    } catch {
      continue;
    }
    if (f !== `${atom.id}.md`) continue; // id is never trusted from disk
    atoms.push(atom);
  }
  atoms.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return atoms;
}

// ---------------------------------------------------------------------
// ledger — append-only, weight is never stored, only fold(ledger)
// ---------------------------------------------------------------------

/** Reads every event in the ledger; a malformed line is skipped, never
 * fatal (the digested.jsonl pattern) — order is preserved, which matters,
 * because fold semantics are append-order, not ts-sorted. */
export function readLedger(ledgerPath: string): LedgerEvent[] {
  let raw: string;
  try {
    raw = fs.readFileSync(ledgerPath, "utf8");
  } catch {
    return [];
  }
  const events: LedgerEvent[] = [];
  for (const line of raw.split("\n")) {
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

export function appendLedger(ledgerPath: string, ev: LedgerEvent): void {
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.appendFileSync(ledgerPath, JSON.stringify(ev) + "\n");
}

// ---------------------------------------------------------------------
// fold — pure, deterministic, position order (not ts-sort) is truth
// ---------------------------------------------------------------------

/** Folds the ledger into a weight/status per atom id. Pure — no clock, no
 * I/O. Semantics (templates/MIND-SPEC.md "The ledger"):
 *   - weight starts at 0 for every atom.
 *   - `stack{atom, grain?}`: weight +1, or +`grain` when present (flash
 *     exposures deposit at fractional grain; absent grain = 1). Also the
 *     ONLY event that makes an atom
 *     eligible for `decay` (an atom stacked after a decay event in the
 *     ledger is unaffected by that earlier decay — "decay-before-birth").
 *   - `potentiate{atom}`: weight +1. Does NOT by itself make an atom
 *     decay-eligible (only `stack` does, per spec).
 *   - `decay{factor}`: multiplies the weight of every atom with at least
 *     one PRIOR `stack` event (by ledger position, not timestamp).
 *   - `supersede{winner,loser}`: loser's current weight transfers to
 *     winner; loser's weight becomes 0 and its status becomes
 *     `superseded-by:<winner>`.
 *   - `renorm{target}`: homeostatic ceiling (synaptic scaling). If the
 *     total weight of active atoms exceeds `target`, every active atom's
 *     weight scales by `target / total`. Never scales UP — a young sparse
 *     mind is untouched. Uniform within one event (rank order preserved);
 *     the competitive pressure is the interaction with stack/potentiate:
 *     new earnings are worth relatively more when the total is capped.
 *     A missing or non-positive `target` makes the event a no-op (the
 *     malformed-line tolerance, applied at fold level).
 * Events are processed strictly in array order — append order is truth. */
export function foldWeights(events: LedgerEvent[]): Map<string, AtomState> {
  const states = new Map<string, AtomState>();
  const everStacked = new Set<string>();

  function ensure(id: string): AtomState {
    let s = states.get(id);
    if (!s) {
      s = { weight: 0, status: "active" };
      states.set(id, s);
    }
    return s;
  }

  for (const ev of events) {
    switch (ev.ev) {
      case "stack": {
        if (!ev.atom) break;
        ensure(ev.atom).weight += ev.grain ?? 1; // absent grain = full weight (backward compatible)
        everStacked.add(ev.atom);
        break;
      }
      case "potentiate": {
        if (!ev.atom) break;
        ensure(ev.atom).weight += 1;
        break;
      }
      case "decay": {
        const factor = ev.factor ?? 0.95;
        for (const id of everStacked) {
          const s = states.get(id);
          if (s) s.weight *= factor;
        }
        break;
      }
      case "supersede": {
        if (!ev.winner || !ev.loser) break;
        const winner = ensure(ev.winner);
        const loser = ensure(ev.loser);
        winner.weight += loser.weight;
        loser.weight = 0;
        loser.status = `superseded-by:${ev.winner}`;
        break;
      }
      case "renorm": {
        const target = ev.target;
        if (typeof target !== "number" || !Number.isFinite(target) || target <= 0) break;
        let total = 0;
        for (const s of states.values()) if (s.status === "active") total += s.weight;
        if (total <= target) break; // ceiling, not a thermostat: never scale up
        const scale = target / total;
        for (const s of states.values()) if (s.status === "active") s.weight *= scale;
        break;
      }
    }
  }
  return states;
}
