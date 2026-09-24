import { test, expect } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFileSync } from "node:child_process";
import { atomId, readLedger, readAtoms, serializeAtom } from "./atoms.ts";
import { stackEpisode, QUORUM, activeLaneViews } from "./stack.ts";
import { statusSnapshot } from "./status.ts";
import { admit } from "./admit.ts";

const claim = "Quorum preserves independent observations before canonical memory is born.";
const candidate = `kind: doctrine\nclaim: ${JSON.stringify(claim)}\nwhy: "Evidence from independent lanes"\nquote: ${JSON.stringify(claim)}\n`;
const git = (dir: string, ...args: string[]) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();

async function sandbox(votes: string[], gated: boolean) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "quorum-test-"));
  const mindDir = path.join(home, "mind"), beliefsDir = path.join(mindDir, "beliefs");
  fs.mkdirSync(path.join(mindDir, "episodes"), { recursive: true });
  fs.writeFileSync(path.join(mindDir, "episodes", "new.md"), `---\ndate: 2026-09-24\n---\n${claim}\n`);
  fs.writeFileSync(path.join(mindDir, "beliefs.jsonl"), "");
  git(mindDir, "init", "-q", "-b", "main");
  git(mindDir, "config", "user.name", "Test"); git(mindDir, "config", "user.email", "test@localhost");
  git(mindDir, "add", "."); git(mindDir, "commit", "-qm", "seed");
  const oldHome = process.env.CIRCADIAN_HOME;
  process.env.CIRCADIAN_HOME = home;
  let calls = 0;
  const run = (filename = "new.md", laneViews = gated ? [mindDir, mindDir] : []) => stackEpisode({
    mindDir, beliefsDir, ledgerPath: path.join(mindDir, "beliefs.jsonl"), ioLogPath: path.join(home, "logs", "io.jsonl"),
    filename, correlationId: "quorum-test", laneViews,
    extract: async () => candidate,
    voteTransport: async request => {
      expect(request.options).toEqual(["DISTINCT", "SAME"]);
      expect(request.evidence).toEqual({ A: claim, B: [] });
      return { option: votes[calls++] };
    },
  });
  return { home, mindDir, beliefsDir, run, get calls() { return calls; }, cleanup() {
    if (oldHome === undefined) delete process.env.CIRCADIAN_HOME;
    else process.env.CIRCADIAN_HOME = oldHome;
    fs.rmSync(home, { recursive: true, force: true });
  } };
}

test("2:1 DISTINCT births a canonical atom; quorum is 2 of 3", async () => {
  const s = await sandbox(["DISTINCT", "SAME", "DISTINCT"], true);
  try {
    expect(QUORUM).toEqual({ n: 2, m: 3 });
    const r = await s.run();
    expect(s.calls).toBe(3);
    expect(r.counts?.new).toBe(1);
    expect(readAtoms(s.beliefsDir).map(a => a.id)).toEqual([atomId(claim)]);
    expect(readLedger(path.join(s.mindDir, "beliefs.jsonl")).filter(e => e.ev === "stack")).toHaveLength(1);
    expect(statusSnapshot(s.mindDir).proposed).toEqual([]);
  } finally { s.cleanup(); }
});

test("1:2 DISTINCT persists proposed file without stack; status lists it; admit promotes", async () => {
  const s = await sandbox(["SAME", "DISTINCT", "SAME"], true);
  try {
    const r = await s.run();
    expect(r.counts?.proposed).toBe(1);
    expect(r.counts?.new).toBe(0);
    const id = atomId(claim);
    expect(readAtoms(path.join(s.mindDir, "proposed")).map(a => a.id)).toEqual([id]);
    expect(readAtoms(s.beliefsDir)).toEqual([]);
    expect(readLedger(path.join(s.mindDir, "beliefs.jsonl")).filter(e => e.ev === "stack")).toHaveLength(0);
    expect(statusSnapshot(s.mindDir).proposed).toEqual([{ id, claim }]);
    const out = Bun.spawnSync(["bun", path.join(import.meta.dir, "status.ts")], { env: { ...process.env, CIRCADIAN_HOME: s.home } });
    expect(out.exitCode).toBe(0);
    expect(out.stdout.toString()).toContain(`${id}: ${claim}`);
    admit(s.mindDir, id);
    expect(readLedger(path.join(s.mindDir, "beliefs.jsonl")).filter(e => e.ev === "stack")).toHaveLength(1);
    expect(statusSnapshot(s.mindDir).proposed).toEqual([]);
    expect(() => admit(s.mindDir, id)).toThrow("already canonical");
  } finally { s.cleanup(); }
});

