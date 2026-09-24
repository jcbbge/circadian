import { test, expect } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { writeAtom, appendLedger, foldWeights, readLedger } from "./atoms.ts";
import { dig } from "./dig.ts";
import { renderSelf, RENDER_FLOOR } from "./render.ts";

test("dig retrieves decayed below-floor claim by BM25 without altering mind; depth lookup and provenance; obs event", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "circadian-dig-"));
  try {
    const mind = path.join(home, "mind"), dir = path.join(mind, "beliefs"), ledger = path.join(mind, "beliefs.jsonl");
    const claim = "old-claim-text persists in the archive";
    const { id } = writeAtom(dir, { kind: "doctrine", claim, why: "recorded", quotes: [{ text: "verbatim", source: "2026-01-01-old.md" }], eps: ["2026-01-01"] });
    const original = fs.readFileSync(path.join(dir, `${id}.md`));
    appendLedger(ledger, { ev: "stack", atom: id, ep: "2026-01-01-old.md", ts: "2026-01-01" });
    for (let i = 0; i < 30; i++) appendLedger(ledger, { ev: "decay", factor: 0.95, ts: `night-${i}` });
    const before = fs.readFileSync(ledger);
    const states = foldWeights(readLedger(ledger));
    expect(states.get(id)!.weight).toBeLessThan(RENDER_FLOOR);
    expect(renderSelf([{ id, kind: "doctrine", claim, why: "recorded", quotes: [{ text: "verbatim", source: "2026-01-01-old.md" }], eps: ["2026-01-01"] }], states, undefined, { events: readLedger(ledger) }).md).not.toContain(claim);
    expect((await dig(mind, "old-claim-text")).map((h) => h.atom.id)).toEqual([id]);
    expect((await dig(mind, "0")).map((h) => h.atom.id)).toEqual([id]);
    const run = spawnSync(process.execPath, [path.join(import.meta.dir, "dig.ts"), "old-claim-text"],
      { encoding: "utf8", env: { ...process.env, CIRCADIAN_HOME: home, CIRCADIAN_EMBED: "0" } });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain(`atom ${id} — stack 2026-01-01-old.md`);
    expect(run.stdout).toContain("depth 0; last-stack 2026-01-01");
    expect(JSON.parse(fs.readFileSync(path.join(home, "logs", "circadian.events.jsonl"), "utf8").trim()).process).toBe("dig");
    expect(fs.readFileSync(ledger)).toEqual(before);
    expect(fs.readFileSync(path.join(dir, `${id}.md`))).toEqual(original);
    expect(fs.existsSync(path.join(mind, "index"))).toBe(false);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});
