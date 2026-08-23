#!/usr/bin/env bun
/**
 * stack.ts — the stacker, the only writer of atoms (popmem WS-C,
 * docs/POPULATION-MEMORY.md §7 R2/R3/R5, templates/MIND-SPEC.md
 * "The stacker").
 *
 * episode -> EXTRACT (<=5 candidate atoms via the local LLM) -> deterministic
 * dedupe (exact content-hash, then token-overlap band, ltp.ts) -> COMPARE
 * (one token, local LLM) only for the borderline band -> weight bumps / new
 * atoms via atoms.ts. The model NEVER composes the document (five sentences,
 * #5); it only ever extracts candidates from one episode, or compares two
 * claims. The engine does all the arithmetic — dedupe routing, ledger
 * writes, weight folding — none of it is a model call.
 *
 * Model surface is EXACTLY two call shapes (R5), both through llm.ts:
 *   EXTRACT  — one episode -> <=5 candidates in a fixed, structurally-parsed
 *              shape. `source` (episode filename) and `[ep:]` (episode date)
 *              are NEVER asked of the model — they are known facts injected
 *              by this file, which shrinks the model's hallucination surface
 *              to exactly claim/why/quote text.
 *   COMPARE  — two claims -> one token: SAME | DISTINCT | SUPERSEDES_A |
 *              SUPERSEDES_B. Anything else the model returns is coerced to
 *              DISTINCT (the safe default: a false-DISTINCT only costs a
 *              near-dup a later COMPARE can still collapse; a false-SAME
 *              loses a belief permanently) and the coercion is surfaced as a
 *              degraded obs event, never silently repaired.
 *
 * Counterfeit-quote assert (R3): every candidate quote must appear VERBATIM
 * (exact substring match after whitespace/quote-mark normalization — see
 * normalizeForQuoteMatch) in the source episode's content, or the candidate
 * is rejected at extraction. This mirrors mutate.ts's normalizeForQuoteMatch
 * (same normalization scheme) but is reimplemented locally: mutate.ts
 * retires under WS-H and does not export it.
 *
 * Dedupe pipeline, per candidate, against the existing ACTIVE population
 * (superseded atoms are not dedupe targets — they are historical):
 *   1. exact:   atomId(claim) already on disk           -> stack (weight +1)
 *   2. overlap: jaccard >= LTP_THRESHOLD (0.30) vs the
 *               highest-overlap existing atom            -> auto-SAME, stack
 *   3. band:    highest overlap in [BAND_LOW, LTP_THRESHOLD)
 *               -> COMPARE against up to COMPARE_TOP_K (2) highest-overlap
 *                  in-band atoms, highest first:
 *                    SAME | SUPERSEDES_B -> stack (existing wins), and
 *                                            short-circuits any remaining
 *                                            in-band candidate (no more calls)
 *                    SUPERSEDES_A        -> remembered, but the loop keeps
 *                                            checking (a later SAME still
 *                                            wins); if no SAME/SUPERSEDES_B
 *                                            is found, the FIRST such
 *                                            candidate supersedes: new atom
 *                                            born, existing superseded
 *                                            (weight transfers)
 *                    DISTINCT (or unrecognized) from every consulted
 *                    candidate                           -> new atom
 *   4. below BAND_LOW vs everything                      -> new atom
 * Candidates within one extraction batch dedupe against EACH OTHER through
 * this same pipeline, in deterministic (extraction) order: a candidate that
 * resolves to "new" or "supersede" is added to the in-memory population
 * before the next candidate in the batch is routed — in-batch stutter dies
 * here, same engine, no special case.
 *
 * Idempotence (R2, acceptance): stacking the same episode twice changes ONLY
 * the ledger (weight), never the beliefs/ file set or any file's bytes.
 * Belt and suspenders, both layers active:
 *   (a) the dedupe pipeline itself — re-extracted candidates hash/overlap-
 *       match the atoms they already produced, so they route to "stack", not
 *       "new";
 *   (b) an episode-level short-circuit — if the ledger already holds a
 *       `stack` event with this episode's filename, EXTRACT is skipped
 *       entirely and an idle obs event is emitted.
 * Merge-then-readd is INEXPRESSIBLE: there is no code path that both merges
 * an atom and re-adds it as a second file — "new" and "stack"/"supersede"
 * are mutually exclusive outcomes of one routeCandidate call.
 *
 * CLI / gauntlet payload contract (src/gauntlet.ts): invoked as
 * `bun src/stack.ts <sandboxHome> <episodeFilename>...` with
 * CIRCADIAN_HOME=<sandboxHome>. Episodes read from
 * $sandboxHome/mind/episodes/<filename>; atoms written to
 * $sandboxHome/mind/beliefs/, ledger to $sandboxHome/mind/beliefs.jsonl.
 * Every EXTRACT/COMPARE prompt + raw completion is appended to
 * $sandboxHome/logs/stacker-io.jsonl (the distillation flywheel's training
 * data, program brief §6 scope line) — one JSON line per call.
 *
 * Law 9: every episode processed emits exactly one aggregate obs event
 * (ok if every candidate was clean, degraded if any candidate was rejected,
 * capped-over, or the model returned an unrecognized COMPARE token) plus one
 * idle event for a short-circuited already-stacked episode. This file counts,
 * beyond the brief's own stacked/bumped/new/rejected vocabulary, an extra
 * `superseded` (how many of the new atoms this run also superseded an old
 * one) and `compareCalls`/`compareInvalid` (how many COMPARE calls were made
 * at all, across every in-band candidate consulted per routeCandidate call —
 * not one per candidate claim, since COMPARE_TOP_K may consult more than one
 * existing atom — and how many of those calls came back malformed) — the
 * split makes "how much did the deterministic layers save" a number in the
 * event context, not a vibe:
 *   new        — brand-new atom files written this episode (DISTINCT or
 *                SUPERSEDES_A cases)
 *   superseded — subset of `new` where an existing atom was also superseded
 *   stacked    — weight bumps on an existing atom via the DETERMINISTIC
 *                layers alone (exact-hash or overlap >= LTP_THRESHOLD) — no
 *                COMPARE call
 *   bumped     — weight bumps on an existing atom via COMPARE (SAME or
 *                SUPERSEDES_B) — a COMPARE call was made and the existing
 *                atom won
 *   rejected   — candidates that failed shape or the counterfeit-quote
 *                assert at extraction
 */

