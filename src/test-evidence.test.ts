import { describe, test, expect } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { repoRoot, missingMindFilesAt, missingMindRevisionAt, missingMindHistory, evidenceName } from "./test-evidence.ts";

describe("test evidence gates", () => {
  test("root is this checkout, regardless of cwd and CIRCADIAN_HOME", () => {
    expect(repoRoot).toBe(path.resolve(import.meta.dir, ".."));
  });

  test("a missing snapshot skips with a named reason; a complete snapshot runs", () => {
    const dir = fs.mkdtempSync(path.join(tmpdir(), "circadian-evidence-test-"));
    try {
      expect(missingMindFilesAt(dir, "SELF.md")).toBe("missing mind/SELF.md");
      expect(missingMindRevisionAt(dir, "HEAD", "SELF.md")).toContain("missing mind git repository");
      expect(missingMindHistory("SELF.md", dir)).toBe("missing mind/.git");
      execFileSync("git", ["init", "-q", dir]);
      fs.writeFileSync(path.join(dir, "SELF.md"), "original\n");
      execFileSync("git", ["-C", dir, "add", "SELF.md"]);
      execFileSync("git", ["-C", dir, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture"]);
      const rev = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
      expect(missingMindRevisionAt(dir, rev, "SELF.md")).toBe("");
      expect(missingMindRevisionAt(dir, rev, "episodes/not-here.md")).toContain("episodes/not-here.md");
      expect(missingMindRevisionAt(dir, "0000000", "SELF.md")).toContain("0000000");
      expect(missingMindHistory("SELF.md", dir)).toBe("");
      expect(missingMindHistory("episodes/not-here.md", dir)).toBe("missing mind git history for episodes/not-here.md");
      expect(evidenceName("snapshot", "missing mind/SELF.md")).toContain("[SKIP: missing mind/SELF.md]");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
