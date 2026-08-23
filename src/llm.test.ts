// llm.test.ts — TEST-MAKER for rem-storm-hardening Task C (endpoint truth).
// Written from the brief/plan ONLY, before implementation exists. These
// tests are EXPECTED TO FAIL (red) — they encode behavior `src/llm.ts` does
// not have yet: down-vs-busy classification, jittered/capped backoff, and a
// cross-process concurrency cap. No mocks of the LLM: every scenario runs
// against a real local throwaway HTTP/TCP server this file owns and tears
// down, and the concurrency-cap proof runs two REAL separate subprocesses.
// Zero calls to :10240 anywhere in this file (CIRCADIAN_LIVE_LLM is not
// read; nothing here is gated behind it because nothing here needs it).
//
// Env-vars whose top-level `const` in llm.ts are read once at module load
// (BASE_URL, RETRIES, BACKOFF_MS, and — per this brief's work item 3 — the
// concurrency cap) cannot be overridden in-process after import. Every test
// that needs a non-default value spawns a fresh subprocess, per the house
// pattern (src/sleep.test.ts:136-138): spawn `process.execPath` against a
// throwaway script file, with env overrides, and inspect real output.
import { describe, test, expect, afterEach } from "bun:test";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:net";
import { createServer } from "node:net";

const LLM_TS = join(import.meta.dir, "llm.ts");
const BUN_BIN = process.execPath;

const cleanupDirs: string[] = [];
function tmpDir(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  cleanupDirs.push(d);
  return d;
}
afterEach(() => {
  while (cleanupDirs.length) {
    const d = cleanupDirs.pop()!;
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      // best-effort cleanup; a leftover temp dir is not a test failure
    }
  }
});

/** Subprocess script: import the real llm.ts, call complete() once, report
 * the outcome (or error message) plus elapsed wall-clock ms as JSON on
 * stdout. This is the "real subprocess" seam — no mock of complete(). */
function writeRunCompleteScript(dir: string): string {
  const scriptPath = join(dir, "run-complete.mjs");
  const src = `
    import { complete } from ${JSON.stringify(LLM_TS)};
    const t0 = Date.now();
    try {
      const out = await complete("ping", { timeoutMs: 4000, maxTokens: 16 });
      process.stdout.write(JSON.stringify({ ok: true, out, elapsedMs: Date.now() - t0 }));
    } catch (err) {
      process.stdout.write(JSON.stringify({
        ok: false,
        message: err instanceof Error ? err.message : String(err),
        elapsedMs: Date.now() - t0,
      }));
    }
  `;
  writeFileSync(scriptPath, src);
  return scriptPath;
}

/** A raw TCP listener that ACCEPTS every connection then immediately resets
 * it (no HTTP response at all) — this is "refusing under load": the process
 * is alive and the port is bound, but the connection is torn down before any
 * data flows, the same shape backlog/worker exhaustion produces. It also
 * timestamps every accepted connection so the test can inspect real
 * inter-attempt spacing (jitter proof) without parsing log lines. Distinct
 * from "absent" below, where nothing is listening and the OS itself refuses
 * the SYN (ECONNREFUSED) — that is fact 10's "down", not "busy".
 */
function startRefusingServer(): { server: Server; port: number; hits: number[] } {
  const hits: number[] = [];
  const server = createServer((socket) => {
    hits.push(Date.now());
    socket.resetAndDestroy ? socket.resetAndDestroy() : socket.destroy();
  });
  server.listen(0, "127.0.0.1");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("failed to bind refusing server");
  return { server, port: address.port, hits };
}

/** A minimal OpenAI-compatible SSE server: GET /v1/models -> 200, POST
 * /v1/chat/completions -> a single streamed chunk + [DONE], matching the SSE
 * shape src/llm.ts:generate() already parses (chat.completion.chunk with
 * choices[0].delta.content, a finish_reason, and a final usage chunk). Used
 * only for the cross-process concurrency-cap proof — never :10240. */
function startFakeLlmServer(delayMs: number): { url: string; stop: () => void; log: { start: number; end: number }[] } {
  const log: { start: number; end: number }[] = [];
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/v1/models") {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      if (url.pathname === "/v1/chat/completions") {
        const start = Date.now();
        await new Promise((r) => setTimeout(r, delayMs));
        const chunk1 = `data: ${JSON.stringify({ choices: [{ delta: { content: "ok" }, finish_reason: null }] })}\n\n`;
        const chunk2 = `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], usage: { completion_tokens: 1 } })}\n\n`;
        const done = `data: [DONE]\n\n`;
        const end = Date.now();
        log.push({ start, end });
        return new Response(chunk1 + chunk2 + done, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      }
      return new Response("not found", { status: 404 });
    },
  });
  return {
    url: `http://127.0.0.1:${server.port}/v1`,
    stop: () => server.stop(true),
    log,
  };
}

