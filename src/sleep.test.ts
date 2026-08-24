// sleep.test.ts — the R7 implicit-ok decision (docs/POPULATION-MEMORY.md §7
// R7), unit-tested over fixture scoreboard JSONL built in-memory. No mocking
// of the function under test; decideImplicitOk is pure (I/O — reading the
// scoreboard and appending the verdict — happens in checkImplicitOk, which
// this suite does not need to exercise to prove the decision logic).
import { describe, test, expect } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { decideImplicitOk, type ImplicitOkDecision } from "./sleep.ts";

function remEvent(ts: string, propagated: string[]): any {
  return { ts, type: "rem", worldview_tokens: 4000, propagated, composted: [] };
}
function verdictEvent(ts: string, basis?: string): any {
  return basis
    ? { ts, type: "verdict", worldview_tokens: 4000, greeting_verdict: "ok", source: "propagation", basis }
    : { ts, type: "verdict", worldview_tokens: 4000, greeting_verdict: "ok" };
}

const NOW = "2026-07-27T22:00:00.000Z";

describe("decideImplicitOk", () => {
  test("appends an implicit ok when the newest rem event propagated a greeting-sourced address", () => {
    const scoreboard = [
      remEvent("2026-07-27T09:00:00.000Z", ["SELF.Doctrine[1]", "NOW.Arc[1]"]),
    ];
    const decision = decideImplicitOk(scoreboard, NOW, 4321);
    expect(decision.event).toEqual({
      ts: NOW,
      type: "verdict",
      worldview_tokens: 4321,
      greeting_verdict: "ok",
      source: "propagation",
      basis: "2026-07-27T09:00:00.000Z",
    });
  });

  test("recognizes all three greeting-sourced prefixes: Arc, FlightPlan, LiveTensions", () => {
    for (const addr of ["NOW.Arc[2]", "NOW.FlightPlan[1]", "NOW.LiveTensions[3]"]) {
      const scoreboard = [remEvent("2026-07-27T09:00:00.000Z", [addr])];
      const decision = decideImplicitOk(scoreboard, NOW, 100);
      expect(decision.event?.basis).toBe("2026-07-27T09:00:00.000Z");
    }
  });

  test("does NOT append when propagated has no greeting-sourced prefix (only Doctrine/Motifs/Serendipity)", () => {
    const scoreboard = [
      remEvent("2026-07-27T09:00:00.000Z", ["SELF.Doctrine[1]", "SELF.Motifs[2]", "NOW.Serendipity[1]"]),
    ];
    const decision = decideImplicitOk(scoreboard, NOW, 100);
    expect(decision.event).toBeNull();
  });

  test("does NOT append when no rem event has ever run", () => {
    const decision = decideImplicitOk([], NOW, 100);
    expect(decision.event).toBeNull();
    expect(decision.reason).toMatch(/no rem event/);
  });

  test("dedupes: a second check against the same rem event appends nothing", () => {
    const remTs = "2026-07-27T09:00:00.000Z";
    const scoreboard = [
      remEvent(remTs, ["NOW.Arc[1]"]),
      verdictEvent("2026-07-27T10:00:00.000Z", remTs), // already credited
    ];
    const decision = decideImplicitOk(scoreboard, NOW, 100);
    expect(decision.event).toBeNull();
    expect(decision.reason).toMatch(/basis dedupe/);
  });

  test("simulated two-SLEEP-runs sequence: first run credits, second run (with the first's own output folded in) dedupes", () => {
    const remTs = "2026-07-27T09:00:00.000Z";
    const scoreboardBeforeFirstSleep = [remEvent(remTs, ["NOW.FlightPlan[1]"])];
    const first = decideImplicitOk(scoreboardBeforeFirstSleep, "2026-07-27T20:00:00.000Z", 100);
    expect(first.event).not.toBeNull();

    // Second SLEEP run sees the scoreboard WITH the first run's appended verdict.
    const scoreboardAfterFirstSleep = [...scoreboardBeforeFirstSleep, first.event!];
    const second = decideImplicitOk(scoreboardAfterFirstSleep, "2026-07-27T22:00:00.000Z", 100);
    expect(second.event).toBeNull();
  });

  test("credits only the NEWEST qualifying rem event when several have propagated", () => {
    const scoreboard = [
      remEvent("2026-07-25T09:00:00.000Z", ["NOW.Arc[1]"]),
      remEvent("2026-07-26T09:00:00.000Z", ["NOW.Arc[1]"]),
      remEvent("2026-07-27T09:00:00.000Z", ["NOW.Arc[2]"]), // newest — this one gets credited
    ];
    const decision = decideImplicitOk(scoreboard, NOW, 100);
    expect(decision.event?.basis).toBe("2026-07-27T09:00:00.000Z");
  });

  test("an explicit human verdict does not satisfy the dedupe (only a matching `basis` does)", () => {
    const remTs = "2026-07-27T09:00:00.000Z";
    const scoreboard = [
      remEvent(remTs, ["NOW.Arc[1]"]),
      verdictEvent("2026-07-27T10:00:00.000Z"), // explicit ok, no basis — must not dedupe the implicit credit
    ];
    const decision = decideImplicitOk(scoreboard, NOW, 100);
    expect(decision.event).not.toBeNull();
    expect(decision.event?.basis).toBe(remTs);
  });
});

