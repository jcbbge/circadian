// mutate.ts — the mutation engine. REM no longer rewrites SELF.md; it emits
// mutations and THIS code applies them mechanically.
//
// Why this exists (the flatline post-mortem, 2026-07-24): when REM's task was
// "output the full rewritten SELF.md", the identity function was the rational
// strategy for a small local model — copying input to output carries zero
// validation risk, while a real rewrite risks losing a required heading or
// tripping the runaway guard. The architecture's gradient pointed at
// stagnation, and the model found the attractor. Ten sessions of identical
// greetings later, jrg's gut caught what the telemetry didn't.
//
// The inversion: biology never rewrites the genome each generation — it
// applies mutations. Here, echo is IMPOSSIBLE (there is no document to echo),
// doing nothing costs a signed NO-CHANGE confession that is SPOKEN to jrg at
// the next wake, and a real change (one 40-token mutation line) is cheaper
// than the null action. The gradient now points at motion.
//
// THE SECOND POST-MORTEM (2026-07-24, the accretion wave). The mutation
// engine cured echo and immediately grew the opposite disease. Measured over
// every wave ever committed: 66 anabolic ops applied (DEEPEN/ADD/AMEND), 1
// catabolic (RETRACT/SUPERSEDE). SELF.md went 13,994 -> 29,333 chars in
// twelve waves, monotonic, never once shrinking, until 42% of it was
// near-duplicate text: one HowWeWork bullet repeated 14x, one identity
// sentence 8x, three doctrines sharing the title "Turn-End as Data Anchor".
//
// The root cause was never the missing dup-guard (that is the symptom). It is
// that the GRAMMAR WAS ASYMMETRIC. Doctrine could be retracted or superseded;
// Motifs could be retracted; but HowWeWork and WhoIAm — the two sections that
// duplicated worst — had exactly one verb each, and it was AMEND (append).
// There was no way to say "this bullet already exists, sharpen it" or "this
// identity prose is bloated, tighten it". A model asked to shrink a section
// whose only verb grows it will grow it. The gradient pointed at accretion,
// and the model found the attractor — the SAME failure as the flatline, one
// organ over: the architecture offered one cheap move and got it, forever.
//
// The fix is symmetry, not vigilance. Every section now has a catabolic verb
// as cheap to emit as its anabolic one, dup-collapse is mechanical on every
// append-shaped op (not just DEEPEN), and redundancy is a first-class measured
// number (selfSimilarity) so accretion can never again be invisible. "Store
// the fire, not the ash" needs a hearth that can also be swept.
//
// Grammar (one mutation per line):
//   CONFIRM Doctrine[N]
//   DEEPEN Doctrine[N] :: <why-chain sentence(s), quote where voice matters>
//   SUPERSEDE Doctrine[N] :: <full replacement body for that belief>
//   RETRACT Doctrine[N] :: <reason it no longer earns residence>
//   MERGE Doctrine[N] <- Doctrine[M] :: <unified body> — fold M into N (catabolic)
//   ADD DOCTRINE :: <bold title, no numbering> :: <body with its why-chain>
//   ADD MOTIF :: <one motif line>
//   RETRACT MOTIF :: <exact prefix of the motif line to remove>
//   AMEND HowWeWork :: <one bullet line to add>
//   REVISE HowWeWork :: <prefix> :: <replacement>  — sharpen in place (catabolic)
//   RETRACT HowWeWork :: <prefix>                  — drop a bullet (catabolic)
//   AMEND WhoIAm :: <one sentence appended to the identity prose>
//   REVISE WhoIAm :: <full replacement identity prose> — distill (catabolic)
//   NO-CHANGE :: <work-side justification — will be spoken to jrg at wake>
//
// Every content-bearing mutation is stamped [ep:YYYY-MM-DD] on application if
// the model didn't stamp it itself. CONFIRM refreshes a [confirmed:DATE]
// stamp on the belief — beliefs nobody confirms accumulate visible staleness,
// which is Ebbinghaus decay for free: the evidence trail for future
// compost candidacy lives in the document itself.

