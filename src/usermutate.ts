// usermutate.ts — the mutation engine for USER.md, the private relational model.
//
// WHY THIS EXISTS (the third post-mortem, 2026-07-24). Two organs, same disease,
// discovered in sequence:
//
//   1. SELF.md flatlined (2026-07-23) because REM was asked to "output the full
//      rewritten SELF.md" — for a small local model, echoing input to output is
//      the rational strategy, since a real rewrite risks tripping validation.
//      Cured by mutations: there is no document to copy.
//
//   2. SELF.md then ACCRETED (2026-07-24) because the mutation grammar was
//      asymmetric — the sections that duplicated worst had only append verbs.
//      Cured by symmetry: every section got a catabolic verb.
//
// USER.md was left behind on step one. It is still a full-document rewrite, and
// verifying (rather than assuming) the size-discipline fix caught it echoing
// BYTE-IDENTICALLY while 919 tokens over target — reported as success. A prompt
// instruction cannot beat a gradient: telling a model "you MUST come back
// smaller" while asking it to reproduce 11,673 characters is asking it to take
// the risky path for no reward.
//
// So USER.md gets the same cure, with symmetry built in from the start rather
// than bolted on after twelve waves of damage.
//
// Grammar (one mutation per line):
//   OBSERVE <Section> :: <line>              — a genuinely new observation (anabolic)
//   DEEPEN <Section> :: <prefix> :: <text>   — extend an existing line's evidence (anabolic)
//   REVISE <Section> :: <prefix> :: <line>   — rewrite sharper/shorter (catabolic)
//   MERGE <Section> :: <prefixA> + <prefixB> :: <line> — several traits are one (catabolic)
//   RETRACT <Section> :: <prefix>            — drop a line that no longer earns residence (catabolic)
//   NO-CHANGE :: <justification>             — nothing about jrg moved this cycle
//
// Sections are matched case-insensitively on a unique prefix of the heading, so
// the model can write "Preferences" for "## Preferences and patterns".

export const USER_MUTATION_GRAMMAR = `Mutation grammar for USER.md (one per line, exactly):
OBSERVE <Section> :: <line>                          — a genuinely new observation about jrg
DEEPEN <Section> :: <prefix> :: <text>               — add evidence to the existing line starting with <prefix>
REVISE <Section> :: <prefix> :: <line>               — replace that line with a sharper, shorter one
MERGE <Section> :: <prefixA> + <prefixB> :: <line>   — two lines describe ONE trait; fold them into this single line
RETRACT <Section> :: <prefix>                        — remove that line; it no longer earns its residence
NO-CHANGE :: <justification>                         — nothing about jrg moved this cycle

<Section> is any unique prefix of a heading in USER.md (e.g. "Preferences", "Registers", "Arcs").
<prefix> is the first several words of an existing line — enough to identify it unambiguously.

SHRINKING IS REAL WORK. MERGE, REVISE and RETRACT carry exactly as much credit as
OBSERVE and DEEPEN. Three lines saying jrg wants to see live output are ONE
preference, not three. If the file is over target, your FIRST mutations must be
MERGE or REVISE. A relational model that only ever grows is a transcript, not a
model \u2014 and a transcript of a person is not knowledge of them.`;

export type UserMutation =
  | { op: "observe"; section: string; line: string }
  | { op: "deepen"; section: string; prefix: string; text: string }
  | { op: "revise"; section: string; prefix: string; line: string }
  | { op: "merge"; section: string; prefixA: string; prefixB: string; line: string }
  | { op: "retract"; section: string; prefix: string }
  | { op: "no-change"; justification: string };

const ANABOLIC = new Set(["observe", "deepen"]);
const CATABOLIC = new Set(["revise", "merge", "retract"]);

export function userOpDirection(op: UserMutation["op"]): "anabolic" | "catabolic" | "neutral" {
  if (ANABOLIC.has(op)) return "anabolic";
  if (CATABOLIC.has(op)) return "catabolic";
  return "neutral";
}

