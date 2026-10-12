import { test, expect } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { tmpdir } from "node:os";
import { appendLedger, writeAtom } from "./atoms.ts";
import { setViewsEnabled } from "./extensions.ts";
import { checkViews, viewsStatus } from "./views-ops.ts";

function setup() {
  const home = fs.mkdtempSync(path.join(tmpdir(), "circadian-views-ops-"));
  const mind = path.join(home, "mind"), ep = "2026-10-12-travel.md";
  fs.mkdirSync(path.join(mind, "episodes"), { recursive: true });
  fs.writeFileSync(path.join(mind, "episodes", ep), "scope: global\nI prefer trains for shorter journeys.\n");
  const { id } = writeAtom(path.join(mind, "beliefs"), { kind: "doctrine", claim: "Prefer trains for shorter journeys", why: "Travel preference", scope: "global", quotes: [{ text: "I prefer trains for shorter journeys.", source: ep }], eps: ["2026-10-12"] });
  appendLedger(path.join(mind, "beliefs.jsonl"), { ev: "stack", atom: id, ep, ts: "2026-10-12" });
  return { home, mind, ep, id };
}
function snapshot(dir: string) {
  return fs.readdirSync(dir, { recursive: true }).map(String).sort().flatMap(name => {
    const file = path.join(dir, name);
    return fs.statSync(file).isFile() ? [[name, fs.readFileSync(file, "utf8")]] : [];
  });
}
async function cli(home: string, args: string[], published = false) {
  const child = Bun.spawn([process.execPath, path.join(import.meta.dir, published ? "archaeology.ts" : "../bin/circadian"), ...args], { env: { ...process.env, CIRCADIAN_HOME: home }, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  return { stdout, stderr, code };
}

test("live check distinguishes disabled, working, absent evidence and empty population without mind writes", () => {
  const f = setup();
  try {
    expect(checkViews(f.home).check).toBe("OFF");
    setViewsEnabled(f.home, true);
    const before = snapshot(f.mind);
    const result = checkViews(f.home);
    expect(result.check).toBe("PASS");
    expect(result.checks).toEqual({ viewWithinBudget: true, expansionWithinBudget: true, atomMatchesFile: true, sourcesMatchFiles: true });
    expect(snapshot(f.mind)).toEqual(before);
    for (const empty of ["", " \n\t"]) {
      fs.writeFileSync(path.join(f.mind, "episodes", f.ep), empty);
      expect(checkViews(f.home).check).toBe("INCOMPLETE");
    }
    fs.unlinkSync(path.join(f.mind, "episodes", f.ep));
    expect(checkViews(f.home).check).toBe("INCOMPLETE");
    appendLedger(path.join(f.mind, "beliefs.jsonl"), { ev: "forget", atom: f.id, reason: "fixture correction", ts: "2026-10-12" });
    expect(checkViews(f.home).check).toBe("INCOMPLETE");
    fs.writeFileSync(path.join(f.home, "extensions.json"), "{");
    expect(checkViews(f.home).check).toBe("FAIL");
  } finally { fs.rmSync(f.home, { recursive: true, force: true }); }
});

test("status reports recent actual requests but does not count checks as agent use", () => {
  const f = setup();
  try {
    expect(viewsStatus(f.home)).toMatchObject({ views: false, lastRequest: null });
    fs.mkdirSync(path.join(f.home, "logs"));
    const event = { process: "ops", phase: "mcp-memory_view", outcome: "ok", ts: "2026-10-12T12:00:00Z" };
    const file = path.join(f.home, "logs", "circadian.events.jsonl");
    fs.writeFileSync(file, "ignored".repeat(20000) + "\n" + JSON.stringify(event) + "\n" + JSON.stringify({ ...event, phase: "cli-extensions", ts: "2026-10-12T12:01:00Z" }) + "\n");
    expect(viewsStatus(f.home).lastRequest).toEqual({ at: event.ts, operation: "view", surface: "mcp", outcome: "ok" });
    fs.appendFileSync(file, "x".repeat(70000));
    expect(viewsStatus(f.home).lastRequest).toBeNull();
  } finally { fs.rmSync(f.home, { recursive: true, force: true }); }
});

test("operator help, readable controls and live check work from both CLI doors", async () => {
  const f = setup();
  try {
    for (const published of [false, true]) {
      const help = await cli(f.home, ["--help"], published);
      expect(help.code).toBe(0);
      expect(help.stdout).toContain("circadian extensions check views");
      expect(help.stdout).toContain("memory_view / memory_expand");
      expect((await cli(f.home, ["extensions", "enable", "views"], published)).stdout).toContain("Coordinated views: ON");
      expect(fs.readFileSync(path.join(f.home, "logs/.statusline"), "utf8")).toContain("views ON");
      expect((await cli(f.home, ["extensions", "status"], published)).stdout).toContain("Configuration:");
      const check = await cli(f.home, ["extensions", "check", "views"], published);
      expect(check.code).toBe(0);
      expect(check.stdout).toContain("Views check: PASS");
      expect(check.stdout).not.toContain("I prefer trains");
      const machine = await cli(f.home, ["extensions", "check", "views", "--json"], published);
      expect(JSON.parse(machine.stdout).check).toBe("PASS");
      expect((await cli(f.home, ["extensions", "disable", "views"], published)).stdout).toContain("Coordinated views: OFF");
      expect(fs.readFileSync(path.join(f.home, "logs/.statusline"), "utf8")).not.toContain("views ON");
      expect((await cli(f.home, ["extensions", "check", "views"], published)).code).toBe(2);
    }
    expect((await cli(f.home, ["extensions", "status", "--json", "--json"])).code).toBe(1);
  } finally { fs.rmSync(f.home, { recursive: true, force: true }); }
});
