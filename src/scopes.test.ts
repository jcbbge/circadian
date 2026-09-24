import { test, expect } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { resolveScope, sessionLocation, readScopes, scopedView, scopeNowPath, tagEpisode, HERE_TOKENS, ELSEWHERE_TOKENS } from "./scopes.ts";
import { buildPayload } from "./wake-payload.ts";
import { renderPortfolioFromMind } from "./project-status.ts";

function sandbox(fn: (dir: string, mind: string) => void) {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "scope-test-"));
  const mind = path.join(dir, "mind");
  fs.mkdirSync(path.join(mind, "episodes"), { recursive: true });
  try { fn(dir, mind); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
function seed(mind: string, dir: string) {
  fs.writeFileSync(path.join(mind, "scopes.tsv"), `arc\t${dir}/arc\tactive\ncircadian\t${dir}/circadian\tactive\npaused\t${dir}/paused\tpaused\n`);
  for (const slug of ["arc", "circadian", "paused"]) {
    fs.mkdirSync(path.join(dir, slug));
    fs.mkdirSync(path.join(mind, "now"), { recursive: true });
    fs.writeFileSync(path.join(mind, "now", slug + ".md"), `scope: ${slug}\n## Arc\n\n${slug} work\n## Last sleep\n\n2026-09-24T12:00:00Z\n`);
    fs.writeFileSync(path.join(mind, "episodes", `2026-09-24-${slug}.md`), `---\ndate: 2026-09-24\nscope: ${slug}\narc: ${slug} work landed\n---\nwhy: because evidence\n`);
  }
}

test("Accept when: an episode written from ~/concierge/work/t3-labor-fee carries scope: arc", () => sandbox((dir, mind) => {
  const main = path.join(dir, "arc"); fs.mkdirSync(main);
  const git = (args: string[], cwd = dir) => execFileSync("git", args, { cwd, stdio: "pipe" });
  git(["init", "-q", main]);
  git(["-C", main, "config", "user.email", "test@example.org"]);
  git(["-C", main, "config", "user.name", "test"]);
  fs.writeFileSync(path.join(main, "a"), "a"); git(["-C", main, "add", "a"]); git(["-C", main, "commit", "-qm", "init"]);
  const work = path.join(dir, "concierge/work/t3-labor-fee");
  fs.mkdirSync(path.dirname(work), { recursive: true });
  git(["-C", main, "worktree", "add", "-qb", "t3", work]);
  fs.writeFileSync(path.join(mind, "scopes.tsv"), `arc\t${main}\tactive\n`);
  expect(resolveScope(mind, work, "")).toBe("arc");
  const mainSubdir = path.join(main, "src");
  const workSubdir = path.join(work, "src");
  fs.mkdirSync(mainSubdir);
  fs.mkdirSync(workSubdir);
  expect(resolveScope(mind, mainSubdir, "")).toBe("arc");
  expect(resolveScope(mind, workSubdir, "")).toBe("arc");
  expect(sessionLocation(workSubdir)).toEqual({ cwd: workSubdir, git_toplevel: work, project_path: main });
  expect(sessionLocation(mainSubdir)).toEqual({ cwd: mainSubdir, git_toplevel: main, project_path: main });
  expect(sessionLocation(dir)).toEqual({ cwd: dir, git_toplevel: null, project_path: dir });
  const episode = tagEpisode("---\ndate: 2026-09-24\narc: labor fee\n---\n", resolveScope(mind, work, ""));
  expect(episode).toContain("scope: arc\n");
  expect(resolveScope(mind, dir, "")).toBe("global");
}));

test("Accept when: two sessions in two projects on one day leave two NOW files, and neither overwrote the other; reversed wakes show local detail and one-line remote receipt", () => sandbox((dir, mind) => {
  seed(mind, dir);
  // Two independent SessionEnd writes on the same day target distinct files.
  for (const scope of ["arc", "circadian"]) {
    const file = path.join(mind, scopeNowPath(scope));
    fs.writeFileSync(file, `scope: ${scope}\n## Arc\n\n${scope} work\n## Last sleep\n\n2026-09-24T12:00:00Z\n`);
  }
  expect(fs.readFileSync(path.join(mind, "now/arc.md"), "utf8")).not.toBe(fs.readFileSync(path.join(mind, "now/circadian.md"), "utf8"));
  const now = Date.parse("2026-09-24T13:00:00Z");
  const arc = scopedView(mind, "arc", now), circ = scopedView(mind, "circadian", now);
  expect(arc.now).toContain("arc work"); expect(circ.now).toContain("circadian work");
  fs.mkdirSync(path.join(mind, "beliefs"));
  fs.writeFileSync(path.join(mind, "beliefs", "a.md"), 'kind: doctrine\nclaim: "arc claim"\nwhy: "because evidence"\nquote: "a receipt" | 2026-09-24-arc.md\nscope: arc\n[ep:2026-09-24]\n');
  const withAtom = scopedView(mind, "arc", now);
  expect(withAtom.here).toContain("arc claim");
  expect(scopedView(mind, "circadian", now).here).not.toContain("arc claim");
  expect(arc.here).toContain("why: because evidence"); expect(arc.here).not.toContain("circadian work landed");
  expect(circ.here).toContain("circadian work landed"); expect(circ.here).not.toContain("arc work landed");
  expect(arc.elsewhere).toContain("circadian, 2026-09-24:");
  expect(circ.elsewhere).toContain("arc, 2026-09-24:");
  expect(arc.elsewhere).not.toContain("paused");
  expect(arc.elsewhere.split("\n")).toHaveLength(1);
  expect(arc.here.length).toBeLessThanOrEqual(HERE_TOKENS * 4);
  expect(arc.elsewhere.length).toBeLessThanOrEqual(ELSEWHERE_TOKENS * 4);
  expect(arc.elsewhere).toContain("[episode: 2026-09-24-circadian.md]");
  const payload = buildPayload({ self: "", user: "", now: circ.now, greeting: "", scope: "circadian", here: circ.here, elsewhere: circ.elsewhere });
  expect(payload.startsWith("Resolved scope: circadian")).toBe(true);
  expect(payload).toContain('<mind:here scope="circadian">'); expect(payload).toContain("<mind:elsewhere>");
  expect(payload.indexOf("<mind:now>")).toBeGreaterThan(payload.indexOf('<mind:here scope="circadian">'));
  expect(payload.indexOf("<mind:elsewhere>")).toBeGreaterThan(payload.indexOf("</mind:here>"));
  const worker = buildPayload({ self: "", user: "## Corrections\n\nAlways verify receipts.\n## Preferences\n\nKeep it short.", now: arc.now, greeting: "", scope: "arc", here: arc.here, elsewhere: arc.elsewhere, slim: true });
  expect(worker).not.toContain("<mind:elsewhere>");
  expect(worker).toContain("Always verify receipts.");
  expect(worker).not.toContain("Keep it short.");
  const global = scopedView(mind, "global", now);
  expect(global.here).toBe("");
  const globalPayload = buildPayload({ self: "", user: "private preferences", now: global.now, greeting: "", scope: "global", here: global.here, elsewhere: global.elsewhere });
  expect(globalPayload).not.toContain("private preferences");
  expect(globalPayload).toContain("arc,");
  const arcEpisode = path.join(mind, "episodes/2026-09-24-arc.md");
  fs.writeFileSync(arcEpisode, fs.readFileSync(arcEpisode, "utf8").replace("date: 2026-09-24\n", "date: 2026-09-24\nts: 2026-09-24T23:00:00Z\n"));
  expect(scopedView(mind, "circadian", Date.parse("2026-09-26T22:59:00Z")).elsewhere).toContain("arc,");
  expect(scopedView(mind, "circadian", Date.parse("2026-09-26T23:00:00Z")).elsewhere).not.toContain("arc,");
}));

test("Accept when: portfolio renders without ~/AGENTS.md using a mind-owned registry", () => sandbox((dir, mind) => {
  seed(mind, dir);
  expect(readScopes(mind)).toHaveLength(3);
  const registry = path.join(dir, "custom.tsv");
  fs.copyFileSync(path.join(mind, "scopes.tsv"), registry);
  const old = process.env.CIRCADIAN_REGISTRY;
  try {
    process.env.CIRCADIAN_REGISTRY = registry;
    expect(resolveScope(mind, path.join(dir, "arc"), "")).toBe("arc");
  } finally {
    if (old === undefined) delete process.env.CIRCADIAN_REGISTRY;
    else process.env.CIRCADIAN_REGISTRY = old;
  }
  const result = renderPortfolioFromMind({ circadianHome: dir, nowMs: Date.parse("2026-09-24T13:00:00Z"), includeGit: false });
  expect(result.reason).toBe("rendered");
  expect(result.block).toContain("arc");
  expect(result.block).not.toContain("paused");
}));
