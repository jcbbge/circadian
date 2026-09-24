import { test, expect } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { stackEpisode } from "./stack.ts";

const git = (mind: string, ...args: string[]) => execFileSync("git", ["-C", mind, ...args], { encoding: "utf8" }).trim();
test("two concurrent stackers on one mind preserve both lines and emit exactly one conflict", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "circ-stack-cas-"));
  process.env.CIRCADIAN_HOME = home;
  const mindDir = path.join(home, "mind");
  const episodes = path.join(mindDir, "episodes");
  const beliefsDir = path.join(mindDir, "beliefs");
  const ledgerPath = path.join(mindDir, "beliefs.jsonl");
  const ioLogPath = path.join(home, "logs", "stacker-io.jsonl");
  fs.mkdirSync(episodes, { recursive: true });
  fs.writeFileSync(ledgerPath, "");
  for (const name of ["first", "second"]) fs.writeFileSync(path.join(episodes, `${name}.md`), `---\ndate: 2026-09-24\n---\n${name} quote\n`);
  git(mindDir, "init", "-q"); git(mindDir, "config", "user.name", "Test"); git(mindDir, "config", "user.email", "test@localhost");
  git(mindDir, "add", "."); git(mindDir, "commit", "-qm", "seed");
  const ready = path.join(home, "ready"); const release = path.join(home, "release");
  const module = path.join(import.meta.dir, "stack.ts");
  const childCode = `import { stackEpisode } from ${JSON.stringify(module)};
    import * as fs from 'node:fs';
    await stackEpisode({mindDir:${JSON.stringify(mindDir)},beliefsDir:${JSON.stringify(beliefsDir)},ledgerPath:${JSON.stringify(ledgerPath)},ioLogPath:${JSON.stringify(ioLogPath)},filename:'first.md',correlationId:'one',
      extract:async()=> 'kind: doctrine\\nclaim: "first claim"\\nwhy: "because"\\nquote: "first quote"\\n',
      beforeCAS:()=>{fs.writeFileSync(${JSON.stringify(ready)},'yes');while(!fs.existsSync(${JSON.stringify(release)})) Bun.sleepSync(10)} });`;
  const child = spawn("bun", ["-e", childCode], { env: { ...process.env, CIRCADIAN_HOME: home }, stdio: ["ignore", "pipe", "pipe"] });
  let childErr = ""; child.stderr.on("data", chunk => childErr += chunk);
  const exited = new Promise<number | null>(resolve => child.on("exit", resolve));
  try {
    for (let i = 0; i < 500 && !fs.existsSync(ready); i++) await Bun.sleep(10);
    expect(fs.existsSync(ready)).toBe(true);
    const result = await stackEpisode({ mindDir, beliefsDir, ledgerPath, ioLogPath, filename: "second.md", correlationId: "two",
      extract: async () => 'kind: doctrine\nclaim: "second claim"\nwhy: "because"\nquote: "second quote"\n' });
    expect(result.failed).toBeUndefined();
    fs.writeFileSync(release, "go");
    expect(await exited).toBe(0);
    const ledger = fs.readFileSync(ledgerPath, "utf8").trim().split("\n").map(JSON.parse);
    expect(ledger).toHaveLength(2);
    expect(new Set(ledger.map(e => e.ep))).toEqual(new Set(["first.md", "second.md"]));
    expect(git(mindDir, "rev-list", "--count", "HEAD")).toBe("3");
    const events = fs.readFileSync(path.join(home, "logs", "circadian.events.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
    expect(events.filter(e => e.phase === "publish-conflict")).toHaveLength(1);
  } finally {
    if (!fs.existsSync(release)) fs.writeFileSync(release, "go");
    await exited;
    fs.rmSync(home, { recursive: true, force: true });
    delete process.env.CIRCADIAN_HOME;
  }
});
