// wake-payload.ts — the pure, import-safe core of the WAKE injection.
//
// wake.ts is a SessionStart hook script: it runs runHook() at import time and
// touches the filesystem/child processes, so it can never be imported by a
// test. This module holds ONLY the deterministic string assembly (no I/O, no
// process, no spawn) so buildPayload and its helpers can be unit-tested
// directly (wake-slim, 2026-08-11). wake.ts imports everything here — one
// source of truth (CONSTITUTION-JOSH Article 6).

export const CAP_TOKENS = 15000;
export const STALE_MS = 48 * 60 * 60 * 1000;

export function extractLastSleep(nowMd: string): string | null {
  const match = nowMd.match(/##\s*Last sleep\s*\n+\s*([^\n]+)/);
  return match ? match[1].trim() : null;
}

/** Classify a role/name string into the fleet tier it names, or null. The
 * tier is what decides how much memory a pane needs: CORD/ORCH orchestrate
 * (they carry the richer payload), AGNT/SAGT execute a single self-contained
 * brief (they get the slim payload — see buildPayload). */
export type FleetTier = "CORD" | "ORCH" | "AGNT" | "SAGT";
export function classifyFleetTier(s: string): FleetTier | null {
  const stamped = s.match(/^(?:[1-4]-)?(CORD|ORCH|AGNT|SAGT)\b/);
  if (stamped) return stamped[1] as FleetTier;
  const named = s.match(/^(cord|orch|agnt|sagt)[-_]/i);
  if (named) return named[1].toUpperCase() as FleetTier;
  return null;
}

/** Slim the SELF payload for executor-tier workers (3-AGNT/4-SAGT): keep the
 * identity-load DOCTRINE section, drop Motifs and How-we-work. A worker runs a
 * single self-contained brief — it needs the constitution + doctrine + NOW +
 * brief-relevant evidence, not the full ~8k worldview dump (wake-slim,
 * 2026-08-11). Deterministic: cut at the second `## ` heading. If the shape is
 * unexpected (fewer than two headings), return SELF unchanged rather than
 * guess — never silently drop content we cannot bound. */
export function sliceSelf(self: string): string {
  const trimmed = self.trim();
  const headingRe = /^##\s+/gm;
  const headings: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(trimmed)) !== null) {
    headings.push(m.index);
    if (headings.length >= 2) break;
  }
  // Need a first section (headings[0], expected `## Doctrine`) and a second
  // heading to cut before. Without both, keep SELF whole (fail open, not out).
  if (headings.length < 2) return trimmed;
  return trimmed.slice(headings[0], headings[1]).trim();
}

export function buildPayload(files: {
  self: string;
  user: string;
  now: string;
  greeting: string;
  evidence?: string;
  portfolio?: string;
  constitution?: string;
  constitutionJosh?: string;
  killSwitch?: boolean;
  slim?: boolean;
}): string {
  const { self, user, now, greeting, evidence, portfolio, constitution, constitutionJosh, killSwitch, slim } = files;

  const lastSleepRaw = extractLastSleep(now);
  const lastSleepDate = lastSleepRaw ? new Date(lastSleepRaw) : null;
  const isValidDate = lastSleepDate instanceof Date && !isNaN(lastSleepDate.getTime());
  // An unparseable/missing "Last sleep" timestamp is treated as stale — never
  // silently assume freshness when the record is broken.
  const isStale = isValidDate ? Date.now() - lastSleepDate!.getTime() > STALE_MS : true;

  let greetingBlock = greeting.trim();
  if (isStale) {
    const staleLine = isValidDate
      ? `STALENESS WARNING: last sleep was ${lastSleepRaw} — more than 48h ago. Treat NOW.md as potentially outdated.`
      : `STALENESS WARNING: no parseable "Last sleep" timestamp in NOW.md — treating as stale.`;
    greetingBlock = `${staleLine}\n${greetingBlock}`;
  }

  // THE CONSTITUTION LAYER (2026-08-09): injected FIRST, verbatim, above
  // memory. The constitution is never rendered, never re-derived, never
  // decayed — experience has no write access to it (see the poisoning
  // post-mortem: nine days of fleet drills rewrote the rendered SELF into
  // obedience doctrine; the constitution is the layer that cannot be).
  const constitutionBlocks = [
    ...(constitution
      ? ["<mind:constitution>", constitution.trim(), "</mind:constitution>", ""]
      : []),
  ];
  const constitutionJoshBlocks = [
    ...(constitutionJosh
      ? ["<mind:constitution-josh>", constitutionJosh.trim(), "</mind:constitution-josh>", ""]
      : []),
  ];

  // Executor tiers (3-AGNT/4-SAGT) get the DOCTRINE-only SELF slice; the USER
  // operational file is dropped entirely (a worker follows a self-contained
  // brief — it does not need Josh's day-to-day working preferences). Operator
  // tiers and operator panes keep the full worldview.
  const selfContent = slim ? sliceSelf(self) : self.trim();
  const userBlocks = slim
    ? []
    : ["<mind:user>", user.trim(), "</mind:user>"];

  // KILL-SWITCH FAIL-SAFE: when the greeting-fitness kill switch has fired
  // (R7), the memory organs are the failing instrument — SELF/USER/greeting
  // are withheld this wake so a degraded worldview cannot speak with the
  // mind's authority. The constitution and NOW still inject (Law 7: wake
  // always delivers; the constitution is not derived from the failing
  // organ). The decommission decision stays human.
  const body = killSwitch
    ? [
        "[Circadian] WAKE — memory substrate injection from the mind repo (see mind/MIND-SPEC.md).",
        "",
        "KILL SWITCH ACTIVE: greeting fitness failed (R7). SELF/USER/greeting are withheld this wake — constitution and NOW only. The decommission decision is human; do not speak the memory's voice until it is made.",
        "",
        ...constitutionBlocks,
        ...constitutionJoshBlocks,
        "<mind:now>",
        now.trim(),
        "</mind:now>",
      ].join("\n")
    : [
        "[Circadian] WAKE — memory substrate injection from the mind repo (see mind/MIND-SPEC.md).",
        "",
        ...constitutionBlocks,
        "<mind:self>",
        selfContent,
        "</mind:self>",
        "",
        ...constitutionJoshBlocks,
        ...userBlocks,
        "",
        "<mind:now>",
        now.trim(),
        "</mind:now>",
        "",
        // b07: the session-anchored evidence slice, when the relational index
        // surfaced anything relevant to this session's cwd/continuation. Empty
        // string → the block is absent and wake behaves exactly as before.
        ...(evidence ? [evidence, ""] : []),
        // project-status (2026-08-16): portfolio-first framing for operator
        // tiers — project state, not commit recency. Empty → absent.
        ...(portfolio ? [portfolio, ""] : []),
        // The greeting is DATA — the mind's own resuming-mid-thought line as
        // REM rendered it, plus any staleness warning. It carries NO
        // instruction to speak it: whether a session opens by speaking the
        // greeting is role behavior, and it lives in the concierge profile
        // (session-lifecycle law 1 — adapters inject data, never behavior; a
        // mandate here needed per-role suppression, which is how we knew it
        // was in the wrong layer). An empty greeting emits no block.
        ...(greetingBlock ? ["<mind:greeting>", greetingBlock, "</mind:greeting>"] : []),
      ].join("\n");

  const tokens = Math.ceil(body.length / 4);
  if (tokens > CAP_TOKENS) {
    // Law 4: never truncate silently — announce loudly and still emit the
    // full payload.
    return `OVER-CAP: payload ${tokens} tokens > ${CAP_TOKENS} — compost required\n${body}`;
  }
  return body;
}
