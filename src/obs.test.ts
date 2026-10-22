import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const homes: string[] = [];
afterAll(() => { for (const home of homes) rmSync(home, { recursive: true, force: true }); });

function observe(customOutput: boolean, brokenLog = false) {
  const home = mkdtempSync(join(tmpdir(), "circadian-obs-output-"));
  homes.push(home);
  if (brokenLog) writeFileSync(join(home, "logs"), "not a directory");
  const script = `
    import { ok, degraded } from ${JSON.stringify(join(import.meta.dir, "obs.ts"))};
    const messages = [];
    const output = ${customOutput ? "message => messages.push(message)" : "undefined"};
    ok({ process: "ops", phase: "output-test", summary: "operation completed" }, output);
    degraded({ process: "ops", phase: "output-test", summary: "operation incomplete",
      cause: "fixture failure", next_action: "inspect fixture" }, output);
    process.stdout.write(JSON.stringify(messages));
  `;
  const child = Bun.spawnSync([process.execPath, "--eval", script], {
    env: { ...process.env, CIRCADIAN_HOME: home }, stdout: "pipe", stderr: "pipe",
  });
  expect(child.exitCode).toBe(0);
  const log = join(home, "logs", "circadian.events.jsonl");
  return {
    messages: JSON.parse(child.stdout.toString()) as string[], stderr: child.stderr.toString(),
    events: existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line)) : [],
  };
}

test("ordinary CLI observations still reach stderr and the event ledger", () => {
  const result = observe(false);
  expect(result.stderr).toContain("circadian ops/output-test OK");
  expect(result.stderr).toContain("circadian ops/output-test DEGRADED");
  expect(result.messages).toEqual([]);
  expect(result.events.map(event => event.outcome)).toEqual(["ok", "degraded"]);
});

test("a harness-owned output receives both outcomes without leaking to stderr or losing events", () => {
  const result = observe(true);
  expect(result.stderr).toBe("");
  expect(result.messages).toHaveLength(2);
  expect(result.messages[0]).toContain("operation completed");
  expect(result.messages[1]).toContain('cause="fixture failure" next="inspect fixture"');
  expect(result.events.map(event => event.outcome)).toEqual(["ok", "degraded"]);
});

test("event-log failures reach the selected harness surface, not raw stderr", () => {
  const result = observe(true, true);
  expect(result.stderr).toBe("");
  expect(result.events).toEqual([]);
  expect(result.messages.filter(message => message.includes("obs/event-log FAILED"))).toHaveLength(2);
});
