# W4 — Archive integrity: identity purge proposal, the three absences, one plate re-exposed

Label: `w4-archive`. Contract: `briefs/wave-optics/CONTRACT.md` (binding).
Three small deliverables, all proposal/doc-grade — you write NO src/ code.

## Mission

The mind's identity stratum is contaminated: disposable worker sessions
deposited their role briefs as the mind's self. Verified atoms include "I am
orch-c001-gate", "The system is the WS-C worker", "The system is defined as
a passive telemetry sink" — quotes are genuine (quote-integrity passes) but
they were said TO A DIFFERENT APPARATUS: a role-briefed worker pane, not
this mind. Separately, the design dialogue behind this wave identified three
theoretical absences that must be registered before conventional
assumptions silently fill them.

## Pre-verified facts (coordinator, 2026-08-09)

- Population by kind (counted on disk): 67 agreement, 69 doctrine,
  **34 identity**, 65 motif = 235 atoms.
- Atom files: `mind/beliefs/<id>.md`, immutable; first line is `kind:`.
  Supersede transfers weight, keeps loser's file + lineage (MIND-SPEC
  "The ledger"). Ledger `mind/beliefs.jsonl` is append-only; weight =
  fold(ledger) via `foldWeights` in `src/atoms.ts`.
- Episodes: `mind/episodes/*.md` (155 files). The contaminating class
  matches ack|verdict|confirmation|validation|ok-|pong|claim|passive|cairn
  by filename (39 files) — but judge each atom by its CONTENT, not its
  source episode's filename.
- Docs live in `docs/`; the spec is `mind/MIND-SPEC.md` (read it first —
  it is one page and binding).

## Deliverable 1 — identity purge proposal (do NOT apply)

Read all 34 `kind: identity` atoms. Classify each:
- **self**: a durable statement about the mind across sessions (keep).
- **costume**: a role brief, worker contract, or test posture belonging to
  one disposable session ("orch-c001-gate", "passive telemetry sink",
  "WS-C worker") (purge).
- **borderline**: argue it in one sentence each.

Output `briefs/wave-optics/proposals/W4-identity-purge.md`: the full table
(id, claim excerpt, class, one-line rationale) + proposed ledger lines.
Purge mechanism must respect append-only immutability: propose `supersede`
lines pointing each costume atom at the strongest genuine self atom IF one
subsumes it; else propose a new event kind `retire` (weight → 0, status
retired, file stays) and note that `foldWeights` + MIND-SPEC would need
that event added (W1 owns `src/atoms.ts` — name the dependency, do not
edit).

## Deliverable 2 — register the three absences

Create `docs/OPTICS-ABSENCES.md` (≤1 page; a design register, not an
essay). Register, one paragraph each, that circadian currently has NO
theory of:
1. **Illumination** — what kind of light a session shines (source, class,
   coherence); today every session illuminates identically.
2. **Exposure** — metering, reciprocity, saturation; today a 2-turn ACK
   test and a 3-hour design session deposit with equal authority (W2 is
   the first partial instrument — link its brief).
3. **The unexposed plate** — fresh capacity; the model only theorizes the
   written, never the writable.
State for each: the conventional assumption that would silently fill it if
unregistered. Close with the conjugate-pair note: provenance (which-plate
attribution) and cross-plate interference cannot be maximized in the same
measurement; circadian currently maximizes provenance; the interference
instrument (W3's brief) erases which-plate identity during comparison only.

## Deliverable 3 — one sealed plate, two cames

Take `mind/episodes/2026-08-05-passive-telemetry-sink.md` (10 lines; read
it first). Produce, by hand (you are the optical instrument — the local LLM
endpoint is down), two DIFFERENT extractions under two explicit constraint
frames, written to `briefs/wave-optics/proposals/W4-two-cames.md`:
- **Came A (identity frame):** "what does this session say about who the
  agent is" — the frame the stacker effectively used. Show it yields the
  passive-telemetry-sink identity atom.
- **Came B (event frame):** "what happened, to which apparatus, under whose
  instruction" — extract ≤3 atoms under the rule that a role assigned by a
  prompt is an EVENT, not an identity.
Then 3–5 sentences: what the delta demonstrates about extraction as basis
choice (the came selects the pane before collapse — same plate, different
optical event).

## Partition (writable)

- `briefs/wave-optics/proposals/W4-identity-purge.md`
- `docs/OPTICS-ABSENCES.md`
- `briefs/wave-optics/proposals/W4-two-cames.md`
- NOTHING else. beliefs/, beliefs.jsonl, src/, MIND-SPEC.md are read-only.

## Done-when

- All three files exist and are complete per above.
- Purge table covers all 34 identity atoms (state the count).
- No src/ or mind/ file modified (`git status` shows only your three
  files + your `.done`).
