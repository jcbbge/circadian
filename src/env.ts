// Shared startup configuration for CLI, hooks and scheduled workers.
// Plain KEY=VALUE only: never execute or expand the contents of a secret file.
import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { degraded } from "./obs.ts";

const file = process.env.CIRCADIAN_ENV_FILE || join(homedir(), ".config", "circadian", "env");
try {
  const stat = statSync(file);
  if (stat.mode & 0o044) {
    degraded({
      process: "ops", phase: "env-permissions",
      summary: "circadian env file is group- or world-readable",
      cause: `${file} has permissions ${ (stat.mode & 0o777).toString(8) }`,
      next_action: `chmod 600 ${file}`,
      context: { file, mode: (stat.mode & 0o777).toString(8) },
    });
  }
  for (const [index, line] of readFileSync(file, "utf8").split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) throw new Error(`invalid KEY=VALUE at ${file}:${index + 1}`);
    if (!Object.hasOwn(process.env, match[1])) process.env[match[1]] = match[2];
  }
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
}

/** The bearer key for the model endpoint. CIRCADIAN_LLM_API_KEY wins; otherwise a proxy token pair
 * (MODAL_PROXY_TOKEN_ID + MODAL_PROXY_TOKEN_SECRET) is joined as "<id>.<secret>"; then the legacy local key. */
export function llmApiKey(env: NodeJS.ProcessEnv = process.env): string {
  if (env.CIRCADIAN_LLM_API_KEY) return env.CIRCADIAN_LLM_API_KEY;
  if (env.MODAL_PROXY_TOKEN_ID && env.MODAL_PROXY_TOKEN_SECRET) return `${env.MODAL_PROXY_TOKEN_ID}.${env.MODAL_PROXY_TOKEN_SECRET}`;
  return env.LOCAL_LLM_API_KEY || "local";
}
