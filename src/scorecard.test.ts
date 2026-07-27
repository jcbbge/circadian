// scorecard.test.ts — THE DAILY READING (docs/POPULATION-MEMORY.md §17),
// unit-tested over fixture data: no mind interaction, no mocking of the
// functions under test.
import { describe, test, expect } from "bun:test";
import {
  isFirstWakeToday,
  evaluateYesterdaysPrediction,
  resolveOutgoingPrediction,
  buildScorecard,
  dayNumber,
  type DailyReadingEntry,
} from "./scorecard.ts";

describe("isFirstWakeToday", () => {
  test("true when no wake event carries today's date prefix", () => {
    const scoreboard = [
      { type: "wake", ts: "2026-07-26T09:00:00.000Z" },
      { type: "sleep", ts: "2026-07-26T23:00:00.000Z" },
    ];
    expect(isFirstWakeToday(scoreboard, "2026-07-27")).toBe(true);
  });

  test("false when a wake event already carries today's date prefix", () => {
    const scoreboard = [
      { type: "wake", ts: "2026-07-27T09:00:00.000Z" },
      { type: "wake", ts: "2026-07-27T14:00:00.000Z" },
    ];
    expect(isFirstWakeToday(scoreboard, "2026-07-27")).toBe(false);
  });

  test("true on an empty scoreboard (day one, ever)", () => {
    expect(isFirstWakeToday([], "2026-07-27")).toBe(true);
  });

  test("ignores non-wake events with today's date prefix", () => {
    const scoreboard = [{ type: "sleep", ts: "2026-07-27T23:00:00.000Z" }];
    expect(isFirstWakeToday(scoreboard, "2026-07-27")).toBe(true);
  });
});

describe("dayNumber", () => {
  test("program day 1 is the anchor date itself", () => {
    expect(dayNumber("2026-07-27")).toBe(1);
  });
  test("counts forward", () => {
    expect(dayNumber("2026-07-28")).toBe(2);
    expect(dayNumber("2026-08-25")).toBe(30);
  });
});

describe("evaluateYesterdaysPrediction", () => {
  test("NONE when the ledger has no entry for yesterday (missing-ledger path)", () => {
    expect(evaluateYesterdaysPrediction([], "2026-07-27", {})).toEqual({ text: null, verdict: "NONE" });
  });

  function entryFor(day: string, prediction: DailyReadingEntry["prediction"]): DailyReadingEntry {
    return { ts: `${day}T09:00:00.000Z`, day, lines: ["a", "b", "c"], prediction };
  }

  test("HELD when the checked metric satisfies the comparison", () => {
    const ledger = [entryFor("2026-07-26", { text: "LOC stays under 9500", check: { metric: "loc_total", op: "<", value: 9500 } })];
    const result = evaluateYesterdaysPrediction(ledger, "2026-07-27", { loc_total: 9480 });
    expect(result).toEqual({ text: "LOC stays under 9500", verdict: "HELD" });
  });

  test("BROKE when the checked metric fails the comparison", () => {
    const ledger = [entryFor("2026-07-26", { text: "LOC stays under 9500", check: { metric: "loc_total", op: "<", value: 9500 } })];
    const result = evaluateYesterdaysPrediction(ledger, "2026-07-27", { loc_total: 9600 });
    expect(result).toEqual({ text: "LOC stays under 9500", verdict: "BROKE" });
  });

  test("UNJUDGED when the prediction carries no machine-checkable form", () => {
    const ledger = [entryFor("2026-07-26", { text: "the vibes will be good" })];
    const result = evaluateYesterdaysPrediction(ledger, "2026-07-27", { loc_total: 9480 });
    expect(result).toEqual({ text: "the vibes will be good", verdict: "UNJUDGED" });
  });

  test("UNJUDGED when the named metric isn't computable this wave (e.g. population before WS-B)", () => {
    const ledger = [entryFor("2026-07-26", { text: "population settles at 41", check: { metric: "population", op: "==", value: 41 } })];
    const result = evaluateYesterdaysPrediction(ledger, "2026-07-27", { loc_total: 9480 }); // no `population` key
    expect(result).toEqual({ text: "population settles at 41", verdict: "UNJUDGED" });
  });

  test("picks the entry whose day is exactly yesterday, ignoring older entries", () => {
    const ledger = [
      entryFor("2026-07-20", { text: "stale", check: { metric: "loc_total", op: "<", value: 1 } }),
      entryFor("2026-07-26", { text: "fresh", check: { metric: "loc_total", op: "<", value: 9999 } }),
    ];
    const result = evaluateYesterdaysPrediction(ledger, "2026-07-27", { loc_total: 100 });
    expect(result.text).toBe("fresh");
    expect(result.verdict).toBe("HELD");
  });
});

