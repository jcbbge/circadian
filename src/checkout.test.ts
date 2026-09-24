import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { atomId, serializeAtom } from "./atoms.ts";
import { renderSelf } from "./render.ts";
import { buildPayload } from "./wake-payload.ts";
import { checkout } from "./checkout.ts";

const script = join(import.meta.dir, "checkout.ts");
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
function git(repo: string, ...args: string[]) {
  const p = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  if (p.status) throw new Error(p.stderr);
  return p.stdout.trim();
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "circadian-checkout-")); dirs.push(root);
  const repo = join(root, "mind"); mkdirSync(join(repo, "beliefs"), { recursive: true });
  git(repo, "init", "-q"); git(repo, "config", "user.email", "test@example.invalid"); git(repo, "config", "user.name", "test");
  const claim = "Continuity is a committed ref";
  const id = atomId(claim);
  writeFileSync(join(repo, "beliefs", `${id}.md`), serializeAtom({ kind: "doctrine", claim, why: "Commit is portable", quotes: [{ text: "a ref survives", source: "example.md" }], eps: ["2026-09-24"] }));
  writeFileSync(join(repo, "beliefs.jsonl"), JSON.stringify({ ev: "stack", atom: id, ts: "t" }) + "\n");
  writeFileSync(join(repo, "NOW.md"), "# Now\n\nAt work.\n");
  git(repo, "add", "-A"); git(repo, "commit", "-qm", "fixture");
  return { root, repo, id, sha: git(repo, "rev-parse", "HEAD") };
}
function run(repo: string, root: string, ...args: string[]) {
  return spawnSync("bun", [script, "--repo", repo, ...args], { encoding: "utf8", env: { ...process.env, CIRCADIAN_HOME: join(root, "home") } });
}

