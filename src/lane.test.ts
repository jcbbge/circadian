import { describe, test, expect } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { atomId, readAtoms, readLedger, foldBeliefs, serializeAtom, type LedgerEvent } from "./atoms.ts";
import { checkout } from "./checkout.ts";
import { publish } from "./publish.ts";
import { renderSelf } from "./render.ts";
import { consolidate, divergentSupersedes, laneConflicts, landLane, openLane, unionLedger } from "./lane.ts";

function git(repo: string, ...args: string[]): string {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
}
function fixture() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "circ-lane-"));
  const mind = path.join(home, "mind");
  fs.mkdirSync(mind);
  git(mind, "init", "-b", "main");
  git(mind, "config", "user.name", "Test"); git(mind, "config", "user.email", "test@local");
  fs.writeFileSync(path.join(mind, ".gitignore"), "intents/\nreceipts/\n");
  fs.writeFileSync(path.join(mind, "beliefs.jsonl"), "");
  fs.writeFileSync(path.join(mind, "SELF.md"), "");
  fs.writeFileSync(path.join(mind, "render-manifest.json"), "[]\n");
  git(mind, "add", "."); git(mind, "commit", "-m", "initial");
  return { home, mind, cleanup: () => fs.rmSync(home, { recursive: true, force: true }) };
}
const atom = (claim: string) => ({ kind: "doctrine" as const, claim, why: "Because it matters.", quotes: [{ text: claim, source: "episode.md" }], eps: ["2026-09-24"] });
function stack(repo: string, claim: string, ts: string) {
  const id = atomId(claim);
  fs.mkdirSync(path.join(repo, "beliefs"), { recursive: true });
  fs.writeFileSync(path.join(repo, "beliefs", `${id}.md`), serializeAtom(atom(claim)));
  append(repo, { ev: "stack", atom: id, ep: "episode.md", ts });
  return id;
}
function append(repo: string, e: LedgerEvent) { fs.appendFileSync(path.join(repo, "beliefs.jsonl"), JSON.stringify(e) + "\n"); }
function commit(repo: string, msg: string) { git(repo, "add", "."); git(repo, "commit", "-m", msg); }

