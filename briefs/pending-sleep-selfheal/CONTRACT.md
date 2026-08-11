# Shared contract — pending-sleep-selfheal fleet

Binds every agent in this unit of work.

1. **File partition (disjoint).** The coder (AGNT) owns and may edit ONLY:
   - `src/sleep.ts`
   - `src/doctor.ts`
   - `src/sleep.test.ts`
   No other source files. The reviewer (SAGT) writes NO source files.
2. **No commits by workers.** Only the coordinator (CORD) commits and pushes.
   Workers leave the working tree with their changes staged-or-unstaged and
   report DONE.
3. **No mocks.** Tests use real files in a tmpdir and, where an LLM is needed,
   the real local endpoint at `http://127.0.0.1:10240/v1` (verify it is up
   first: `curl -sS -m5 http://127.0.0.1:10240/v1/models`).
4. **Never touch `logs/` in git.** It is gitignored; the queue and dead-letter
   files are local-only runtime state.
5. **No scope creep.** Fix the stuck-queue split and its test. Do not refactor
   unrelated drain logic, decay, or REM phases.
6. **Evidence, not feeling.** "Done" = the Done-when checklist in BRIEF.md
   demonstrated with command output. A false green is worse than a red.
7. **Final action = `.done` marker** under
   `briefs/pending-sleep-selfheal/done/` + a Tower DONE post. Then idle.
