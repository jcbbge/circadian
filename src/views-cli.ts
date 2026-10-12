/** Optional whole-record views through the existing command-line door. */
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { requireViews, setViewsEnabled } from "./extensions.ts";
import { memoryView, memoryExpand, type ViewRef } from "./views.ts";
import { correlation, degraded, ok } from "./obs.ts";
import { checkViews, viewsStatus } from "./views-ops.ts";

export const viewsHelp = `Circadian coordinated views — optional reads of whole memories and their evidence.

  circadian extensions status                 Show ON/OFF and the last recorded request
  circadian extensions check views            Exercise a live view and evidence expansion
  circadian extensions enable views           Turn on for this machine
  circadian extensions disable views          Turn off; ordinary memory continues
  circadian view global                       Read a bounded JSON view of global memories
  circadian view <scope> --chars 6000 --scan-cap 2000
  circadian expand <id>@<revision>             Expand a ref returned by view

Controls and checks print readable text; add --json for automation.
View/expand return JSON. Views keep whole records; inspect coverage and entry statuses.
View options: --chars N, --max-records N, --scan-cap N. Expand: --chars N, --scan-cap N.
Agents use memory_view / memory_expand when a task needs past context or evidence.
Enabled wake sessions explain usage. Existing MCP sessions need reconnect/new session;
Pi needs /reload for newly registered tools. CLI access works immediately.
ON is configuration; a recent request is use; neither proves an answer used memory well.
Guide: docs/COORDINATED-VIEWS.md`;

function options(args: string[], expanding: boolean): { terms: string[]; options: { chars?: number; maxRecords?: number; scanCap?: number } } {
  const terms: string[] = [], result: { chars?: number; maxRecords?: number; scanCap?: number } = {};
  const flags: Record<string, keyof typeof result> = { "--chars": "chars", "--scan-cap": "scanCap", ...(!expanding ? { "--max-records": "maxRecords" as const } : {}) };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith("-")) { terms.push(arg); continue; }
    const key = flags[arg];
    if (!key) throw new Error(`unknown option: ${arg}`);
    if (result[key] !== undefined) throw new Error(`duplicate option: ${arg}`);
    const value = args[++i];
    if (!/^\d+$/.test(value ?? "") || !Number.isSafeInteger(Number(value))) throw new Error(`${arg} requires a nonnegative integer`);
    result[key] = Number(value);
  }
  return { terms, options: result };
}

