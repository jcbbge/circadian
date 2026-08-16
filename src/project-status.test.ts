import { describe, test, expect } from "bun:test";
import {
  parseActiveProjects,
  mergeProjects,
  renderPortfolio,
  extractFlightPlan,
  latestRemSummary,
  PAUSED_SLUGS,
  type PortfolioInput,
} from "./project-status.ts";
import type { ScoreEvent } from "./status.ts";

const AGENTS_FIXTURE = `
## Active projects

| Project | Path | Context lives in |
|---|---|---|
| Arc (event sales) | \`~/Infinity/arc/\` | repo AGENTS.md |
| Strudel + evals | \`~/strudel/\`, \`~/evals/\` | repo docs |

## Retired — never reference
`;

describe("parseActiveProjects", () => {
  test("reads the Active projects table", () => {
    const projects = parseActiveProjects(AGENTS_FIXTURE);
    expect(projects.length).toBe(2);
    expect(projects[0].name).toContain("Arc");
  });

  test("mergeProjects prepends house and drops paused strudel", () => {
    const merged = mergeProjects(parseActiveProjects(AGENTS_FIXTURE));
    expect(merged[0].slug).toBe("house");
    expect(merged.some((p) => PAUSED_SLUGS.has(p.slug) || p.slug.includes("strudel"))).toBe(false);
    expect(merged.some((p) => p.slug.includes("arc") || p.name.includes("Arc"))).toBe(true);
  });
});

describe("renderPortfolio — yesterday / 7d / this week", () => {
  const nowMs = Date.parse("2026-08-16T18:00:00.000Z");
  const input: PortfolioInput = {
    projects: mergeProjects(parseActiveProjects(AGENTS_FIXTURE)),
    episodes: [
      {
        file: "2026-08-15-herdr-tup-alignment.md",
        date: "2026-08-15",
        arc: "herdr-tup alignment",
        text: "agent-core circadian herdr",
      },
      {
        file: "2026-08-14-write-gate.md",
        date: "2026-08-14",
        arc: "write-gate finalization",
        text: "agent-core tower write-gate",
      },
      {
        file: "2026-08-10-arc-catalog.md",
        date: "2026-08-10",
        arc: "Arc catalog",
        text: "Infinity/arc catalog",
      },
    ],
    commits: [
      { project: "House (agent-core / circadian)", day: "2026-08-15", subject: "feat(rules): worktree lifecycle" },
      { project: "Arc (event sales)", day: "2026-08-14", subject: "fix(arc/web): For reactivity" },
    ],
    index: null,
    nowMd: `## Flight plan

Implement project-status for wake.

## Live tensions

- Strudel paused — do not surface
- Push-on-green not firing

## Last sleep

2026-08-16T17:16:12.363Z
`,
    scoreboard: [
      { ts: "2026-08-16T02:00:28.852Z", type: "rem", worldview_tokens: 5284, self_changed: true, stacked: 1, bumped: 3 },
    ] as ScoreEvent[],
    nowMs,
  };

  test("yesterday is previous calendar day only", () => {
    const slice = renderPortfolio(input);
    expect(slice.reason).toBe("rendered");
    expect(slice.yesterday.every((i) => i.day === "2026-08-15")).toBe(true);
    expect(slice.yesterday.length).toBeGreaterThan(0);
    expect(slice.block).toContain("**Yesterday**");
  });

  test("last 7 days covers the week window", () => {
    const slice = renderPortfolio(input);
    expect(slice.last7.some((i) => i.day === "2026-08-14")).toBe(true);
    expect(slice.last7.every((i) => i.day >= "2026-08-09")).toBe(true);
    expect(slice.block).toContain("**Last 7 days**");
  });

  test("this week forward pulls flight plan + tensions", () => {
    const slice = renderPortfolio(input);
    expect(slice.forward.some((f) => f.includes("project-status"))).toBe(true);
    expect(slice.forward.some((f) => /push-on-green|Strudel paused/i.test(f))).toBe(true);
    expect(slice.block).toContain("**This week — push forward**");
  });

  test("strudel never appears in Active line", () => {
    const slice = renderPortfolio(input);
    const active = slice.block.match(/\*\*Active\*\*\n([\s\S]*?)(?=\n<\/mind:portfolio>|\n\*\*)/);
    expect(active?.[1] ?? "").not.toMatch(/Strudel/i);
    expect(slice.block).toContain("Arc (event sales)");
  });

  test("extractFlightPlan and rem summary still work", () => {
    expect(extractFlightPlan(input.nowMd)).toContain("project-status");
    expect(latestRemSummary(input.scoreboard)).toContain("SELF changed");
  });
});
