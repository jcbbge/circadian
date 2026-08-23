# WAVE 1 — CRITERIA FIRST. You are a TEST-MAKER, not an implementer.

**House law, enforced by a hard gate at the spawn door:** *the test agent is NOT
the implementation agent; criteria come BEFORE code.* Implementation for this
unit is REFUSED by the door until your criteria are authored and recorded. You
are the reason the next wave can start.

## What you deliver

1. **Executable tests** in your `*.test.ts` file that encode **each done-when in
   your task section** as real assertions.
2. **A criteria file** at `briefs/rem-storm/criteria-<your-letter>.md`: one line
   per done-when, naming the test that proves it and the exact command to run it.

## What you must NOT do

- **You may not touch ANY `.ts` source file.** You own your `*.test.ts` and your
  criteria file. Nothing else. The implementer owns the source.
- Do not implement the fix. Do not "make the test pass."

## Your tests are EXPECTED TO FAIL (red). That is the deliverable.

They encode behavior that does not exist yet. **The 519/0 floor gate applies at
the end of WAVE 2, not to you.** Report your red tests with their real output —
a red test that fails *for the right reason* (asserting the missing behavior,
not a typo or a bad import) is your done-when. **Prove the reason**: paste the
assertion failure, and confirm the rest of the suite is otherwise unaffected.

## Zero live-LLM calls in this wave

Wave 1 makes **no** calls to `:10240` — not one, whatever your task section says
about the live grant (that grant belongs to wave 2). Any test needing a live
endpoint must be written to **skip unless `CIRCADIAN_LIVE_LLM=1`** so the
default suite stays deterministic and load-free.

---
