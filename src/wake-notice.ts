// wake-notice.ts — the one line that tells the OPERATOR, at session start,
// whether memory loaded (brief 22).
//
// A wake's payload reaches the model, not the person: Claude Code adds plain
// SessionStart stdout to the model's context only, and the statusLine strip
// under the input is the only circadian surface on screen. So each harness
// also shows this notice where the operator looks — Claude Code through the
// SessionStart hook's `systemMessage` (status.ts --line), Pi through
// ctx.ui.notify (circadian-mind.ts). One wording for both, built here.

import { WAKE_PARTS } from "./wake-payload.ts";

export const STRIP_PREFIX = "circadian · ";

/** Loud on purpose: a session that started without its memory must say so. */
export const WAKE_NOT_DELIVERED = "circadian · WAKE NOT DELIVERED this session · see logs/circadian.events.jsonl";

/** The notice for a wake that delivered `parts` parts in `scope` (null: no
 * wake reached this session). `strip` is the vitals strip (status.ts
 * buildLine); its leading "circadian · " is not repeated. A wake cut into
 * more parts than there are hook slots delivers only WAKE_PARTS of them whole,
 * and the count says so. */
export function wakeNotice(wake: { scope?: string; parts: number } | null, strip: string): string {
  if (!wake) return WAKE_NOT_DELIVERED;
  const vitals = strip.startsWith(STRIP_PREFIX) ? strip.slice(STRIP_PREFIX.length) : strip;
  const delivered = Math.min(wake.parts, WAKE_PARTS);
  return `circadian · memory loaded · scope ${wake.scope || "unknown"} · ${delivered} of ${wake.parts} parts${vitals ? ` · ${vitals}` : ""}`;
}

/** The scope a whole (unsplit) wake payload names on its first line,
 * `Resolved scope: <scope>`; undefined when the line is absent. */
export function payloadScope(payload: string): string | undefined {
  const m = /^Resolved scope: (\S+)/.exec(payload);
  return m ? m[1] : undefined;
}
