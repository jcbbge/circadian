# MacBook mind → hive mind, and hive wiring parity (2026-09-27)

Closes circadian ledger #33 (compare wiring) and #34 (merge the mind).
The Mac was read only through the `ssh macbook` read-only gate; nothing on
the Mac was written.

## Counts

| | commits | episodes | beliefs | beliefs.jsonl | digested | scoreboard |
|---|---|---|---|---|---|---|
| hive before (`c43d30b`) | 29 | 10 | 35 | 72 | 9 | 24 |
| Mac as pulled (filtered, + working-tree commit) | 314 | 1138 | 1235 | 8094 | 1475 | 4708 |
| hive after merge (`99bf173`) | 345 | 1148 | 1270 | 8160 | 1484 | 4732 |
| hive after REM (`571b0b3`) | 347 | 1148 | 1274 | 8166 | 1485 | 4733 |

The brief said hive had 6 episodes; it had 10 at merge time. All 10 are kept.

## Left out by the gate

`find circadian/mind -type f` on the Mac listed two files that did not arrive
(their names match `*secret*`):

- `episodes/2026-08-24-amp-secrets-injection.md`
- `episodes/2026-09-01-production-secret-custody.md`

They were also filtered out of the imported git history, so what the gate
held back does not reach hive by another route. Atoms that quote them did
arrive (atom files have hex names).

## Merge

The Mac history was imported as a real git merge (`--allow-unrelated-histories`)
of the Mac's `main` into hive's `main`. The Mac's uncommitted NOW.md and
USER.md were first recorded as one commit (`2323aa6`) on the imported side.
Hive's live mind was only fast-forwarded, after checking its tip had not moved.

The Mac mind predates scoping. Its episodes and atoms carry no `scope:`, and
it has no `now/<scope>.md`, so "the Mac's per-project NOW" does not exist. The
Mac's history comes in as global memory; wake never guesses a legacy scope
from prose.

| File (both sides, differing) | Resolution |
|---|---|
| `beliefs.jsonl` | Every line from both sides, interleaved by `ts`, each side in its own order (the fold is file-ordered). The only lines left out are hive's 6 decay lines: both machines ran REM on their own 09:00/21:00 clock over the same three days, and keeping both sets would decay every atom twice per slot. Checked: all 1270 atoms fold to exactly the weight and status they had on their own side. |
| `scoreboard.jsonl` | Every line from both sides, interleaved by `ts`. |
| `digested.jsonl` | Union (no repeated lines on either side). |
| `NOW.md` (global) | Hive's sections first (newer; its Last sleep stands). The Mac's Arc, Flight plan, Live tensions and Commitments are appended per section, labelled `MacBook:`. |
| `USER.md` | The Mac's. Hive's was the unedited install seed and held no facts. |
| `compost.md` | The shared cap line, hive's header comment, then the Mac's dated entries. |
| `.gitignore`, `MIND-SPEC.md` | Hive's (from the current program; its ignores are a superset). The Mac's older versions stay in the merged history. |
| `greeting.md` | Hive's, until REM. REM then redrew it from the merged mind. |
| `SELF.md`, `render-manifest.json` | Re-rendered from the merged population. |

`CONSTITUTION.md` and `CONSTITUTION-JOSH.md` were identical on both sides.

A first merge commit (`ce68145`) used the lane rule (content-hash union) for
the ledgers. That dropped lines the Mac repeats on purpose: the 2026-07-28
switchover set weights by writing the same potentiate line many times (one
atom ×78). `99bf173` puts every line back. Both commits are kept in history.

The Mac's atoms have months of bumps behind them, so they fill SELF.md. No
hive atom makes it in yet: the top hive atom weighs 7.66 and the lowest
rendered atom weighs 8.62. Hive atoms are still active, and scoped wakes
reach them through `<mind:here>`.

## Wiring

| Mac piece | Hive before | Action |
|---|---|---|
| SessionStart `wake.ts` | yes (part 1 only) | Wake parts 2–8 registered (this was the doctor's WARN) |
| SessionStart `status.ts --line` | missing | Installed (R11 vitals strip) |
| `statusLine` → `bin/circadian-statusline` | missing | Installed |
| PostToolUse/UserPromptSubmit → `bin/circadian-graze-gate` | direct `graze.ts` | Upgraded to the gate |
| SessionEnd `sleep.ts` | yes | unchanged |
| launchd `com.circadian.rem` | systemd `circadian-rem.timer` | already equivalent |
| launchd `com.circadian.rem-catchup` (`--if-due` at login) | `Persistent=true` on the timer | already equivalent |
| launchd `com.circadian.doctor` (`doctor.ts --alert`, 09:05/21:05) | none | **Not brought.** Its alert target (the tower bus) was removed in `8953ec5`, and `--alert` is no longer read, so on the Mac this job only appends to a log nobody reads. Health already shows in the statusline's degraded marker. |
| Local LLM (`com.localllm.server`, default `127.0.0.1:10240`) | remote endpoint through `~/.config/circadian/env` | **Not brought.** Hive uses the remote endpoint. |
| Pi extension `circadian-mind.ts` | yes | unchanged |
| amp `circadian-lifecycle.ts` plugin, opencode | not installed | **Not brought.** Neither harness is installed on hive. |
| Non-circadian hooks (grounding, utensil, herdr, superset, llmtrim, sounds) | — | Out of scope |

Config and credential names (never values): the Mac has no
`~/.config/circadian/env` and its launch agents set only `PATH` and
`CIRCADIAN_HOME`. Hive's env file sets `CIRCADIAN_LLM_BASE_URL`,
`CIRCADIAN_LLM_MODEL`, `CIRCADIAN_LLM_NO_THINK_PREFIX`, and the credential
pair `MODAL_PROXY_TOKEN_ID` / `MODAL_PROXY_TOKEN_SECRET`.

`install.sh` now wires the three Claude Code pieces the Mac had, so re-running
it keeps hive at parity:

- the status strip at SessionStart;
- `statusLine`, only when none is set;
- the graze gate. Only circadian's own direct `graze.ts` command is rewritten.
  Graze wiring someone set up by hand is left alone.

Covered in `src/serve-install.test.ts`.