export interface UserApplyResult {
  text: string;
  applied: string[];
  rejected: { line: string; reason: string }[];
  noChange: string | null;
  collapsed: number;
  direction: { anabolic: number; catabolic: number; neutral: number };
  /** Net character change. The honest measure of a consolidation wave: a wave can
   * apply five catabolic mutations and still end flat if its anabolic ops add the
   * savings back, which is exactly what happened on 2026-07-24 (844 cut, 836
   * added, net -8). Direction counts alone hid that; this does not. */
  deltaChars: number;
  /** Anabolic mutations held back because the file is over target and this wave's
   * cuts left no room. Not rejections — real observations awaiting a wave with
   * headroom, so the file approaches target instead of oscillating. */
  deferred: number;
}

export interface ParsedUserMutations {
  mutations: UserMutation[];
  malformed: string[];
  droppedConfession: string | null;
}

/** Forgiving reader, strict grammar — same contract as mutate.ts: malformed
 * lines are collected loudly but never stall a wave that has real work in it. */
export function parseUserMutations(block: string): ParsedUserMutations {
  const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    throw new Error("USER MUTATIONS block is empty — mutate or confess NO-CHANGE; silence is not an option");
  }

  const muts: UserMutation[] = [];
  const malformed: string[] = [];

  for (const line of lines) {
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^MERGE\s+([^:]+?)\s*::\s*(.+?)\s*\+\s*(.+?)\s*::\s*(.+)$/i))) {
      muts.push({ op: "merge", section: m[1].trim(), prefixA: m[2].trim(), prefixB: m[3].trim(), line: m[4].trim() });
    } else if ((m = line.match(/^REVISE\s+([^:]+?)\s*::\s*(.+?)\s*::\s*(.+)$/i))) {
      muts.push({ op: "revise", section: m[1].trim(), prefix: m[2].trim(), line: m[3].trim() });
    } else if ((m = line.match(/^DEEPEN\s+([^:]+?)\s*::\s*(.+?)\s*::\s*(.+)$/i))) {
      muts.push({ op: "deepen", section: m[1].trim(), prefix: m[2].trim(), text: m[3].trim() });
    } else if ((m = line.match(/^RETRACT\s*::\s*(.+)$/i))) {
      // Section omitted (observed live 2026-07-25). The prefix alone identifies
      // the line; resolution searches every section. Postel's law over a dead wave.
      muts.push({ op: "retract", section: "", prefix: m[1].trim() });
    } else if ((m = line.match(/^RETRACT\s+([^:]+?)\s*::\s*(.+)$/i))) {
      muts.push({ op: "retract", section: m[1].trim(), prefix: m[2].trim() });
    } else if ((m = line.match(/^REVISE\s*::\s*(.+?)\s*::\s*(.+)$/i))) {
      muts.push({ op: "revise", section: "", prefix: m[1].trim(), line: m[2].trim() });
    } else if ((m = line.match(/^DEEPEN\s*::\s*(.+?)\s*::\s*(.+)$/i))) {
      muts.push({ op: "deepen", section: "", prefix: m[1].trim(), text: m[2].trim() });
    } else if ((m = line.match(/^OBSERVE\s+([^:]+?)\s*::\s*(.+)$/i))) {
      muts.push({ op: "observe", section: m[1].trim(), line: m[2].trim() });
    } else if ((m = line.match(/^NO-CHANGE\s*::\s*(.+)$/i))) {
      muts.push({ op: "no-change", justification: m[1].trim() });
    } else {
      malformed.push(line.slice(0, 160));
    }
  }

  // Same incoherence rule as SELF: mutations are evidence of motion, so a
  // confession alongside them loses and is dropped loudly.
  let droppedConfession: string | null = null;
  const nc = muts.filter((x) => x.op === "no-change") as Extract<UserMutation, { op: "no-change" }>[];
  if (nc.length > 0 && muts.length > nc.length) {
    droppedConfession = nc[0].justification;
    for (let i = muts.length - 1; i >= 0; i--) if (muts[i].op === "no-change") muts.splice(i, 1);
  }

  if (muts.length === 0) {
    throw new Error(
      `USER MUTATIONS block contained no valid mutation — ${malformed.length} malformed line(s): ` +
      malformed.map((l) => `"${l.slice(0, 60)}"`).join("; ")
    );
  }

  return { mutations: muts, malformed, droppedConfession };
}

