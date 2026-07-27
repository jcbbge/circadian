// migrate.test.ts — WS-E migration (popmem, docs/POPULATION-MEMORY.md §11/§12).
// Real fixtures pinned to a live mind revision (the zoom.test.ts pattern), no
// mocks of code under test. The live mind is READ via `git show`/`git log`
// only (WORKER-CONTRACT rule 3) — this file never writes under ~/circadian/mind.
import { describe, test, expect, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { tmpdir, homedir } from "os";
import { execFileSync } from "child_process";
import { readAtoms, readLedger, foldWeights } from "./atoms.ts";
import { renderSelf } from "./render.ts";
import { quotesAreVerbatim } from "./stack.ts";
import { detectSelfStutter } from "./mutate.ts";
import { collectAllEpisodesAt, type ReplayEpisode } from "./replay.ts";
import {
  parseSelfSections,
  parseDoctrineEntries,
  parseBulletEntries,
  parseIdentityEntries,
  epOccurrences,
  normalizeTitleKey,
  normalizeLineKey,
  normalizeQuoteKey,
  splitFirstSentence,
  truncateClaim,
  extractQuoteSpans,
  buildHistory,
  earliestDoctrine,
  earliestBullet,
  earliestIdentity,
  resolveQuote,
  planMigration,
  seedSandbox,
  adaptRenderedForStutterCheck,
  CLAIM_MAX_CHARS,
  type ParsedDoc,
} from "./migrate.ts";

const HOME = process.env.CIRCADIAN_HOME || path.join(homedir(), "circadian");
const MIND = path.join(HOME, "mind");
// Pinned per the brief (WS-E re-baseline at execution): the live mind HEAD at
// brief-writing and at this worker's execution both landed on this rev — the
// .rem-freeze keeps SELF.md byte-stable across the program (docs/POPULATION-MEMORY.md
// §19). If a future rebase moves HEAD, this pin still resolves via git history.
const PINNED_REV = "187bb80cf8319d758064b0d07a9b012fedcbb404";
const SEED_TS = "2026-07-27T00:00:00.000Z";

const dirs: string[] = [];
function tmpDir(prefix: string): string {
  const d = fs.mkdtempSync(path.join(tmpdir(), prefix));
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

function pinnedSelfMd(): string {
  return execFileSync("git", ["show", `${PINNED_REV}:SELF.md`], { cwd: MIND, encoding: "utf8" });
}

// ---------------------------------------------------------------------
// section parsing -> kind mapping
// ---------------------------------------------------------------------

describe("section parsing maps 1:1 to atom kinds", () => {
  const sections = parseSelfSections(pinnedSelfMd());

  test("all four v1 headings are found", () => {
    expect(sections.whoIAm.length).toBeGreaterThan(0);
    expect(sections.doctrine.length).toBeGreaterThan(0);
    expect(sections.motifs.length).toBeGreaterThan(0);
    expect(sections.howWeWork.length).toBeGreaterThan(0);
  });

  test("doctrine entries: 9 numbered blocks at the pinned rev, matching the brief's fact", () => {
    const doctrine = parseDoctrineEntries(sections.doctrine);
    expect(doctrine.length).toBe(9);
    expect(doctrine.map((d) => d.n)).toEqual([1, 4, 5, 7, 8, 12, 13, 16, 17]);
    for (const d of doctrine) {
      expect(d.title.length).toBeGreaterThan(0);
      expect(d.titleLine).toContain(`**${d.n}.`);
    }
  });

  test("motifs and how-we-work parse as bullet lines, '-' prefix stripped", () => {
    const motifs = parseBulletEntries(sections.motifs);
    const how = parseBulletEntries(sections.howWeWork);
    expect(motifs.length).toBeGreaterThan(0);
    expect(how.length).toBeGreaterThan(0);
    for (const m of [...motifs, ...how]) expect(m.line.startsWith("-")).toBe(false);
  });

  test("identity splits on ' :: ' into discrete quoted entries", () => {
    const identity = parseIdentityEntries(sections.whoIAm);
    expect(identity.length).toBe(2);
    for (const i of identity) {
      expect(i.text.startsWith('"')).toBe(false); // quote marks stripped
      expect(i.text.length).toBeGreaterThan(0);
    }
  });

  test("a missing heading returns an empty body, never throws (unlike mutate.ts's parseSelf)", () => {
    expect(() => parseSelfSections("no headings here at all")).not.toThrow();
    const s = parseSelfSections("no headings here at all");
    expect(s.whoIAm).toBe("");
    expect(parseDoctrineEntries(s.doctrine)).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// [ep:] occurrence extraction — order-preserving, zero-padded, not deduped
// ---------------------------------------------------------------------

describe("epOccurrences", () => {
  test("extracts every occurrence in order, normalizing loose dates", () => {
    const text = "a [ep:2026-07-16] b [ep:2026-7-6] c [ep:2026-07-16]";
    expect(epOccurrences(text)).toEqual(["2026-07-16", "2026-07-06", "2026-07-16"]);
  });

  test("no stamps -> empty array", () => {
    expect(epOccurrences("nothing here")).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// normalization keys
// ---------------------------------------------------------------------

describe("normalization keys strip stamps and collapse whitespace", () => {
  test("normalizeTitleKey is case/whitespace-insensitive", () => {
    expect(normalizeTitleKey("The   Cliff  is Complexity Accretion.")).toBe(normalizeTitleKey("the cliff is complexity accretion."));
  });

  test("normalizeLineKey strips [ep:]/[confirmed:] tags before comparing", () => {
    const a = "Show, never describe. [ep:2026-07-24]";
    const b = "Show, never describe. [confirmed:2026-07-25]";
    expect(normalizeLineKey(a)).toBe(normalizeLineKey(b));
  });

  test("normalizeQuoteKey behaves the same way for identity text", () => {
    expect(normalizeQuoteKey("I am Circadian. [ep:2026-07-16]")).toBe(normalizeQuoteKey("I am Circadian."));
  });
});

// ---------------------------------------------------------------------
// claim/why split + 280-char cap (R3)
// ---------------------------------------------------------------------

describe("splitFirstSentence + truncateClaim", () => {
  test("splits at the first sentence boundary; no second sentence -> empty rest", () => {
    expect(splitFirstSentence("One thing. Two thing. Three thing.")).toEqual({ first: "One thing.", rest: "Two thing. Three thing." });
    expect(splitFirstSentence("Just one sentence")).toEqual({ first: "Just one sentence", rest: "" });
  });

  test("truncateClaim leaves short claims untouched", () => {
    expect(truncateClaim("The cliff is complexity accretion.")).toBe("The cliff is complexity accretion.");
  });

  test("truncateClaim prefers the first sentence when the full text overflows 280 chars", () => {
    const first = "Short assertion.";
    const rest = "x".repeat(400);
    const claim = truncateClaim(`${first} ${rest}`);
    expect(claim).toBe(first);
    expect(claim.length).toBeLessThanOrEqual(CLAIM_MAX_CHARS);
  });

  test("truncateClaim hard-truncates when even the first sentence overflows 280 chars", () => {
    const longSentence = "x".repeat(320) + ".";
    const claim = truncateClaim(longSentence);
    expect(claim.length).toBeLessThanOrEqual(CLAIM_MAX_CHARS);
    expect(claim.endsWith("…")).toBe(true);
  });
});

// ---------------------------------------------------------------------
// quote span extraction
// ---------------------------------------------------------------------

describe("extractQuoteSpans", () => {
  test("extracts ascii-quoted spans at or above the minimum length, in order", () => {
    const text = 'a "short" b "this one is long enough to count" c';
    const spans = extractQuoteSpans(text);
    expect(spans).toEqual(["this one is long enough to count"]);
  });

  test("also extracts curly-quoted spans", () => {
    const text = "before “a genuinely long curly quoted span here” after";
    expect(extractQuoteSpans(text)).toEqual(["a genuinely long curly quoted span here"]);
  });

  test("no quotes -> empty array", () => {
    expect(extractQuoteSpans("nothing quoted at all")).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// earliest-telling selection — real divergence fixture (Doctrine[1])
// ---------------------------------------------------------------------

describe("earliest-telling selection: Doctrine[1] real divergence", () => {
  const history = buildHistory(PINNED_REV, MIND);

  test("history walk reaches genesis and ends at the pinned rev", () => {
    expect(history.length).toBeGreaterThan(10);
    expect(history[history.length - 1].rev).toBe(PINNED_REV);
  });

  test("Doctrine[1]'s earliest telling is shorter than the live (smeared) body — real divergence", () => {
    const liveDoctrine = parseDoctrineEntries(parseSelfSections(pinnedSelfMd()).doctrine);
    const live1 = liveDoctrine.find((d) => d.n === 1)!;
    expect(live1).toBeDefined();

    const earliest = earliestDoctrine(history, normalizeTitleKey(live1.title));
    expect(earliest.entry.title).toBe(live1.title); // title is stable across the whole lineage
    expect(earliest.entry.body.length).toBeLessThan(live1.body.length); // body is NOT — this is the smear
    expect(earliest.rev).not.toBe(PINNED_REV); // it came from a genuinely earlier commit
    // the earliest telling carries only its own founding stamp; the live body
    // has accreted extra [ep:] citations on top of it (the smear this module exists to undo)
    expect(epOccurrences(earliest.entry.body).length).toBeLessThan(epOccurrences(live1.body).length);
  });

  test("a bullet entry with a single unchanged telling reports found=true at its own origin", () => {
    const sections = parseSelfSections(pinnedSelfMd());
    const how = parseBulletEntries(sections.howWeWork);
    const showNeverDescribe = how.find((b) => b.line.startsWith("Show, never describe"))!;
    expect(showNeverDescribe).toBeDefined();
    const earliest = earliestBullet(history, normalizeLineKey(showNeverDescribe.line), (doc) => doc.howWeWork);
    expect(earliest.found).toBe(true);
    expect(earliest.entry.line).toBe(showNeverDescribe.line); // never smeared — text is identical at origin
  });

  test("identity quotes carry no [ep:] stamp at any telling — v1's Who-I-am section never cited an episode inline", () => {
    const sections = parseSelfSections(pinnedSelfMd());
    const identity = parseIdentityEntries(sections.whoIAm);
    expect(identity.length).toBeGreaterThan(0);
    for (const i of identity) {
      const earliest = earliestIdentity(history, normalizeQuoteKey(i.text));
      // whichever revision the quote traces to (found=true) or falls back to
      // (found=false), identity entries never carry an [ep:] stamp — this is
      // exactly why they cannot be sourced to an episode and land in EXCEPTIONS.
      expect(earliest.entry.eps).toEqual([]);
      expect(i.eps).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------
// earliest-telling mechanism in isolation — synthetic history (no live mind
// dependency; exercises the pure matching logic directly)
// ---------------------------------------------------------------------

describe("earliest-telling mechanism on synthetic history", () => {
  function doc(rev: string, doctrine: { n: number; title: string; body: string }[]): ParsedDoc {
    return {
      rev,
      doctrine: doctrine.map((d) => ({ n: d.n, titleLine: `**${d.n}. ${d.title}.**`, title: d.title, body: d.body, eps: epOccurrences(`[ep:2026-01-01] ${d.body}`) })),
      motifs: [],
      howWeWork: [],
      identity: [],
    };
  }

  test("picks the FIRST revision (oldest) whose title matches, ignoring number drift", () => {
    const history: ParsedDoc[] = [
      doc("rev1", [{ n: 3, title: "A stable belief", body: "short original body [ep:2026-01-01]" }]),
      doc("rev2", [{ n: 3, title: "A stable belief", body: "short original body [ep:2026-01-01] plus one deepen [ep:2026-01-05]" }]),
      doc("rev3", [{ n: 9, title: "A stable belief", body: "short original body [ep:2026-01-01] plus one deepen [ep:2026-01-05] plus another [ep:2026-01-09]" }]),
    ];
    const earliest = earliestDoctrine(history, normalizeTitleKey("A stable belief"));
    expect(earliest.rev).toBe("rev1");
    expect(earliest.found).toBe(true);
    expect(earliest.entry.body).toBe("short original body [ep:2026-01-01]");
  });

  test("an entry absent from all history reports found=false", () => {
    const history: ParsedDoc[] = [doc("rev1", [{ n: 1, title: "Unrelated", body: "x" }])];
    const earliest = earliestDoctrine(history, normalizeTitleKey("Never existed"));
    expect(earliest.found).toBe(false);
  });
});

// ---------------------------------------------------------------------
// counterfeit-quote prevention — resolveQuote, pure, synthetic episodes
// ---------------------------------------------------------------------

describe("resolveQuote — never fabricates, always verifiable via stack.ts", () => {
  const episodes: ReplayEpisode[] = [
    { filename: "2026-02-01-real-episode.md", content: 'the user said "this exact sentence appears verbatim here" and nothing else', source: "live" },
  ];

  test("no [ep:] stamps -> no-eps failure", () => {
    const r = resolveQuote([], '"this exact sentence appears verbatim here"', episodes);
    expect("reason" in r && r.reason).toBe("no-eps");
  });

  test("[ep:] stamp with no matching episode -> no-episode failure", () => {
    const r = resolveQuote(["2099-01-01"], '"this exact sentence appears verbatim here"', episodes);
    expect("reason" in r && r.reason).toBe("no-episode");
  });

  test("episode resolves but no candidate quote verifies -> no-verbatim-quote failure", () => {
    const r = resolveQuote(["2026-02-01"], '"a completely different unverifiable sentence"', episodes);
    expect("reason" in r && r.reason).toBe("no-verbatim-quote");
  });

  test("a genuinely verbatim quote resolves to its source episode", () => {
    const r = resolveQuote(["2026-02-01"], 'text with "this exact sentence appears verbatim here" embedded', episodes);
    expect("quote" in r).toBe(true);
    if ("quote" in r) {
      expect(r.source).toBe("2026-02-01-real-episode.md");
      expect(quotesAreVerbatim([r.quote], episodes[0].content)).toBe(true); // the actual counterfeit assert, from stack.ts
    }
  });
});

// ---------------------------------------------------------------------
// full pipeline against the real pinned mind — stutter cluster -> 1 atom,
// weight = copies (the brief's real fixture: the doctrine megacluster)
// ---------------------------------------------------------------------

describe("planMigration against the real pinned mind", () => {
  const liveSelfMd = pinnedSelfMd();
  const history = buildHistory(PINNED_REV, MIND);
  const episodes = collectAllEpisodesAt(PINNED_REV, MIND);
  const plan = planMigration(liveSelfMd, history, episodes);

  test("every candidate kind maps to a valid AtomKind and claim stays <=280 chars", () => {
    expect(plan.candidates.length).toBeGreaterThan(0);
    for (const c of plan.candidates) {
      expect(["identity", "doctrine", "motif", "agreement"]).toContain(c.kind);
      expect(c.claim.length).toBeLessThanOrEqual(CLAIM_MAX_CHARS);
      expect(c.why.length).toBeGreaterThan(0);
    }
  });

  test("detectSelfStutter's real single-linkage output on this corpus collapses all 9 doctrine entries into ONE cluster (verified independently) — migrate.ts must fold it into exactly one atom, weight = total occurrence count across every member", () => {
    const stutter = detectSelfStutter(liveSelfMd);
    expect(stutter.doctrine.length).toBe(1);
    expect(stutter.doctrine[0].length).toBe(9); // 1,4,5,7,8,12,13,16,17 — the real megacluster

    const doctrineAtoms = plan.candidates.filter((c) => c.kind === "doctrine");
    expect(doctrineAtoms.length).toBe(1); // stutter collapse, not 9
    const merged = doctrineAtoms[0];
    expect(merged.claim).toBe("The cliff is complexity accretion."); // Doctrine[1] — earliest origin (2026-07-16) wins
    expect(merged.label).toContain("stutter cluster");

    // weight = copy count: sum of every member's own live [ep:] occurrences
    const sections = parseSelfSections(liveSelfMd);
    const liveDoctrine = parseDoctrineEntries(sections.doctrine);
    const expectedWeight = stutter.doctrine[0].reduce((sum, g) => {
      const d = liveDoctrine.find((x) => x.n === g.n)!;
      return sum + d.eps.length;
    }, 0);
    expect(merged.occurrences.length).toBe(expectedWeight);
  });

  test("every candidate's quote is genuinely verbatim in its resolved source episode (the counterfeit-quote assert, R3)", () => {
    const byFilename = new Map(episodes.map((e) => [e.filename, e]));
    expect(plan.candidates.length).toBeGreaterThan(0);
    for (const c of plan.candidates) {
      const episode = byFilename.get(c.quote.source);
      expect(episode).toBeDefined();
      expect(quotesAreVerbatim([c.quote.quote], episode!.content)).toBe(true);
    }
  });

  test("entries with no recoverable verbatim quote land in EXCEPTIONS, never as a fabricated atom", () => {
    expect(plan.exceptions.length).toBeGreaterThan(0);
    for (const e of plan.exceptions) {
      expect(["identity", "doctrine", "motif", "agreement"]).toContain(e.kind);
      expect(e.reason.length).toBeGreaterThan(0);
      expect(e.disposition.length).toBeGreaterThan(0);
      // no exception ever appears as a written candidate too
      expect(plan.candidates.some((c) => c.label === e.label)).toBe(false);
    }
    // the founding-archaeology motifs/identity/how-we-work entries carry no
    // [ep:] stamp anywhere in history — this is the majority of exceptions
    expect(plan.exceptions.filter((e) => e.reason.includes("no [ep:] stamp")).length).toBeGreaterThan(10);
  });

  test("planMigration is pure and deterministic: identical inputs -> deep-equal plan", () => {
    const again = planMigration(liveSelfMd, history, episodes);
    expect(again).toEqual(plan);
  });
});

// ---------------------------------------------------------------------
// determinism — R8: two full sandbox seeds from identical inputs produce
// byte-identical beliefs/ + ledger + render
// ---------------------------------------------------------------------

describe("determinism (R8): identical rev+ts -> byte-identical sandbox output", () => {
  test("two independent seedSandbox runs produce identical atom files, ledgers, and renders", () => {
    const liveSelfMd = pinnedSelfMd();
    const history = buildHistory(PINNED_REV, MIND);
    const episodes = collectAllEpisodesAt(PINNED_REV, MIND);
    const plan = planMigration(liveSelfMd, history, episodes);

    const dirA = tmpDir("migrate-determinism-a-");
    const dirB = tmpDir("migrate-determinism-b-");
    const beliefsA = path.join(dirA, "beliefs");
    const beliefsB = path.join(dirB, "beliefs");
    const ledgerA = path.join(dirA, "beliefs.jsonl");
    const ledgerB = path.join(dirB, "beliefs.jsonl");

    seedSandbox(plan, beliefsA, ledgerA, SEED_TS);
    seedSandbox(plan, beliefsB, ledgerB, SEED_TS);

    const filesA = fs.readdirSync(beliefsA).sort();
    const filesB = fs.readdirSync(beliefsB).sort();
    expect(filesA).toEqual(filesB);
    expect(filesA.length).toBe(plan.candidates.length);
    for (const f of filesA) {
      expect(fs.readFileSync(path.join(beliefsA, f), "utf8")).toBe(fs.readFileSync(path.join(beliefsB, f), "utf8"));
    }
    expect(fs.readFileSync(ledgerA, "utf8")).toBe(fs.readFileSync(ledgerB, "utf8"));

    const atomsA = readAtoms(beliefsA);
    const atomsB = readAtoms(beliefsB);
    const statesA = foldWeights(readLedger(ledgerA));
    const statesB = foldWeights(readLedger(ledgerB));
    const renderA = renderSelf(atomsA, statesA);
    const renderB = renderSelf(atomsB, statesB);
    expect(renderA.md).toBe(renderB.md); // byte-identical render, twice
    expect(renderA.manifest).toEqual(renderB.manifest);
  });
});

// ---------------------------------------------------------------------
// smear-not-laundered proof: detectSelfStutter on the RENDERED output
// ---------------------------------------------------------------------

describe("adaptRenderedForStutterCheck: smear not laundered into the rendered population", () => {
  test("the real seeded+rendered popmem SELF.md reports zero clusters (the doctrine megacluster is already ONE atom, so nothing left to re-cluster)", () => {
    const liveSelfMd = pinnedSelfMd();
    const history = buildHistory(PINNED_REV, MIND);
    const episodes = collectAllEpisodesAt(PINNED_REV, MIND);
    const plan = planMigration(liveSelfMd, history, episodes);

    const dir = tmpDir("migrate-stutter-check-");
    const beliefsDir = path.join(dir, "beliefs");
    const ledgerPath = path.join(dir, "beliefs.jsonl");
    seedSandbox(plan, beliefsDir, ledgerPath, SEED_TS);
    const atoms = readAtoms(beliefsDir);
    const states = foldWeights(readLedger(ledgerPath));
    const { md } = renderSelf(atoms, states);

    const adapted = adaptRenderedForStutterCheck(md);
    const report = detectSelfStutter(adapted);
    expect(report.doctrine.length).toBe(0);
    expect(report.motifs.length).toBe(0);
  });

  test("adapter is a faithful wrapper: a deliberately duplicated rendered claim IS still caught", () => {
    const dupSelf = [
      "## Who I am across sessions",
      "",
      "identity text",
      "",
      "## Doctrine",
      "",
      '**one true thing about the system and its behavior over time** — "a quote" (ep.md) [ep:2026-01-01]',
      "",
      '**one true thing about the system and its behavior over time, restated** — "a quote" (ep.md) [ep:2026-01-01]',
      "",
      "## Motifs",
      "",
      "(empty — no atoms above the render floor yet)",
      "",
      "## How we work",
      "",
      "(empty — no atoms above the render floor yet)",
      "",
    ].join("\n");
    const adapted = adaptRenderedForStutterCheck(dupSelf);
    const report = detectSelfStutter(adapted);
    expect(report.doctrine.length).toBe(1);
  });
});
