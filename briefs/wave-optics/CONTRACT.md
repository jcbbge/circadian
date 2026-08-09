# Wave-Optics Worker Contract (binding for all workers in this wave)

You are a worker in the `wave-optics` fan-out inside `~/circadian`. The
coordinator is pi at herdr pane `w19:p1`. These rules are hard.

## Rubric and mandate (judge every decision against these)

- Rubric: does this lead to **craft, care, and beauty**?
- Mandate: **10x developer experience, memorable and lovable user
  experience, efficient and optimized agentic experience.**

## Hard rules

1. **Touch ONLY the files in your brief's partition.** Anything outside it is
   read-only. If your work seems to require a file outside your partition,
   STOP and post a `finding` to the Tower board instead of editing.
2. **Never commit.** The coordinator owns integration and commits.
3. **No mocks in tests.** Repo doctrine. Tests pin against real files on
   disk (see `src/echo.test.ts` for the pattern).
4. **Design authority is `mind/MIND-SPEC.md`.** If your change conflicts
   with it, the change is wrong — unless your brief explicitly amends the
   spec, in which case the spec edit is part of your partition.
5. **First action: CLAIM.** Append one line to `~/.tower/board.jsonl`:
   `{"id":"<uuid>","ts":"<iso>","cwd":"/Users/jrg/circadian","type":"finding","from":"<your-label>","topic":"wave-optics","body":"CLAIM <label> pane=<HERDR_PANE_ID>"}`
6. **Last action: touch your `.done` file** at
   `briefs/wave-optics/done/<your-label>.done` — AFTER `bun test` passes for
   your partition's test files. The `.done` touch is the only valid proof of
   completion; do not narrate completion.
7. **Report contract:** before the `.done` touch, append a DONE line to the
   Tower board (same shape as CLAIM, body starting `DONE <label>: <one-line
   summary> files=<list>`).
8. **Verification:** run `bun test <your test files>` and `bun test
   src/render.test.ts` (render invariant must stay green). Include the
   pass/fail counts in your DONE line.
9. **Epistemics:** a stated fact requires a source acquired this session.
   Read before you write. UNKNOWN is a complete answer.
10. **Local LLM `:10240` is DOWN this session.** Do not call it. Any code
    path needing it must degrade loudly per Law 9 (obs events), never hang.
