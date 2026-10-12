import { test, expect } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { appendLedger, writeAtom } from "./atoms.ts";

const checkoutCli = path.join(import.meta.dir, "../bin/circadian");
const publishedCli = path.join(import.meta.dir, "archaeology.ts");
const server = path.join(import.meta.dir, "serve.ts");
const baselineTools = ["memory_search", "memory_read", "memory_history", "memory_recall", "memory_status", "memory_request_change"];

function fixture() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "circadian-views-doors-"));
  const mind = path.join(home, "mind"), episode = "2026-01-01-travel.md";
  const source = "# Travel preference\nscope: travel\nI prefer the train when the journey takes less than four hours.\n";
  fs.mkdirSync(path.join(mind, "episodes"), { recursive: true });
  fs.writeFileSync(path.join(mind, "episodes", episode), source);
  fs.writeFileSync(path.join(mind, "NOW.md"), "# Current handoff\n");
  const { id } = writeAtom(path.join(mind, "beliefs"), { kind: "doctrine", claim: "Prefer the train for journeys under four hours.", why: "Travel time controls this preference.", quotes: [{ text: "I prefer the train when the journey takes less than four hours.", source: episode }], eps: ["2026-01-01"], scope: "travel" });
  appendLedger(path.join(mind, "beliefs.jsonl"), { ev: "stack", atom: id, ep: episode, ts: "2026-01-01" });
  return { home, mind, id, episode, source };
}

async function cli(home: string, args: string[], entry = checkoutCli) {
  const child = Bun.spawn([process.execPath, entry, ...args], { env: { ...process.env, CIRCADIAN_HOME: home }, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  expect(stdout.trim().split("\n")).toHaveLength(1);
  return { data: JSON.parse(stdout), stderr, code };
}

function mcp(home: string) {
  const child = spawn(process.execPath, [server], { env: { ...process.env, CIRCADIAN_HOME: home }, stdio: ["pipe", "pipe", "pipe"] });
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  let nextId = 0, stderr = "";
  child.stderr.on("data", bytes => { stderr += bytes.toString(); });
  const lines = createInterface({ input: child.stdout });
  lines.on("line", line => {
    const value = JSON.parse(line), waiter = pending.get(value.id);
    if (waiter) { clearTimeout(waiter.timer); pending.delete(value.id); waiter.resolve(value); }
  });
  const exited = new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", code => {
      for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(new Error(`MCP exited early (${code}): ${stderr}`)); }
      pending.clear();
      resolve();
    });
  });
  const send = (method: string, params?: object): Promise<any> => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`MCP timeout for ${method}: ${stderr}`)); }, 5000);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
  return { send, call: (name: string, args: object) => send("tools/call", { name, arguments: args }), close: async () => { child.stdin.end(); await exited; lines.close(); } };
}

function payload(response: any) { return JSON.parse(response.result.content[0].text); }
function snapshot(dir: string): Record<string, string> {
  return Object.fromEntries(fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile()).map(entry => {
    const file = path.join(entry.parentPath, entry.name);
    return [path.relative(dir, file), fs.readFileSync(file, "utf8")];
  }));
}

test("both installed CLI doors enable, read and expand the same whole memory without changing the mind", async () => {
  const f = fixture();
  try {
    const before = snapshot(f.mind);
    expect((await cli(f.home, ["extensions", "status"])).data).toEqual({ views: false });
    const disabled = await cli(f.home, ["view", "travel"]);
    expect(disabled.code).toBe(1);
    expect(disabled.data.reason).toContain("enable views");
    expect((await cli(f.home, ["extensions", "enable", "views"], publishedCli)).data).toEqual({ views: true });
    const viewed = await cli(f.home, ["view", "travel", "--chars", "6000"], publishedCli);
    expect(viewed.code).toBe(0);
    expect(viewed.data.records).toHaveLength(1);
    expect(viewed.data.records[0].atom.claim).toBe("Prefer the train for journeys under four hours.");
    expect(JSON.stringify(viewed.data).length).toBeLessThanOrEqual(6000);
    const ref = viewed.data.records[0].ref;
    const expanded = await cli(f.home, ["expand", `${ref.id}@${ref.revision}`]);
    expect(expanded.code).toBe(0);
    expect(expanded.data.entries[0].status).toBe("available");
    expect(expanded.data.entries[0].sources[0].content).toBe(f.source);
    expect(snapshot(f.mind)).toEqual(before);
    expect((await cli(f.home, ["extensions", "disable", "views"])).data).toEqual({ views: false });
    expect((await cli(f.home, ["expand", `${ref.id}@${ref.revision}`], publishedCli)).code).toBe(1);
  } finally { fs.rmSync(f.home, { recursive: true, force: true }); }
});

