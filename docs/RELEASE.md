# RELEASE.md — shipping circadian as jrg's take on agent memory

**Intent (jrg, 2026-08-09):** release and distribute circadian standalone — "my own take on
agent memory" — with Josh stripped away, so anyone can drop it into their system and get a
version custom-tailored to THEM. Made Well crossover stays out: circadian is the MIND organ
and ships alone (see mind/ANATOMY.md — that file itself is personal and does not ship).

## The privacy boundary (mostly already built)

The design already separates code from person: everything personal lives in `mind/` — a
separate git repo with **no remote, ever** (MIND-SPEC line 8) — while `src/`, `install.sh`,
and `docs/` are the product. Release = verify and harden that boundary:

- [ ] Sweep `src/`, `install.sh`, `docs/`, `briefs/` for hardcoded personal refs: `jrg`,
      `Josh`, `/Users/jrg`, machine-specific ports/paths. `CIRCADIAN_HOME` already
      parameterizes the root; the local-LLM endpoint (`:10240`, llm.ts) needs a documented
      env knob + a "bring your own OpenAI-compatible endpoint" doc.
- [ ] `mind/` ships as an EMPTY scaffold: templates for CONSTITUTION.md (the entity's),
      CONSTITUTION-OWNER.md, USER.md, NOW.md, greeting.md, MIND-SPEC.md + SELF-TALK.md
      (these two ARE the product's opinion — they ship as written, de-personalized).
- [ ] Hook installers: CC settings.json blocks (wake/sleep/graze/status) + the pi extension,
      documented for both harnesses; grounding-hook optional extra.
- [ ] The provenance gate's drone patterns are already generic; document the `[drill]`
      contract as part of the public spec.
- [ ] Flagship docs: quickstart · MIND-SPEC (the spec) · the 2026-08-09 poisoning
      post-mortem as the case study (it's the best argument for the architecture, and it's
      content-pipeline synergy — see ~/content/ideas/the-poisoned-mind.md).
- [ ] License: MIT, already in place.

## Onboarding IS the constitution builder (the tailoring mechanism)

The thing that made today's constitution real was the method, and the method productizes:

1. **Mine** — day-one CLI flow runs the five-researcher pipeline (generalized) over the
   USER'S own corpora (~/.claude/projects, ~/.pi, opencode DB, etc.): best moments, failure
   modes, corrections, invariants, self-statements — verbatim, labeled.
2. **Compose** — drafts the agent's constitution from that evidence + our opinionated
   article templates (identity is never minted from evidence; compelled speech; actor is
   not the scorer; the two-pole capture warning…), and drafts the OWNER'S constitution by
   extraction from their own corrections/dictations. Descriptive, not aspirational.
3. **Adjudicate** — the human strikes/keeps/amends; both documents land in mind/ and wire
   into wake above memory. From that moment the system tailors itself: their episodes,
   their atoms, their render.

## The web constitution builder (side project / landing page candidate)

Same opinionated flow, zero local corpus: a guided builder (questions + article templates +
our takes, with the "strike/keep" adjudication UX) that outputs (a) a starter
CONSTITUTION.md pair and (b) the CLI instructions to mine their real sessions for the
full version. Natural circadian landing page: the builder is the demo, the CLI is the
product, the poisoning post-mortem is the pitch. Status: idea, unscheduled — jrg decides
whether it's a side project, a content vehicle, or the landing page itself.

## Open design threads before release (from the 2026-08-09 probe)

- **Need-to-know wake ("the receipts principle"):** every asserted specific in the payload
  must be (a) constitutional (needs no receipt), (b) bearing on the present work, or
  (c) carrying its receipt (ep-stamp/zoom-resolvable). Dashboard lights must self-explain
  or stay dark — a fresh instance seeing `!148 degraded` with no cause is anxiety without
  context. Rework wake + strip accordingly; move history to on-demand (zoom) rather than
  asserted-as-lived.
- **Greeting mechanism vs Article 12:** present the letter, ask for orientation in the
  instance's own voice — never "speak verbatim as if felt."
- **Residue audit:** re-adjudicate surviving doctrine atoms sourced from inside a poisoning
  window against the constitution (human-in-loop) — generalize as a periodic hygiene pass.
