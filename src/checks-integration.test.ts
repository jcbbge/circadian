import { expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { tmpdir } from "node:os";
import { appendLedger, writeAtom } from "./atoms.ts";
import { setChecksEnabled, setViewsEnabled } from "./extensions.ts";
import { callTool, enabledViewTools, handle } from "./serve.ts";
import { memoryView, memoryExpand } from "./views.ts";
import { checkMemoryChecks } from "./checks-ops.ts";
import { checksInstructions } from "./views-usage.ts";

function fixture() {
  const home = fs.mkdtempSync(path.join(tmpdir(), "circadian-checks-")), mind = path.join(home, "mind");
  const source = "2026-01-01-journey.md", content = "# Journey preference\nscope: global\nI may prefer a train for a short journey.\n";
  fs.mkdirSync(path.join(mind, "episodes"), { recursive: true });
  fs.writeFileSync(path.join(mind, "episodes", source), content);
  const { id } = writeAtom(path.join(mind, "beliefs"), { kind: "agreement", scope: "global", claim: "May prefer a train for a short journey", why: "Conditional preference", eps: ["2026-01-01"], quotes: [{ text: "I may prefer a train for a short journey.", source }] });
  appendLedger(path.join(mind, "beliefs.jsonl"), { ev: "stack", atom: id, ep: source, ts: "2026-01-01" });
  const view = memoryView(mind, "global");
  if (view.kind !== "view") throw new Error("fixture view unavailable");
  const ref = view.records[0].ref, expansion = memoryExpand(mind, [ref]);
  if (expansion.kind !== "expansion" || expansion.entries[0].status !== "available") throw new Error("fixture expansion unavailable");
  const revision = expansion.entries[0].sources[0];
  if (revision.status !== "available") throw new Error("fixture source unavailable");
  const input = { refs: [ref], selections: [{ atomId: id, source, sourceRevision: revision.revision, start: content.indexOf("I may"), end: content.length - 1 }] };
  return { home, mind, content, input };
}
function snapshot(dir: string) {
  return fs.readdirSync(dir, { recursive: true }).map(String).sort().flatMap(name => {
    const file = path.join(dir, name); return fs.statSync(file).isFile() ? [[name, fs.readFileSync(file, "utf8")]] : [];
  });
}
async function cli(home: string, entry: string, args: string[], input?: string) {
  const child = Bun.spawn([process.execPath, entry, ...args], { env: { ...process.env, CIRCADIAN_HOME: home, CIRCADIAN_STATUSLINE_CACHE: "off" }, stdin: input === undefined ? "ignore" : "pipe", stdout: "pipe", stderr: "pipe" });
  if (input !== undefined) { (child.stdin as any).write(input); (child.stdin as any).end(); }
  const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  return { out, err, code };
}

test("MCP discovers checks independently, reads exact evidence and immediately enforces disable", async () => {
  const f = fixture();
  try {
    const before = snapshot(f.mind);
    expect(enabledViewTools(f.home)).toEqual([]);
    await expect(callTool(f.home, "memory_check", f.input)).rejects.toThrow("disabled");
    expect(checkMemoryChecks(f.home).check).toBe("OFF");
    setChecksEnabled(f.home, true);
    expect(enabledViewTools(f.home).map(t => t.name)).toEqual(["memory_check"]);
    expect(checkMemoryChecks(f.home).check).toBe("PASS");
    expect(checksInstructions(false)).toContain("views are OFF");
    const sourcePath = path.join(f.mind, "episodes", f.input.selections[0].source);
    fs.writeFileSync(sourcePath, " ".repeat(256) + f.content);
    expect(checkMemoryChecks(f.home).check).toBe("PASS");
    fs.writeFileSync(sourcePath, f.content);
    const response: any = await handle(f.home, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "memory_check", arguments: f.input } });
    expect(response.result.isError).toBeUndefined();
    const data = JSON.parse(response.result.content[0].text);
    expect(data.selections[0].quote).toBe("I may prefer a train for a short journey.");
    expect(data.selections[0].label).toBe("Journey preference");
    expect(data.selections[0].semantic).toBe("UNKNOWN");
    setChecksEnabled(f.home, false);
    const disabled: any = await handle(f.home, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "memory_check", arguments: f.input } });
    expect(disabled.result.isError).toBe(true);
    expect(snapshot(f.mind)).toEqual(before);
  } finally { fs.rmSync(f.home, { recursive: true, force: true }); }
});

test("both CLI doors expose controls, live checks and bounded JSON file/stdin requests", async () => {
  const f = fixture();
  try {
    const input = path.join(f.home, "input.json"); fs.writeFileSync(input, JSON.stringify(f.input));
    for (const entry of [path.join(import.meta.dir, "../bin/circadian"), path.join(import.meta.dir, "archaeology.ts")]) {
      expect((await cli(f.home, entry, ["extensions", "enable", "checks"])).out).toContain("Memory checks: ON");
      expect((await cli(f.home, entry, ["extensions", "check", "checks"])).out).toContain("Memory checks check: PASS");
      const file = await cli(f.home, entry, ["check", "--input", input]);
      const stdin = await cli(f.home, entry, ["check", "--input", "-"], JSON.stringify(f.input));
      expect(file.code).toBe(0); expect(stdin.code).toBe(0);
      expect(JSON.parse(file.out)).toEqual(JSON.parse(stdin.out));
      expect((await cli(f.home, entry, ["check", "--input", "-"], "x".repeat(65537))).code).toBe(1);
      expect((await cli(f.home, entry, ["extensions", "disable", "checks"])).out).toContain("Memory checks: OFF");
      expect((await cli(f.home, entry, ["check", "--input", input])).code).toBe(1);
    }
  } finally { fs.rmSync(f.home, { recursive: true, force: true }); }
}, 20000);

test("native Pi registration executes real check handlers and preserves immediate disable", async () => {
  const f = fixture();
  try {
    setViewsEnabled(f.home, true); setChecksEnabled(f.home, true);
    const script = `
      import extension from ${JSON.stringify(path.join(import.meta.dir, "circadian-mind.ts"))};
      import {setChecksEnabled} from ${JSON.stringify(path.join(import.meta.dir, "extensions.ts"))};
      const tools=new Map(); extension({registerTool:t=>tools.set(t.name,t),on:()=>{}});
      const result=JSON.parse((await tools.get('memory_check').execute('check',${JSON.stringify(f.input)})).content[0].text);
      setChecksEnabled(process.env.CIRCADIAN_HOME,false);let disabled=false;
      try{await tools.get('memory_check').execute('check',${JSON.stringify(f.input)})}catch{disabled=true}
      console.log(JSON.stringify({registered:[...tools.keys()],result,disabled}));
    `;
    const child = Bun.spawn([process.execPath, "-e", script], { env: { ...process.env, CIRCADIAN_HOME: f.home }, stdout: "pipe", stderr: "pipe" });
    const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    expect(code, err).toBe(0); const result = JSON.parse(out);
    expect(result.registered).toContain("memory_check");
    expect(result.result.selections[0].status).toBe("source-current-exact");
    expect(result.disabled).toBe(true);
    expect(checksInstructions()).toContain("semantic truth remains UNKNOWN");
    expect(checksInstructions()).toContain("quote-lines");
  } finally { fs.rmSync(f.home, { recursive: true, force: true }); }
}, 20000);