describe("pending sleep drain self-heal", () => {
  test("dead-letters already-stuck at start without LLM; retains not-stuck failures with ratcheted attempts", () => {
    const home = mkdtempSync(join(tmpdir(), "circadian-pending-"));
    try {
      const logs = join(home, "logs");
      const staleTranscript = join(home, "stale-transcript.jsonl");
      const freshTranscript = join(home, "fresh-transcript.jsonl");
      const now = Date.now();
      const stale = {
        ts: new Date(now).toISOString(),
        session_id: "session-stale-fixture",
        transcript_path: staleTranscript,
        transcript_chars: 0,
        attempts: 4,
        last_error: "previous fixture failure",
        queued_at: new Date(now - 3 * 24 * 3_600_000).toISOString(),
      };
      const fresh = {
        ts: new Date(now).toISOString(),
        session_id: "session-fresh-fixture",
        transcript_path: freshTranscript,
        transcript_chars: 0,
        attempts: 2,
        last_error: "",
        queued_at: new Date(now).toISOString(),
      };
      const staleLine = JSON.stringify(stale);
      const freshLine = JSON.stringify(fresh);

      // Empty transcript: no user/assistant turns — empty-transcript path, no LLM.
      writeFileSync(staleTranscript, '{"type":"system","text":"no conversation turns"}\n');
      writeFileSync(freshTranscript, '{"type":"system","text":"no conversation turns"}\n');
      mkdirSync(logs, { recursive: true });
      writeFileSync(join(logs, "pending-sleep.jsonl"), `${staleLine}\n${freshLine}\n`);

      const run = spawnSync(process.execPath, [join(import.meta.dir, "sleep.ts"), "--drain"], {
        cwd: join(import.meta.dir, ".."),
        env: { ...process.env, CIRCADIAN_HOME: home },
        encoding: "utf8",
      });
      expect(run.status).toBe(0);

      const remainingLines = readFileSync(join(logs, "pending-sleep.jsonl"), "utf8").trim().split("\n");
      expect(remainingLines).toHaveLength(1);
      expect(JSON.parse(remainingLines[0])).toMatchObject({
        session_id: fresh.session_id,
        attempts: 4,
        last_error: "transcript yielded no user/assistant text",
      });

      const deadLines = readFileSync(join(logs, "pending-sleep.dead.jsonl"), "utf8").trim().split("\n");
      expect(deadLines).toEqual([staleLine]);

      const events = readFileSync(join(logs, "circadian.events.jsonl"), "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(events).toContainEqual(
        expect.objectContaining({
          outcome: "degraded",
          phase: "drain-deadletter",
          session_id: stale.session_id,
          context: expect.objectContaining({
            attempts: 4,
            queued_at: stale.queued_at,
            last_error: "previous fixture failure",
            at_drain_start: true,
          }),
        })
      );
      // Stale was dead-lettered at start — no draft-failed / empty-transcript events for it.
      expect(events.filter((e) => e.session_id === stale.session_id && e.phase === "extract-transcript")).toHaveLength(0);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
