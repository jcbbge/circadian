// interfere.test.ts — the wave-optics W3 interference instrument, pinned
// against the REAL belief population on disk (repo doctrine: no mocks).
//
// What is pinned, and why (original brief W3-flock-merge.md + W3b):
//   1. The "mechanical fidelity" FLOCK must land in one cluster:
//      `0bf353ba44b0` ("trust is earned through mechanical fidelity ...",
//      kind agreement) and `4aa467268930` ("user values mechanical
//      fidelity over narrative interpretation ...", kind motif) are one
//      belief in two tellings, below the stacker's 0.3 auto-SAME band —
//      the exact paraphrase class this instrument exists to catch.
//      Measured by the coordinator 2026-08-09: 43 atom files contain
//      "mechanical fidelity"; the top-8 weight-bumped atoms are all
//      restatements of the same claim.
//   2. Two genuinely distinct doctrines must NOT cluster:
//      `6ed0b774ec2a` ("Bidirectional state flow is the sole entry point
//      to system work.") vs `e8b0c351543c` ("Motion is the metric — the
//      only valid measure of success ..."). Zero shared vocabulary.
//
// Every cluster decision goes through `lexicalLinker` — the real lexical
// fallback from interfere.ts, not a mock. `:10240` (embeddings) is down
// this session (contract Law 10); the fallback IS the tested surface.
//
// Kind-scoping note: `interfere()` partitions by kind before any pair is
// compared (the four render sections must each keep their strongest
// telling). The flock pin therefore asserts at the SEMANTIC surface
// (`lexicalLinker` + `clusterClaims`, where kind is not part of the
// comparison) AND at the pipeline level the two distinct doctrines never
// co-cluster in the real population. The flock pair 0bf/4aa are different
// kinds — the pipeline collapses each kind's flock separately (verified
// against the live dry-run report: 0bf wins the agreement flock,
// 4aa wins the motif flock, the identity flock lands on 45bc2cd4294e).
//
// Fixtures: readAtoms/readLedger/foldWeights read the real mind/ on disk;
// pickWinner/previewTop pure-function cases use hand-built inputs in the
// render.test.ts style (real claims where the tie needs them).

import { describe, test, expect } from "bun:test";
import * as path from "path";
import * as fs from "fs";
import { homedir, tmpdir } from "os";
import { readAtoms, readLedger, foldWeights } from "./atoms.ts";
import type { Atom, AtomState } from "./atoms.ts";
import {
  lexicalLinker,
  clusterClaims,
  interfere,
  pickWinner,
  previewTop,
  sharedBigramCount,
  FALLBACK_JACCARD,
  AUTO_SAME_JACCARD,
} from "./interfere.ts";
import { jaccard, significantTokens } from "./ltp.ts";

const CIRCADIAN_HOME = process.env.CIRCADIAN_HOME || path.join(homedir(), "circadian");
const MIND_DIR = path.join(CIRCADIAN_HOME, "mind");

// The flock this suite is pinned to (the "mechanical fidelity" atoms) was
// expelled from the working tree by the 2026-08-09 purge (mind commit
// 87436ff). The evidence lives forever at the pre-purge snapshot 7c4dc18 —
// same atoms, same ids, preserved location. Materialize that rev's
// beliefs/ + ledger into a temp dir once per run; readAtoms/readLedger
// (the code under test) stay pointed at real files, unchanged.
const PRE_PURGE_REV = "7c4dc18";
const SNAPSHOT_DIR = (() => {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "mind-prepurge-"));
  const archive = Bun.spawnSync(["sh", "-c", `git -C "${MIND_DIR}" archive ${PRE_PURGE_REV} beliefs | tar -x -C "${dir}"`]);
  if (archive.exitCode !== 0) {
    throw new Error(`could not materialize beliefs/ at mind rev ${PRE_PURGE_REV}: ${archive.stderr.toString()}`);
  }
  const ledger = Bun.spawnSync(["git", "-C", MIND_DIR, "show", `${PRE_PURGE_REV}:beliefs.jsonl`]);
  if (ledger.exitCode !== 0) {
    throw new Error(`could not materialize beliefs.jsonl at mind rev ${PRE_PURGE_REV}`);
  }
  fs.writeFileSync(path.join(dir, "beliefs.jsonl"), ledger.stdout.toString());
  return dir;
})();
const BELIEFS_DIR = path.join(SNAPSHOT_DIR, "beliefs");
const LEDGER_PATH = path.join(SNAPSHOT_DIR, "beliefs.jsonl");

