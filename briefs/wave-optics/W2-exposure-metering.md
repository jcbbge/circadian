# W2 — Exposure metering: session class gates deposit authority

Label: `w2-exposure`. Contract: `briefs/wave-optics/CONTRACT.md` (binding).

## Mission

Every session currently deposits with equal authority: a two-turn "reply
ACK" worker test lays down beliefs with the same weight as a three-hour
design session. Measured result (coordinator audit, 2026-08-09): **36% of
all 795 stack events come from ack/verdict/ok/pong/claim-type episodes**,
and the identity stratum contains atoms like "I am the WS-C worker" and
"The system is a passive telemetry sink" — role briefs from disposable herdr
workers, stacked as the mind's identity. Photographically: the emulsion has
no speed rating, no reciprocity, no saturation. Build the light meter.

## Pre-verified facts (coordinator, 2026-08-09)

- The stacker is the only writer of atoms: episode → EXTRACT (≤5
  candidates) → dedupe → stack event (MIND-SPEC "The stacker";
  `src/stack.ts`, 799 lines; extraction prompt built by
  `buildExtractPrompt` around stack.ts:490 per brief 08).
- Episodes live in `mind/episodes/*.md` with YAML frontmatter carrying
  `date`, `session`, `arc` (verified: `2026-08-05-passive-telemetry-sink.md`).
- Episode bodies for trivial sessions are short (10 lines for the ACK
  episode vs 80 for `2026-07-28-genesis-archaeology.md`) and quote the
  entire exchange.
- Atom kinds: identity | doctrine | motif | agreement. Stack event shape:
  `{"ev":"stack","atom":<id>,"ep":<episode>,"ts":…}`. Fold is
  `foldWeights` in `src/atoms.ts` — its doc block (atoms.ts:281-295) is the
  semantics contract: stack +1 and stack is the only decay-eligibility
  event; read it before touching fold.
- 39 of 155 episode files match ack|verdict|confirmation|validation|ok-|
  pong|ping|claim by filename.

## Design (implement; refine details freely)

1. **Classify at stack time** (pure function over the episode file, no LLM,
   no network — Law 7 spirit):
   `classifyExposure(episode: {name, body}): "flash" | "standard"`.
   An episode is a **flash** exposure when it is structurally trivial —
   decide by BODY EVIDENCE, not filename regex alone (filenames are a hint,
   not truth). Signals to combine (tune against the real corpus, then pin
   in tests): total body length below a threshold; the transcript consists
   of ≤2 user/assistant exchange pairs; the user turn matches an
   instruction-echo pattern ("Reply with exactly", "say OK", single-word
   expected output). Your report must show the classification of ALL 155
   real episodes and a hand-check of the boundary cases.
2. **Flash exposures deposit at fractional weight.** Extend the stack event
   with an optional field: `{"ev":"stack",...,"grain":0.25}` — fold treats
   absent `grain` as 1 (perfect backward compatibility, append-only
   preserved; stack stays the decay-eligibility event regardless of grain).
   Knob `FLASH_GRAIN = 0.25`. NOTE: W1 is concurrently editing
   `src/atoms.ts` (`foldWeights` gains a `renorm` case). Your fold change is
   the `grain` field on the EXISTING stack case — disjoint from W1's new
   case; if the same lines collide, post a finding and let the coordinator
   integrate — do not resolve by touching W1's event.
3. **Flash exposures are BARRED from `kind: identity`.** A flash episode's
   identity-kind candidates are dropped before dedupe, with an obs event
   (Law 9: nothing silent — use `ok` with summary "identity candidate
   suppressed: flash exposure", context carrying episode + claim excerpt).
4. This is EXTRACTION-TIME policy only. Do not touch existing atoms, do not
   rewrite the ledger, do not reclassify history. (W4 handles the existing
   contamination; you handle the tap, not the spill.)

## Partition (writable)

- `src/stack.ts` (classification + grain + identity bar)
- `src/stack.test.ts`
- `src/atoms.ts` — ONLY the `grain` field on the stack event type + its
  fold multiplication + one line in the foldWeights doc block. Nothing else.
- `mind/MIND-SPEC.md` — ONLY: add `grain` to the stack-event line + one
  sentence under "The stacker" ("flash exposures — structurally trivial
  sessions — deposit at fractional grain and never mint identity").
- `briefs/wave-optics/proposals/W2-report.md` — the 155-episode
  classification table + boundary-case notes.

## Done-when

- `bun test src/stack.test.ts` green (tests pin real episodes from
  `mind/episodes/` — the ACK episode classifies flash,
  genesis-archaeology classifies standard); `bun test src/render.test.ts`
  green.
- W2-report.md contains the full classification with counts.
- Fold of a grain-bearing ledger line verified in a test.
