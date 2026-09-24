import { test, expect } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { recallScope, scopedView } from "./scopes.ts";
import { buildPayload } from "./wake-payload.ts";
import { whileAway } from "./away.ts";
import { healthLine, recall, changeAtom } from "../bin/circadian";
import { atomId, serializeAtom, foldWeights, readLedger } from "./atoms.ts";
import { renderSelf } from "./render.ts";
import { callTool } from "./serve.ts";
import { episodeMetadata, shouldGateWorker } from "./sleep.ts";

function sandbox(fn: (home: string, mind: string) => void | Promise<void>) {
  const home = fs.mkdtempSync(path.join(tmpdir(), "circ-worker-"));
  const mind = path.join(home, "mind"); fs.mkdirSync(path.join(mind, "episodes"), { recursive: true });
  return Promise.resolve().then(() => fn(home, mind)).finally(() => fs.rmSync(home, { recursive: true, force: true }));
}

test("Accept when: a torn-down worker's episode is findable by its id; stamped worker gets slim in-scope only, global corrections, no footnotes", () => sandbox((home, mind) => {
  fs.mkdirSync(path.join(mind, "now"));
  fs.writeFileSync(path.join(mind, "now/arc.md"), "## Next move\n\nReview receipts.\n## Last sleep\n\n2026-09-24T12:00:00Z\n");
  fs.writeFileSync(path.join(mind, "scopes.tsv"), `arc\t${home}\tactive\nother\t${home}\tactive\n`);
  fs.writeFileSync(path.join(mind, "episodes/2026-09-24-worker.md"), "---\nscope: arc\nts: 2026-09-24T12:00:00Z\nlane: circ-23\nharness: pi\nmodel: test\nmachine: sandbox\nprovenance_session: s1\narc: delivered\n---\nwhy: receipts\n");
  fs.writeFileSync(path.join(mind, "episodes/2026-09-24-other.md"), "---\nscope: other\narc: secret\n---\n");
  const v = recallScope(mind, "arc", { nowMs: Date.parse("2026-09-24T13:00:00Z"), slim: true });
  const output = buildPayload({ scope: "arc", now: v.now, here: v.here, elsewhere: v.elsewhere, self: "", user: "## Corrections\n\nAlways check.\n## Preferences\n\nPrivate.", greeting: "", slim: true });
  expect(output.split("\n").slice(0, 2)).toEqual(["Resolved scope: arc", "Next move: Review receipts."]);
  expect(output).toContain("lane: circ-23"); expect(output).toContain("Always check.");
  expect(output).not.toContain("Private."); expect(output).not.toContain("secret"); expect(output).not.toContain("<mind:elsewhere>");
  expect(recall(home, "arc")).toContain("lane: circ-23");
  expect(recallScope(mind, "arc", { nowMs: Date.parse("2026-09-24T13:00:00Z"), sinceMs: Date.parse("2026-09-25") }).here).not.toContain("lane: circ-23");
  const operator = recall(home, "arc");
  expect(operator).not.toContain("<mind:corrections>");
}));

test("Lane-stamped SLEEP writes searchable worker provenance in episode frontmatter and obs context, without attaching identity to beliefs", () => {
  expect(shouldGateWorker("You are a worker. Read and execute your brief", undefined, "circ-23")).toBe(false);
  expect(shouldGateWorker("You are a worker. Read and execute your brief")).toBe(true);
  const fields = episodeMetadata("circ-23", { harness: "pi", model: "local", machine: "hive" }, "s1");
  expect(fields).toContain("lane: circ-23"); expect(fields).toContain("harness: pi");
  expect(fields).toContain("model: local"); expect(fields).toContain("machine: hive");
  expect(fields).toContain("provenance_session: s1");
  expect(fields).not.toContain("scope:");
});

test("While you were away: default-branch commits, ledger openings/closures and other episodes since last scoped wake are file/git-only", () => sandbox((home, mind) => {
  const repo = path.join(home, "project"); fs.mkdirSync(repo);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_DATE: args.includes("initial") ? "2020-01-01T00:00:00Z" : "2026-09-24T12:00:00Z", GIT_COMMITTER_DATE: args.includes("initial") ? "2020-01-01T00:00:00Z" : "2026-09-24T12:00:00Z" } });
  git("init", "-q", "-b", "main"); git("config", "user.email", "test@example.org"); git("config", "user.name", "Test");
  fs.writeFileSync(path.join(repo, "TASKS.md"), "NOW\n- [ ] old\n"); git("add", "."); git("commit", "-qm", "initial");
  fs.writeFileSync(path.join(mind, "scopes.tsv"), `arc\t${repo}\tactive\n`);
  fs.writeFileSync(path.join(mind, "scoreboard.jsonl"), JSON.stringify({ type: "wake", scope: "arc", ts: "2020-01-02T00:00:00Z" }) + "\n");
  fs.writeFileSync(path.join(repo, "TASKS.md"), "DONE\n- [x] old\nNOW\n- [ ] new\n"); git("add", "."); git("commit", "-qm", "finished old, opened new");
  fs.writeFileSync(path.join(mind, "episodes/2026-09-24-worker.md"), "---\nscope: arc\nts: 2026-09-24T12:00:00Z\nsession: worker\n---\n");
  const output = whileAway(home, "arc", Date.parse("2026-09-25"), "concierge");
  expect(output).toContain("finished old, opened new"); expect(output).toContain("Ledger TASKS.md:\n+DONE");
  expect(output).toContain("Other session: 2026-09-24-worker.md [episode: 2026-09-24-worker.md]");
  expect(output).not.toContain("(no model)");
}));

