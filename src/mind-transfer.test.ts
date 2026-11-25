import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportMind } from "./mind-transfer.ts";

test("projected histories in both directions contain no local USER, refs or original ancestry", () => {
  const root = fs.mkdtempSync(join(tmpdir(), "mind-transfer-"));
  try {
    const paths = { hive: join(root, "hive"), m5: join(root, "m5") };
    const git = (side: keyof typeof paths, ...args: string[]) => {
      const r = spawnSync("git", ["-C", paths[side], ...args], { encoding: "utf8" });
      if (r.status !== 0) throw new Error(r.stderr);
      return r.stdout.trim();
    };
    const tip: Record<string, string> = {}, privateBlobs: string[] = [];
    for (const side of ["hive", "m5"] as const) {
      fs.mkdirSync(paths[side]);
      git(side, "init", "-q", "-b", "main");
      git(side, "config", "user.name", "Transfer Fixture");
      git(side, "config", "user.email", "fixture@invalid");
      const file = (path: string, text: string) => fs.writeFileSync(join(paths[side], path), text);
      fs.mkdirSync(join(paths[side], "episodes"));
      file("USER.md", "old private " + side);
      file("SELF.md", "local render " + side);
      file("episodes/" + side + ".md", "approved episode");
      git(side, "add", ".");
      git(side, "commit", "-qm", "first local commit");
      privateBlobs.push(git(side, "rev-parse", "HEAD:USER.md"));
      git(side, "rm", "-q", "USER.md");
      git(side, "commit", "-qm", "retire old local USER");
      file("USER.md", "new private " + side);
      git(side, "add", "USER.md");
      git(side, "commit", "-qm", "new local USER");
      privateBlobs.push(git(side, "rev-parse", "HEAD:USER.md"));
      file("SELF.md", "uncommitted local render " + side);
      const first = exportMind(paths[side], side);
      expect(exportMind(paths[side], side)).toBe(first);
      file("episodes/later.md", "second approved episode");
      git(side, "add", "episodes/later.md");
      git(side, "commit", "-qm", "second local record");
      tip[side] = git(side, "rev-parse", "HEAD");
      const second = exportMind(paths[side], side);
      expect(git(side, "rev-parse", second + "^")).toBe(first);
      expect(git(side, "rev-parse", "HEAD")).toBe(tip[side]);
      expect(fs.readFileSync(join(paths[side], "SELF.md"), "utf8")).toBe("uncommitted local render " + side);
    }
    for (const [from, to] of [["hive", "m5"], ["m5", "hive"]] as const) {
      const before = git(to, "cat-file", "--batch-all-objects", "--batch-check=%(objectname)").split("\n");
      const ref = "refs/circadian/incoming/" + from;
      git(to, "fetch", "-q", "--no-tags", paths[from], "refs/circadian/export/" + from + ":" + ref);
      const received = git(to, "cat-file", "--batch-all-objects", "--batch-check=%(objectname)").split("\n")
        .filter(id => !before.includes(id));
      const reachable = git(to, "rev-list", "--objects", ref);
      for (const blob of privateBlobs) {
        expect(reachable).not.toContain(blob);
        expect(received).not.toContain(blob);
      }
      for (const commit of git(to, "rev-list", ref).split("\n")) {
        const names = git(to, "ls-tree", "-r", "--name-only", commit);
        expect(names).not.toContain("SELF.md");
        expect(names).not.toContain("USER.md");
      }
      expect(reachable).not.toContain(tip[from]);
      expect(git(to, "rev-parse", "HEAD")).toBe(tip[to]);
    }
    // A copy of an old USER blob under an approved name still cannot leave.
    fs.writeFileSync(join(paths.hive, "episodes", "alias.md"), "old private hive");
    git("hive", "add", "episodes/alias.md");
    git("hive", "commit", "-qm", "unsafe copied private blob");
    expect(() => exportMind(paths.hive, "hive")).toThrow("machine-local object");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
