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
import { loadIndex, retrieveForWake } from "./relindex.ts";
import { computeVerdictStreak } from "./status.ts";
import {
  CAP_TOKENS,
  STALE_MS,
  extractLastSleep,
  classifyFleetTier,
  buildPayload,
  type FleetTier,
} from "./wake-payload.ts";

// Path resolution (single-source, distributable): CIRCADIAN_HOME overrides;
// otherwise ~/circadian. The mind data lives at $CIRCADIAN_HOME/mind. This is
// the only machine-specific knob — everything else is relative to it, so the
// same code runs as the author's install and as any user's scaffolded copy.
const CIRCADIAN_HOME = process.env.CIRCADIAN_HOME || join(homedir(), "circadian");
const MIND = join(CIRCADIAN_HOME, "mind");

async function readStdin(): Promise<void> {
  // WAKE has no use for stdin content (file reads only, per Law 7) but must
  // still drain it so the harness never sees a broken pipe.
  try {
    await new Response(Bun.stdin.stream()).text();
  } catch {
    // tolerated — stdin drain must never break the hook
  }
}

/** Detect this pane's fleet tier (or null for operator/unstamped panes).
 * The tier is a DATA fact about the pane and has exactly one consumer: how
 * MUCH memory the pane needs (buildPayload's `slim` — executor tiers get the
 * DOCTRINE-only slice, wake-slim 2026-08-11). It decides no behavior. Wake
 * injects memory; the greeting ritual belongs to the role that greets and
 * lives in the concierge profile (session-lifecycle law 1: adapters inject
 * data, never behavior) — which is why there is no longer a greeting mandate
 * here to suppress per role. */
function detectFleetTier(): { tier: FleetTier | null; reason: string } {
  const envRole = process.env.HERDR_ROLE || "";
  const envTier = classifyFleetTier(envRole);
  if (envTier) {
    return { tier: envTier, reason: `HERDR_ROLE=${envRole}` };
  }
  const paneId = process.env.HERDR_PANE_ID;
  if (!paneId || process.env.HERDR_ENV !== "1") {
    return { tier: null, reason: "not-herdr-pane" };
  }
  try {
    const out = Bun.spawnSync(["herdr", "pane", "get", paneId], {
      stdout: "pipe",
      stderr: "pipe",
      env: process.env,
    });
    if (out.exitCode !== 0) return { tier: null, reason: "pane-get-failed" };
    const raw = new TextDecoder().decode(out.stdout);
    const j = JSON.parse(raw);
    const pane = j?.result?.pane ?? j?.pane ?? j;
    const role = String(pane?.tokens?.role || "");
    const name = String(pane?.name || pane?.display_agent || pane?.label || "");
    const roleTier = classifyFleetTier(role);
    if (roleTier) {
      return { tier: roleTier, reason: `token.role=${role}` };
    }
    const nameTier = classifyFleetTier(name);
    if (nameTier) {
      return { tier: nameTier, reason: `name=${name}` };
    }
  } catch {
    return { tier: null, reason: "detect-threw" };
  }
  return { tier: null, reason: "operator-or-unstamped" };
}

