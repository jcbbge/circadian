import { test, expect } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const src = import.meta.dir;
const draft = `=== EPISODE ===\nARC: Parallel Work\n"first task" and "second task" were completed.\nuser-observed: nothing new\nwhat-changed: deepen the work\n=== NOW ===\n## Arc\nParallel work\n## Flight plan\nFinish the next task\n## Live tensions\n- Keep episodes\n## Commitments\nnone\n## Serendipity\n\n## Last sleep\n\n=== END ===`;
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "circ-vps-"));
  const mind = path.join(root, "mind");
  fs.mkdirSync(path.join(mind, "episodes"), { recursive: true });
  fs.mkdirSync(path.join(mind, "beliefs"));
  fs.mkdirSync(path.join(root, "logs"));
  fs.symlinkSync(src, path.join(root, "src"));
  for (const [name, content] of Object.entries({ "SELF.md": "", "NOW.md": "", "greeting.md": "", "beliefs.jsonl": "", "scoreboard.jsonl": "", "digested.jsonl": "", "render-manifest.json": "[]\n" })) fs.writeFileSync(path.join(mind, name), content);
  const git = (...args: string[]) => spawnSync("git", ["-C", mind, ...args], { encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "Test", GIT_COMMITTER_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_EMAIL: "test@example.invalid" } });
  git("init", "-q", "-b", "main"); git("add", "-A"); git("commit", "-q", "-m", "seed");
  const preload = path.join(root, "mock-fetch.ts");
  // In-process fetch replacement: no socket, no model. Each child inherits the
  // same deterministic fixture and only tests the CLI + file/ledger pipeline.
  fs.writeFileSync(preload, `globalThis.fetch = async (url) => {\n  if (process.env.MOCK_UP !== "1") { const e = new Error("refused"); e.code = "ECONNREFUSED"; throw e; }\n  if (String(url).endsWith("/models")) return new Response("{}", {status:200});\n  const text = process.env.MOCK_DRAFT === "1" ? ${JSON.stringify(draft)} : "none";\n  return new Response('data: ' + JSON.stringify({choices:[{delta:{content:text},finish_reason:"stop"}]}) + '\\n\\ndata: [DONE]\\n\\n', {status:200,headers:{"content-type":"text/event-stream"}});\n};\n`);
  const bun = path.join(root, "fake-bun");
  fs.writeFileSync(bun, `#!/bin/sh\nexec '${process.execPath}' --preload '${preload}' "$@"\n`, { mode: 0o755 });
  const env = { ...process.env, CIRCADIAN_HOME: root, CIRCADIAN_BUN_BIN: bun, CIRCADIAN_DRAIN_PACE_MS: "0", CIRCADIAN_ABSORB_PACE_MS: "0", CIRCADIAN_LLM_RETRIES: "1", CIRCADIAN_LLM_BASE_URL: "http://invalid.local/v1", MOCK_DRAFT: "1", MOCK_UP: "1", GIT_AUTHOR_NAME: "Test", GIT_COMMITTER_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_EMAIL: "test@example.invalid" };
  const run = (script: string, extra: Record<string, string> = {}) => spawnSync(process.execPath, ["--preload", preload, path.join(src, script)], { env: { ...env, ...extra }, encoding: "utf8" });
  const events = () => fs.readFileSync(path.join(root, "logs/circadian.events.jsonl"), "utf8").trim().split("\n").map(s => JSON.parse(s));
  const episodes = () => fs.readdirSync(path.join(mind, "episodes")).filter(s => s.endsWith(".md"));
  const transcript = (id: string) => { const p = path.join(root, `${id}.jsonl`); fs.writeFileSync(p, ["first task", "second task"].map(text => JSON.stringify({ message: { role: "user", content: text } })).join("\n") + "\n"); return p; };
  return { root, mind, preload, env, run, events, episodes, transcript };
}

const lines = (p: string) => fs.readFileSync(p, "utf8").trim().split("\n").filter(Boolean).map(s => JSON.parse(s));

test("five parallel SLEEPs preserve five same-arc episodes and ledger folds cleanly", async () => {
  const f = fixture();
  try {
    const workers = Array.from({ length: 5 }, (_, i) => new Promise<number>((resolve) => {
      const id = `parallel-${i}`;
      const child = spawn(process.execPath, ["--preload", f.preload, path.join(src, "sleep.ts"), "--worker"], { env: { ...f.env, CIRCADIAN_SLEEP_EVENT: JSON.stringify({ session_id: id, transcript_path: f.transcript(id), scope: "global" }) }, stdio: "ignore" });
      child.on("exit", code => resolve(code ?? 1));
    }));
    expect(await Promise.all(workers)).toEqual([0, 0, 0, 0, 0]);
    expect(f.episodes()).toHaveLength(5);
    expect(new Set(f.episodes().map(ep => fs.readFileSync(path.join(f.mind, "episodes", ep), "utf8").match(/session: (.*)/)?.[1])).size).toBe(5);
    const scores = lines(path.join(f.mind, "scoreboard.jsonl"));
    expect(scores.filter(e => e.type === "sleep")).toHaveLength(5);
    const rem = f.run("rem-popmem.ts", { MOCK_DRAFT: "0" });
    expect(rem.status).toBe(0);
    const digest = lines(path.join(f.mind, "digested.jsonl"));
    expect(digest.filter(e => e.disposition === "absorbed")).toHaveLength(5);
    expect(new Set(digest.map(e => e.filename)).size).toBe(5);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
}, 60000);

test("endpoint down queues a short SessionEnd and REM defers without loss; next REM digests backlog", async () => {
  const f = fixture();
  try {
    const id = "outage-session";
    const evt = JSON.stringify({ session_id: id, transcript_path: f.transcript(id), scope: "global" });
    // The real SessionEnd hook must detach even for a tiny transcript.
    expect(spawnSync(process.execPath, ["--preload", f.preload, path.join(src, "sleep.ts")], { env: { ...f.env, MOCK_UP: "0" }, input: evt, encoding: "utf8" }).status).toBe(0);
    const queue = path.join(f.root, "logs/pending-sleep.jsonl");
    for (let i = 0; i < 200 && !fs.existsSync(queue); i++) await Bun.sleep(20);
    expect(fs.existsSync(queue)).toBe(true);
    expect(f.episodes()).toHaveLength(0);
    expect(lines(queue).some(e => e.session_id === id)).toBe(true);
    expect(f.run("rem-popmem.ts", { MOCK_UP: "0" }).status).toBe(0);
    expect(lines(queue)).toHaveLength(1);
    expect(f.events().some(e => e.process === "rem" && e.phase === "model-absent" && e.outcome === "degraded" && e.cause && e.next_action)).toBe(true);
    const recovered = f.run("rem-popmem.ts");
    expect(recovered.status).toBe(0);
    expect(lines(queue)).toHaveLength(0);
    expect(f.episodes()).toHaveLength(1);
    expect(lines(path.join(f.mind, "digested.jsonl")).some(e => e.disposition === "absorbed")).toBe(true);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
}, 60000);
