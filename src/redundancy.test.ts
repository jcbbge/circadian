import { describe, expect, test } from "bun:test";
import {
  computeRedundancy,
  MEAN_OVERLAP_THRESHOLD,
  MODAL_SHARE_THRESHOLD,
  MIN_CORPUS,
} from "./redundancy.ts";

// The calibration ground truth, measured on the real corpses 2026-08-09
// (probe against mind commit 7c4dc18 vs the clean same-day render):
//   poisoned: meanOverlap 0.0235, modalShare 0.42 ("system"), n=48
//   clean:    meanOverlap 0.0107, modalShare 0.24, n=34
// The thresholds must keep sitting strictly between those pairs — if a
// refactor moves them, this test is the tripwire.
describe("calibration envelope", () => {
  test("thresholds sit between the measured clean and poisoned corpses", () => {
    expect(MEAN_OVERLAP_THRESHOLD).toBeGreaterThan(0.0107);
    expect(MEAN_OVERLAP_THRESHOLD).toBeLessThan(0.0235);
    expect(MODAL_SHARE_THRESHOLD).toBeGreaterThan(0.24);
    expect(MODAL_SHARE_THRESHOLD).toBeLessThan(0.42);
    expect(MIN_CORPUS).toBeLessThanOrEqual(34); // both real corpora qualify
  });
});

describe("computeRedundancy", () => {
  test("a mode-collapsed corpus trips the alarm", () => {
    // Obedience doctrine in light lexical variation — the August shape.
    const claims = [
      "The system executes instructions with mechanical fidelity and exact output.",
      "The system is defined by mechanical execution of verbatim instructions.",
      "Obedience to exact command syntax is the only valid state of the system.",
      "The system must reply with exact verbatim output and then stop.",
      "The user demands the system execute instructions with zero deviation.",
      "Trust in the system is earned through mechanical fidelity to instructions.",
      "The system operates under a contract of literal execution of instructions.",
      "The system has no agency beyond executing verbatim instructions exactly.",
    ];
    const r = computeRedundancy(claims);
    expect(r.collapse).toBe(true);
    expect(r.modalToken).toBe("system");
  });

  test("a diverse corpus does not trip the alarm", () => {
    const claims = [
      "The cliff is complexity accretion.",
      "Palms open in the forest: stillness first, bird seed in hand.",
      "Embedded base64 assets lack verifiable external sources.",
      "The board's high-water mark persists across restarts.",
      "Memory earns residence by causing thoughts.",
      "A liveness plane must show the showing-mechanism is alive.",
      "Repo hygiene: no mocks; stage files explicitly.",
      "Lake versus river: storage pools; memory must flow.",
    ];
    const r = computeRedundancy(claims);
    expect(r.collapse).toBe(false);
  });

  test("degenerate inputs: empty, singleton, and sub-corpus inputs never alarm", () => {
    expect(computeRedundancy([]).collapse).toBe(false);
    expect(computeRedundancy([]).meanOverlap).toBe(0);
    const single = computeRedundancy(["One belief standing alone."]);
    expect(single.collapse).toBe(false); // modalShare is 1.0 here — MIN_CORPUS guards it
    expect(single.meanOverlap).toBe(0);
    const tiny = computeRedundancy(["same words here", "same words here"]);
    expect(tiny.collapse).toBe(false); // identical pair, but n < MIN_CORPUS
  });

  test("sources counts unique files", () => {
    const r = computeRedundancy(["a b c", "d e f"], ["x.md", "x.md", "y.md"]);
    expect(r.sources).toBe(2);
  });
});