describe("worker lanes", () => {
  test("driver unions deterministically by timestamp and event hash, independent of input order", () => {
    const a = '{"ev":"stack","atom":"a","ts":"2026-01-01"}\n';
    const b = '{"ev":"stack","atom":"b","ts":"2026-01-02"}\n';
    expect(unionLedger(b + a, a + b)).toBe(a + b);
    expect(unionLedger(a + b, b + a)).toBe(a + b);
  });

  test("two branches stack the same immutable claim; land both, weight 2, deterministic render", () => {
    const f = fixture();
    try {
      const one = openLane(f.mind, "one"), two = openLane(f.mind, "two");
      expect(git(f.mind, "check-attr", "merge", "--", "beliefs.jsonl")).toContain("circadian-ledger");
      const id = stack(one, "The same claim on two lanes.", "2026-09-24T00:00:01Z"); commit(one, "stack one");
      stack(two, "The same claim on two lanes.", "2026-09-24T00:00:02Z"); commit(two, "stack two");
      landLane(f.mind, "one"); landLane(f.mind, "two");
      const events = readLedger(path.join(f.mind, "beliefs.jsonl"));
      expect(events.map(e => e.ev)).toEqual(["stack", "stack"]);
      expect(foldBeliefs(events).states.get(id)?.weight).toBe(2);
      expect(fs.readdirSync(path.join(f.mind, "beliefs"))).toEqual([`${id}.md`]);
      expect(fs.readFileSync(path.join(f.mind, "SELF.md"), "utf8")).toBe(renderSelf(readAtoms(path.join(f.mind, "beliefs")), foldBeliefs(events).states, undefined, { events }).md);
      expect(git(f.mind, "status", "--porcelain")).toBe("");
    } finally { f.cleanup(); }
  });

  test("divergent supersedes remove both decisions and expose both winners in a contradiction", () => {
    const f = fixture();
    try {
      const loser = stack(f.mind, "Old belief", "2026-09-23T00:00:00Z");
      commit(f.mind, "old belief");
      const one = openLane(f.mind, "one"), two = openLane(f.mind, "two");
      const a = stack(one, "New belief A", "2026-09-24T00:00:01Z");
      append(one, { ev: "supersede", loser, winner: a, ts: "2026-09-24T00:00:03Z" }); commit(one, "prefer A");
      const b = stack(two, "New belief B", "2026-09-24T00:00:02Z");
      append(two, { ev: "supersede", loser, winner: b, ts: "2026-09-24T00:00:04Z" }); commit(two, "prefer B");
      landLane(f.mind, "one");
      expect(laneConflicts(f.mind, "two")).toEqual([{ loser, a: [a, b].sort()[0], b: [a, b].sort()[1], ts: "2026-09-24T00:00:04Z" }]);
      const cli = Bun.spawnSync([process.execPath, path.join(import.meta.dir, "archaeology.ts"), "lane", "conflicts", "--mind", f.mind],
        { env: { ...process.env, CIRCADIAN_HOME: f.home } });
      expect(cli.exitCode).toBe(0);
      expect(cli.stdout.toString()).toContain(`fm/two ${loser}: ${[a, b].sort()[0]} <> ${[a, b].sort()[1]}`);
      const result = landLane(f.mind, "two");
      expect(result.conflicts).toHaveLength(1);
      const events = readLedger(path.join(f.mind, "beliefs.jsonl"));
      expect(events.filter(e => e.ev === "supersede")).toHaveLength(0);
      expect(events.filter(e => e.ev === "stack")).toHaveLength(3);
      const folded = foldBeliefs(events);
      expect(folded.states.get(a)).toEqual({ weight: 1, status: "active" });
      expect(folded.states.get(b)).toEqual({ weight: 1, status: "active" });
      expect(folded.contradictions.size).toBe(1);
      const self = fs.readFileSync(path.join(f.mind, "SELF.md"), "utf8");
      expect(self).toContain("## Tensions");
      expect(self).toContain("New belief A"); expect(self).toContain("New belief B");
      expect(checkout(f.mind).self).toBe(self);
      expect(laneConflicts(f.mind, "two")).toEqual([]);
      expect(() => landLane(f.mind, "two")).toThrow("already landed");
    } finally { f.cleanup(); }
  });

  test("CAS-published worker stack events land from worktrees without an index reset by the worker", () => {
    const f = fixture();
    try {
      const one = openLane(f.mind, "one"), two = openLane(f.mind, "two");
      const claim = "Published on both lanes", id = atomId(claim);
      for (const [repo, request, ts] of [[one, "one", "2026-09-24T00:00:01Z"], [two, "two", "2026-09-24T00:00:02Z"]]) {
        publish(repo, { id: request, files: { [`beliefs/${id}.md`]: serializeAtom(atom(claim)) },
          appends: { "beliefs.jsonl": JSON.stringify({ ev: "stack", atom: id, ts }) + "\n" } });
      }
      expect(git(one, "status", "--porcelain")).toBe("");
      expect(git(two, "status", "--porcelain")).toBe("");
      landLane(f.mind, "one"); landLane(f.mind, "two");
      expect(foldBeliefs(readLedger(path.join(f.mind, "beliefs.jsonl"))).states.get(id)?.weight).toBe(2);
    } finally { f.cleanup(); }
  });

  test("other event lines survive; conflicting atom bytes are never silently chosen", () => {
    const f = fixture();
    try {
      const one = openLane(f.mind, "one"), two = openLane(f.mind, "two");
      const id = stack(one, "Immutable claim", "2026-09-24T00:00:01Z"); commit(one, "first");
      stack(two, "Immutable claim", "2026-09-24T00:00:02Z");
      fs.writeFileSync(path.join(two, "beliefs", `${id}.md`), serializeAtom({ ...atom("Immutable claim"), why: "A different why" }));
      commit(two, "different bytes");
      landLane(f.mind, "one");
      expect(() => landLane(f.mind, "two")).toThrow();
      expect(git(f.mind, "status", "--porcelain")).toBe("");
      expect(readLedger(path.join(f.mind, "beliefs.jsonl"))).toHaveLength(1);
    } finally { f.cleanup(); }
  });

  test("CLI exposes lanes and emits obs events for open, conflicts and land", () => {
    const f = fixture();
    try {
      const cmd = (...args: string[]) => Bun.spawnSync([process.execPath, path.join(import.meta.dir, "archaeology.ts"), "lane", ...args, "--mind", f.mind],
        { env: { ...process.env, CIRCADIAN_HOME: f.home } });
      expect(cmd("open", "test").exitCode).toBe(0);
      expect(cmd("conflicts").stdout.toString()).toContain("no divergent supersedes");
      const dest = path.join(f.home, "mind-lanes", "test");
      stack(dest, "CLI claim", "2026-09-24T00:00:01Z"); commit(dest, "stack");
      expect(cmd("land", "test").exitCode).toBe(0);
      const logs = fs.readFileSync(path.join(f.home, "logs", "circadian.events.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
      expect(logs.map(e => [e.process, e.phase, e.outcome])).toEqual([
        ["lane", "open", "ok"], ["lane", "conflicts", "idle"], ["lane", "land", "ok"],
      ]);
    } finally { f.cleanup(); }
  });

  test("no duplicate supersede from shared base; reject invalid ids and dirty worktrees", () => {
    const inherited = '{"ev":"supersede","loser":"l","winner":"a","ts":"old"}\n';
    expect(divergentSupersedes(inherited, inherited, inherited)).toEqual([]);
    expect(consolidate(inherited, inherited + '{"ev":"supersede","loser":"l","winner":"a","ts":"new"}\n', inherited + '{"ev":"supersede","loser":"l","winner":"b","ts":"newer"}\n').ledger).toContain(inherited.trim());
    const f = fixture();
    try {
      expect(() => openLane(f.mind, "../escape")).toThrow();
      const dest = openLane(f.mind, "safe");
      expect(() => openLane(f.mind, "safe")).toThrow();
      fs.writeFileSync(path.join(dest, "uncommitted"), "x");
      expect(() => landLane(f.mind, "safe")).toThrow("dirty worktree");
      expect(git(f.mind, "branch", "--show-current")).toBe("main");
    } finally { f.cleanup(); }
  });
});