import * as fs from "fs";
import * as path from "path";
import {
  atomId,
  writeAtom,
  readAtoms,
  readLedger,
  appendLedger,
  foldWeights,
  type AtomKind,
  type LedgerEvent,
} from "./atoms.ts";
import { significantTokens, jaccard, LTP_THRESHOLD } from "./ltp.ts";
import { complete } from "./llm.ts";
import { ok, idle, degraded, fail, correlation } from "./obs.ts";

// ---------------------------------------------------------------------
// knobs — all thresholds exported, per the brief
// ---------------------------------------------------------------------

/** Prompt asks for at most this many; a response with more is capped, extras
 * counted as droppedOverCap rather than silently discarded. */
export const MAX_CANDIDATES = 5;
/** Mirrors atoms.ts's own claim cap (parseAtom/writeAtom reject above this
 * too) — checked here so a bad candidate is rejected at extraction with a
 * precise reason, not later inside writeAtom. */
export const CLAIM_MAX_CHARS = 280;
/** overlap >= this vs the highest-overlap existing atom -> auto-SAME, no
 * COMPARE call (re-exported ltp.ts knob — one threshold, one owner). */
export const BAND_HIGH = LTP_THRESHOLD;
/** overlap >= this (and < BAND_HIGH) routes to COMPARE. Below this: new atom.
 * Widened from 0.15 (popmem WS-C2, §10 fallback): the 14-flood acceptance run
 * showed most near-dup candidates landing BELOW the old band, so the
 * deterministic layers never fired and COMPARE was never even consulted. A
 * false auto-SAME loses a belief permanently; a wider CONSULT band only costs
 * an extra model call (COMPARE ran 8/8 correct when consulted in the
 * baseline) — so the fallback widens the band that reaches the model, never
 * the auto-collapse threshold. */
export const BAND_LOW = 0.05;
/** how many highest-overlap existing atoms (within the band) COMPARE
 * consults before falling back to DISTINCT/new (popmem WS-C2, §10 fallback:
 * widen deterministic routing, not the model). Priority across the
 * consulted set is SAME/SUPERSEDES_B > SUPERSEDES_A > DISTINCT; a SAME/
 * SUPERSEDES_B match short-circuits the remaining candidates. */
export const COMPARE_TOP_K = 2;
/** EXTRACT runs at temperature 0 (COMPARE keeps the llm.ts default):
 * near-dup flood episodes should paraphrase a belief IDENTICALLY, not
 * differently each time, so the same content yields the same candidate
 * claim and the deterministic hash/overlap layers collapse it for free
 * before COMPARE is ever needed — this also hardens the idempotence
 * suspenders layer (same content -> same candidate -> exact hash hit). */
export const EXTRACT_TEMPERATURE = 0;

// ---------------------------------------------------------------------
// exposure metering — flash vs standard (w2 brief: the light meter)
// ---------------------------------------------------------------------

/** Flash exposures deposit at this fraction of full weight. Absent `grain`
 * on a ledger stack event folds as 1 (append-only backward compat). */
export const FLASH_GRAIN = 0.25;
/** A flash episode's body (frontmatter stripped) must be at most this long —
 * tuned on the real corpus: the longest flash episodes (CAIRN narration
 * renditions, ~2.4k chars) sit below it; substantive sessions (neural-
 * avalanche SELECTOR run at ~2.6k, genesis-archaeology at ~8k) clear it. */
export const FLASH_BODY_MAX = 2600;
/** A flash episode's transcript must consist of at most this many
 * user/assistant exchange pairs. */
export const FLASH_PAIRS_MAX = 2;

export type ExposureClass = "flash" | "standard";

export interface EpisodeView {
  name: string;
  body: string;
}

// ---------------------------------------------------------------------
// instruction-echo / role-brief patterns — body evidence, not filename.
// Each pattern was tuned against the real 155-episode corpus on 2026-08-09:
// the flash set is the ack/verdict/ok/pong/cairn echo family plus the
// disposable-worker role briefs ("You are the %s worker. Read … execute it
// fully") whose identity atoms contaminated the mind (w2 report, boundary
// notes). A pure body scanner keeps filenames as hints, not truth.
// ---------------------------------------------------------------------

