# QUICK — extraction-time paraphrase rejection: show EXTRACT the existing population

> Mode: QUICK — one module change (stack.ts: reorder + prompt enrichment) + tests. One commit.

## 1. Objective
Stop EXTRACT from minting new candidate atoms that restate an existing belief in
different words. Reject the paraphrase AT THE SOURCE — before it ever becomes a
candidate — rather than relying solely on post-extraction dedupe (the Jaccard/COMPARE
band in `stack.ts`, and the DISTILL phase from brief 06), both of which measure
LEXICAL token overlap and structurally cannot catch a low-overlap paraphrase.

## 2. Context
- Verified 2026-08-05 (REM commit `c009b83`): the live population absorbed several
  belief atoms restating the same underlying claim — "jrg demands mechanical, literal
  execution; trust is earned by obedience, not narrative" — worded differently across
  multiple episodes on the same day (e.g. belief `0f170697e95c`, "Motion is the
  metric...", sitting alongside near-duplicate doctrine/how-we-work entries in SELF.md
  saying the same thing in different vocabulary). `distilled: 1` fired that same run —
  DISTILL caught one cluster, not the rest.
- Root cause, traced through the actual dedupe pipeline: both the extraction-time
  COMPARE band (`stack.ts` `routeCandidate`, `BAND_LOW=0.05` to `LTP_THRESHOLD=0.3`)
  and the post-hoc DISTILL phase (`immune.ts` `detectSelfStutter`, same 0.3 threshold)
  use plain Jaccard token-overlap (`ltp.ts` `jaccard`/`significantTokens`). A genuine
  paraphrase — same claim, different words, low shared vocabulary — can fall BELOW
  `BAND_LOW` entirely. In that case `routeCandidate` returns `new` with
  `compareUsed: false` (`stack.ts:483`) — zero comparison against the existing
  population, no COMPARE call at all. DISTILL misses the same class of paraphrase for
  the same underlying reason (same measure, different corpus, same blind spot).
- `buildExtractPrompt` (`stack.ts:490`) receives ONLY the episode content — no
  visibility into the current belief population. The model has no way to know a claim
  is already held, so it has no way to decline extracting it.
- `ltp.ts`'s own header explicitly rules out embeddings on doctrine grounds:
  "Deliberately NOT embeddings ... A memory system you cannot hold in your head is one
  you cannot trust (Doctrine[1])." The fix must stay in the deterministic-and-auditable
  lane already established — no semantic-similarity model. It must also honor
  `stack.ts`'s stated constraint: "Model surface is EXACTLY two call shapes (R5)" —
  EXTRACT and COMPARE, nothing else.

## 3. Reuse / What Already Exists
- **REUSE** — `population: ExistingAtomView[]` (`stack.ts:664`,
  `readAtoms(ctx.beliefsDir)` filtered to active atoms) is already loaded every call,
  just AFTER the EXTRACT call today (`stack.ts:640` vs `663-666`). Reordering makes the
  exact same data available in time to feed the prompt — no new I/O, no new data
  source.
- **REUSE** — `buildExtractPrompt`'s existing pure-function, unit-testable-without-an-
  LLM shape (`stack.ts:490`); the EXACT two-call-shape constraint (R5) stays intact —
  this only enriches EXTRACT's own input, it does not add a third call shape.