test("CLI rejects extra/duplicate/malformed arguments and reports core budget failures once", async () => {
  const f = fixture();
  try {
    await cli(f.home, ["extensions", "enable", "views"]);
    const invalid = [
      ["extensions", "enable", "views", "extra"],
      ["extensions", "status", "extra"],
      ["view", "travel", "another-scope"],
      ["view", "../travel"],
      ["view", "travel", "--unknown", "1"],
      ["view", "travel", "--chars", "6000", "--chars", "5000"],
      ["view", "travel", "--chars", "1.5"],
      ["view", "travel", "--chars"],
      ["view", "travel", "--max-records", "101"],
      ["expand"], ["expand", "../outside@fake"],
      ["expand", `${f.id}@${"a".repeat(64)}`, "--max-records", "1"],
    ];
    for (const args of invalid) {
      const result = await cli(f.home, args);
      expect(result.code).toBe(1);
      expect(result.data.kind).toBe("invalid-input");
    }
    const badBudget = await cli(f.home, ["view", "travel", "--chars", "0"]);
    expect(badBudget.code).toBe(1);
    expect(badBudget.data.kind).toBe("invalid-budget");
    const bounded = await cli(f.home, ["view", "travel", "--chars", "400"]);
    expect(bounded.code).toBe(0);
    expect(JSON.stringify(bounded.data).length).toBeLessThanOrEqual(400);
    expect(bounded.data.records).toHaveLength(0);
    expect(bounded.data.coverage.omitted).toBe(1);
    expect(bounded.data.coverage.complete).toBe(false);
    expect(bounded.stderr).toContain("partial coverage");
    expect(bounded.stderr).toContain(" OK ");
    expect(bounded.stderr).not.toContain("DEGRADED");
  } finally { fs.rmSync(f.home, { recursive: true, force: true }); }
});

test("running MCP discovers opt-in tools, enforces revisions and forgetting, and returns to baseline when disabled", async () => {
  const f = fixture(), client = mcp(f.home);
  try {
    expect((await client.send("initialize")).result.capabilities).toEqual({ tools: {} });
    expect((await client.send("tools/list")).result.tools.map((tool: any) => tool.name)).toEqual(baselineTools);
    expect((await client.call("memory_view", { scope: "travel" })).result.isError).toBe(true);
    await cli(f.home, ["extensions", "enable", "views"]);
    expect((await client.send("tools/list")).result.tools.map((tool: any) => tool.name)).toEqual([...baselineTools, "memory_view", "memory_expand"]);
    const viewedResponse = await client.call("memory_view", { scope: "travel", chars: 6000 });
    expect(viewedResponse.result.isError).toBeUndefined();
    const view = payload(viewedResponse), ref = view.records[0].ref;
    expect(view.coverage.complete).toBe(true);
    expect(viewedResponse.result.content[0].text.length).toBeLessThanOrEqual(6000);
    const expandedResponse = await client.call("memory_expand", { refs: [ref] });
    expect(payload(expandedResponse).entries[0].sources[0].content).toBe(f.source);
    const tooSmall = await client.call("memory_expand", { refs: [ref], chars: 400 });
    expect(tooSmall.result.isError).toBeUndefined();
    expect(tooSmall.result.content[0].text.length).toBeLessThanOrEqual(400);
    expect(payload(tooSmall).entries[0].status).toBe("over-budget");
    expect((await client.call("memory_view", { scope: "travel", chars: 0 })).result.isError).toBe(true);
    expect((await client.call("memory_view", { scope: "travel", unknown: true })).result.isError).toBe(true);
    expect((await client.call("memory_expand", { refs: [{ ...ref, unknown: true }] })).result.isError).toBe(true);
    expect((await client.call("memory_expand", { refs: [] })).result.isError).toBe(true);
    fs.appendFileSync(path.join(f.mind, "episodes", f.episode), "A later revision changes the observed source.\n");
    const stale = payload(await client.call("memory_expand", { refs: [ref] }));
    expect(stale.entries[0]).toEqual({ ref, status: "changed-revision" });
    const fresh = payload(await client.call("memory_view", { scope: "travel" })).records[0].ref;
    appendLedger(path.join(f.mind, "beliefs.jsonl"), { ev: "forget", atom: f.id, reason: "Fixture retirement", ts: "2026-01-02" });
    const forgotten = payload(await client.call("memory_expand", { refs: [fresh] }));
    expect(forgotten.entries[0]).toEqual({ ref: fresh, status: "ineligible" });
    await cli(f.home, ["extensions", "disable", "views"]);
    expect((await client.send("tools/list")).result.tools.map((tool: any) => tool.name)).toEqual(baselineTools);
    expect((await client.call("memory_expand", { refs: [fresh] })).result.isError).toBe(true);
  } finally { await client.close(); fs.rmSync(f.home, { recursive: true, force: true }); }
});

test("malformed extension config does not disable ordinary MCP tools", async () => {
  const f = fixture(), client = mcp(f.home);
  try {
    fs.writeFileSync(path.join(f.home, "extensions.json"), "{broken");
    expect((await client.send("tools/list")).result.tools.map((tool: any) => tool.name)).toEqual(baselineTools);
    expect(payload(await client.call("memory_recall", { scope: "global" })).now).toBe("# Current handoff\n");
    expect((await client.call("memory_view", { scope: "travel" })).result.isError).toBe(true);
    const status = await cli(f.home, ["extensions", "status"]);
    expect(status.code).toBe(1);
    expect(status.data.views).toBe(false);
    expect(status.data.error).toContain("extensions.json");
  } finally { await client.close(); fs.rmSync(f.home, { recursive: true, force: true }); }
});
