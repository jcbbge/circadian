import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { acquireNativeSessionFile } from "./circadian-mind.ts";

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