// ---------------------------------------------------------------------
// document surgery — section-aware, mechanical, no LLM below this line
// ---------------------------------------------------------------------

interface Section {
  heading: string; // "## Preferences and patterns"
  lines: string[]; // every line of the body, bullets and prose alike
}

interface UserDoc {
  preamble: string; // everything before the first "## "
  sections: Section[];
}

function parseUser(text: string): UserDoc {
  const heads = [...text.matchAll(/^## (.+)$/gm)];
  if (heads.length === 0) throw new Error("USER.md has no '## ' sections to mutate");
  const preamble = text.slice(0, heads[0].index!).trimEnd();
  const sections: Section[] = heads.map((h, i) => {
    const start = h.index! + h[0].length;
    const end = i + 1 < heads.length ? heads[i + 1].index! : text.length;
    return { heading: h[0], lines: text.slice(start, end).replace(/^\n+|\n+$/g, "").split("\n") };
  });
  return { preamble, sections };
}

function renderUser(doc: UserDoc): string {
  return `${doc.preamble}\n\n${doc.sections.map((s) => `${s.heading}\n\n${s.lines.join("\n")}`).join("\n\n")}\n`;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\[(ep|confirmed):\d{4}-\d{2}-\d{2}\]/g, "")
    .replace(/["'“”‘’*`]/g, "")
    .replace(/^-\s*/, "")
    .replace(/\s+/g, " ")
    .trim();

/** Paraphrase-grade sameness, symmetric (see mutate.ts substantialOverlap —
 * comparing against the smaller shingle set is what catches "the same claim
 * wearing one more clause", which is the shape real duplicates take). */
function sameSubstance(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const sh = (t: string) => {
    const w = t.split(" ").filter(Boolean);
    const out = new Set<string>();
    for (let i = 0; i + 4 <= w.length; i++) out.add(w.slice(i, i + 4).join(" "));
    return out;
  };
  const sa = sh(na);
  const sb = sh(nb);
  if (sa.size < 3 || sb.size < 3) return false;
  let shared = 0;
  for (const s of sb) if (sa.has(s)) shared++;
  return shared / Math.min(sa.size, sb.size) >= 0.8;
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function ensureStamp(line: string): string {
  return /\[ep:\d{4}-\d{2}-\d{2}\]/.test(line) ? line : `${line} [ep:${todayStamp()}]`;
}

function asBullet(line: string): string {
  return line.startsWith("- ") ? line : `- ${line.replace(/^-\s*/, "")}`;
}

/** CATABOLIC-FIRST ORDERING, and an anabolic freeze when over target.
 *
 * Three live waves taught this, in order:
 *   1. Full rewrite → byte-identical echo while 919t over.
 *   2. Mutation grammar → 5 catabolic / 3 anabolic, 844 cut, 836 added, net -8.
 *   3. Explicit character quota → one REVISE saving 342, given back by an
 *      OBSERVE and a DEEPEN. Net -43.
 *
 * Every mutation was valid every time. The model is not disobeying; a 4B local
 * model simply cannot hold a running character budget across a list of
 * independent lines. Three attempts to persuade it is enough — persuasion is not
 * a mechanism, and this project's own doctrine says protocol must be mechanical
 * because prose rules lose to task pressure.
 *
 * So the ENGINE enforces what the prompt could not:
 *   - catabolic mutations apply FIRST, so cuts are never blocked by a target a
 *     later append would have created;
 *   - while the document is over target, anabolic mutations are admitted only
 *     until they have spent the headroom the cuts just earned. Beyond that they
 *     are DEFERRED (not rejected — the observation is real, it just waits for a
 *     wave with room), so the file monotonically approaches target instead of
 *     oscillating around it forever.
 *
 * Under target, nothing is deferred: the mind is free to grow into its room. */
function orderCatabolicFirst(mutations: UserMutation[]): UserMutation[] {
  const rank = (m: UserMutation) => (userOpDirection(m.op) === "catabolic" ? 0 : 1);
  return [...mutations].sort((a, b) => rank(a) - rank(b));
}

export function applyUserMutations(userMd: string, mutations: UserMutation[], opts?: { targetChars?: number }): UserApplyResult {
  const noChange = mutations.find((m) => m.op === "no-change") as Extract<UserMutation, { op: "no-change" }> | undefined;
  const direction = { anabolic: 0, catabolic: 0, neutral: 0 };
  for (const m of mutations) direction[userOpDirection(m.op)]++;

  if (noChange) {
    return { text: userMd, applied: [], rejected: [], noChange: noChange.justification, collapsed: 0, direction, deltaChars: 0, deferred: 0 };
  }

  const doc = parseUser(userMd);
  const applied: string[] = [];
  const rejected: { line: string; reason: string }[] = [];
  const deferred: string[] = [];
  let collapsed = 0;

  // Anabolic budget: while over target, growth may only spend what shrinking
  // earns in the same wave. Zero means "cut before you add".
  const targetChars = opts?.targetChars ?? Infinity;
  const startLen = userMd.length;
  const overAtStart = startLen > targetChars;
  let anabolicBudget = 0;
  const currentLen = () => renderUser(doc).length;

  // SECTION RESOLUTION IS FORGIVING BY DESIGN.
  //
  // Live wave 2026-07-25: the model emitted `RETRACT :: [ep:...] "we build not
  // just systems..."` — omitting the section name entirely, so the line's own
  // text landed in the section slot. Both mutations were rejected and the wave
  // reported "the model is mutating a USER.md it was not given", which is exactly
  // wrong: the target line existed, at a known position, and the intent was
  // unambiguous. A strict reader turned a trivially recoverable omission into a
  // dead wave and a misleading diagnosis.
  //
  // Strict grammar, forgiving reader (the same contract mutate.ts already keeps
  // for malformed lines): if a section name resolves, use it. If it does not,
  // fall through to searching EVERY section for the target line. A mutation whose
  // target is unambiguous should never fail on bookkeeping.
  const findSection = (needle: string): Section | undefined => {
    const n = needle.toLowerCase().replace(/^#+\s*/, "").trim();
    // An empty needle must NOT match — startsWith("") is true for every heading,
    // which would silently bind an omitted section to whichever section happens to
    // be first and skip the by-prefix search entirely.
    if (n.length === 0) return undefined;
    return (
      doc.sections.find((s) => s.heading.toLowerCase().replace(/^##\s*/, "").startsWith(n)) ??
      doc.sections.find((s) => s.heading.toLowerCase().includes(n))
    );
  };

  /** Locate a line anywhere in the document. Used when the section slot did not
   * resolve — the line prefix is the real identifier. */
  const findAnywhere = (prefix: string): { sec: Section; i: number } | undefined => {
    const p = norm(prefix);
    if (p.length === 0) return undefined;
    for (const sec of doc.sections) {
      const i = sec.lines.findIndex((l) => l.trim().startsWith("- ") && (norm(l).startsWith(p) || norm(l).includes(p)));
      if (i !== -1) return { sec, i };
    }
    return undefined;
  };
  const findLine = (sec: Section, prefix: string): number => {
    const p = norm(prefix);
    if (p.length === 0) return -1; // an empty prefix would match the first bullet
    return sec.lines.findIndex((l) => l.trim().startsWith("- ") && (norm(l).startsWith(p) || norm(l).includes(p)));
  };

  // CONSUMED-LINE TRACKING. Mutations apply in order, so an earlier MERGE or
  // RETRACT can legitimately remove the line a later mutation targets. Live wave
  // 2026-07-24 did exactly that: a MERGE folded two preference lines, then a
  // REVISE and a RETRACT aimed at one of them and were reported as "no line
  // matches that prefix" — which reads like a hallucinated target and sends the
  // reader hunting a model defect that isn't there. The model was right; it was
  // simply describing the same consolidation twice.
  //
  // Recording what this wave removed lets the rejection tell the truth, and the
  // distinction matters: a superseded target is normal metabolism, a
  // hallucinated one is back-pressure.
  const consumed: string[] = [];
  const wasConsumed = (prefix: string): boolean => consumed.some((c) => sameSubstance(c, prefix));

  for (const mu of orderCatabolicFirst(mutations)) {
    if (mu.op === "no-change") continue;

    // SPEND-A-FRACTION gate, not spend-everything.
    //
    // First version let appends consume the FULL savings of the same wave, which
    // is why the fourth live wave still came back net -62: the engine was working
    // exactly as written, and "exactly as written" was convergence at ~60 chars
    // per wave — roughly 60 waves to reach target, i.e. a month of nights to undo
    // one afternoon of accretion. Correct but useless is still useless.
    //
    // While over target, growth may spend only a THIRD of what shrinking earns.
    // Every wave then makes real progress (two thirds of each cut is banked) and
    // genuinely new observations still land instead of starving. Deferred, not
    // rejected: the observation is real and waits for a wave with room.
    if (overAtStart && userOpDirection(mu.op) === "anabolic") {
      const saved = Math.max(0, startLen - currentLen());
      anabolicBudget = Math.floor(saved / 3);
      const cost = mu.op === "observe" ? mu.line.length : mu.text.length;
      if (currentLen() > targetChars && cost > anabolicBudget) {
        deferred.push(
          `${mu.op.toUpperCase()} ${mu.section} :: ${(mu.op === "observe" ? mu.line : mu.text).slice(0, 60)}`
        );
        continue;
      }
    }

    let sec = findSection(mu.section);
    if (!sec) {
      // The section slot did not resolve. For anything that targets an existing
      // line, the prefix identifies it unambiguously — and when the model omits
      // the section, its text shifts into that slot, so mu.section IS the prefix.
      const targetPrefix =
        mu.op === "retract" || mu.op === "revise" || mu.op === "deepen" ? mu.prefix : undefined;
      const hit = findAnywhere(targetPrefix ?? mu.section);
      if (hit) {
        sec = hit.sec;
      } else {
        rejected.push({
          line: `${mu.op.toUpperCase()} ${mu.section.slice(0, 50)}`,
          reason: `no section matching "${mu.section.slice(0, 40)}" and no line found by that prefix in any section`,
        });
        continue;
      }
    }

    switch (mu.op) {
      case "observe": {
        // Universal dup guard, present from birth in this organ rather than
        // retrofitted after the damage.
        const twin = sec.lines.findIndex((l) => l.trim().startsWith("- ") && sameSubstance(l, mu.line));
        if (twin !== -1) {
          const existing = sec.lines[twin];
          if (norm(mu.line).length > norm(existing).length) {
            sec.lines[twin] = asBullet(ensureStamp(mu.line));
            applied.push(`OBSERVE→REVISE ${sec.heading.replace(/^##\s*/, "")} — already held; sharpened in place`);
          } else {
            rejected.push({ line: `OBSERVE :: ${mu.line.slice(0, 60)}`, reason: "this observation is already held — a trait is not stronger for being listed twice" });
          }
          collapsed++;
          break;
        }
        sec.lines.push(asBullet(ensureStamp(mu.line)));
        applied.push(`OBSERVE ${sec.heading.replace(/^##\s*/, "")} :: ${mu.line.slice(0, 70)}`);
        break;
      }
      case "deepen": {
        const i = findLine(sec, mu.prefix);
        if (i === -1) {
          rejected.push({
            line: `DEEPEN :: ${mu.prefix.slice(0, 50)}`,
            reason: wasConsumed(mu.prefix)
              ? "target was already consolidated by an earlier mutation in this same wave (normal — not a hallucinated target)"
              : "no line matches that prefix",
          });
          break;
        }
        if (sameSubstance(sec.lines[i], mu.text)) {
          rejected.push({ line: `DEEPEN :: ${mu.prefix.slice(0, 50)}`, reason: "that evidence is already carried by the line" });
          collapsed++;
          break;
        }
        sec.lines[i] = `${sec.lines[i]} ${ensureStamp(mu.text)}`;
        applied.push(`DEEPEN ${sec.heading.replace(/^##\s*/, "")} :: ${mu.prefix.slice(0, 50)}`);
        break;
      }
      case "revise": {
        const i = findLine(sec, mu.prefix);
        if (i === -1) {
          rejected.push({
            line: `REVISE :: ${mu.prefix.slice(0, 50)}`,
            reason: wasConsumed(mu.prefix)
              ? "target was already consolidated by an earlier mutation in this same wave (normal — not a hallucinated target)"
              : "no line matches that prefix",
          });
          break;
        }
        const before = sec.lines[i].length;
        const replacement = asBullet(ensureStamp(mu.line));

        // A REVISE THAT GROWS IS AN APPEND WEARING A CATABOLIC LABEL.
        //
        // Caught on real session data (2026-07-25): the gate correctly deferred
        // four appends, then a `REVISE` expanded a line 138 -> 232 chars and
        // sailed straight through, because the budget check keys off op TYPE and
        // REVISE is classified catabolic. Net +94 while 554 tokens over target.
        //
        // The classification is a statement of INTENT, not of effect. Intent is
        // not measurable; bytes are. So a REVISE that would grow the line is held
        // to the same budget as an OBSERVE — it may spend only the headroom the
        // wave's real cuts have earned. Sharpening stays free; padding does not.
        const growth = replacement.length - before;
        if (overAtStart && growth > 0 && currentLen() > targetChars) {
          const saved = Math.max(0, startLen - currentLen());
          if (growth > Math.floor(saved / 3)) {
            deferred.push(`REVISE ${mu.section} :: ${mu.prefix.slice(0, 40)} (+${growth} chars — a revision that grows)`);
            break;
          }
        }

        sec.lines[i] = replacement;
        applied.push(`REVISE ${sec.heading.replace(/^##\s*/, "")} — ${before} → ${sec.lines[i].length} chars`);
        break;
      }
      case "merge": {
        const ia = findLine(sec, mu.prefixA);
        const ib = findLine(sec, mu.prefixB);
        if (ia === -1 || ib === -1) {
          rejected.push({ line: `MERGE :: ${mu.prefixA.slice(0, 30)} + ${mu.prefixB.slice(0, 30)}`, reason: `${ia === -1 ? "first" : "second"} prefix matches no line` });
          break;
        }
        if (ia === ib) { rejected.push({ line: `MERGE :: ${mu.prefixA.slice(0, 40)}`, reason: "both prefixes match the SAME line — cannot merge a line into itself" }); break; }
        const savedChars = sec.lines[ia].length + sec.lines[ib].length - mu.line.length;

        // Same hole as REVISE: a "merge" whose unified line is LONGER than the two
        // lines it replaces is growth with a catabolic label. Held to the budget.
        if (overAtStart && savedChars < 0 && currentLen() > targetChars) {
          const saved = Math.max(0, startLen - currentLen());
          if (-savedChars > Math.floor(saved / 3)) {
            deferred.push(`MERGE ${mu.section} :: ${mu.prefixA.slice(0, 30)} + ${mu.prefixB.slice(0, 30)} (+${-savedChars} chars — a merge that grows)`);
            break;
          }
        }

        const keep = Math.min(ia, ib);
        const drop = Math.max(ia, ib);
        consumed.push(sec.lines[ia], sec.lines[ib]);
        sec.lines[keep] = asBullet(ensureStamp(mu.line));
        sec.lines.splice(drop, 1);
        applied.push(`MERGE ${sec.heading.replace(/^##\s*/, "")} — two traits folded into one (saved ${savedChars} chars)`);
        break;
      }
      case "retract": {
        const i = findLine(sec, mu.prefix);
        if (i === -1) {
          rejected.push({
            line: `RETRACT :: ${mu.prefix.slice(0, 50)}`,
            reason: wasConsumed(mu.prefix)
              ? "target was already consolidated by an earlier mutation in this same wave (normal — not a hallucinated target)"
              : "no line matches that prefix",
          });
          break;
        }
        applied.push(`RETRACT ${sec.heading.replace(/^##\s*/, "")} :: ${sec.lines[i].slice(0, 70)}`);
        consumed.push(sec.lines[i]);
        sec.lines.splice(i, 1);
        break;
      }
    }
  }

  if (applied.length === 0) {
    // THREE distinct zero-applied waves, and conflating any two of them sends the
    // reader after a bug that isn't there. This is the third time this exact
    // lesson has come up in this engine's short life, which is itself the signal:
    //   - all DEFERRED  → the file is over target and nothing funded the growth.
    //                     Correct, intended behaviour. Not an error at all.
    //   - all COLLAPSED → every observation restated a held trait. Stagnation,
    //                     honestly confessed.
    //   - all MISSING   → the model named targets that do not exist. Back-pressure.
    if (deferred.length === mutations.length && deferred.length > 0) {
      const rendered0 = renderUser(doc);
      return {
        text: rendered0,
        applied: [],
        rejected: deferred.map((d) => ({ line: d, reason: "DEFERRED — the file is over target and this wave made no cuts to fund growth; the observation is real and will be reconsidered next wave" })),
        noChange: `all ${deferred.length} observation(s) deferred — USER.md is over target and this wave proposed no consolidation to make room`,
        collapsed,
        direction,
        deltaChars: rendered0.length - userMd.length,
        deferred: deferred.length,
      };
    }
    if (collapsed === mutations.length) {
      return {
        text: userMd,
        applied: [],
        rejected,
        noChange: `every observation this cycle restated a trait USER.md already holds (${collapsed} collapsed) — nothing new was learned about jrg`,
        collapsed,
        direction,
        deltaChars: 0,
        deferred: 0,
      };
    }
    throw new Error(
      `all ${mutations.length} USER mutation(s) rejected (${rejected.map((r) => `${r.line}: ${r.reason}`).join("; ")}) — the model is mutating a USER.md it was not given`
    );
  }

  const rendered = renderUser(doc);
  for (const d of deferred) {
    rejected.push({ line: d, reason: "DEFERRED — the file is over target and this wave's cuts left no room; the observation is real and will be reconsidered next wave" });
  }

  // THE BACKSTOP INVARIANT, checked on BYTES rather than on op labels.
  //
  // Every per-op gate above keys off something the engine believes about a
  // mutation's intent, and intent has now been wrong twice: a REVISE that grew a
  // line, and a MERGE that could produce a longer line than its inputs. Rather
  // than keep patching op-by-op and hoping the next verb is honest, assert the
  // property that actually matters, once, at the end:
  //
  //   while over target, a wave may not end net-positive.
  //
  // This holds no matter which verb misbehaves or what verb gets added later. If
  // it trips, the wave is discarded and confessed — losing one cycle of real
  // observations is strictly better than a file that grows while its own
  // telemetry says it is shrinking.
  const finalDelta = rendered.length - userMd.length;
  if (overAtStart && finalDelta > 0) {
    return {
      text: userMd, // discarded — the file is left exactly as it was
      applied: [],
      rejected: [
        ...rejected,
        {
          line: `wave discarded (net +${finalDelta} chars)`,
          reason:
            "INVARIANT: USER.md is over target, so no wave may end net-positive. " +
            `This one applied ${applied.length} mutation(s) for a net gain of ${finalDelta} chars — ` +
            "most likely a REVISE or MERGE that expanded rather than sharpened.",
        },
      ],
      noChange:
        `wave discarded: ${applied.length} mutation(s) would have GROWN USER.md by ${finalDelta} chars while it is ` +
        `${Math.ceil((userMd.length - targetChars) / 4)} tokens over target — a consolidation wave that grows the file is not a consolidation`,
      collapsed,
      direction,
      deltaChars: 0,
      deferred: deferred.length,
    };
  }

  return { text: rendered, applied, rejected, noChange: null, collapsed, direction, deltaChars: finalDelta, deferred: deferred.length };
}
