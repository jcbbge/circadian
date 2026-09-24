#!/usr/bin/env bun
/** Stratigraphy is a read-only fold over append order, independent of weight.
 * Each distinct stack episode after an atom's last surface event adds one
 * stratum. Repeated stacks within an episode count once; potentiation brings
 * an atom back to the surface without changing its immutable file or weight.
 */
import type { LedgerEvent } from "./atoms.ts";

export const STRATA_HOT = 40;

export interface Stratum {
  depth: number;
  lastStack: string | null;
  lastStackDate: string | null;
}

/** A shared episode is counted once globally, even if its stacks are not
 * adjacent. Episode order is first appearance in the append-only ledger. */
export function foldStrata(events: LedgerEvent[]): Map<string, Stratum> {
  const seen = new Set<string>();
  const out = new Map<string, Stratum>();
  const lastStack = new Map<string, { ep: string; date: string | null }>();
  // Reverse traversal counts distinct *later* episodes, not timestamps or
  // events. Remember the most recent stack separately for potentiated atoms.
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev.ev === "stack" && typeof ev.atom === "string" && typeof ev.ep === "string" && ev.ep) {
      if (!lastStack.has(ev.atom)) lastStack.set(ev.atom, { ep: ev.ep,
        date: /^\d{4}-\d{2}-\d{2}/.exec(ev.ep)?.[0] ?? (/^\d{4}-\d{2}-\d{2}/.exec(ev.ts)?.[0] ?? null) });
      if (!out.has(ev.atom)) out.set(ev.atom, {
        depth: seen.size - (seen.has(ev.ep) ? 1 : 0),
        lastStack: lastStack.get(ev.atom)!.ep, lastStackDate: lastStack.get(ev.atom)!.date,
      });
      seen.add(ev.ep);
    } else if (ev.ev === "potentiate" && typeof ev.atom === "string" && ev.atom && !out.has(ev.atom)) {
      out.set(ev.atom, { depth: seen.size, lastStack: null, lastStackDate: null });
    }
  }
  for (const [id, s] of out) {
    const last = lastStack.get(id);
    if (last) { s.lastStack = last.ep; s.lastStackDate = last.date; }
  }
  return out;
}

/** Invalid overrides fail loudly rather than silently changing the hot tier. */
export function hotLimit(value = process.env.STRATA_HOT): number {
  if (value === undefined || value === "") return STRATA_HOT;
  if (value === "∞" || value === "Infinity") return Infinity;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error("STRATA_HOT must be a nonnegative integer or Infinity");
  return n;
}
