import { test, expect } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportMind } from "./mind-transfer.ts";
import { send, receive } from "./join-sync.ts";

function git(repo: string, ...args: string[]): string {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function commit(repo: string, path: string, data: string): void {
  writeFileSync(join(repo, path), data);
  git(repo, "add", "--", path);
  git(repo, "-c", "user.name=Test", "-c", "user.email=test@localhost", "commit", "-m", path);
}
test("bare relay admits only additive approved projections, rejects private trees and unrelated refs", () => {
  const dir = mkdtempSync(join(tmpdir(), "circadian-relay-"));
  try {
    const relay = join(dir, "relay.git"), m5 = join(dir, "m5"), hive = join(dir, "hive");
    for (const repo of [m5, hive]) {
      mkdirSync(repo);
      git(repo, "init", "-b", "main");
      commit(repo, "USER.md", repo === m5 ? "m5 private\n" : "hive private\n");
    }
    expect(spawnSync("bun", [join(import.meta.dir, "join-relay.ts"), "init", relay]).status).toBe(0);
    expect(statSync(relay).mode & 0o777).toBe(0o700);
    commit(m5, "digested.jsonl", "{\"ep\":\"one\"}\n");
    const original = git(m5, "rev-parse", "HEAD");
    const first = exportMind(m5, "m5");
    expect(() => send(m5, "m5", relay)).toThrow("explicit SSH URL");
    git(m5, "push", relay, "refs/circadian/export/m5:refs/circadian/export/m5");
    expect(git(relay, "rev-parse", "refs/circadian/export/m5")).toBe(first);
    expect(git(relay, "ls-tree", "-r", "--name-only", first)).toBe("digested.jsonl");
    expect(spawnSync("git", ["-C", m5, "merge-base", "--is-ancestor", original, first]).status).toBe(1);
    expect(receive(hive, "m5", relay)).toBe(first);
    expect(git(hive, "remote")).toBe("");
    commit(m5, "digested.jsonl", "{\"ep\":\"two\"}\n");
    const second = exportMind(m5, "m5");
    git(m5, "push", relay, "refs/circadian/export/m5:refs/circadian/export/m5");
    expect(spawnSync("git", ["-C", relay, "merge-base", "--is-ancestor", first, second]).status).toBe(0);
    expect(receive(hive, "m5", relay)).toBe(second);
    expect(git(hive, "show", "HEAD:USER.md")).toBe("hive private");
    expect(spawnSync("git", ["-C", m5, "push", relay, "HEAD:refs/circadian/export/hive"]).status).not.toBe(0);
    const forged = git(m5, "-c", "user.name=Test", "-c", "user.email=test@localhost",
      "commit-tree", `${first}^{tree}`, "-m", "private source metadata");
    expect(spawnSync("git", ["-C", m5, "push", relay, `${forged}:refs/circadian/export/hive`]).status).not.toBe(0);
    expect(send(hive, "hive", relay)).toBe(git(relay, "rev-parse", "refs/circadian/export/hive"));
    expect(spawnSync("git", ["-C", m5, "push", relay, "HEAD:refs/circadian/export/m5"]).status).not.toBe(0);
    expect(spawnSync("git", ["-C", m5, "push", relay, "HEAD:refs/heads/main"]).status).not.toBe(0);
    expect(git(relay, "rev-parse", "refs/circadian/export/m5")).toBe(second);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