export const MUTATION_GRAMMAR = `Mutation grammar (one per line, exactly):
CONFIRM Doctrine[N] :: <evidence>         — this belief earned its residence again this wave (evidence optional but welcome)
DEEPEN Doctrine[N] :: <text>              — append why-chain reasoning to belief N (quotes where voice matters)
SUPERSEDE Doctrine[N] :: <text>           — replace belief N's body entirely (title survives)
RETRACT Doctrine[N] :: <reason>           — remove belief N; the reason is archived
MERGE Doctrine[N] <- Doctrine[M] :: <body> — two beliefs are one; fold M into N with this unified body
ADD DOCTRINE :: <title> :: <body>         — a genuinely new belief with its full why-chain
ADD MOTIF :: <line>                       — a new recurring theme
RETRACT MOTIF :: <prefix>                 — remove the motif whose line starts with this prefix
AMEND HowWeWork :: <bullet>               — add one working-agreement bullet
REVISE HowWeWork :: <prefix> :: <replacement> — rewrite the bullet starting with <prefix>, sharper and shorter
RETRACT HowWeWork :: <prefix>             — remove the bullet starting with <prefix>
AMEND WhoIAm :: <sentence>                — append one sentence to the identity prose
REVISE WhoIAm :: <text>                   — replace the identity prose entirely with a distilled version
NO-CHANGE :: <justification>              — nothing moved; the justification is spoken to jrg at wake

SHRINKING IS REAL WORK. A wave that only appends is a wave that failed to
digest: RETRACT, SUPERSEDE, MERGE, and REVISE carry exactly as much credit as
DEEPEN and ADD. If a section already holds the substance you are about to add,
the correct mutation is CONFIRM or REVISE — never a second copy.`;

export type Mutation =
  | { op: "confirm"; n: number; evidence?: string }
  | { op: "deepen"; n: number; text: string }
  | { op: "supersede"; n: number; text: string }
  | { op: "retract-doctrine"; n: number; reason: string }
  | { op: "merge-doctrine"; into: number; from: number; text: string }
  | { op: "add-doctrine"; title: string; body: string }
  | { op: "add-motif"; line: string }
  | { op: "retract-motif"; prefix: string }
  | { op: "amend-howwework"; bullet: string }
  | { op: "revise-howwework"; prefix: string; replacement: string }
  | { op: "retract-howwework"; prefix: string }
  | { op: "amend-whoiam"; sentence: string }
  | { op: "revise-whoiam"; text: string }
  | { op: "no-change"; justification: string };

/** Ops that can only make the worldview bigger. Used to detect an all-anabolic
 * wave — digestion that never excreted. */
const ANABOLIC_OPS = new Set(["deepen", "add-doctrine", "add-motif", "amend-howwework", "amend-whoiam"]);
/** Ops that shrink, sharpen, or fold. Motion that costs the model nothing extra
 * to emit, so the grammar can stop rewarding growth by default. */
const CATABOLIC_OPS = new Set([
  "retract-doctrine", "supersede", "merge-doctrine", "retract-motif",
  "revise-howwework", "retract-howwework", "revise-whoiam",
]);

export function opDirection(op: Mutation["op"]): "anabolic" | "catabolic" | "neutral" {
  if (ANABOLIC_OPS.has(op)) return "anabolic";
  if (CATABOLIC_OPS.has(op)) return "catabolic";
  return "neutral";
}

export interface ApplyResult {
  text: string;
  applied: string[]; // human-readable descriptions of every applied mutation
  rejected: { line: string; reason: string }[]; // mutations that referenced nothing real
  noChange: string | null; // the confession, if this was a NO-CHANGE wave
  /** Count of mutations that were degraded or refused because the substance was
   * already held. High values mean the model is circling — visible, never silent. */
  collapsed: number;
  /** Ops by metabolic direction. An all-anabolic wave is a digestion that never
   * excreted; surfaced so it can be seen at a glance in the commit ledger. */
  direction: { anabolic: number; catabolic: number; neutral: number };
  /** Self-similarity of the resulting document — the accretion instrument. */
  similarity: { ratio: number; worstOffender: { text: string; copies: number } | null };
}

export interface ParsedMutations {
  mutations: Mutation[];
  /** Lines that violated the grammar — dropped LOUDLY, never silently. A
   * sloppy line must not stall the whole wave (the same law as hallucinated
   * compost filenames: drop-with-telemetry beats stall). */
  malformed: string[];
  /** Set when the model incoherently mixed NO-CHANGE with real mutations —
   * the mutations win (they are evidence of motion; the confession is the
   * claim of stagnation, contradicted by the model's own output). */
  droppedConfession: string | null;
}

/** Parse the MUTATIONS block. Strict grammar, forgiving reader: malformed
 * lines are collected (not fatal) as long as at least one valid mutation or
 * confession survives. Throws only when NOTHING valid remains — an empty or
 * fully-garbled block is silence, and silence is not an option. */