describe("resolveOutgoingPrediction", () => {
  test("falls back to the honest placeholder when nothing was pre-seeded", () => {
    const result = resolveOutgoingPrediction([], "2026-07-27");
    expect(result.seeded).toBe(false);
    expect(result.prediction.text).toMatch(/none set/);
  });

  test("uses the orchestrator's pre-seeded prediction when the newest ledger line is dated today+1", () => {
    const seed: DailyReadingEntry = {
      ts: "2026-07-27T15:00:00.000Z",
      day: "2026-07-28",
      lines: [],
      prediction: { text: "WS-A merges tomorrow" },
    };
    const result = resolveOutgoingPrediction([seed], "2026-07-27");
    expect(result.seeded).toBe(true);
    expect(result.prediction.text).toBe("WS-A merges tomorrow");
  });

  test("ignores a newest line that is NOT dated today+1", () => {
    const notTomorrow: DailyReadingEntry = {
      ts: "2026-07-27T15:00:00.000Z",
      day: "2026-07-27", // today, not tomorrow
      lines: [],
      prediction: { text: "irrelevant" },
    };
    const result = resolveOutgoingPrediction([notTomorrow], "2026-07-27");
    expect(result.seeded).toBe(false);
  });
});

describe("buildScorecard", () => {
  test("missing-ledger path (day one) still returns a valid 3-line block", () => {
    const result = buildScorecard({
      today: "2026-07-27",
      nowIso: "2026-07-27T09:00:00.000Z",
      ledger: [],
      locTotal: 9466,
      locBaseline: 9466,
      degradedToday: 0,
      verdictStreak: { kind: "none", count: 0 },
      lastRem: null,
    });
    expect(result.lines).toHaveLength(3);
    expect(result.lines[0]).toContain("day 1/30");
    expect(result.lines[0]).toContain("LOC 9466 (baseline 9466, +0)");
    expect(result.lines[1]).toContain("degraded 0 today");
    expect(result.lines[1]).toContain("last rem: none yet");
    expect(result.lines[2]).toBe(`yesterday's prediction: (none recorded) · prediction: (none set — orchestrator seeds via logs/daily-reading.jsonl)`);
    expect(result.entry.day).toBe("2026-07-27");
    expect(result.entry.lines).toEqual(result.lines);
  });

  test("a fuller day: LOC delta, degraded count, streak, last rem, and a HELD prediction all render", () => {
    const ledger: DailyReadingEntry[] = [
      {
        ts: "2026-07-26T09:00:00.000Z",
        day: "2026-07-26",
        lines: [],
        prediction: { text: "LOC stays under 9600", check: { metric: "loc_total", op: "<", value: 9600 } },
      },
    ];
    const result = buildScorecard({
      today: "2026-07-27",
      nowIso: "2026-07-27T12:00:00.000Z",
      ledger,
      locTotal: 9500,
      locBaseline: 9466,
      degradedToday: 2,
      verdictStreak: { kind: "ok", count: 3 },
      lastRem: { ts: "2026-07-27T09:00:00.000Z", propagated: 2, composted: 1, self_changed: true },
    });
    expect(result.lines[0]).toBe("day 1/30 · LOC 9500 (baseline 9466, +34)");
    expect(result.lines[1]).toBe("degraded 2 today · verdict streak ok×3 · last rem 3.0h ago: propagated 2, composted 1, self_changed true");
    expect(result.lines[2]).toBe(
      `yesterday's prediction: "LOC stays under 9600" → HELD · prediction: (none set — orchestrator seeds via logs/daily-reading.jsonl)`
    );
  });

  test("negative LOC delta renders without a stray plus sign", () => {
    const result = buildScorecard({
      today: "2026-07-27",
      nowIso: "2026-07-27T09:00:00.000Z",
      ledger: [],
      locTotal: 9000,
      locBaseline: 9466,
      degradedToday: 0,
      verdictStreak: { kind: "bad", count: 2 },
      lastRem: null,
    });
    expect(result.lines[0]).toContain("(baseline 9466, -466)");
  });
});
