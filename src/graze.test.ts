// graze.test.ts — the hook's obs-volume contract, exercised through the REAL
// hook (repo doctrine: no mocks of the code under test). Each "tick" below
// spawns src/graze.ts in hook mode exactly as Claude Code's PostToolUse hook
// does, against a throwaway CIRCADIAN_HOME, and the assertions read the real
// events ledger the run produces.
//
// WHY THIS EXISTS (measured 2026-08-14): the hook fires many times a minute per
// live session, and its two "nothing to do yet" exits used to write one obs
// event each time — 77,614 graze/throttle + 14,366 graze/guard "delta below
// minimum" out of 112,366 total ledger events, i.e. 82% of the entire ledger.
// Replaying the real ledger through the notice rule below: 91,600 skip events
// collapse to 2,042, a 44.9x reduction. MIND-SPEC law says motion is the
// metric, so the skips must still be COUNTED — hence suppressed_count, and
// hence the "first skip of a session always reports" case, which is what keeps
// doctor.ts's graze liveness check fed.
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const GRAZE = join(import.meta.dir, "graze.ts");
const BUN = process.execPath;

let home = "";

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "circadian-graze-test-"));
  mkdirSync(join(home, "mind", "meals"), { recursive: true });
  mkdirSync(join(home, "logs"), { recursive: true });
});

afterEach(() => {
  if (home && existsSync(home)) rmSync(home, { recursive: true, force: true });
});

const SESSION = "test-session-0001";

function transcriptOf(bytes: number): string {
  const p = join(home, "transcript.jsonl");
  writeFileSync(p, "x".repeat(bytes));
  return p;
}

function seedState(st: Record<string, unknown>): void {
  writeFileSync(join(home, "mind", "meals", `.${SESSION}.state.json`), JSON.stringify(st));
}

/** One PostToolUse hook fire, exactly as the harness delivers it. */
function tick(transcriptPath: string, env: Record<string, string> = {}): void {
  const r = spawnSync(BUN, ["run", GRAZE], {
    input: JSON.stringify({ session_id: SESSION, transcript_path: transcriptPath }),
    env: { ...process.env, CIRCADIAN_HOME: home, CIRCADIAN_GRAZE_NOTICE_MS: "", ...env },
    encoding: "utf8",
  });
  expect(r.status).toBe(0);
}

