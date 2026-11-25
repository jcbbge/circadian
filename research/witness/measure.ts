// Run with bun - from the program root (CIRCADIAN_PROGRAM optional), with
// CIRCADIAN_HOME pointing at the mind's parent, in a read-only/no-network sandbox.
// It exercises the SessionStart composer; the observer replaces spool I/O, not
// payload assembly or slot selection. Nothing private is printed.
import { mock } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { writeSync } from "node:fs";

const home = process.env.CIRCADIAN_HOME || join(homedir(), "circadian");
const program = process.env.CIRCADIAN_PROGRAM || process.cwd();
const mind = join(home, "mind");
const partsModule = join(program, "src/wake-parts.ts");
const parts = await import(partsModule);
const payloadModule = await import(join(program, "src/wake-payload.ts"));
let lengths: number[] = [];
let scope: string | undefined;
const count = (s: string) => Array.from(s).length;
const print = (record: unknown) => writeSync(1, JSON.stringify(record) + "\n");
mock.module(partsModule, () => ({
  ...parts,
  pruneSpool: () => {},
  writeSpool(_path: string, outputs: string[], _time: number, resolvedScope: string) {
    scope = resolvedScope;
    lengths = Array.from({ length: payloadModule.WAKE_PARTS }, (_, i) => {
      const part = parts.outputForSlot(outputs, i + 1, payloadModule.WAKE_PARTS);
      return part ? count(part + "\n") : 0;
    }).filter(Boolean);
  },
}));

const read = (file: string) => readFileSync(join(mind, file), "utf8");
const atomModule = await import(join(program, "src/atoms.ts"));
const manifest = JSON.parse(read("render-manifest.json")) as { atom?: string }[];
const renderedIds = [...new Set(manifest.map(row => row.atom).filter(Boolean))] as string[];
const ids = new Set(renderedIds);
const linesToAtoms = new Map<string, Set<string>>();
const found = new Set<string>();
const episodeRows = new Map<string, string[]>();
const sources = atomModule.readAtoms(join(mind, "beliefs")).filter((atom: { id: string }) => ids.has(atom.id));
for (const atom of sources) {
  for (const quote of atom.quotes) {
    if (!/^[\w.-]+\.md$/.test(quote.source) || !quote.text) continue;
    let rows = episodeRows.get(quote.source);
    if (!rows) {
      try { rows = read(join("episodes", quote.source)).split(/\r?\n/); } catch { rows = []; }
      episodeRows.set(quote.source, rows!);
    }
    const hits = rows!.flatMap((line, i) => line.includes(quote.text) ? [i] : []);
    if (hits.length !== 1) continue; // identical quotes on different lines are unresolved
    found.add(atom.id);
    const key = JSON.stringify([quote.source, hits[0] + 1]);
    if (!linesToAtoms.has(key)) linesToAtoms.set(key, new Set());
    linesToAtoms.get(key)!.add(atom.id);
  }
}
const reused = [...linesToAtoms.values()].filter(group => group.size > 1);
print({ rendered: ids.size, parsed: sources.length, typedShare: "UNKNOWN", provenTyped: 0,
  unattributed: ids.size - found.size, reuseMultiplicity: reused.map(group => group.size).sort((a, b) => b - a),
  reusedIds: new Set(reused.flatMap(group => [...group])).size });

Object.defineProperty(Bun.stdin, "stream", {
  value: () => new Response(JSON.stringify({ hook_event_name: "SessionStart", session_id: "witness-baseline", cwd: "/"})).body,
});
process.stdout.write = ((value: string | Uint8Array, ...args: unknown[]) => {
  const text = typeof value === "string" ? value : Buffer.from(value).toString();
  const cb = args.find(arg => typeof arg === "function") as (() => void) | undefined;
  print({ harness: "claude-code", scope, lengths, stdoutPart1: count(text), letterFirst: text.startsWith(read("LETTER.md").trim()) });
  cb?.();
  return true;
}) as typeof process.stdout.write;
await import(join(program, "src/wake.ts"));
