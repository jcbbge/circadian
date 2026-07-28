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
import { detectSelfStutter } from "./immune.ts";
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
  clusterDoctrineByClaimLine,
  normalizeClaimForDedup,
  normalizedClaimEdges,
  unionFindGroups,
  CLAIM_MAX_CHARS,
  CLAIM_CLUSTER_THRESHOLD,
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

  test("rawText is tried as a whole-text candidate when the claim/why text carries no quote marks at all", () => {
    // most motif/how-we-work/identity lines have zero embedded quote marks —
    // extractQuoteSpans on claim+why alone would find nothing without rawText
    const r = resolveQuote(["2026-02-01"], "no quote marks in here whatsoever", episodes, {
      rawText: "this exact sentence appears verbatim here",
    });
    expect("quote" in r).toBe(true);
    if ("quote" in r) expect(r.quote).toBe("this exact sentence appears verbatim here");
  });

  test("zero [ep:] stamps + no genesis episode -> no-eps (unchanged WS-E behavior)", () => {
    const r = resolveQuote([], "no stamps at all", episodes, { rawText: "no stamps at all" });
    expect("reason" in r && r.reason).toBe("no-eps");
  });

  test("WS-E2 OPTION (a): zero [ep:] stamps + a genesis episode that verifies -> resolves against it", () => {
    const genesis: ReplayEpisode = {
      filename: "2026-07-28-genesis-archaeology.md",
      content: "mind@abc1234 (2026-07-16): a founding motif with no episode of its own",
      source: "live",
    };
    const withGenesis = resolveQuote([], "claim text\nwhy text", [], {
      rawText: "a founding motif with no episode of its own",
      genesisEpisode: genesis,
    });
    expect("quote" in withGenesis).toBe(true);
    if ("quote" in withGenesis) {
      expect(withGenesis.source).toBe("2026-07-28-genesis-archaeology.md");
      expect(withGenesis.quote).toBe("a founding motif with no episode of its own");
    }
  });

  test("zero [ep:] stamps + a genesis episode that does NOT verify -> no-verbatim-quote, never fabricated", () => {
    const genesis: ReplayEpisode = { filename: "2026-07-28-genesis-archaeology.md", content: "completely unrelated content", source: "live" };
    const r = resolveQuote([], "claim text", [], { rawText: "text that is not in the genesis episode at all", genesisEpisode: genesis });
    expect("reason" in r && r.reason).toBe("no-verbatim-quote");
  });
});

// ---------------------------------------------------------------------
// FIX 1 in isolation — clusterDoctrineByClaimLine, synthetic corpus
// ---------------------------------------------------------------------

describe("clusterDoctrineByClaimLine — complete linkage, synthetic corpus", () => {
  function raw(n: number, title: string): ReturnType<typeof parseDoctrineEntries>[number] {
    return { n, titleLine: `**${n}. ${title}.**`, title, body: "irrelevant body text, never compared", eps: ["2026-01-01"] };
  }

  test("a candidate with even one weak link is excluded (complete linkage, not single)", () => {
    // A-B strong, B-C strong, A-C weak: single-linkage would chain A-B-C into
    // one group; complete linkage must keep C out since A-C fails threshold.
    const doctrine = [
      raw(1, "the quick brown fox jumps over"),
      raw(2, "the quick brown fox leaps over"),
      raw(3, "leaps over lazy sleeping dogs today"),
    ];
    const { groups } = clusterDoctrineByClaimLine(doctrine, 0.5);
    const sorted = groups.map((g) => [...g].sort((a, b) => a - b));
    expect(sorted).toContainEqual([1, 2]);
    expect(sorted).toContainEqual([3]);
  });

  test("an isolated title with zero significant overlap to anything is always a singleton", () => {
    const doctrine = [raw(1, "completely unrelated topic alpha"), raw(2, "totally different subject beta")];
    const { groups } = clusterDoctrineByClaimLine(doctrine, CLAIM_CLUSTER_THRESHOLD);
    expect(groups.map((g) => g.length).sort()).toEqual([1, 1]);
  });

  test("matrix diagonal is always 1 and matrix is symmetric for any input", () => {
    const doctrine = [raw(1, "alpha beta gamma"), raw(2, "alpha beta delta"), raw(3, "totally unrelated epsilon")];
    const { matrix } = clusterDoctrineByClaimLine(doctrine);
    for (let i = 0; i < matrix.length; i++) {
      expect(matrix[i][i]).toBe(1);
      for (let j = 0; j < matrix.length; j++) expect(matrix[i][j]).toBe(matrix[j][i]);
    }
  });
});