test("invalid decisions abstain; single lane is off; recurrence does not vote", async () => {
  const s = await sandbox(["DISTINCT", "garbage", "SAME"], true);
  try {
    const first = await s.run();
    expect(first.counts?.proposed).toBe(1);
    expect(first.counts?.compareInvalid).toBe(1);
    // With only one lane, the same candidate is born without votes.
    const second = await s.run("new.md", []);
    expect(second.counts?.new).toBe(1);
    expect(s.calls).toBe(3);
    fs.writeFileSync(path.join(s.mindDir, "episodes", "again.md"), `---\ndate: 2026-09-24\n---\n${claim}\n`);
    const bump = await s.run("again.md");
    expect(bump.counts?.stacked).toBe(1);
    expect(s.calls).toBe(3);
  } finally { s.cleanup(); }
});

test("opposing active lane view opens a contradiction, without birthing the proposal", async () => {
  const s = await sandbox(["SAME", "DISTINCT", "SAME"], true);
  try {
    const other = "The moon circles the earth once every month.";
    const id = atomId(other);
    fs.mkdirSync(s.beliefsDir);
    fs.writeFileSync(path.join(s.beliefsDir, `${id}.md`), serializeAtom({
      kind: "doctrine", claim: other, why: "observed", quotes: [{ text: other, source: "old.md" }], eps: ["2026-09-23"],
    }));
    fs.appendFileSync(path.join(s.mindDir, "beliefs.jsonl"), JSON.stringify({ ev: "stack", atom: id, ep: "old.md", ts: "2026-09-23T00:00:00Z" }) + "\n");
    git(s.mindDir, "add", "."); git(s.mindDir, "commit", "-qm", "old atom");
    // Vote evidence includes this lane's full active population.
    let n = 0;
    const r = await stackEpisode({ mindDir: s.mindDir, beliefsDir: s.beliefsDir,
      ledgerPath: path.join(s.mindDir, "beliefs.jsonl"), ioLogPath: path.join(s.home, "logs", "io.jsonl"),
      filename: "new.md", correlationId: "dissent", laneViews: [s.mindDir, s.mindDir], extract: async () => candidate,
      voteTransport: async req => { expect(req.evidence).toEqual({ A: claim, B: [other] }); return { option: ["SAME", "DISTINCT", "SAME"][n++] }; },
    });
    expect(r.counts?.proposed).toBe(1);
    const events = readLedger(path.join(s.mindDir, "beliefs.jsonl"));
    expect(events.filter(e => e.ev === "contradiction").map(e => [e.a, e.b])).toEqual([[atomId(claim), id]]);
    expect(events.filter(e => e.ev === "stack").map(e => e.atom)).toEqual([id]);
  } finally { s.cleanup(); }
});

test("checked-out fm lanes activate gate, a single lane does not", async () => {
  const s = await sandbox([], false);
  try {
    expect(activeLaneViews(s.mindDir)).toEqual([]);
    for (const name of ["one", "two"]) {
      git(s.mindDir, "worktree", "add", "-qb", `fm/${name}`, path.join(s.home, name));
      expect(activeLaneViews(s.mindDir).length).toBe(name === "one" ? 0 : 3);
    }
  } finally { s.cleanup(); }
});
