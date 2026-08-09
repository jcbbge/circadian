# W3b — Complete the interference instrument (predecessor died mid-task)

Label: `w3-flock` (you inherit the label — the CLAIM exists; post a
re-CLAIM line noting the takeover). Contract:
`briefs/wave-optics/CONTRACT.md` (binding). Original brief:
`briefs/wave-optics/W3-flock-merge.md` — READ IT FIRST; it remains the
spec.

## Situation

Your predecessor (pane w19:p3, now dead) wrote `src/interfere.ts` —
501 lines, structurally complete: clustering (lexical fallback jaccard 0.15
+ shared bigrams, kind-scoped, AUTO_SAME 0.3, embed threshold 0.85,
injectable ClaimLinker), winner selection, dry-run-by-default with
proposal/report writers (`--apply` documented at interfere.ts:37-39,92),
obs events. It died BEFORE delivering:

1. `src/interfere.test.ts` — does not exist.
2. The dry-run outputs — `briefs/wave-optics/proposals/` holds only
   W1/W4 files; no `W3-merge-proposal.jsonl`, no `W3-report.md`
   (predecessor never ran the tool).
3. The `.done` marker + DONE board line.

## Your job

1. READ `src/interfere.ts` fully. Fix nothing unless a test proves it
   broken — this is completion, not rewrite. You own the file now; edit it
   only where tests force you to.
2. Write `src/interfere.test.ts` per the original brief's pins: the
   "mechanical fidelity" flock (`0bf353ba44b0`, `4aa467268930`) must
   cluster; `6ed0b774ec2a` vs `e8b0c351543c` must NOT cluster. Real atoms
   from `mind/beliefs/`, no mocks. Test through the lexical ClaimLinker
   (`:10240` is down — the fallback is a real implementation, not a mock).
3. Run the dry-run (`bun src/interfere.ts` — check its argv handling
   first). Verify the proposal + report land in
   `briefs/wave-optics/proposals/`. DO NOT pass `--apply`.
4. `bun test src/interfere.test.ts` and `bun test src/render.test.ts`
   green.
5. DONE board line + touch `briefs/wave-optics/done/w3-flock.done`.

## Partition (writable)

Same as the original W3: `src/interfere.ts`, `src/interfere.test.ts`,
`briefs/wave-optics/proposals/W3-merge-proposal.jsonl`, `W3-report.md`.
NOTHING else. `mind/` is read-only.