async function runHook(): Promise<void> {
  const corr = correlation("wake");
  await readStdin();

  // Claude sessions spawned BY the metabolism itself (sleep/REM drafting set
  // CIRCADIAN_INTERNAL=1) must not receive the injection: the mind payload
  // would contaminate their strict-format outputs, and they are not wakes.
  if (process.env.CIRCADIAN_INTERNAL === "1") process.exit(0);

  // Read each mind file independently — a missing file is a context-bound
  // event, not a silent skip (Law 7: wake still delivers, but the gap is
  // visible). Previously all four reads lived in one try/catch: a single
  // missing file swallowed the entire injection silently.
  const fileSpecs = [
    ["CONSTITUTION.md", join(MIND, "CONSTITUTION.md")],
    ["CONSTITUTION-JOSH.md", join(MIND, "CONSTITUTION-JOSH.md")],
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

  // b07: session-anchored evidence slice. Law 7 to the letter — file reads
  // only (loadIndex reads mind/index/*.json; retrieveForWake never touches the
  // network), and any failure here degrades to today's exact behavior
  // (worldview-only) without ever withholding the injection. The slice renders
  // INSIDE the existing 15k cap: it is part of `body`, so buildPayload's own
  // OVER-CAP accounting already covers it. Budget ≤ 2000 tokens (brief §4).
  let evidence = "";
  try {
    const loaded = loadIndex(MIND);
    const source = process.env.CIRCADIAN_WAKE_SOURCE || process.env.CLAUDE_SESSION_SOURCE;
    // budget halved 2000 -> 1000 (2026-08-09 stitch audit): the worldview +
    // constitutions carry the identity load; evidence is a garnish, not a meal.
    const slice = retrieveForWake(loaded, process.cwd(), { source, k: 5, budgetTokens: 1000 });
    evidence = slice.block;
    if (slice.reason === "injected") {
      ok({
        process: "wake", phase: "session-evidence", correlation_id: corr,
        summary: `injected ${slice.units.length} session-relevant unit(s) from ${slice.anchors.chain.join("+")}`,
        context: {
          anchors: slice.anchors.chain,
          known_entities: slice.anchors.knownEntities,
          units: slice.units.map((u) => ({ id: u.id, score: u.score })),
          evidence_tokens: Math.ceil(slice.block.length / 4),
          index_age_ms: slice.ageMs,
        },
      });
    } else if (slice.reason === "no-index") {
      // Not degraded on a fresh install (the index may simply not exist yet);
      // an idle event keeps it legible without crying wolf (zoom's pattern).
      ok({
        process: "wake", phase: "session-evidence", correlation_id: corr,
        summary: "no relational index on disk — worldview-only (today's behavior)",
        context: { reason: slice.reason, index_dir: join(MIND, "index"), next_action: "run `bun src/relindex.ts --reindex` (also runs each REM)" },
      });
    } else if (slice.reason === "stale-index") {
      degraded({
        process: "wake", phase: "session-evidence", correlation_id: corr,
        summary: "relational index is stale (>48h) — worldview-only",
        context: { reason: slice.reason, index_age_ms: slice.ageMs },
        cause: "mind/index was built more than 48h ago",
        next_action: "run `bun src/relindex.ts --reindex` or let the next REM refresh it",
      });
    } else {
      // no-anchors | no-relevant-units: a legitimate worldview-only wake
      // (unrelated cwd, or anchors that light no known entity). Not a fault.
      ok({
        process: "wake", phase: "session-evidence", correlation_id: corr,
        summary: `worldview-only — ${slice.reason} (${slice.anchors.chain.join("+") || "no anchors"})`,
        context: { reason: slice.reason, anchors: slice.anchors.chain, known_entities: slice.anchors.knownEntities, cwd: process.cwd() },
      });
    }
  } catch (e) {
    degraded({
      process: "wake", phase: "session-evidence", correlation_id: corr,
      summary: "session-evidence slice threw; wake proceeds worldview-only",
      context: {},
      cause: (e as Error).message,
      next_action: "inspect logs/circadian.events.jsonl for this event; reproduce with `bun src/relindex.ts --query <cwd>`",
    });
    evidence = "";
  }

  // KILL-SWITCH check (R7): computed from the scoreboard, best-effort. Any
  // failure here degrades to a normal full wake (Law 7 — never withhold the
  // injection because an instrument misfired).
  let killSwitch = false;
  try {
    const streak = computeVerdictStreak(loadScoreboardFile(join(MIND, "scoreboard.jsonl")));
    killSwitch = streak.killSwitch;
  } catch {
    killSwitch = false;
  }
  if (killSwitch) {
    degraded({
      process: "wake",
      phase: "kill-switch",
      correlation_id: corr,
      summary: "kill switch active (R7) — SELF/USER/greeting withheld this wake; constitution + NOW injected",
      context: { fail_safe: "constitution+now" },
      cause: "7+ consecutive zero-credit scored greeting windows (weighted)",
      next_action: "human decision: decommission or repair the memory fitness loop; wake stays in fail-safe until the streak clears",
    });
  }

  const fleet = detectFleetTier();
  // Executor tiers (3-AGNT/4-SAGT) get the slim payload: constitution(s) +
  // DOCTRINE-only SELF slice + NOW + brief-relevant evidence, USER dropped
  // (wake-slim, 2026-08-11). Orchestrator tiers (1-CORD/2-ORCH) and operator
  // panes keep the full worldview. Kill-switch fail-safe takes precedence
  // (SELF/USER already withheld there), so slim is a no-op under kill switch.
  const slim = fleet.tier === "AGNT" || fleet.tier === "SAGT";
  if (fleet.tier) {
    ok({
      process: "wake",
      phase: "fleet-tier",
      correlation_id: corr,
      summary: `fleet pane detected: ${fleet.tier} (${fleet.reason})${slim ? " — slim payload (executor tier)" : ""}`,
      context: { reason: fleet.reason, tier: fleet.tier, slim, pane_id: process.env.HERDR_PANE_ID || null },
    });
  }

  const payload = buildPayload({
    self: files["SELF.md"],
    user: files["USER.md"],
    now: files["NOW.md"],
    greeting: files["greeting.md"],
    evidence,
    constitution: files["CONSTITUTION.md"],
    constitutionJosh: files["CONSTITUTION-JOSH.md"],
    killSwitch,
    slim,
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
    // popmem WS-F switchover: rem.ts's editor-grammar wave is retired; the
    // scheduled payload is now rem-popmem.ts (stack -> propagation judgment
    // -> decay -> render -> greeting -> mind commit). Same --if-due contract.
    const child = spawn(bun, ["run", join(CIRCADIAN_HOME, "src/rem-popmem.ts"), "--if-due"], {
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
