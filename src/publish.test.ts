import { test, expect } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { publish, recoverPublications } from "./publish.ts";
const git = (dir: string, ...args: string[]) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();
function repo(): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "circ-publish-"));
  const mind = path.join(home, "mind"); fs.mkdirSync(mind);
  git(mind, "init", "-q"); git(mind, "config", "user.name", "Test"); git(mind, "config", "user.email", "test@localhost");
  fs.writeFileSync(path.join(mind, "beliefs.jsonl"), "");
  git(mind, "add", "."); git(mind, "commit", "-qm", "seed");
  process.env.CIRCADIAN_HOME = home;
  return mind;
}
test("receipt prevents double application; crash after CAS recovers by trailer", () => {
  const mind = repo();
  try {
    const intent = { id: "a", appends: { "beliefs.jsonl": "{\"ev\":\"stack\",\"atom\":\"a\"}\n" } };
    const first = publish(mind, intent);
    expect(publish(mind, intent).commit).toBe(first.commit);
    fs.unlinkSync(path.join(mind, "receipts/a.json"));
    fs.writeFileSync(path.join(mind, "intents/a.json"), JSON.stringify(intent) + "\n");
    recoverPublications(mind);
    expect(fs.readFileSync(path.join(mind, "beliefs.jsonl"), "utf8")).toBe('{"ev":"stack","atom":"a"}\n');
    expect(git(mind, "rev-list", "--count", "HEAD")).toBe("2");
    expect(fs.existsSync(path.join(mind, "intents/a.json"))).toBe(false);
  } finally { fs.rmSync(path.dirname(mind), { recursive: true, force: true }); }
});
test("two stacker publishers race: both commits land, both lines survive, one conflict event", async () => {
  const mind = repo();
  try {
    const ready = path.join(path.dirname(mind), "ready");
    const release = path.join(path.dirname(mind), "release");
    const script = `import { publish } from ${JSON.stringify(import.meta.dir + "/publish.ts")};
      import * as fs from 'node:fs';
      publish(${JSON.stringify(mind)}, { id:'stacker-1', appends:{'beliefs.jsonl':'{"ev":"stack","atom":"first"}\\n'} }, () => {
        fs.writeFileSync(${JSON.stringify(ready)}, 'ready');
        while (!fs.existsSync(${JSON.stringify(release)})) Bun.sleepSync(10);
      });`;
    const child = spawn("bun", ["-e", script], { env: { ...process.env, CIRCADIAN_HOME: path.dirname(mind) }, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = ""; child.stderr.on("data", c => stderr += c);
    const exit = new Promise<number | null>(resolve => child.on("exit", resolve));
    for (let i = 0; !fs.existsSync(ready) && i < 500; i++) await Bun.sleep(10);
    expect(fs.existsSync(ready)).toBe(true);
    publish(mind, { id: "stacker-2", appends: { "beliefs.jsonl": '{"ev":"stack","atom":"second"}\n' } });
    fs.writeFileSync(release, "go");
    expect(await exit).toBe(0);
    expect(git(mind, "rev-list", "--count", "HEAD")).toBe("3");
    expect(fs.readFileSync(path.join(mind, "beliefs.jsonl"), "utf8")).toBe('{"ev":"stack","atom":"second"}\n{"ev":"stack","atom":"first"}\n');
    expect((stderr.match(/publish-conflict/g) ?? []).length).toBe(1);
  } finally { fs.rmSync(path.dirname(mind), { recursive: true, force: true }); }
});
test("stale intent replay and receipt janitor", () => {
  const mind = repo();
  try {
    fs.mkdirSync(path.join(mind, "intents"));
    fs.writeFileSync(path.join(mind, "intents/b.json"), JSON.stringify({ id: "b", appends: { "beliefs.jsonl": '{"ev":"stack","atom":"b"}\n' } }) + "\n");
    recoverPublications(mind);
    expect(fs.readFileSync(path.join(mind, "beliefs.jsonl"), "utf8")).toBe('{"ev":"stack","atom":"b"}\n');
    const p = path.join(mind, "receipts/b.json");
    fs.utimesSync(p, new Date(0), new Date(0)); recoverPublications(mind);
    expect(fs.existsSync(p)).toBe(false);
    publish(mind, { id: "b", appends: { "beliefs.jsonl": '{"ev":"stack","atom":"b"}\n' } });
    expect(git(mind, "rev-list", "--count", "HEAD")).toBe("2");
  } finally { fs.rmSync(path.dirname(mind), { recursive: true, force: true }); }
});
