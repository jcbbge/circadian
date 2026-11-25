import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { followFeed, witnessTask, workBrief, workLane, type WorkEvent, type Page, type FeedPage } from "./work-witness.ts";

const step = "delivery.implementation";
const at = "2026-11-25T11:00:00.000Z";
test("deep hire wakes with its task lane and own rulings; no ambient portrait", async () => {
  const task = "root.workflow.child";
  const output = await workBrief({ task, step, parent: "root.workflow", profile: "PRIVATE" }, async key => {
    expect(key).toBe(task);
    return { events: [
      { seq: 1, when: at, what: "nqAnswer", step, data: { answer: "Relevant child ruling" } },
      { seq: 2, when: at, what: "nqAnswer", step: "delivery.plan", data: { answer: "Not this step" } },
    ], offset: "1", caughtUp: true };
  });
  expect(output).toContain(task + "\n");
  expect(output).toContain(step);
  expect(output).toContain("fm/" + workLane(task));
  expect(output).toContain("Relevant child ruling");
  expect(output).not.toContain("PRIVATE");
  expect(output).not.toContain("Not this step");
  expect(workLane(task)).not.toBe(workLane("root.workflow.sibling"));
});

test("attempts stay lane-only; terminal publication survives crash before cursor", async () => {
  const root = fs.mkdtempSync(join(tmpdir(), "work-witness-"));
  try {
    const mind = join(root, "mind");
    const states = join(root, "state");
    fs.mkdirSync(mind);
    const git = (...args: string[]) => {
      const r = spawnSync("git", ["-C", mind, ...args], { encoding: "utf8" });
      if (r.status !== 0) throw new Error(r.stderr);
      return r.stdout.trim();
    };
    git("init", "-q", "-b", "main");
    git("config", "user.name", "Witness Fixture");
    git("config", "user.email", "witness@invalid");
    fs.writeFileSync(join(mind, "SELF.md"), "fixture SELF\n");
    fs.writeFileSync(join(mind, "NOW.md"), "fixture NOW\n");
    git("add", "SELF.md", "NOW.md");
    git("commit", "-qm", "fixture");
    const event = (seq: number, what: string, data?: WorkEvent["data"]): WorkEvent =>
      ({ seq, when: at, what, step, data });
    const pages: Record<string, Page> = {
      "-1": { events: [event(1, "stepFinish", { who: "old", at, result: "RAW_ONLY" }),
        event(2, "grammar.step.not-done", { who: "old" })], offset: "p2", caughtUp: true },
      p2: { events: [event(3, "stepFinish", { who: "new", at, result: "ACCEPTED_ONLY" }),
        event(4, "grammar.step.verified", { who: "new" }), event(5, "grammar.done")], offset: "p5", caughtUp: true },
    };
    const read = async (_task: string, offset: string) => pages[offset];
    await witnessTask(mind, states, "root.deep.first", read);
    expect(fs.existsSync(join(mind, "episodes"))).toBe(false);
    const ref = "fm/" + workLane("root.deep.first");
    expect(git("show", ref + ":episodes/2026-11-25-1.md")).toContain("RAW_ONLY");
    await expect(witnessTask(mind, states, "root.deep.first", read, () => { throw new Error("crash"); })).rejects.toThrow("crash");
    await witnessTask(mind, states, "root.deep.first", read);
    await witnessTask(mind, states, "root.deep.first", read);
    expect(fs.readdirSync(join(mind, "episodes"))).toHaveLength(1);
    await witnessTask(mind, states, "root.deep.second", async (_task, offset) =>
      ({ ...pages[offset], caughtUp: false }));
    const episodes = fs.readdirSync(join(mind, "episodes"));
    expect(episodes).toHaveLength(2);
    for (const file of episodes) {
      const body = fs.readFileSync(join(mind, "episodes", file), "utf8");
      expect(body).toContain("ACCEPTED_ONLY");
      expect(body).not.toContain("RAW_ONLY");
      expect(body).toContain("Terminal stream event: 5");
    }
    expect(git("log", "--format=%s", "main").split("\n")).toHaveLength(3);
    expect(fs.readFileSync(join(mind, "SELF.md"), "utf8")).toBe("fixture SELF\n");
    expect(fs.readFileSync(join(mind, "NOW.md"), "utf8")).toBe("fixture NOW\n");
  } finally { fs.rmSync(root, { force: true, recursive: true }); }
});

test("the works feed witnesses each ended work and its children once, then resumes from its checkpoint", async () => {
  const state = fs.mkdtempSync(join(tmpdir(), "witness-feed-"));
  try {
    const pages: Record<string, FeedPage> = {
      "-1": { events: [{ task: "alpha", what: "grammar.done" }, { task: "../bad" }, { task: "beta", what: "task.abandoned" }], offset: "o1", caughtUp: false },
      "o1": { events: [], offset: "o1", caughtUp: true },
    };
    const witnessed: string[] = [];
    const witness = async (_mind: string, _state: string, task: string) => {
      witnessed.push(task);
      return task === "alpha" ? ["alpha.delivery", "alpha.delivery"] : [];
    };
    const concluded: string[] = [];
    const conclude = (_m: string, _s: string, work: string, tasks: string[]) => { concluded.push(`${work}:${tasks.join(",")}`); };
    expect(await followFeed("/unused", state, async offset => pages[offset], witness, conclude)).toBe(2);
    expect(witnessed).toEqual(["alpha", "alpha.delivery", "beta"]);
    expect(concluded).toEqual(["alpha:alpha,alpha.delivery", "beta:beta"]);
    witnessed.length = 0;
    expect(await followFeed("/unused", state, async offset => pages[offset], witness, conclude)).toBe(0);
    expect(witnessed).toEqual([]);
  } finally { fs.rmSync(state, { recursive: true, force: true }); }
});
