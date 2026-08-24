// doctor.test.ts — CC settings.json graze detection: graze.ts OR circadian-graze-gate.
// Real temp files, no mocks of the code under test.
import { describe, test, expect, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";
import { ccSettingsMissingHooks, ccSettingsMissingHooksFromPath } from "./doctor.ts";

const dirs: string[] = [];

function writeSettings(content: string): string {
  const d = fs.mkdtempSync(path.join(tmpdir(), "doctor-cc-settings-"));
  dirs.push(d);
  const p = path.join(d, "settings.json");
  fs.writeFileSync(p, content, "utf8");
  return p;
}

afterEach(() => {
  while (dirs.length) {
    const d = dirs.pop()!;
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* already gone */
    }
  }
});

describe("ccSettingsMissingHooks", () => {
  test("settings containing graze.ts passes", () => {
    const text = [
      '"command": "bun /Users/jrg/circadian/src/wake.ts"',
      '"command": "bun /Users/jrg/circadian/src/sleep.ts"',
      '"command": "bun /Users/jrg/circadian/src/graze.ts"',
    ].join("\n");
    expect(ccSettingsMissingHooks(text)).toEqual([]);
    const p = writeSettings(text);
    expect(ccSettingsMissingHooksFromPath(p)).toEqual([]);
  });

  test("settings containing circadian-graze-gate (with wake + sleep) passes", () => {
    const text = [
      '"command": "bun /Users/jrg/circadian/src/wake.ts"',
      '"command": "bun /Users/jrg/circadian/src/sleep.ts"',
      '"command": "/Users/jrg/circadian/bin/circadian-graze-gate"',
    ].join("\n");
    expect(ccSettingsMissingHooks(text)).toEqual([]);
    const p = writeSettings(text);
    expect(ccSettingsMissingHooksFromPath(p)).toEqual([]);
  });

  test("settings with neither graze marker fails graze only", () => {
    const text = [
      '"command": "bun /Users/jrg/circadian/src/wake.ts"',
      '"command": "bun /Users/jrg/circadian/src/sleep.ts"',
    ].join("\n");
    expect(ccSettingsMissingHooks(text)).toEqual(["graze.ts"]);
    const p = writeSettings(text);
    expect(ccSettingsMissingHooksFromPath(p)).toEqual(["graze.ts"]);
  });
});
