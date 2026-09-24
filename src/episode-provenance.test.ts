import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir, hostname } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { resolveEpisodeProvenance } from "./provenance.ts";

const draft = `=== EPISODE ===\nARC: Fixture Work\nA useful conversation.\nuser-observed: nothing new\nwhat-changed: none\n=== NOW ===\n## Arc\nFixture work\n## Flight plan\nContinue\n## Live tensions\nnone\n## Commitments\nnone\n## Serendipity\nnone\n## Last sleep\n\n=== END ===`;

for (const [harness, parts, model] of [
  ["claude-code", [".claude", "projects", "-tmp-fixture", "session.jsonl"], "claude-sonnet-fixture"],
  ["pi", [".pi", "agent", "sessions", "--tmp-fixture--", "session.jsonl"], "pi-fixture-model"],
] as const) {
  test(`${harness} hook direct and queued drain preserve real provenance`, async () => {
    const root = mkdtempSync(join(tmpdir(), "circadian-provenance-"));
    try {
      const home = join(root, "install");
      const mind = join(home, "mind");
      const episodes = join(mind, "episodes");
      mkdirSync(episodes, { recursive: true });
      mkdirSync(join(home, "logs"));
      for (const [file, content] of Object.entries({ "SELF.md": "", "NOW.md": "", "scoreboard.jsonl": "" })) writeFileSync(join(mind, file), content);
      const git = (...args: string[]) => spawnSync("git", ["-C", mind, ...args], { encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "Test", GIT_COMMITTER_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_EMAIL: "test@example.invalid" } });
      expect(git("init", "-q", "-b", "main").status).toBe(0);
      expect(git("add", "-A").status).toBe(0);
      expect(git("commit", "-qm", "seed").status).toBe(0);
      const transcript = join(root, ...parts);
      mkdirSync(join(root, ...parts.slice(0, -1)), { recursive: true });
      const assistant = (name: string) => harness === "pi"
        ? { type: "message", message: { role: "assistant", provider: "fixture-provider", model: name, content: [{ type: "text", text: "Done." }] } }
        : { type: "assistant", message: { role: "assistant", model: name, content: [{ type: "text", text: "Done." }] } };
      writeFileSync(transcript, [
        { type: "user", message: { role: "user", content: [{ type: "text", text: "Please help with this fixture." }] } },
        assistant("older-model"), assistant(model),
      ].map(x => JSON.stringify(x)).join("\n") + "\n");
      const preload = join(root, "mock-fetch.ts");
      writeFileSync(preload, `globalThis.fetch = async (url) => {\n  // Offline mode returns a malformed draft quickly, triggering the durability queue.\n  if (String(url).endsWith("/models")) return new Response("{}", {status:200});\n  return new Response('data: ' + JSON.stringify({choices:[{delta:{content:process.env.MOCK_UP === "1" ? ${JSON.stringify(draft)} : "not a draft"},finish_reason:"stop"}]}) + '\\n\\ndata: [DONE]\\n\\n', {status:200,headers:{"content-type":"text/event-stream"}});\n};\n`);
      const bun = join(root, "fake-bun");
      writeFileSync(bun, `#!/bin/sh\nexec '${process.execPath}' --preload '${preload}' "$@"\n`, { mode: 0o755 });
      const env = { ...process.env, CIRCADIAN_HOME: home, CIRCADIAN_BUN_BIN: bun,
        CIRCADIAN_LLM_BASE_URL: "http://invalid.local/v1", CIRCADIAN_LLM_FALLBACK_BASE_URL: "",
        CIRCADIAN_DRAIN_PACE_MS: "0", CIRCADIAN_HARNESS: "", CIRCADIAN_MODEL: "", CIRCADIAN_MACHINE: "",
        HOSTNAME: "", GIT_AUTHOR_NAME: "Test", GIT_COMMITTER_NAME: "Test",
        GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_EMAIL: "test@example.invalid" };
      const hook = (id: string, up: string) => spawnSync(process.execPath, ["--preload", preload, join(import.meta.dir, "sleep.ts")], {
        input: JSON.stringify({ session_id: id, transcript_path: transcript }), env: { ...env, MOCK_UP: up }, encoding: "utf8",
      });
      const files = () => readdirSync(episodes).filter(x => x.endsWith(".md"));
      const waitFor = async (predicate: () => boolean) => {
        for (let i = 0; i < 200 && !predicate(); i++) await Bun.sleep(50);
        if (!predicate()) throw new Error(`wait timed out: ${existsSync(join(home, "logs", "sleep.log")) ? readFileSync(join(home, "logs", "sleep.log"), "utf8") : "no sleep log"}`);
      };
      expect(hook(`${harness}-direct`, "1").status).toBe(0);
      await waitFor(() => files().length === 1);
      const assertProvenance = (content: string, id: string) => {
        expect(content).toContain(`harness: ${harness}\n`);
        expect(content).toContain(`model: ${model}\n`);
        expect(content).toContain(`machine: ${hostname()}\n`);
        expect(content).toContain(`provenance_session: ${id}\n`);
      };
      assertProvenance(readFileSync(join(episodes, files()[0]), "utf8"), `${harness}-direct`);
      expect(hook(`${harness}-queued`, "0").status).toBe(0);
      const queue = join(home, "logs", "pending-sleep.jsonl");
      await waitFor(() => existsSync(queue) && readFileSync(queue, "utf8").includes(`${harness}-queued`));
      const entry = JSON.parse(readFileSync(queue, "utf8").trim());
      expect(entry.provenance).toEqual({ harness, model, machine: hostname(), session: `${harness}-queued` });
      // Change ambient provenance and remove the source model evidence after enqueue:
      // drain must use the snapshotted values, not re-resolve against its env.
      writeFileSync(transcript, readFileSync(transcript, "utf8").replaceAll(model, "changed-after-queue"));
      const drain = spawnSync(process.execPath, ["--preload", preload, join(import.meta.dir, "sleep.ts"), "--drain"], {
        env: { ...env, MOCK_UP: "1", CIRCADIAN_MACHINE: "changed-after-queue" }, encoding: "utf8",
      });
      expect(drain.status).toBe(0);
      expect(files()).toHaveLength(2);
      const drained = files().map(f => readFileSync(join(episodes, f), "utf8")).find(s => s.includes(`provenance_session: ${harness}-queued`));
      assertProvenance(drained || "", `${harness}-queued`);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 60000);
}

test("event and env overrides take precedence over path and last assistant model", () => {
  const root = mkdtempSync(join(tmpdir(), "circadian-provenance-"));
  try {
    const path = join(root, ".claude", "projects", "-fixture", "session.jsonl");
    mkdirSync(join(root, ".claude", "projects", "-fixture"), { recursive: true });
    writeFileSync(path, JSON.stringify({ type: "assistant", message: { role: "assistant", model: "transcript-model" } }) + "\n");
    expect(resolveEpisodeProvenance(path, { harness: "event-harness", model: "event-model" }, {})).toMatchObject({ harness: "event-harness", model: "event-model", machine: hostname() });
    expect(resolveEpisodeProvenance(path, { harness: "event-harness", model: "event-model" }, { CIRCADIAN_HARNESS: "env-harness", CIRCADIAN_MODEL: "env-model", CIRCADIAN_MACHINE: "env-machine" })).toMatchObject({ harness: "env-harness", model: "env-model", machine: "env-machine" });
  } finally { rmSync(root, { recursive: true, force: true }); }
});
