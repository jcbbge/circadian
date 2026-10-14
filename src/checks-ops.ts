/** An explicit live read check; no inference, extraction replay or memory writes. */
import * as path from "node:path";
import { readExtensions } from "./extensions.ts";
import { memoryView, memoryExpand } from "./views.ts";
import { memoryCheck } from "./memory-check.ts";

export function checkMemoryChecks(home: string) {
  const state = readExtensions(home);
  if (state.error) return { check: "FAIL", detail: state.error };
  if (!state.checks) return { check: "OFF", detail: "Memory checks are disabled. Enable with: circadian extensions enable checks" };
  const mind = path.join(home, "mind");
  const view = memoryView(mind, "global", { chars: 128000, maxRecords: 1, scanCap: 10000 });
  if (view.kind !== "view") return { check: "FAIL", detail: view.reason };
  if (!view.records.length) return { check: "INCOMPLETE", detail: "No eligible global memory fit; source binding was not exercised." };
  const ref = view.records[0].ref;
  const expansion = memoryExpand(mind, [ref], { chars: 128000 });
  if (expansion.kind !== "expansion") return { check: "FAIL", detail: expansion.reason };
  const entry = expansion.entries[0];
  if (entry?.status !== "available") return { check: "INCOMPLETE", detail: "Current evidence is unavailable or changed; no success is claimed." };
  const source = entry.sources.find(source => source.status === "available" && source.content?.trim());
  if (!source || source.status !== "available" || !source.content) return { check: "INCOMPLETE", detail: "No nonempty current source was available." };
  const start = source.content.search(/\S/);
  let end = Math.min(source.content.length, start + 128);
  // Half-open UTF-16 spans must not split a surrogate pair.
  if (end < source.content.length && /[\uD800-\uDBFF]/.test(source.content[end - 1]) && /[\uDC00-\uDFFF]/.test(source.content[end])) end--;
  const result = memoryCheck(mind, { refs: [ref], selections: [{ atomId: ref.id, source: source.source, sourceRevision: source.revision, start, end }], chars: 32000 });
  if (result.kind !== "check") return { check: "FAIL", detail: result.reason };
  const selected = result.selections[0];
  const passed = selected?.status === "source-current-exact" && selected.quote === source.content.slice(start, end)
    && !!selected.label && selected.semantic === "UNKNOWN" && JSON.stringify(result).length <= 32000;
  return { check: passed ? "PASS" : "INCOMPLETE", detail: passed
    ? "Live source selection matches current evidence exactly, with a source label and semantic UNKNOWN. No model was called and no memory was written."
    : "Source binding changed or was unavailable; no exact match is claimed." };
}
