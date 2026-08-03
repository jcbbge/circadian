// janitor.test.ts — the meals/ janitor. Two layers, house style:
//   1. pure decision logic (classifyMealFile / planSweep) over in-memory
//      fixtures — no I/O, no mocks;
//   2. CLI end-to-end via a real subprocess against a sandboxed
//      CIRCADIAN_HOME with real tmp dirs/files (decay.test.ts's pattern),
//      proving the sweep deletes exactly the ended sessions' files, skips
//      live/pending/young, honors the drain lock, goes blind-safe on an
//      unreadable transcript root, is idempotent, and emits the one
//      janitor/sweep obs event with the contract counts.
import { describe, test, expect, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { homedir, tmpdir } from "os";
import { spawnSync } from "child_process";
import {
  classifyMealFile,
  isLiveSession,
  planSweep,
  SAFETY_WINDOW_MS,
  type SweepCandidate,
} from "./janitor.ts";

const BUN_BIN = process.env.CIRCADIAN_BUN_BIN || path.join(homedir(), ".bun/bin/bun");
const JANITOR_SCRIPT = path.join(import.meta.dir, "janitor.ts");

const NOW = 1_800_000_000_000; // fixed clock for the pure tests

function cand(sessionId: string, kind: SweepCandidate["kind"], ageHours: number): SweepCandidate {
  return {
    path: `/tmp/fake/${kind === "meal" ? "" : "."}${sessionId}${kind === "meal" ? ".md" : ".state.json"}`,
    sessionId,
    kind,
    mtimeMs: NOW - ageHours * 3_600_000,
  };
}

// ---------------------------------------------------------------------
// classifyMealFile — the two leak shapes, both harnesses
// ---------------------------------------------------------------------
describe("classifyMealFile", () => {
  test("meal: <sessionId>.md", () => {
    expect(classifyMealFile("abc-123.md")).toEqual({ kind: "meal", sessionId: "abc-123" });
  });
  test("state: .<sessionId>.state.json (graze + pi extension naming)", () => {
    expect(classifyMealFile(".abc-123.state.json")).toEqual({ kind: "state", sessionId: "abc-123" });
  });
  test("rejects dotfile meals, stray files, and empty ids", () => {
    expect(classifyMealFile(".hidden.md")).toBeNull();
    expect(classifyMealFile("notes.txt")).toBeNull();
    expect(classifyMealFile(".state.json")).toBeNull();
    expect(classifyMealFile(".md")).toBeNull();
  });
});

// ---------------------------------------------------------------------
// isLiveSession — substring match covers both transcript namings
// ---------------------------------------------------------------------
describe("isLiveSession", () => {
  test("claude naming: <sessionId>.jsonl", () => {
    expect(isLiveSession("abc-123", ["abc-123.jsonl"])).toBe(true);
  });
  test("pi naming: <ts>_<sessionId>.jsonl", () => {
    expect(isLiveSession("abc-123", ["2026-08-03T01-02-03-444Z_abc-123.jsonl"])).toBe(true);
  });
  test("no match => not live", () => {
    expect(isLiveSession("abc-123", ["other-456.jsonl", "2026-08-03T01-02-03-444Z_def-789.jsonl"])).toBe(false);
  });
});

// ---------------------------------------------------------------------
// planSweep — the policy matrix, in priority order
// ---------------------------------------------------------------------
describe("planSweep", () => {
  const empty = new Set<string>();

  test("old file, no transcript, not pending => delete", () => {
    const d = planSweep([cand("dead-1", "meal", 24)], [], empty, NOW);
    expect(d[0].action).toBe("delete");
  });

  test("session in pending-sleep queue => skip-pending (SLEEP still owed), even when ancient", () => {
    const d = planSweep([cand("pend-1", "meal", 24 * 30)], [], new Set(["pend-1"]), NOW);
    expect(d[0].action).toBe("skip-pending");
  });

  test("recent transcript for the session => skip-live, even when the file itself is old", () => {
    const d = planSweep([cand("live-1", "state", 24)], ["live-1.jsonl"], empty, NOW);
    expect(d[0].action).toBe("skip-live");
  });

  test("file newer than the safety window => skip-young (no transcript, not pending)", () => {
    const d = planSweep([cand("young-1", "state", 1)], [], empty, NOW);
    expect(d[0].action).toBe("skip-young");
  });

  test("window boundary: mtime exactly 6h old is NOT newer => deletable; 1ms inside => kept", () => {
    const atEdge = planSweep(
      [{ ...cand("edge-1", "state", 0), mtimeMs: NOW - SAFETY_WINDOW_MS }],
      [], empty, NOW
    );
    expect(atEdge[0].action).toBe("delete");
    const inside = planSweep(
      [{ ...cand("edge-2", "state", 0), mtimeMs: NOW - SAFETY_WINDOW_MS + 1 }],
      [], empty, NOW
    );
    expect(inside[0].action).toBe("skip-young");
  });

  test("priority: pending beats live; live beats young", () => {
    const d = planSweep(
      [cand("both-1", "meal", 24), cand("both-2", "meal", 1)],
      ["both-1.jsonl", "both-2.jsonl"],
      new Set(["both-1"]),
      NOW
    );
    expect(d[0].action).toBe("skip-pending");
    expect(d[1].action).toBe("skip-live");
  });
});

// ---------------------------------------------------------------------
// CLI end-to-end, sandboxed CIRCADIAN_HOME (real subprocess, no mocks)
// ---------------------------------------------------------------------
const tmpDirs: string[] = [];
function tmpDir(): string {
  const d = fs.mkdtempSync(path.join(tmpdir(), "janitor-test-"));
  tmpDirs.push(d);
  return d;
}
afterEach(() => {
  while (tmpDirs.length) {
    const d = tmpDirs.pop()!;
    // restore any chmod 0o000 probe dirs so cleanup can recurse
    try {
      fs.chmodSync(path.join(d, "claude-projects"), 0o755);
    } catch {
      /* fixture never created it */
    }
    fs.rmSync(d, { recursive: true, force: true });
  }
});

function setAge(file: string, ageHours: number): void {
  const t = new Date(Date.now() - ageHours * 3_600_000);
  fs.utimesSync(file, t, t);
}

interface Seed {
  home: string;
  mealsDir: string;
  files: Record<string, string>;
}

// The leak fixture: five sessions, one per skip/delete class.
//  ended-*  : 24h-old meal+state, no transcript, not pending => swept
//  live-*   : 24h-old files + a transcript with a fresh mtime => kept
//  pend-*   : 24h-old files + a pending-sleep queue line => kept
//  young-*  : 1h-old state, no transcript => kept (safety window)
function seedSandbox(): Seed {
  const home = tmpDir();
  const mealsDir = path.join(home, "mind", "meals");
  const logsDir = path.join(home, "logs");
  const claudeDir = path.join(home, "claude-projects", "proj-a");
  const piDir = path.join(home, "pi-sessions", "slug-a");
  fs.mkdirSync(mealsDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.mkdirSync(piDir, { recursive: true });

  const files: Record<string, string> = {};
  const meal = (id: string) => {
    const p = path.join(mealsDir, `${id}.md`);
    fs.writeFileSync(p, `# meal ${id}\n`);
    return p;
  };
  const state = (id: string) => {
    const p = path.join(mealsDir, `.${id}.state.json`);
    fs.writeFileSync(p, JSON.stringify({ lastCheckpointTs: 0, byteOffset: 0, checkpoints: 0 }));
    return p;
  };

  files.endedMeal = meal("ended-000");
  files.endedState = state("ended-000");
  files.liveClaudeMeal = meal("live-111");
  files.liveClaudeState = state("live-111");
  files.livePiState = state("live-222");
  files.pendMeal = meal("pend-333");
  files.pendState = state("pend-333");
  files.youngState = state("young-444");

  for (const k of ["endedMeal", "endedState", "liveClaudeMeal", "liveClaudeState", "livePiState", "pendMeal", "pendState"])
    setAge(files[k], 24);
  setAge(files.youngState, 1);

  // live transcripts (fresh mtimes), both harness namings
  fs.writeFileSync(path.join(claudeDir, "live-111.jsonl"), "{}\n");
  fs.writeFileSync(path.join(piDir, "2026-08-03T01-02-03-444Z_live-222.jsonl"), "{}\n");

  // pending-sleep queue: SLEEP still owed for pend-333
  fs.writeFileSync(
    path.join(logsDir, "pending-sleep.jsonl"),
    JSON.stringify({
      ts: new Date().toISOString(), session_id: "pend-333", transcript_path: "/x/y.jsonl",
      transcript_chars: 0, attempts: 0, last_error: "", queued_at: new Date().toISOString(),
    }) + "\n"
  );

  return { home, mealsDir, files };
}

function runJanitor(home: string, extraArgs: string[] = []): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(BUN_BIN, [JANITOR_SCRIPT, ...extraArgs], {
    env: {
      ...process.env,
      CIRCADIAN_HOME: home,
      CIRCADIAN_PROJECTS_DIR: path.join(home, "claude-projects"),
      CIRCADIAN_PI_SESSIONS_DIR: path.join(home, "pi-sessions"),
    },
    encoding: "utf8",
  });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function lastJanitorEvent(home: string): any {
  const log = path.join(home, "logs", "circadian.events.jsonl");
  const lines = fs.readFileSync(log, "utf8").trim().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const e = JSON.parse(lines[i]);
    if (e.process === "janitor") return e;
  }
  throw new Error("no janitor event in sandbox event log");
}

describe("janitor.ts CLI — sandboxed", () => {
  test("sweep deletes exactly the ended session's files; keeps live/pending/young; emits the contract event", () => {
    const { home, files } = seedSandbox();
    const { status, stdout, stderr } = runJanitor(home);
    expect(status).toBe(0);
    expect(stderr).toContain("circadian janitor/sweep OK");

    // deleted: the ended session, both shapes
    expect(fs.existsSync(files.endedMeal)).toBe(false);
    expect(fs.existsSync(files.endedState)).toBe(false);
    // kept: live (both harnesses), pending, young
    for (const k of ["liveClaudeMeal", "liveClaudeState", "livePiState", "pendMeal", "pendState", "youngState"])
      expect(fs.existsSync(files[k])).toBe(true);

    // one-line summary on stdout for the run log
    expect(stdout).toContain("janitor sweep: 1 meal(s), 1 state file(s) deleted");

    const ev = lastJanitorEvent(home);
    expect(ev.phase).toBe("sweep");
    expect(ev.outcome).toBe("ok");
    expect(ev.context.deleted_meals).toBe(1);
    expect(ev.context.deleted_states).toBe(1);
    expect(ev.context.skipped_live).toBe(3); // live-111 meal+state, live-222 state
    expect(ev.context.skipped_pending).toBe(2); // pend-333 meal+state
    expect(ev.context.skipped_young).toBe(1);
  });

  test("pending-sleep.lock present => sweep skipped entirely, idle event, nothing deleted", () => {
    const { home, files } = seedSandbox();
    fs.writeFileSync(path.join(home, "logs", "pending-sleep.lock"), String(Date.now()));
    const { status, stderr } = runJanitor(home);
    expect(status).toBe(0);
    expect(stderr).toContain("circadian janitor/sweep IDLE");
    expect(fs.existsSync(files.endedMeal)).toBe(true);
    expect(fs.existsSync(files.endedState)).toBe(true);
  });

  test("idempotent: a second run deletes nothing", () => {
    const { home } = seedSandbox();
    runJanitor(home);
    const { status } = runJanitor(home);
    expect(status).toBe(0);
    const ev = lastJanitorEvent(home);
    expect(ev.context.deleted_meals).toBe(0);
    expect(ev.context.deleted_states).toBe(0);
  });

  test("--dry-run reports the same counts but deletes nothing, listing each would-delete with its age", () => {
    const { home, files } = seedSandbox();
    const { status, stdout } = runJanitor(home, ["--dry-run"]);
    expect(status).toBe(0);
    expect(fs.existsSync(files.endedMeal)).toBe(true);
    expect(fs.existsSync(files.endedState)).toBe(true);
    expect(stdout).toContain(`would-delete ${files.endedMeal} (age 24.0h)`);
    expect(stdout).toContain(`would-delete ${files.endedState} (age 24.0h)`);
    const ev = lastJanitorEvent(home);
    expect(ev.context.dry_run).toBe(true);
    expect(ev.context.deleted_meals).toBe(1);
    expect(ev.context.deleted_states).toBe(1);
  });

  test("blind-janitor rule: unreadable transcript root => degraded, exit 0, ZERO deletions", () => {
    const { home, files } = seedSandbox();
    fs.chmodSync(path.join(home, "claude-projects"), 0o000);
    const { status, stderr } = runJanitor(home);
    expect(status).toBe(0); // never cracks the host
    expect(stderr).toContain("circadian janitor/sweep DEGRADED");
    expect(fs.existsSync(files.endedMeal)).toBe(true);
    expect(fs.existsSync(files.endedState)).toBe(true);
    const ev = lastJanitorEvent(home);
    expect(ev.outcome).toBe("degraded");
    expect(ev.cause).toBeTruthy();
    expect(ev.next_action).toBeTruthy();
  });

  test("no meals/ dir => idle, exit 0", () => {
    const home = tmpDir();
    const { status, stderr } = runJanitor(home);
    expect(status).toBe(0);
    expect(stderr).toContain("circadian janitor/sweep IDLE");
  });
});
