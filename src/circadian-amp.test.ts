// circadian-amp.test.ts — agent.start inject: real wake.ts stdout, once per thread.id.
import { describe, test, expect, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const home = mkdtempSync(join(tmpdir(), "circadian-amp-test-"));
mkdirSync(join(home, "mind"));
symlinkSync(import.meta.dir, join(home, "src"), "dir");
writeFileSync(join(home, "mind", "SELF.md"), "## Doctrine\n\n**Motion is the metric.**\n");
writeFileSync(join(home, "mind", "NOW.md"), `## Last sleep\n\n${new Date().toISOString()}\n`);
writeFileSync(join(home, "mind", "greeting.md"), "Back to the work.");
const oldHome = process.env.HOME;
const oldCircadianHome = process.env.CIRCADIAN_HOME;
const oldBunBin = process.env.CIRCADIAN_BUN_BIN;
process.env.HOME = home;
process.env.CIRCADIAN_HOME = home;
process.env.CIRCADIAN_BUN_BIN = process.execPath;
const { default: circadianAmpLifecycle } = await import("./circadian-amp.ts");
afterAll(() => {
  rmSync(home, { recursive: true, force: true });
  if (oldHome === undefined) delete process.env.HOME;
  else process.env.HOME = oldHome;
  if (oldCircadianHome === undefined) delete process.env.CIRCADIAN_HOME;
  else process.env.CIRCADIAN_HOME = oldCircadianHome;
  if (oldBunBin === undefined) delete process.env.CIRCADIAN_BUN_BIN;
  else process.env.CIRCADIAN_BUN_BIN = oldBunBin;
});

type Handler = (event?: unknown) => unknown | Promise<unknown>;

function captureHandlers(): Map<string, Handler> {
  const handlers = new Map<string, Handler>();
  const amp = {
    on: (eventName: string, handler: Handler) => {
      handlers.set(eventName, handler);
    },
  };
  circadianAmpLifecycle(amp);
  return handlers;
}

describe("circadian-amp agent.start", () => {
  test("returns wake payload with mind markers on first agent.start per thread", async () => {
    const handlers = captureHandlers();
    const agentStart = handlers.get("agent.start");
    expect(agentStart).toBeDefined();

    const threadId = `amp-test-inject-${Date.now()}`;
    const result = (await agentStart!({
      thread: { id: threadId },
      message: "prove",
      id: "1",
    })) as { message?: { content: string; display?: boolean } };

    expect(result?.message?.content).toBeTruthy();
    expect(result?.message?.content).toMatch(/<mind:/);
    expect(result?.message?.display).toBe(false);
  });

  test("second agent.start on same thread.id does not re-append wake", async () => {
    const handlers = captureHandlers();
    const agentStart = handlers.get("agent.start");
    expect(agentStart).toBeDefined();

    const threadId = `amp-test-once-${Date.now()}`;
    const first = await agentStart!({
      thread: { id: threadId },
      message: "first",
      id: "1",
    });
    expect(first).toBeTruthy();

    const second = await agentStart!({
      thread: { id: threadId },
      message: "second",
      id: "2",
    });
    expect(second).toBeUndefined();
  });
});
