// wake-payload.ts — the pure, import-safe core of the WAKE injection.
//
// wake.ts is a SessionStart hook script: it runs runHook() at import time and
// touches the filesystem/child processes, so it can never be imported by a
// test. This module holds ONLY the deterministic string assembly (no I/O, no
// process, no spawn) so buildPayload and its helpers can be unit-tested
// directly (wake-slim, 2026-08-11). wake.ts imports everything here — one
// source of truth (CONSTITUTION-JOSH Article 6).

export const CAP_TOKENS = 15000;

/** Claude Code's cap on one hook output string. SOURCE: Claude Code hooks
 * reference, https://code.claude.com/docs/en/hooks ("JSON output", fetched
 * 2026-09-25): "A hook's additionalContext, systemMessage, and
 * initialUserMessage strings, and its plain stdout, are capped at 10,000
 * characters" — "Claude Code measures each string on its own, even when
 * several hooks run for the same event"; over the limit the output is saved
 * to a file and replaced with "a preview of up to the first 2,000
 * characters", and "this cap has no setting or environment variable to raise
 * it". Observed on hive 2026-09-25 (session b356f077): an 11.9KB wake arrived
 * as a 2KB preview. */
export const HOOK_OUTPUT_LIMIT = 10_000;
/** SessionStart hook slots install.sh wires for WAKE: `wake.ts` is part 1 and
 * `wake.ts --part k` is part k for k = 2..WAKE_PARTS. Enough slots that any
 * payload within the CAP_TOKENS hard cap (chars/4) is delivered whole. */
export const WAKE_PARTS = 8;
/** Headroom each part keeps under HOOK_OUTPUT_LIMIT for its part marker and
 * the trailing newline (and the spool path named in part 1's marker). */
const PART_MARKER_BYTES = 600;

const utf8Bytes = (s: string) => Buffer.byteLength(s, "utf8");

/** Split a payload into ordered parts whose concatenation is the payload,
 * byte for byte. Each part is at most `budget` UTF-8 bytes (bytes bound the
 * character count under any counting, so a byte-sized part is always within
 * a character-sized cap). Cuts prefer section starts (a line opening a
 * `<mind:…>` tag): a section that fits in a part is never split across two.
 * A section larger than a part fills the current part and continues, cut
 * after a newline; a single line longer than the budget is cut at code-point
 * boundaries. Deterministic. */
export function splitForHook(payload: string, budget = HOOK_OUTPUT_LIMIT - PART_MARKER_BYTES): string[] {
  if (budget < 4) throw new Error(`splitForHook budget ${budget} is too small`);
  const sections: string[] = [];
  for (const line of payload.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    if (!sections.length || /^<mind:[a-z-]+[\s>]/.test(line)) sections.push(line);
    else sections[sections.length - 1] += line;
  }
  const parts: string[] = [];
  let current = "";
  let currentBytes = 0;
  const flush = () => { if (current) parts.push(current); current = ""; currentBytes = 0; };
  const add = (text: string, bytes: number) => { current += text; currentBytes += bytes; };
  for (const section of sections) {
    const sectionBytes = utf8Bytes(section);
    if (currentBytes + sectionBytes <= budget) { add(section, sectionBytes); continue; }
    if (sectionBytes <= budget) { flush(); add(section, sectionBytes); continue; }
    for (const line of section.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
      const lineBytes = utf8Bytes(line);
      if (currentBytes + lineBytes <= budget) { add(line, lineBytes); continue; }
      flush();
      if (lineBytes <= budget) { add(line, lineBytes); continue; }
      for (const ch of line) {
        const b = utf8Bytes(ch);
        if (currentBytes + b > budget) flush();
        add(ch, b);
      }
    }
  }
  flush();
  return parts.length ? parts : [""];
}

/** The hook outputs for a Claude Code wake: part k of n is `outputs[k-1]`.
 * A payload that fits one hook output is emitted unchanged (n = 1, no
 * marker). Otherwise part 1 opens with the payload itself — the scoped
 * sections — and closes with a marker naming the other parts and the spool
 * file holding every part, so a missing slot is announced, never silent;
 * parts 2..n open with a continuation marker. Every output (plus the newline
 * the hook prints after it) is within HOOK_OUTPUT_LIMIT. */
export function hookOutputs(payload: string, spoolPath: string): string[] {
  if (utf8Bytes(payload) + 1 <= HOOK_OUTPUT_LIMIT) return [payload];
  const bodies = splitForHook(payload, HOOK_OUTPUT_LIMIT - PART_MARKER_BYTES - utf8Bytes(spoolPath));
  const n = bodies.length;
  return bodies.map((body, i) => {
    const sep = body.endsWith("\n") ? "" : "\n";
    return i === 0
      ? `${body}${sep}[Circadian] WAKE part 1/${n} ends here — Claude Code caps each hook output at ${HOOK_OUTPUT_LIMIT} characters, so parts 2..${n} (the rest, including the constitutions) arrive as separate SessionStart outputs from \`wake.ts --part k\`. If any part is absent from your context, the whole wake is in ${spoolPath}.`
      : `[Circadian] WAKE part ${i + 1}/${n} — continues part ${i} verbatim.\n${body}${sep}[Circadian] WAKE part ${i + 1}/${n} ends here.`;
  });
}
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
 * DOCTRINE section and any open Tensions, drop Motifs and How-we-work. A worker runs a
 * single self-contained brief — it needs the constitution + doctrine + NOW +
 * brief-relevant evidence, not the full ~8k worldview dump (wake-slim,
 * 2026-08-11). Deterministic: cut at the second `## ` heading and retain
 * Tensions if present. If the shape is unexpected (fewer than two headings),
 * return SELF unchanged rather than guess. */
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
  const doctrine = trimmed.slice(headings[0], headings[1]).trim();
  const tension = /^## Tensions\s*$/m.exec(trimmed);
  if (!tension) return doctrine;
  const next = /^##\s+/gm;
  next.lastIndex = tension.index + tension[0].length;
  const end = next.exec(trimmed)?.index ?? trimmed.length;
  return `${doctrine}\n\n${trimmed.slice(tension.index, end).trim()}`;
}

