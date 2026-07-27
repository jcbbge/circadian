#!/usr/bin/env bun
// Circadian WAKE — SessionStart hook. See mind/MIND-SPEC.md (Law 7: file
// reads only; the mind must never take a session down with it). Every
// decision point now writes a context-bound event to the obs ledger
// (logs/circadian.events.jsonl) so a cold reader can see exactly what
// happened — no silent skips, no swallowed catches.
//
// Migration onto obs (mirror sleep.ts @ d21e47c): each mind-file read is
// attempted independently; a missing file is a degraded event with cause +
// next_action, not a silent skip. Staleness (>48h) and OVER-CAP (>15k tokens)
// are also degraded events. The injection is ALWAYS delivered (Law 7) — the
// events are telemetry, they never block the session.

import { appendFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { ok, degraded, emit, correlation } from "./obs.ts";
import { isFirstWakeToday, renderDailyReading, loadScoreboardFile, appendDailyReadingEntry } from "./scorecard.ts";

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
    // tolerated — stdin drain must never break the hook
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
    "Open your FIRST reply to the user by SPEAKING the greeting below, verbatim, before anything else — it is the mind's own voice (the dream-echo from the last consolidation), not a label or a report. Deliver it as if you are the mind resuming mid-thought. It orients to the work — the arc, the live tension, the next move — never to the memory system itself (Law 8). If it passes, the user continues the thread as if no time passed.",
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

async function runHook(): Promise<void> {
  const corr = correlation("wake");
  await readStdin();

  // Claude sessions spawned BY the metabolism itself (sleep/REM drafting set
  // CIRCADIAN_INTERNAL=1) must not receive the injection: the greeting
  // instruction would contaminate their strict-format outputs, and they are
  // not wakes.
  if (process.env.CIRCADIAN_INTERNAL === "1") process.exit(0);

  // Read each mind file independently — a missing file is a context-bound
  // event, not a silent skip (Law 7: wake still delivers, but the gap is
  // visible). Previously all four reads lived in one try/catch: a single
  // missing file swallowed the entire injection silently.
  const fileSpecs = [
    ["SELF.md", join(MIND, "SELF.md")],
    ["USER.md", join(MIND, "USER.md")],
    ["NOW.md", join(MIND, "NOW.md")],
    ["greeting.md", join(MIND, "greeting.md")],
  ] as const;

  const files: Record<string, string> = {};
  const missing: string[] = [];
  for (const [name, p] of fileSpecs) {
    try {
      files[name] = readFileSync(p, "utf8");
    } catch {
      missing.push(name);
      files[name] = "";
    }
  }

  if (missing.length > 0) {
    degraded({
      process: "wake",
      phase: "read-mind",
      correlation_id: corr,
      summary: `missing mind file(s): ${missing.join(", ")} — injection delivered with empty content for those files`,
      context: { missing_files: missing, mind_dir: MIND },
      cause: `could not read ${missing.join(", ")} from ${MIND} (file missing or unreadable)`,
      next_action:
        "verify the mind repo exists and is populated — run install.sh or check that mind/ files are present",
    });
  }

  const payload = buildPayload({
    self: files["SELF.md"],
    user: files["USER.md"],
    now: files["NOW.md"],
    greeting: files["greeting.md"],
  });

  const payloadTokens = Math.ceil(payload.length / 4);
  const selfTokens = Math.ceil(files["SELF.md"].length / 4);

  // Staleness check (>48h on NOW.md "Last sleep" timestamp). The staleness
  // warning is already prepended to the greeting in buildPayload; this event
  // makes it observable in the ledger so doctor can flag it.
  const lastSleepRaw = extractLastSleep(files["NOW.md"]);
  const lastSleepDate = lastSleepRaw ? new Date(lastSleepRaw) : null;
  const isValidDate = lastSleepDate instanceof Date && !isNaN(lastSleepDate.getTime());
  const isStale = isValidDate ? Date.now() - lastSleepDate!.getTime() > STALE_MS : true;

  if (isStale) {
    degraded({
      process: "wake",
      phase: "staleness-check",
      correlation_id: corr,
      summary: "NOW.md last-sleep timestamp is stale or missing — greeting carries a staleness warning",
      context: { last_sleep: lastSleepRaw ?? null, stale_ms: STALE_MS, is_stale: true },
      cause: isValidDate
        ? `last sleep was ${lastSleepRaw} — more than 48h ago`
        : "no parseable 'Last sleep' timestamp in NOW.md — treating as stale",
      next_action:
        "run a session (SLEEP writes a fresh timestamp at SessionEnd) or manually update NOW.md Last sleep",
    });
  }

  // OVER-CAP check (payload > 15k tokens). The OVER-CAP line is already in
  // the payload; this event makes it observable in the ledger.
  if (payloadTokens > CAP_TOKENS) {
    degraded({
      process: "wake",
      phase: "payload-cap",
      correlation_id: corr,
      summary: `wake injection payload ${payloadTokens} tokens exceeds ${CAP_TOKENS}-token hard cap — OVER-CAP line emitted in payload`,
      context: {
        payload_tokens: payloadTokens,
        cap_tokens: CAP_TOKENS,
        over_by: payloadTokens - CAP_TOKENS,
        self_tokens: selfTokens,
      },
      cause: "assembled injection payload exceeds the 15k-token hard cap (MIND-SPEC Law 4)",
      next_action:
        "compost mind content (run rem or manually trim SELF.md/USER.md/NOW.md) to bring the payload under 15k tokens",
    });
  }

  // THE DAILY READING (popmem WS-0, docs/POPULATION-MEMORY.md §17): a 3-line
  // scorecard after the greeting, but ONLY on the first wake of a new
  // calendar day. Detected here — BEFORE this run appends its own wake
  // event below — or every morning's first wake would see its own arrival
  // on the scoreboard and conclude the day already had one. Best-effort:
  // any failure here must never withhold the wake injection (Law 7).
  let finalPayload = payload;
  try {
    const scoreboard = loadScoreboardFile(join(MIND, "scoreboard.jsonl"));
    const today = new Date().toISOString().slice(0, 10);
    if (isFirstWakeToday(scoreboard, today)) {
      const nowIso = new Date().toISOString();
      const scorecard = renderDailyReading({ circadianHome: CIRCADIAN_HOME, scoreboard, today, nowIso });
      finalPayload = payload + "\n\n" + scorecard.lines.join("\n");
      appendDailyReadingEntry(CIRCADIAN_HOME, scorecard.entry);
      ok({
        process: "wake",
        phase: "daily-reading",
        correlation_id: corr,
        summary: "Daily Reading scorecard emitted (first wake of the day)",
        context: { day: scorecard.entry.day, lines: scorecard.lines },
      });
    }
  } catch (e) {
    degraded({
      process: "wake",
      phase: "daily-reading",
      correlation_id: corr,
      summary: "Daily Reading scorecard failed; wake injection proceeds without it",
      context: {},
      cause: (e as Error).message,
      next_action: "inspect logs/circadian.events.jsonl for this event; the scorecard retries at the next first-wake-of-day",
    });
  }

  // Deliver the injection. Law 7: wake must always deliver, even when degraded.
  process.stdout.write(finalPayload + "\n");

  // Scoreboard append (MIND-SPEC schema — kept for status.ts to read).
  try {
    const event = {
      ts: new Date().toISOString(),
      type: "wake",
      worldview_tokens: selfTokens,
    };
    appendFileSync(join(MIND, "scoreboard.jsonl"), JSON.stringify(event) + "\n");
  } catch {
    // scoreboard append failure must never withhold the injection above
  }

  // OK event with vitals as context — success is as legible as failure.
  ok({
    process: "wake",
    phase: "inject",
    correlation_id: corr,
    summary: "wake injection delivered to session",
    context: {
      payload_tokens: payloadTokens,
      cap_tokens: CAP_TOKENS,
      worldview_tokens: selfTokens,
      files_read: fileSpecs.map(([n]) => n),
      missing_files: missing,
      stale: isStale,
      over_cap: payloadTokens > CAP_TOKENS,
      last_sleep: lastSleepRaw ?? null,
    },
  });

  // Catch-up: every new session is an "opportunity" to run a missed REM slot.
  // Fire REM in --if-due mode, fully detached, AFTER the injection is already
  // on stdout — it must never delay or block session start. --if-due exits
  // immediately when a run isn't owed, and can never double-run a slot, so
  // this is safe to fire on every single wake.
  try {
    const bun = process.env.CIRCADIAN_BUN_BIN || join(homedir(), ".bun/bin/bun");
    const child = spawn(bun, ["run", join(CIRCADIAN_HOME, "src/rem.ts"), "--if-due"], {
      detached: true,
      stdio: "ignore",
      env: { ...process.env, CIRCADIAN_INTERNAL: "1" },
    });
    child.unref();
  } catch {
    // a failed catch-up spawn must never affect the wake injection
  }

  process.exit(0);
}

// Law 7: wake must never block a session. Even an unexpected exception emits
// a failed event (never silent) but still exits 0 so the session proceeds.
runHook().catch((e) => {
  emit({
    process: "wake",
    phase: "hook",
    outcome: "failed",
    summary: "wake hook threw unexpectedly; injection may be incomplete",
    context: { error: (e as Error).message },
    cause: (e as Error).message,
    next_action:
      "inspect logs/circadian.events.jsonl for the failed event; verify mind/ files are readable and CIRCADIAN_HOME is set correctly",
  });
  process.exit(0);
});
