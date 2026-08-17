// wake.test.ts — popmem WS-F: verifies the REM catch-up spawn target was
// repointed at rem-popmem.ts. wake.ts's own runHook() fires unconditionally
// at import time (it is a SessionStart hook script, not import-safe) — so
// this is a source-text assertion on the spawn call itself, never a live
// import or a live spawn (per the brief's done-when: "the spawn target
// string, not a live spawn").
import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { buildPayload, sliceSelf, classifyFleetTier } from "./wake-payload.ts";

const WAKE_SRC = fs.readFileSync(path.join(import.meta.dir, "wake.ts"), "utf8");

// Fresh "Last sleep" so the staleness warning never fires and only the
// slim/operator differences drive the assertions below.
const FRESH_NOW = `## Arc\n\nfleet launch in flight\n\n## Last sleep\n\n${new Date().toISOString()}\n`;
const SELF_FIXTURE = [
  "## Doctrine",
  "",
  "**Motion is the metric.** — doctrine atom one.",
  "**Evidence before assertion.** — doctrine atom two.",
  "",
  "## Motifs",
  "",
  "**The diamond.** — motif atom.",
  "",
  "## How we work",
  "",
  "**Show, never describe.** — working atom.",
].join("\n");
const COMMON = {
  self: SELF_FIXTURE,
  user: "# JRG\n\nOperational preferences that a worker does not need.",
  now: FRESH_NOW,
  greeting: "Good morning. Back on the fleet work.",
  evidence: "<mind:session-evidence>\nrelevant unit\n</mind:session-evidence>",
  constitution: "# The Constitution\n\n1. I am one entity wearing many engines.",
  constitutionJosh: "# Josh's Constitution\n\n1. I am a barefoot developer.",
};

describe("wake.ts REM catch-up spawn target", () => {
  test("spawns rem-popmem.ts, not rem.ts", () => {
    const spawnCallMatch = WAKE_SRC.match(/const child = spawn\(bun, \[[^\]]+\]/);
    expect(spawnCallMatch).not.toBeNull();
    const spawnCall = spawnCallMatch![0];
    expect(spawnCall).toContain("src/rem-popmem.ts");
    expect(spawnCall).toContain("--if-due");
  });

  test("the old rem.ts spawn invocation string is gone", () => {
    // A prose mention of rem.ts in a comment (documenting the retirement) is
    // fine; the OLD spawn argv literal must not remain anywhere in the file.
    expect(WAKE_SRC).not.toContain(`"src/rem.ts"), "--if-due"`);
  });

  test("still fires --if-due (catch-up semantics unchanged by the repoint)", () => {
    const spawnCallMatch = WAKE_SRC.match(/const child = spawn\(bun, \[[^\]]+\]/)!;
    expect(spawnCallMatch[0]).toMatch(/--if-due/);
  });
});

describe("classifyFleetTier (wake-slim)", () => {
  test("stamped roles map to their tier", () => {
    expect(classifyFleetTier("3-AGNT")).toBe("AGNT");
    expect(classifyFleetTier("4-SAGT")).toBe("SAGT");
    expect(classifyFleetTier("2-ORCH")).toBe("ORCH");
    expect(classifyFleetTier("1-CORD")).toBe("CORD");
  });
  test("named panes map to their tier", () => {
    expect(classifyFleetTier("agnt-b4-wake-slim")).toBe("AGNT");
    expect(classifyFleetTier("SAGT_verify")).toBe("SAGT");
  });
  test("operator / unstamped names are not a tier", () => {
    expect(classifyFleetTier("")).toBeNull();
    expect(classifyFleetTier("operator")).toBeNull();
    expect(classifyFleetTier("agent-smith")).toBeNull();
  });
});

describe("sliceSelf (wake-slim)", () => {
  test("keeps the Doctrine section, drops Motifs and How-we-work", () => {
    const sliced = sliceSelf(SELF_FIXTURE);
    expect(sliced).toContain("## Doctrine");
    expect(sliced).toContain("Motion is the metric");
    expect(sliced).not.toContain("## Motifs");
    expect(sliced).not.toContain("## How we work");
    expect(sliced.length).toBeLessThan(SELF_FIXTURE.length);
  });
  test("fails open: returns SELF unchanged when it has fewer than two headings", () => {
    const oneHeading = "## Doctrine\n\nonly one section here.";
    expect(sliceSelf(oneHeading)).toBe(oneHeading.trim());
  });
});