describe("checkout of a mind ref", () => {
  test("two independent runs render byte-identical SELF and receipt from committed blobs, never change mind", () => {
    const { root, repo, sha } = fixture();
    const expected = checkout(repo);
    expect(expected.self).toBe(renderSelf([{ id: atomId("Continuity is a committed ref"), kind: "doctrine", claim: "Continuity is a committed ref", why: "Commit is portable", quotes: [{ text: "a ref survives", source: "example.md" }], eps: ["2026-09-24"] }], new Map([[atomId("Continuity is a committed ref"), { weight: 1, status: "active" }]])).md);
    const before = git(repo, "status", "--porcelain");
    writeFileSync(join(repo, "NOW.md"), "DIRTY\n"); // working tree must not enter the result
    const a = run(repo, root, "--ref", sha);
    const b = run(repo, root, "--ref", sha);
    expect(a.status).toBe(0); expect(b.status).toBe(0);
    expect(a.stdout).toBe(b.stdout);
    expect(a.stdout).toContain(expected.self);
    expect(a.stdout).toContain("--- NOW.md ---\n# Now\n\nAt work.\n");
    expect(a.stdout).toContain(`RECONSTITUTED ${sha} atoms=1 weight=1\n`);
    expect(git(repo, "status", "--porcelain")).not.toBe(before);
    expect(readFileSync(join(repo, "NOW.md"), "utf8")).toBe("DIRTY\n");
    expect(readdirSync(repo).includes("SELF.md")).toBe(false);
  });
  test("output directory contains deterministic bytes and never writes to mind", () => {
    const { root, repo } = fixture(); const dest = join(root, "out");
    const p = run(repo, root, "--out", dest);
    expect(p.status).toBe(0);
    expect(p.stdout).toMatch(/^RECONSTITUTED [a-f0-9]+ atoms=1 weight=1\n$/);
    expect(readFileSync(join(dest, "SELF.md"), "utf8")).toBe(checkout(repo).self);
    expect(readFileSync(join(dest, "NOW.md"), "utf8")).toBe("# Now\n\nAt work.\n");
    expect(run(repo, root, "--out", join(repo, "out")).status).toBe(2);
  });
  test("invalid ledger fails closed with exit 2 and no output files", () => {
    const { root, repo } = fixture();
    writeFileSync(join(repo, "beliefs.jsonl"), '{"ev":"stack","atom":"missing","ts":"t"}\n');
    git(repo, "add", "-A"); git(repo, "commit", "-qm", "broken");
    const dest = join(root, "no-output");
    const p = run(repo, root, "--out", dest);
    expect(p.status).toBe(2); expect(p.stdout).toBe("");
    expect(p.stderr).toContain("ledger line 1 cannot fold");
    expect(readdirSync(root)).not.toContain("no-output");
  });
  test("contradiction/resolve events reject nonexistent endpoints and invalid edges", () => {
    const { root, repo, id } = fixture();
    const append = (event: object) => {
      writeFileSync(join(repo, "beliefs.jsonl"), JSON.stringify({ ev: "stack", atom: id, ts: "t" }) + "\n" + JSON.stringify(event) + "\n");
      git(repo, "add", "-A"); git(repo, "commit", "-qm", "event");
    };
    for (const event of [
      { ev: "contradiction", a: id, b: "missing", ts: "t2" },
      { ev: "resolve", edge: `${id}:missing`, winner: id, ts: "t2" },
    ]) {
      append(event);
      const p = run(repo, root);
      expect(p.status).toBe(2);
      expect(p.stderr).toContain("ledger line 2 cannot fold");
    }
  });
  test("unknown ref fails closed with exit 2", () => {
    const { root, repo } = fixture();
    expect(run(repo, root, "--ref", "not-a-ref").status).toBe(2);
  });
  test("wake golden: committed ref produces the same injection as the existing file payload", () => {
    const { root, repo } = fixture();
    const home = root;
    // The ref's SELF must be the canonical render; wake reads it verbatim.
    const self = checkout(repo).self;
    writeFileSync(join(repo, "SELF.md"), self);
    const files = {
      "CONSTITUTION.md": "# Constitution\n", "CONSTITUTION-JOSH.md": "# Josh\n",
      "USER.md": "# User\n", "greeting.md": "Back at work.\n",
    };
    for (const [name, content] of Object.entries(files)) writeFileSync(join(repo, name), content);
    git(repo, "add", "-A"); git(repo, "commit", "-qm", "rendered mind");
    const now = readFileSync(join(repo, "NOW.md"), "utf8");
    writeFileSync(join(repo, "scoreboard.jsonl"), JSON.stringify({ type: "wake", ts: new Date().toISOString() }) + "\n");
    const expected = buildPayload({ self, now, user: files["USER.md"], greeting: files["greeting.md"],
      constitution: files["CONSTITUTION.md"], constitutionJosh: files["CONSTITUTION-JOSH.md"] });
    const p = spawnSync("bun", [join(import.meta.dir, "wake.ts")], {
      encoding: "utf8", input: "", timeout: 10000,
      env: { ...process.env, CIRCADIAN_HOME: home, CIRCADIAN_BUN_BIN: "/bin/true" },
    });
    expect(p.status).toBe(0);
    expect(p.stdout).toBe(expected + "\n");
    // If checkout cannot fold the committed ledger, Law 7 still delivers
    // the original file payload; the degraded event explains the fallback.
    writeFileSync(join(repo, "beliefs.jsonl"), "not json\n");
    git(repo, "add", "-A"); git(repo, "commit", "-qm", "broken ledger");
    const fallback = spawnSync("bun", [join(import.meta.dir, "wake.ts")], {
      encoding: "utf8", input: "", timeout: 10000,
      env: { ...process.env, CIRCADIAN_HOME: home, CIRCADIAN_BUN_BIN: "/bin/true" },
    });
    expect(fallback.status).toBe(0);
    expect(fallback.stdout).toBe(expected + "\n");
    expect(fallback.stderr).toContain("wake/checkout DEGRADED");
  });
});
