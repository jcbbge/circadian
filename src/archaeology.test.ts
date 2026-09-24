import { test, expect } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { writeAtom, appendLedger } from "./atoms.ts";
import { when, firstMention } from "./archaeology.ts";

function git(mind: string, ...args: string[]): string {
  const run = spawnSync("git", args, { cwd: mind, encoding: "utf8" });
  if (run.status !== 0) throw new Error(run.stderr);
  return run.stdout.trim();
}

function cli(home: string, ...args: string[]) {
  return spawnSync(process.execPath, [path.join(import.meta.dir, "archaeology.ts"), ...args],
    { encoding: "utf8", env: { ...process.env, CIRCADIAN_HOME: home } });
}

test("when traces birth, every stack bump and won/lost lineage; bisect finds earliest mention in deleted episode", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "circadian-archaeology-"));
  try {
    const mind = path.join(home, "mind");
    fs.mkdirSync(path.join(mind, "episodes"), { recursive: true });
    git(mind, "init", "-q");
    git(mind, "config", "user.name", "fixture");
    git(mind, "config", "user.email", "fixture@example.invalid");
    const claim = "Quiet rivers carry memory";
    const firstEp = "2026-01-01-first.md", birthEp = "2026-01-02-birth.md", bumpEp = "2026-01-03-bump.md";
    const episode = (name: string, content: string) => fs.writeFileSync(path.join(mind, "episodes", name), content);
    const commit = (message: string) => { git(mind, "add", "-A"); git(mind, "commit", "-qm", message); return git(mind, "rev-parse", "HEAD"); };
    episode(firstEp, "We learned: QUIET\tRIVERS\ncarry memory.\n");
    const first = commit("first telling");
    episode(birthEp, "Quiet rivers carry memory; we will keep this.\n");
    const beliefs = path.join(mind, "beliefs"), ledger = path.join(mind, "beliefs.jsonl");
    const a = writeAtom(beliefs, { kind: "doctrine", claim, why: "A river remembers", quotes: [{ text: "Quiet rivers carry memory", source: birthEp }], eps: ["2026-01-02"] }).id;
    const b = writeAtom(beliefs, { kind: "motif", claim: "Old rivers", why: "old", quotes: [{ text: "old", source: birthEp }], eps: ["2026-01-02"] }).id;
    appendLedger(ledger, { ev: "stack", atom: a, ep: birthEp, ts: "2026-01-02" });
    appendLedger(ledger, { ev: "stack", atom: b, ep: birthEp, ts: "2026-01-02" });
    const born = commit("belief born");
    episode(bumpEp, "Quiet rivers carry memory, but change course.\n");
    const c = writeAtom(beliefs, { kind: "doctrine", claim: "Rivers change course", why: "change", quotes: [{ text: "change course", source: bumpEp }], eps: ["2026-01-03"] }).id;
    appendLedger(ledger, { ev: "stack", atom: a, ep: bumpEp, ts: "2026-01-03" });
    appendLedger(ledger, { ev: "supersede", winner: a, loser: b, ts: "2026-01-03" });
    appendLedger(ledger, { ev: "supersede", winner: c, loser: a, ts: "2026-01-03" });
    fs.rmSync(path.join(mind, "episodes", firstEp)); // composted: first mention must survive deletion
    const latest = commit("recurrence and supersession");
    const before = git(mind, "status", "--porcelain") + git(mind, "rev-parse", "HEAD");
    const text = when(mind, a);
    expect(text).toContain(`birth: ${birthEp} [2026-01-02]; commit ${born}`);
    expect(text).toContain("bump count: 1");
    expect(text).toContain(`last bump: ${bumpEp} [2026-01-03]`);
    expect(text).toContain(`${a} won over ${b} [2026-01-03] (won)`);
    expect(text).toContain(`${c} won over ${a} [2026-01-03] (lost)`);
    expect(when(mind, "  QUIET   rivers carry  ")).toBe(text);
    expect(firstMention(mind, "quiet rivers CARRY memory")).toEqual({ commit: first, episode: firstEp });
    expect(firstMention(mind, "but CHANGE course")).toEqual({ commit: latest, episode: bumpEp });
    expect(firstMention(mind, "never mentioned")).toBeNull();
    const run = cli(home, "when", a);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain(`birth: ${birthEp} [2026-01-02]; commit ${born}`);
    expect(run.stdout).toContain(`bump: ${bumpEp}`);
    const bisect = cli(home, "bisect", "quiet  rivers carry MEMORY");
    expect(bisect.status).toBe(0);
    expect(bisect.stdout).toContain(`commit ${first}, episodes/${firstEp}`);
    expect(cli(home, "bisect", "never mentioned").stdout).toContain("no episode mentions");
    expect(cli(home, "when", "nonexistent").status).toBe(1);
    expect(cli(home, "when", "rivers").stderr).toContain("ambiguous belief");
    expect(git(mind, "status", "--porcelain") + git(mind, "rev-parse", "HEAD")).toBe(before);
    const events = fs.readFileSync(path.join(home, "logs", "circadian.events.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
    expect(events.map((e) => e.outcome)).toEqual(["ok", "ok", "idle", "failed", "failed"]);
    expect(events.every((e) => e.process === "archaeology")).toBe(true);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});
