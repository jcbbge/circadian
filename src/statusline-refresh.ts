/**
 * statusline-refresh.ts — producers poke the statusline cache.
 *
 * The statusline is read by bin/circadian-statusline, which only reads bytes
 * from logs/.statusline and never computes. Something has to write that file.
 *
 * The answer is: whoever changed the state. wake / graze checkpoint / sleep /
 * rem all already run at the moment the vitals change, and they run at HUMAN
 * frequency (per session, per 15-min checkpoint, twice daily) — not at render
 * frequency. So the ~230ms buildLine() cost is paid a few times an hour
 * instead of 459 times an hour, and it is paid OFF the critical path.
 *
 * Deliberately a detached spawn rather than an import: sleep.ts and graze.ts
 * importing status.ts would drag its whole dependency graph into two hot
 * entry points and risk an import cycle. A fire-and-forget child keeps the
 * producers ignorant of how the line is built.
 */

import { spawn } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";

const CIRCADIAN_HOME = process.env.CIRCADIAN_HOME || join(homedir(), "circadian");
const BUN_BIN = process.env.CIRCADIAN_BUN_BIN || join(homedir(), ".bun/bin/bun");

/** Fire-and-forget refresh of logs/.statusline. Never throws, never waits,
 * never keeps the parent alive. Off via CIRCADIAN_STATUSLINE_CACHE=off. */
export function refreshStatusline(): void {
  if (process.env.CIRCADIAN_STATUSLINE_CACHE === "off") return;
  try {
    const child = spawn(
      BUN_BIN,
      ["run", join(CIRCADIAN_HOME, "src/status.ts"), "--line", "--write-cache"],
      { detached: true, stdio: "ignore", env: { ...process.env, CIRCADIAN_HOME } }
    );
    child.unref();
  } catch {
    /* the statusline is a convenience, never a dependency */
  }
}
