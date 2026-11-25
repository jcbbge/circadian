import { expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importLane, landLane } from "./lane.ts";
import { approvedMindPath, exportMind } from "./mind-transfer.ts";

const git = (repo: string, ...args: string[]) =>
  execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const row = (n: number) => JSON.stringify({ ev: "decay", factor: 0.95, ts: `2026-11-0${n}T00:00:00Z` });
const digested = (n: number) => JSON.stringify({ file: `episode-${n}.md`, ts: `2026-11-0${n}T00:00:00Z` });

test("land a projected mind on a local lane, with both ledgers unioned and re-import harmless", () => {
  const root = fs.mkdtempSync(join(tmpdir(), "circadian-lane-import-"));
  const mind = join(root, "mind"), sender = join(root, "sender"), transfer = join(root, "transfer.git");
  const exportRef = "refs/circadian/export/m5", importRef = "refs/circadian/import/m5";
  try {
    for (const [repo, id] of [[mind, 2], [sender, 3]] as const) {
      fs.mkdirSync(join(repo, "episodes"), { recursive: true });
      git(repo, "init", "-q", "-b", "main");
      git(repo, "config", "user.name", "Import Fixture");
      git(repo, "config", "user.email", "import@invalid");
      fs.writeFileSync(join(repo, "USER.md"), `private ${id}\n`);
      fs.writeFileSync(join(repo, "scopes.tsv"), `local scope fixture ${id}\n`);
      fs.writeFileSync(join(repo, "beliefs.jsonl"), row(1) + "\n" + row(id) + "\n");
      fs.writeFileSync(join(repo, "digested.jsonl"), digested(1) + "\n" + digested(id) + "\n");
      fs.writeFileSync(join(repo, `episodes/episode-${id}.md`), `episode ${id}\n`);
      git(repo, "add", ".");
      git(repo, "commit", "-qm", "local fixture");
    }
    fs.mkdirSync(transfer);
    git(transfer, "init", "-q", "--bare");
    const old = git(mind, "rev-parse", "HEAD"), source = git(sender, "rev-parse", "HEAD");
    const first = exportMind(sender, "m5");
    const deliver = () => {
      git(sender, "push", transfer, `${exportRef}:${exportRef}`);
      git(mind, "fetch", "--no-tags", transfer, `${exportRef}:${importRef}`);
    };
    deliver();
    fs.writeFileSync(join(sender, "episodes/new.md"), "another approved episode\n");
    git(sender, "add", "episodes/new.md");
    git(sender, "commit", "-qm", "new episode");
    const second = exportMind(sender, "m5");
    expect(second).not.toBe(first);
    git(sender, "merge-base", "--is-ancestor", first, second);
    deliver();
    const history = git(transfer, "rev-list", exportRef).split("\n");
    expect(history).toEqual([second, first]);
    for (const commit of history) {
      const paths = git(transfer, "ls-tree", "-r", "--name-only", commit).split("\n");
      expect(paths.every(approvedMindPath)).toBe(true);
    }
    expect(git(transfer, "for-each-ref", "--format=%(refname)")).toBe(exportRef);
    for (const expr of [source, git(sender, "rev-parse", "HEAD:USER.md")]) {
      expect(spawnSync("git", ["-C", transfer, "cat-file", "-e", expr]).status).not.toBe(0);
    }

    const preserve = { preserveLocalScopes: true };
    const cli = (...args: string[]) => Bun.spawnSync([process.execPath, join(import.meta.dir, "archaeology.ts"),
      "lane", ...args, "--preserve-local-scopes", "--mind", mind], { env: { ...process.env, CIRCADIAN_HOME: root } });
    // Ordinary land still needs a clean mind. The transfer option never accepts staged edits.
    fs.appendFileSync(join(mind, "scopes.tsv"), "uncommitted\n");
    expect(() => importLane(mind, "m5")).toThrow("dirty worktree");
    git(mind, "add", "--", "scopes.tsv");
    expect(() => importLane(mind, "m5", preserve)).toThrow("dirty worktree");
    expect(git(mind, "branch", "--list", "fm/m5")).toBe("");
    git(mind, "restore", "--staged", "--", "scopes.tsv");
    fs.writeFileSync(join(mind, "other-local.txt"), "untracked fixture\n");
    expect(() => importLane(mind, "m5", preserve)).toThrow("dirty worktree");
    fs.unlinkSync(join(mind, "other-local.txt"));
    expect(git(mind, "rev-parse", "HEAD")).toBe(old);
    const scopeDiff = git(mind, "diff", "--", "scopes.tsv");
    const scopeIndex = git(mind, "ls-files", "--stage", "--", "scopes.tsv");
    git(mind, "config", "merge.autoStash", "true");

    const imported = cli("import", "m5");
    expect(imported.stderr.toString()).not.toContain("lane operation failed");
    expect(imported.exitCode).toBe(0);
    expect(imported.stdout.toString()).toContain("imported fm/m5; ready to land");
    git(mind, "merge-base", "--is-ancestor", old, "fm/m5");
    expect(fs.existsSync(join(mind, "episodes/new.md"))).toBe(false);
    expect(() => landLane(mind, "m5")).toThrow("dirty worktree");
    const merged = cli("land", "m5");
    expect(merged.stderr.toString()).not.toContain("lane operation failed");
    expect(merged.exitCode).toBe(0);
    expect(merged.stdout.toString()).toContain("landed fm/m5");
    git(mind, "merge-base", "--is-ancestor", old, "main");
    git(mind, "merge-base", "--is-ancestor", "fm/m5", "main");
    expect(fs.readFileSync(join(mind, "episodes/new.md"), "utf8")).toBe("another approved episode\n");
    expect(fs.readFileSync(join(mind, "USER.md"), "utf8")).toBe("private 2\n");
    expect(fs.readFileSync(join(mind, "scopes.tsv"), "utf8")).toBe("local scope fixture 2\nuncommitted\n");
    expect(git(mind, "diff", "--", "scopes.tsv")).toBe(scopeDiff);
    expect(git(mind, "ls-files", "--stage", "--", "scopes.tsv")).toBe(scopeIndex);
    expect(git(mind, "diff", "--cached", "--name-only")).toBe("");
    expect(git(mind, "for-each-ref", "refs/stash")).toBe("");
    const landed = git(mind, "rev-parse", "main");
    git(mind, "worktree", "remove", join(root, "mind-lanes", "m5"));
    expect(importLane(mind, "m5", preserve)).toBe(false);
    expect(git(mind, "rev-parse", "main")).toBe(landed);
    expect(git(mind, "rev-list", "main").split("\n")).not.toContain(source);
    expect(git(mind, "show", "main:beliefs.jsonl").split("\n")).toEqual([row(1), row(2), row(3)]);
    expect(git(mind, "show", "main:digested.jsonl").split("\n")).toEqual([1, 2, 3].map(digested));
    expect(git(mind, "remote")).toBe("");

    git(mind, "update-ref", "refs/circadian/import/hive", old);
    expect(() => importLane(mind, "hive", preserve)).toThrow("non-approved object");
    expect(git(mind, "rev-parse", "main")).toBe(landed);
    expect(git(mind, "branch", "--list", "fm/hive")).toBe("");

    const lane = join(root, "mind-lanes", "m5");
    fs.appendFileSync(join(lane, "scopes.tsv"), "lane must not touch scopes\n");
    git(lane, "commit", "-qm", "machine-local lane change", "--", "scopes.tsv");
    expect(() => landLane(mind, "m5", preserve)).toThrow("machine-local path");
    expect(git(mind, "rev-parse", "main")).toBe(landed);
    expect(git(mind, "diff", "--", "scopes.tsv")).toBe(scopeDiff);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
