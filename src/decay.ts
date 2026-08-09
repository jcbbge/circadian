#!/usr/bin/env bun
/**
 * decay.ts — nightly multiply + propagation re-potentiation (popmem WS-D,
 * docs/POPULATION-MEMORY.md §7 R6/R9/R10, templates/MIND-SPEC.md
 * "The ledger" + "The REM payload").
 *
 * Forgetting is a nightly multiply (five sentences, #3): one run appends
 * exactly one `{ev:"decay", factor:0.95}` ledger event, which foldWeights
 * (atoms.ts) applies to every atom with a prior `stack` event, followed by
 * exactly one `{ev:"renorm", target}` event — the homeostatic ceiling (see
 * TOTAL_WEIGHT_TARGET below). Below RENDER_FLOOR an atom leaves the render
 * (render.ts); the file stays — defocus, never delete.
 *
 * Before decaying, a run re-potentiates: scoreboard rem events carry a
 * `propagated` array of rendered addresses (`SELF.Doctrine[n]`, etc. —
 * render.ts's manifest format). The ledger is its OWN high-water mark for
 * "which rem events has this already processed" — no separate state file —
 * because the last `potentiate`/`decay` event's ts IS the boundary: any rem
 * event newer than it hasn't been folded into a potentiate event yet. Each
 * newly-covered rem event maps its SELF.* addresses through the manifest to
 * atom ids (NOW.* addresses are ignored — no atom mapping exists for them)
 * and appends one potentiate event per (atom, rem-event) pair.
 *
 * Pre-switchover reality: mind/beliefs/ and mind/render-manifest.json don't
 * exist yet. That is not a fault — it's the expected state until WS-F. A run
 * against a population-less mind emits one idle event and exits 0, so this
 * is safe to wire into the schedule before the population exists.
 *
 * All decision logic below (findNewRemEvents, computePotentiateEvents,
 * computeSankBelowFloor) is pure — no clock, no I/O — so the CLI's only job
 * is reading files, calling these, and writing back (Law 9: every run emits
 * a context-bound event to obs.ts, whether or not it wrote anything).
 */

import * as fs from "fs";
import * as path from "path";
import { homedir } from "os";
import { readAtoms, readLedger, appendLedger, foldWeights, type Atom, type AtomState, type LedgerEvent } from "./atoms.ts";
import { RENDER_FLOOR, type RenderManifestEntry } from "./render.ts";
import { ok, idle, degraded, correlation } from "./obs.ts";

// CIRCADIAN_HOME overrides; default ~/circadian. See wake.ts for the contract.
const CIRCADIAN_HOME = process.env.CIRCADIAN_HOME || path.join(homedir(), "circadian");
const MIND_DIR = path.join(CIRCADIAN_HOME, "mind");
const BELIEFS_DIR = path.join(MIND_DIR, "beliefs");
const LEDGER_PATH = path.join(MIND_DIR, "beliefs.jsonl");
const MANIFEST_PATH = path.join(MIND_DIR, "render-manifest.json");
const SCOREBOARD_PATH = path.join(MIND_DIR, "scoreboard.jsonl");
const VITALS_PATH = path.join(CIRCADIAN_HOME, "logs", ".population-vitals.json");

export const DECAY_FACTOR = 0.95;

/** Homeostatic renormalization ceiling (synaptic scaling paired with LTP):
 * after the nightly decay, one `{ev:"renorm",target}` line caps the total
 * weight of active atoms. foldWeights (atoms.ts) scales every active atom by
 * target/total iff total > target — never up. Strengthening one belief now
 * costs the others; uniform decay alone preserves rank order forever. */
export const TOTAL_WEIGHT_TARGET = 400;

// ---------------------------------------------------------------------
// pure decision logic — no clock, no I/O
// ---------------------------------------------------------------------

export interface RemPropagationEvent {
  ts: string;
  propagated?: string[];
}

