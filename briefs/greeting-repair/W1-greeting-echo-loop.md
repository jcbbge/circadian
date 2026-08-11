# W1 — Break the greeting self-echo loop (R7 kill-switch root cause)

Read `briefs/greeting-repair/CONTRACT.md` first. It binds you.

## Mission

The REM greeting generator has mode-collapsed. It emits abstract, content-free
register-echo instead of an actionable orientation to the current work. This
tripped the R7 fitness kill switch (weighted bad streak ≥ 7; currently bad×39),
which correctly muted SELF/USER/greeting at wake. Your job is to fix the
**generator** so its greetings once again anchor to concrete, addressable work —
which is the only thing the R7 credit mechanism rewards.

Decommission is NOT on the table. This is a repair.

## Pre-verified facts (acquired by the coordinator this session)

- **File:** `src/rem-popmem.ts`. The greeting is "LLM call (b)".
  - `buildGreetingPrompt(nowMd, topAtoms)` — **line ~456**. Feeds NOW.md plus
    the strongest-held atoms' `.claim` text into the prompt.
  - `parseGreetingResponse(raw)` — **line ~444**. Structural validation only:
    non-empty, `#`-stripped, sliced to `GREETING_MAX_LINES` (3). No semantic
    check (by design — see the Law 8 comment at line ~433).
  - Greeting phase (call site) — **line ~1065–1099**. `temperature: 0.3`,
    `GREETING_MAX_TOKENS: 300`, `GREETING_TIMEOUT_MS: 60s`.
- **The collapse, verbatim** (last drafts, from `logs/rem.error.log`):
  - "The board holds the pulse — stay in the flow."
  - "Raw passthrough is active; align coordinates now."
  - "Slice engaged, motion driving."
  - "Motion is the only truth — the work is already moving."
  - "E is live — spawn confirmed."
  These reference nothing addressable: no file, no task, no command.
- **Root-cause hypothesis (verify before acting):** the prompt grounds tone on
  the top-weight atoms, whose highest-weight claims are themselves abstract
  doctrine ("motion is the metric", "the board is live"), so the model
  amplifies that register into pure abstraction. It is Constitution Art. 11 in
  the machine: "one bad feedback loop away from mistaking my own echo for the
  world."
- **How R7 credits an ok verdict** (`src/status.ts`, `computeVerdictStreak`,
  and `GREETING_PROPAGATION_PREFIXES`): a greeting window scores `ok` only when
  a later REM span's `propagated` addresses include a **greeting-sourced
  prefix** — i.e. the greeting named something that later got propagated into
  the worldview. Abstract salad names nothing, so it can never earn credit.
  Concreteness is not cosmetic here; it is literally the fitness signal.
- **LLM is UP:** `curl :10240/v1/chat/completions` with model
  `mlx-community/Qwen3-4B-Instruct-2507-4bit` returns valid completions.

## Your partition (touch ONLY these)

- `src/rem-popmem.ts` — the greeting prompt/parse/validation only. Do NOT
  touch the stack/decay/distill/render/commit phases.
- `src/rem-popmem.test.ts` — add/extend greeting tests here (create if absent;
  match the no-mock, real-function pattern of `src/render.test.ts`).

Everything else in the repo is read-only for you. `mind/` is read-only.

## Tasks (each with a done-when)

1. **Confirm the root cause.** Read `buildGreetingPrompt`, the call site, and
   the top-atom input it actually receives (inspect `mind/SELF.md` and the
   atoms the render selects). Write a one-paragraph root-cause note into your
   DONE board line. Done-when: the note names the specific mechanism, sourced.

2. **Repair the generator so greetings anchor to concrete work.** Options to
   weigh (pick by the rubric, justify in your DONE line):
   - Ground the prompt on NOW.md's concrete fields (Arc / Flight plan /
     Commitments / Live tensions) rather than abstract top-atom claims, and
     instruct explicitly: name a file, a command, or a task — never a mood.
   - Add a **shape gate** to `parseGreetingResponse` (or a new validator) that
     REJECTS greetings with no concrete anchor (no path, no command, no proper
     noun from NOW.md), marking them `malformed` so `greeting.md` is left
     untouched — same failure path the malformed branch already uses at line
     ~1078. A greeting that names nothing is a category error and should not
     ship, exactly as an empty one doesn't.
   - Consider a low retry (e.g. one reroll on a rejected shape) before giving
     up, mirroring the AIMD spirit elsewhere in the file.
   Done-when: `bun test src/rem-popmem.test.ts` is green AND a live dry-run
   (below) produces a greeting that names at least one concrete anchor from the
   current NOW.md.

3. **Prove it against the real generator, live.** Do a dry/standalone greeting
   draft against the current `mind/NOW.md` and top atoms using the real
   `buildGreetingPrompt` + `complete()` path (no mocks). Capture the output in
   your DONE line. Done-when: the drafted greeting anchors to concrete work
   (names a file/command/task), and an obviously-abstract candidate is rejected
   by your gate in a test.

4. **Tests, no mocks.** Pin the shape gate against real strings; if you add a
   validator, test both the accept and reject paths. Done-when:
   `bun test src/rem-popmem.test.ts src/render.test.ts` all green (render
   invariant must stay green — you must not have disturbed it).

## Explicitly out of scope

- Do NOT clear, reset, or edit the scoreboard / kill-switch state. The switch
  clears on its own once real ok verdicts start landing from good greetings —
  that is the correct proof, and it is the coordinator's to observe, not yours
  to force.
- Do NOT touch `src/status.ts` R7 logic. The fitness rule is correct; the
  generator is what's broken.
- Do NOT commit. Do NOT run a real REM wave against the live mind repo.

## Report contract

Before touching `.done`, post the DONE board line with: root-cause note, which
repair option you chose and why (rubric), the live drafted greeting sample, the
rejected-candidate sample, and `bun test` pass/fail counts. Then touch
`briefs/greeting-repair/done/greeting-repair-w1.done`.