// ---------------------------------------------------------------------
// WS-E3 Fix A helpers in isolation — normalizeClaimForDedup, normalizedClaimEdges,
// unionFindGroups
// ---------------------------------------------------------------------

describe("normalizeClaimForDedup — comparison key only, never a rewrite", () => {
  test("strips ASCII and curly leading/trailing quote chars, collapses whitespace", () => {
    expect(normalizeClaimForDedup('"Trust is ambient, not narrated.')).toBe("Trust is ambient, not narrated.");
    expect(normalizeClaimForDedup("Trust is ambient, not narrated.")).toBe("Trust is ambient, not narrated.");
    expect(normalizeClaimForDedup("“Curly quoted.”")).toBe("Curly quoted.");
    expect(normalizeClaimForDedup("‘Curly single.’")).toBe("Curly single.");
    expect(normalizeClaimForDedup("  extra   whitespace   here  ")).toBe("extra whitespace here");
  });

  test("never strips an apostrophe in the middle of a word", () => {
    expect(normalizeClaimForDedup("it's fine, don't strip apostrophes mid-word")).toBe("it's fine, don't strip apostrophes mid-word");
  });
});

describe("normalizedClaimEdges + unionFindGroups", () => {
  test("identical-after-normalization claims produce an edge; distinct claims do not", () => {
    const claims = ['"Same belief.', "Same belief.", "A different belief entirely."];
    const edges = normalizedClaimEdges(claims);
    expect(edges).toEqual([[0, 1]]);
    const groups = unionFindGroups(claims.length, edges).map((g) => [...g].sort((a, b) => a - b));
    expect(groups).toContainEqual([0, 1]);
    expect(groups).toContainEqual([2]);
  });

  test("unionFindGroups combines two independent edge sets transitively (the motifs jaccard+claim-norm union)", () => {
    // 0-1 linked only via "jaccard", 1-2 linked only via "claim-norm" -> all three merge
    const jaccardEdges: [number, number][] = [[0, 1]];
    const claimEdges: [number, number][] = [[1, 2]];
    const groups = unionFindGroups(3, [...jaccardEdges, ...claimEdges]).map((g) => [...g].sort((a, b) => a - b));
    expect(groups).toEqual([[0, 1, 2]]);
  });

  test("an item with no edges at all comes back as its own singleton group", () => {
    const groups = unionFindGroups(3, []).map((g) => [...g].sort((a, b) => a - b));
    expect(groups.sort()).toEqual([[0], [1], [2]]);
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

  test("WS-E2 FIX 1: claim-line complete-linkage replaces the old body-level megacluster (documented regression marker — detectSelfStutter body-level still chains all 9, which is exactly why FIX 1 exists)", () => {
    const stutter = detectSelfStutter(liveSelfMd);
    expect(stutter.doctrine.length).toBe(1);
    expect(stutter.doctrine[0].length).toBe(9); // the WS-E megacluster — unchanged upstream behavior

    // migrate.ts no longer uses stutter.doctrine for the collapse decision —
    // clusterDoctrineByClaimLine (claim titles only, complete linkage) does.
    expect(plan.doctrineClustering.groups.length).toBe(6); // [1],[4],[5],[7],[8,12,16],[13,17]
    const sorted = plan.doctrineClustering.groups.map((g) => [...g].sort((a, b) => a - b));
    expect(sorted).toContainEqual([1]);
    expect(sorted).toContainEqual([4]);
    expect(sorted).toContainEqual([5]);
    expect(sorted).toContainEqual([7]);
    expect(sorted).toContainEqual([8, 12, 16]);
    expect(sorted).toContainEqual([13, 17]);

    const doctrineAtoms = plan.candidates.filter((c) => c.kind === "doctrine");
    // Doctrine[1] and Doctrine[4] resolve a real verbatim quote standing
    // alone; Doctrine[5], Doctrine[7], and both new clusters do not (they
    // borrowed Doctrine[1]'s quote under the old megacluster) — a documented,
    // honest new finding, not a bug (see migrate.test.ts's exceptions test below).
    expect(doctrineAtoms.map((c) => c.label).sort()).toEqual(["Doctrine[1]", "Doctrine[4]"]);
    expect(doctrineAtoms.find((c) => c.label === "Doctrine[1]")!.claim).toBe("The cliff is complexity accretion.");
  });

  test("the pairwise claim-line matrix is symmetric with a unit diagonal, and every cluster is genuinely complete-linked", () => {
    const { matrix, groups } = plan.doctrineClustering;
    const n = matrix.length;
    for (let i = 0; i < n; i++) {
      expect(matrix[i][i]).toBe(1);
      for (let j = 0; j < n; j++) expect(matrix[i][j]).toBeCloseTo(matrix[j][i], 10);
    }
    const sections = parseSelfSections(liveSelfMd);
    const liveDoctrine = parseDoctrineEntries(sections.doctrine);
    const indexOfN = new Map(liveDoctrine.map((d, idx) => [d.n, idx]));
    for (const group of groups) {
      if (group.length < 2) continue;
      for (const a of group) {
        for (const b of group) {
          if (a === b) continue;
          expect(matrix[indexOfN.get(a)!][indexOfN.get(b)!]).toBeGreaterThanOrEqual(CLAIM_CLUSTER_THRESHOLD);
        }
      }
    }
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
// WS-E2 OPTION (a) + WS-E3 fix B — the real authored genesis episode
// resolves all 25 zero-[ep:] exceptions AND the 4 residual doctrine
// exceptions FIX 1's claim-line clustering surfaced
// ---------------------------------------------------------------------

describe("OPTION (a) + fix B: the staged genesis-archaeology episode resolves all 29 exceptions", () => {
  const GENESIS_PATH = path.join(process.cwd(), "docs", "genesis-archaeology.episode.md");
  const genesisContent = fs.readFileSync(GENESIS_PATH, "utf8");
  const genesisEpisode: ReplayEpisode = { filename: "2026-07-28-genesis-archaeology.md", content: genesisContent, source: "live" };

  const liveSelfMd = pinnedSelfMd();
  const history = buildHistory(PINNED_REV, MIND);
  const episodes = collectAllEpisodesAt(PINNED_REV, MIND);
  const planWithoutGenesis = planMigration(liveSelfMd, history, episodes);
  const planWithGenesis = planMigration(liveSelfMd, history, episodes, genesisEpisode);

  test("every non-doctrine zero-eps exception from the no-genesis run is RESOLVED with the genesis episode", () => {
    const zeroEpsLabels = new Set(
      planWithoutGenesis.exceptions.filter((e) => e.kind !== "doctrine" && e.reason.includes("no [ep:] stamp")).map((e) => e.label)
    );
    // 25 raw entries (identity 2 + motifs 15 + how-we-work 8), but two pairs
    // correctly cluster into one label each even before genesis resolution:
    // "Lake vs river"/"river has forgotten" (motifs, stutter+claim-normalized)
    // and the two "Trust is ambient, not narrated." how-we-work entries
    // (WS-E3 claim normalization — see the dedicated tests below) — 23
    // distinct labels, all 25 raw entries still accounted for.
    expect(zeroEpsLabels.size).toBe(23);

    const resolvedLabels = new Set(planWithGenesis.candidates.map((c) => c.label));
    for (const label of zeroEpsLabels) expect(resolvedLabels.has(label)).toBe(true);
  });

  test("WS-E3 fix B: the 4 residual doctrine exceptions (Doctrine[5], [7], [8,12,16], [13,17]) all resolve against the extended genesis episode — the exceptions table is EMPTY", () => {
    const doctrineExceptionsBefore = planWithoutGenesis.exceptions.filter((e) => e.kind === "doctrine");
    expect(doctrineExceptionsBefore.length).toBe(4); // the WS-E2 finding, still reproducible without genesis

    expect(planWithGenesis.exceptions.length).toBe(0); // EMPTY exceptions table, the acceptance bar

    const doctrineCandidates = planWithGenesis.candidates.filter((c) => c.kind === "doctrine");
    expect(doctrineCandidates.length).toBe(6); // 1, 4, 5, 7, {8,12,16}, {13,17}
    const labels = doctrineCandidates.map((c) => c.label);
    expect(labels.some((l) => l === "Doctrine[5]")).toBe(true);
    expect(labels.some((l) => l === "Doctrine[7]")).toBe(true);
    expect(labels.some((l) => l.startsWith("Doctrine[8,12,16]"))).toBe(true);
    expect(labels.some((l) => l.startsWith("Doctrine[13,17]"))).toBe(true);

    // each residual doctrine atom's weight is still the REAL accreted [ep:]
    // occurrence count (genesis only supplies the quote, never the
    // recurrence signal) — never collapsed to a flat genesis birth-event
    for (const c of doctrineCandidates) {
      if (["Doctrine[5]", "Doctrine[7]"].includes(c.label) || c.label.startsWith("Doctrine[8,12,16]") || c.label.startsWith("Doctrine[13,17]")) {
        expect(c.occurrences.length).toBeGreaterThan(0);
        expect(c.quote.source).toBe(genesisEpisode.filename);
        expect(quotesAreVerbatim([c.quote.quote], genesisEpisode.content)).toBe(true);
      }
    }
  });

  test("the 'Lake vs river' / 'river has forgotten' motif pair merges into ONE atom, weight 2 (regression: detectSelfStutter's motif lines carry their '-' bullet prefix; a stripped comparison is required or the cluster silently fails to match)", () => {
    const merged = planWithGenesis.candidates.find((c) => c.label.includes("stutter cluster"));
    expect(merged).toBeDefined();
    expect(merged!.kind).toBe("motif");
    expect(merged!.occurrences).toEqual(["2026-07-28", "2026-07-28"]); // 2 raw entries folded in, not flattened to 1
    // and it must NOT also appear as two separate un-clustered atoms
    const riverLabels = planWithGenesis.candidates.filter((c) => /river|Lake vs river/i.test(c.label));
    expect(riverLabels.length).toBe(1);
  });

  test("WS-E3 Fix A: the two 'Trust is ambient, not narrated.' agreement entries merge via claim normalization, weight 2 (they differ only by a leading typographic quote char — a punctuation-only divergence, not two beliefs)", () => {
    const merged = planWithGenesis.candidates.find((c) => c.label.includes("claim-normalized cluster") && c.kind === "agreement");
    expect(merged).toBeDefined();
    expect(merged!.occurrences).toEqual(["2026-07-28", "2026-07-28"]);
    // both raw forms normalize identically; the ORIGINAL (unnormalized) text
    // is what actually lands in the atom — never rewritten
    expect(normalizeClaimForDedup(merged!.claim)).toBe("Trust is ambient, not narrated.");
    // must not also appear as two separate agreement atoms
    const trustAtoms = planWithGenesis.candidates.filter((c) => c.kind === "agreement" && normalizeClaimForDedup(c.claim) === "Trust is ambient, not narrated.");
    expect(trustAtoms.length).toBe(1);
  });

  test("every genesis-sourced atom's quote is genuinely verbatim in the staged file (the counterfeit-quote assert, real fixture)", () => {
    const genesisSourced = planWithGenesis.candidates.filter((c) => c.quote.source === genesisEpisode.filename);
    expect(genesisSourced.length).toBe(27); // 23 non-doctrine (25 raw, two merged pairs) + 4 residual doctrine (fix B)
    for (const c of genesisSourced) {
      expect(quotesAreVerbatim([c.quote.quote], genesisEpisode.content)).toBe(true);
    }

    // non-doctrine genesis atoms: one occurrence PER raw entry folded in
    // (birth events, no prior LIVE recurrence), dated to the genesis episode
    // itself — 1 for every singleton, 2 for the two merged pairs.
    const nonDoctrineGenesisSourced = genesisSourced.filter((c) => c.kind !== "doctrine");
    expect(nonDoctrineGenesisSourced.length).toBe(23);
    for (const c of nonDoctrineGenesisSourced) {
      expect(c.occurrences.every((d) => d === "2026-07-28")).toBe(true);
      expect(c.occurrences.length).toBeGreaterThanOrEqual(1);
    }
    const totalOccurrences = nonDoctrineGenesisSourced.reduce((s, c) => s + c.occurrences.length, 0);
    expect(totalOccurrences).toBe(25); // every one of the 25 raw non-doctrine entries is accounted for exactly once

    // doctrine genesis atoms: weight is the REAL accreted [ep:] occurrence
    // count, never flattened to a genesis birth event (genesis only ever
    // supplies the quote for these, not the recurrence signal)
    const doctrineGenesisSourced = genesisSourced.filter((c) => c.kind === "doctrine");
    expect(doctrineGenesisSourced.length).toBe(4);
    for (const c of doctrineGenesisSourced) expect(c.occurrences.some((d) => d !== "2026-07-28")).toBe(true);
  });

  test("the genesis episode is a valid v1 episode: frontmatter date/session/arc present", () => {
    expect(genesisContent).toMatch(/^---\ndate: \d{4}-\d{2}-\d{2}\nsession: .+\narc: .+\n---\n/);
  });

  test("adding the genesis episode changes nothing about the non-doctrine, non-merged candidates (the one pre-existing real-episode agreement atom)", () => {
    // Doctrine and the Trust-is-ambient pair change WITH genesis by design
    // (that's the point of fix A/B) — only the untouched singleton with a
    // real episode source should be identical either way.
    const before = planWithoutGenesis.candidates.find((c) => c.label.includes("Show, never describe"));
    const after = planWithGenesis.candidates.find((c) => c.label.includes("Show, never describe"));
    expect(after).toEqual(before);
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