/** The ledger's own high-water mark: the ts of the most recent potentiate OR
 * decay event (whichever is later) is the boundary a rem event's ts must
 * clear to be "new" — no separate state file (docs/POPULATION-MEMORY.md
 * §7 R9/R6). No prior potentiate/decay event at all => every rem event is
 * new (first-ever run). */
export function findNewRemEvents(ledgerEvents: LedgerEvent[], remEvents: RemPropagationEvent[]): RemPropagationEvent[] {
  let watermark: string | null = null;
  for (const e of ledgerEvents) {
    if (e.ev !== "potentiate" && e.ev !== "decay") continue;
    if (watermark === null || e.ts > watermark) watermark = e.ts;
  }
  if (watermark === null) return remEvents.slice();
  const w = watermark;
  return remEvents.filter((e) => e.ts > w);
}

export interface PotentiateComputation {
  events: LedgerEvent[];
  newRemCount: number;
  unmappedCount: number;
}

/** Maps each newly-covered rem event's propagated SELF.* addresses through
 * the render manifest to atom ids, and returns one potentiate ledger event
 * per (atom, rem-event) pair (a rem event citing the same atom under two
 * addresses still yields exactly one event for that atom). NOW.* addresses
 * carry no atom mapping and are ignored, not counted as unmapped. An
 * unmapped SELF.* address (manifest stale relative to the scoreboard) is
 * skipped and counted in `unmappedCount` — surfaced by the caller as a
 * degraded obs event, never silently dropped. */
export function computePotentiateEvents(
  ledgerEvents: LedgerEvent[],
  remEvents: RemPropagationEvent[],
  manifest: RenderManifestEntry[],
  runTs: string
): PotentiateComputation {
  const newRem = findNewRemEvents(ledgerEvents, remEvents);
  const addressToAtom = new Map(manifest.map((m) => [m.address, m.atom]));
  const events: LedgerEvent[] = [];
  let unmappedCount = 0;

  for (const rem of newRem) {
    const atomsThisRem = new Set<string>();
    for (const addr of rem.propagated ?? []) {
      if (!addr.startsWith("SELF.")) continue; // NOW.* has no atom mapping
      const atomId = addressToAtom.get(addr);
      if (!atomId) {
        unmappedCount++;
        continue;
      }
      atomsThisRem.add(atomId);
    }
    for (const atomId of atomsThisRem) {
      events.push({ ev: "potentiate", atom: atomId, ts: runTs });
    }
  }

  return { events, newRemCount: newRem.length, unmappedCount };
}

/** Every atom whose folded state is still `active` but has decayed below
 * RENDER_FLOOR — the "sank below floor" list the REM commit body pulls from
 * the decay obs event post-switchover (WS-F's wiring, not this module's). */
export function computeSankBelowFloor(atoms: Atom[], states: Map<string, AtomState>): string[] {
  return atoms
    .filter((a) => {
      const s = states.get(a.id);
      const weight = s?.weight ?? 0;
      const status = s?.status ?? "active";
      return status === "active" && weight < RENDER_FLOOR;
    })
    .map((a) => a.id);
}

// ---------------------------------------------------------------------
// I/O layer
// ---------------------------------------------------------------------

function readOrEmpty(p: string): string {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

function readManifest(p: string): RenderManifestEntry[] | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf8"));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readScoreboardRemEvents(p: string): RemPropagationEvent[] {
  const events: RemPropagationEvent[] = [];
  for (const line of readOrEmpty(p).split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const e = JSON.parse(t);
      if (e && e.type === "rem" && typeof e.ts === "string") events.push({ ts: e.ts, propagated: e.propagated });
    } catch {
      continue; // unparseable scoreboard line: skip, never fatal
    }
  }
  return events;
}

/** wc -l semantics (newline count), matching scorecard.ts's countSrcLoc —
 * each process keeps its own copy of this small helper (house style: see
 * status.ts's GREETING_PROPAGATION_PREFIXES comment). */