- **REUSE** — the existing Jaccard/COMPARE dedupe pipeline stays as the safety net,
  unchanged, for whatever slips past the prompt-level guard (belt and suspenders — the
  same idempotence philosophy already documented in `stack.ts`'s own header).
- **DO NOT REBUILD** — `routeCandidate`, the Jaccard/overlap bands, `detectSelfStutter`,
  the DISTILL phase (brief 06). This brief only changes what EXTRACT sees; it does not
  touch how candidates are routed once extracted.
- **DO NOT ADD** — embeddings, a new model-call shape, or a third LLM call type.

## 4. Scope
- Reorder `stackEpisode` (`stack.ts:596-666`): compute `priorStates`/`population`
  BEFORE building the extract prompt (currently loaded after, at lines 663-666, while
  EXTRACT is called at line 640).
- Extend `buildExtractPrompt(episodeContent: string, existingClaims: string[])`:
  append a section listing currently-held claims verbatim (one per line) with an
  explicit instruction — "these beliefs are already held; if a candidate would only
  restate one of them in different words, do not extract it." Empty `existingClaims`
  → no section at all (existing calls/fixtures with no population stay unaffected).
- Update both call sites: production (`stack.ts:640`) and the test fixture call
  (`stack.test.ts:472`) — confirmed these are the only two call sites; `gauntlet.ts`
  invokes `stack.ts` as a subprocess, not a direct import, so it needs no change.
- Safety valve for population size: **[OPEN — see §8]** — cap how many/which existing
  claims get shown; at 123 active atoms today and growing every REM cycle, showing ALL
  of them to every single-episode EXTRACT call will keep bloating the prompt.
- Law 9 obs event: add a context field to the existing aggregate obs event (e.g.
  `existingClaimsShown: <n>`) so an audit pass can see the guard was actually active
  for a given episode, not just assume it.

## 5. Requirements
- `buildExtractPrompt` stays a pure string builder, unit-testable without an LLM
  (existing pattern — do not make it async or give it I/O).
- A supervised LIVE verification: craft an episode that restates an existing belief in
  different wording, run `stack.ts` against it pre- and post-change, confirm the
  candidate is no longer extracted post-change. This is a judgment call by a real LLM,
  not a deterministic assertion — capture the before/after raw EXTRACT completions in
  the report (`stacker-io.jsonl` already logs every EXTRACT prompt+completion — cite
  the entries, don't re-derive them).
- Tests (no mocks; real tmp fixtures, house style): `buildExtractPrompt` includes the
  existing-claims block correctly; empty population produces the exact same prompt
  shape as before this change (regression guard for existing fixtures); a claims list
  at the size cap doesn't blow past a sane prompt-length bound.
- Idempotence must still hold (R2): the episode-level short-circuit (`stack.ts:616`)
  and the dedupe pipeline are both untouched, so re-stacking the same episode behaves
  exactly as before.

## 6. Constraints
- Do NOT change `routeCandidate`, the Jaccard bands (`BAND_LOW`, `LTP_THRESHOLD`/
  `BAND_HIGH`, `COMPARE_TOP_K`), `detectSelfStutter`, or the DISTILL phase.
- Do NOT introduce embeddings or any third model-call shape — R5 stays exactly two
  shapes (EXTRACT, COMPARE).
- NEVER push. Local commits only. Mind-repo commits only via the existing REM/stack
  code path.

## 7. Assumptions / Ambiguities
- Assumes the model, when explicitly told "you already hold this belief," reliably
  declines to re-extract it — a prompt-engineering bet, not a guarantee. The existing
  dedupe pipeline remains the backstop for when it doesn't.
- Ambiguity: whether identity atoms belong in the shown claims — brief 06 explicitly
  keeps identity out of the DISTILL detector's scope. Default: EXCLUDE identity atoms
  from the shown list too, for consistency; flag in the report if this default seems
  wrong once live data is seen.

## 8. Open Questions
- **Population-size safety valve** (must be answered before implementation, not
  guessed): at 123 active atoms today and growing every REM cycle (briefs 06/07),
  showing ALL active claims to every single-episode EXTRACT call is unbounded growth.
  Candidate answers: (a) cap to top-N by current fold(ledger) weight, (b) show only
  doctrine+motif+agreement kinds (matches the identity-exclusion precedent above),
  (c) a token-budget cap with graceful truncation, oldest/lowest-weight dropped first.
  Pick one and state why in the report.
- Should the existing-claims list also cover in-batch siblings — candidates the SAME
  extraction batch already produced earlier in this episode (`stack.ts` header: "in-
  batch stutter dedupes ... through repeated calls to this same [routing] function")?
  Default: **out of scope** — the prompt-level guard here only covers the PERSISTED
  population; in-batch dedupe already happens downstream in the routing loop and is
  unchanged by this brief. State this explicitly so the implementer doesn't try to
  thread in-batch candidates into the prompt too.

## 9. Acceptance Criteria
- [ ] `bun test` green (existing baseline + new prompt-construction tests).
- [ ] Population-size safety valve decision made and implemented (§8, first bullet).
- [ ] Supervised live run: a crafted paraphrase episode no longer produces a duplicate
      candidate post-change; before/after `stacker-io.jsonl` entries cited in the report.
- [ ] `bun src/doctor.ts` exits healthy after the live run.
- [ ] No new model-call shape introduced; the "EXACTLY two call shapes" (R5) statement
      in `stack.ts`'s header comment remains true.

## 10. Clarification Check
Do you understand the intent and purpose? What ambiguous details remain? — Yes; the
two items in §8 (population-size safety valve, in-batch scope) are the only unresolved
decisions and must be answered before an implementer starts, not discovered mid-build.
