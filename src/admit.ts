#!/usr/bin/env bun
/** Human escalation door for proposed beliefs. No model calls. */
import * as fs from "node:fs";
import * as path from "node:path";
import { homedir } from "node:os";
import { parseAtom, readLedger } from "./atoms.ts";
import { publish, recoverPublications } from "./publish.ts";
import { correlation, ok, fail } from "./obs.ts";

export function admit(mindDir: string, id: string): void {
  if (!/^[a-f0-9]{12}$/.test(id)) throw new Error("admit requires a 12-hex atom id");
  recoverPublications(mindDir);
  const proposal = fs.readFileSync(path.join(mindDir, "proposed", `${id}.md`), "utf8");
  const atom = parseAtom(proposal);
  if (atom.id !== id) throw new Error("proposed atom id disagrees with its claim");
  if (readLedger(path.join(mindDir, "beliefs.jsonl")).some(e => e.ev === "stack" && e.atom === id) ||
    fs.existsSync(path.join(mindDir, "beliefs", `${id}.md`))) throw new Error("atom already canonical");
  // The source remains immutable; the ledger birth promotes it. The proposal
  // stays as an audit record but status excludes it once a stack event exists.
  publish(mindDir, {
    id: `admit-${id}`, subject: `admit: ${id}`,
    files: { [`beliefs/${id}.md`]: proposal },
    appends: { "beliefs.jsonl": JSON.stringify({ ev: "stack", atom: id, ep: atom.quotes[0].source, ts: new Date().toISOString() }) + "\n" },
  });
}

if (import.meta.main) {
  const [id, ...rest] = process.argv.slice(2);
  const idx = rest.indexOf("--mind");
  const mind = idx >= 0 ? rest[idx + 1] : path.join(process.env.CIRCADIAN_HOME || path.join(homedir(), "circadian"), "mind");
  const corr = correlation("admit");
  try {
    if (!id || !mind || (idx >= 0 && (idx !== 0 || rest.length !== 2))) throw new Error("usage: circadian admit <id> [--mind <mind repo>]");
    admit(mind, id);
    console.log(`admitted ${id}`);
    ok({ process: "admit", phase: "promote", correlation_id: corr, summary: `admitted ${id}`, context: { id, mind } });
  } catch (e) {
    fail({ process: "admit", phase: "promote", correlation_id: corr, summary: "admission failed", context: { id, mind }, cause: (e as Error).message, next_action: "inspect proposed atom and canonical ledger before retrying" });
    process.exitCode = 1;
  }
}
