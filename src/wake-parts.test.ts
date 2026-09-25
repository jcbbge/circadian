// wake-parts.test.ts — a Claude Code wake reaches the session whole (circ-29).
//
// Claude Code caps each hook output string at HOOK_OUTPUT_LIMIT (10,000)
// characters and shows only a 2,000-character preview of anything larger
// (source in wake-payload.ts). On hive 2026-09-25 the two constitutions
// filled that preview and mind:user / mind:here / mind:elsewhere never
// reached the agent. These tests hold the fix: every hook output stays under
// the cap — at the current mind's size and at the largest sizes the mind spec
// allows — the scoped sections come before anything that could be cut, and
// the parts together are the whole wake, constitutions verbatim.
import { describe, test, expect, afterAll } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { tmpdir } from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { buildPayload, splitForHook, hookOutputs, HOOK_OUTPUT_LIMIT, WAKE_PARTS, CAP_TOKENS } from "./wake-payload.ts";
import { HERE_TOKENS, ELSEWHERE_TOKENS } from "./scopes.ts";
import { CAPS } from "./status.ts";
import { outputForSlot, spoolPath, writeSpool } from "./wake-parts.ts";
import { mindDir, missingMindFilesAt, evidenceName } from "./test-evidence.ts";

const bytes = (s: string) => Buffer.byteLength(s, "utf8");
/** What Claude Code measures: the printed hook output (with its newline). */
function expectWithinHookCap(output: string) {
  const printed = output + "\n";
  expect(printed.length).toBeLessThanOrEqual(HOOK_OUTPUT_LIMIT);
  expect([...printed].length).toBeLessThanOrEqual(HOOK_OUTPUT_LIMIT);
  expect(bytes(printed)).toBeLessThanOrEqual(HOOK_OUTPUT_LIMIT);
}
/** Strip the part markers hookOutputs adds, recovering the payload text. */
function bodies(outputs: string[]): string {
  if (outputs.length === 1) return outputs[0];
  return outputs.map((o, i) => {
    const lines = o.split("\n");
    return (i === 0 ? lines.slice(0, -1) : lines.slice(1, -1)).join("\n") + "\n";
  }).join("").replace(/\n$/, "");
}
/** Text of `tokens` tokens (chars/4) in whole ~100-char lines, with the
 * multi-byte punctuation real mind files carry. */
function fill(label: string, tokens: number): string {
  const lines: string[] = [];
  let chars = 0;
  for (let i = 0; chars + 100 <= tokens * 4; i++) {
    const line = `- ${label} ${i} — a receipted line of mind text, whole and never truncated … ${"x".repeat(20)}`.slice(0, 99);
    lines.push(line);
    chars += line.length + 1;
  }
  return lines.join("\n");
}

// The largest wake the mind spec allows (MIND-SPEC Law 4 + scoped wake):
// USER 2k tokens (Corrections included), NOW 3k, <mind:here> 4k shared by NOW,
// evidence (1k budget) and detail, <mind:elsewhere> 300, greeting 3 lines.
// Constitutions have no size cap in the spec; each here is larger than one
// hook output, so they must be split and still arrive whole.
const NOW_MAX = `## Next move\n\nShip the wake parts.\n\n## Last sleep\n\n${new Date().toISOString()}\n\n${fill("now", CAPS["NOW.md"] - 40)}`;
const MAX = {
  user: `## Corrections\n\n${fill("correction", 600)}\n\n## Preferences\n\n${fill("preference", CAPS["USER.md"] - 620)}`,
  now: NOW_MAX,
  greeting: "Line one of the greeting.\nLine two.\nLine three.",
  evidence: `<mind:session-evidence>\n${fill("evidence", 990)}\n</mind:session-evidence>`,
  away: `While you were away (since 2026-09-24T00:00:00.000Z):\n${fill("away", 600)}`,
  here: fill("here", HERE_TOKENS - Math.ceil(NOW_MAX.length / 4) - 1000),
  elsewhere: fill("elsewhere", ELSEWHERE_TOKENS),
  constitution: `# The Constitution\n\n${fill("article", 3000)}`,
  constitutionJosh: `# Josh's Constitution\n\n${fill("covenant", 2600)}`,
};
const SPOOL = "/home/example/circadian/logs/wake-parts/0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0.json";

