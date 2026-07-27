// status.test.ts — the R7 fitness streak (docs/POPULATION-MEMORY.md §7 R7),
// unit-tested over fixture scoreboard JSONL (ScoreEvent[] built in-memory —
// no mind interaction, no mocking of the function under test).
import { describe, test, expect } from "bun:test";
import { computeVerdictStreak, type ScoreEvent } from "./status.ts";

function wake(ts: string): ScoreEvent {
  return { ts, type: "wake", worldview_tokens: 1000 };
}
function explicitOk(ts: string): ScoreEvent {
  return { ts, type: "verdict", worldview_tokens: 1000, greeting_verdict: "ok" };
}
function explicitBad(ts: string): ScoreEvent {
  return { ts, type: "verdict", worldview_tokens: 1000, greeting_verdict: "bad", reason: "test" };
}
function implicitOk(ts: string, basis: string): ScoreEvent {
  return { ts, type: "verdict", worldview_tokens: 1000, greeting_verdict: "ok", source: "propagation", basis };
}
function rem(ts: string, propagated: string[]): ScoreEvent {
  return { ts, type: "rem", worldview_tokens: 1000, propagated };
}

// One wake per day — windows are exactly one day wide, easy to reason about.
const W = [
  "2026-07-01T00:00:00.000Z",
  "2026-07-02T00:00:00.000Z",
  "2026-07-03T00:00:00.000Z",
  "2026-07-04T00:00:00.000Z",
  "2026-07-05T00:00:00.000Z",
  "2026-07-06T00:00:00.000Z",
];

