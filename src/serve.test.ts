import { test, expect } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { writeAtom, appendLedger } from "./atoms.ts";
import { buildIndex, saveIndex } from "./relindex.ts";

const server = path.join(import.meta.dir, "serve.ts");
test("MCP stdio lists six tools; reads pinned evidence under 100ms and writes only a change intent", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "circadian-serve-"));
  const mind = path.join(home, "mind");
  const ep = "2026-01-01-stutter.md";
  try {
    fs.mkdirSync(path.join(mind, "episodes"), { recursive: true });
    fs.writeFileSync(path.join(mind, "episodes", ep), "# stutter\nA stutter resolved in testing.\n");
    fs.writeFileSync(path.join(mind, "SELF.md"), "# mind\n- continuity [ep:2026-01-01]\n");
    fs.writeFileSync(path.join(mind, "NOW.md"), "# now\n");
    fs.writeFileSync(path.join(mind, "scoreboard.jsonl"), JSON.stringify({ ts: "2026-01-02T00:00:00Z", type: "verdict", worldview_tokens: 1, greeting_verdict: "ok" }) + "\n");
    const { id } = writeAtom(path.join(mind, "beliefs"), { kind: "doctrine", claim: "stutter resolved by tests", why: "observed", quotes: [{ text: "stutter", source: ep }], eps: ["2026-01-01"] });
    appendLedger(path.join(mind, "beliefs.jsonl"), { ev: "stack", atom: id, ep, ts: "2026-01-01" });
    // More recent episode makes the atom deep (hot limit overridden to zero).
    appendLedger(path.join(mind, "beliefs.jsonl"), { ev: "stack", atom: "another", ep: "2026-01-02-new.md", ts: "2026-01-02" });
    saveIndex(mind, (await buildIndex(mind)).index, null);
    // A real git mind, so zoom's history path is exercised, without touching a live mind.
    spawnSync("git", ["init", "-q", mind]);
    spawnSync("git", ["-C", mind, "add", "."]);
    spawnSync("git", ["-C", mind, "-c", "user.name=test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture"]);
    const before = fs.readFileSync(path.join(mind, "beliefs", `${id}.md`), "utf8");
    const child = spawn(process.execPath, [server], { env: { ...process.env, CIRCADIAN_HOME: home, CIRCADIAN_EMBED: "0" }, stdio: ["pipe", "pipe", "pipe"] });
    let buf = "";
    const responses: any[] = [];
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", chunk => {
      buf += chunk;
      let i; while ((i = buf.indexOf("\n")) >= 0) { responses.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); }
    });
    const send = async (id: number, method: string, params?: object) => {
      const start = performance.now();
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      for (let n = 0; n < 1000; n++) {
        const hit = responses.find(r => r.id === id);
        if (hit) return { hit, ms: performance.now() - start };
        await Bun.sleep(2);
      }
      throw new Error(`timeout waiting for ${method}`);
    };
    try {
      expect((await send(1, "initialize")).hit.result.capabilities).toEqual({ tools: {} });
      expect((await send(2, "tools/list")).hit.result.tools.map((t: any) => t.name)).toEqual([
        "memory_search", "memory_read", "memory_history", "memory_recall", "memory_status", "memory_request_change",
      ]);
      const unpack = (r: any) => JSON.parse(r.hit.result.content[0].text);
      const searched = await send(3, "tools/call", { name: "memory_search", arguments: { query: "stutter" } });
      expect(searched.ms).toBeLessThan(100);
      expect(unpack(searched).some((r: any) => r.id === `beliefs/${id}.md` && r.source === `${id}.md` && r.date === "2026-01-01")).toBe(true);
      const deep = unpack(await send(4, "tools/call", { name: "memory_search", arguments: { query: "stutter", depth: 1 } }));
      expect(deep[0].id).toBe(`beliefs/${id}.md`);
      expect(deep[0].provenance.episode).toBe(ep);
      expect(unpack(await send(5, "tools/call", { name: "memory_read", arguments: { id: `beliefs/${id}.md` } })).content).toBe(before);
      expect(unpack(await send(6, "tools/call", { name: "memory_history", arguments: { query: `beliefs/${id}.md` } }))[0].citations).toContain("- continuity [ep:2026-01-01]");
      const vitals = unpack(await send(7, "tools/call", { name: "memory_status", arguments: {} }));
      expect(vitals.token_counts["SELF.md"].cap).toBe(6000);
      expect(vitals.verdicts.total).toBe(1);
      fs.rmSync(path.join(mind, "episodes", ep));
      spawnSync("git", ["-C", mind, "add", "-u"]);
      spawnSync("git", ["-C", mind, "-c", "user.name=test", "-c", "user.email=test@example.invalid", "commit", "-qm", "compost fixture"]);
      const archived = unpack(await send(11, "tools/call", { name: "memory_read", arguments: { id: `episodes/${ep}` } }));
      expect(archived[0].composted).toBe(true);
      expect(archived[0].content).toContain("stutter resolved");
      expect(unpack(await send(12, "tools/call", { name: "memory_history", arguments: { query: ep } }))[0].deletingCommit).toBeTruthy();
      fs.symlinkSync(path.join(home, "outside.md"), path.join(mind, "beliefs", "outside.md"));
      fs.writeFileSync(path.join(home, "outside.md"), "secret");
      expect((await send(13, "tools/call", { name: "memory_read", arguments: { id: "beliefs/outside.md" } })).hit.result.isError).toBe(true);
      const result = unpack(await send(8, "tools/call", { name: "memory_request_change", arguments: { change: "Consider revising stutter", source: ep } }));
      expect(result.state).toBe("pending-stacker-review");
      expect(JSON.parse(fs.readFileSync(path.join(home, "logs", "change-requests", `${result.id}.json`), "utf8")).change).toBe("Consider revising stutter");
      expect(fs.readFileSync(path.join(mind, "beliefs", `${id}.md`), "utf8")).toBe(before);
      expect((await send(9, "tools/call", { name: "memory_read", arguments: { id: "beliefs/../../secret.md" } })).hit.result.isError).toBe(true);
      expect((await send(10, "tools/call", { name: "memory_search", arguments: { query: "stutter", depth: -1 } })).hit.result.isError).toBe(true);
    } finally { child.stdin.end(); child.kill(); }
    expect(fs.readFileSync(path.join(mind, "beliefs", `${id}.md`), "utf8")).toBe(before);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});
