// sleep.test.ts — the R7 implicit-ok decision (docs/POPULATION-MEMORY.md §7
// R7), unit-tested over fixture scoreboard JSONL built in-memory. No mocking
// of the function under test; decideImplicitOk is pure (I/O — reading the
// scoreboard and appending the verdict — happens in checkImplicitOk, which
// this suite does not need to exercise to prove the decision logic).
import { describe, test, expect } from "bun:test";
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