test("CLI status --line includes wake age, REM, backlog, degraded; recall and MCP share the scoped read", async () => sandbox(async (home, mind) => {
  fs.mkdirSync(path.join(home, "logs"));
  fs.writeFileSync(path.join(mind, "scoreboard.jsonl"), ["wake", "rem"].map(type => JSON.stringify({ type, ts: "2026-09-24T12:00:00Z" })).join("\n"));
  fs.writeFileSync(path.join(home, "logs/pending-sleep.jsonl"), '{"session_id":"pending"}\n');
  fs.writeFileSync(path.join(home, "logs/circadian.events.jsonl"), '{"outcome":"degraded","ts":"2026-09-24T12:01:00Z"}\n');
  expect(healthLine(home, Date.parse("2026-09-24T12:02:00Z"))).toContain("wake 2m · REM 2m · backlog 1 · degraded");
  const cli = Bun.spawnSync([process.execPath, path.join(import.meta.dir, "../bin/circadian"), "status", "--line"], { env: { ...process.env, CIRCADIAN_HOME: home } });
  expect(cli.exitCode).toBe(0); expect(cli.stdout.toString()).toMatch(/wake .* · REM .* · backlog 1/);
  fs.mkdirSync(path.join(mind, "now")); fs.writeFileSync(path.join(mind, "now/arc.md"), "## Next move\n\nStart here.\n");
  const result = await callTool(home, "memory_recall", { scope: "arc" }) as { now: string };
  expect(result.now).toContain("Start here."); expect(recall(home, "arc")).toContain(result.now.trim());
  expect(() => recallScope(mind, "../escape")).toThrow();
}));

test("Pin lifts a below-floor atom; forget with reason hides it from render and scoped wake, preserving ledger receipt", () => sandbox((home, mind) => {
  const claim = "A durable fact"; const id = atomId(claim); const ep = "2026-09-24-arc.md";
  fs.mkdirSync(path.join(mind, "beliefs"));
  fs.writeFileSync(path.join(mind, "episodes", ep), "---\nscope: arc\n---\nquote text\n");
  fs.writeFileSync(path.join(mind, "beliefs", id + ".md"), serializeAtom({ kind: "doctrine", claim, why: "reason", quotes: [{ text: "quote text", source: ep }], eps: ["2026-09-24"], scope: "arc" }));
  fs.writeFileSync(path.join(mind, "beliefs.jsonl"), JSON.stringify({ ev: "stack", atom: id, ep, ts: "2026-09-24" }) + "\n" + JSON.stringify({ ev: "decay", factor: 0.1, ts: "2026-09-25" }) + "\n");
  fs.writeFileSync(path.join(mind, "scopes.tsv"), `arc\t${home}\tactive\n`);
  execFileSync("git", ["init", "-q", mind]); execFileSync("git", ["-C", mind, "config", "user.email", "test@example.org"]); execFileSync("git", ["-C", mind, "config", "user.name", "Test"]);
  execFileSync("git", ["-C", mind, "add", "."]); execFileSync("git", ["-C", mind, "commit", "-qm", "init"]);
  const atoms = [{ id, kind: "doctrine" as const, claim, why: "reason", quotes: [{ text: "quote text", source: ep }], eps: ["2026-09-24"] }];
  expect(renderSelf(atoms, foldWeights(readLedger(path.join(mind, "beliefs.jsonl")))).md).not.toContain(claim);
  changeAtom(home, "pin", id); expect(fs.readFileSync(path.join(mind, "SELF.md"), "utf8")).toContain(claim);
  expect(() => changeAtom(home, "forget", id)).toThrow("reason");
  changeAtom(home, "forget", id, "operator correction");
  expect(fs.readFileSync(path.join(mind, "SELF.md"), "utf8")).not.toContain(claim);
  expect(scopedView(mind, "arc").here).not.toContain(`### atom ${id}.md`);
  expect(readLedger(path.join(mind, "beliefs.jsonl")).at(-1)?.reason).toBe("operator correction");
}));
