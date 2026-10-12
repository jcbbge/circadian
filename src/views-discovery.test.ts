import { afterAll, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendLedger, writeAtom } from "./atoms.ts";
import { readExtensions, setViewsEnabled } from "./extensions.ts";
import { enabledViewTools } from "./serve.ts";
import { buildPayload, hookOutputs, HOOK_OUTPUT_LIMIT, splitForHook } from "./wake-payload.ts";
import { payloadScope } from "./wake-notice.ts";
import { viewsInstructions } from "./views-usage.ts";

const root = mkdtempSync(join(tmpdir(), "circadian-views-discovery-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function fixture() {
  const home = mkdtempSync(join(root, "home-"));
  const mind = join(home, "mind"), project = join(home, "travel");
  cpSync(join(import.meta.dir, "../templates"), mind, { recursive: true });
  mkdirSync(project);
  mkdirSync(join(mind, "episodes"), { recursive: true });
  writeFileSync(join(mind, "scopes.tsv"), `travel\t${project}\tactive\n`);
  writeFileSync(join(mind, "scoreboard.jsonl"), JSON.stringify({ type: "wake", ts: new Date().toISOString(), scope: "travel" }) + "\n");
  const source = "2026-01-01-travel.md";
  writeFileSync(join(mind, "episodes", source), "# Travel\nscope: travel\nI prefer trains for journeys under four hours.\n");
  const { id } = writeAtom(join(mind, "beliefs"), { kind: "doctrine", claim: "Prefer trains for journeys under four hours.", why: "Journey length matters.", quotes: [{ text: "I prefer trains for journeys under four hours.", source }], eps: ["2026-01-01"], scope: "travel" });
  appendLedger(join(mind, "beliefs.jsonl"), { ev: "stack", atom: id, ep: source, ts: "2026-01-01" });
  // Only the read/startup scripts exist at this isolated install path. The
  // detached catch-up target is absent, so this test cannot run REM/inference.
  mkdirSync(join(home, "src"));
  for (const name of ["wake.ts", "status.ts"]) symlinkSync(join(import.meta.dir, name), join(home, "src", name));
  return { home, project };
}

function env(home: string): Record<string, string> {
  const values = { ...process.env, CIRCADIAN_HOME: home, CIRCADIAN_BUN_BIN: process.execPath, CIRCADIAN_INVOCATION_LEDGER: "off", CIRCADIAN_STATUSLINE_CACHE: "off" } as Record<string, string>;
  for (const key of ["CIRCADIAN_ROLE", "CIRCADIAN_SCOPE", "CIRCADIAN_LANE", "CIRCADIAN_INTERNAL", "CIRCADIAN_SESSION", "CIRCADIAN_WAKE_SOURCE"]) delete values[key];
  return values;
}

async function run(home: string, args: string[], cwd = home, input?: string) {
  const child = Bun.spawn([process.execPath, ...args], { cwd, env: env(home), stdin: input === undefined ? "ignore" : "pipe", stdout: "pipe", stderr: "pipe" });
  if (input !== undefined) {
    const stdin = child.stdin as import("bun").FileSink;
    stdin.write(input);
    stdin.end();
  }
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  expect(code, stderr).toBe(0);
  return stdout;
}

test("enabled usage stays outside memory and survives every wake layout and hook splitting", () => {
  const content = { self: "## Doctrine\nKeep evidence.\n", user: "## Preferences\nBe concise.\n", now: "## Next move\nPlan the journey.\n\n## Last sleep\n" + new Date().toISOString(), greeting: "Resume planning.", constitution: "Constitution text.\n".repeat(1200) };
  for (const scope of [undefined, "global", "travel"]) {
    for (const slim of [false, true]) {
      for (const killSwitch of [false, true]) {
        const options = { ...content, scope, slim, killSwitch };
        const disabled = buildPayload(options), note = viewsInstructions(scope);
        const enabled = buildPayload({ ...options, capabilities: note });
        expect(note.length).toBeLessThanOrEqual(1200);
        expect(buildPayload({ ...options, capabilities: "" })).toBe(disabled);
        expect(enabled.replace(note + "\n", "").replace("\n\n\n", "\n\n")).toBe(disabled);
        expect(enabled.indexOf(note)).toBeLessThan(enabled.indexOf("<mind:"));
        if (scope) expect(payloadScope(enabled)).toBe(scope);
        expect(splitForHook(enabled).join("")).toBe(enabled);
        const parts = hookOutputs(enabled, "/isolated/wake.json");
        expect(parts[0]).toContain(note);
        for (const part of parts) expect(Buffer.byteLength(part) + 1).toBeLessThanOrEqual(HOOK_OUTPUT_LIMIT);
      }
    }
  }
});

test("actual isolated wake adds enabled usage and tolerates disabled or malformed config", async () => {
  const { home, project } = fixture();
  const args = [join(import.meta.dir, "wake.ts")];
  expect(await run(home, args, project)).not.toContain("Coordinated views ON");
  setViewsEnabled(home, true);
  const enabled = await run(home, args, project);
  expect(payloadScope(enabled)).toBe("travel");
  expect(enabled).toContain(viewsInstructions("travel"));
  expect(enabled.indexOf(viewsInstructions("travel"))).toBeLessThan(enabled.indexOf("<mind:"));
  writeFileSync(join(home, "extensions.json"), "not json");
  const malformed = await run(home, args, project);
  expect(payloadScope(malformed)).toBe("travel");
  expect(malformed).not.toContain("Coordinated views ON");
  expect(malformed).toContain("<mind:here");
});

test("visible status reports configuration without claiming usage, and disabled output is unchanged", async () => {
  const { home } = fixture();
  writeFileSync(join(home, "mind", "scoreboard.jsonl"), "");
  const args = [join(import.meta.dir, "status.ts"), "--line"];
  const absent = await run(home, args);
  setViewsEnabled(home, false);
  expect(await run(home, args)).toBe(absent);
  setViewsEnabled(home, true);
  expect(await run(home, args)).toBe(absent.trimEnd() + " · views ON\n");
  writeFileSync(join(home, "extensions.json"), "not json");
  expect(await run(home, args)).toBe(absent.trimEnd() + " · views CONFIG ERROR\n");
});

test("MCP discovers the same gated tool descriptions and tells the agent when to use them", async () => {
  const { home } = fixture();
  expect(enabledViewTools(home)).toEqual([]);
  setViewsEnabled(home, true);
  const line = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) + "\n";
  const response = JSON.parse(await run(home, [join(import.meta.dir, "serve.ts")], home, line));
  const optional = response.result.tools.slice(-2);
  expect(optional).toEqual(enabledViewTools(home));
  expect(optional.map((tool: { name: string }) => tool.name)).toEqual(["memory_view", "memory_expand"]);
  expect(optional[0].description).toContain("no user invocation required");
  expect(optional[0].description).toContain("Inspect coverage");
  expect(optional[1].description).toContain("refresh a changed view");
  setViewsEnabled(home, false);
  expect(enabledViewTools(home)).toEqual([]);
  writeFileSync(join(home, "extensions.json"), "not json");
  expect(readExtensions(home).error).toBeTruthy();
  expect(enabledViewTools(home)).toEqual([]);
});