// The pinned ids from the brief. Their content is ground truth at the
// snapshot; a missing id is a fixture failure (rev gone or corrupt), not a
// thing to silently retarget — the echo.test.ts pinned-evidence pattern.
const FLOCK_A = "0bf353ba44b0"; // agreement: "trust is earned through mechanical fidelity ..."
const FLOCK_B = "4aa467268930"; // motif: "user values mechanical fidelity over narrative interpretation ..."
const DOCTRINE_SOUTH = "6ed0b774ec2a"; // "Bidirectional state flow is the sole entry point ..."
const DOCTRINE_MOTION = "e8b0c351543c"; // "Motion is the metric — the only valid measure ..."

function pinnedAtom(id: string, atoms: Atom[]): Atom {
  const a = atoms.find((x) => x.id === id);
  if (!a) {
    throw new Error(
      `pinned atom ${id} is gone from ${BELIEFS_DIR} — the evidence this suite is pinned to ` +
        `is not on disk; do not "fix" this by retargeting to a different atom`
    );
  }
  return a;
}

function active(weight: number): AtomState {
  return { weight, status: "active" };
}

describe("fixture sanity: the flock and its counterexamples exist at the pinned snapshot", () => {
  const atoms = readAtoms(BELIEFS_DIR);

  test("all four pinned atoms are present (fail loudly, list what is missing)", () => {
    const missing = [FLOCK_A, FLOCK_B, DOCTRINE_SOUTH, DOCTRINE_MOTION].filter(
      (id) => !atoms.some((a) => a.id === id)
    );
    expect(missing).toEqual([]);
  });

  test("the flock pair share the 'mechanical fidelity' phrase; the distinct pair are both doctrines", () => {
    const fa = pinnedAtom(FLOCK_A, atoms);
    const fb = pinnedAtom(FLOCK_B, atoms);
    const ds = pinnedAtom(DOCTRINE_SOUTH, atoms);
    const dm = pinnedAtom(DOCTRINE_MOTION, atoms);
    expect(fa.claim.toLowerCase()).toContain("mechanical fidelity");
    expect(fb.claim.toLowerCase()).toContain("mechanical fidelity");
    expect(ds.kind).toBe("doctrine");
    expect(dm.kind).toBe("doctrine");
    expect(fa.claim).not.toBe(fb.claim); // two tellings, not one byte-identical claim
  });

  test("the flock is dense on disk: many real atoms wear the 'mechanical fidelity' telling", () => {
    const flock = atoms.filter((a) => a.claim.toLowerCase().includes("mechanical fidelity"));
    // coordinator measurement (2026-08-09): 43 files contain the phrase; pin
    // only the durable floor so the suite survives honest population change.
    expect(flock.length).toBeGreaterThanOrEqual(5);
    expect(flock.map((a) => a.id)).toContain(FLOCK_A);
    expect(flock.map((a) => a.id)).toContain(FLOCK_B);
  });
});