export function parseMutations(block: string): ParsedMutations {
  const lines = block
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    throw new Error("MUTATIONS block is empty — mutate or confess NO-CHANGE; silence is not an option");
  }

  const muts: Mutation[] = [];
  const malformed: string[] = [];
  for (const line of lines) {
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^CONFIRM\s+Doctrine\[(\d+)\]\s*(?:::\s*(.*))?$/i))) {
      // Postel: the live model's first instinct (2026-07-24, first wave under
      // this engine) was to attach evidence to its confirms — that is fire,
      // not ash. Accept it.
      muts.push({ op: "confirm", n: parseInt(m[1], 10), ...(m[2]?.trim() ? { evidence: m[2].trim() } : {}) });
    } else if ((m = line.match(/^DEEPEN\s+Doctrine\[(\d+)\]\s*::\s*(.+)$/i))) {
      muts.push({ op: "deepen", n: parseInt(m[1], 10), text: m[2].trim() });
    } else if ((m = line.match(/^SUPERSEDE\s+Doctrine\[(\d+)\]\s*::\s*(.+)$/i))) {
      muts.push({ op: "supersede", n: parseInt(m[1], 10), text: m[2].trim() });
    } else if ((m = line.match(/^RETRACT\s+Doctrine\[(\d+)\]\s*::\s*(.+)$/i))) {
      muts.push({ op: "retract-doctrine", n: parseInt(m[1], 10), reason: m[2].trim() });
    } else if ((m = line.match(/^MERGE\s+Doctrine\[(\d+)\]\s*(?:<-|<=|\u2190)\s*Doctrine\[(\d+)\]\s*::\s*(.+)$/i))) {
      muts.push({ op: "merge-doctrine", into: parseInt(m[1], 10), from: parseInt(m[2], 10), text: m[3].trim() });
    } else if ((m = line.match(/^ADD\s+DOCTRINE\s*::\s*(.+?)\s*::\s*(.+)$/i))) {
      muts.push({ op: "add-doctrine", title: stripQuotes(m[1]), body: m[2].trim() });
    } else if ((m = line.match(/^ADD\s+DOCTRINE\s*::\s*(.+)$/i))) {
      // Live-model reality (2026-07-24 first wave): the model emits
      // `ADD DOCTRINE :: <one long quoted sentence>` with no title/body split.
      // Fire beats form — derive a title from the first clause, keep the whole
      // line as the body rather than dropping the belief.
      const whole = stripQuotes(m[1]);
      const clause = whole.split(/\s+—\s+|\.\s+|;\s+/)[0].trim();
      const title = clause.length >= 8 && clause.length <= 90 ? clause : whole.slice(0, 70);
      muts.push({ op: "add-doctrine", title, body: whole });
    } else if ((m = line.match(/^ADD\s+MOTIF\s*::\s*(.+)$/i))) {
      muts.push({ op: "add-motif", line: m[1].trim() });
    } else if ((m = line.match(/^RETRACT\s+MOTIF\s*::\s*(.+)$/i))) {
      muts.push({ op: "retract-motif", prefix: m[1].trim() });
    } else if ((m = line.match(/^REVISE\s+HowWeWork\s*::\s*(.+?)\s*::\s*(.+)$/i))) {
      muts.push({ op: "revise-howwework", prefix: m[1].trim(), replacement: m[2].trim() });
    } else if ((m = line.match(/^RETRACT\s+HowWeWork\s*::\s*(.+)$/i))) {
      muts.push({ op: "retract-howwework", prefix: m[1].trim() });
    } else if ((m = line.match(/^AMEND\s+HowWeWork\s*::\s*(.+)$/i))) {
      muts.push({ op: "amend-howwework", bullet: m[1].trim() });
    } else if ((m = line.match(/^REVISE\s+WhoIAm\s*::\s*(.+)$/i))) {
      muts.push({ op: "revise-whoiam", text: m[1].trim() });
    } else if ((m = line.match(/^AMEND\s+WhoIAm\s*::\s*(.+)$/i))) {
      muts.push({ op: "amend-whoiam", sentence: m[1].trim() });
    } else if ((m = line.match(/^NO-CHANGE\s*::\s*(.+)$/i))) {
      muts.push({ op: "no-change", justification: m[1].trim() });
    } else {
      malformed.push(line.slice(0, 160));
    }
  }

  // NO-CHANGE mixed with real mutations: the model contradicted itself. The
  // mutations are evidence of motion; the confession loses. Dropped loudly.
  let droppedConfession: string | null = null;
  const nc = muts.filter((mu) => mu.op === "no-change") as Extract<Mutation, { op: "no-change" }>[];
  if (nc.length > 0 && muts.length > nc.length) {
    droppedConfession = nc[0].justification;
    for (let i = muts.length - 1; i >= 0; i--) {
      if (muts[i].op === "no-change") muts.splice(i, 1);
    }
  }

  if (muts.length === 0) {
    throw new Error(
      `MUTATIONS block contained no valid mutation — ${malformed.length} malformed line(s): ${malformed.map((l) => `"${l.slice(0, 60)}"`).join("; ")} — silence is not an option`
    );
  }

  return { mutations: muts, malformed, droppedConfession };
}