const ECHO_PATTERNS: RegExp[] = [
  /\breply with (exactly|only|the (single )?word)\b/i,
  /\breply (exactly|only|OK|READY|PONG|ACK|DONE)\b/i,
  /\b(say|answer|respond) (exactly |only )?(OK|READY|CAIRN|PONG|ACK|DONE)\b/i,
  /\bwrite (exactly )?['"][^'"]{1,40}['"] to \/tmp\b/i,
  /\bprint the word [A-Za-z]+\b/i,
  /\bthe single word [A-Z]+\b/i,
  // role briefs from disposable herdr workers
  /\byou are (a|an|the)? ?[^.\n]{0,100}?\b(worker|orchestrator|probe|selector|sink|gate-brain)\b/i,
  /\bthe worker contract (it references )?binds you\b/i,
  /\bcontract binds\b/i,
  /\b(execute|read) (it|your brief|the brief) fully\b/i,
  /\bexecute the brief at\b/i,
  /\bwrite your complete output to\b/i,
];

function matchesEcho(text: string): boolean {
  return ECHO_PATTERNS.some((re) => re.test(text));
}

/** Strips the episode YAML frontmatter block (`---\n…\n---\n`). */
export function stripFrontmatter(content: string): string {
  const m = content.match(/^---\n[\s\S]*?\n---\n?/);
  return m ? content.slice(m[0].length) : content;
}

/** Parses the body's leading transcript region (up to the first analysis
 * marker: user-observed/what-changed/meta) into exchange pairs and the
 * first user turn. Handles labeled `"User: …" / "Assistant: …"` lines and
 * unlabeled consecutive quoted lines (alternating user/assistant). */
