# WAVE 2 — YOU ARE THE IMPLEMENTER. The criteria already exist.

An independent test-maker already authored executable red tests for your
partition and ORCH recorded them at the gate. Your job is to **turn YOUR red
tests green** without touching them.

## Two corrections to the text below — read these first, they override it

1. **YOU ARE NOT IN A WORKTREE.** All wave-2 workers share ONE checkout,
   `/Users/jrg/circadian`, on branch **`fix/rem-storm-hardening`** at `bfbfe03`.
   The "you run in a git WORKTREE / your worktree is your fence" paragraph below
   is WRONG — ORCH's defect, measured and corrected. Your fence is
   `/Users/jrg/circadian`.
2. **RUN NO GIT COMMAND THAT TOUCHES HEAD OR THE INDEX** — no checkout, switch,
   branch, stash, reset, commit, or clean. In a shared checkout those move the
   tree under your two siblings; wave 1 lost two minutes to exactly that.
   **Branching, committing and integration are ORCH's.** This OVERRIDES the
   "commit your own unit on your own branch" line below. Just edit your file and
   report; ORCH commits the wave.

## You may NOT edit any `*.test.ts` file

The tests are the contract and a different agent wrote them on purpose. If you
believe a criterion is **wrong** — not merely inconvenient — that is a
`need-help` to ORCH naming the assertion and why. Do not edit it, do not weaken
it, do not delete it. Silently relaxing a test is the one failure that makes this
whole unit worthless.

## Your gate

- **Every red test in your section green**, by real behavior change in your
  source file.
- **No previously-passing test broken.** Committed state at `bfbfe03` is
  520 pass / 1 skip / 9 fail, where those 9 are exactly the wave-1 red tests.
- Run the **whole** suite, not just your file.

## Known flake — NOT yours, do not chase it, do not edit it

`src/zoom.test.ts` > "the universe is live ∪ git-deleted, deduped by filename"
can fail with `expect(rec).toBeDefined()`. It reads the **real** `mind/episodes/`,
which every other agent session on this machine is actively writing to, and
`collectEpisodes()` runs at describe-time (`zoom.test.ts:61`) while `readdirSync`
runs later (`:64`) — an episode written in that window is live-but-unrecorded.
ORCH verified it passes in isolation (`bun test src/zoom.test.ts` -> 16 pass /
0 fail) and routed it to CORD. **If you see it fail: re-run it in isolation,
note it, move on.** It is in nobody's partition.

---
