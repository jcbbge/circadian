#!/usr/bin/env bun
// Circadian WAKE — SessionStart hook. See mind/MIND-SPEC.md (Law 7: file
// reads only; the mind must never take a session down with it). Everything
// below is wrapped so that any failure — missing mind dir, unreadable file,
// bad stdin — results in silent, empty output and exit 0.

import { appendFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Path resolution (single-source, distributable): CIRCADIAN_HOME overrides;
// otherwise ~/circadian. The mind data lives at $CIRCADIAN_HOME/mind. This is
// the only machine-specific knob — everything else is relative to it, so the
// same code runs as the author's install and as any user's scaffolded copy.
const CIRCADIAN_HOME = process.env.CIRCADIAN_HOME || join(homedir(), "circadian");
const MIND = join(CIRCADIAN_HOME, "mind");
const CAP_TOKENS = 15000;
const STALE_MS = 48 * 60 * 60 * 1000;

async function readStdin(): Promise<void> {
  // WAKE has no use for stdin content (file reads only, per Law 7) but must
  // still drain it so the harness never sees a broken pipe.
  try {
    await new Response(Bun.stdin.stream()).text();
  } catch {
    // ignored — tolerate empty/unparseable stdin
  }
}

function extractLastSleep(nowMd: string): string | null {
  const match = nowMd.match(/##\s*Last sleep\s*\n+\s*([^\n]+)/);
  return match ? match[1].trim() : null;
}

function buildPayload(files: { self: string; user: string; now: string; greeting: string }): string {
  const { self, user, now, greeting } = files;

  const lastSleepRaw = extractLastSleep(now);
  const lastSleepDate = lastSleepRaw ? new Date(lastSleepRaw) : null;
  const isValidDate = lastSleepDate instanceof Date && !isNaN(lastSleepDate.getTime());
  // An unparseable/missing "Last sleep" timestamp is treated as stale — never
  // silently assume freshness when the record is broken.
  const isStale = isValidDate ? Date.now() - lastSleepDate!.getTime() > STALE_MS : true;

  let greetingBlock = greeting.trim();
  if (isStale) {
    const staleLine = isValidDate
      ? `STALENESS WARNING: last sleep was ${lastSleepRaw} — more than 48h ago. Treat NOW.md as potentially outdated.`
      : `STALENESS WARNING: no parseable "Last sleep" timestamp in NOW.md — treating as stale.`;
    greetingBlock = `${staleLine}\n${greetingBlock}`;
  }

  const body = [
    "[Circadian] WAKE — memory substrate injection from the mind repo (see mind/MIND-SPEC.md).",
    "",
    "<mind:self>",
    self.trim(),
    "</mind:self>",
    "",
    "<mind:user>",
    user.trim(),
    "</mind:user>",
    "",
    "<mind:now>",
    now.trim(),
    "</mind:now>",
    "",
    "<mind:greeting-instruction>",
    "Open your FIRST reply to the user with the greeting content below, verbatim, before anything else. The greeting orients to the work — the current arc, the live tension, the next move — never to the memory system itself (Law 8).",
    "",
    greetingBlock,
    "</mind:greeting-instruction>",
  ].join("\n");

  const tokens = Math.ceil(body.length / 4);
  if (tokens > CAP_TOKENS) {
    // Law 4: never truncate silently — announce loudly and still emit the
    // full payload.
    return `OVER-CAP: payload ${tokens} tokens > ${CAP_TOKENS} — compost required\n${body}`;
  }
  return body;
}

try {
  await readStdin();

  // Claude sessions spawned BY the metabolism itself (sleep/REM drafting set
  // CIRCADIAN_INTERNAL=1) must not receive the injection: the greeting
  // instruction would contaminate their strict-format outputs, and they are
  // not wakes.
  if (process.env.CIRCADIAN_INTERNAL === "1") process.exit(0);

  const self = readFileSync(join(MIND, "SELF.md"), "utf8");
  const user = readFileSync(join(MIND, "USER.md"), "utf8");
  const now = readFileSync(join(MIND, "NOW.md"), "utf8");
  const greeting = readFileSync(join(MIND, "greeting.md"), "utf8");

  process.stdout.write(buildPayload({ self, user, now, greeting }) + "\n");

  try {
    const event = {
      ts: new Date().toISOString(),
      type: "wake",
      worldview_tokens: Math.ceil(self.length / 4),
    };
    appendFileSync(join(MIND, "scoreboard.jsonl"), JSON.stringify(event) + "\n");
  } catch {
    // scoreboard append failure must never withhold the injection above
  }
} catch {
  // mind dir missing/unreadable, or any other failure — print nothing (Law 7)
}

process.exit(0);
