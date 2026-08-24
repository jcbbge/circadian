// circadian-amp.test.ts — agent.start inject: real wake.ts stdout, once per thread.id.
import { describe, test, expect } from "bun:test";
import circadianAmpLifecycle from "./circadian-amp.ts";

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