/** Runs the subprocess via async spawn (NOT spawnSync). This matters
 * whenever the test also owns an in-process TCP/HTTP server the subprocess
 * must connect to: spawnSync blocks this process's event loop for its
 * entire duration, which starves that server's own 'connection'/'fetch'
 * handlers and produces a false hang, not a real result. */
function runComplete(
  scriptPath: string,
  env: Record<string, string | undefined>,
): Promise<{ ok: boolean; message?: string; elapsedMs: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(BUN_BIN, [scriptPath], { env: { ...process.env, ...env } });
    let stdout = "";
    let stderr = "";
    const killTimer = setTimeout(() => child.kill("SIGKILL"), 15_000);
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", () => {
      clearTimeout(killTimer);
      const trimmed = stdout.trim();
      if (!trimmed) {
        reject(new Error(`run-complete.mjs produced no stdout; stderr: ${stderr}`));
        return;
      }
      try {
        resolve(JSON.parse(trimmed));
      } catch {
        reject(new Error(`run-complete.mjs stdout was not JSON: ${trimmed}; stderr: ${stderr}`));
      }
    });
    child.on("error", reject);
  });
}

describe("llm.ts — down vs busy classification (rem-storm Task C)", () => {
  test("(a) a refusing endpoint is classified busy, backed off WITH JITTER, and never reported as unreachable", async () => {
    const { server, port, hits } = startRefusingServer();
    const dir = tmpDir("llm-refuse-");
    const scriptPath = writeRunCompleteScript(dir);
    try {
      const result = await runComplete(scriptPath, {
        CIRCADIAN_LLM_BASE_URL: `http://127.0.0.1:${port}/v1`,
        CIRCADIAN_LLM_RETRIES: "3",
        CIRCADIAN_LLM_RETRY_BACKOFF_MS: "300,300,300",
      });

      expect(result.ok).toBe(false);
      // The done-when's central assertion: a refused-under-load condition
      // must not be worded as "unreachable" — that wording is what made a
      // self-inflicted storm look like a dead service to the operator.
      expect(result.message?.toLowerCase()).not.toContain("unreachable");
      // Must be classified as something distinctly "busy" — the operator
      // has to be able to tell which of the two conditions this was.
      expect(result.message?.toLowerCase()).toMatch(/busy|refus|backlog|overload/);

      // Retried (not down-classified give-up-immediately): the raw server
      // recorded more than one accepted connection.
      expect(hits.length).toBeGreaterThanOrEqual(2);

      // Jitter proof: with an UNJITTERED fixed backoff of 300ms, consecutive
      // accepted-connection timestamps would be spaced ~300ms apart every
      // time. Assert at least one observed gap deviates from the configured
      // base by more than a generous 10ms scheduler-noise band — real jitter
      // (typically proportional, e.g. +/-20%) clears this easily; a
      // deterministic unjittered sleep(300) would not.
      const gaps: number[] = [];
      for (let i = 1; i < hits.length; i++) gaps.push(hits[i] - hits[i - 1]);
      expect(gaps.length).toBeGreaterThanOrEqual(1);
      const anyJittered = gaps.some((g) => Math.abs(g - 300) > 10);
      expect(anyJittered).toBe(true);
    } finally {
      server.close();
    }
  });

  test("(b) a genuinely absent endpoint is classified down and does NOT retry to exhaustion", async () => {
    // Bind then close BEFORE the request fires: guarantees a port nothing is
    // listening on (real ECONNREFUSED from the OS), distinct from the
    // "refuses" server above, which accepts the TCP connection before
    // resetting it. Awaited so the port is provably free first — a
    // fire-and-forget close() could race the subprocess's first connect.
    const probe = createServer();
    await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
    const address = probe.address();
    if (!address || typeof address === "string") throw new Error("failed to bind probe port");
    const port = address.port;
    await new Promise<void>((resolve) => probe.close(() => resolve()));

    const dir = tmpDir("llm-absent-");
    const scriptPath = writeRunCompleteScript(dir);

    const result = await runComplete(scriptPath, {
      CIRCADIAN_LLM_BASE_URL: `http://127.0.0.1:${port}/v1`,
      CIRCADIAN_LLM_RETRIES: "3",
      // A generous backoff: if the implementation retried to exhaustion
      // despite the endpoint being down, this run would take >= 600ms.
      CIRCADIAN_LLM_RETRY_BACKOFF_MS: "300,300,300",
    });

    expect(result.ok).toBe(false);
    // Down must stop, not retry into the ground: elapsed time must stay
    // far under one full configured backoff interval (300ms), proving no
    // backoff sleep — let alone the full 600ms two-sleep exhaustion path —
    // ever ran.
    expect(result.elapsedMs).toBeLessThan(150);
  });
});

