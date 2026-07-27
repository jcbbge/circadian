#!/usr/bin/env bun
/**
 * gauntlet-stub-payload.ts — the default gauntlet payload.
 *
 * The stacker (src/stack.ts) does not exist yet (WS-C builds it later). The
 * gauntlet harness must be testable today, so this is a no-op stand-in: it
 * confirms every episode filename it was handed is actually readable from
 * the sandbox mind gauntlet.ts built, prints what it saw, and exits 0. Once
 * the real stacker exists it plugs in as `--payload src/stack.ts` — same
 * argv contract (sandboxHome, then batch filenames), same sandbox env.
 */
import * as fs from "fs";
import * as path from "path";

const [sandboxHome, ...filenames] = process.argv.slice(2);

if (!sandboxHome) {
  console.error("gauntlet-stub-payload: expected sandboxHome as the first argument");
  process.exit(1);
}

for (const f of filenames) {
  const p = path.join(sandboxHome, "mind", "episodes", f);
  const present = fs.existsSync(p);
  console.log(`stub-payload: ${f} — ${present ? "present" : "MISSING"} in sandbox mind/episodes/`);
  if (!present) process.exit(1);
}

console.log(`stub-payload: batch of ${filenames.length} episode(s) processed (no-op)`);
