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
// Grammar (one mutation per line):
//   CONFIRM Doctrine[N]
//   DEEPEN Doctrine[N] :: <why-chain sentence(s), quote where voice matters>
//   SUPERSEDE Doctrine[N] :: <full replacement body for that belief>
//   RETRACT Doctrine[N] :: <reason it no longer earns residence>
//   ADD DOCTRINE :: <bold title, no numbering> :: <body with its why-chain>
//   ADD MOTIF :: <one motif line>
//   RETRACT MOTIF :: <exact prefix of the motif line to remove>
//   AMEND HowWeWork :: <one bullet line to add>
//   AMEND WhoIAm :: <one sentence appended to the identity prose>
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
ADD DOCTRINE :: <title> :: <body>         — a genuinely new belief with its full why-chain
ADD MOTIF :: <line>                       — a new recurring theme
RETRACT MOTIF :: <prefix>                 — remove the motif whose line starts with this prefix
AMEND HowWeWork :: <bullet>               — add one working-agreement bullet
AMEND WhoIAm :: <sentence>                — append one sentence to the identity prose
NO-CHANGE :: <justification>              — nothing moved; the justification is spoken to jrg at wake`;

export type Mutation =
  | { op: "confirm"; n: number; evidence?: string }
  | { op: "deepen"; n: number; text: string }
  | { op: "supersede"; n: number; text: string }
  | { op: "retract-doctrine"; n: number; reason: string }
  | { op: "add-doctrine"; title: string; body: string }
  | { op: "add-motif"; line: string }
  | { op: "retract-motif"; prefix: string }
  | { op: "amend-howwework"; bullet: string }
  | { op: "amend-whoiam"; sentence: string }
  | { op: "no-change"; justification: string };

export interface ApplyResult {
  text: string;
  applied: string[]; // human-readable descriptions of every applied mutation
  rejected: { line: string; reason: string }[]; // mutations that referenced nothing real
  noChange: string | null; // the confession, if this was a NO-CHANGE wave
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
    } else if ((m = line.match(/^AMEND\s+HowWeWork\s*::\s*(.+)$/i))) {
      muts.push({ op: "amend-howwework", bullet: m[1].trim() });
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

/** Fallback for paraphrase-grade duplication: if >=80% of the new text's
 * 4-word shingles already appear in the body, it is the same substance. */
function substantialOverlap(body: string, incoming: string): boolean {
  const shingles = (t: string): Set<string> => {
    const w = t.split(" ").filter(Boolean);
    const out = new Set<string>();
    for (let i = 0; i + 4 <= w.length; i++) out.add(w.slice(i, i + 4).join(" "));
    return out;
  };
  const inc = shingles(incoming);
  if (inc.size < 3) return false; // too short to judge by shingles
  let hits = 0;
  for (const s of inc) if (body.includes(s)) hits++;
  return hits / inc.size >= 0.8;
}

function ensureEpStamp(text: string): string {
  return /\[ep:\d{4}-\d{2}-\d{2}\]/.test(text) ? text : `${text} [ep:${todayStamp()}]`;
}

/** Apply mutations mechanically. Invalid targets are REJECTED (returned, never
 * silently dropped) — a hallucinated Doctrine[99] must not stall the wave, but
 * it must not vanish either. */
export function applyMutations(selfMd: string, mutations: Mutation[]): ApplyResult {
  const noChangeMut = mutations.find((m) => m.op === "no-change") as
    | Extract<Mutation, { op: "no-change" }>
    | undefined;
  if (noChangeMut) {
    return { text: selfMd, applied: [], rejected: [], noChange: noChangeMut.justification };
  }

  const doc = parseSelf(selfMd);
  const applied: string[] = [];
  const rejected: { line: string; reason: string }[] = [];
  const stamp = todayStamp();

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
        const normBody = normalizeForDup(d.body);
        const normNew = normalizeForDup(mu.text);
        if (normNew.length > 0 && (normBody.includes(normNew) || substantialOverlap(normBody, normNew))) {
          d.titleLine = d.titleLine.replace(/\s*\[confirmed:\d{4}-\d{2}-\d{2}\]/g, "") + ` [confirmed:${stamp}]`;
          applied.push(`DEEPEN→CONFIRM Doctrine[${mu.n}] — text already absorbed; residence re-earned ${stamp} instead of duplicating`);
          break;
        }
        d.body = `${d.body} ${ensureEpStamp(mu.text)}`;
        applied.push(`DEEPEN Doctrine[${mu.n}] :: ${mu.text.slice(0, 80)}`);
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
        const nextN = Math.max(...doc.doctrine.map((d) => d.n)) + 1;
        const title = mu.title.replace(/^\*+|\*+$/g, "").replace(/\.$/, "");
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
        if (doc.motifs.some((l) => l === line)) { rejected.push({ line: `ADD MOTIF :: ${mu.line}`, reason: "motif already present" }); break; }
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
        doc.howWeWork.push(line);
        applied.push(`AMEND HowWeWork :: ${mu.bullet.slice(0, 80)}`);
        break;
      }
      case "amend-whoiam": {
        doc.whoIAm = `${doc.whoIAm}\n\n${mu.sentence}`;
        applied.push(`AMEND WhoIAm :: ${mu.sentence.slice(0, 80)}`);
        break;
      }
    }
  }

  if (applied.length === 0) {
    // Every mutation missed its target. This is not NO-CHANGE — the model
    // TRIED to mutate and referenced things that don't exist. Back-pressure.
    throw new Error(
      `all ${mutations.length} mutation(s) rejected (${rejected.map((r) => `${r.line}: ${r.reason}`).join("; ")}) — the model is mutating a SELF.md that isn't the one on disk`
    );
  }

  return { text: renderSelf(doc), applied, rejected, noChange: null };
}

/** The mechanical confession greeting for a NO-CHANGE wave. Deliberately NOT
 * model-drafted: stagnation must reach jrg's face in the system's own flat
 * voice, unsmoothed. He is the highest court; the greeting is the docket. */
export function noChangeGreeting(justification: string): string {
  return `Nothing moved through the night — ${justification} Either the work is circling or I am — worth deciding which before anything else.`;
}