describe("splitForHook / hookOutputs (pure)", () => {
  test("a payload that fits one hook output is emitted unchanged, with no marker", () => {
    const payload = buildPayload({ scope: "arc", self: "", user: "", now: "## Next move\n\nGo.\n", greeting: "", constitution: "# C\n\nshort" });
    expect(hookOutputs(payload, SPOOL)).toEqual([payload]);
  });

  test("parts concatenate to the payload byte for byte and stay within the budget", () => {
    const payload = `head\n${"é".repeat(9000)}\n<mind:a>\n${fill("a", 3000)}\n</mind:a>\n<mind:b>\nshort\n</mind:b>\n${"z".repeat(25000)}`;
    const parts = splitForHook(payload, 9000);
    expect(parts.join("")).toBe(payload);
    for (const p of parts) expect(bytes(p)).toBeLessThanOrEqual(9000);
    // A section that fits one part is never cut across two.
    expect(parts.some((p) => p.includes("<mind:b>\nshort\n</mind:b>"))).toBe(true);
  });

  test("an empty payload is one empty part", () => {
    expect(splitForHook("")).toEqual([""]);
  });
});

describe("Claude Code wake at the largest sizes the mind spec allows", () => {
  const variants = {
    operator: {},
    slim: { slim: true },
    "kill switch": { killSwitch: true },
    global: { scope: "global" },
  } as const;
  for (const [name, opts] of Object.entries(variants)) {
    test(`${name}: every hook output is under ${HOOK_OUTPUT_LIMIT} characters, within ${WAKE_PARTS} slots, and the parts are the whole wake`, () => {
      const payload = buildPayload({ scope: "circadian", self: "", ...MAX, ...opts });
      expect(payload.length).toBeGreaterThan(HOOK_OUTPUT_LIMIT * 3); // genuinely needs parts
      const outputs = hookOutputs(payload, SPOOL);
      expect(outputs.length).toBeGreaterThan(1);
      expect(outputs.length).toBeLessThanOrEqual(WAKE_PARTS);
      for (const o of outputs) expectWithinHookCap(o);
      expect(bodies(outputs)).toBe(payload);
      // Part 1 — the one slot every install has — opens with the scope and
      // the next move, and its closing marker names the spool holding all.
      expect(outputs[0].startsWith(`Resolved scope: ${"scope" in opts ? opts.scope : "circadian"}\nNext move: Ship the wake parts.`)).toBe(true);
      expect(outputs[0].trimEnd().split("\n").at(-1)).toContain(SPOOL);
      // Delivery order: every scoped section lands before any constitution part.
      const firstConstitutionPart = outputs.findIndex((o) => o.includes("<mind:constitution"));
      const nowPart = outputs.findIndex((o) => o.includes("<mind:now>"));
      expect(nowPart).toBeGreaterThanOrEqual(0);
      expect(nowPart).toBeLessThan(firstConstitutionPart);
      expect(outputs.findIndex((o) => o.includes("</mind:here>"))).toBeLessThanOrEqual(firstConstitutionPart);
      // The constitutions are delivered verbatim, never dropped.
      expect(payload).toContain(MAX.constitution);
      expect(payload).toContain(MAX.constitutionJosh);
    });
  }

  test("hive-sized wake (2026-09-25 sizes): part 1 carries every scoped section; each constitution arrives whole in one part", () => {
    // Sizes measured on hive 2026-09-25, circadian scope: CONSTITUTION 7379 B,
    // CONSTITUTION-JOSH 3915 B, USER 385 B, NOW 1311 B, here detail ~13.5 KB.
    const hive = {
      user: `## Preferences\n\n${fill("preference", 90)}`,
      now: `## Next move\n\nShip the wake parts.\n\n## Last sleep\n\n${new Date().toISOString()}\n\n${fill("now", 300)}`,
      greeting: "Back on the wake parts.",
      evidence: `<mind:session-evidence>\n${fill("evidence", 300)}\n</mind:session-evidence>`,
      here: fill("here", 3380),
      elsewhere: fill("elsewhere", 40),
      constitution: `# The Constitution\n\n${fill("article", 1840)}`,
      constitutionJosh: `# Josh's Constitution\n\n${fill("covenant", 975)}`,
    };
    const payload = buildPayload({ scope: "circadian", self: "", ...hive });
    const outputs = hookOutputs(payload, SPOOL);
    for (const o of outputs) expectWithinHookCap(o);
    for (const tag of ["<mind:user>", "<mind:elsewhere>", '<mind:here scope="circadian">', "<mind:now>", "</mind:now>", "<mind:greeting>", "</mind:greeting>"])
      expect(outputs[0]).toContain(tag);
    expect(outputs.filter((o) => o.includes(hive.constitution))).toHaveLength(1);
    expect(outputs.filter((o) => o.includes(hive.constitutionJosh))).toHaveLength(1);
    expect(bodies(outputs)).toBe(payload);
  });

  test("scoped sections come before the constitutions (the part that could be cut)", () => {
    const payload = buildPayload({ scope: "circadian", self: "", ...MAX });
    const firstConstitution = payload.indexOf("<mind:constitution>");
    expect(firstConstitution).toBeGreaterThan(payload.indexOf("</mind:here>"));
    for (const tag of ["Resolved scope:", "Next move:", "<mind:corrections>", "<mind:user>", "<mind:elsewhere>", "<mind:here", "<mind:now>", "<mind:greeting>", "<mind:session-evidence>", "While you were away", "- here 0 "]) {
      const at = payload.indexOf(tag);
      expect(at).toBeGreaterThanOrEqual(0);
      expect(at).toBeLessThan(firstConstitution);
    }
    // NOW then the greeting, ahead of the evidence/away/detail tail of here.
    expect(payload.indexOf("<mind:greeting>")).toBeLessThan(payload.indexOf("<mind:session-evidence>"));
  });

  test(`any payload within the ${CAP_TOKENS}-token hard cap fits the ${WAKE_PARTS} hook slots`, () => {
    const payload = `Resolved scope: arc\n${fill("cap", CAP_TOKENS - 10)}`;
    expect(Math.ceil(payload.length / 4)).toBeLessThanOrEqual(CAP_TOKENS);
    const outputs = hookOutputs(payload, SPOOL);
    expect(outputs.length).toBeLessThanOrEqual(WAKE_PARTS);
    for (const o of outputs) expectWithinHookCap(o);
  });

  test("the last slot carries any overflow parts rather than dropping them", () => {
    expect(outputForSlot(["a", "b", "c", "d"], 3, 3)).toBe("c\nd");
    expect(outputForSlot(["a", "b"], 3, 8)).toBe("");
    expect(outputForSlot(["a", "b"], 2, 8)).toBe("b");
  });
});