function countSrcLoc(): number {
  const srcDir = path.join(CIRCADIAN_HOME, "src");
  let files: string[] = [];
  try {
    files = fs.readdirSync(srcDir).filter((f) => f.endsWith(".ts"));
  } catch {
    return 0;
  }
  let total = 0;
  for (const f of files) {
    total += (readOrEmpty(path.join(srcDir, f)).match(/\n/g) || []).length;
  }
  return total;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const corr = correlation("decay");

  const beliefsDirExists = fs.existsSync(BELIEFS_DIR);
  const manifest = beliefsDirExists ? readManifest(MANIFEST_PATH) : null;

  if (!beliefsDirExists || !manifest) {
    idle({
      process: "decay",
      phase: "population-check",
      correlation_id: corr,
      summary: "no population yet — mind/beliefs/ or mind/render-manifest.json missing; decay is a no-op",
      context: { beliefs_dir_exists: beliefsDirExists, manifest_exists: manifest !== null },
    });
    return;
  }

  const atoms = readAtoms(BELIEFS_DIR);
  const ledgerBefore = readLedger(LEDGER_PATH);
  const remEvents = readScoreboardRemEvents(SCOREBOARD_PATH);
  const runTs = new Date().toISOString();

  const { events: potentiateEvents, newRemCount, unmappedCount } = computePotentiateEvents(
    ledgerBefore,
    remEvents,
    manifest,
    runTs
  );
  const decayEvent: LedgerEvent = { ev: "decay", factor: DECAY_FACTOR, ts: runTs };
  const renormEvent: LedgerEvent = { ev: "renorm", target: TOTAL_WEIGHT_TARGET, ts: runTs };

  const statesAfter = foldWeights([...ledgerBefore, ...potentiateEvents, decayEvent, renormEvent]);
  const sankBelowFloor = computeSankBelowFloor(atoms, statesAfter);
  const topWeight = atoms.reduce((max, a) => Math.max(max, statesAfter.get(a.id)?.weight ?? 0), 0);
  const srcLoc = countSrcLoc();

  if (!dryRun) {
    for (const ev of potentiateEvents) appendLedger(LEDGER_PATH, ev);
    appendLedger(LEDGER_PATH, decayEvent);
    appendLedger(LEDGER_PATH, renormEvent);

    const vitals = {
      ts: runTs,
      src_loc: srcLoc,
      population: atoms.length,
      top_weight: Math.round(topWeight * 10000) / 10000,
      sank_below_floor: sankBelowFloor,
    };
    fs.mkdirSync(path.dirname(VITALS_PATH), { recursive: true });
    fs.writeFileSync(VITALS_PATH, JSON.stringify(vitals, null, 2) + "\n");
  }

  const context = {
    population: atoms.length,
    potentiated: potentiateEvents.length,
    new_rem_events: newRemCount,
    unmapped_addresses: unmappedCount,
    sank_below_floor: sankBelowFloor,
    top_weight: Math.round(topWeight * 10000) / 10000,
    src_loc: srcLoc,
    dry_run: dryRun,
  };

  if (unmappedCount > 0) {
    degraded({
      process: "decay",
      phase: "potentiate",
      correlation_id: corr,
      summary: `decay run completed with ${unmappedCount} unmapped propagated SELF.* address(es)`,
      context,
      cause: `${unmappedCount} propagated address(es) had no matching entry in ${MANIFEST_PATH}`,
      next_action: "check whether render-manifest.json is stale relative to scoreboard.jsonl's rem events; re-render if so",
    });
  } else {
    ok({
      process: "decay",
      phase: "run",
      correlation_id: corr,
      summary: `decay run: ${potentiateEvents.length} potentiate event(s) from ${newRemCount} new rem event(s), 1 decay event, 1 renorm event (target ${TOTAL_WEIGHT_TARGET})${dryRun ? " (dry-run, nothing written)" : " applied"}`,
      context,
    });
  }
}

if (import.meta.main) await main();