/** Cut USER at `/^##\s+Corrections\b/` through the next `/^##\s+/` or EOF.
 *  Absent heading → return USER unchanged (fail open). Shape rule only —
 *  no date parsing, no aliases (`## Guest book` is not this heading). */
export function plateUser(user: string): string {
  const correctionsRe = /^##\s+Corrections\b/m;
  const match = correctionsRe.exec(user);
  if (!match) return user;

  const start = match.index;
  const afterHeading = user.slice(start + match[0].length);
  const nextHeading = /^##\s+/m.exec(afterHeading);
  const end = nextHeading
    ? start + match[0].length + nextHeading.index
    : user.length;

  const before = user.slice(0, start).replace(/\n+$/, "");
  const after = user.slice(end).replace(/^\n+/, "");
  const joined =
    before.length === 0 ? after : after.length === 0 ? before : `${before}\n\n${after}`;
  const trimmed = joined.trimEnd();
  return user.endsWith("\n") ? `${trimmed}\n` : trimmed;
}

export function correctionsFromUser(user: string): string {
  const match = /^##\s+Corrections\b/m.exec(user);
  if (!match) return "";
  const remaining = user.slice(match.index);
  const next = /^##\s+/gm;
  next.lastIndex = match[0].length;
  return remaining.slice(0, next.exec(remaining)?.index ?? remaining.length).trim();
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
  scope?: string;
  here?: string;
  elsewhere?: string;
  away?: string;
}): string {
  const { self, user, now, greeting, evidence, portfolio, constitution, constitutionJosh, killSwitch, slim, scope, here, elsewhere, away } = files;

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

  // THE CONSTITUTION LAYER (2026-08-09): injected verbatim and whole, above
  // memory in authority (the scoped wake places it after the scoped sections
  // so a size cap can never crowd them out — circ-29). The constitution is
  // never rendered, never re-derived, never
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

  // Executor tiers (3-AGNT/4-SAGT) get the DOCTRINE + Tensions SELF slice; the USER
  // operational file is dropped entirely (a worker follows a self-contained
  // brief — it does not need Josh's day-to-day working preferences). Operator
  // tiers and operator panes keep the full worldview.
  const selfContent = slim ? sliceSelf(self) : self.trim();
  // Corrections is a diary; wake plates the palate; leftover-in-file is not law.
  const userBlocks = slim
    ? []
    : ["<mind:user>", plateUser(user).trim(), "</mind:user>"];

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

  const corrections = scope ? correctionsFromUser(user) : "";
  // Scoped layout, most-needed first (circ-29): a Claude Code hook string
  // over HOOK_OUTPUT_LIMIT reaches the agent only as a 2,000-character
  // preview, and the wake is delivered in ordered parts (splitForHook) of
  // which only part 1 is certain to arrive. So the scope, next move,
  // corrections, USER, the elsewhere footnotes and <mind:here> (NOW, then the
  // greeting, then evidence/away/detail) come first; the constitutions follow
  // verbatim, whole, in the later parts — delivered, never dropped.
  const scoped = scope ? [
    `Resolved scope: ${scope}`,
    ...((now.match(/## (?:Next move|Flight plan)\s*\n+([^\n]+)/i)?.[1]?.trim()) ? [`Next move: ${now.match(/## (?:Next move|Flight plan)\s*\n+([^\n]+)/i)![1].trim()}`] : []),
    "[Circadian] WAKE — memory substrate injection from the mind repo (see mind/MIND-SPEC.md).",
    ...(corrections ? ["<mind:corrections>", corrections, "</mind:corrections>"] : []),
    ...(killSwitch ? ["KILL SWITCH ACTIVE: SELF/USER/greeting withheld this wake."] : scope === "global" ? [] : userBlocks),
    ...(!slim ? ["<mind:elsewhere>", elsewhere || "", "</mind:elsewhere>"] : []),
    `<mind:here scope="${scope}">`,
    "<mind:now>", now.trim(), "</mind:now>",
    ...(!killSwitch && greetingBlock ? ["<mind:greeting>", greetingBlock, "</mind:greeting>"] : []),
    ...(!killSwitch && scope !== "global" && evidence ? [evidence] : []),
    ...(!killSwitch && scope !== "global" && away ? [away] : []),
    ...(!killSwitch && scope !== "global" && here ? [here] : []),
    "</mind:here>",
    ...constitutionBlocks, ...constitutionJoshBlocks,
  ].join("\n").trimEnd() : body;
  const tokens = Math.ceil(scoped.length / 4);
  if (tokens > CAP_TOKENS) {
    // Law 4: never truncate silently — announce loudly and still emit the
    // full payload.
    const warning = `OVER-CAP: payload ${tokens} tokens > ${CAP_TOKENS} — compost required`;
    return scope ? scoped.replace(/^(Resolved scope: [^\n]+\n(?:Next move: [^\n]+\n)?)/, `$1${warning}\n`) : `${warning}\n${scoped}`;
  }
  return scoped;
}
