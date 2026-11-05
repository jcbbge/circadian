import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Real HTTP transport + CLI processes + native transcript files. The server
// emits protocol failure fixtures, never contacts a model or replaces modules.
for (const failure of ["busy", "truncated", "malformed"] as const) {
  test(`harvest preserves ${failure} failures and leaves bounded recovery to drain`, async () => {
    const root = mkdtempSync(join(tmpdir(), "circadian-harvest-"));
    const home = join(root, "install");
    const logs = join(home, "logs");
    const sessionId = `harvest-${failure}`;
    const transcripts = join(root, ".claude", "projects", "fixture");
    mkdirSync(transcripts, { recursive: true });
    mkdirSync(join(home, "mind"), { recursive: true });
    const transcript = join(transcripts, `${sessionId}.jsonl`);
    writeFileSync(transcript, JSON.stringify({ role: "user", content: "Please preserve this investigation and its concrete evidence." }) + "\n");
    const requests: any[] = [];
    let probes = 0;
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(req) {
      if (new URL(req.url).pathname === "/v1/models") {
        probes++;
        return new Response(JSON.stringify({ data: [] }), { status: failure === "busy" ? 503 : 200 });
      }
      requests.push(await req.json());
      const chunk = { choices: [{ delta: { content: "Incomplete artifact without required delimiters." }, finish_reason: failure === "truncated" ? "length" : "stop" }], usage: { completion_tokens: failure === "truncated" ? 6000 : 10 } };
      return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { "Content-Type": "text/event-stream" } });
    } });
    const env = { ...process.env, HOME: root, CIRCADIAN_HOME: home,
      CIRCADIAN_LLM_BASE_URL: `http://127.0.0.1:${server.port}/v1`, CIRCADIAN_LLM_FALLBACK_BASE_URL: "",
      CIRCADIAN_LLM_RETRIES: "1", CIRCADIAN_DRAIN_MAX_ENTRIES: "1", CIRCADIAN_DRAIN_PACE_MS: "1" };
    const run = async (file: string, args: string[] = []) => {
      const child = Bun.spawn([process.execPath, join(import.meta.dir, file), ...args], { env, stdout: "pipe", stderr: "pipe" });
      const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
      return { stdout, stderr, code };
    };
    try {
      const first = await run("harvest.ts");
      expect(first.code).toBe(1);
      expect(first.stdout).toContain("1 failed");
      const queue = join(logs, "pending-sleep.jsonl");
      const entry = JSON.parse(readFileSync(queue, "utf8").trim());
      const spent = failure === "busy" ? 0 : failure === "truncated" ? 1 : 2;
      expect(entry).toMatchObject({ session_id: sessionId, transcript_path: realpathSync(transcript), attempts: spent, scope: "global" });
      expect(entry.provenance.harness).toBe("claude");
      expect(requests).toHaveLength(spent);
      if (failure === "malformed") {
        expect(JSON.stringify(requests[1])).toContain("Your previous reply could not be parsed");
        expect(JSON.stringify(requests[1])).toContain("QUOTE INTEGRITY");
      }
      const events = readFileSync(join(logs, "circadian.events.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line));
      expect(events.find(e => e.phase === "llm-draft").context).toMatchObject({ queued: true, attempts: failure === "busy" ? 1 : spent });
      const before = probes;
      const again = await run("harvest.ts");
      expect(again.code).toBe(1);
      expect(again.stdout).toContain("1 queued/dead-lettered");
      expect(probes).toBe(before);
      expect(readFileSync(queue, "utf8").trim().split("\n")).toHaveLength(1);
      expect((await run("sleep.ts", ["--drain"])).code).toBe(0);
      expect(JSON.parse(readFileSync(queue, "utf8").trim()).attempts).toBe(spent * 2);
      // At cap, preserve the handle in dead letters without another request.
      writeFileSync(queue, JSON.stringify({ ...entry, attempts: 8, last_error: "malformed fixture" }) + "\n");
      const beforeDead = probes;
      expect((await run("sleep.ts", ["--drain"])).code).toBe(0);
      expect(JSON.parse(readFileSync(join(logs, "pending-sleep.dead.jsonl"), "utf8").trim()).session_id).toBe(sessionId);
      expect((await run("harvest.ts")).code).toBe(1);
      expect(probes).toBe(beforeDead);
      expect(existsSync(join(home, "mind", "episodes"))).toBe(false);
      expect(existsSync(join(home, "mind", "NOW.md"))).toBe(false);
    } finally { server.stop(true); rmSync(root, { recursive: true, force: true }); }
  }, 20_000);
}
