import { describe, test, expect } from "bun:test";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { probeLLMService } from "./doctor.ts";

const llm = join(import.meta.dir, "llm.ts");
const run = (file: string, env: Record<string, string>) => new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
  const inherited = { ...process.env };
  for (const key of Object.keys(inherited)) {
    if (key.startsWith("CIRCADIAN_LLM_") || key.startsWith("LOCAL_LLM_") || key === "CIRCADIAN_ENV_FILE") delete inherited[key];
  }
  const child = spawn(process.execPath, [file, ...(file.endsWith("/doctor.ts") ? ["--json"] : [])], { env: { ...inherited, ...env } });
  let stdout = "", stderr = "";
  child.stdout.on("data", d => stdout += d);
  child.stderr.on("data", d => stderr += d);
  child.on("error", reject);
  child.on("close", code => resolve({ code, stdout, stderr }));
});

describe("remote OpenAI-compatible endpoint", () => {
  test("private env file precedence, comments, optional absence, and permissions warning", async () => {
    const root = mkdtempSync(join(tmpdir(), "circ-env-"));
    try {
      const envFile = join(root, "env");
      const script = join(root, "read.mjs");
      writeFileSync(script, `import ${JSON.stringify(llm)}; console.log(JSON.stringify({model: process.env.CIRCADIAN_LLM_MODEL, key: process.env.CIRCADIAN_LLM_API_KEY}));`);
      writeFileSync(envFile, "# secrets\n\nCIRCADIAN_LLM_MODEL=file-model\nCIRCADIAN_LLM_API_KEY=file-key\n", { mode: 0o600 });
      const env = { CIRCADIAN_HOME: root, CIRCADIAN_ENV_FILE: envFile, CIRCADIAN_LLM_MODEL: "shell-model" };
      const privateRun = await run(script, env);
      expect(privateRun.code).toBe(0);
      expect(JSON.parse(privateRun.stdout)).toEqual({ model: "shell-model", key: "file-key" });
      expect(privateRun.stderr).not.toContain("env-permissions");
      chmodSync(envFile, 0o644);
      const exposed = await run(script, env);
      expect(exposed.stderr).toContain("env-permissions");
      expect(exposed.stderr).not.toContain("file-key");
      const events = readFileSync(join(root, "logs/circadian.events.jsonl"), "utf8");
      expect(events).toContain('"outcome":"degraded"');
      expect((await run(script, { ...env, CIRCADIAN_ENV_FILE: join(root, "absent") })).code).toBe(0);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test("prefix, extra body, protected fields, reasoning usage and auth", async () => {
    const root = mkdtempSync(join(tmpdir(), "circ-remote-"));
    const bodies: any[] = [];
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(req) {
      expect(req.headers.get("authorization")).toBe("Bearer id.secret");
      if (new URL(req.url).pathname.endsWith("/models")) return new Response("{}", { status: 200 });
      bodies.push(await req.json());
      const chunks = [
        { choices: [{ delta: { reasoning_content: "hidden", reasoning: "also hidden", content: "answer" }, finish_reason: null }] },
        { choices: [{ delta: {}, finish_reason: "stop" }], usage: { completion_tokens: 4, completion_tokens_details: { reasoning_tokens: 3 } } },
      ];
      return new Response(chunks.map(c => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
    } });
    try {
      const script = join(root, "complete.mjs");
      writeFileSync(script, `import { complete } from ${JSON.stringify(llm)}; console.log(await complete("ping", {timeoutMs: 2000, maxTokens: 32}));`);
      const env = { CIRCADIAN_HOME: root, CIRCADIAN_ENV_FILE: join(root, "env"), CIRCADIAN_LLM_RETRIES: "1" };
      writeFileSync(env.CIRCADIAN_ENV_FILE, `# remote\nCIRCADIAN_LLM_BASE_URL=http://127.0.0.1:${server.port}/v1\nCIRCADIAN_LLM_MODEL=deepseek-ai/DeepSeek-V4.1-Flash\nCIRCADIAN_LLM_API_KEY=id.secret\nCIRCADIAN_LLM_EXTRA_BODY={"reasoning_effort":"low","chat_template_kwargs":{"thinking":false}}\n`, { mode: 0o600 });
      const first = await run(script, env);
      expect(first.code).toBe(0);
      expect(first.stdout.trim()).toBe("answer");
      expect(bodies[0].messages[0].content).toBe("/no_think\nping");
      expect(bodies[0]).toMatchObject({ model: "deepseek-ai/DeepSeek-V4.1-Flash", stream: true, stream_options: { include_usage: true }, max_tokens: 32, reasoning_effort: "low", chat_template_kwargs: { thinking: false } });
      expect(readFileSync(join(root, "logs/circadian.events.jsonl"), "utf8")).toContain('"reasoning_tokens":3');
      const second = await run(script, { ...env, CIRCADIAN_LLM_NO_THINK_PREFIX: "0" });
      expect(second.code).toBe(0);
      expect(bodies[1].messages[0].content).toBe("ping");
      for (const extra of ["not json", "[]", '{"model":"bad"}', '{"messages":[]}', '{"stream":false}', '{"stream_options":{}}', '{"max_tokens":1}']) {
        const bad = await run(script, { ...env, CIRCADIAN_LLM_EXTRA_BODY: extra });
        expect(bad.code).not.toBe(0);
        expect(bad.stderr).toContain("CIRCADIAN_LLM_EXTRA_BODY");
      }
      expect(bodies.length).toBe(2);
    } finally { server.stop(true); rmSync(root, { recursive: true, force: true }); }
  });

  test("doctor distinguishes reachable, auth failure and unreachable with bearer header", async () => {
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(req) {
      return new Response("{}", { status: req.headers.get("authorization") === "Bearer valid" ? 200 : req.headers.get("authorization") === "Bearer forbidden" ? 403 : 401 });
    } });
    const base = `http://127.0.0.1:${server.port}/v1`;
    try {
      expect((await probeLLMService(base, "valid")).level).toBe("OK");
      const auth = await probeLLMService(base, "bad");
      expect(auth.detail).toContain("authentication failed");
      expect(auth.detail).toContain("401");
      expect((await probeLLMService(base, "forbidden")).detail).toContain("403");
    } finally { server.stop(true); }
    const down = await probeLLMService(base, "valid");
    expect(down.detail).toContain("not reachable");
    expect(down.detail).not.toContain("authentication failed");
  });

  test("doctor process reads configured endpoint and bearer from env file", async () => {
    const root = mkdtempSync(join(tmpdir(), "circ-doctor-"));
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(req) {
      return new Response("{}", { status: req.headers.get("authorization") === "Bearer doctor-key" ? 200 : 401 });
    } });
    try {
      const bin = join(root, "bin");
      mkdirSync(bin);
      writeFileSync(join(bin, "systemctl"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
      const file = join(root, "env");
      writeFileSync(file, `# doctor settings\nCIRCADIAN_LLM_BASE_URL=http://127.0.0.1:${server.port}/v1\nCIRCADIAN_LLM_API_KEY=doctor-key\n`, { mode: 0o600 });
      const result = await run(join(import.meta.dir, "doctor.ts"), {
        CIRCADIAN_HOME: root, CIRCADIAN_ENV_FILE: file, PATH: `${bin}:${process.env.PATH}`,
      });
      const report = JSON.parse(result.stdout);
      expect(report.checks.find((c: any) => c.name === "LLM service")).toMatchObject({ level: "OK", detail: expect.stringContaining(`:${server.port}/v1`) });
      const unauthorized = await run(join(import.meta.dir, "doctor.ts"), {
        CIRCADIAN_HOME: root, CIRCADIAN_ENV_FILE: file, CIRCADIAN_LLM_API_KEY: "wrong", PATH: `${bin}:${process.env.PATH}`,
      });
      expect(JSON.parse(unauthorized.stdout).checks.find((c: any) => c.name === "LLM service").detail).toContain("authentication failed");
    } finally { server.stop(true); rmSync(root, { recursive: true, force: true }); }
  });
});
