import { test, expect } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { atomId, serializeAtom } from "./atoms.ts";
import { erase } from "./erase.ts";

const run = (dir: string, ...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
test("erase previews, requires reason, rewrites every reachable commit and prunes old objects", () => {
  const mind = mkdtempSync(join(tmpdir(), "circ-erase-mind-"));
  try {
    run(mind, "init", "-q"); run(mind, "config", "user.name", "Test"); run(mind, "config", "user.email", "test@example.invalid");
    mkdirSync(join(mind, "episodes")); mkdirSync(join(mind, "beliefs"));
    const secret = "violet-umbrella-secrecy";
    const claim = `The ${secret} is ours`;
    const id = atomId(claim);
    const ep = "2026-01-02-one.md";
    writeFileSync(join(mind, "episodes", ep), `This happened: ${secret}.\n`);
    writeFileSync(join(mind, "beliefs", `${id}.md`), serializeAtom({ kind: "doctrine", claim, why: "evidence from session", quotes: [{ text: secret, source: ep }], eps: ["2026-01-02"] }));
    writeFileSync(join(mind, "beliefs.jsonl"), JSON.stringify({ ev: "stack", atom: id, ep, ts: "2026-01-02" }) + "\n");
    writeFileSync(join(mind, "SELF.md"), claim + "\n");
    writeFileSync(join(mind, "render-manifest.json"), "[]\n");
    run(mind, "add", "-A"); run(mind, "commit", "-qm", `first ${secret}`);
    writeFileSync(join(mind, "NOW.md"), secret + "\n");
    run(mind, "add", "-A"); run(mind, "commit", "-qm", "second");
    expect(() => erase(mind, id, "", true)).toThrow(/reason/);
    expect(erase(mind, id, "operator request")).toBe(false);
    run(mind, "remote", "add", "origin", "file:///unreachable");
    expect(() => erase(mind, id, "operator request", true)).toThrow(/remote/);
    run(mind, "remote", "remove", "origin");
    writeFileSync(join(mind, "uncommitted"), "change");
    expect(() => erase(mind, id, "operator request", true)).toThrow(/clean/);
    rmSync(join(mind, "uncommitted"));
    expect(readFileSync(join(mind, "beliefs", `${id}.md`), "utf8")).toContain(secret);
    expect(erase(mind, id, "operator request", true)).toBe(true);
    expect(existsSync(join(mind, "beliefs", `${id}.md`))).toBe(false);
    expect(readFileSync(join(mind, "episodes", ep), "utf8")).toContain("[erased]");
    expect(readFileSync(join(mind, "compost.md"), "utf8")).toContain(`erased ${id}: operator request`);
    expect(readFileSync(join(mind, "compost.md"), "utf8")).not.toContain(secret);
    expect(readFileSync(join(mind, "beliefs.jsonl"), "utf8")).not.toContain(id);
    expect(run(mind, "log", `-S${secret}`, "--all", "--format=%H")).toBe("");
    expect(run(mind, "for-each-ref", "--format=%(refname)", "refs/original")).toBe("");
    expect(run(mind, "fsck", "--unreachable", "--no-reflogs")).toBe("");
  } finally { rmSync(mind, { recursive: true, force: true }); }
});
