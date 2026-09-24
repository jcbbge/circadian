// doctor.test.ts — CC settings.json graze detection: graze.ts OR circadian-graze-gate.
// Real temp files, no mocks of the code under test.
import { describe, test, expect, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";
import { ccSettingsMissingHooks, ccSettingsMissingHooksFromPath } from "./doctor.ts";

const dirs: string[] = [];

function writeSettings(content: string): string {
  const d = fs.mkdtempSync(path.join(tmpdir(), "doctor-cc-settings-"));
  dirs.push(d);
  const p = path.join(d, "settings.json");
  fs.writeFileSync(p, content, "utf8");
  return p;
}

afterEach(() => {
  while (dirs.length) {
    const d = dirs.pop()!;
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* already gone */
    }
  }
});

// Entire doctor runs against a disposable HOME/mind and stub executables;
// neither the real user timer nor ~/circadian is ever probed.
function linuxDoctor(ageHours: number, options: { timer?: string; logger?: string; grazeFailure?: boolean } = {}) {
  const root = fs.mkdtempSync(path.join(tmpdir(), "doctor-linux-"));
  try {
    const home = path.join(root, "home");
    const install = path.join(home, "circadian");
    const mind = path.join(install, "mind");
    const bin = path.join(root, "bin");
    for (const p of [home, mind, bin, path.join(install, "logs"), path.join(mind, "episodes"), path.join(home, ".pi/agent/sessions")]) fs.mkdirSync(p, { recursive: true });
    const date = new Date(Date.now() - ageHours * 3_600_000).toISOString();
    const env = {
      ...process.env, HOME: home, CIRCADIAN_HOME: install,
      CIRCADIAN_PROJECTS_DIR: path.join(home, ".claude/projects"),
      CIRCADIAN_LLM_BASE_URL: "http://127.0.0.1:1/v1",
      PATH: `${bin}:${process.env.PATH}`,
      GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date,
      GIT_AUTHOR_NAME: "Test", GIT_COMMITTER_NAME: "Test",
      GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_EMAIL: "test@example.invalid",
    };
    delete env.CIRCADIAN_LLM_LOGGER_FILE;
    fs.writeFileSync(path.join(bin, "systemctl"), `#!/bin/sh\nif [ "$2" = is-enabled ]; then echo '${options.timer === "disabled" ? "disabled" : "enabled"}'; exit 0; fi\nif [ "$2" = list-timers ]; then echo '${options.timer === "missing" ? "n/a n/a n/a n/a circadian-rem.timer circadian-rem.service" : "Mon 2026-10-01 09:00:00 UTC 1h ago - - circadian-rem.timer circadian-rem.service"}'; exit 0; fi\nexit 1\n`, { mode: 0o755 });
    fs.writeFileSync(path.join(bin, "curl"), "#!/bin/sh\nexit 7\n", { mode: 0o755 });
    if (options.logger) {
      const logger = path.join(home, "local-llm/venv/lib/python3.11/site-packages/mlx_omni_server/utils/logger.py");
      fs.mkdirSync(path.dirname(logger), { recursive: true });
      fs.writeFileSync(logger, options.logger);
    }
    spawnSync("git", ["init", "-q", mind], { env });
    fs.writeFileSync(path.join(mind, "SELF.md"), "# Self\n");
    const commit = spawnSync("git", ["-C", mind, "add", "."], { env });
    expect(commit.status).toBe(0);
    expect(spawnSync("git", ["-C", mind, "commit", "-qm", "founding"], { env }).status).toBe(0);
    fs.writeFileSync(path.join(home, ".pi/agent/sessions", "session.jsonl"), "{}\n");
    const events = [
      { ts: new Date().toISOString(), process: "wake", phase: "inject", outcome: "ok", summary: "injected" },
      { ts: new Date().toISOString(), process: "graze", phase: "throttle", outcome: "idle", summary: "checkpoint interval not yet elapsed; waiting" },
      { ts: new Date().toISOString(), process: "rem", phase: "schedule", outcome: "idle", summary: "nothing to digest" },
    ];
    if (options.grazeFailure) events.push({ ts: new Date().toISOString(), process: "graze", phase: "worker", outcome: "failed", summary: "worker crashed" });
    fs.writeFileSync(path.join(install, "logs/circadian.events.jsonl"), events.map(e => JSON.stringify(e)).join("\n") + "\n");
    const run = spawnSync(process.execPath, [path.join(import.meta.dir, "doctor.ts"), "--json"], { env, encoding: "utf8" });
    return { status: run.status, stderr: run.stderr, report: JSON.parse(run.stdout) as { healthy: boolean; checks: { name: string; level: string; detail: string }[] } };
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

if (process.platform === "linux") describe("doctor on a fresh Linux mind", () => {
  test("idle graze throttle and young silent sleep are not faults; checks enabled timer and skips absent macOS patch; endpoint warning names queue", () => {
    const { status, report } = linuxDoctor(0.1);
    const check = (name: string) => report.checks.find(c => c.name === name)!;
    expect(report.checks.filter(c => c.level === "FAIL")).toEqual([]);
    expect(status).toBe(0);
    expect(report.healthy).toBe(true);
    expect(check("graze").level).toBe("IDLE");
    expect(check("graze").detail).toContain("checkpoint interval not yet elapsed");
    expect(check("sleep").level).toBe("IDLE");
    expect(check("sleep").detail).toContain("founded");
    expect(check("systemd user timer").level).toBe("OK");
    expect(check("systemd user timer").detail).toContain("next run");
    expect(report.checks.some(c => c.name === "launchd agents")).toBe(false);
    expect(check("LLM patch integrity").level).toBe("IDLE");
    expect(check("LLM patch integrity").detail).toContain("not present");
    expect(check("LLM service").level).toBe("WARN");
    expect(check("LLM service").detail).toContain("pending-sleep.jsonl");
  });
  test("a 49-hour-old silent mind with session evidence fails sleep", () => {
    const { status, report } = linuxDoctor(49);
    expect(status).toBe(1);
    expect(report.checks.find(c => c.name === "sleep")?.level).toBe("FAIL");
  });
  test("disabled timer and present but regressed markup patch are reported", () => {
    const { status, report } = linuxDoctor(0.1, { timer: "disabled", logger: "markup=True" });
    expect(status).toBe(1);
    expect(report.checks.find(c => c.name === "systemd user timer")?.level).toBe("WARN");
    expect(report.checks.find(c => c.name === "LLM patch integrity")?.level).toBe("FAIL");
  });
  test("an unaddressed graze failure remains a failure", () => {
    const { status, report } = linuxDoctor(0.1, { grazeFailure: true });
    expect(status).toBe(1);
    expect(report.checks.find(c => c.name === "graze")?.level).toBe("FAIL");
  });
});

describe("ccSettingsMissingHooks", () => {
  test("settings containing graze.ts passes", () => {
    const text = [
      '"command": "bun /Users/jrg/circadian/src/wake.ts"',
      '"command": "bun /Users/jrg/circadian/src/sleep.ts"',
      '"command": "bun /Users/jrg/circadian/src/graze.ts"',
    ].join("\n");
    expect(ccSettingsMissingHooks(text)).toEqual([]);
    const p = writeSettings(text);
    expect(ccSettingsMissingHooksFromPath(p)).toEqual([]);
  });

  test("settings containing circadian-graze-gate (with wake + sleep) passes", () => {
    const text = [
      '"command": "bun /Users/jrg/circadian/src/wake.ts"',
      '"command": "bun /Users/jrg/circadian/src/sleep.ts"',
      '"command": "/Users/jrg/circadian/bin/circadian-graze-gate"',
    ].join("\n");
    expect(ccSettingsMissingHooks(text)).toEqual([]);
    const p = writeSettings(text);
    expect(ccSettingsMissingHooksFromPath(p)).toEqual([]);
  });

  test("settings with neither graze marker fails graze only", () => {
    const text = [
      '"command": "bun /Users/jrg/circadian/src/wake.ts"',
      '"command": "bun /Users/jrg/circadian/src/sleep.ts"',
    ].join("\n");
    expect(ccSettingsMissingHooks(text)).toEqual(["graze.ts"]);
    const p = writeSettings(text);
    expect(ccSettingsMissingHooksFromPath(p)).toEqual(["graze.ts"]);
  });
});