describe("computeVerdictStreak", () => {
  test("fewer than 2 wake events => no closed window exists yet", () => {
    expect(computeVerdictStreak([])).toEqual({ kind: "none", count: 0, killSwitch: false });
    expect(computeVerdictStreak([wake(W[0])])).toEqual({ kind: "none", count: 0, killSwitch: false });
  });

  test("the open window (since the last wake) is excluded — a fresh wake with no verdict yet is not a bad window", () => {
    // Only 2 wakes => exactly 1 closed window [W0,W1), which is ok.
    const events = [wake(W[0]), wake(W[1]), explicitOk("2026-07-01T12:00:00.000Z")];
    expect(computeVerdictStreak(events)).toEqual({ kind: "ok", count: 1, killSwitch: false });
  });

  test("every closed window ok => ok streak spans all of them", () => {
    const events = [
      wake(W[0]), wake(W[1]), wake(W[2]), wake(W[3]), wake(W[4]), wake(W[5]),
      explicitOk("2026-07-01T12:00:00.000Z"),
      explicitOk("2026-07-02T12:00:00.000Z"),
      explicitOk("2026-07-03T12:00:00.000Z"),
      explicitOk("2026-07-04T12:00:00.000Z"),
      explicitOk("2026-07-05T12:00:00.000Z"),
    ];
    expect(computeVerdictStreak(events)).toEqual({ kind: "ok", count: 5, killSwitch: false });
  });

  test("explicit bad counts DOUBLE — 2 explicit-bad windows + 3 silent windows trips the 7-window kill switch", () => {
    const events = [
      wake(W[0]), wake(W[1]), wake(W[2]), wake(W[3]), wake(W[4]), wake(W[5]),
      explicitBad("2026-07-04T12:00:00.000Z"), // window [W3,W4)
      explicitBad("2026-07-05T12:00:00.000Z"), // window [W4,W5) — newest
      // windows [W0,W1), [W1,W2), [W2,W3) carry no verdict at all — zero-ok
    ];
    // newest-first: bad(2) + bad(2) + none(1) + none(1) + none(1) = 7
    expect(computeVerdictStreak(events)).toEqual({ kind: "bad", count: 7, killSwitch: true });
  });

  test("below the weighted threshold, the kill switch stays off", () => {
    const events = [
      wake(W[0]), wake(W[1]), wake(W[2]), wake(W[3]),
      explicitBad("2026-07-03T12:00:00.000Z"), // window [W2,W3) — newest
      explicitBad("2026-07-02T12:00:00.000Z"), // window [W1,W2)
      // window [W0,W1) carries no verdict
    ];
    // bad(2) + bad(2) + none(1) = 5 < 7
    expect(computeVerdictStreak(events)).toEqual({ kind: "bad", count: 5, killSwitch: false });
  });

  test("an implicit ok is attributed by its rem `basis`, not by its own (much later) ts, and breaks a bad run", () => {
    const events = [
      wake(W[0]), wake(W[1]), wake(W[2]), wake(W[3]),
      explicitBad("2026-07-02T12:00:00.000Z"), // window [W1,W2)
      // The rem event that judged window [W2,W3) ran at 07-03T06:00; the
      // implicit ok verdict for it is only appended much later, at some
      // subsequent SLEEP (ts far in the future) — attribution must follow
      // the basis ts, not the verdict's own ts, or this credit would land
      // in the wrong (or no) window.
      implicitOk("2026-08-15T00:00:00.000Z", "2026-07-03T06:00:00.000Z"),
    ];
    const streak = computeVerdictStreak(events);
    expect(streak.kind).toBe("ok");
    expect(streak.count).toBe(1); // only the newest window [W2,W3) is ok; [W1,W2) is bad, stopping the run
  });

  test("explicit and implicit ok verdicts combine to extend one streak", () => {
    const events = [
      wake(W[0]), wake(W[1]), wake(W[2]), wake(W[3]),
      explicitOk("2026-07-02T12:00:00.000Z"), // window [W1,W2)
      implicitOk("2026-08-01T00:00:00.000Z", "2026-07-03T06:00:00.000Z"), // basis lands in window [W2,W3)
    ];
    expect(computeVerdictStreak(events)).toEqual({ kind: "ok", count: 2, killSwitch: false });
  });

  test("no verdicts at all across every closed window => a plain (unweighted) bad streak", () => {
    const events = [wake(W[0]), wake(W[1]), wake(W[2])];
    expect(computeVerdictStreak(events)).toEqual({ kind: "bad", count: 2, killSwitch: false });
  });

  test("R7 raw propagation: a rem event with a greeting-sourced address credits its window ok with NO verdict row at all", () => {
    const events = [
      wake(W[0]), wake(W[1]),
      rem("2026-07-01T12:00:00.000Z", ["NOW.Arc[0]"]), // window [W0,W1) — no verdict row exists
    ];
    expect(computeVerdictStreak(events)).toEqual({ kind: "ok", count: 1, killSwitch: false });
  });

  test("a rem event with only non-greeting propagation (e.g. SELF.Doctrine) does NOT credit the window", () => {
    const events = [
      wake(W[0]), wake(W[1]),
      rem("2026-07-01T12:00:00.000Z", ["SELF.Doctrine[1]"]),
    ];
    expect(computeVerdictStreak(events)).toEqual({ kind: "bad", count: 1, killSwitch: false });
  });

  test("explicit bad OVERRIDES propagation credit for its own window — precedence: a human saying bad outranks ambient motion", () => {
    const events = [
      wake(W[0]), wake(W[1]),
      rem("2026-07-01T06:00:00.000Z", ["NOW.FlightPlan[2]"]),
      explicitBad("2026-07-01T12:00:00.000Z"), // same window [W0,W1)
    ];
    // Without the override this would read "ok" (propagation is not zero);
    // the DECIDED precedence makes it bad, and still weighted double (the
    // single closed window weighs 2, below the killSwitch threshold of 7).
    expect(computeVerdictStreak(events)).toEqual({ kind: "bad", count: 2, killSwitch: false });
  });

  test("200 quiet historical windows + recent rem propagation => a small ok streak, no spurious kill switch", () => {
    // Simulates the live defect: many old wake-to-wake windows with zero
    // verdict rows (verdict rows only exist going forward from a re-arm),
    // but the most recent windows have real rem propagation.
    const baseMs = Date.parse("2026-01-01T00:00:00.000Z");
    const manyWakes: ScoreEvent[] = [];
    for (let i = 0; i < 203; i++) {
      manyWakes.push(wake(new Date(baseMs + i * 86_400_000).toISOString()));
    }
    const lastWakeMs = baseMs + 202 * 86_400_000;
    const events: ScoreEvent[] = [
      ...manyWakes,
      // Recent rem propagation in the last two closed windows only.
      rem(new Date(lastWakeMs - 12 * 3_600_000).toISOString(), ["NOW.Arc[0]"]), // window [201,202)
      rem(new Date(lastWakeMs - 36 * 3_600_000).toISOString(), ["NOW.LiveTensions[1]"]), // window [200,201)
    ];
    const streak = computeVerdictStreak(events);
    expect(streak.kind).toBe("ok");
    expect(streak.count).toBe(2);
    expect(streak.killSwitch).toBe(false);
  });
});
