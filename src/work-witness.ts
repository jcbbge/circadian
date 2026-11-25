#!/usr/bin/env bun
/** Circadian side of the optional hire callback and Durable Streams subscriber.
 * Raw submissions live exclusively on write-only fm/rivet-* refs. Only a
 * verified terminal conclusion is materialized in the operator mind. */
import * as fs from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { publish } from "./publish.ts";

const keyPattern = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/;
const stepPattern = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
export const workLane = (task: string) => `rivet-${hash(task).slice(0, 48)}`;
export type WorkEvent = { seq: number; when: string; what: string; step?: string; data?: {
  who?: string; at?: string; accepted?: string | null; result?: string; answer?: string; child?: string;
} };
export type Page = { events: WorkEvent[]; offset: string; caughtUp: boolean };
type Reader = (task: string, offset: string) => Promise<Page>;

export const readWorkPage: Reader = async (task, offset) => {
  if (!keyPattern.test(task)) throw new Error("invalid task key");
  const url = new URL(`http://127.0.0.1:8642/durable-streams/v1/stream/task/${encodeURIComponent(task)}`);
  url.searchParams.set("offset", offset);
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(350) });
  const next = response.headers.get("stream-next-offset");
  if (!response.ok || !next) throw new Error("task stream unavailable");
  const events = await response.json();
  if (!Array.isArray(events)) throw new Error("invalid task stream page");
  return { events, offset: next, caughtUp: response.headers.get("stream-up-to-date") === "true" };
};

export async function workBrief(context: unknown, reader = readWorkPage): Promise<string> {
  const { task, step } = (context ?? {}) as { task?: string; step?: string };
  if (typeof task !== "string" || !keyPattern.test(task) || typeof step !== "string" ||
      step.length > 128 || !stepPattern.test(step)) throw new Error("invalid hire context");
  // Never read a mind file here. The normal hiring packet already carries the
  // assignment and accepted inherited results; use only this step's rulings.
  const parts = [`Circadian work wake · ${task}`, `Step intent: follow the current ${step} brief and its evidence checks.`,
    `Lane: fm/${workLane(task)} (SAGT)`];
  let offset = "-1";
  const corrections = new Set<string>();
  try {
    do {
      const page = await reader(task, offset);
      for (const row of page.events)
        if (row.what === "nqAnswer" && row.step === step && typeof row.data?.answer === "string")
          corrections.add(row.data.answer);
      if (page.caughtUp || page.offset === offset) break;
      offset = page.offset;
    } while (true);
  } catch { /* a missing stream must not substitute personal memory */ }
  for (const item of corrections) {
    const correction = "Ruling: " + item.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
    if (Buffer.byteLength([...parts, correction].join("\n"), "utf8") > 7000) break;
    parts.push(correction);
  }
  return parts.join("\n");
}

function git(mind: string, args: string[], input?: string, index?: string): string | null {
  const result = spawnSync("git", ["-C", mind, ...args], { input, encoding: "utf8",
    env: index ? { ...process.env, GIT_INDEX_FILE: index } : process.env, stdio: ["pipe", "pipe", "ignore"] });
  return result.status === 0 ? result.stdout.trim() : null;
}

function writeAttempt(mind: string, task: string, filename: string, content: string): void {
  const ref = `refs/heads/fm/${workLane(task)}`;
  const dir = git(mind, ["rev-parse", "--absolute-git-dir"]);
  if (!dir) throw new Error("mind is not a repository");
  const index = join(dir, "index-witness-" + randomUUID());
  const requireGit = (args: string[], input?: string) => {
    const result = git(mind, args, input, index);
    if (result === null) throw new Error("task lane write failed");
    return result;
  };
  try {
    const old = git(mind, ["rev-parse", "--verify", ref]);
    if (old && git(mind, ["cat-file", "-e", `${old}:episodes/${filename}`]) !== null) return;
    requireGit(["read-tree", ...(old ? [old] : ["--empty"])]);
    const blob = requireGit(["hash-object", "-w", "--stdin"], content);
    requireGit(["update-index", "--add", "--cacheinfo", "100644", blob, `episodes/${filename}`]);
    const tree = requireGit(["write-tree"]);
    const tip = requireGit(["commit-tree", tree, ...(old ? ["-p", old] : []), "-m", "witness: retain task attempt"]);
    // No root checkout, index, or published ref is altered. On a CAS loss the
    // page is retried from its durable offset rather than dropping a record.
    requireGit(["update-ref", ref, tip, old ?? ""]);
  } finally { fs.rmSync(index, { force: true }); }
}

