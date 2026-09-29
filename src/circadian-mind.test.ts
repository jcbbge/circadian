import { afterAll, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { acquireNativeSessionFile } from "./circadian-mind.ts";
import { WAKE_NOT_DELIVERED } from "./wake-notice.ts";

// Exercise the installed harness, not a stand-in for its persistence behavior.
const pi = Bun.which("pi");
const native = pi
  ? await import(join(dirname(dirname(dirname(realpathSync(pi)))), "dist/core/session-manager.js"))
  : undefined;
const root = mkdtempSync(join(tmpdir(), "circadian-native-session-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const nativeTest = test.skipIf(!native);
function session() {
  return native!.SessionManager.create(root, mkdtempSync(join(root, "custom-store-")));
}
function converse(manager: ReturnType<typeof session>) {
  manager.appendMessage({ role: "user", content: "test message", timestamp: Date.now() });
  manager.appendMessage({
    role: "assistant", content: [{ type: "text", text: "test reply" }],
    api: "openai-responses", provider: "test", model: "test", timestamp: Date.now(),
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: "stop",
  });
}

nativeTest("unused native session is empty despite its not-yet-created path", () => {
  expect(acquireNativeSessionFile(session()).kind).toBe("empty");
});
nativeTest("user input without an assistant reply is NOT empty", () => {
  const manager = session();
  manager.appendMessage({ role: "user", content: "must not disappear", timestamp: Date.now() });
  expect(acquireNativeSessionFile(manager).kind).toBe("degraded");
});
nativeTest("native history in a custom directory is acquired", () => {
  const manager = session();
  converse(manager);
  expect(acquireNativeSessionFile(manager)).toMatchObject({ kind: "persisted", path: manager.getSessionFile() });
});
nativeTest("deleted native history is not an empty session", () => {
  const manager = session();
  converse(manager);
  unlinkSync(manager.getSessionFile());
  expect(acquireNativeSessionFile(manager).kind).toBe("degraded");
});
nativeTest("a different session header is rejected, not consumed", () => {
  const manager = session();
  converse(manager);
  writeFileSync(manager.getSessionFile(), JSON.stringify({ type: "session", id: "other" }) + "\n");
  expect(acquireNativeSessionFile(manager).kind).toBe("degraded");
});
nativeTest("malformed and zero-byte native files are degraded", () => {
  const manager = session();
  converse(manager);
  for (const content of ["not json", ""]) {
    writeFileSync(manager.getSessionFile(), content);
    expect(acquireNativeSessionFile(manager).kind).toBe("degraded");
  }
});
nativeTest("explicit in-memory mode stays distinct from emptiness", () => {
  expect(acquireNativeSessionFile(native!.SessionManager.inMemory(root)).kind).toBe("ephemeral");
});

// ---- the wake notice (brief 22), through the installed pi itself ----
// `pi --mode rpc` loads this extension like any session does and carries
// ctx.ui.notify out as an `extension_ui_request` line on stdout: the real
// harness, a real wake.ts run, nothing stood in for.
const piTest = test.skipIf(!pi);

/** A CIRCADIAN_HOME whose src/ is this checkout's, with a templates mind
 * and one active scope `proj` at <home>/project. */
function circadianHome(opts: { withSrc: boolean }): { home: string; project: string } {
  const home = mkdtempSync(join(root, "home-"));
  const project = join(home, "project");
  cpSync(join(import.meta.dir, "..", "templates"), join(home, "mind"), { recursive: true });
  mkdirSync(project);
  writeFileSync(join(home, "mind", "scopes.tsv"), `proj\t${project}\tactive\n`);
  // A wake today already happened: no first-of-day scorecard in this run.
  writeFileSync(join(home, "mind", "scoreboard.jsonl"), JSON.stringify({ type: "wake", ts: new Date().toISOString(), scope: "proj" }) + "\n");
  if (opts.withSrc) symlinkSync(import.meta.dir, join(home, "src"));
  return { home, project };
}

/** Start pi with only this extension, collect every notify it sends while
 * the session starts, then end the session. */
async function piNotifies(home: string, cwd: string): Promise<{ message: string; notifyType?: string }[]> {
  const env: Record<string, string> = { ...(process.env as Record<string, string>), CIRCADIAN_HOME: home,
    PI_CODING_AGENT_DIR: join(home, "pi-agent"), CIRCADIAN_INVOCATION_LEDGER: "off", CIRCADIAN_STATUSLINE_CACHE: "off" };
  for (const k of ["CIRCADIAN_ROLE", "CIRCADIAN_SCOPE", "CIRCADIAN_LANE", "CIRCADIAN_INTERNAL", "CIRCADIAN_SESSION"]) delete env[k];
  const child = Bun.spawn([pi!, "--mode", "rpc", "--no-session", "--offline", "--no-extensions", "-e", join(import.meta.dir, "circadian-mind.ts"),
    "--no-skills", "--no-context-files", "--no-prompt-templates", "--no-themes"], { cwd, env, stdin: "pipe", stdout: "pipe", stderr: "ignore" });
  const notifies: { message: string; notifyType?: string }[] = [];
  const reader = child.stdout.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const collect = (async () => {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        try {
          const msg = JSON.parse(line);
          if (msg.type === "extension_ui_request" && msg.method === "notify") notifies.push(msg);
        } catch { /* not a JSON record */ }
      }
    }
  })();
  const deadline = Date.now() + 20_000;
  while (notifies.length === 0 && Date.now() < deadline) await Bun.sleep(50);
  await Bun.sleep(1500); // room for a second notify, which must not come
  child.stdin.end();
  await Promise.race([collect, Bun.sleep(5000)]);
  child.kill();
  await child.exited;
  return notifies;
}

piTest("session_start notifies the operator once: memory loaded, the scope wake resolved, 1 of 1 parts, the strip", async () => {
  const { home, project } = circadianHome({ withSrc: true });
  const notifies = await piNotifies(home, project);
  expect(notifies).toHaveLength(1);
  expect(notifies[0].notifyType).toBe("info");
  expect(notifies[0].message).toMatch(/^circadian · memory loaded · scope proj · 1 of 1 parts · wake \S+ ago · /);
}, 40000);

piTest("a wake that gave no output notifies once, loudly, as an error", async () => {
  const { home, project } = circadianHome({ withSrc: false }); // no src/wake.ts to run
  const notifies = await piNotifies(home, project);
  expect(notifies).toEqual([expect.objectContaining({ message: WAKE_NOT_DELIVERED, notifyType: "error" })]);
}, 40000);
