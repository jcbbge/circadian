import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { tmpdir } from "node:os";
import { atomId, parseAtom, serializeAtom } from "./atoms.ts";
import { parseForeign, type Rejection } from "./interchange.ts";

const fixture = path.resolve(import.meta.dir, "../fixtures/mem-store");
const dirs: string[] = [];
const previousHome = process.env.CIRCADIAN_HOME;
function sandbox(): string {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "interchange-test-"));
  dirs.push(dir);
  process.env.CIRCADIAN_HOME = dir;
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  if (previousHome === undefined) delete process.env.CIRCADIAN_HOME;
  else process.env.CIRCADIAN_HOME = previousHome;
});

describe("foreign entity frontmatter", () => {
  test("CLI reports 2 atoms and 2 evidence rejections; ids are stable across dialects", () => {
    const home = sandbox();
    const run = Bun.spawnSync(["bun", "src/interchange.ts", fixture], {
      cwd: path.resolve(import.meta.dir, ".."), env: { ...process.env, CIRCADIAN_HOME: home },
    });
    expect(run.exitCode).toBe(0);
    const out = run.stdout.toString();
    expect(out).toContain("2 atoms, 2 rejections");
    expect(out).toContain("counterfeit quote");
    expect(out).toContain("missing verbatim quote");
    const rejected: Rejection[] = [];
    const atoms = parseForeign(fixture, (r) => rejected.push(r));
    expect(atoms).toHaveLength(2);
    expect(rejected).toHaveLength(2);
    expect(atoms[0].id).toBe("d467a9e5acc6");
    for (const a of atoms) {
      expect(a.id).toBe(atomId(a.claim));
      expect(parseAtom(serializeAtom(a)).id).toBe(a.id);
    }
    expect(atoms[1].claim).toBe("Every change needs a reason."); // superseded stays read-only
    const events = fs.readFileSync(path.join(home, "logs/circadian.events.jsonl"), "utf8")
      .trim().split("\n").map((line) => JSON.parse(line));
    expect(events).toHaveLength(4); // CLI and library both emit
    expect(events.every((e) => e.outcome === "degraded" && e.cause && e.next_action)).toBe(true);
  });

  test("rejects forged ids, absent why, missing dates, unreadable and escaping evidence without stopping other facts", () => {
    const home = sandbox();
    const store = path.join(home, "store");
    fs.cpSync(fixture, store, { recursive: true });
    const file = path.join(store, "memory/people/ada.md");
    let text = fs.readFileSync(file, "utf8");
    text = text.replace("d467a9e5acc6", "000000000000")
      .replace("why: A reason makes review possible.", "why: ''")
      .replace("timestamp: 2026-09-23T11:00:00Z", "timestamp: unknown");
    fs.writeFileSync(file, text);
    const rejected: Rejection[] = [];
    expect(parseForeign(store, (r) => rejected.push(r))).toHaveLength(0);
    expect(rejected.map((r) => r.reason)).toEqual([
      "stored id disagrees with claim", "missing why", "counterfeit quote: not verbatim in events/2026-09-23-ada.md", "missing verbatim quote",
    ]);
    text = fs.readFileSync(file, "utf8").replace("000000000000", "d467a9e5acc6")
      .replace("timestamp: unknown", "timestamp: 2026-09-23T11:00:00Z")
      .replace("path: events/2026-09-23-ada.md", "path: ../../../../outside.md");
    fs.writeFileSync(file, text);
    const more: Rejection[] = [];
    parseForeign(store, (r) => more.push(r));
    expect(more[0].reason).toContain("unreadable source");
    expect(more[0].reason).toContain("source outside store");
  });

  test("missing store and symlink escaping store are rejected", () => {
    const home = sandbox();
    const missing: Rejection[] = [];
    expect(parseForeign(path.join(home, "missing"), (r) => missing.push(r))).toEqual([]);
    expect(missing[0].reason).toBe("foreign store directory not found");
    const store = path.join(home, "store");
    fs.cpSync(fixture, store, { recursive: true });
    fs.renameSync(path.join(store, "events/2026-09-23-ada.md"), path.join(home, "outside.md"));
    fs.symlinkSync(path.join(home, "outside.md"), path.join(store, "events/2026-09-23-ada.md"));
    const rejected: Rejection[] = [];
    expect(parseForeign(store, (r) => rejected.push(r))).toEqual([]);
    expect(rejected[0].reason).toContain("source outside store");
  });

  test("invalid frontmatter is reported instead of silently skipped", () => {
    const home = sandbox();
    const store = path.join(home, "store");
    fs.mkdirSync(path.join(store, "memory/orgs"), { recursive: true });
    fs.writeFileSync(path.join(store, "memory/orgs/broken.md"), "---\nfacts: [bad\n---\n");
    const rejected: Rejection[] = [];
    expect(parseForeign(store, (r) => rejected.push(r))).toEqual([]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].file).toBe("memory/orgs/broken.md");
  });
});