export function parseExposureTranscript(body: string): {
  pairs: number;
  firstUserTurn: string | null;
} {
  const lines = body.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const transcript: string[] = [];
  for (const line of lines) {
    if (/^(user-observed|what-changed|meta)\s*:/i.test(line)) break;
    if (line.startsWith("#")) continue;
    if (line.startsWith('"User:') || line.startsWith('"Assistant:') || /^["'“]/.test(line) || /^User:|^Assistant:/i.test(line)) {
      transcript.push(line);
      continue;
    }
    if (transcript.length > 0) break; // prose after the transcript ends it
  }

  const labeledUser: string[] = [];
  const labeledAsst: string[] = [];
  const unlabeled: string[] = [];
  for (const line of transcript) {
    const mu = line.match(/^"?User:\s*(.*?)"?\s*$/is);
    if (mu) {
      labeledUser.push(mu[1].trim().replace(/["“”]$/, ""));
      continue;
    }
    const ma = line.match(/^"?Assistant:\s*(.*?)"?\s*$/is);
    if (ma) {
      labeledAsst.push(ma[1].trim().replace(/["“”]$/, ""));
      continue;
    }
    const q = line.match(/^["'“”](.*)["'“”]\s*$/s);
    if (q) {
      unlabeled.push(q[1].trim());
      continue;
    }
  }

  const pairs = labeledUser.length + labeledAsst.length > 0
    ? Math.min(labeledUser.length, labeledAsst.length)
    : Math.floor(unlabeled.length / 2);

  const firstUserTurn = labeledUser[0] ?? unlabeled[0] ?? null;
  return { pairs, firstUserTurn };
}

/** Classification — a pure function over the episode file (no LLM, no
 * network). An episode is a FLASH exposure when it is structurally trivial:
 * short body, <= FLASH_PAIRS_MAX exchange pairs, and its opening shows an
 * instruction-echo or disposable-role-brief pattern. Decided by BODY
 * EVIDENCE — the filename is a hint, not truth.
 *
 * Signals (w2 brief, tuned on the real corpus):
 *   1. total body length below FLASH_BODY_MAX;
 *   2. transcript consists of <= FLASH_PAIRS_MAX user/assistant pairs;
 *   3. the user turn (or, for prose-rendered episodes, the transcript head)
 *      matches an instruction-echo pattern ("Reply with exactly", "say OK",
 *      single-word expected output) or a disposable-worker role brief;
 *   3b. a verbatim identical-quote echo (user turn == assistant turn) is a
 *      one-token test regardless of which side carried the instruction.
 */
export function classifyExposure(episode: EpisodeView): ExposureClass {
  const body = stripFrontmatter(episode.body);

  // Signal 1: body length.
  if (body.length > FLASH_BODY_MAX) return "standard";

  const t = parseExposureTranscript(body);

  // Signal 2: exchange pairs.
  if (t.pairs > FLASH_PAIRS_MAX) return "standard";

  // Signal 3: instruction-echo / role-brief in the user turn, else the raw
  // transcript head (prose renditions — e.g. CAIRN kickoff narratives embed
  // the whole exchange in one paragraph).
  const marker = body.search(/\nuser-observed:|\nwhat-changed:|\nmeta\s*:/i);
  const transcriptHead = (marker > 0 ? body.slice(0, marker) : body.slice(0, 600)).slice(0, 600);
  if (matchesEcho(t.firstUserTurn ?? transcriptHead)) return "flash";

  // Signal 3b: identical-quote echo (e.g. verdict-hook-validation-3).
  const quoted = body.split("\n")
    .map((l) => l.trim())
    .map((l) => l.match(/^["'“”](.+)['"“”]$/)?.[1]?.trim())
    .filter((x): x is string => Boolean(x));
  if (quoted.length >= 2 && quoted[0].toLowerCase() === quoted[1].toLowerCase()) return "flash";

  return "standard";
}

const KINDS: readonly AtomKind[] = ["identity", "doctrine", "motif", "agreement"];

// EXTRACT: episode-sized single call, same 90s single-call budget as
// graze.ts's bullet extraction (comparable output scale: a handful of short
// structured fields, not a full-document rewrite).
const EXTRACT_TIMEOUT_MS = 90 * 1000;
const EXTRACT_MAX_TOKENS = 2000;
// COMPARE: one token out. Small budget; still generous headroom over the
// ~1-4 tokens actually needed so a non-reasoning model's stray word doesn't
// trip the truncation guard in llm.ts.
const COMPARE_TIMEOUT_MS = 60 * 1000;
const COMPARE_MAX_TOKENS = 20;

// ---------------------------------------------------------------------
// counterfeit-quote assert (R3)
// ---------------------------------------------------------------------

/** Same normalization scheme as mutate.ts's (soon-retired) normalizeForQuoteMatch:
 * curly quotes/apostrophes/dashes to their ascii form, whitespace runs
 * collapsed, edges trimmed. Documented here because it is a shape rule, not
 * validator prose (R3) — this exact function IS the rule. */
export function normalizeForQuoteMatch(s: string): string {
  return s
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** Every quote must appear verbatim (post-normalization) in the source
 * episode content. Pure, no I/O. */
export function quotesAreVerbatim(quotes: string[], episodeContent: string): boolean {
  const haystack = normalizeForQuoteMatch(episodeContent);
  return quotes.every((q) => haystack.includes(normalizeForQuoteMatch(q)));
}

// ---------------------------------------------------------------------
// candidate shape — structural rejection, no validator prose (R3)
// ---------------------------------------------------------------------

export interface Candidate {
  kind: AtomKind;
  claim: string;
  why: string;
  /** verbatim quote TEXT only — source/eps are injected by the caller from
   * known facts (the episode's own filename/date), never asked of the model. */
  quotes: string[];
}

export class CandidateShapeError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "CandidateShapeError";
  }
}

/** Reads a `prefix"..."` line as a complete JSON string literal — the whole
 * remainder of the line must be valid JSON (stricter than atoms.ts's partial
 * scan; candidate lines here never carry a trailing " | source" suffix, so a
 * full-line JSON.parse is simpler and just as safe). */
function readJsonFieldLine(line: string | undefined, prefix: string, fieldName: string): string {
  if (line === undefined || !line.startsWith(prefix)) throw new CandidateShapeError(`missing ${fieldName}`);
  let value: unknown;
  try {
    value = JSON.parse(line.slice(prefix.length));
  } catch {
    throw new CandidateShapeError(`malformed ${fieldName}`);
  }
  if (typeof value !== "string") throw new CandidateShapeError(`malformed ${fieldName}`);
  return value;
}

/** Splits a raw EXTRACT completion into candidate blocks, anchored on lines
 * starting `kind: ` (the fixed first field of every block). Blank lines and
 * any stray prose between/around blocks are ignored — only `kind: ` starts
 * a new block, so extra chatter never merges into or corrupts a block. */
function splitCandidateBlocks(raw: string): string[][] {
  const blocks: string[][] = [];
  let current: string[] | null = null;
  for (const rawLine of raw.split("\n")) {
    const line = rawLine.trimEnd();
    if (line.startsWith("kind: ")) {
      if (current) blocks.push(current);
      current = [line];
    } else if (current && line.trim() !== "") {
      current.push(line);
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

/** Parses one candidate block. Throws CandidateShapeError (short reason, no
 * prose) on any missing/malformed slot: bad/missing kind, missing/oversized/
 * empty claim, missing/empty why, zero quotes, or an empty quote. */
export function parseCandidateBlock(lines: string[]): Candidate {
  const kindLine = lines[0];
  if (kindLine === undefined) throw new CandidateShapeError("missing kind");
  const kind = kindLine.slice("kind: ".length).trim() as AtomKind;
  if (!KINDS.includes(kind)) throw new CandidateShapeError("bad kind");

  const claim = readJsonFieldLine(lines[1], "claim: ", "claim");
  if (!claim) throw new CandidateShapeError("empty claim");
  if (claim.length > CLAIM_MAX_CHARS) throw new CandidateShapeError("claim exceeds 280 chars");

  const why = readJsonFieldLine(lines[2], "why: ", "why");
  if (!why) throw new CandidateShapeError("empty why");

  const quotes: string[] = [];
  for (let i = 3; i < lines.length; i++) {
    const q = readJsonFieldLine(lines[i], "quote: ", "quote");
    if (!q) throw new CandidateShapeError("empty quote");
    quotes.push(q);
  }
  if (quotes.length === 0) throw new CandidateShapeError("no quote");

  return { kind, claim, why, quotes };
}

export interface RejectedCandidate {
  reason: string;
  block: string;
}

export interface ExtractParseResult {
  candidates: Candidate[];
  rejected: RejectedCandidate[];
  /** valid candidates beyond MAX_CANDIDATES, dropped (extraction order kept). */
  droppedOverCap: number;
}

/** Structural parse + counterfeit-quote assert, one candidate at a time —
 * a malformed or counterfeit-quoted candidate is REJECTED individually,
 * never repaired, and never fails the whole batch (pure, no I/O, no LLM). */
export function processExtractCompletion(raw: string, episodeContent: string): ExtractParseResult {
  const blocks = splitCandidateBlocks(raw);
  const candidates: Candidate[] = [];
  const rejected: RejectedCandidate[] = [];

  for (const blockLines of blocks) {
    const block = blockLines.join("\n");
    try {
      const candidate = parseCandidateBlock(blockLines);
      if (!quotesAreVerbatim(candidate.quotes, episodeContent)) {
        rejected.push({ reason: "counterfeit quote: not verbatim in source episode", block });
        continue;
      }
      candidates.push(candidate);
    } catch (err) {
      rejected.push({ reason: err instanceof CandidateShapeError ? err.message : String(err), block });
    }
  }

  let droppedOverCap = 0;
  if (candidates.length > MAX_CANDIDATES) {
    droppedOverCap = candidates.length - MAX_CANDIDATES;
    candidates.length = MAX_CANDIDATES;
  }
  return { candidates, rejected, droppedOverCap };
}

// ---------------------------------------------------------------------
// COMPARE token
// ---------------------------------------------------------------------

export type CompareToken = "SAME" | "DISTINCT" | "SUPERSEDES_A" | "SUPERSEDES_B";
const COMPARE_TOKENS: readonly CompareToken[] = ["SAME", "DISTINCT", "SUPERSEDES_A", "SUPERSEDES_B"];

/** Anything that isn't exactly one of the four tokens (case/whitespace
 * folded) coerces to DISTINCT — the safe default (module header) — with
 * `valid: false` so the caller can surface a degraded event. */
export function parseCompareToken(raw: string): { token: CompareToken; valid: boolean } {
  const t = raw.trim().toUpperCase();
  if ((COMPARE_TOKENS as readonly string[]).includes(t)) return { token: t as CompareToken, valid: true };
  return { token: "DISTINCT", valid: false };
}

// ---------------------------------------------------------------------
// dedupe router — pure except for the injected comparator call (R5, R2)
// ---------------------------------------------------------------------

export interface ExistingAtomView {
  id: string;
  claim: string;
}

/** Returns the raw COMPARE completion text (one token, or whatever the model
 * actually said) — routeCandidate parses/coerces it. Injectable so the
 * deterministic router is unit-testable with zero LLM calls. */
export type Comparator = (claimA: string, claimB: string) => Promise<string> | string;

export interface RouteDecision {
  action: "stack" | "new" | "supersede";
  /** existing atom id for "stack"; the atom being superseded (loser) for "supersede". */
  targetAtomId?: string;
  overlap: number;
  compareUsed: boolean;
  /** token that decided the outcome (the winning SAME/SUPERSEDES_*, or the
   * last DISTINCT/unrecognized token seen when every consulted candidate
   * came back DISTINCT). Undefined when compareUsed is false. */
  compareToken?: CompareToken;
  /** validity of the DECIDING call (see compareToken). Undefined when
   * compareUsed is false. */
  compareValid?: boolean;
  /** actual number of compare() invocations made for this candidate — may be
   * >1 when COMPARE_TOP_K consults more than one in-band atom. Always 0 when
   * compareUsed is false. */
  compareCallCount: number;
  /** how many of those calls came back unrecognized (coerced to DISTINCT). */
  compareInvalidCount: number;
}

/**
 * Routes one candidate claim against the existing (active-only) population.
 * Layer 1 (exact hash) and layer 2 (overlap >= BAND_HIGH) never call compare.
 * Layer 3 (overlap in [BAND_LOW, BAND_HIGH)) consults up to `topK`
 * (COMPARE_TOP_K) highest-overlap in-band atoms, highest overlap first:
 * a SAME/SUPERSEDES_B verdict short-circuits (stack, no further calls); a
 * SUPERSEDES_A is remembered but the loop keeps checking (a later SAME still
 * wins the whole candidate — priority is SAME/SUPERSEDES_B > SUPERSEDES_A >
 * DISTINCT); if every consulted atom comes back DISTINCT (or unrecognized),
 * the candidate is new. Below BAND_LOW: new atom, no COMPARE call. `existing`
 * is mutated by nobody here — the caller owns in-batch population updates
 * between calls (module header: in-batch stutter dedupes through repeated
 * calls to this same function).
 */
export async function routeCandidate(
  claim: string,
  existing: ExistingAtomView[],
  compare: Comparator,
  opts?: { sameThreshold?: number; bandLow?: number; topK?: number }
): Promise<RouteDecision> {
  const sameThreshold = opts?.sameThreshold ?? BAND_HIGH;
  const bandLow = opts?.bandLow ?? BAND_LOW;
  const topK = opts?.topK ?? COMPARE_TOP_K;

  // Layer 1: exact content-hash.
  const id = atomId(claim);
  const exact = existing.find((e) => e.id === id);
  if (exact) {
    return { action: "stack", targetAtomId: exact.id, overlap: 1, compareUsed: false, compareCallCount: 0, compareInvalidCount: 0 };
  }

  // Layer 2/3: token-overlap against every existing atom, ranked descending.
  const claimTokens = significantTokens(claim);
  const ranked = existing
    .map((e) => ({ e, overlap: jaccard(claimTokens, significantTokens(e.claim)) }))
    .sort((a, b) => b.overlap - a.overlap);
  const best = ranked[0] ?? null;

  if (best && best.overlap >= sameThreshold) {
    return {
      action: "stack",
      targetAtomId: best.e.id,
      overlap: best.overlap,
      compareUsed: false,
      compareCallCount: 0,
      compareInvalidCount: 0,
    };
  }

  if (best && best.overlap >= bandLow) {
    const inBand = ranked.filter((r) => r.overlap >= bandLow && r.overlap < sameThreshold).slice(0, topK);
    let compareCallCount = 0;
    let compareInvalidCount = 0;
    let supersedeCandidate: { e: ExistingAtomView; overlap: number; token: CompareToken; valid: boolean } | null = null;
    let lastToken: CompareToken = "DISTINCT";
    let lastValid = true;

    for (const cand of inBand) {
      const raw = await compare(claim, cand.e.claim);
      compareCallCount++;
      const { token, valid } = parseCompareToken(raw);
      if (!valid) compareInvalidCount++;
      lastToken = token;
      lastValid = valid;

      if (token === "SAME" || token === "SUPERSEDES_B") {
        return {
          action: "stack",
          targetAtomId: cand.e.id,
          overlap: cand.overlap,
          compareUsed: true,
          compareToken: token,
          compareValid: valid,
          compareCallCount,
          compareInvalidCount,
        };
      }
      if (token === "SUPERSEDES_A" && !supersedeCandidate) {
        supersedeCandidate = { e: cand.e, overlap: cand.overlap, token, valid };
      }
      // DISTINCT (or unrecognized, already coerced to DISTINCT above): keep
      // checking the next in-band candidate.
    }

    if (supersedeCandidate) {
      return {
        action: "supersede",
        targetAtomId: supersedeCandidate.e.id,
        overlap: supersedeCandidate.overlap,
        compareUsed: true,
        compareToken: supersedeCandidate.token,
        compareValid: supersedeCandidate.valid,
        compareCallCount,
        compareInvalidCount,
      };
    }

    return {
      action: "new",
      overlap: best.overlap,
      compareUsed: true,
      compareToken: lastToken,
      compareValid: lastValid,
      compareCallCount,
      compareInvalidCount,
    };
  }

  return { action: "new", overlap: best?.overlap ?? 0, compareUsed: false, compareCallCount: 0, compareInvalidCount: 0 };
}

// ---------------------------------------------------------------------
// prompts — pure string builders, no I/O, unit-testable without an LLM
// ---------------------------------------------------------------------

export function buildExtractPrompt(episodeContent: string): string {
  return [
    `You extract candidate BELIEFS from one episode of a personal AI's memory system.`,
    `Extract at most ${MAX_CANDIDATES} candidates. Each candidate is exactly one of four kinds:`,
    `  identity  - a fact about who the system/agent is, across sessions`,
    `  doctrine  - a durable principle or lesson learned`,
    `  motif     - a recurring theme or pattern`,
    `  agreement - how the system and the user work together`,
    ``,
    `Episode content:`,
    `<<<EPISODE`,
    episodeContent,
    `EPISODE`,
    `>>>`,
    ``,
    `Output ONLY candidate blocks, this EXACT shape, one per candidate, separated by a blank line:`,
    ``,
    `kind: <identity|doctrine|motif|agreement>`,
    `claim: "<the belief, one sentence, at most 280 characters -- a JSON-quoted string>"`,
    `why: "<the why-chain for this belief -- a JSON-quoted string>"`,
    `quote: "<a verbatim quote from the episode above supporting this belief -- a JSON-quoted string>"`,
    ``,
    `Repeat the quote: line for more than one supporting quote. Every quote MUST be copied EXACTLY,`,
    `character for character, from the episode content above -- no paraphrasing, no ellipsis, nothing summarized.`,
    `If the episode holds no distinct belief, output nothing at all.`,
    `Output nothing except candidate blocks in the exact shape above -- no headings, no numbering, no explanation.`,
  ].join("\n");
}

export function buildComparePrompt(claimA: string, claimB: string): string {
  return [
    `Compare two candidate beliefs held by a personal AI's memory system.`,
    ``,
    `A: "${claimA}"`,
    `B: "${claimB}"`,
    ``,
    `Answer with EXACTLY ONE of these four tokens and nothing else -- no punctuation, no explanation:`,
    `SAME         - A and B are the same belief, only worded differently`,
    `DISTINCT     - A and B are different beliefs`,
    `SUPERSEDES_A - A replaces/corrects/updates B; B is now obsolete`,
    `SUPERSEDES_B - B replaces/corrects/updates A; A is now obsolete`,
    ``,
    `Answer:`,
  ].join("\n");
}

// ---------------------------------------------------------------------
// episode frontmatter — the date this episode's atoms stamp as [ep:]
// ---------------------------------------------------------------------

/** Episode format (v1 MIND-SPEC): `---\ndate: YYYY-MM-DD\n...\n---` frontmatter.
 * Returns null on a missing/malformed date line — the caller fails loudly
 * rather than guessing a stamp (Law 9: no silent invention of provenance). */
export function frontmatterDate(episodeContent: string): string | null {
  const m = episodeContent.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const dm = m[1].match(/^date:\s*(\d{4}-\d{2}-\d{2})\s*$/m);
  return dm ? dm[1] : null;
}

// ---------------------------------------------------------------------
// I/O logging — the distillation flywheel's training data
// ---------------------------------------------------------------------

interface StackerIOEntry {
  kind: "extract" | "compare";
  episode?: string;
  prompt: string;
  completion: string;
}

function logIO(ioLogPath: string, entry: StackerIOEntry): void {
  fs.mkdirSync(path.dirname(ioLogPath), { recursive: true });
  fs.appendFileSync(ioLogPath, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n");
}

// ---------------------------------------------------------------------
// per-episode stacking — the CLI/write layer (Law 9 events live here,
// atoms.ts stays pure and silent by design; see atoms.ts's own header)
// ---------------------------------------------------------------------

export interface StackEpisodeContext {
  mindDir: string;
  beliefsDir: string;
  ledgerPath: string;
  ioLogPath: string;
  filename: string;
  correlationId: string;
}

export interface StackCounts {
  new: number;
  superseded: number;
  stacked: number;
  bumped: number;
  rejected: number;
  droppedOverCap: number;
  compareCalls: number;
  compareInvalid: number;
  /** identity-kind candidates suppressed because this episode is a flash
   * exposure (w2: flash exposures are barred from minting identity). */
  identitySuppressed?: number;
  /** "flash" | "standard" — the exposure class this episode was metered as
   * (w2 exposure metering). */
  exposure?: ExposureClass;
}

export interface StackEpisodeResult {
  skipped: boolean;
  counts?: StackCounts;
  /** set when this episode could not be processed; the pass MUST continue */
  failed?: boolean;
  /** the phase that failed: "read-episode" | "parse-episode" | "extract-llm" */
  failurePhase?: string;
  /** human-readable cause, surfaced to the operator */
  failureCause?: string;
}

export async function stackEpisode(ctx: StackEpisodeContext): Promise<StackEpisodeResult> {
  const episodePath = path.join(ctx.mindDir, "episodes", ctx.filename);
  let episodeContent: string;
  try {
    episodeContent = fs.readFileSync(episodePath, "utf8");
  } catch {
    const cause = `${episodePath} does not exist or is unreadable`;
    degraded({
      process: "stack",
      phase: "read-episode",
      correlation_id: ctx.correlationId,
      summary: `episode file unreadable: ${ctx.filename}`,
      context: { filename: ctx.filename, path: episodePath },
      cause,
      next_action: "verify the gauntlet/CLI invocation seeded this episode into mind/episodes/ before calling stack.ts",
    });
    return { skipped: true, failed: true, failurePhase: "read-episode", failureCause: cause };
  }

  // Idempotence layer (b): the episode-level short-circuit ("suspenders" —
  // layer (a) is the dedupe pipeline itself, below).
  const priorEvents = readLedger(ctx.ledgerPath);
  if (priorEvents.some((e) => e.ev === "stack" && e.ep === ctx.filename)) {
    idle({
      process: "stack",
      phase: "already-stacked",
      correlation_id: ctx.correlationId,
      summary: `episode already stacked, skipping: ${ctx.filename}`,
      context: { filename: ctx.filename },
    });
    return { skipped: true };
  }

  const episodeDate = frontmatterDate(episodeContent);
  if (!episodeDate) {
    const cause = `expected a "---\\ndate: YYYY-MM-DD" frontmatter block, found none in ${ctx.filename}`;
    degraded({
      process: "stack",
      phase: "parse-episode",
      correlation_id: ctx.correlationId,
      summary: `no frontmatter date found in ${ctx.filename}`,
      context: { filename: ctx.filename },
      cause,
      next_action: `inspect ${episodePath} — episode format requires date/session/arc frontmatter`,
    });
    return { skipped: true, failed: true, failurePhase: "parse-episode", failureCause: cause };
  }

  const extractPrompt = buildExtractPrompt(episodeContent);
  let rawExtract: string;
  try {
    rawExtract = await complete(extractPrompt, {
      timeoutMs: EXTRACT_TIMEOUT_MS,
      maxTokens: EXTRACT_MAX_TOKENS,
      temperature: EXTRACT_TEMPERATURE,
    });
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    degraded({
      process: "stack",
      phase: "extract-llm",
      correlation_id: ctx.correlationId,
      summary: `EXTRACT call failed for ${ctx.filename}`,
      context: { filename: ctx.filename },
      cause,
      next_action: "check the local LLM service health (see ~/dotfiles/launchagents/LOCALLLM.md) and retry",
    });
    return { skipped: true, failed: true, failurePhase: "extract-llm", failureCause: cause };
  }
  logIO(ctx.ioLogPath, { kind: "extract", episode: ctx.filename, prompt: extractPrompt, completion: rawExtract });

  const { candidates, rejected, droppedOverCap } = processExtractCompletion(rawExtract, episodeContent);

  // w2 exposure metering: classify the episode BEFORE dedupe. A flash
  // exposure (a) deposits at fractional grain and (b) is barred from
  // kind:identity — its identity-kind candidates are dropped here, with an
  // obs event (Law 9: nothing silent).
  const exposure = classifyExposure({ name: ctx.filename, body: episodeContent });
  const grain = exposure === "flash" ? FLASH_GRAIN : undefined;
  const candidatePool = exposure === "flash" ? candidates.filter((c) => c.kind !== "identity") : candidates;
  const identitySuppressed = candidates.length - candidatePool.length;
  if (identitySuppressed > 0) {
    ok({
      process: "stack",
      phase: "flash-identity-bar",
      correlation_id: ctx.correlationId,
      summary: "identity candidate suppressed: flash exposure",
      context: {
        filename: ctx.filename,
        exposure,
        grain,
        count: identitySuppressed,
        claims: candidates
          .filter((c) => c.kind === "identity")
          .map((c) => c.claim.slice(0, 200)),
      },
    });
  }

  const priorStates = foldWeights(priorEvents);
  let population: ExistingAtomView[] = readAtoms(ctx.beliefsDir)
    .filter((a) => (priorStates.get(a.id)?.status ?? "active") === "active")
    .map((a) => ({ id: a.id, claim: a.claim }));

  const counts: StackCounts = {
    new: 0,
    superseded: 0,
    stacked: 0,
    bumped: 0,
    rejected: rejected.length,
    droppedOverCap,
    compareCalls: 0,
    compareInvalid: 0,
    identitySuppressed,
    exposure,
  };

  for (const candidate of candidatePool) {
    const comparator: Comparator = async (a, b) => {
      const prompt = buildComparePrompt(a, b);
      let raw: string;
      try {
        raw = await complete(prompt, { timeoutMs: COMPARE_TIMEOUT_MS, maxTokens: COMPARE_MAX_TOKENS });
      } catch (err) {
        // A failed COMPARE call is itself an unrecognized token: coerces to
        // DISTINCT via parseCompareToken, surfaced as compareInvalid below.
        raw = `(COMPARE call failed: ${err instanceof Error ? err.message : String(err)})`;
      }
      logIO(ctx.ioLogPath, { kind: "compare", episode: ctx.filename, prompt, completion: raw });
      return raw;
    };

    const decision = await routeCandidate(candidate.claim, population, comparator);
    if (decision.compareUsed) {
      counts.compareCalls += decision.compareCallCount;
      counts.compareInvalid += decision.compareInvalidCount;
    }

    if (decision.action === "stack") {
      appendLedger(ctx.ledgerPath, {
        ev: "stack",
        atom: decision.targetAtomId!,
        ep: ctx.filename,
        ts: new Date().toISOString(),
        ...(grain !== undefined ? { grain } : {}),
      });
      if (decision.compareUsed) counts.bumped++;
      else counts.stacked++;
      continue;
    }

    // "new" or "supersede": a brand-new atom is born (source = this
    // episode's own filename, [ep:] = its own date — both injected, never
    // asked of the model).
    const written = writeAtom(ctx.beliefsDir, {
      kind: candidate.kind,
      claim: candidate.claim,
      why: candidate.why,
      quotes: candidate.quotes.map((text) => ({ text, source: ctx.filename })),
      eps: [episodeDate],
    });
    appendLedger(ctx.ledgerPath, {
      ev: "stack",
      atom: written.id,
      ep: ctx.filename,
      ts: new Date().toISOString(),
      ...(grain !== undefined ? { grain } : {}),
    });
    counts.new++;

    if (decision.action === "supersede") {
      appendLedger(ctx.ledgerPath, {
        ev: "supersede",
        winner: written.id,
        loser: decision.targetAtomId!,
        ts: new Date().toISOString(),
      });
      counts.superseded++;
      population = population.filter((p) => p.id !== decision.targetAtomId);
    }

    population.push({ id: written.id, claim: candidate.claim });
  }

  const rejectedTotal = counts.rejected + counts.droppedOverCap + counts.compareInvalid;
  const emit = rejectedTotal > 0 ? degraded : ok;
  emit({
    process: "stack",
    phase: "stack-episode",
    correlation_id: ctx.correlationId,
    summary:
      `stacked ${ctx.filename}: ${counts.new} new (${counts.superseded} superseding), ` +
      `${counts.stacked} stacked, ${counts.bumped} bumped, ${counts.rejected} rejected, ` +
      `${counts.droppedOverCap} dropped-over-cap`,
    context: { filename: ctx.filename, ...counts },
    ...(rejectedTotal > 0
      ? {
          cause: [
            counts.rejected > 0 ? `${counts.rejected} candidate(s) failed shape/quote validation` : null,
            counts.droppedOverCap > 0 ? `${counts.droppedOverCap} valid candidate(s) exceeded the ${MAX_CANDIDATES}-cap` : null,
            counts.compareInvalid > 0
              ? `${counts.compareInvalid} COMPARE call(s) returned an unrecognized token, coerced to DISTINCT`
              : null,
          ]
            .filter(Boolean)
            .join("; "),
          next_action: `inspect ${ctx.ioLogPath} for the raw completions behind ${ctx.filename}`,
        }
      : {}),
  });

  return { skipped: false, counts };
}

// ---------------------------------------------------------------------
// CLI — gauntlet payload contract
// ---------------------------------------------------------------------

async function main() {
  const [sandboxHome, ...filenames] = process.argv.slice(2);
  const corr = correlation("stack");

  if (!sandboxHome || filenames.length === 0) {
    fail({
      process: "stack",
      phase: "usage",
      correlation_id: corr,
      summary: "stack.ts invoked without a sandboxHome and at least one episode filename",
      context: { argv: process.argv.slice(2) },
      cause: "missing sandboxHome or episode filename argv",
      next_action: "invoke as `bun src/stack.ts <sandboxHome> <episodeFilename>...` with CIRCADIAN_HOME=<sandboxHome>",
    });
  }

  const mindDir = path.join(sandboxHome, "mind");
  const beliefsDir = path.join(mindDir, "beliefs");
  const ledgerPath = path.join(mindDir, "beliefs.jsonl");
  const ioLogPath = path.join(sandboxHome, "logs", "stacker-io.jsonl");

  const failures: string[] = [];
  for (const filename of filenames) {
    const result = await stackEpisode({ mindDir, beliefsDir, ledgerPath, ioLogPath, filename, correlationId: corr });
    if (result.failed) failures.push(filename);
  }

  if (failures.length > 0) {
    degraded({
      process: "stack",
      phase: "corpus",
      correlation_id: corr,
      summary: `${failures.length} of ${filenames.length} episode(s) skipped-and-reported in this corpus`,
      context: { filenames, failures },
      cause: `episode(s) failed: ${failures.join(", ")}`,
      next_action: "inspect the per-episode degraded events above for cause and next_action",
    });
  }
}

if (import.meta.main) await main();
