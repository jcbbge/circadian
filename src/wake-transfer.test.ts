import { expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportMind, HIVE_FETCH_MS } from "./mind-transfer.ts";

const git = (repo: string, ...args: string[]) =>
  execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

test("the wake fetches exactly hive's export and renders local files even if SSH fails or stalls", () => {
  const home = fs.mkdtempSync(join(tmpdir(), "circadian-wake-transfer-"));
  const mind = join(home, "mind"), hive = join(home, "hive"), transfer = join(home, "transfer.git");
  const exportRef = "refs/circadian/export/hive", importRef = "refs/circadian/import/hive";
  try {
    for (const repo of [mind, hive]) {
      fs.mkdirSync(join(repo, "episodes"), { recursive: true });
      git(repo, "init", "-q", "-b", "main");
      git(repo, "config", "user.name", "Wake Fixture");
      git(repo, "config", "user.email", "wake@invalid");
      fs.writeFileSync(join(repo, "USER.md"), "## Corrections\nLocal correction only.\n");
      fs.writeFileSync(join(repo, "LETTER.md"), "Last local letter.\n");
      fs.writeFileSync(join(repo, "NOW.md"), "## Next move\nLast local arc.\n");
      fs.writeFileSync(join(repo, "scoreboard.jsonl"), JSON.stringify({ type: "wake", ts: new Date().toISOString() }) + "\n");
      git(repo, "add", ".");
      git(repo, "commit", "-qm", "local fixture");
    }
    fs.mkdirSync(transfer);
    git(transfer, "init", "-q", "--bare");
    fs.writeFileSync(join(hive, "episodes", "hive.md"), "Approved hive episode.\n");
    git(hive, "add", "episodes/hive.md");
    git(hive, "commit", "-qm", "hive episode");
    const exportTip = exportMind(hive, "hive");
    git(hive, "push", transfer, `${exportRef}:${exportRef}`);
    git(transfer, "tag", "not-part-of-the-transfer", exportTip);
    git(mind, "config", "--local", "circadian.hiveTransfer", "ssh://fixture/transfer.git");
    fs.appendFileSync(join(mind, "LETTER.md"), "Staged line.\n");
    git(mind, "add", "LETTER.md");
    fs.appendFileSync(join(mind, "LETTER.md"), "Unstaged line.\n");
    fs.writeFileSync(join(mind, "untracked"), "untouched untracked bytes");
    const snapshot = () => ({
      head: git(mind, "rev-parse", "HEAD"),
      branch: git(mind, "branch", "--show-current"),
      index: fs.readFileSync(join(mind, ".git", "index")).toString("base64"),
      staged: git(mind, "diff", "--cached", "--binary"),
      unstaged: git(mind, "diff", "--binary"),
      status: git(mind, "--no-optional-locks", "status", "--porcelain=v2", "--untracked-files=all"),
      untracked: fs.readFileSync(join(mind, "untracked"), "utf8"),
    });
    const before = snapshot();
    const refsBefore = git(mind, "show-ref");
    const shim = join(home, "ssh-fixture");
    fs.writeFileSync(shim, '#!/bin/sh\ncase "$TEST_SSH_MODE" in\n  fail) exit 1 ;;\n  stall) sleep 20 ;;\n  *) exec git upload-pack "$TEST_TRANSFER_REPO" ;;\nesac\n', { mode: 0o700 });
    const runWake = (mode: string) => {
      const start = performance.now();
      const r = spawnSync(process.execPath, [join(import.meta.dir, "wake.ts")], { cwd: home, input: "", encoding: "utf8", timeout: HIVE_FETCH_MS + 2500,
        env: { ...process.env, HOME: home, CIRCADIAN_HOME: home, CIRCADIAN_ROLE: "", CIRCADIAN_INTERNAL: "0",
          CIRCADIAN_INBOX_SKIP: "1", CIRCADIAN_INVOCATION_LEDGER: "off", GIT_SSH_COMMAND: shim, GIT_SSH_VARIANT: "simple",
          TEST_TRANSFER_REPO: transfer, TEST_SSH_MODE: mode } });
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("Last local letter.");
      expect(r.stdout).toContain("Last local arc.");
      expect(r.stdout).toContain("Local correction only.");
      expect(r.stdout).not.toContain("Approved hive episode.");
      expect(snapshot()).toEqual(before);
      expect(git(mind, "remote")).toBe("");
      expect(fs.existsSync(join(mind, ".git", "FETCH_HEAD"))).toBe(false);
      expect(git(mind, "for-each-ref", "--format=%(refname)", "refs/circadian/pending")).toBe("");
      return { elapsed: performance.now() - start, stderr: r.stderr };
    };
    runWake("ok");
    expect(git(mind, "rev-parse", importRef)).toBe(exportTip);
    const refsAfter = git(mind, "show-ref");
    expect(refsAfter.split("\n").filter(line => !line.endsWith(" " + importRef)).join("\n")).toBe(refsBefore);
    expect(runWake("fail").stderr).toContain("hive transfer unavailable; wake uses the last local mind");
    const stalled = runWake("stall");
    expect(stalled.stderr).toContain("hive transfer unavailable; wake uses the last local mind");
    expect(stalled.elapsed).toBeGreaterThanOrEqual(HIVE_FETCH_MS - 100);
    expect(stalled.elapsed).toBeLessThan(HIVE_FETCH_MS + 2000);
    expect(git(mind, "show-ref")).toBe(refsAfter);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});