// ---- wake.ts as Claude Code runs it: WAKE_PARTS hook slots in parallel ----

const WAKE = path.join(import.meta.dir, "wake.ts");
const sandboxes: string[] = [];
afterAll(() => { for (const d of sandboxes) fs.rmSync(d, { recursive: true, force: true }); });

function wakeEnv(home: string, extra: Record<string, string> = {}) {
  const env: Record<string, string> = { ...(process.env as Record<string, string>), HOME: home, CIRCADIAN_HOME: home,
    CIRCADIAN_BUN_BIN: "/bin/true", CIRCADIAN_INVOCATION_LEDGER: "off", CIRCADIAN_WAKE_PART_WAIT_MS: "5000", ...extra };
  for (const k of ["CIRCADIAN_ROLE", "CIRCADIAN_SCOPE", "CIRCADIAN_LANE", "CIRCADIAN_INTERNAL", "CIRCADIAN_SESSION"]) if (!(k in extra)) delete env[k];
  return env;
}

function runSlot(k: number, cwd: string, env: Record<string, string>, input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [WAKE, ...(k > 1 ? ["--part", String(k)] : [])], { cwd, env, stdio: ["pipe", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("error", reject);
    child.on("close", () => resolve(out));
    child.stdin.end(input);
  });
}

/** Every SessionStart slot install.sh wires, started together like Claude Code does. */
async function runAllSlots(cwd: string, env: Record<string, string>, sessionId: string): Promise<string[]> {
  const event = JSON.stringify({ session_id: sessionId, hook_event_name: "SessionStart", source: "startup", cwd });
  return Promise.all(Array.from({ length: WAKE_PARTS }, (_, i) => runSlot(i + 1, cwd, env, event)));
}

function fixtureMind(): { home: string; project: string } {
  const home = fs.mkdtempSync(path.join(tmpdir(), "circadian-wake-parts-"));
  sandboxes.push(home);
  const mind = path.join(home, "mind"), project = path.join(home, "project");
  fs.cpSync(path.join(import.meta.dir, "..", "templates"), mind, { recursive: true });
  fs.mkdirSync(path.join(mind, "now"), { recursive: true });
  fs.mkdirSync(project);
  fs.writeFileSync(path.join(mind, "scopes.tsv"), `proj\t${project}\tactive\n`);
  fs.writeFileSync(path.join(mind, "CONSTITUTION.md"), MAX.constitution + "\n");
  fs.writeFileSync(path.join(mind, "CONSTITUTION-JOSH.md"), MAX.constitutionJosh + "\n");
  fs.writeFileSync(path.join(mind, "USER.md"), MAX.user + "\n");
  fs.writeFileSync(path.join(mind, "now", "proj.md"), MAX.now + "\n");
  // A wake today already happened: no first-of-day scorecard in this run.
  fs.writeFileSync(path.join(mind, "scoreboard.jsonl"), JSON.stringify({ type: "wake", ts: new Date().toISOString(), scope: "proj" }) + "\n");
  return { home, project };
}

