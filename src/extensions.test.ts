import { test, expect } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { readExtensions, requireViews, setViewsEnabled, requireChecks, setChecksEnabled } from "./extensions.ts";

function fixture(run: (home: string, file: string) => void): void {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "circadian-extensions-"));
  try { run(home, path.join(home, "extensions.json")); }
  finally { fs.rmSync(home, { recursive: true, force: true }); }
}

test("optional views start off, toggle persistently, and preserve other config", () => fixture((home, file) => {
  expect(readExtensions(home)).toEqual({ views: false, checks: false });
  expect(() => requireViews(home)).toThrow("circadian extensions enable views");
  expect(fs.existsSync(file)).toBe(false);
  fs.writeFileSync(file, JSON.stringify({ unrelated: { keep: "yes" } }));
  expect(setViewsEnabled(home, true)).toEqual({ views: true });
  expect(() => requireViews(home)).not.toThrow();
  expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  expect(setViewsEnabled(home, false)).toEqual({ views: false });
  expect(readExtensions(home)).toEqual({ views: false, checks: false });
  expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual({ unrelated: { keep: "yes" }, views: false });
  expect(fs.readdirSync(home)).toEqual(["extensions.json"]);
}));

test("checks are independently opt-in and preserve the views setting", () => fixture((home, file) => {
  expect(() => requireChecks(home)).toThrow("extensions enable checks");
  setViewsEnabled(home, true);
  expect(setChecksEnabled(home, true)).toEqual({ checks: true });
  expect(readExtensions(home)).toEqual({ views: true, checks: true });
  expect(() => requireChecks(home)).not.toThrow();
  setChecksEnabled(home, false);
  expect(readExtensions(home)).toEqual({ views: true, checks: false });
  fs.writeFileSync(file, '{"views":true,"checks":"yes"}');
  expect(readExtensions(home).checks).toBe(false);
  expect(() => setChecksEnabled(home, true)).toThrow();
}));

test("invalid config disables only the optional capability and is never overwritten", () => fixture((home, file) => {
  for (const content of ["{", "null", "[]", '"yes"', '{"views":"true"}', " ".repeat(65537)]) {
    fs.writeFileSync(file, content);
    const state = readExtensions(home);
    expect(state.views).toBe(false);
    expect(state.error).toContain("extensions.json");
    expect(() => requireViews(home)).toThrow("Cannot read");
    expect(() => setViewsEnabled(home, true)).toThrow();
    expect(fs.readFileSync(file, "utf8")).toBe(content);
    expect(fs.readdirSync(home)).toEqual(["extensions.json"]);
  }
}));

test("config writes cannot replace a symlink or a directory", () => fixture((home, file) => {
  const target = path.join(home, "other.json");
  fs.writeFileSync(target, '{"views":false}');
  fs.symlinkSync(target, file);
  expect(readExtensions(home).error).toBeTruthy();
  expect(() => setViewsEnabled(home, true)).toThrow();
  expect(fs.lstatSync(file).isSymbolicLink()).toBe(true);
  expect(fs.readFileSync(target, "utf8")).toBe('{"views":false}');
  fs.unlinkSync(file);
  fs.mkdirSync(file);
  expect(() => setViewsEnabled(home, false)).toThrow();
  expect(fs.statSync(file).isDirectory()).toBe(true);
}));
