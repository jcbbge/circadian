/** Optional local capabilities. Missing config preserves Circadian's defaults. */
import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

export type ExtensionsStatus = { views: boolean; error?: string };

function readConfig(home: string): Record<string, unknown> {
  const file = path.join(home, "extensions.json");
  let stat: fs.Stats;
  try { stat = fs.lstatSync(file); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}; throw error; }
  if (!stat.isFile() || stat.size > 65536) throw new Error("expected a regular config file of at most 64 KiB");
  let config: unknown;
  try { config = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { throw new Error("extensions.json must contain valid JSON"); }
  if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("expected a JSON object");
  const values = config as Record<string, unknown>;
  if (values.views !== undefined && typeof values.views !== "boolean") throw new Error("views must be true or false");
  return values;
}

export function readExtensions(home: string): ExtensionsStatus {
  try { return { views: readConfig(home).views === true }; }
  catch { return { views: false, error: `Cannot read ${path.join(home, "extensions.json")}; use a regular JSON object with a boolean views field.` }; }
}

export function requireViews(home: string): void {
  const status = readExtensions(home);
  if (status.error) throw new Error(status.error);
  if (!status.views) throw new Error("Coordinated views are disabled; run circadian extensions enable views.");
}

export function setViewsEnabled(home: string, enabled: boolean): { views: boolean } {
  // Read before writing: a malformed existing file is never silently replaced.
  const config = readConfig(home);
  if (typeof enabled !== "boolean") throw new Error("views must be true or false");
  const file = path.join(home, "extensions.json");
  const temporary = `${file}.${randomUUID()}.tmp`;
  fs.mkdirSync(home, { recursive: true });
  try {
    fs.writeFileSync(temporary, JSON.stringify({ ...config, views: enabled }, null, 2) + "\n", { mode: 0o600, flag: "wx" });
    fs.renameSync(temporary, file);
  } finally { fs.rmSync(temporary, { force: true }); }
  return { views: enabled };
}