describe("lexicalClaimLinker — the semantic surface, real claims (the fallback, not a mock)", () => {
  const atoms = readAtoms(BELIEFS_DIR);
  const fa = pinnedAtom(FLOCK_A, atoms);
  const fb = pinnedAtom(FLOCK_B, atoms);
  const ds = pinnedAtom(DOCTRINE_SOUTH, atoms);
  const dm = pinnedAtom(DOCTRINE_MOTION, atoms);

  test("the mechanical-fidelity flock pair links — and ONLY via the below-0.3+bigram path", () => {
    const jac = jaccard(significantTokens(fa.claim), significantTokens(fb.claim));
    // The pair sits BELOW the stacker's auto-SAME band — the stacker would
    // never compare it (brief 08's blind spot). The instrument links it.
    expect(jac).toBeLessThan(AUTO_SAME_JACCARD);
    expect(jac).toBeGreaterThanOrEqual(FALLBACK_JACCARD);
    expect(sharedBigramCount(fa.claim, fb.claim)).toBeGreaterThanOrEqual(1);
    expect(lexicalLinker(fa.claim, fb.claim)).toBe(true);
  });

  test("two genuinely distinct doctrines never link", () => {
    // Zero shared significant vocabulary: jaccard 0, no bigram, no link.
    expect(jaccard(significantTokens(ds.claim), significantTokens(dm.claim))).toBe(0);
    expect(lexicalLinker(ds.claim, dm.claim)).toBe(false);
  });
});

describe("clusterClaims through the lexical linker — 'must land in one cluster'", () => {
  const atoms = readAtoms(BELIEFS_DIR);

  test("the whole 'mechanical fidelity' flock collapses into one cluster containing both pins", async () => {
    const flock = atoms.filter((a) => a.claim.toLowerCase().includes("mechanical fidelity"));
    const clusters = await clusterClaims(flock, lexicalLinker);
    const home = clusters.find((c) => c.some((a) => a.id === FLOCK_A));
    expect(home).toBeDefined();
    // once they link, single-linkage cannot split them; the flock lands whole
    expect(home!.map((a) => a.id)).toContain(FLOCK_B);
    expect(home!.length).toBe(flock.length);
  });

  test("the two distinct doctrines do NOT share a cluster, even alone in the pool", async () => {
    const ds = pinnedAtom(DOCTRINE_SOUTH, atoms);
    const dm = pinnedAtom(DOCTRINE_MOTION, atoms);
    const clusters = await clusterClaims([ds, dm], lexicalLinker);
    expect(clusters.length).toBe(2);
    for (const c of clusters) expect(c.length).toBe(1);
  });
});

describe("interfere — the full pipeline over the real population", () => {
  const atoms = readAtoms(BELIEFS_DIR);
  const events = readLedger(LEDGER_PATH);
  const states = foldWeights(events);
  const FIXED_TS = "2026-08-09T00:00:00.000Z";

  test("pipeline math holds: before/after, proposal shape, cluster invariants", async () => {
    const result = await interfere(atoms, states, lexicalLinker, FIXED_TS);

    // before = active atoms per fold(ledger); after = minus one per loser.
    const activeCount = atoms.filter((a) => (states.get(a.id)?.status ?? "active") === "active").length;
    expect(result.before).toBe(activeCount);
    expect(result.after).toBe(result.before - result.proposals.length);

    // every proposal is a supersede of two real ids; no self-supersede.
    const ids = new Set(atoms.map((a) => a.id));
    for (const p of result.proposals) {
      expect(p.ev).toBe("supersede");
      expect(p.ts).toBe(FIXED_TS);
      expect(ids.has(p.winner!)).toBe(true);
      expect(ids.has(p.loser!)).toBe(true);
      expect(p.winner).not.toBe(p.loser);
    }

    // every cluster: size >= 2, winner not among its losers, members all one kind.
    for (const c of result.clusters) {
      expect(c.losers.length).toBeGreaterThanOrEqual(1);
      expect(c.winner.kind).toBe(c.kind);
      for (const l of c.losers) {
        expect(l.kind).toBe(c.kind);
        expect(l.id).not.toBe(c.winner.id);
      }
      const memberSum = c.losers.reduce((s, l) => s + (states.get(l.id)?.weight ?? 0), states.get(c.winner.id)?.weight ?? 0);
      expect(c.combinedWeight).toBeCloseTo(memberSum, 6);
    }
  });

  test("kind-scoping is airtight: no cluster crosses kinds (the four render sections keep their strongest telling)", async () => {
    const result = await interfere(atoms, states, lexicalLinker, FIXED_TS);
    for (const c of result.clusters) {
      expect(c.kind).toBe(c.winner.kind);
      for (const l of c.losers) expect(l.kind).toBe(c.kind);
    }
  });

  test("the two distinct doctrines never co-cluster in the real population", async () => {
    const result = await interfere(atoms, states, lexicalLinker, FIXED_TS);
    for (const c of result.clusters) {
      const memberIds = new Set([c.winner.id, ...c.losers.map((l) => l.id)]);
      expect(memberIds.has(DOCTRINE_SOUTH) && memberIds.has(DOCTRINE_MOTION)).toBe(false);
    }
  });

  test("deterministic: same inputs, same proposal, run twice", async () => {
    const first = await interfere(atoms, states, lexicalLinker, FIXED_TS);
    const second = await interfere(atoms, states, lexicalLinker, FIXED_TS);
    expect(second.proposals).toEqual(first.proposals);
    expect(second.clusters.map((c) => c.winner.id)).toEqual(first.clusters.map((c) => c.winner.id));
  });
});

