// Test-only evidence gates. Never fall back to the author's home directory.
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

export const repoRoot = path.resolve(import.meta.dir, "..");
export const mindDir = path.join(repoRoot, "mind");

export function missingMindFiles(...files: string[]): string {
  return missingMindFilesAt(mindDir, ...files);
}

export function missingMindFilesAt(dir: string, ...files: string[]): string {
  const missing = files.filter((file) => !fs.existsSync(path.join(dir, file)));
  return missing.length ? `missing mind/${missing.join(", mind/")}` : "";
}

export function missingMindRevision(rev: string, ...files: string[]): string {
  return missingMindRevisionAt(mindDir, rev, ...files);
}

export function missingMindRevisionAt(dir: string, rev: string, ...files: string[]): string {
  if (!fs.existsSync(path.join(dir, ".git"))) return `missing mind git repository (revision ${rev})`;
  const paths = files.length ? files : [""];
  const missing = paths.filter((file) => {
    const object = file ? `${rev}:${file}` : `${rev}^{commit}`;
    return spawnSync("git", ["cat-file", "-e", object], { cwd: dir, stdio: "ignore" }).status !== 0;
  });
  return missing.length ? `missing mind revision ${rev}${files.length ? `: ${missing.join(", ")}` : ""}` : "";
}

export function missingMindHistory(file: string, dir: string = mindDir): string {
  const missingRepo = missingMindFilesAt(dir, ".git");
  if (missingRepo) return missingRepo;
  const history = spawnSync("git", ["log", "--format=%H", "--", file], { cwd: dir, encoding: "utf8" });
  return history.status === 0 && history.stdout.trim() ? "" : `missing mind git history for ${file}`;
}

// Bun reports skip reasons as part of the full test name.
export function evidenceName(name: string, missing: string): string {
  return missing ? `${name} [SKIP: ${missing}]` : name;
}
