import { test, expect } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { spawnSync } from "node:child_process";

test("installer merges MCP registration and Pi extension without clobbering existing settings", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "circadian-install-mcp-"));
  try {
    const home = path.join(root, "home"), install = path.join(root, "install"), bin = path.join(root, "bin");
    fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
    fs.mkdirSync(bin);
    fs.cpSync(path.join(import.meta.dir, "..", "templates"), path.join(install, "templates"), { recursive: true });
    fs.writeFileSync(path.join(bin, "curl"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    fs.writeFileSync(path.join(home, ".claude", "settings.json"), JSON.stringify({ mcpServers: { existing: { command: "other" } }, hooks: { Custom: [{ hooks: [{ type: "command", command: "keep" }] }] } }));
    fs.writeFileSync(path.join(home, ".claude.json"), JSON.stringify({ mcpServers: { existing: { command: "other" } } }));
    const env = { ...process.env, HOME: home, CIRCADIAN_HOME: install, CIRCADIAN_BUN_BIN: process.execPath, CIRCADIAN_USER_NAME: "Tester", GIT_AUTHOR_NAME: "Test", GIT_COMMITTER_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_EMAIL: "test@example.invalid", PATH: `${bin}:${process.env.PATH}` };
    const run = () => spawnSync("bash", [path.join(import.meta.dir, "..", "install.sh")], { env, encoding: "utf8" });
    const first = run();
    expect(first.status).toBe(0);
    const file = path.join(home, ".claude", "settings.json");
    const settings = JSON.parse(fs.readFileSync(file, "utf8"));
    const registry = JSON.parse(fs.readFileSync(path.join(home, ".claude.json"), "utf8"));
    expect(registry.mcpServers.existing.command).toBe("other");
    expect(registry.mcpServers.circadian).toEqual({ command: process.execPath, args: [path.join(install, "src/serve.ts")], env: { CIRCADIAN_HOME: install } });
    expect(settings.hooks.Custom[0].hooks[0].command).toBe("keep");
    expect(fs.readFileSync(path.join(home, ".pi/agent/extensions/circadian-mind.ts"), "utf8")).toContain(`${install}/src/circadian-mind.ts`);
    expect(run().status).toBe(0);
    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual(settings);
    expect(JSON.parse(fs.readFileSync(path.join(home, ".claude.json"), "utf8"))).toEqual(registry);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
