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
  GREETING_MAX_LINES,
  buildCommitMessage,
  assertRenderInvariant,
  type DigestedEntry,
} from "./rem-popmem.ts";

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
});

// ---------------------------------------------------------------------
// commit message assembly
// ---------------------------------------------------------------------
describe("buildCommitMessage", () => {
  test("subject follows the documented convention", () => {
    const { subject } = buildCommitMessage({ date: "2026-07-27", stacked: 3, bumped: 5, sank: 1, population: 41, sankIds: ["abc123"] });
    expect(subject).toBe("rem: 2026-07-27 — stacked 3, bumped 5, sank 1, population 41");
  });

  test("body lists sank-below-floor ids when present", () => {
    const { body } = buildCommitMessage({ date: "2026-07-27", stacked: 0, bumped: 0, sank: 2, population: 10, sankIds: ["aaa", "bbb"] });
    expect(body).toBe("\n\nsank below floor: aaa, bbb");
  });

  test("body states none when nothing sank", () => {
    const { body } = buildCommitMessage({ date: "2026-07-27", stacked: 1, bumped: 0, sank: 0, population: 10, sankIds: [] });
    expect(body).toBe("\n\nsank below floor: (none)");
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
