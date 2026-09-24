#!/usr/bin/env bun
/** Read-only importer for the entity-frontmatter dialect of BELIEF-INTERCHANGE.md. */
import * as fs from "node:fs";
import * as path from "node:path";
import { tmpdir } from "node:os";
import { atomId, parseAtom, serializeAtom, type Atom, type AtomKind } from "./atoms.ts";
import { normalizeForQuoteMatch } from "./stack.ts";
import { degraded } from "./obs.ts";

export interface Rejection { file: string; fact: number | null; reason: string }
const SECTIONS = ["people", "orgs", "workstreams", "preferences"];
const KINDS = ["identity", "doctrine", "motif", "agreement"];
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

/** Emit rejections with their exact source/fact and a concrete recovery action.
 * When no home is configured, keep telemetry in an isolated temp directory,
 * never in a real installation. */
function reject(r: Rejection, onReject?: (r: Rejection) => void): void {
  if (!process.env.CIRCADIAN_HOME) process.env.CIRCADIAN_HOME = fs.mkdtempSync(path.join(tmpdir(), "interchange-obs-"));
  degraded({
    process: "atoms", phase: "foreign-read", summary: `rejected ${r.file}${r.fact === null ? "" : ` fact ${r.fact}`}`,
    context: { file: r.file, fact: r.fact, reason: r.reason },
    cause: r.reason, next_action: `inspect ${r.file} and its cited source; correct the evidence or omit this fact`,
  });
  onReject?.(r);
}

/** Paths are relative to the foreign store; do not allow evidence to escape it. */
function sourceText(root: string, source: string): string {
  if (path.isAbsolute(source)) throw new Error("absolute source path");
  const target = path.resolve(root, source);
  if (!target.startsWith(root + path.sep)) throw new Error("source outside store");
  const base = fs.realpathSync(root);
  const real = fs.realpathSync(target);
  if (!real.startsWith(base + path.sep)) throw new Error("source outside store");
  if (!fs.statSync(real).isFile()) throw new Error("source is not a file");
  return fs.readFileSync(real, "utf8");
}

function convert(root: string, fact: unknown): Atom {
  if (!object(fact)) throw new Error("fact is not a mapping");
  const { kind, claim, why, sources, id } = fact;
  if (!KINDS.includes(kind as string)) throw new Error("missing or invalid kind");
  if (!nonempty(claim) || claim.length > 280) throw new Error("missing or oversized claim");
  if (!nonempty(why)) throw new Error("missing why");
  if (id !== undefined && id !== atomId(claim)) throw new Error("stored id disagrees with claim");
  if (!Array.isArray(sources) || !sources.length) throw new Error("no sources with quotes");
  const quotes: Atom["quotes"] = [];
  const eps: string[] = [];
  for (const source of sources) {
    if (!object(source) || !nonempty(source.path)) throw new Error("missing source path");
    if (!nonempty(source.quote)) throw new Error("missing verbatim quote");
    if (!nonempty(source.timestamp) || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(source.timestamp))
      throw new Error("missing source origin date");
    let text: string;
    try { text = sourceText(root, source.path); }
    catch (err) { throw new Error(`unreadable source ${source.path}: ${(err as Error).message}`); }
    if (!normalizeForQuoteMatch(text).includes(normalizeForQuoteMatch(source.quote)))
      throw new Error(`counterfeit quote: not verbatim in ${source.path}`);
    quotes.push({ text: source.quote, source: source.path });
    eps.push(source.timestamp.slice(0, 10));
  }
  // Reuse the native atom's shape and id computation; no write or ledger event.
  return parseAtom(serializeAtom({ kind: kind as AtomKind, claim, why, quotes, eps: [...new Set(eps)] }));
}

/** Scan known entity directories deterministically; each bad fact is rejected
 * independently, so good facts in the same file can still be read. */
export function parseForeign(store: string, onReject?: (r: Rejection) => void): Atom[] {
  const atoms: Atom[] = [];
  const root = path.resolve(store);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    reject({ file: root, fact: null, reason: "foreign store directory not found" }, onReject);
    return atoms;
  }
  for (const section of SECTIONS) {
    const dir = path.join(root, "memory", section);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir).filter((n) => n.endsWith(".md")).sort()) {
      const file = path.join("memory", section, name);
      try {
        const md = fs.readFileSync(path.join(root, file), "utf8");
        const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(md);
        if (!match) throw new Error("missing YAML frontmatter");
        const frontmatter: unknown = Bun.YAML.parse(match[1]);
        if (!object(frontmatter) || !Array.isArray(frontmatter.facts)) throw new Error("missing facts sequence");
        frontmatter.facts.forEach((fact, index) => {
          try { atoms.push(convert(root, fact)); }
          catch (err) { reject({ file, fact: index + 1, reason: (err as Error).message }, onReject); }
        });
      } catch (err) {
        reject({ file, fact: null, reason: (err as Error).message }, onReject);
      }
    }
  }
  return atoms;
}

if (import.meta.main) {
  if (process.argv.length !== 3) {
    process.stderr.write("usage: bun src/interchange.ts <foreign-store>\n");
    process.exitCode = 1;
  } else {
    const rejections: Rejection[] = [];
    const atoms = parseForeign(process.argv[2], (r) => rejections.push(r));
    for (const atom of atoms) console.log(`${atom.id} ${atom.claim}`);
    for (const r of rejections) console.log(`rejected ${r.file}${r.fact === null ? "" : ` fact ${r.fact}`}: ${r.reason}`);
    console.log(`${atoms.length} atoms, ${rejections.length} rejections`);
  }
}