describe("wake.ts hook slots (subprocess)", () => {
  test("parallel slots each print under the cap; together they are the whole wake; part 1 leads with mind:here", async () => {
    const { home, project } = fixtureMind();
    const env = wakeEnv(home);
    const outputs = (await runAllSlots(project, env, "sess-a")).map((o) => o.replace(/\n$/, ""));
    const delivered = outputs.filter(Boolean);
    expect(delivered.length).toBeGreaterThan(1);
    for (const o of outputs) expectWithinHookCap(o);
    expect(outputs[0].startsWith("Resolved scope: proj\nNext move: Ship the wake parts.")).toBe(true);
    expect(outputs[0]).toContain('<mind:here scope="proj">');
    // Same composition as pi / a plain run receives in one piece.
    const whole = spawnSync(process.execPath, [WAKE], { cwd: project, env, input: "", encoding: "utf8" }).stdout.replace(/\n$/, "");
    expect(bodies(delivered)).toBe(whole);
    expect(whole).toContain(MAX.constitution);
    expect(whole).toContain(MAX.constitutionJosh);
  }, 30000);

  test("a part slot never serves an earlier wake's spool for the same session", async () => {
    const { home, project } = fixtureMind();
    writeSpool(spoolPath(home, "sess-b"), ["stale part 1", "stale part 2"], Date.now() - 60_000);
    const env = wakeEnv(home, { CIRCADIAN_WAKE_PART_WAIT_MS: "300" });
    const event = JSON.stringify({ session_id: "sess-b", hook_event_name: "SessionStart" });
    expect(await runSlot(2, project, env, event)).toBe("");
  }, 30000);

  test("a part slot outside a Claude Code SessionStart prints nothing (pi gets the whole wake from part 1)", async () => {
    const { home, project } = fixtureMind();
    expect(await runSlot(2, project, wakeEnv(home), "")).toBe("");
  }, 30000);
});

// ---- the current mind (the install's own mind, never the author's home) ----
// CIRCADIAN_TEST_MIND names a mind explicitly (e.g. the live hive mind); the
// default is the checkout's own mind/. Absent → skip with the evidence named.
const LIVE_MIND = process.env.CIRCADIAN_TEST_MIND || mindDir;
const missingLive = missingMindFilesAt(LIVE_MIND, "CONSTITUTION.md", "CONSTITUTION-JOSH.md", "USER.md", "NOW.md", "scopes.tsv");

describe("Claude Code wake with the current mind", () => {
  test.skipIf(!!missingLive)(evidenceName("every scope's wake fits the hook cap in parts, part 1 carries mind:here, constitutions arrive whole", missingLive), async () => {
    const home = fs.mkdtempSync(path.join(tmpdir(), "circadian-wake-live-"));
    sandboxes.push(home);
    fs.cpSync(LIVE_MIND, path.join(home, "mind"), { recursive: true }); // wake appends; never to the real mind
    const scopes = fs.readFileSync(path.join(home, "mind", "scopes.tsv"), "utf8").split("\n")
      .map((l) => l.split("\t")).filter((c) => c[2] === "active").map((c) => c[0]);
    const constitution = fs.readFileSync(path.join(LIVE_MIND, "CONSTITUTION.md"), "utf8").trim();
    const josh = fs.readFileSync(path.join(LIVE_MIND, "CONSTITUTION-JOSH.md"), "utf8").trim();
    for (const scope of [...scopes, "global"]) {
      const outputs = (await runAllSlots(home, wakeEnv(home, { CIRCADIAN_SCOPE: scope }), `live-${scope}`)).map((o) => o.replace(/\n$/, ""));
      for (const o of outputs) expectWithinHookCap(o);
      expect(outputs[0]).toContain(`<mind:here scope="${scope}">`);
      const delivered = bodies(outputs.filter(Boolean));
      expect(delivered).toContain(constitution);
      expect(delivered).toContain(josh);
    }
  }, 120000);
});

describe("wake.ts spool failure (subprocess)", () => {
  test("an unwritable spool prints the whole wake from part 1 rather than dropping parts 2..n", () => {
    const { home, project } = fixtureMind();
    fs.mkdirSync(path.join(home, "logs"), { recursive: true });
    fs.writeFileSync(path.join(home, "logs", "wake-parts"), "not a directory"); // spool dir cannot be created
    const env = wakeEnv(home);
    const event = JSON.stringify({ session_id: "sess-c", hook_event_name: "SessionStart" });
    const part1 = spawnSync(process.execPath, [WAKE], { cwd: project, env, input: event, encoding: "utf8" });
    const whole = spawnSync(process.execPath, [WAKE], { cwd: project, env, input: "", encoding: "utf8" });
    expect(part1.stdout).toBe(whole.stdout);
    expect(part1.stdout).toContain(MAX.constitution);
    expect(part1.stderr).toContain("wake/parts DEGRADED");
  }, 30000);
});