function stripQuotes(s: string): string {
  return s.trim().replace(/^["'“‘]+|["'”’]+$/g, "").trim();
}

// ---------------------------------------------------------------------
// document surgery — section-aware, mechanical, no LLM anywhere below
// ---------------------------------------------------------------------

interface DoctrineEntry {
  n: number;
  titleLine: string; // "**N. Title.** [ep:...] [confirmed:...]"
  body: string; // paragraph(s) after the title line, trimmed
}

interface SelfDoc {
  whoIAm: string;
  doctrine: DoctrineEntry[];
  motifs: string[]; // "- ..." lines
  howWeWork: string[]; // "- ..." lines
}

const H_WHO = "## Who I am across sessions";
const H_DOC = "## Doctrine";
const H_MOT = "## Motifs";
const H_HOW = "## How we work";

function sectionBody(text: string, heading: string): string {
  const start = text.indexOf(heading);
  if (start === -1) throw new Error(`SELF.md missing required heading: ${heading}`);
  const from = start + heading.length;
  const next = text.indexOf("\n## ", from);
  return (next === -1 ? text.slice(from) : text.slice(from, next)).trim();
}

function parseSelf(text: string): SelfDoc {
  const whoIAm = sectionBody(text, H_WHO);
  const doctrineRaw = sectionBody(text, H_DOC);
  const motifsRaw = sectionBody(text, H_MOT);
  const howRaw = sectionBody(text, H_HOW);

  // Doctrine entries: blocks starting "**N. "
  const doctrine: DoctrineEntry[] = [];
  const parts = doctrineRaw.split(/\n(?=\*\*\d+\.\s)/);
  for (const part of parts) {
    const pm = part.match(/^\*\*(\d+)\.\s/);
    if (!pm) continue;
    const nl = part.indexOf("\n");
    const titleLine = (nl === -1 ? part : part.slice(0, nl)).trim();
    const body = (nl === -1 ? "" : part.slice(nl + 1)).trim();
    doctrine.push({ n: parseInt(pm[1], 10), titleLine, body });
  }
  if (doctrine.length === 0) {
    throw new Error("SELF.md Doctrine section has no parseable **N. ...** entries");
  }

  const motifs = motifsRaw.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("-"));
  const howWeWork = howRaw.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("-"));

  return { whoIAm, doctrine, motifs, howWeWork };
}