describe("llm.ts — cross-process concurrency cap (rem-storm Task C, CORD-ruled N=1)", () => {
  test("(c) the cap serializes calls across two REAL separate processes, not just within one", async () => {
    const callDurationMs = 400;
    const fake = startFakeLlmServer(callDurationMs);
    const home = tmpDir("llm-cap-home-");
    const scriptsDir = tmpDir("llm-cap-scripts-");
    const scriptPath = writeRunCompleteScript(scriptsDir);

    const env = {
      ...process.env,
      CIRCADIAN_HOME: home,
      CIRCADIAN_LLM_BASE_URL: fake.url,
      // Named env override, house style (mirrors CIRCADIAN_LLM_RETRIES,
      // src/llm.ts:58) for the CORD-ruled cap of 1 concurrent call against
      // the shared local LLM service. See criteria-C.md for why this exact
      // name is the assumed contract.
      CIRCADIAN_LLM_MAX_CONCURRENT: "1",
      CIRCADIAN_LLM_RETRIES: "1",
    };

    try {
      const t0 = Date.now();
      const [a, b] = await Promise.all([
        spawnOnce(scriptPath, env),
        spawnOnce(scriptPath, env),
      ]);
      const totalElapsed = Date.now() - t0;

      expect(a.ok).toBe(true);
      expect(b.ok).toBe(true);

      // Ground truth for "did they actually overlap": the fake server's own
      // per-request [start,end] log, timestamped server-side — not the
      // subprocess's self-reported timing, which a broken cap could still
      // make look serial by accident of scheduling.
      expect(fake.log.length).toBe(2);
      const [first, second] = [...fake.log].sort((x, y) => x.start - y.start);
      const overlapMs = Math.max(0, first.end - second.start);
      // Under a real cap of 1, the second request cannot start its
      // server-side work until the first has finished holding the slot,
      // released it, and the second acquired it. Allow a small epsilon for
      // scheduling noise; an uncapped implementation would overlap for
      // nearly the full callDurationMs (400ms), which this threshold easily
      // catches.
      expect(overlapMs).toBeLessThanOrEqual(50);

      // Corollary: two truly serialized 400ms calls take noticeably longer
      // in total wall time than two truly parallel ones would (~400ms).
      expect(totalElapsed).toBeGreaterThanOrEqual(callDurationMs * 2 - 100);
    } finally {
      fake.stop();
    }
  });

  test("(c-supplement) the cap's slot is held per-call and released immediately after, not across calls", async () => {
    // Two SEQUENTIAL complete() calls from the SAME process must not
    // deadlock against themselves: if the cap were held across calls
    // instead of per-call, the second call in the same process would hang
    // waiting on a slot the first call never released.
    const fake = startFakeLlmServer(50);
    const home = tmpDir("llm-cap-seq-home-");
    const scriptsDir = tmpDir("llm-cap-seq-scripts-");
    const scriptPath = join(scriptsDir, "run-two-completes.mjs");
    writeFileSync(
      scriptPath,
      `
        import { complete } from ${JSON.stringify(LLM_TS)};
        const t0 = Date.now();
        await complete("first", { timeoutMs: 4000, maxTokens: 16 });
        await complete("second", { timeoutMs: 4000, maxTokens: 16 });
        process.stdout.write(JSON.stringify({ ok: true, elapsedMs: Date.now() - t0 }));
      `,
    );
    try {
      // Async spawn, not spawnSync: spawnSync would block this process's
      // event loop for its whole duration, starving the in-process fake
      // LLM server's own fetch handler (same hazard as test (a) above).
      const parsed = await spawnOnce(scriptPath, {
        ...process.env,
        CIRCADIAN_HOME: home,
        CIRCADIAN_LLM_BASE_URL: fake.url,
        CIRCADIAN_LLM_MAX_CONCURRENT: "1",
        CIRCADIAN_LLM_RETRIES: "1",
      });
      expect(parsed.ok).toBe(true);
      // Two 50ms calls back to back in one process: if the slot leaked
      // (held across calls) the second call would hang until some other
      // holder released it — there is none, so it would time out at 4000ms.
      // A correctly-released-per-call cap finishes in well under 1s.
      expect((parsed as any).elapsedMs).toBeLessThan(1000);
    } finally {
      fake.stop();
    }
  });
});

function spawnOnce(
  scriptPath: string,
  env: Record<string, string | undefined>,
): Promise<{ ok: boolean; message?: string; elapsedMs: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(BUN_BIN, [scriptPath], { env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => {
      if (!stdout.trim()) {
        reject(new Error(`subprocess exited ${code} with no stdout; stderr: ${stderr}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch (err) {
        reject(new Error(`subprocess stdout was not JSON: ${stdout}; stderr: ${stderr}`));
      }
    });
    child.on("error", reject);
  });
}
