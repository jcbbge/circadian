import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir, hostname } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const draft = `=== EPISODE ===\nARC: Fixture Work\nA useful conversation.\nuser-observed: nothing new\nwhat-changed: none\n=== NOW ===\n## Arc\nFixture work\n## Flight plan\nContinue\n## Live tensions\nnone\n## Commitments\nnone\n## Serendipity\nnone\n## Last sleep\n\n=== END ===`;

test("a lane session writes its episode but leaves NOW alone; an operator session rewrites NOW", async () => {
  const root = mkdtempSync(join(tmpdir(), "circadian-lane-now-"));
  try {
    const home = join(root, "install"); const mind = join(home, "mind"); const episodes = join(mind, "episodes");
    mkdirSync(episodes, { recursive: true }); mkdirSync(join(home, "logs"));
    for (const [file, content] of Object.entries({ "SELF.md": "", "NOW.md": "untouched\n", "scoreboard.jsonl": "" })) writeFileSync(join(mind, file), content);
    const genv = { ...process.env, GIT_AUTHOR_NAME: "Test", GIT_COMMITTER_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_EMAIL: "test@example.invalid" };
    const git = (...args: string[]) => spawnSync("git", ["-C", mind, ...args], { encoding: "utf8", env: genv });
    expect(git("init", "-q", "-b", "main").status).toBe(0); expect(git("add", "-A").status).toBe(0); expect(git("commit", "-qm", "seed").status).toBe(0);
    const transcript = join(root, ".claude", "projects", "-tmp-fixture", "session.jsonl");
    mkdirSync(join(root, ".claude", "projects", "-tmp-fixture"), { recursive: true });
    writeFileSync(transcript, [
      { type: "user", message: { role: "user", content: [{ type: "text", text: "Please help with this fixture." }] } },
      { type: "assistant", message: { role: "assistant", model: "m", content: [{ type: "text", text: "Done." }] } },
    ].map(x => JSON.stringify(x)).join("\n") + "\n");
    const preload = join(root, "mock-fetch.ts");
    writeFileSync(preload, `globalThis.fetch = async (url) => {\n  if (String(url).endsWith("/models")) return new Response("{}", {status:200});\n  return new Response('data: ' + JSON.stringify({choices:[{delta:{content:${JSON.stringify(draft)}},finish_reason:"stop"}]}) + '\\n\\ndata: [DONE]\\n\\n', {status:200,headers:{"content-type":"text/event-stream"}});\n};\n`);
    const bun = join(root, "fake-bun");
    writeFileSync(bun, `#!/bin/sh\nexec '${process.execPath}' --preload '${preload}' "$@"\n`, { mode: 0o755 });
    const env = { ...genv, CIRCADIAN_HOME: home, CIRCADIAN_BUN_BIN: bun, CIRCADIAN_LLM_BASE_URL: "http://invalid.local/v1",
      CIRCADIAN_LLM_FALLBACK_BASE_URL: "", CIRCADIAN_DRAIN_PACE_MS: "0", CIRCADIAN_HARNESS: "", CIRCADIAN_MODEL: "", CIRCADIAN_MACHINE: "", HOSTNAME: "" };
    const hook = (id: string, lane: string) => spawnSync(process.execPath, ["--preload", preload, join(import.meta.dir, "sleep.ts")], {
      input: JSON.stringify({ session_id: id, transcript_path: transcript }), env: { ...env, CIRCADIAN_LANE: lane }, encoding: "utf8" });
    const files = () => readdirSync(episodes).filter(x => x.endsWith(".md"));
    const waitFor = async (p: () => boolean) => { for (let i = 0; i < 200 && !p(); i++) await Bun.sleep(50); if (!p()) throw new Error("wait timed out"); };
    expect(hook("lane-session", "cst-x").status).toBe(0);
    await waitFor(() => files().length === 1);
    expect(readFileSync(join(mind, "NOW.md"), "utf8")).toBe("untouched\n");
    expect(hook("operator-session", "").status).toBe(0);
    await waitFor(() => files().length === 2);
    await waitFor(() => readFileSync(join(mind, "NOW.md"), "utf8") !== "untouched\n");
    expect(readFileSync(join(mind, "NOW.md"), "utf8")).toContain("Fixture work");
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 60000);