function ledger(): any[] {
  const p = join(home, "logs", "circadian.events.jsonl");
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function skipEvents(phase: string): any[] {
  return ledger().filter((e) => e.process === "graze" && e.phase === phase);
}

describe("graze hook — throttle skip notices", () => {
  test("ten ticks inside the interval produce ONE ledger event, not ten", () => {
    const t = transcriptOf(1024);
    seedState({ lastCheckpointTs: Date.now(), byteOffset: 0, checkpoints: 0 });
    for (let i = 0; i < 10; i++) tick(t);

    const events = skipEvents("throttle");
    expect(events.length).toBe(1);
    expect(events[0].outcome).toBe("idle");
  });

  test("the one event that IS written counts every skip it stands for", () => {
    const t = transcriptOf(1024);
    seedState({ lastCheckpointTs: Date.now(), byteOffset: 0, checkpoints: 0 });
    for (let i = 0; i < 5; i++) tick(t);

    // The first tick reports immediately (suppressed_count 1) and the next
    // four are folded into the counter on disk, ready for the next notice.
    const [first] = skipEvents("throttle");
    expect(first.context.suppressed_count).toBe(1);
    expect(first.context.session_id).toBe(SESSION);
    expect(first.context.interval_ms).toBeGreaterThan(0);

    const st = JSON.parse(readFileSync(join(home, "mind", "meals", `.${SESSION}.state.json`), "utf8"));
    expect(st.skipNotices.throttle.suppressed).toBe(4);
    // The checkpoint fields the worker owns are untouched by notice bookkeeping.
    expect(st.byteOffset).toBe(0);
    expect(st.checkpoints).toBe(0);
  });

  test("a zero-length notice window emits on every tick (the cadence is the only thing suppressing)", () => {
    const t = transcriptOf(1024);
    seedState({ lastCheckpointTs: Date.now(), byteOffset: 0, checkpoints: 0 });
    for (let i = 0; i < 4; i++) tick(t, { CIRCADIAN_GRAZE_NOTICE_MS: "0" });

    const events = skipEvents("throttle");
    expect(events.length).toBe(4);
    // Each one stands for exactly the single skip it reports.
    for (const e of events) expect(e.context.suppressed_count).toBe(1);
  });

  test("the FIRST skip of a session always reaches the ledger (doctor.ts liveness)", () => {
    const t = transcriptOf(1024);
    seedState({ lastCheckpointTs: Date.now(), byteOffset: 0, checkpoints: 0 });
    tick(t);
    // No prior notice state existed, so a session announces itself immediately
    // rather than going dark for an hour — checkProcess("graze", …) reads the
    // age of the last graze event.
    expect(skipEvents("throttle").length).toBe(1);
  });

  test("the phase/outcome shape doctor.ts reads is unchanged", () => {
    const t = transcriptOf(1024);
    seedState({ lastCheckpointTs: Date.now(), byteOffset: 0, checkpoints: 0 });
    tick(t);
    const e = skipEvents("throttle")[0];
    expect(e.process).toBe("graze");
    expect(e.phase).toBe("throttle");
    expect(e.outcome).toBe("idle");
    expect(typeof e.ts).toBe("string");
    expect(e.summary).toContain("checkpoint interval not yet elapsed");
  });
});

describe("graze hook — delta-below-minimum skip notices", () => {
  test("repeated ticks past the interval with a tiny delta collapse to one event", () => {
    // Interval elapsed (lastCheckpointTs 0) but the transcript is far below
    // MIN_DELTA_BYTES, so every tick lands on the delta guard.
    const t = transcriptOf(512);
    seedState({ lastCheckpointTs: 0, byteOffset: 0, checkpoints: 0 });
    for (let i = 0; i < 6; i++) tick(t);

    const events = skipEvents("guard");
    expect(events.length).toBe(1);
    expect(events[0].summary).toContain("delta below minimum size");
    expect(events[0].context.suppressed_count).toBe(1);

    const st = JSON.parse(readFileSync(join(home, "mind", "meals", `.${SESSION}.state.json`), "utf8"));
    expect(st.skipNotices.guard.suppressed).toBe(5);
    // Crucially: the guard skip must NOT claim the checkpoint slot.
    expect(st.lastCheckpointTs).toBe(0);
  });

  test("throttle and guard keep independent counters", () => {
    const t = transcriptOf(512);
    seedState({ lastCheckpointTs: Date.now(), byteOffset: 0, checkpoints: 0 });
    for (let i = 0; i < 3; i++) tick(t); // throttle path

    seedState({
      ...JSON.parse(readFileSync(join(home, "mind", "meals", `.${SESSION}.state.json`), "utf8")),
      lastCheckpointTs: 0,
    });
    for (let i = 0; i < 3; i++) tick(t); // guard path

    expect(skipEvents("throttle").length).toBe(1);
    expect(skipEvents("guard").length).toBe(1);
    const st = JSON.parse(readFileSync(join(home, "mind", "meals", `.${SESSION}.state.json`), "utf8"));
    expect(st.skipNotices.throttle.suppressed).toBe(2);
    expect(st.skipNotices.guard.suppressed).toBe(2);
  });
});

describe("graze hook — guards that are NOT the repeating kind still speak every time", () => {
  test("a hook fired without a usable transcript reports on every fire", () => {
    const missing = join(home, "does-not-exist.jsonl");
    for (let i = 0; i < 3; i++) tick(missing);
    // This is a wiring fault, not a routine skip — it must never be summarized
    // away, and it has no session state to summarize into.
    const events = ledger().filter((e) => e.process === "graze" && /without a usable transcript/.test(e.summary));
    expect(events.length).toBe(3);
  });
});