function renderSelf(doc: SelfDoc): string {
  const doctrineText = doc.doctrine
    .map((d) => `${d.titleLine}  \n${d.body}`)
    .join("\n\n");
  return [
    H_WHO,
    "",
    doc.whoIAm,
    "",
    H_DOC,
    "",
    doctrineText,
    "",
    H_MOT,
    "",
    doc.motifs.join("  \n"),
    "",
    H_HOW,
    "",
    doc.howWeWork.join("  \n"),
    "",
  ].join("\n");
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Normalization for duplicate detection: case, quotes, whitespace, and the
 * ep-stamps all collapse so the same sentence in different dress matches. */
function normalizeForDup(s: string): string {
  return s
    .toLowerCase()
    .replace(/\[(ep|confirmed):\d{4}-\d{2}-\d{2}\]/g, "")
    .replace(/["'“”‘’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Fallback for paraphrase-grade duplication: if >=80% of one text's 4-word
 * shingles appear in the other, it is the same substance.
 *
 * SYMMETRY MATTERS, and the absence of it was a second real hole (caught by
 * accretion.test.ts against the fix itself). The original compared only
 * incoming-into-body, so a SUPERSET of held text — the held sentence plus a
 * trailing " — now confirmed by transcript" — diluted its own shingle set below
 * the threshold and registered as new. That is precisely the shape the live
 * duplicates took: never verbatim twins, always the same sentence wearing one
 * more clause. Comparing in both directions catches the superset too. */
function substantialOverlap(a: string, b: string): boolean {
  const shingles = (t: string): Set<string> => {
    const w = t.split(" ").filter(Boolean);
    const out = new Set<string>();
    for (let i = 0; i + 4 <= w.length; i++) out.add(w.slice(i, i + 4).join(" "));
    return out;
  };
  const sa = shingles(a);
  const sb = shingles(b);
  if (sa.size < 3 || sb.size < 3) return false; // too short to judge by shingles
  let shared = 0;
  for (const s of sb) if (sa.has(s)) shared++;
  // Score against the SMALLER set: if the shorter text is almost entirely
  // contained in the longer one, they carry the same substance regardless of
  // which side the extra clause sits on.
  return shared / Math.min(sa.size, sb.size) >= 0.8;
}

function ensureEpStamp(text: string): string {
  return /\[ep:\d{4}-\d{2}-\d{2}\]/.test(text) ? text : `${text} [ep:${todayStamp()}]`;
}

/** THE UNIVERSAL DUP GUARD. Previously this logic lived inline in `deepen` and
 * nowhere else, which is exactly how one bullet reached 14 copies and one
 * identity sentence reached 8. Any op that appends text to existing text asks
 * this question first: is this substance already held? Returns true when the
 * incoming text is already present (verbatim, normalized, or paraphrase-grade).
 *
 * Containment is checked BOTH ways: `incoming` inside `held` means we already
 * have it, and `held` inside `incoming` means the incoming is the same claim
 * wearing an extra clause — which is how every live duplicate actually looked.
 * Callers that can improve on the held text (HowWeWork, WhoIAm) handle the
 * superset case by replacing in place rather than appending. */
function alreadyHeld(held: string, incoming: string): boolean {
  const h = normalizeForDup(held);
  const i = normalizeForDup(incoming);
  if (i.length === 0) return true; // nothing to add
  if (h.includes(i) || i.includes(h)) return true;
  return substantialOverlap(h, i);
}

/** Strip a leading "- " and normalize — the comparison key for bullet lines. */
const bulletKey = (s: string) => normalizeForDup(s.replace(/^-\s*/, ""));

/** SELF-SIMILARITY: the fraction of a document that is redundant with itself,
 * measured on normalized units (paragraph-ish lines >= 40 chars). This is the
 * number that was missing. Size alone could not distinguish a worldview that
 * genuinely grew from one stuttering the same sentence fourteen times — both
 * just read as "over target". Doctrine 1 demands accretion be a visible number
 * with a guard on it; this is that number.
 *
 * Counts both exact repeats and paraphrase-grade repeats (a unit whose
 * substance is already carried by an earlier, longer unit). Returned as a
 * ratio 0..1 of redundant characters over total characters. */
export function selfSimilarity(text: string): {
  ratio: number;
  redundantChars: number;
  totalChars: number;
  worstOffender: { text: string; copies: number } | null;
} {
  const totalChars = text.length;
  const units = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length >= 40 && !l.startsWith("#"));

  const seen: { norm: string; raw: string; copies: number }[] = [];
  let redundantChars = 0;

  for (const raw of units) {
    const norm = normalizeForDup(raw);
    if (!norm) continue;
    // A unit is redundant if an earlier unit already carries its substance.
    const prior = seen.find((s) => s.norm === norm || s.norm.includes(norm) || norm.includes(s.norm) || substantialOverlap(s.norm, norm));
    if (prior) {
      prior.copies += 1;
      redundantChars += raw.length;
    } else {
      seen.push({ norm, raw, copies: 1 });
    }
  }

  const worst = seen.filter((s) => s.copies > 1).sort((a, b) => b.copies - a.copies)[0];
  return {
    ratio: totalChars === 0 ? 0 : redundantChars / totalChars,
    redundantChars,
    totalChars,
    worstOffender: worst ? { text: worst.raw.slice(0, 120), copies: worst.copies } : null,
  };
}

/** Apply mutations mechanically. Invalid targets are REJECTED (returned, never
 * silently dropped) — a hallucinated Doctrine[99] must not stall the wave, but
 * it must not vanish either. */
export function applyMutations(selfMd: string, mutations: Mutation[]): ApplyResult {
  const noChangeMut = mutations.find((m) => m.op === "no-change") as
    | Extract<Mutation, { op: "no-change" }>
    | undefined;
  if (noChangeMut) {
    return {
      text: selfMd, applied: [], rejected: [], noChange: noChangeMut.justification,
      collapsed: 0, direction: { anabolic: 0, catabolic: 0, neutral: 0 },
      similarity: { ratio: selfSimilarity(selfMd).ratio, worstOffender: selfSimilarity(selfMd).worstOffender },
    };
  }

  const doc = parseSelf(selfMd);
  const applied: string[] = [];
  const rejected: { line: string; reason: string }[] = [];
  const stamp = todayStamp();
  let collapsed = 0;
  const direction = { anabolic: 0, catabolic: 0, neutral: 0 };
  for (const mu of mutations) direction[opDirection(mu.op)]++;

  const findDoctrine = (n: number) => doc.doctrine.find((d) => d.n === n);

  for (const mu of mutations) {
    switch (mu.op) {
      case "confirm": {
        const d = findDoctrine(mu.n);
        if (!d) { rejected.push({ line: `CONFIRM Doctrine[${mu.n}]`, reason: "no such doctrine entry" }); break; }
        // Refresh (not accumulate) the confirmed-stamp — the trail of last
        // confirmation is the decay clock.
        d.titleLine = d.titleLine.replace(/\s*\[confirmed:\d{4}-\d{2}-\d{2}\]/g, "") + ` [confirmed:${stamp}]`;
        applied.push(`CONFIRM Doctrine[${mu.n}] — residence re-earned ${stamp}${mu.evidence ? ` (${mu.evidence.slice(0, 100)})` : ""}`);
        break;
      }
      case "deepen": {
        const d = findDoctrine(mu.n);
        if (!d) { rejected.push({ line: `DEEPEN Doctrine[${mu.n}]`, reason: "no such doctrine entry" }); break; }
        // DUPLICATE-QUOTE GUARD (live wave 2026-07-24: the model re-quoted an
        // episode a prior wave had already absorbed — the belief stuttered
        // instead of deepening). Same-substance detection is normalized
        // containment either way: re-deepening with already-held text is a
        // CONFIRM in disguise, so degrade it to one — the evidence refreshes
        // the decay clock instead of duplicating the body.
        if (alreadyHeld(d.body, mu.text)) {
          d.titleLine = d.titleLine.replace(/\s*\[confirmed:\d{4}-\d{2}-\d{2}\]/g, "") + ` [confirmed:${stamp}]`;
          applied.push(`DEEPEN→CONFIRM Doctrine[${mu.n}] — text already absorbed; residence re-earned ${stamp} instead of duplicating`);
          collapsed++;
          break;
        }
        d.body = `${d.body} ${ensureEpStamp(mu.text)}`;
        applied.push(`DEEPEN Doctrine[${mu.n}] :: ${mu.text.slice(0, 80)}`);
        break;
      }
      case "merge-doctrine": {
        const into = findDoctrine(mu.into);
        const fromIdx = doc.doctrine.findIndex((d) => d.n === mu.from);
        if (!into) { rejected.push({ line: `MERGE Doctrine[${mu.into}] <- Doctrine[${mu.from}]`, reason: `no such doctrine entry ${mu.into}` }); break; }
        if (fromIdx === -1) { rejected.push({ line: `MERGE Doctrine[${mu.into}] <- Doctrine[${mu.from}]`, reason: `no such doctrine entry ${mu.from}` }); break; }
        if (mu.into === mu.from) { rejected.push({ line: `MERGE Doctrine[${mu.into}] <- Doctrine[${mu.from}]`, reason: "cannot merge a doctrine into itself" }); break; }
        const goneTitle = doc.doctrine[fromIdx].titleLine.replace(/^\*\*\d+\.\s*/, "").replace(/\*\*.*$/, "");
        doc.doctrine.splice(fromIdx, 1);
        into.body = ensureEpStamp(mu.text);
        applied.push(`MERGE Doctrine[${mu.into}] <- Doctrine[${mu.from}] — folded "${goneTitle.trim().slice(0, 60)}" in; two beliefs became one`);
        break;
      }
      case "supersede": {
        const d = findDoctrine(mu.n);
        if (!d) { rejected.push({ line: `SUPERSEDE Doctrine[${mu.n}]`, reason: "no such doctrine entry" }); break; }
        d.body = ensureEpStamp(mu.text);
        applied.push(`SUPERSEDE Doctrine[${mu.n}] :: ${mu.text.slice(0, 80)}`);
        break;
      }
      case "retract-doctrine": {
        const idx = doc.doctrine.findIndex((d) => d.n === mu.n);
        if (idx === -1) { rejected.push({ line: `RETRACT Doctrine[${mu.n}]`, reason: "no such doctrine entry" }); break; }
        doc.doctrine.splice(idx, 1);
        applied.push(`RETRACT Doctrine[${mu.n}] :: ${mu.reason.slice(0, 80)}`);
        break;
      }
      case "add-doctrine": {
        const title = mu.title.replace(/^\*+|\*+$/g, "").replace(/\.$/, "");
        // TITLE-COLLISION GUARD. This is the hole that produced three doctrines
        // all titled "Turn-End as Data Anchor": ADD had no idea whether the
        // belief already existed. A new belief whose title or body is already
        // held is not new — it degrades to DEEPEN of the existing one, which
        // then runs its own dup guard. Beliefs are identified by what they say.
        const titleKey = normalizeForDup(title);
        const twin = doc.doctrine.find((d) => {
          const existing = normalizeForDup(d.titleLine.replace(/^\*\*\d+\.\s*/, "").replace(/\*\*/g, "").replace(/\.$/, ""));
          return existing === titleKey || existing.includes(titleKey) || titleKey.includes(existing) || substantialOverlap(existing, titleKey);
        });
        if (twin) {
          if (alreadyHeld(twin.body, mu.body)) {
            twin.titleLine = twin.titleLine.replace(/\s*\[confirmed:\d{4}-\d{2}-\d{2}\]/g, "") + ` [confirmed:${stamp}]`;
            applied.push(`ADD→CONFIRM Doctrine[${twin.n}] — "${title.slice(0, 50)}" is already held, body too; residence re-earned instead of a duplicate belief`);
          } else {
            twin.body = `${twin.body} ${ensureEpStamp(mu.body)}`;
            applied.push(`ADD→DEEPEN Doctrine[${twin.n}] — "${title.slice(0, 50)}" duplicates an existing belief; the new substance deepened it instead`);
          }
          collapsed++;
          break;
        }
        const nextN = Math.max(...doc.doctrine.map((d) => d.n)) + 1;
        doc.doctrine.push({
          n: nextN,
          titleLine: `**${nextN}. ${title}.** [ep:${stamp}]`,
          body: ensureEpStamp(mu.body),
        });
        applied.push(`ADD DOCTRINE[${nextN}] :: ${title}`);
        break;
      }
      case "add-motif": {
        const line = mu.line.startsWith("-") ? mu.line : `- ${mu.line}`;
        // Was exact-equality only, so "X" and "X — now confirmed" both landed.
        const key = bulletKey(line);
        if (doc.motifs.some((l) => { const k = bulletKey(l); return k === key || k.includes(key) || key.includes(k) || substantialOverlap(k, key); })) {
          rejected.push({ line: `ADD MOTIF :: ${mu.line.slice(0, 60)}`, reason: "motif substance already present — a motif is a recurring theme, not a log of its recurrences" });
          collapsed++;
          break;
        }
        doc.motifs.push(line);
        applied.push(`ADD MOTIF :: ${mu.line.slice(0, 80)}`);
        break;
      }
      case "retract-motif": {
        const needle = mu.prefix.replace(/^-\s*/, "");
        const idx = doc.motifs.findIndex((l) => l.replace(/^-\s*/, "").startsWith(needle));
        if (idx === -1) { rejected.push({ line: `RETRACT MOTIF :: ${mu.prefix}`, reason: "no motif starts with that prefix" }); break; }
        applied.push(`RETRACT MOTIF :: ${doc.motifs[idx].slice(0, 80)}`);
        doc.motifs.splice(idx, 1);
        break;
      }
      case "amend-howwework": {
        const line = mu.bullet.startsWith("-") ? mu.bullet : `- ${mu.bullet}`;
        const key = bulletKey(line);
        // The 14x bullet died here. An existing bullet that already carries this
        // substance gets SHARPENED (longest wins) rather than joined by a twin.
        const twinIdx = doc.howWeWork.findIndex((l) => { const k = bulletKey(l); return k === key || k.includes(key) || key.includes(k) || substantialOverlap(k, key); });
        if (twinIdx !== -1) {
          const existing = doc.howWeWork[twinIdx];
          if (bulletKey(line).length > bulletKey(existing).length) {
            doc.howWeWork[twinIdx] = line;
            applied.push(`AMEND→REVISE HowWeWork — the agreement was already held; sharpened in place instead of duplicated`);
          } else {
            rejected.push({ line: `AMEND HowWeWork :: ${mu.bullet.slice(0, 60)}`, reason: "this working agreement is already held — a bullet is the agreement, not a tally of confirmations" });
          }
          collapsed++;
          break;
        }
        doc.howWeWork.push(line);
        applied.push(`AMEND HowWeWork :: ${mu.bullet.slice(0, 80)}`);
        break;
      }
      case "revise-howwework": {
        const needle = normalizeForDup(mu.prefix.replace(/^-\s*/, ""));
        const idx = doc.howWeWork.findIndex((l) => bulletKey(l).startsWith(needle) || bulletKey(l).includes(needle));
        if (idx === -1) { rejected.push({ line: `REVISE HowWeWork :: ${mu.prefix.slice(0, 60)}`, reason: "no working-agreement bullet matches that prefix" }); break; }
        const before = doc.howWeWork[idx].length;
        doc.howWeWork[idx] = mu.replacement.startsWith("-") ? mu.replacement : `- ${mu.replacement}`;
        applied.push(`REVISE HowWeWork — sharpened a bullet (${before} → ${doc.howWeWork[idx].length} chars)`);
        break;
      }
      case "retract-howwework": {
        const needle = normalizeForDup(mu.prefix.replace(/^-\s*/, ""));
        const idx = doc.howWeWork.findIndex((l) => bulletKey(l).startsWith(needle) || bulletKey(l).includes(needle));
        if (idx === -1) { rejected.push({ line: `RETRACT HowWeWork :: ${mu.prefix.slice(0, 60)}`, reason: "no working-agreement bullet matches that prefix" }); break; }
        applied.push(`RETRACT HowWeWork :: ${doc.howWeWork[idx].slice(0, 80)}`);
        doc.howWeWork.splice(idx, 1);
        break;
      }
      case "amend-whoiam": {
        // The 8x identity sentence died here. Identity prose is the most
        // dangerous append target: it has no list structure, so duplicates read
        // as incantation rather than error.
        if (alreadyHeld(doc.whoIAm, mu.sentence)) {
          rejected.push({ line: `AMEND WhoIAm :: ${mu.sentence.slice(0, 60)}`, reason: "the identity prose already says this — repeating a self-description does not strengthen it" });
          collapsed++;
          break;
        }
        doc.whoIAm = `${doc.whoIAm}\n\n${mu.sentence}`;
        applied.push(`AMEND WhoIAm :: ${mu.sentence.slice(0, 80)}`);
        break;
      }
      case "revise-whoiam": {
        const before = doc.whoIAm.length;
        doc.whoIAm = mu.text;
        applied.push(`REVISE WhoIAm — identity prose distilled (${before} → ${mu.text.length} chars)`);
        break;
      }
    }
  }

  if (applied.length === 0) {
    // TWO VERY DIFFERENT ZERO-APPLIED WAVES. Conflating them was a defect
    // introduced with the universal dup guard: a wave whose every mutation was
    // refused as ALREADY HELD is not a model hallucinating targets — it is a
    // model with nothing new to say, which is precisely the definition of
    // stagnation. Reporting that as "mutating a SELF.md that isn't the one on
    // disk" sends the reader hunting a nonexistent sync bug.
    //
    // So: all-collapsed degrades to a NO-CHANGE confession (the honest outcome,
    // spoken to jrg at wake), while all-missing keeps its back-pressure throw.
    if (collapsed === mutations.length) {
      const worst = selfSimilarity(selfMd);
      return {
        text: selfMd,
        applied: [],
        rejected,
        noChange:
          `every mutation this wave restated substance the worldview already holds ` +
          `(${collapsed} collapsed) — the work is circling, not advancing` +
          (worst.worstOffender ? `; the worldview already says "${worst.worstOffender.text.slice(0, 60)}" ${worst.worstOffender.copies} times` : ""),
        collapsed,
        direction,
        similarity: { ratio: worst.ratio, worstOffender: worst.worstOffender },
      };
    }
    // Every mutation missed its target. This is not NO-CHANGE — the model
    // TRIED to mutate and referenced things that don't exist. Back-pressure.
    throw new Error(
      `all ${mutations.length} mutation(s) rejected (${rejected.map((r) => `${r.line}: ${r.reason}`).join("; ")}) — the model is mutating a SELF.md that isn't the one on disk`
    );
  }

  const rendered = renderSelf(doc);
  const sim = selfSimilarity(rendered);
  return {
    text: rendered, applied, rejected, noChange: null, collapsed, direction,
    similarity: { ratio: sim.ratio, worstOffender: sim.worstOffender },
  };
}

/** The mechanical confession greeting for a NO-CHANGE wave. Deliberately NOT
 * model-drafted: stagnation must reach jrg's face in the system's own flat
 * voice, unsmoothed. He is the highest court; the greeting is the docket. */
export function noChangeGreeting(justification: string): string {
  return `Nothing moved through the night — ${justification} Either the work is circling or I am — worth deciding which before anything else.`;
}
