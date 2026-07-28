// status.test.ts — the R7 fitness streak (docs/POPULATION-MEMORY.md §7 R7)
// and the population vitals segment (popmem WS-D). Pure logic tested over
// in-memory fixtures; the --line CLI's obs-silence property tested
// end-to-end via a sandboxed CIRCADIAN_HOME subprocess (no mind interaction,
// no mocking of the code under test).
import { describe, test, expect, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { tmpdir, homedir } from "os";
import { spawnSync } from "child_process";
import { computeVerdictStreak, populationVitalsSegment, type ScoreEvent, type PopulationVitalsSnapshot } from "./status.ts";

const BUN_BIN = process.env.CIRCADIAN_BUN_BIN || path.join(homedir(), ".bun/bin/bun");
const STATUS_SCRIPT = path.join(import.meta.dir, "status.ts");

const dirs: string[] = [];
function tmpDir(): string {
  const d = fs.mkdtempSync(path.join(tmpdir(), "status-test-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length) {
    const d = dirs.pop()!;
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* already gone */
    }
  }
});

function runStatusLine(circadianHome: string): { status: number | null; stdout: string } {
  const r = spawnSync(BUN_BIN, [STATUS_SCRIPT, "--line"], {
    env: { ...process.env, CIRCADIAN_HOME: circadianHome },
    input: "",
    encoding: "utf8",
  });
  return { status: r.status, stdout: r.stdout ?? "" };
}

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

  test("explicit bad counts DOUBLE — 4 explicit-bad windows (no rem judgment at all) trips the 7-window kill switch", () => {
    // No rem events anywhere in this fixture, so the 3 unverdicted windows
    // are UNSCORED (never judged) and excluded from the walk entirely — only
    // explicit-bad windows are scored here, each weighing double.
    const events = [
      wake(W[0]), wake(W[1]), wake(W[2]), wake(W[3]), wake(W[4]), wake(W[5]),
      explicitBad("2026-07-01T12:00:00.000Z"), // window [W0,W1)
      explicitBad("2026-07-02T12:00:00.000Z"), // window [W1,W2)
      explicitBad("2026-07-03T12:00:00.000Z"), // window [W2,W3)
      explicitBad("2026-07-04T12:00:00.000Z"), // window [W3,W4)
      // window [W4,W5) carries no verdict and no rem event — unscored
    ];
    // newest-first over SCORED windows only: bad(2)+bad(2)+bad(2)+bad(2) = 8 >= 7
    expect(computeVerdictStreak(events)).toEqual({ kind: "bad", count: 8, killSwitch: true });
  });

  test("below the weighted threshold, the kill switch stays off", () => {
    const events = [
      wake(W[0]), wake(W[1]), wake(W[2]), wake(W[3]),
      explicitBad("2026-07-02T12:00:00.000Z"), // window [W1,W2)
      explicitBad("2026-07-01T12:00:00.000Z"), // window [W0,W1)
      // window [W2,W3) carries no verdict and no rem event — unscored
    ];
    // bad(2) + bad(2) = 4 < 7
    expect(computeVerdictStreak(events)).toEqual({ kind: "bad", count: 4, killSwitch: false });
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

  test("no verdicts and no rem events at all => every window is unscored (never judged), not a bad streak", () => {
    const events = [wake(W[0]), wake(W[1]), wake(W[2])];
    expect(computeVerdictStreak(events)).toEqual({ kind: "none", count: 0, killSwitch: false });
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

  test("200 quiet historical windows + the first-ever rem event (greeting-sourced) => its span retroactively covers all of them ok", () => {
    // The first-ever rem event's span has no predecessor, so per spec it
    // covers back to the dawn of the record — every prior window reads ok,
    // not "silent" (the whole point of the granularity fix: a measurement
    // gap that predates judgment is not evidence of failure).
    const baseMs = Date.parse("2026-01-01T00:00:00.000Z");
    const manyWakes: ScoreEvent[] = [];
    for (let i = 0; i < 203; i++) {
      manyWakes.push(wake(new Date(baseMs + i * 86_400_000).toISOString()));
    }
    const lastWakeMs = baseMs + 202 * 86_400_000;
    const events: ScoreEvent[] = [
      ...manyWakes,
      rem(new Date(lastWakeMs - 36 * 3_600_000).toISOString(), ["NOW.LiveTensions[1]"]), // window [200,201) — first rem ever
      rem(new Date(lastWakeMs - 12 * 3_600_000).toISOString(), ["NOW.Arc[0]"]), // window [201,202)
    ];
    const streak = computeVerdictStreak(events);
    expect(streak.kind).toBe("ok");
    expect(streak.count).toBe(202); // every one of the 202 closed windows
    expect(streak.killSwitch).toBe(false);
  });

  test("a judged span with propagation credits every window inside it, not just the one containing the rem's own ts", () => {
    // 5 wakes => 4 windows; a single rem event, landing in the last window,
    // whose span (no predecessor) covers all 4.
    const events = [
      wake(W[0]), wake(W[1]), wake(W[2]), wake(W[3]), wake(W[4]),
      rem("2026-07-04T12:00:00.000Z", ["NOW.Arc[1]"]), // window [W3,W4), span covers [W0,W1)..[W3,W4)
    ];
    expect(computeVerdictStreak(events)).toEqual({ kind: "ok", count: 4, killSwitch: false });
  });

  test("a judged span with NO greeting-sourced propagation scores every window inside it zero-credit (not unscored)", () => {
    const events = [
      wake(W[0]), wake(W[1]), wake(W[2]), wake(W[3]),
      rem("2026-07-03T12:00:00.000Z", ["SELF.Doctrine[2]"]), // window [W2,W3), span covers [W0,W1) and [W1,W2) too
    ];
    // All 3 windows are SCORED (judged by this span) but zero-credit: bad,
    // unweighted (no explicit bad), count = 3.
    expect(computeVerdictStreak(events)).toEqual({ kind: "bad", count: 3, killSwitch: false });
  });

  test("many unjudged trailing windows (newer than the last rem event) are unscored — no bad streak growth from them", () => {
    // A single old greeting-sourced rem event judges only its own early
    // window ok; many subsequent wake-to-wake windows follow with NO further
    // rem event at all — those trailing windows must not read as a growing
    // bad streak (the live defect this fix removes).
    const baseMs = Date.parse("2026-02-01T00:00:00.000Z");
    const wakes: ScoreEvent[] = [];
    for (let i = 0; i < 10; i++) {
      wakes.push(wake(new Date(baseMs + i * 3_600_000).toISOString())); // 10 wakes, hourly => 9 windows
    }
    const events: ScoreEvent[] = [
      ...wakes,
      rem(new Date(baseMs + 1_800_000).toISOString(), ["NOW.FlightPlan[1]"]), // inside window [0,1) only
      // windows [1,2) .. [8,9) (8 of them) follow with no rem event at all
    ];
    const streak = computeVerdictStreak(events);
    // only window [0,1) is scored (this rem's span has no predecessor, but
    // it lands before window [1,2) even starts, so it covers window [0,1)
    // alone); the 8 trailing windows are unscored, not bad.
    expect(streak).toEqual({ kind: "ok", count: 1, killSwitch: false });
  });

  test("mixed shape: old judged-ok spans + an unjudged tail => ok streak, no kill switch", () => {
    const baseMs = Date.parse("2026-03-01T00:00:00.000Z");
    const wakes: ScoreEvent[] = [];
    for (let i = 0; i < 12; i++) {
      wakes.push(wake(new Date(baseMs + i * 3_600_000).toISOString()));
    }
    const events: ScoreEvent[] = [
      ...wakes,
      // Two consecutive greeting-sourced rem events cover windows [0,1)..[3,4)
      // (first has no predecessor, so its span reaches back to the start).
      rem(new Date(baseMs + 1 * 3_600_000 + 1_800_000).toISOString(), ["NOW.Arc[1]"]), // window [1,2)
      rem(new Date(baseMs + 3 * 3_600_000 + 1_800_000).toISOString(), ["NOW.LiveTensions[2]"]), // window [3,4)
      // windows [4,5) .. [10,11) (7 of them): no rem, no verdict — unjudged tail
    ];
    const streak = computeVerdictStreak(events);
    expect(streak.kind).toBe("ok");
    expect(streak.count).toBe(4); // the 4 old judged-ok windows only
    expect(streak.killSwitch).toBe(false);
  });
});

// ---------------------------------------------------------------------
// populationVitalsSegment — pure render of the popmem vitals strip segment
// ---------------------------------------------------------------------
describe("populationVitalsSegment", () => {
  const NOW = "2026-07-27T12:00:00.000Z";

  function snapshot(overrides: Partial<PopulationVitalsSnapshot> = {}): PopulationVitalsSnapshot {
    return { ts: "2026-07-27T06:00:00.000Z", src_loc: 500, population: 41, top_weight: 6.2, sank_below_floor: [], ...overrides };
  }

  test("absent snapshot => no segment", () => {
    expect(populationVitalsSegment(null, NOW)).toBeNull();
  });

  test("fresh snapshot renders population and top weight", () => {
    expect(populationVitalsSegment(snapshot(), NOW)).toBe("pop 41 (top 6.2)");
  });

  test("non-empty sank_below_floor appends the ↓K sank marker", () => {
    expect(populationVitalsSegment(snapshot({ sank_below_floor: ["a1", "b2", "c3"] }), NOW)).toBe("pop 41 (top 6.2) ↓3 sank");
  });

  test("empty sank_below_floor omits the sank marker entirely", () => {
    expect(populationVitalsSegment(snapshot({ sank_below_floor: [] }), NOW)).not.toContain("sank");
  });

  test("a snapshot older than 36h renders `pop stale` instead of the real numbers", () => {
    const old = snapshot({ ts: "2026-07-25T23:00:00.000Z" }); // 37h before NOW
    expect(populationVitalsSegment(old, NOW)).toBe("pop stale");
  });

  test("a snapshot exactly at the 36h boundary is NOT stale", () => {
    const boundary = snapshot({ ts: "2026-07-26T00:00:00.000Z" }); // exactly 36h before NOW
    expect(populationVitalsSegment(boundary, NOW)).toBe("pop 41 (top 6.2)");
  });

  test("an unparseable ts renders `pop stale` (degradation must stay visible, never crash)", () => {
    expect(populationVitalsSegment(snapshot({ ts: "not-a-date" }), NOW)).toBe("pop stale");
  });
});

// ---------------------------------------------------------------------
// --line CLI, sandboxed: population segment presence/absence + the
// obs-silence property (Law 9's one deliberate exception — see the module
// header comment in status.ts).
// ---------------------------------------------------------------------
describe("status.ts --line CLI — sandboxed", () => {
  function seedMind(home: string) {
    const mindDir = path.join(home, "mind");
    fs.mkdirSync(mindDir, { recursive: true });
    fs.writeFileSync(path.join(mindDir, "SELF.md"), "# SELF\n");
    fs.writeFileSync(path.join(mindDir, "scoreboard.jsonl"), "");
  }

  test("no logs/.population-vitals.json => no pop segment in the line", () => {
    const home = tmpDir();
    seedMind(home);
    const { status, stdout } = runStatusLine(home);
    expect(status).toBe(0);
    expect(stdout).not.toContain("pop ");
  });

  test("a fresh logs/.population-vitals.json snapshot => the pop segment appears in the rendered line", () => {
    const home = tmpDir();
    seedMind(home);
    const logsDir = path.join(home, "logs");
    fs.mkdirSync(logsDir, { recursive: true });
    const snap: PopulationVitalsSnapshot = {
      ts: new Date().toISOString(),
      src_loc: 500,
      population: 41,
      top_weight: 6.2,
      sank_below_floor: ["a1"],
    };
    fs.writeFileSync(path.join(logsDir, ".population-vitals.json"), JSON.stringify(snap));
    const { status, stdout } = runStatusLine(home);
    expect(status).toBe(0);
    expect(stdout).toContain("pop 41 (top 6.2) ↓1 sank");
  });

  test("a rem-popmem scoreboard event with stacked/bumped shows both in the rem segment", () => {
    const home = tmpDir();
    seedMind(home);
    const remEvent: ScoreEvent = {
      ts: new Date().toISOString(),
      type: "rem",
      worldview_tokens: 1000,
      propagated: ["SELF.Doctrine[1]"],
      composted: [],
      stacked: 3,
      bumped: 5,
    };
    fs.writeFileSync(path.join(home, "mind", "scoreboard.jsonl"), JSON.stringify(remEvent) + "\n");
    const { status, stdout } = runStatusLine(home);
    expect(status).toBe(0);
    expect(stdout).toContain("rem 1 today (1 propagated, stacked 3, bumped 5)");
  });

  test("a pre-switchover v1 rem event (no stacked/bumped fields) keeps the old propagated-only phrasing", () => {
    const home = tmpDir();
    seedMind(home);
    const remEvent: ScoreEvent = {
      ts: new Date().toISOString(),
      type: "rem",
      worldview_tokens: 1000,
      propagated: ["SELF.Doctrine[1]", "SELF.Doctrine[2]"],
      composted: [],
    };
    fs.writeFileSync(path.join(home, "mind", "scoreboard.jsonl"), JSON.stringify(remEvent) + "\n");
    const { status, stdout } = runStatusLine(home);
    expect(status).toBe(0);
    expect(stdout).toContain("rem 1 today (2 propagated)");
    expect(stdout).not.toContain("stacked");
  });

  test("--line never appends to logs/circadian.events.jsonl — obs-silent by design (Law 9's one exception)", () => {
    const home = tmpDir();
    seedMind(home);
    const eventsLogPath = path.join(home, "logs", "circadian.events.jsonl");
    fs.mkdirSync(path.dirname(eventsLogPath), { recursive: true });
    fs.writeFileSync(eventsLogPath, ""); // pre-exists, empty — the byte-unchanged baseline
    const before = fs.readFileSync(eventsLogPath, "utf8");

    const { status } = runStatusLine(home);
    expect(status).toBe(0);

    const after = fs.readFileSync(eventsLogPath, "utf8");
    expect(after).toBe(before);
  });
});
