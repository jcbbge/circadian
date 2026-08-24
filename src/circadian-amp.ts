// circadian-amp.ts — Amp lifecycle plugin source of truth.
//
// session.start → wake.ts (ledger + statusline refresh; stdout not injected).
// agent.end → sleep.ts (hook mode; bails cleanly when no transcript is wired).
// Graze is N/A on amp — no turn/graze event exists.

import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

declare const process: {
  env?: Record<string, string | undefined>;
};

type AmpEventName = "session.start" | "agent.start" | "agent.end";
type AmpApi = {
  on: (
    eventName: AmpEventName,
    handler: (event?: unknown) => unknown | Promise<unknown>,
  ) => void;
};

const CIRCADIAN_HOME = process.env.CIRCADIAN_HOME || join(homedir(), "circadian");
const BUN_BIN = process.env.CIRCADIAN_BUN_BIN || join(homedir(), ".bun/bin/bun");

function spawnScript(script: string): void {
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

export default function circadianAmpLifecycle(amp: AmpApi): void {
  amp.on("session.start", async () => {
    spawnScript("wake.ts");
  });

  amp.on("agent.end", async () => {
    spawnScript("sleep.ts");
  });
}