describe("buildPayload slim path (3-AGNT/4-SAGT)", () => {
  const operator = buildPayload({ ...COMMON, slim: false });
  const slim = buildPayload({ ...COMMON, slim: true });

  test("slim omits the USER block; operator keeps it", () => {
    expect(operator).toContain("<mind:user>");
    expect(slim).not.toContain("<mind:user>");
  });

  test("slim carries only the Doctrine SELF slice, not the full worldview", () => {
    expect(slim).toContain("<mind:self>");
    expect(slim).toContain("Motion is the metric");
    expect(slim).not.toContain("## Motifs");
    expect(slim).not.toContain("## How we work");
    // Operator keeps the whole SELF.
    expect(operator).toContain("## Motifs");
    expect(operator).toContain("## How we work");
  });

  test("slim still injects constitution(s), NOW, and brief-relevant evidence", () => {
    expect(slim).toContain("<mind:constitution>");
    expect(slim).toContain("<mind:constitution-josh>");
    expect(slim).toContain("<mind:now>");
    expect(slim).toContain("<mind:session-evidence>");
  });

  test("slim omits the portfolio block (operator-only framing)", () => {
    const withPortfolio = buildPayload({ ...COMMON, slim: false, portfolio: "<mind:portfolio>\nHouse in flight\n</mind:portfolio>" });
    expect(withPortfolio).toContain("<mind:portfolio>");
    expect(slim).not.toContain("<mind:portfolio>");
  });

  test("slim carries the greeting as data, never a greeting mandate", () => {
    expect(slim).toContain("<mind:greeting>");
    expect(slim).not.toContain("<mind:greeting-instruction>");
  });

  test("slim payload is materially smaller than the full operator payload", () => {
    expect(slim.length).toBeLessThan(operator.length);
  });
});

describe("buildPayload operator path unchanged (regression guard)", () => {
  test("operator payload contains SELF, USER, NOW, evidence, greeting", () => {
    const operator = buildPayload({ ...COMMON, slim: false });
    expect(operator).toContain("<mind:self>");
    expect(operator).toContain("<mind:user>");
    expect(operator).toContain("<mind:now>");
    expect(operator).toContain("<mind:session-evidence>");
    expect(operator).toContain("<mind:greeting>");
    expect(operator).toContain("Good morning");
  });

  test("empty greeting omits the mind:greeting block", () => {
    const payload = buildPayload({ ...COMMON, greeting: "", slim: false });
    expect(payload).not.toContain("<mind:greeting>");
  });

  // Replaces "a fleet worker without a tier keeps the full worldview (skip
  // greeting only)" — that test guarded per-role greeting suppression, a
  // concept deleted with the mandate itself (session-lifecycle law 1: adapters
  // inject data, never behavior). What is worth guarding now is the law: NO
  // payload shape may carry a behavioral instruction, so there is nothing left
  // to suppress per role.
  test("no payload shape carries a behavioral mandate", () => {
    for (const opts of [
      { slim: false },
      { slim: true },
      { slim: false, killSwitch: true },
      { slim: true, killSwitch: true },
    ]) {
      const payload = buildPayload({ ...COMMON, ...opts });
      const shape = JSON.stringify(opts);
      expect(payload, shape).not.toContain("<mind:greeting-instruction>");
      expect(payload, shape).not.toContain("<mind:fleet-worker>");
      expect(payload, shape).not.toContain("Open your FIRST reply");
      expect(payload, shape).not.toContain("Do NOT speak a wake greeting");
    }
  });

  test("wake.ts keeps no greeting-suppression machinery", () => {
    expect(WAKE_SRC).not.toContain("CIRCADIAN_SKIP_GREETING");
    expect(WAKE_SRC).not.toContain("skipGreeting");
  });
});