describe("pickWinner — the merge's ordering contract (pure function, render.test.ts fixture style)", () => {
  const atoms = readAtoms(BELIEFS_DIR);
  const fa = pinnedAtom(FLOCK_A, atoms);
  const fb = pinnedAtom(FLOCK_B, atoms);

  test("highest folded weight wins", () => {
    const states = new Map<string, AtomState>([
      [fa.id, active(7)],
      [fb.id, active(2)],
    ]);
    expect(pickWinner([fa, fb], states).id).toBe(fa.id);
  });

  test("weight tie breaks to the earliest [ep:] stamp — the original telling", () => {
    const states = new Map<string, AtomState>([
      [fa.id, active(3)],
      [fb.id, active(3)],
    ]);
    expect(pickWinner([fa, fb], states).id).toBe(fa.id); // fa ep 2026-07-27 < fb ep 2026-07-28
  });

  test("full tie (weight + earliest ep) breaks to id lex asc — full determinism", () => {
    const early = { ...fa, id: "aaaaaaaaaaaa", eps: ["2026-07-01"] };
    const late = { ...fb, id: "bbbbbbbbbbbb", eps: ["2026-07-01"] };
    const states = new Map<string, AtomState>([
      [early.id, active(1)],
      [late.id, active(1)],
    ]);
    expect(pickWinner([late, early], states).id).toBe("aaaaaaaaaaaa");
  });
});

describe("previewTop — the post-merge render preview honors supersede", () => {
  const atoms = readAtoms(BELIEFS_DIR);
  const events = readLedger(LEDGER_PATH);
  const states = foldWeights(events);
  const FIXED_TS = "2026-08-09T00:00:00.000Z";

  test("no proposed loser appears in the top-N preview; losers keep their file and lineage (weight 0, superseded-by)", async () => {
    const result = await interfere(atoms, states, lexicalLinker, FIXED_TS);
    const previewIds = previewTop(atoms, events, result.proposals, 20).map((t) => t.atom.id);
    expect(previewIds.length).toBe(20);
    for (const p of result.proposals) {
      expect(previewIds).not.toContain(p.loser);
    }
    // weight transfer is in the fold itself: every loser folds to
    // status "superseded-by:<winner>" with weight 0 (atoms.ts foldWeights).
    const folded = foldWeights([...events, ...result.proposals]);
    for (const p of result.proposals) {
      const loser = pinnedAtom(p.loser!, atoms);
      expect(folded.get(p.loser!)?.status).toBe(`superseded-by:${p.winner}`);
      // the winner absorbed the loser's weight: winner weight before < after.
      expect((folded.get(p.winner!)?.weight ?? 0)).toBeGreaterThan(states.get(p.winner!)?.weight ?? 0);
    }
  });
});