// circadian-amp.ts — Amp lifecycle plugin source of truth.
//
// session.start → wake.ts (ledger + statusline refresh; detached, stdout ignored).
// agent.start → wake.ts stdout captured and injected once per thread.id.
// tool.result → circadian-graze-gate (detached; event JSON on stdin).
// agent.end → sleep.ts (hook mode; bails cleanly when no transcript is wired).

import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

declare const process: {
  env?: Record<string, string | undefined>;
};

type AmpEventName = "session.start" | "agent.start" | "agent.end" | "tool.result";

type AgentStartEvent = {
  thread: { id: string };
  message: string;
  id: string;
};

type AgentStartResult = {
  message?: { content: string; display?: boolean };
};

type AmpApi = {
  on: (
    eventName: AmpEventName,
    handler: (event?: unknown) => unknown | Promise<unknown>,
  ) => void;
};

const CIRCADIAN_HOME = process.env.CIRCADIAN_HOME || join(homedir(), "circadian");
const BUN_BIN = process.env.CIRCADIAN_BUN_BIN || join(homedir(), ".bun/bin/bun");
const GRAZE_GATE = join(CIRCADIAN_HOME, "bin/circadian-graze-gate");

const injectedThreads = new Set<string>();

function spawnScriptDetached(script: string): void {
  try {
    const child = spawn(BUN_BIN, ["run", join(CIRCADIAN_HOME, "src", script)], {
      detached: true,
      stdio: ["ignore", "ignore", "ignore"],
      env: { ...process.env, CIRCADIAN_HOME, CIRCADIAN_BUN_BIN: BUN_BIN },
    });
    child.unref();
  } catch {
    // Best effort — metabolism must never break the desk.
  }
}

function spawnWakeCaptured(threadId?: string): Promise<string> {
  return new Promise((resolve) => {
    try {
      const child = spawn(BUN_BIN, ["run", join(CIRCADIAN_HOME, "src/wake.ts")], {
        env: { ...process.env, CIRCADIAN_HOME, CIRCADIAN_BUN_BIN: BUN_BIN, ...(threadId ? { CIRCADIAN_SESSION_ID: threadId } : {}) },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      child.stdout?.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.on("close", () => resolve(stdout.trimEnd()));
      child.on("error", () => resolve(""));
    } catch {
      resolve("");
    }
  });
}

function spawnGrazeGateDetached(payload: string, threadId?: string): void {
  try {
    const child = spawn(GRAZE_GATE, [], {
      detached: true,
      stdio: ["pipe", "ignore", "ignore"],
      env: { ...process.env, CIRCADIAN_HOME, ...(threadId ? { CIRCADIAN_SESSION_ID: threadId } : {}) },
    });
    child.stdin?.write(payload);
    child.stdin?.end();
    child.unref();
  } catch {
    // Best effort — graze must never break a tool result.
  }
}

export default function circadianAmpLifecycle(amp: AmpApi): void {
  amp.on("session.start", async () => {
    spawnScriptDetached("wake.ts");
  });

  amp.on("agent.start", async (event): Promise<AgentStartResult | void> => {
    const { thread } = (event ?? {}) as AgentStartEvent;
    const threadId = thread?.id;
    if (!threadId || injectedThreads.has(threadId)) return;

    const content = await spawnWakeCaptured(threadId);
    if (!content) return;

    injectedThreads.add(threadId);
    return { message: { content, display: false } };
  });

  amp.on("tool.result", async (event) => {
    try {
      const threadId = ((event ?? {}) as { thread?: { id?: string } }).thread?.id;
      spawnGrazeGateDetached(JSON.stringify(event ?? {}), threadId);
    } catch {
      // Swallow — graze must never throw into Amp.
    }
  });

  amp.on("agent.end", async () => {
    spawnScriptDetached("sleep.ts");
  });
}