type Submission = { who: string; filename: string };
type State = { offset: string; seq: number; pending: Record<string, Submission>; accepted: Record<string, Submission>; children: string[]; terminal: boolean };
const init = (): State => ({ offset: "-1", seq: 0, pending: {}, accepted: {}, children: [], terminal: false });
const episode = (task: string, timestamp: string, body: string, lane?: string) =>
  `---\nts: ${timestamp}\nscope: ${workLane(task)}\narc: Rivet ${lane ? "attempt" : "accepted conclusion"}\nobserver: hand\nattestation: unattested\n${lane ? `lane: ${lane}\n` : ""}---\n\n${body}\n`;

/** Pull all currently available pages. The Git publication receipt protects
 * the window after publish and before the offset checkpoint is written. */
export async function witnessTask(
  mind: string, stateDir: string, task: string, reader = readWorkPage,
  beforeCheckpoint?: () => void,
): Promise<string[]> {
  if (!keyPattern.test(task)) throw new Error("invalid task key");
  const key = hash(task);
  const file = join(stateDir, `${key}.json`);
  const state: State = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : init();
  while (!state.terminal) {
    const page = await reader(task, state.offset);
    for (const row of page.events) {
      if (!row || !Number.isSafeInteger(row.seq) || row.seq <= state.seq) continue;
      state.seq = row.seq;
      const data = row.data;
      if (row.what === "chain.child.started" && data?.child && keyPattern.test(data.child) &&
          !state.children.includes(data.child)) state.children.push(data.child);
      if (row.step && stepPattern.test(row.step) && row.what === "stepFinish" &&
          typeof data?.who === "string" && typeof data.at === "string" && !Number.isNaN(Date.parse(data.at)) &&
          typeof data.result === "string") {
        const at = new Date(data.at).toISOString();
        const sub = { who: data.who, filename: `${at.slice(0, 10)}-${row.seq}.md` };
        state.pending[row.step] = sub;
        writeAttempt(mind, task, sub.filename, episode(task, at, data.result, workLane(task)));
        if (typeof data.accepted === "string") { state.accepted[row.step] = sub; state.terminal = true; }
      }
      if (row.step && row.what === "grammar.step.not-done") {
        delete state.pending[row.step];
        delete state.accepted[row.step];
      }
      if (row.step && row.what === "grammar.step.verified") {
        const pending = state.pending[row.step];
        if (pending && data?.who === pending.who) state.accepted[row.step] = pending;
      }
      if (row.what === "grammar.done") state.terminal = true;
      if (!state.terminal) continue;
      const at = new Date(row.when).toISOString();
      const accepted = Object.entries(state.accepted).map(([step, sub]) => {
        const contents = git(mind, ["show", `refs/heads/fm/${workLane(task)}:episodes/${sub.filename}`]);
        const body = contents?.indexOf("\n---\n\n") ?? -1;
        if (!contents || body < 0) throw new Error("accepted task attempt is unavailable");
        return `## ${step}\n\n${contents.slice(body + 6)}`;
      });
      if (accepted.length) publish(mind, { id: `rivet-${key}`, subject: "witness: land accepted task conclusion",
        files: { [`episodes/${at.slice(0, 10)}-rivet-${key}.md`]:
          episode(task, at, `Task: ${task}\n\nTerminal stream event: ${row.seq}\n\n` +
            accepted.join("\n\n")) } });
      break;
    }
    const old = state.offset;
    state.offset = page.offset;
    beforeCheckpoint?.();
    fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
    const tmp = file + "." + randomUUID();
    try { fs.writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 }); fs.renameSync(tmp, file); }
    finally { fs.rmSync(tmp, { force: true }); }
    if (page.caughtUp || page.offset === old) break;
  }
  return state.children;
}

if (import.meta.main) {
  if (process.argv[2] === "--subscribe") {
    const home = process.env.CIRCADIAN_HOME || join(homedir(), "circadian");
    const queue = process.argv.slice(3);
    if (!queue.length) throw new Error("usage: work-witness.ts --subscribe <work-task>...");
    const seen = new Set<string>();
    for (const task of queue) {
      if (seen.has(task)) continue;
      seen.add(task);
      queue.push(...await witnessTask(join(home, "mind"), join(home, "logs", "witness"), task));
    }
  } else {
    console.log(await workBrief(JSON.parse(await Bun.stdin.text())));
  }
}