export async function viewsMain(home: string, args: string[]): Promise<void> {
  if (!args.length || (args.length === 1 && ["help", "--help", "-h"].includes(args[0])) ||
    (args.length === 2 && ["extensions", "view", "expand"].includes(args[0]) && ["help", "--help", "-h"].includes(args[1]))) {
    console.log(viewsHelp); return;
  }
  const start = performance.now(), corr = correlation("views");
  const [command, ...rest] = args;
  const json = command !== "extensions" || rest.includes("--json");
  try {
    let data: unknown;
    if (command === "extensions") {
      if (rest.filter(arg => arg === "--json").length > 1) throw new Error("duplicate option: --json");
      const controls = rest.filter(arg => arg !== "--json");
      if (!controls.length || (controls.length === 1 && controls[0] === "status")) data = viewsStatus(home);
      else if (controls.length === 2 && controls[0] === "check" && controls[1] === "views") data = checkViews(home);
      else if (controls.length === 2 && ["enable", "disable"].includes(controls[0]) && controls[1] === "views") {
        data = setViewsEnabled(home, controls[0] === "enable");
        // Controls run at human frequency. Await a bounded, existing status render
        // so a successful disable does not leave the operator looking at views ON.
        if (process.env.CIRCADIAN_STATUSLINE_CACHE !== "off") {
          const refreshed = spawnSync(process.execPath, [path.join(import.meta.dir, "status.ts"), "--line", "--write-cache"],
            { env: { ...process.env, CIRCADIAN_HOME: home }, stdio: "ignore", timeout: 5000 });
          if (refreshed.status !== 0) console.error("Views setting saved; the status strip could not refresh. Run circadian extensions status for the current setting.");
        }
      }
      else throw new Error(viewsHelp);
    } else if (command === "view" || command === "expand") {
      const parsed = options(rest, command === "expand");
      if (command === "view") {
        if (parsed.terms.length !== 1 || parsed.terms[0].length > 80 || !/^[a-z0-9][a-z0-9_-]*$/.test(parsed.terms[0])) throw new Error("view requires one scope slug (up to 80 lowercase letters, digits, underscores or hyphens)");
        requireViews(home);
        data = await memoryView(path.join(home, "mind"), parsed.terms[0], parsed.options);
      } else {
        if (!parsed.terms.length || parsed.terms.length > 10000) throw new Error("expand requires 1 to 10000 id@revision references");
        const refs: ViewRef[] = parsed.terms.map(term => {
          if (!/^[a-f0-9]{12}@[a-f0-9]{64}$/.test(term)) throw new Error("expand requires each reference as a 12-hex atom id@64-hex revision from a view");
          const [id, revision] = term.split("@");
          return { id, revision };
        });
        requireViews(home);
        data = await memoryExpand(path.join(home, "mind"), refs, parsed.options);
      }
    } else throw new Error(viewsHelp);

    const result = data as { kind?: string; error?: string; reason?: string; views?: boolean; check?: string; detail?: string; configFile?: string; lastRequest?: { at: string; operation: string; surface: string; outcome: string } | null; activityError?: string; coverage?: { complete: boolean; inspected: number; included: number; omitted: number; unresolved: number }; complete?: boolean; inspected?: number; entries?: { status: string; sources?: { status: string }[] }[] };
    if (json) console.log(JSON.stringify(data));
    else if (result.check) console.log(`Views check: ${result.check}\n${result.detail}\nThis checks the local reader, not whether an agent followed its instructions.`);
    else {
      console.log(`Coordinated views: ${result.views ? "ON" : "OFF"}${result.error ? `\n${result.error}` : ""}`);
      if (result.configFile) {
        console.log(`Configuration: ${result.configFile}`);
        const request = result.lastRequest;
        console.log(request ? `Last recorded request: ${request.at} · ${request.surface} ${request.operation} · ${request.outcome}` : "No view/expand request found in the last 64 KiB of activity.");
        if (result.activityError) console.log(result.activityError);
        console.log("Check now: circadian extensions check views\nDisable: circadian extensions disable views");
      } else console.log(result.views ? "New wake sessions advertise usage. Reconnect existing MCP sessions or /reload Pi to discover tools." : "New view/expand calls are blocked immediately. Ordinary Circadian memory continues.");
    }
    const failed = !!result.error || result.check === "FAIL" || (!!result.kind && !["view", "expansion"].includes(result.kind));
    const partial = result.coverage?.complete === false || result.complete === false || result.entries?.some(entry => entry.status !== "available" || entry.sources?.some(source => source.status !== "available"));
    const counts = result.coverage ? result.coverage : result.entries ? { inspected: result.inspected, entries: result.entries.length, available: result.entries.filter(entry => entry.status === "available").length } : {};
    const event = { process: "ops" as const, phase: `cli-${command}`, correlation_id: corr, summary: failed ? "optional memory request rejected" : partial ? "optional memory request returned partial coverage" : "optional memory request completed", context: { ...counts, ms: Math.round(performance.now() - start), ...(partial ? { complete: false } : {}) } };
    if (failed) degraded({ ...event, cause: result.error || result.reason || "request failed", next_action: "check extension status and command arguments" });
    else ok(event);
    if (failed) process.exitCode = 1;
    else if (result.check && result.check !== "PASS") process.exitCode = 2;
  } catch (error) {
    const reason = (error as Error).message;
    console.log(json ? JSON.stringify({ kind: "invalid-input", reason }) : reason);
    degraded({ process: "ops", phase: `cli-${command}`, correlation_id: corr, summary: "optional memory request rejected", cause: reason, next_action: "check extension status and command arguments" });
    process.exitCode = 1;
  }
}