test("native extension registers views on load, delivers real wake guidance and rejects disabled or invalid calls", async () => {
  const { home, project } = fixture();
  setViewsEnabled(home, true);
  // Capture the native registration boundary; execute the actual handlers,
  // filesystem tools and isolated wake. This checks delivery, not model obedience.
  const script = `
    import extension from ${JSON.stringify(join(import.meta.dir, "circadian-mind.ts"))};
    import { setViewsEnabled } from ${JSON.stringify(join(import.meta.dir, "extensions.ts"))};
    const tools = new Map(), handlers = new Map(), notices = [];
    extension({ registerTool: t => tools.set(t.name, t), on: (name, handler) => handlers.set(name, handler) });
    const registered = [...tools.keys()];
    const context = { hasUI: true, ui: { notify: message => notices.push(message) }, sessionManager: { getSessionId: () => "views-discovery", getSessionFile: () => undefined } };
    await handlers.get("session_start")({ reason: "new" }, context);
    const first = await handlers.get("before_agent_start")({}, context);
    const second = await handlers.get("before_agent_start")({}, context);
    const viewed = JSON.parse((await tools.get("memory_view").execute("view", { scope: "travel" })).content[0].text);
    const expanded = JSON.parse((await tools.get("memory_expand").execute("expand", { refs: [viewed.records[0].ref] })).content[0].text);
    let budgetError = "", disabledError = "";
    try { await tools.get("memory_view").execute("budget", { scope: "travel", chars: 0 }); } catch (e) { budgetError = e.message; }
    setViewsEnabled(process.env.CIRCADIAN_HOME, false);
    try { await tools.get("memory_view").execute("disabled", { scope: "travel" }); } catch (e) { disabledError = e.message; }
    const afterReload = [];
    extension({ registerTool: t => afterReload.push(t.name), on: () => {} });
    console.log(JSON.stringify({ registered, payload: first?.message.content, second: second ?? null, notices, included: viewed.coverage.included, expansion: expanded.entries[0].status, budgetError, disabledError, afterReload }));
  `;
  const actual = JSON.parse(await run(home, ["-e", script], project));
  const baseline = ["memory_search", "memory_read", "memory_history", "memory_status", "memory_request_change"];
  expect(actual.registered).toEqual([...baseline, "memory_view", "memory_expand"]);
  expect(actual.afterReload).toEqual(baseline);
  expect(actual.payload).toContain(viewsInstructions("travel"));
  expect(payloadScope(actual.payload)).toBe("travel");
  expect(actual.second).toBeNull();
  expect(actual.notices).toHaveLength(1);
  expect(actual.notices[0]).toContain("views ON");
  expect(actual.included).toBe(1);
  expect(actual.expansion).toBe("available");
  expect(JSON.parse(actual.budgetError).kind).toBe("invalid-budget");
  expect(actual.disabledError).toContain("disabled");
}, 20000);
