// rem-popmem.test.ts — unit tests for the deterministic parts of the
// composite REM payload (popmem WS-F). A full live run needs the local LLM
// and a real mind git repo (impractical for a fast unit suite); these test
// the scheduling guard, commit-message assembly, the R8 render invariant,
// propagation-address enumeration, and structural validation of both LLM
// call outputs -- exactly the surface the brief's done-when calls out.
import { describe, test, expect, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";
import { spawnSync } from "node:child_process";
import { writeAtom, appendLedger, type Atom } from "./atoms.ts";
import {
  REM_SLOT_HOURS,
  mostRecentSlot,
  isDue,
  lastRemTs,
  hashEpisodeContent,
  loadDigestedHashes,
  recordDigested,
  findNewEpisodes,
  enumerateNowItems,
  enumeratePropagationAddresses,
  parsePropagationResponse,
  parseGreetingResponse,
  greetingHasAnchor,
  greetingLineIsSpeakable,
  propagationMaxTokens,
  GREETING_MAX_LINES,
  buildCommitMessage,
  assertRenderInvariant,
  planDistillation,
  runDistillPhase,
  DISTILL_CAP,
  type DigestedEntry,
} from "./rem-popmem.ts";
import { readAtoms, readLedger, foldWeights } from "./atoms.ts";
import { renderSelf, RENDER_FLOOR } from "./render.ts";
import { detectSelfStutter } from "./immune.ts";
import { adaptRenderedForStutterCheck } from "./migrate.ts";

const dirs: string[] = [];
function tmpDir(): string {
  const d = fs.mkdtempSync(path.join(tmpdir(), "rem-popmem-test-"));
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

function atomFixture(claim: string, kind: Atom["kind"] = "doctrine"): Omit<Atom, "id"> {
  return { kind, claim, why: "because", quotes: [{ text: "verbatim quote text", source: "ep.md" }], eps: ["2026-07-16"] };
}

// ---------------------------------------------------------------------
// scheduling guard
// ---------------------------------------------------------------------
describe("mostRecentSlot", () => {
  test("at 09:00 exactly, the slot is today 09:00", () => {
    const now = new Date(2026, 6, 27, 9, 0, 0, 0);
    expect(mostRecentSlot(now)).toEqual(new Date(2026, 6, 27, 9, 0, 0, 0));
  });

  test("just before 09:00, the slot is yesterday's 21:00", () => {
    const now = new Date(2026, 6, 27, 8, 59, 0, 0);
    expect(mostRecentSlot(now)).toEqual(new Date(2026, 6, 26, 21, 0, 0, 0));
  });

  test("at 21:30, the slot is today 21:00", () => {
    const now = new Date(2026, 6, 27, 21, 30, 0, 0);
    expect(mostRecentSlot(now)).toEqual(new Date(2026, 6, 27, 21, 0, 0, 0));
  });

  test("REM_SLOT_HOURS is [9, 21]", () => {
    expect(REM_SLOT_HOURS).toEqual([9, 21]);
  });
});

describe("lastRemTs", () => {
  test("finds the most recent rem-typed event, ignoring others", () => {
    const events = [
      { ts: "2026-07-01T00:00:00.000Z", type: "wake" },
      { ts: "2026-07-02T00:00:00.000Z", type: "rem" },
      { ts: "2026-07-03T00:00:00.000Z", type: "wake" },
    ];
    expect(lastRemTs(events)).toBe("2026-07-02T00:00:00.000Z");
  });

  test("null when no rem event exists", () => {
    expect(lastRemTs([{ ts: "2026-07-01T00:00:00.000Z", type: "wake" }])).toBeNull();
  });

  test("null on an empty scoreboard", () => {
    expect(lastRemTs([])).toBeNull();
  });
});

describe("isDue", () => {
  test("never run before => always due", () => {
    expect(isDue([], new Date(2026, 6, 27, 9, 30))).toBe(true);
  });

  test("last run before the current slot opened => due", () => {
    const events = [{ ts: new Date(2026, 6, 26, 21, 0).toISOString(), type: "rem" }];
    expect(isDue(events, new Date(2026, 6, 27, 9, 30))).toBe(true);
  });

  test("last run at or after the current slot opened => not due", () => {
    const events = [{ ts: new Date(2026, 6, 27, 9, 5).toISOString(), type: "rem" }];
    expect(isDue(events, new Date(2026, 6, 27, 9, 30))).toBe(false);
  });

  test("unparseable last-rem ts => treated as due", () => {
    const events = [{ ts: "not-a-date", type: "rem" }];
    expect(isDue(events, new Date(2026, 6, 27, 9, 30))).toBe(true);
  });
});

// ---------------------------------------------------------------------
// digested ledger
// ---------------------------------------------------------------------
describe("digested ledger helpers", () => {
  test("hashEpisodeContent is stable sha256 of exact bytes", () => {
    const h1 = hashEpisodeContent("hello world\n");
    const h2 = hashEpisodeContent("hello world\n");
    const h3 = hashEpisodeContent("hello world");
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  test("loadDigestedHashes reads hashes, skipping malformed lines", () => {
    const dir = tmpDir();
    const p = path.join(dir, "digested.jsonl");
    fs.writeFileSync(
      p,
      [
        JSON.stringify({ ts: "t", hash: "aaa", filename: "a.md", disposition: "absorbed" }),
        "not json at all",
        JSON.stringify({ ts: "t", hash: "bbb", filename: "b.md", disposition: "absorbed" }),
      ].join("\n") + "\n"
    );
    const set = loadDigestedHashes(p);
    expect(set.has("aaa")).toBe(true);
    expect(set.has("bbb")).toBe(true);
    expect(set.size).toBe(2);
  });

  test("loadDigestedHashes on a missing file returns an empty set", () => {
    expect(loadDigestedHashes(path.join(tmpDir(), "nope.jsonl")).size).toBe(0);
  });

  test("recordDigested appends without clobbering prior lines; no-op on empty entries", () => {
    const dir = tmpDir();
    const p = path.join(dir, "digested.jsonl");
    const e1: DigestedEntry = { ts: "t1", hash: "aaa", filename: "a.md", disposition: "absorbed" };
    const e2: DigestedEntry = { ts: "t2", hash: "bbb", filename: "b.md", disposition: "absorbed" };
    recordDigested(p, [e1]);
    recordDigested(p, []); // no-op
    recordDigested(p, [e2]);
    const set = loadDigestedHashes(p);
    expect(set.has("aaa")).toBe(true);
    expect(set.has("bbb")).toBe(true);
    expect(fs.readFileSync(p, "utf8").split("\n").filter((l) => l.trim()).length).toBe(2);
  });

  test("findNewEpisodes returns only undigested files, sorted by filename", () => {
    const dir = tmpDir();
    const episodesDir = path.join(dir, "episodes");
    fs.mkdirSync(episodesDir, { recursive: true });
    fs.writeFileSync(path.join(episodesDir, "2026-07-20-b.md"), "content B\n");
    fs.writeFileSync(path.join(episodesDir, "2026-07-16-a.md"), "content A\n");
    fs.writeFileSync(path.join(episodesDir, "2026-07-10-old.md"), "old content\n");

    const digested = new Set([hashEpisodeContent("old content\n")]);
    const fresh = findNewEpisodes(episodesDir, digested);
    expect(fresh.map((e) => e.filename)).toEqual(["2026-07-16-a.md", "2026-07-20-b.md"]);
  });

  test("findNewEpisodes on a missing directory returns empty, never throws", () => {
    expect(findNewEpisodes(path.join(tmpDir(), "nope"), new Set())).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// propagation-address enumeration
// ---------------------------------------------------------------------
describe("enumerateNowItems", () => {
  test("enumerates every recognized NOW.md section with rem.ts's address format", () => {
    const nowMd = [
      "## Arc",
      "the arc line",
      "",
      "## Flight plan",
      "flight item one",
      "flight item two",
      "",
      "## Live tensions",
      "a tension",
      "",
      "## Commitments",
      "a commitment",
      "",
      "## Serendipity",
      "a serendipity line",
      "",
      "## Not A Tracked Section",
      "should not appear",
    ].join("\n");
    const items = enumerateNowItems(nowMd);
    expect(items).toEqual([
      { address: "NOW.Arc[1]", text: "the arc line" },
      { address: "NOW.FlightPlan[1]", text: "flight item one" },
      { address: "NOW.FlightPlan[2]", text: "flight item two" },
      { address: "NOW.LiveTensions[1]", text: "a tension" },
      { address: "NOW.Commitments[1]", text: "a commitment" },
      { address: "NOW.Serendipity[1]", text: "a serendipity line" },
    ]);
  });

  test("empty NOW.md yields no items", () => {
    expect(enumerateNowItems("")).toEqual([]);
  });
});

describe("enumeratePropagationAddresses", () => {
  test("resolves manifest SELF.* addresses to atom claim text, plus NOW.* items", () => {
    const manifest = [
      { address: "SELF.Doctrine[1]", atom: "atom-a" },
      { address: "SELF.Motifs[1]", atom: "atom-b" },
    ];
    const atomsById = new Map([
      ["atom-a", { id: "atom-a", ...atomFixture("claim A") } as Atom],
      ["atom-b", { id: "atom-b", ...atomFixture("claim B", "motif") } as Atom],
    ]);
    const nowMd = "## Arc\nthe arc line\n";
    const items = enumeratePropagationAddresses(manifest, atomsById, nowMd);
    expect(items).toEqual([
      { address: "SELF.Doctrine[1]", text: "claim A" },
      { address: "SELF.Motifs[1]", text: "claim B" },
      { address: "NOW.Arc[1]", text: "the arc line" },
    ]);
  });

  test("a manifest entry whose atom id has no match is skipped, never throws", () => {
    const manifest = [{ address: "SELF.Doctrine[1]", atom: "missing-atom" }];
    const items = enumeratePropagationAddresses(manifest, new Map(), "");
    expect(items).toEqual([]);
  });

  test("empty manifest and empty NOW.md yields no items", () => {
    expect(enumeratePropagationAddresses([], new Map(), "")).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// structural validation of LLM call (a): propagation judgment
// ---------------------------------------------------------------------
describe("propagationMaxTokens", () => {
  // The judge's answer is bounded by its input: at most one address per item.
  // The live flatline was a 69-item run against a flat 500-token budget, so
  // the budget must clear the worst case with room, at every size.
  test("scales with the item count and clears the worst-case artifact", () => {
    for (const items of [1, 20, 69, 200]) {
      const budget = propagationMaxTokens(items);
      // worst case: every address returned, ~24 chars each => ~6 tokens, plus
      // JSON punctuation. A 2x margin over that is the bar.
      expect(budget).toBeGreaterThanOrEqual(items * 12);
      expect(budget).toBeGreaterThanOrEqual(500);
    }
    // the live shape that broke: 69 items must budget well past 500
    expect(propagationMaxTokens(69)).toBeGreaterThan(500);
  });
});

describe("parsePropagationResponse", () => {
  const valid = ["SELF.Doctrine[1]", "NOW.Arc[1]"];

  test("well-formed JSON array of valid addresses passes through", () => {
    const r = parsePropagationResponse(`["SELF.Doctrine[1]", "NOW.Arc[1]"]`, valid);
    expect(r).toEqual({ propagated: ["SELF.Doctrine[1]", "NOW.Arc[1]"], malformed: false, unrecognizedCount: 0 });
  });

  test("empty array is well-formed, not malformed", () => {
    expect(parsePropagationResponse("[]", valid)).toEqual({ propagated: [], malformed: false, unrecognizedCount: 0 });
  });

  test("unrecognized addresses are dropped and counted, not fatal", () => {
    const r = parsePropagationResponse(`["SELF.Doctrine[1]", "SELF.Doctrine[99]"]`, valid);
    expect(r).toEqual({ propagated: ["SELF.Doctrine[1]"], malformed: false, unrecognizedCount: 1 });
  });

  test("duplicate valid addresses are deduplicated", () => {
    const r = parsePropagationResponse(`["SELF.Doctrine[1]", "SELF.Doctrine[1]"]`, valid);
    expect(r.propagated).toEqual(["SELF.Doctrine[1]"]);
  });

  test("non-array JSON is wholly malformed: empty array, never a partial parse", () => {
    expect(parsePropagationResponse(`{"propagated": ["SELF.Doctrine[1]"]}`, valid)).toEqual({
      propagated: [], malformed: true, unrecognizedCount: 0,
    });
  });

  test("unparseable text is wholly malformed", () => {
    expect(parsePropagationResponse("not json at all", valid)).toEqual({
      propagated: [], malformed: true, unrecognizedCount: 0,
    });
  });

  test("non-string array elements count as unrecognized, not a crash", () => {
    const r = parsePropagationResponse(`["SELF.Doctrine[1]", 42, null]`, valid);
    expect(r).toEqual({ propagated: ["SELF.Doctrine[1]"], malformed: false, unrecognizedCount: 2 });
  });
});

// ---------------------------------------------------------------------
// structural validation of LLM call (b): greeting
// ---------------------------------------------------------------------
describe("parseGreetingResponse", () => {
  test("well-formed 1-3 line greeting passes through", () => {
    const r = parseGreetingResponse("Line one.\nLine two.\n");
    expect(r).toEqual({ lines: ["Line one.", "Line two."], malformed: false });
  });

  test("caps at GREETING_MAX_LINES, dropping extras", () => {
    const raw = ["one", "two", "three", "four"].join("\n");
    const r = parseGreetingResponse(raw);
    expect(r.lines.length).toBe(GREETING_MAX_LINES);
    expect(r.lines).toEqual(["one", "two", "three"]);
  });

  test("blank/whitespace-only lines and markdown headers are filtered out", () => {
    const raw = ["# Heading", "", "   ", "Real line."].join("\n");
    const r = parseGreetingResponse(raw);
    expect(r).toEqual({ lines: ["Real line."], malformed: false });
  });

  test("empty completion is malformed", () => {
    expect(parseGreetingResponse("")).toEqual({ lines: [], malformed: true });
  });

  test("whitespace-only completion is malformed", () => {
    expect(parseGreetingResponse("   \n\n  ")).toEqual({ lines: [], malformed: true });
  });

  // Backward-compat: with no NOW.md the gate is skipped -- pure structural
  // validation, so the anchorless-but-nonempty draft is still well-formed.
  test("no NOW.md supplied: gate is skipped, structural shape only", () => {
    const r = parseGreetingResponse("Motion is the only truth.");
    expect(r.malformed).toBe(false);
    expect(r.lines).toEqual(["Motion is the only truth."]);
  });

  test("with NOW.md: an anchorless register-echo draft is rejected as malformed", () => {
    const nowMd = "## Arc\nFinalize RELEASE.md and ship the memory engine.\n";
    const r = parseGreetingResponse("Motion is the only truth -- the work is already moving.", nowMd);
    expect(r.malformed).toBe(true);
  });

  test("with NOW.md: a draft naming a concrete NOW.md noun passes", () => {
    const nowMd = "## Flight plan\nFinalize the RELEASE.md document for the release.\n";
    const r = parseGreetingResponse("Finish RELEASE.md so the release can ship.", nowMd);
    expect(r.malformed).toBe(false);
    expect(r.lines).toEqual(["Finish RELEASE.md so the release can ship."]);
  });

  // Law 3 in the machine. These are the ACTUAL committed greetings from mind
  // commits 0b27f81 / 91a4cbf / a9fd62e: every one passed the anchor gate (a
  // path IS an anchor) and none of them can be said out loud. That is the
  // collapse the anchor gate created by only ever testing one direction.
  test("with NOW.md: a bare list of paths is rejected — anchors are not speech", () => {
    const nowMd = "## Arc\nThe consumer resilience evidence pass is next.\n";
    const raw = [
      "`CONSUMER-MATRIX.md` in `briefs/tower/w2-consumer-resilience-evidence/`",
      "`tower/w2-consumer-resilience`",
      "`workers/consumer-audit.done`",
    ].join("\n");
    expect(parseGreetingResponse(raw, nowMd).malformed).toBe(true);
  });

  test("with NOW.md: a bare backticked command list is rejected", () => {
    const nowMd = "## Flight plan\nPush the branch and watch the rem wave log.\n";
    const raw = "`git push origin/main`\n`tail -f logs/last-rem-wave.log`";
    expect(parseGreetingResponse(raw, nowMd).malformed).toBe(true);
  });

  test("with NOW.md: ONE unspeakable line poisons an otherwise good draft", () => {
    const nowMd = "## Arc\nThe write gate is live; the herdr contract is next.\n";
    const raw = "Pick the write gate back up — the herdr contract is the next move.\n`workers/consumer-audit.done`";
    expect(parseGreetingResponse(raw, nowMd).malformed).toBe(true);
  });

  test("with NOW.md: a sentence CONTAINING a path passes both gates", () => {
    const nowMd = "## Arc\nThe write gate is live; the herdr contract is next.\n";
    const raw = "Pick up the write gate in `src/gate.ts` — the herdr contract is next.";
    expect(parseGreetingResponse(raw, nowMd).malformed).toBe(false);
  });

  test("with NOW.md: an imperative checklist line that names an anchor is not a greeting", () => {
    const nowMd = "## Arc\nThe registry row for the skill is next.\n";
    const raw = "Check the `registry` row for stale copies of the skill.";
    expect(parseGreetingResponse(raw, nowMd).malformed).toBe(true);
  });

  // mind.git 3b5f3a2: REM accepted invented skill-file paths via GREETING_PATH_RE
  // short-circuit — no filesystem check. NOW.md at that commit does not name them.
  const POISON_3B5F3A2_NOW_MD = [
    "<!-- cap: 3k tokens (12k chars) -->",
    "",
    "## Arc",
    "",
    "The R7 kill switch has been cleared by resetting the poisoned scoreboard ledger and committing the clean slate. The fix is live and verified.",
    "",
    "## Flight plan",
    "",
    "Trigger a new wake to observe the first real `ok` verdict from the fixed generator, confirming the streak has begun to decay.",
    "",
    "## Live tensions",
    "",
    "- The next REM wave must run to generate the first real `ok` verdict and begin the streak decay.",
    "- The mind repo's git history is the only undo trail — no remote, so backup integrity is critical.",
    "",
    "## Commitments",
    "",
    "- The fix is committed and pushed to origin/main.",
    "- No further handoffs or delays on verified work — immediate integration and push are now default.",
    "- Do not assume any state is \"done\" until it is in the remote and visible.",
    "",
    "## Serendipity",
    "",
    "",
    "",
    "## Last sleep",
    "",
    "2026-08-11T15:54:46.870Z",
    "",
  ].join("\n");
  const POISON_3B5F3A2_GREETING = [
    "Check the live validation pipeline for `skills/agent/skill-1.md` and `skills/agent/skill-2.md` to confirm both files now parse correctly.",
    "Report the validation result to the user with the exact output from the pipeline.",
    "Wait for explicit confirmation before taking any further action.",
  ].join("\n");

  test("with NOW.md: mind.git 3b5f3a2 poison greeting is malformed", () => {
    expect(parseGreetingResponse(POISON_3B5F3A2_GREETING, POISON_3B5F3A2_NOW_MD).malformed).toBe(true);
  });

  test("no NOW.md supplied: the speakability gate is skipped too (structural shape only)", () => {
    expect(parseGreetingResponse("`workers/consumer-audit.done`").malformed).toBe(false);
  });
});

describe("greetingLineIsSpeakable", () => {
  test("bare addresses are not speech", () => {
    for (const line of [
      "`tower/w2-consumer-resilience`",
      "`workers/consumer-audit.done`",
      "`CONSUMER-MATRIX.md` in `briefs/tower/w2-consumer-resilience-evidence/`",
      "`git push origin/main`",
      "`spine-spawn fleet-smoke`",
      "push origin/main",
    ]) {
      expect(greetingLineIsSpeakable(line)).toBe(false);
    }
  });

  test("sentences that happen to carry an address are speech", () => {
    for (const line of [
      "verify live status flow with hairline mark on exchange end",
      "Execute one real `cursor-fleet make` end-to-end in two worktrees",
      "`/tmp/lever-6-orch.done` exists — verify its content matches the proof transcript.",
      "`circadian` skips greetings for fleet workers",
      "Finish RELEASE.md so the release can ship.",
    ]) {
      expect(greetingLineIsSpeakable(line)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------
// greeting shape gate: the R7 root-cause fix. A greeting must name a
// concrete, addressable anchor (path / command / distinctive NOW.md noun),
// never content-free register-echo. Pinned against the exact collapse drafts
// from logs/rem.error.log (the brief's verbatim samples).
// ---------------------------------------------------------------------
describe("greetingHasAnchor", () => {
  const NOW_MD = [
    "<!-- cap: 3k tokens -->",
    "## Arc",
    "Ship circadian as a standalone, user-agnostic memory engine.",
    "## Flight plan",
    "Finalize the RELEASE.md document, replacing user-specific references.",
    "## Live tensions",
    "The constitution builder must not become a second truth plane.",
    "## Commitments",
    "Replace all user-specific references in RELEASE.md with placeholders.",
  ].join("\n");

  // The verbatim collapse drafts the brief cites -- each names nothing
  // addressable, so each must be rejected.
  const COLLAPSE_DRAFTS = [
    "The board holds the pulse -- stay in the flow.",
    "Raw passthrough is active; align coordinates now.",
    "Slice engaged, motion driving.",
    "Motion is the only truth -- the work is already moving.",
    "E is live -- spawn confirmed.",
  ];

  for (const draft of COLLAPSE_DRAFTS) {
    test(`rejects the collapse draft: ${JSON.stringify(draft)}`, () => {
      expect(greetingHasAnchor([draft], NOW_MD)).toBe(false);
    });
  }

  test("accepts a draft that names a NOW.md noun (RELEASE.md via path rule)", () => {
    expect(greetingHasAnchor(["Finalize RELEASE.md, then re-init the mind repo from scratch."], NOW_MD)).toBe(true);
  });

  test("accepts a draft that names the constitution builder from Live tensions", () => {
    expect(greetingHasAnchor(["Make the constitution builder accessible without the post-mortem."], NOW_MD)).toBe(true);
  });

  test("accepts a draft naming a backtick command even with no NOW.md nouns", () => {
    expect(greetingHasAnchor(["Run `bun test` before the release cut."], NOW_MD)).toBe(true);
  });

  test("accepts a draft naming a file path even against empty NOW.md", () => {
    expect(greetingHasAnchor(["Start in src/rem-popmem.ts."], "")).toBe(true);
  });

  test("nonexistent relative path is not an anchor against empty NOW.md", () => {
    expect(greetingHasAnchor(["Start in src/this-file-does-not-exist.ts."], "")).toBe(false);
    expect(greetingHasAnchor(["Start in skills/agent/skill-1.md."], "")).toBe(false);
  });

  test("rejects mind.git 3b5f3a2 poison greeting — invented skill paths are not anchors", () => {
    const lines = [
      "Check the live validation pipeline for `skills/agent/skill-1.md` and `skills/agent/skill-2.md` to confirm both files now parse correctly.",
      "Report the validation result to the user with the exact output from the pipeline.",
      "Wait for explicit confirmation before taking any further action.",
    ];
    const nowMd = [
      "<!-- cap: 3k tokens (12k chars) -->",
      "",
      "## Arc",
      "",
      "The R7 kill switch has been cleared by resetting the poisoned scoreboard ledger and committing the clean slate. The fix is live and verified.",
      "",
      "## Flight plan",
      "",
      "Trigger a new wake to observe the first real `ok` verdict from the fixed generator, confirming the streak has begun to decay.",
      "",
      "## Live tensions",
      "",
      "- The next REM wave must run to generate the first real `ok` verdict and begin the streak decay.",
      "- The mind repo's git history is the only undo trail — no remote, so backup integrity is critical.",
      "",
      "## Commitments",
      "",
      "- The fix is committed and pushed to origin/main.",
      "- No further handoffs or delays on verified work — immediate integration and push are now default.",
      "- Do not assume any state is \"done\" until it is in the remote and visible.",
      "",
      "## Serendipity",
      "",
      "",
      "",
      "## Last sleep",
      "",
      "2026-08-11T15:54:46.870Z",
      "",
    ].join("\n");
    expect(greetingHasAnchor(lines, nowMd)).toBe(false);
  });

  test("empty NOW.md and no path/command: nothing concrete to name, rejected", () => {
    expect(greetingHasAnchor(["Motion is the metric."], "")).toBe(false);
  });

  test("headings and the cap comment do not count as anchors", () => {
    // "Arc"/"Flight"/"tensions" live in headings; "cap"/"tokens" in the
    // comment -- a greeting reusing only those must still be rejected.
    expect(greetingHasAnchor(["Arc tensions, flight in tokens."], NOW_MD)).toBe(false);
  });
});

// ---------------------------------------------------------------------
// commit message assembly
// ---------------------------------------------------------------------
describe("buildCommitMessage", () => {
  test("subject distinguishes newly-sank from below-floor and shows potentiated + distilled", () => {
    const { subject } = buildCommitMessage({
      date: "2026-07-27", stacked: 3, bumped: 5, newlySank: 1, belowFloor: 27,
      potentiated: 19, distilled: 4, population: 41, belowFloorIds: ["abc123"],
    });
    expect(subject).toBe(
      "rem: 2026-07-27 — stacked 3, bumped 5, sank 1 · 27 below floor, potentiated 19, distilled 4, population 41"
    );
  });

  test("newly-sank and below-floor are independent counters (the sank-27-forever bug)", () => {
    // The regression: 27 was the standing below-floor STATE, printed as if it
    // were a per-run transition across three identical commits. Here nothing
    // crossed the floor THIS run (newlySank 0) while 27 sit below it.
    const { subject } = buildCommitMessage({
      date: "2026-08-04", stacked: 0, bumped: 0, newlySank: 0, belowFloor: 27,
      potentiated: 0, distilled: 0, population: 104, belowFloorIds: ["a", "b"],
    });
    expect(subject).toContain("sank 0 · 27 below floor");
  });

  test("body lists the below-floor state ids when present", () => {
    const { body } = buildCommitMessage({
      date: "2026-07-27", stacked: 0, bumped: 0, newlySank: 2, belowFloor: 2,
      potentiated: 0, distilled: 0, population: 10, belowFloorIds: ["aaa", "bbb"],
    });
    expect(body).toBe("\n\nbelow floor: aaa, bbb");
  });

  test("body states none when nothing is below floor", () => {
    const { body } = buildCommitMessage({
      date: "2026-07-27", stacked: 1, bumped: 0, newlySank: 0, belowFloor: 0,
      potentiated: 0, distilled: 0, population: 10, belowFloorIds: [],
    });
    expect(body).toBe("\n\nbelow floor: (none)");
  });
});

// ---------------------------------------------------------------------
// R8: render(archive) == committed SELF.md, byte-identical
// ---------------------------------------------------------------------
describe("assertRenderInvariant", () => {
  function seedSandbox(): { beliefsDir: string; ledgerPath: string } {
    const dir = tmpDir();
    const beliefsDir = path.join(dir, "beliefs");
    const ledgerPath = path.join(dir, "beliefs.jsonl");
    const { id } = writeAtom(beliefsDir, atomFixture("a durable claim about the work"));
    appendLedger(ledgerPath, { ev: "stack", atom: id, ep: "ep.md", ts: "2026-07-16T00:00:00.000Z" });
    return { beliefsDir, ledgerPath };
  }

  test("passes when the committed markdown matches a fresh disk re-render", () => {
    const { beliefsDir, ledgerPath } = seedSandbox();
    // Derive the expected bytes the same way the payload does: render once
    // from the same disk state, then assert against that.
    const { readAtoms, foldWeights, readLedger } = require("./atoms.ts");
    const { renderSelf } = require("./render.ts");
    const atoms = readAtoms(beliefsDir);
    const states = foldWeights(readLedger(ledgerPath));
    const { md } = renderSelf(atoms, states);

    const result = assertRenderInvariant(beliefsDir, ledgerPath, md);
    expect(result.ok).toBe(true);
    expect(result.expectedLength).toBe(result.actualLength);
  });

  test("fails when the committed markdown diverges from a fresh re-render", () => {
    const { beliefsDir, ledgerPath } = seedSandbox();
    const result = assertRenderInvariant(beliefsDir, ledgerPath, "this is not what render() would produce\n");
    expect(result.ok).toBe(false);
  });

  test("fails when the ledger changed after the committed markdown was produced (stale commit)", () => {
    const { beliefsDir, ledgerPath } = seedSandbox();
    const { readAtoms, foldWeights, readLedger } = require("./atoms.ts");
    const { renderSelf } = require("./render.ts");
    const before = renderSelf(readAtoms(beliefsDir), foldWeights(readLedger(ledgerPath))).md;

    // A decay factor that pushes the atom's sole weight below RENDER_FLOOR
    // (0.5) changes the RENDERED bytes (the atom drops out of its section) —
    // a decay that keeps every atom above floor would be a no-op on render
    // text, since weight itself is never printed.
    appendLedger(ledgerPath, { ev: "decay", factor: 0.1, ts: "2026-07-17T00:00:00.000Z" });

    const result = assertRenderInvariant(beliefsDir, ledgerPath, before);
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------
// DISTILL phase — auto-supersede live stutter clusters (brief 06 §5). Real
// tmp fixtures, no mocks (house style): a beliefs dir + ledger seeded with
// genuinely paraphrased doctrine claims that the UNMODIFIED detector pair
// clusters, plus a distinct atom that must survive.
// ---------------------------------------------------------------------
describe("planDistillation / DISTILL phase", () => {
  // Three near-duplicate "mechanical fidelity" claims (share >= 30% of their
  // significant tokens, so detectSelfStutter clusters them) + one distinct
  // claim about an unrelated belief.
  const FID_A = "Mechanical fidelity to exact output format is non-negotiable for trust and operational continuity.";
  const FID_B = "Mechanical fidelity to the exact output format is the non-negotiable basis of trust and continuity.";
  const FID_C = "Trust and operational continuity demand mechanical fidelity to the exact output format, always.";
  const DISTINCT = "The cliff is complexity accretion: layers pile up until nobody holds the whole system in their head.";

  /** Seeds beliefs/ + ledger with the given (claim, stackCount) atoms. Stack
   * count sets folded weight (each stack = +1), so the winner rule (highest
   * weight) is controllable. Returns dir + the atom ids in input order. */
  function seedPopulation(specs: { claim: string; stacks: number; kind?: Atom["kind"]; ep?: string }[]): {
    beliefsDir: string;
    ledgerPath: string;
    ids: string[];
  } {
    const dir = tmpDir();
    const beliefsDir = path.join(dir, "beliefs");
    const ledgerPath = path.join(dir, "beliefs.jsonl");
    const ids: string[] = [];
    for (const s of specs) {
      const { id } = writeAtom(beliefsDir, {
        kind: s.kind ?? "doctrine",
        claim: s.claim,
        why: "because the work demands it",
        // Quote = the claim itself (as in the live mind, the strongest telling
        // IS a verbatim span of the belief). A shared boilerplate quote would
        // otherwise cluster unrelated atoms, since the detector tokenizes the
        // whole rendered line (claim + quote) — not the claim alone.
        quotes: [{ text: s.claim, source: "ep.md" }],
        eps: [s.ep ?? "2026-07-16"],
      });
      ids.push(id);
      for (let i = 0; i < s.stacks; i++) {
        appendLedger(ledgerPath, { ev: "stack", atom: id, ep: `ep-${id}-${i}.md`, ts: "2026-07-16T00:00:00.000Z" });
      }
    }
    return { beliefsDir, ledgerPath, ids };
  }

  const foldOf = (ledgerPath: string) => foldWeights(readLedger(ledgerPath));
  const TS = "2026-08-04T12:00:00.000Z";

  test("detects a paraphrase cluster and picks the highest-weight winner", () => {
    // A=5, B=3, C=2 stacks -> A is the clear winner; B and C are losers.
    const { beliefsDir, ledgerPath, ids } = seedPopulation([
      { claim: FID_A, stacks: 5 },
      { claim: FID_B, stacks: 3 },
      { claim: FID_C, stacks: 2 },
      { claim: DISTINCT, stacks: 4 },
    ]);
    const atoms = readAtoms(beliefsDir);
    const plan = planDistillation(atoms, foldOf(ledgerPath), TS);

    expect(plan.clusters.length).toBe(1);
    const c = plan.clusters[0];
    expect(c.winner).toBe(ids[0]); // FID_A, weight 5
    expect(c.losers.sort()).toEqual([ids[1], ids[2]].sort()); // FID_B, FID_C
    expect(plan.deferred).toBe(0);
    // one supersede event per loser, all naming the same winner
    expect(plan.supersedeEvents.length).toBe(2);
    for (const ev of plan.supersedeEvents) {
      expect(ev.ev).toBe("supersede");
      expect(ev.winner).toBe(ids[0]);
      expect(ev.ts).toBe(TS);
    }
  });

  test("tie on weight breaks to the earliest [ep:] stamp", () => {
    // B and C both weight 2; A weight 2 too — all tied on weight, so the
    // earliest ep wins. A carries the earliest stamp.
    const { beliefsDir, ids } = seedPopulation([
      { claim: FID_A, stacks: 2, ep: "2026-06-01" },
      { claim: FID_B, stacks: 2, ep: "2026-07-01" },
      { claim: FID_C, stacks: 2, ep: "2026-08-01" },
    ]);
    const atoms = readAtoms(beliefsDir);
    const ledgerPath = path.join(path.dirname(beliefsDir), "beliefs.jsonl");
    const plan = planDistillation(atoms, foldOf(ledgerPath), TS);
    expect(plan.clusters.length).toBe(1);
    expect(plan.clusters[0].winner).toBe(ids[0]); // earliest ep 2026-06-01
  });

  test("weight transfers to the winner; losers fall below floor and drop from the render", () => {
    const { beliefsDir, ledgerPath, ids } = seedPopulation([
      { claim: FID_A, stacks: 5 },
      { claim: FID_B, stacks: 3 },
      { claim: FID_C, stacks: 2 },
    ]);
    const atoms = readAtoms(beliefsDir);
    const before = foldOf(ledgerPath);
    const plan = planDistillation(atoms, before, TS);

    // Fold the plan's supersede events in and re-check state.
    const after = foldWeights([...readLedger(ledgerPath), ...plan.supersedeEvents]);
    // Winner absorbs both losers' weight: 5 + 3 + 2 = 10.
    expect(after.get(ids[0])!.weight).toBe(10);
    // Losers: weight 0, status superseded-by winner, and gone from the render.
    for (const loser of [ids[1], ids[2]]) {
      expect(after.get(loser)!.weight).toBe(0);
      expect(after.get(loser)!.status).toBe(`superseded-by:${ids[0]}`);
    }
    const { manifest } = renderSelf(atoms, after);
    const renderedIds = new Set(manifest.map((m) => m.atom));
    expect(renderedIds.has(ids[0])).toBe(true);
    expect(renderedIds.has(ids[1])).toBe(false);
    expect(renderedIds.has(ids[2])).toBe(false);
  });

  test("re-render after distill is clean: the cluster is gone", () => {
    const { beliefsDir, ledgerPath } = seedPopulation([
      { claim: FID_A, stacks: 5 },
      { claim: FID_B, stacks: 3 },
      { claim: FID_C, stacks: 2 },
      { claim: DISTINCT, stacks: 4 },
    ]);
    const atoms = readAtoms(beliefsDir);
    const before = foldOf(ledgerPath);
    // before: the cluster is present
    const r0 = detectSelfStutter(adaptRenderedForStutterCheck(renderSelf(atoms, before).md));
    expect(r0.doctrine.length).toBe(1);
    // after: distill, re-fold, re-render — clean
    const plan = planDistillation(atoms, before, TS);
    const after = foldWeights([...readLedger(ledgerPath), ...plan.supersedeEvents]);
    const r1 = detectSelfStutter(adaptRenderedForStutterCheck(renderSelf(atoms, after).md));
    expect(r1.doctrine.length).toBe(0);
    expect(r1.motifs.length).toBe(0);
  });

  test("cap: at most DISTILL_CAP clusters resolved per run, the rest deferred", () => {
    // Build DISTILL_CAP + 2 independent 2-member clusters. Each cluster is a
    // distinct topic family; within a family the two claims paraphrase.
    // Per-family UNIQUE tokens (suffixed with the family index) so families
    // never cross-cluster; within a family the two claims share five of six
    // tokens (>= the 0.3 overlap threshold) and differ only in the last.
    const specs: { claim: string; stacks: number }[] = [];
    for (let i = 0; i < DISTILL_CAP + 2; i++) {
      specs.push({ claim: `Aardvark${i} basilisk${i} cormorant${i} dromedary${i} eagle${i} gecko${i}.`, stacks: 3 });
      specs.push({ claim: `Aardvark${i} basilisk${i} cormorant${i} dromedary${i} eagle${i} heron${i}.`, stacks: 2 });
    }
    const { beliefsDir, ledgerPath } = seedPopulation(specs);
    const atoms = readAtoms(beliefsDir);
    const plan = planDistillation(atoms, foldOf(ledgerPath), TS, DISTILL_CAP);
    expect(plan.clusters.length).toBe(DISTILL_CAP);
    expect(plan.deferred).toBe(2);
    // exactly one loser per 2-member cluster, capped
    expect(plan.supersedeEvents.length).toBe(DISTILL_CAP);
  });

  test("runDistillPhase appends the supersede events to the ledger (real run)", () => {
    const { beliefsDir, ledgerPath, ids } = seedPopulation([
      { claim: FID_A, stacks: 5 },
      { claim: FID_B, stacks: 3 },
    ]);
    const atoms = readAtoms(beliefsDir);
    const before = readLedger(ledgerPath).length;
    const plan = runDistillPhase(atoms, foldOf(ledgerPath), ledgerPath, TS, "test-corr", false);
    const after = readLedger(ledgerPath);
    expect(after.length).toBe(before + 1); // one loser -> one supersede appended
    const appended = after[after.length - 1];
    expect(appended.ev).toBe("supersede");
    expect(appended.winner).toBe(ids[0]);
    expect(appended.loser).toBe(ids[1]);
    expect(plan.clusters.length).toBe(1);
  });

  test("runDistillPhase --dry-run appends NOTHING", () => {
    const { beliefsDir, ledgerPath } = seedPopulation([
      { claim: FID_A, stacks: 5 },
      { claim: FID_B, stacks: 3 },
    ]);
    const atoms = readAtoms(beliefsDir);
    const before = readLedger(ledgerPath).length;
    const plan = runDistillPhase(atoms, foldOf(ledgerPath), ledgerPath, TS, "test-corr", true);
    expect(readLedger(ledgerPath).length).toBe(before); // dry-run: no writes
    expect(plan.clusters.length).toBe(1); // but the plan still reports what it WOULD do
  });

  test("paranoia: a throwing detector cannot kill REM — the phase degrades", () => {
    // planDistillation delegates to renderSelf/detectSelfStutter, neither of
    // which throws by contract. This asserts the phase's own robustness: a
    // population with zero clusters returns an empty plan, never throws.
    const { beliefsDir, ledgerPath } = seedPopulation([
      { claim: FID_A, stacks: 5 },
      { claim: DISTINCT, stacks: 4 },
    ]);
    const atoms = readAtoms(beliefsDir);
    const plan = planDistillation(atoms, foldOf(ledgerPath), TS);
    expect(plan.clusters).toEqual([]);
    expect(plan.supersedeEvents).toEqual([]);
    expect(plan.deferred).toBe(0);
  });

  test("subject counters under newly-sank 0, potentiated > 0, distilled > 0", () => {
    // The brief's required subject case: nothing crossed the floor this run,
    // propagation potentiated some atoms, and distill superseded some.
    const { subject } = buildCommitMessage({
      date: "2026-08-04", stacked: 0, bumped: 0, newlySank: 0, belowFloor: 27,
      potentiated: 19, distilled: 15, population: 104, belowFloorIds: ["x"],
    });
    expect(subject).toContain("sank 0 · 27 below floor");
    expect(subject).toContain("potentiated 19");
    expect(subject).toContain("distilled 15");
  });
});

// ===========================================================================
// WAVE 1 (rem-storm hardening, Task A) -- RED until agnt-rem-slot-guard
// implements: the slot guard, the whole-entry-path singleton lock, and the
// consecutive-failure budget. See briefs/rem-storm/TMK-A-rem-slot-guard.md
// and briefs/rem-storm/criteria-A.md (test <-> done-when mapping).
//
// These are real subprocess tests against a real temp CIRCADIAN_HOME (house
// pattern, src/sleep.test.ts:136-138) -- no mocking of rem-popmem.ts's CLI,
// no mocking of the LLM. CIRCADIAN_LLM_BASE_URL is pointed at a closed local
// port (never 127.0.0.1:10240) so a real fetch is attempted and fails fast
// via connection refusal -- this is network-level test isolation, not a
// mock, and it is what makes "zero live-LLM calls in this wave" possible
// even though GREETING runs on every cycle regardless of episode count.
// Episode-level failures are injected through real content (a missing
// frontmatter date -- stack.ts's own parse-episode phase, no LLM reached)
// and through the real "already-stacked" ledger idempotence check (also no
// LLM reached) -- never through a stub of stackEpisode itself.
// ===========================================================================
describe("wave-2 hardening: slot guard, singleton lock, failure budget", () => {
  const REM_SCRIPT = path.join(import.meta.dir, "rem-popmem.ts");
  const PROJECT_ROOT = path.join(import.meta.dir, "..");
  // Never 10240: a closed port makes `complete()` fail fast (connection
  // refused) instead of reaching the shared local LLM. RETRIES=1 skips the
  // 2s/10s backoff so a degrade-and-continue call costs ~0ms, not ~12s.
  const DEAD_LLM_ENV = { CIRCADIAN_LLM_BASE_URL: "http://127.0.0.1:19999/v1", CIRCADIAN_LLM_RETRIES: "1" };

  function runRem(home: string, args: string[]) {
    return spawnSync(process.execPath, [REM_SCRIPT, ...args], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, CIRCADIAN_HOME: home, ...DEAD_LLM_ENV },
      encoding: "utf8",
    });
  }

  function readJsonl(p: string): any[] {
    if (!fs.existsSync(p)) return [];
    return fs
      .readFileSync(p, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  }

  /** A real temp CIRCADIAN_HOME: git-init'd mind/ (mind commit needs a real
   * repo -- git add fails hard on a missing pathspec, so every file the
   * commit step's `git add` list names is pre-seeded as a real, empty
   * placeholder; a genuinely fresh mind/ hitting that pre-existing gap is
   * not this unit's bug to fix or hide from), one real atom (so REM does
   * not idle out at the empty-population gate before reaching anything this
   * suite cares about), and no episodes yet (each test seeds its own). */
  function makeCliHome(): string {
    const home = tmpDir();
    const mindDir = path.join(home, "mind");
    fs.mkdirSync(path.join(mindDir, "beliefs"), { recursive: true });
    fs.mkdirSync(path.join(mindDir, "episodes"), { recursive: true });
    fs.mkdirSync(path.join(home, "logs"), { recursive: true });
    spawnSync("git", ["init"], { cwd: mindDir });
    spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: mindDir });
    spawnSync("git", ["config", "user.name", "Test"], { cwd: mindDir });
    fs.writeFileSync(path.join(mindDir, "SELF.md"), "");
    fs.writeFileSync(path.join(mindDir, "render-manifest.json"), "[]\n");
    fs.writeFileSync(path.join(mindDir, "digested.jsonl"), "");
    fs.writeFileSync(path.join(mindDir, "scoreboard.jsonl"), "");
    fs.writeFileSync(path.join(mindDir, "greeting.md"), "");
    fs.writeFileSync(path.join(mindDir, "NOW.md"), "");
    writeAtom(path.join(mindDir, "beliefs"), {
      kind: "doctrine",
      claim: "fixture population so REM does not idle on an empty mind.",
      why: "keeps the harness past the population-check gate",
      quotes: [{ text: "fixture population so REM does not idle on an empty mind.", source: "fixture.md" }],
      eps: ["2026-07-16"],
    });
    return home;
  }

  describe("single-flight lock — whole entry path (work item 2)", () => {
    test("a live --if-due lock also blocks a concurrent MANUAL (non---if-due) run", () => {
      const home = makeCliHome();
      const lockPath = path.join(home, "logs", ".rem-popmem.ifdue.lock");
      // Simulate an in-flight pass: a live pid (our own test process, which
      // is certainly alive) holding the lock -- fact 12's fixture-over-real-
      // concurrency spirit, applied to a lock file instead of a scoreboard.
      fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, ts: Date.now() }));

      runRem(home, []); // MANUAL: no --if-due

      // TODAY: the lock check lives entirely inside `if (ifDue)` (rem-popmem.ts
      // ~1015-1036), so a manual run never looks at it and proceeds straight
      // through. This is work item 2's gap: "extend the single-flight lock to
      // the WHOLE entry path, not just --if-due."
      const events = readJsonl(path.join(home, "logs", "circadian.events.jsonl"));
      expect(events).toContainEqual(
        expect.objectContaining({
          phase: "schedule-guard",
          context: expect.objectContaining({ lock_path: lockPath }),
        })
      );
    });
  });

  describe("consecutive-failure budget & slot-burn (work items 1 and 3)", () => {
    test("a failed pass burns its slot: isDue must not re-offer within the same slot after a failure", () => {
      const home = makeCliHome();
      const mindDir = path.join(home, "mind");
      // Deterministic parse-episode failure (stack.ts frontmatterDate finds
      // no "---\ndate: YYYY-MM-DD\n---" block) -- fails before extract-llm,
      // so this reaches zero LLM calls even without the dead-port env.
      fs.writeFileSync(
        path.join(mindDir, "episodes", "2026-08-01-poison.md"),
        "no frontmatter at all -- deterministic parse-episode failure\n"
      );

      const before = new Date();
      runRem(home, ["--if-due"]);

      const remEvents = readJsonl(path.join(mindDir, "scoreboard.jsonl")).filter((e) => e && e.type === "rem");

      // TODAY: stack.ts's per-episode fail() calls process.exit before MIND
      // COMMIT (the only place a scoreboard `rem` event is written) is ever
      // reached, so a failed run leaves ZERO trace on the scoreboard -- the
      // next session's isDue() reads "never ran" and re-fires immediately
      // (fact 1's thundering herd, fact 4's mechanism). Work item 1 requires
      // a failed run to record its attempt against the slot regardless.
      expect(remEvents.length).toBeGreaterThan(0);
      expect(isDue(remEvents, new Date(before.getTime() + 1_000))).toBe(false);
    });

    test("three consecutive failed passes across three slots stop the fourth from starting; a clean manual run clears the stuck state", () => {
      const home = makeCliHome();
      const mindDir = path.join(home, "mind");
      const eventsPath = path.join(home, "logs", "circadian.events.jsonl");
      const BLOCKER = "poison-fixture.md";
      // Three distinct REM_SLOT_HOURS ([9, 21]) slots, CORD's amendment:
      // "drive it with scoreboard / stop-state fixtures, not a real 36-hour
      // wait. Test the state machine, not the calendar."
      const failedSlots = ["2026-08-20T09:05:00.000Z", "2026-08-20T21:05:00.000Z", "2026-08-21T09:05:00.000Z"];
      fs.writeFileSync(
        path.join(mindDir, "scoreboard.jsonl"),
        failedSlots.map((ts) => JSON.stringify({ ts, type: "rem", failed: true, failure_episode: BLOCKER })).join("\n") + "\n"
      );
      // episodes/ stays EMPTY on purpose: this test is about the entry gate,
      // not absorb, so even if the budget guard does not fire (today) and the
      // pass runs its whole course, nothing here can reach a real LLM.

      runRem(home, ["--if-due"]);

      // TODAY: nothing counts consecutive failed passes across slots, so the
      // fourth --if-due call proceeds straight past the (nonexistent) budget
      // check to "nothing to absorb" instead of refusing to start.
      const eventsAfterFourth = readJsonl(eventsPath);
      expect(eventsAfterFourth).toContainEqual(
        expect.objectContaining({
          outcome: "degraded",
          context: expect.objectContaining({ failure_episode: BLOCKER }),
        })
      );
      expect(readJsonl(path.join(mindDir, "digested.jsonl"))).toHaveLength(0);

      // Clearing surface (ORCH ruling): "a durable stop-state file, cleared
      // by a successful manual (non---if-due) run." No TTL, no auto-reset.
      const eventsCountAfterFourth = eventsAfterFourth.length;
      const manual = runRem(home, []);
      expect(manual.status).toBe(0);

      runRem(home, ["--if-due"]);
      const newEvents = readJsonl(eventsPath).slice(eventsCountAfterFourth);
      expect(
        newEvents.some((e) => e.outcome === "degraded" && e.context && e.context.failure_episode === BLOCKER)
      ).toBe(false);
    });
  });

  describe("episode-level failure no longer wedges the pass (work items 4 and 5)", () => {
    test("one malformed episode is held aside; the remaining episodes still process and successes are recorded digested", () => {
      const home = makeCliHome();
      const mindDir = path.join(home, "mind");
      const episodesDir = path.join(mindDir, "episodes");
      const ledgerPath = path.join(mindDir, "beliefs.jsonl");

      const GOOD_BEFORE = "2026-08-01-a-good.md";
      const BAD = "2026-08-02-b-bad.md";
      const GOOD_AFTER = "2026-08-03-c-good.md";

      // Both "good" episodes take the real, LLM-free "already-stacked"
      // idempotence path (stack.ts:772, checked against the ledger) -- proof
      // that they "still process" never depends on a live LLM call.
      fs.writeFileSync(path.join(episodesDir, GOOD_BEFORE), "---\ndate: 2026-08-01\n---\nalready-stacked fixture\n");
      fs.writeFileSync(path.join(episodesDir, BAD), "no frontmatter at all -- deterministic parse-episode failure\n");
      fs.writeFileSync(path.join(episodesDir, GOOD_AFTER), "---\ndate: 2026-08-03\n---\nalready-stacked fixture\n");
      appendLedger(ledgerPath, { ev: "stack", ep: GOOD_BEFORE, ts: "2026-07-16T00:00:00.000Z" });
      appendLedger(ledgerPath, { ev: "stack", ep: GOOD_AFTER, ts: "2026-07-16T00:00:00.000Z" });

      const run = runRem(home, ["--if-due"]);

      // TODAY: BAD's parse-episode fail() kills the whole process (stack.ts's
      // fail() is `: never`, obs.ts:125 calls process.exit) before GOOD_AFTER
      // (alphabetically after BAD) is ever attempted, and before
      // recordDigested (called once, only after the loop, rem-popmem.ts:1072)
      // ever runs -- so even GOOD_BEFORE's already-computed digest entry is
      // lost. This is fact 4's multiplier, reproduced with zero LLM calls.
      expect(run.status).toBe(0);
      const digestedFilenames = readJsonl(path.join(mindDir, "digested.jsonl")).map((e) => e.filename);
      expect(digestedFilenames).toContain(GOOD_BEFORE);
      expect(digestedFilenames).toContain(GOOD_AFTER);
    });
  });
});
