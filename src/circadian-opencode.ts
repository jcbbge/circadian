// circadian-opencode.ts — opencode/slate lifecycle plugin.
//
// WAKE on session.created (stdout captured, injected via
// experimental.chat.system.transform; any session that misses its start event
// is caught up at first tool use), GRAZE on tool.execute.after
// (circadian-graze-gate), SLEEP on session.idle and session.deleted
// (transcript exported from the session API, sleep.ts --worker).

import type { Hooks, PluginInput } from "@opencode-ai/plugin";
import type { Event } from "@opencode-ai/sdk";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CIRCADIAN_HOME = process.env.CIRCADIAN_HOME || join(homedir(), "circadian");
const BUN_BIN = process.env.CIRCADIAN_BUN_BIN || join(homedir(), ".bun/bin/bun");
const GRAZE_GATE = join(CIRCADIAN_HOME, "bin/circadian-graze-gate");

const wakeBySession = new Map<string, string>();
const wakeInFlight = new Set<string>();
const wakeDelivered = new Set<string>();

function spawnWake(sessionID?: string): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(BUN_BIN, ["run", join(CIRCADIAN_HOME, "src/wake.ts")], {
      env: { ...process.env, CIRCADIAN_HOME, CIRCADIAN_BUN_BIN: BUN_BIN, ...(sessionID ? { CIRCADIAN_SESSION_ID: sessionID } : {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.on("close", () => resolve(stdout));
    child.on("error", () => resolve(""));
  });
}

/** Make sure this session has a wake payload staged for injection.
 * Self-healing catch-up: a session that missed session.created (bridge booted
 * after the session opened, or the start event never reached the plugin) still
 * receives memory before its first tool use. Deduped so concurrent tool uses
 * never spawn a second wake. If wake fails, the next tool use retries — wake
 * only returns empty when the process itself cannot boot, and then the whole
 * bridge is down anyway. */
async function ensureWake(sessionID: string | undefined): Promise<void> {
  if (!sessionID || wakeBySession.has(sessionID) || wakeInFlight.has(sessionID) || wakeDelivered.has(sessionID)) {
    return;
  }
  wakeInFlight.add(sessionID);
  const payload = await spawnWake(sessionID);
  wakeInFlight.delete(sessionID);
  if (payload) {
    wakeBySession.set(sessionID, payload);
  }
}

function spawnDetached(
  bunArgs: string[],
  envExtra: Record<string, string> = {},
): void {
  try {
    const child = spawn(BUN_BIN, bunArgs, {
      detached: true,
      stdio: ["ignore", "ignore", "ignore"],
      env: { ...process.env, CIRCADIAN_HOME, CIRCADIAN_BUN_BIN: BUN_BIN, ...envExtra },
    });
    child.unref();
  } catch {
    // Best effort — metabolism must never break the desk.
  }
}

function spawnGrazeGate(sessionID?: string): void {
  try {
    const payload = JSON.stringify({ session_id: sessionID || "" });
    const child = spawn(GRAZE_GATE, [], {
      detached: true,
      stdio: ["pipe", "ignore", "ignore"],
      env: { ...process.env, CIRCADIAN_HOME, ...(sessionID ? { CIRCADIAN_SESSION_ID: sessionID } : {}) },
    });
    child.stdin?.write(payload);
    child.stdin?.end();
    child.unref();
  } catch {
    // Best effort.
  }
}

function sessionIdFromEvent(event: Event): string | undefined {
  if (event.type === "session.idle") {
    return event.properties.sessionID;
  }
  if (event.type === "session.created" || event.type === "session.deleted") {
    return event.properties.info.id;
  }
  return undefined;
}

async function exportTranscript(
  client: PluginInput["client"],
  sessionID: string,
): Promise<string | null> {
  try {
    const resp = await client.session.messages({ path: { id: sessionID } });
    const messages = resp.data;
    if (!messages?.length) return null;

    const lines: string[] = [];
    for (const row of messages) {
      const role = row.info.role;
      const text = row.parts
        .filter((part): part is { type: "text"; text: string } => part.type === "text")
        .map((part) => part.text)
        .join("\n");
      if (!text) continue;
      lines.push(
        JSON.stringify({
          message: {
            role,
            content: [{ type: "text", text }],
          },
        }),
      );
    }
    if (!lines.length) return null;

    const dir = join(CIRCADIAN_HOME, "logs", "opencode-transcripts");
    mkdirSync(dir, { recursive: true });
    const transcriptPath = join(dir, `${sessionID}.jsonl`);
    writeFileSync(transcriptPath, `${lines.join("\n")}\n`);
    return transcriptPath;
  } catch {
    return null;
  }
}

async function spawnSleep(client: PluginInput["client"], sessionID: string): Promise<void> {
  const transcriptPath = await exportTranscript(client, sessionID);
  if (!transcriptPath) return;

  spawnDetached(["run", join(CIRCADIAN_HOME, "src/sleep.ts"), "--worker"], {
    CIRCADIAN_SLEEP_EVENT: JSON.stringify({
      transcript_path: transcriptPath,
      session_id: sessionID,
    }),
    CIRCADIAN_SESSION_ID: sessionID,
  });
}

export default async function circadianOpencodePlugin(input: PluginInput): Promise<Hooks> {
  const { client } = input;

  return {
    event: async ({ event }) => {
      if (event.type === "session.created") {
        const sessionID = sessionIdFromEvent(event);
        await ensureWake(sessionID);
        return;
      }

      if (event.type === "session.idle") {
        const sessionID = sessionIdFromEvent(event);
        if (sessionID) await spawnSleep(client, sessionID);
        return;
      }

      if (event.type === "session.deleted") {
        const sessionID = sessionIdFromEvent(event);
        if (sessionID) {
          await spawnSleep(client, sessionID);
          wakeBySession.delete(sessionID);
          wakeDelivered.delete(sessionID);
        }
      }
    },

    "experimental.chat.system.transform": async (hookInput, output) => {
      const sessionID = hookInput.sessionID;
      if (!sessionID) return;
      const payload = wakeBySession.get(sessionID);
      if (!payload) return;
      wakeBySession.delete(sessionID);
      wakeDelivered.add(sessionID);
      output.system = [...(output.system ?? []), payload];
    },

    "tool.execute.after": async (hookInput) => {
      const sessionID = hookInput.sessionID;
      spawnGrazeGate(sessionID);
      await ensureWake(sessionID);
    },
  };
}
