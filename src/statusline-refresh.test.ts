import { test, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

test("a missing cache-refresh executable cannot crash its producer", () => {
  const home = mkdtempSync(join(tmpdir(), "circadian-refresh-"));
  try {
    const script = `import { refreshStatusline } from ${JSON.stringify(join(import.meta.dir, "statusline-refresh.ts"))}; refreshStatusline(); console.log("producer continues");`;
    const result = spawnSync(process.execPath, ["-e", script], {
      encoding: "utf8",
      env: { ...process.env, CIRCADIAN_HOME: home, CIRCADIAN_BUN_BIN: join(home, "missing-bun"), CIRCADIAN_STATUSLINE_CACHE: "on" },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("producer continues");
    expect(result.stderr).toBe("");
  } finally { rmSync(home, { recursive: true, force: true }); }
});
