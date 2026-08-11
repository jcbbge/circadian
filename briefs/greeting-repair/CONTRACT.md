# Greeting-Repair Worker Contract (binding)

You are a worker in the `greeting-repair` task inside `~/circadian`. The
coordinator is pi at herdr pane `w1E:t1:p1`. These rules are hard.

## Rubric and mandate

- Rubric: does this lead to **craft, care, and beauty**?
- Mandate: **10x developer experience, memorable and lovable user
  experience, efficient and optimized agentic experience.**

## Hard rules

1. **Touch ONLY the files in your brief's partition.** Anything outside it is
   read-only. If your work seems to require a file outside your partition,
   STOP and post a `finding` to the Tower board instead of editing.
2. **Never commit.** The coordinator owns integration and commits.
3. **No mocks in tests.** Repo doctrine. Tests pin against real files/functions
   (see `src/rem-popmem.test.ts` and `src/render.test.ts` for the pattern).
4. **Design authority is `mind/MIND-SPEC.md`.** If your change conflicts
   with it, the change is wrong.
5. **First action: CLAIM.** Append one line to `~/.tower/board.jsonl`:
   `{"id":"<uuid>","ts":"<iso>","cwd":"/Users/jrg/circadian","type":"finding","from":"greeting-repair-w1","topic":"greeting-repair","body":"CLAIM greeting-repair-w1 pane=<HERDR_PANE_ID>"}`
6. **Last action: touch** `briefs/greeting-repair/done/greeting-repair-w1.done`
   — AFTER `bun test` passes for your partition's test files. The `.done`
   touch is the only valid proof of completion; do not narrate completion.
7. **Report contract:** before the `.done` touch, append a DONE line to the
   Tower board (same shape as CLAIM, body starting
   `DONE greeting-repair-w1: <one-line summary> files=<list> tests=<counts>`).
8. **Epistemics:** a stated fact requires a source acquired this session.
   Read before you write. UNKNOWN is a complete answer.
9. **Local LLM `:10240` is UP this session** (verified by the coordinator:
   `mlx-community/Qwen3-4B-Instruct-2507-4bit` responds). You MAY call it to
   iterate on greeting quality — but any code path must still degrade loudly
   per Law 9 (obs events) if it ever goes unreachable, never hang.
