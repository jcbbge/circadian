# Test criteria — Task B (poison quarantine), src/stack.test.ts

Written by rem-storm-criteria-w2 (test-maker), from the TMK-B brief and
Pre-Verified Facts only. Implementation not read.

## Coverage map (done-when -> test)

1. **"A test proving a corpus containing a deterministically un-extractable
   episode still processes every other episode... the bad one is
   skipped-and-reported."**
   - Deterministic (no live LLM), covers 2 of the 3 killing exits (fact 3):
     - `a read-episode failure (missing file) does not block a later episode
       in the same corpus` — corpus of two missing files; today red because
       `fail()` (fact 2) exits on the first, so the second file is never
       attempted.
     - `a parse-episode failure (no frontmatter date) does not block a later
       episode in the same corpus` — same shape, missing-frontmatter instead
       of missing-file.
   - Live-gated (fact 3's third exit, extract-llm), covers the actual poison
     file per fact 11, skipped unless `CIRCADIAN_LIVE_LLM=1` per the wave-1
     preamble: `the actual poison file is skipped-and-reported while sibling
     episodes still process (bun src/stack.ts <tmpHome> good1 poison good2)`.
     Asserts exit 0, `good2.md` reached a real EXTRACT call (stacker-io.jsonl),
     and the poison episode surfaced as `degraded` (never `failed`) with a
     non-empty cause.
2. **"The poison episode's failure cause reported as a fact, or [UNKNOWN]."**
   Not this file's job to diagnose — that is Task B's implementer work item 5.
   The live-gated test only asserts *that* a cause is reported (non-empty
   `failureCause`/event `cause`), not *what* it is; I did not run the live
   diagnosis myself (test-maker does not hold the live grant in wave 1 per
   the shared preamble — "Wave 1 makes no calls to :10240... whatever your
   task section says about the live grant").
3. **`bun test` full suite >= 519 pass / 0 fail.** See report — 521 pass in
   this shared checkout; the additional failures are sibling workers'
   (Task A / Task C) own in-progress red tests in files I did not touch
   (`src/rem-popmem.test.ts`, `src/llm.test.ts` — confirmed via `git status`,
   not introduced by this diff).

## Contract asserted, not implementation

Every failure-path assertion targets the interface contract in fact 6
(`StackEpisodeResult.failed/failurePhase/failureCause`, surfaced via
`degraded()` events per work item 1) and the CLI-level behavior in work
item 3 (exit 0, corpus continues) — never a specific code path inside
`stackEpisode`. All failure-path tests drive the real CLI via subprocess
(house pattern, `src/sleep.test.ts:136-138`); none call `stackEpisode()`
in-process on a failing branch, because today that would call
`process.exit()` (fact 2) and kill the whole `bun test` worker, not just one
test.

## Deviations / notes

- Partition reassigned mid-flight by ORCH correction: this worker owns only
  `src/stack.test.ts` + this file, not `src/stack.ts`. No product code
  touched.
- Ran `git checkout -b tmk-poison-quarantine-tests` before the ORCH
  no-git-ops correction landed — reported separately, not repeated, not
  self-repaired.
