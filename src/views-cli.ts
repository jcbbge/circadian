/** Optional whole-record views through the existing command-line door. */
import * as path from "node:path";
import { readExtensions, requireViews, setViewsEnabled } from "./extensions.ts";
import { memoryView, memoryExpand, type ViewRef } from "./views.ts";
import { correlation, degraded, ok } from "./obs.ts";

const usage = "circadian extensions [status | enable views | disable views] | view <scope> [--chars N] [--max-records N] [--scan-cap N] | expand <id>@<revision> [...] [--chars N] [--scan-cap N]";

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
  const start = performance.now(), corr = correlation("views");
  const [command, ...rest] = args;
  try {
    let data: unknown;
    if (command === "extensions") {
      if (!rest.length || (rest.length === 1 && rest[0] === "status")) data = readExtensions(home);
      else if (rest.length === 2 && ["enable", "disable"].includes(rest[0]) && rest[1] === "views") data = setViewsEnabled(home, rest[0] === "enable");
      else throw new Error(usage);
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
    } else throw new Error(usage);

    console.log(JSON.stringify(data));
    const result = data as { kind?: string; error?: string; reason?: string; coverage?: { complete: boolean; inspected: number; included: number; omitted: number; unresolved: number }; complete?: boolean; inspected?: number; entries?: { status: string; sources?: { status: string }[] }[] };
    const failed = !!result.error || (!!result.kind && !["view", "expansion"].includes(result.kind));
    const partial = result.coverage?.complete === false || result.complete === false || result.entries?.some(entry => entry.status !== "available" || entry.sources?.some(source => source.status !== "available"));
    const counts = result.coverage ? result.coverage : result.entries ? { inspected: result.inspected, entries: result.entries.length, available: result.entries.filter(entry => entry.status === "available").length } : {};
    const event = { process: "ops" as const, phase: `cli-${command}`, correlation_id: corr, summary: failed ? "optional memory request rejected" : partial ? "optional memory request returned partial coverage" : "optional memory request completed", context: { ...counts, ms: Math.round(performance.now() - start), ...(partial ? { complete: false } : {}) } };
    if (failed) degraded({ ...event, cause: result.error || result.reason || "request failed", next_action: "check extension status and command arguments" });
    else ok(event);
    if (failed) process.exitCode = 1;
  } catch (error) {
    const reason = (error as Error).message;
    console.log(JSON.stringify({ kind: "invalid-input", reason }));
    degraded({ process: "ops", phase: `cli-${command}`, correlation_id: corr, summary: "optional memory request rejected", cause: reason, next_action: "check extension status and command arguments" });
    process.exitCode = 1;
  }
}
