# WS-F Switchover Runbook

Sequential, human-gated, single live writer. Executed by the orchestrator
from its own mainline checkout at `/Users/jrg/circadian` (the same directory
serves as both the source checkout — `src/`, `docs/`, `templates/` — and
`CIRCADIAN_HOME` — `mind/`, `logs/`). This workstream (WS-F-build) never
touched the live mind; every command below was exercised against a sandbox
first (docs/switchover's sibling rehearsal, numbers in the WS-F-build report)
or is a standard git/launchctl/cp step. Every command is copy-pasteable with
absolute paths — adjust only the two placeholders marked `<...>`.

**Precondition**: this branch (`popmem/wsf`) is merged to `main` and
`/Users/jrg/circadian` has pulled/checked out that merge, so
`src/rem-popmem.ts`, the repointed `src/wake.ts`, `docs/genesis-archaeology.episode.md`,
and `docs/switchover/*` all exist there.

---

## 0. Pre-flight checks

```bash
# 1. Confirm the freeze is still active (nothing should have absorbed since WS-0)
cat /Users/jrg/circadian/.rem-freeze
```
Expect the popmem freeze message from WS-0. If this file is missing, STOP —
something already lifted the freeze; re-derive the plan before continuing.

```bash
# 2. Confirm the live mind is clean apart from the known baseline dirt
git -C /Users/jrg/circadian/mind status --porcelain
```
Expect exactly: `M NOW.md`, `M scoreboard.jsonl`, and the held-backlog
untracked episodes (9+ at WS-F-build time, including
`2026-07-27-the-stuttering-mind.md`). Anything else — STOP and investigate.

```bash
# 3. Confirm bun test still holds the floor on the merged mainline checkout
cd /Users/jrg/circadian && bun test 2>&1 | tail -5
```
Expect ≥332 pass / 1 pre-existing fail (`usermutate.test.ts:212`), plus this
workstream's ~44 additional passing tests.

```bash
# 4. Capture the live mind's CURRENT HEAD and a shared execution timestamp —
#    re-baseline against HEAD AT EXECUTION TIME, never a pinned rev (the freeze
#    means SELF.md/beliefs/digested.jsonl haven't moved, but always re-derive).
REV=$(git -C /Users/jrg/circadian/mind rev-parse HEAD)
TS=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
echo "REV=$REV"
echo "TS=$TS"
```
Keep this shell session (or these two variables) alive for every step below.

---

## 1. Migrate to a staging directory (never the live mind directly)

```bash
STAGING=/Users/jrg/circadian-popmem-staging
rm -rf "$STAGING"
cd /Users/jrg/circadian
bun src/migrate.ts \
  --rev "$REV" \
  --ts "$TS" \
  --out "$STAGING" \
  --report /Users/jrg/circadian-popmem-staging-review.md \
  --live-mind /Users/jrg/circadian/mind \
  --genesis /Users/jrg/circadian/docs/genesis-archaeology.episode.md
```
Expect the obs line: `migration complete: N atom(s) seeded from rev <rev>,
0 exceptions, stutter clean, byte-identical rerender`. If exceptions > 0 or
`byte_identical_rerender: false` or `stutter_clean: false` — STOP. Read
`/Users/jrg/circadian-popmem-staging-review.md` and get a human ruling before
proceeding (this mirrors the WS-E gate; a clean re-run against the same,
unmoved HEAD should reproduce WS-E's already-blessed numbers: 30 atoms
written, 29 files after dedupe, 0 exceptions).

**Render manifest naming — read before the next step.** `migrate.ts`'s own
render call writes its manifest to `$STAGING/mind/manifest.json` (its
`--report`/byte-identical check only). `decay.ts` (and `rem-popmem.ts`) hard-
code `mind/render-manifest.json` — a DIFFERENT filename. Step 3 below
re-renders with the canonical name explicitly; do not skip it or the first
scheduled decay will treat the live mind as if it has no population yet.

## 2. Copy the reviewed seed into the live mind

```bash
LIVE_MIND=/Users/jrg/circadian/mind
cp -R "$STAGING/mind/beliefs" "$LIVE_MIND/beliefs"
cp "$STAGING/mind/beliefs.jsonl" "$LIVE_MIND/beliefs.jsonl"
mkdir -p "$LIVE_MIND/episodes"
cp "$STAGING/mind/episodes/"*-genesis-archaeology.md "$LIVE_MIND/episodes/"
```

## 3. First render — canonical manifest name

```bash
cd /Users/jrg/circadian
CIRCADIAN_HOME=/Users/jrg/circadian bun src/render.ts \
  --beliefs "$LIVE_MIND/beliefs" \
  --ledger "$LIVE_MIND/beliefs.jsonl" \
  --out "$LIVE_MIND/SELF.md" \
  --manifest "$LIVE_MIND/render-manifest.json"
```
Expect `SELF.md rendered: K/N atoms above floor` with `skipped_unparseable: 0`.
(Rehearsal numbers: 46/55 above floor pre-switchover-plus-first-cycle, or
27/29 immediately after this exact step with no cycle run yet — some atoms
sit below their section's TOKEN BUDGET, not below RENDER_FLOOR; this is
normal, documented in render.ts's module header, not a fault.)

## 4. Pre-digest the genesis episode

**Critical, easy to miss**: the genesis episode enters `mind/episodes/` as a
citable quote source for migrated atoms — it was never processed by the
LLM stacker. Without this step, the first scheduled `rem-popmem.ts` run will
treat it as a brand-new episode and burn an EXTRACT call re-deriving atoms
that duplicate what migration already seeded deterministically.

```bash
cd /Users/jrg/circadian
GENESIS_FILE=$(basename "$LIVE_MIND"/episodes/*-genesis-archaeology.md)
bun -e '
import * as fs from "fs";
import * as path from "path";
import { hashEpisodeContent, recordDigested } from "./src/rem-popmem.ts";
const liveMind = "'"$LIVE_MIND"'";
const filename = "'"$GENESIS_FILE"'";
const content = fs.readFileSync(path.join(liveMind, "episodes", filename), "utf8");
const hash = hashEpisodeContent(content);
recordDigested(path.join(liveMind, "digested.jsonl"), [
  { ts: new Date("'"$TS"'").toISOString(), hash, filename, disposition: "absorbed" },
]);
console.log("genesis pre-digested:", filename, hash);
'
```

## 5. Mind commit — seed population + first render + genesis + digest entry

```bash
cd "$LIVE_MIND"
git add beliefs beliefs.jsonl SELF.md render-manifest.json digested.jsonl episodes
git commit -m "rem: $(date -u +%Y-%m-%d) — population-memory switchover: seed $(ls beliefs | wc -l | tr -d ' ') atom(s) from rev ${REV:0:10}, first render, genesis episode"
git log --oneline -3
```
Expect a clean commit; `git status --porcelain` immediately after shows only
the pre-existing baseline dirt (`M NOW.md`, `M scoreboard.jsonl`, the
undigested backlog episodes — the genesis file just committed is no longer
untracked, everything else is unchanged).

## 6. Install the repointed launchd payload

```bash
# com.circadian.rem — the plist path is a SYMLINK to ~/dotfiles/launchagents/;
# overwrite the SYMLINK TARGET, not the link.
cp /Users/jrg/circadian/docs/switchover/com.circadian.rem.plist \
   /Users/jrg/dotfiles/launchagents/com.circadian.rem.plist

# com.circadian.rem-catchup — a real file directly under ~/Library/LaunchAgents/
cp /Users/jrg/circadian/docs/switchover/com.circadian.rem-catchup.plist \
   /Users/jrg/Library/LaunchAgents/com.circadian.rem-catchup.plist

plutil -lint /Users/jrg/Library/LaunchAgents/com.circadian.rem.plist
plutil -lint /Users/jrg/Library/LaunchAgents/com.circadian.rem-catchup.plist
```
Both must print `OK` (WS-F-build already confirmed this for the checked-in
copies; re-lint here only proves the deployed bytes match).

**Do NOT reload the launchd jobs yet.** `com.circadian.rem-catchup` has
`RunAtLoad: true` — bootstrapping it now would fire an automatic `--if-due`
catch-up against the still-frozen-until-step-7 backlog, racing the manual
supervised run in step 8. Reload happens in step 9, AFTER the supervised run.

## 7. Lift the absorb freeze

```bash
rm /Users/jrg/circadian/.rem-freeze
```
The freeze marker is gone; nothing is scheduled to run yet (step 6 held the
launchd reload back on purpose), so nothing fires automatically. The backlog
is now eligible but only the next manual or scheduled run will touch it.

## 8. Supervised first live run — the acceptance demo

```bash
cd /Users/jrg/circadian
CIRCADIAN_HOME=/Users/jrg/circadian bun src/rem-popmem.ts 2>&1 | tee /Users/jrg/circadian/logs/rem-popmem-first-live-run.log
```
Watch it run in the foreground. Expected shape (rehearsal numbers against
the real backlog + real local LLM, WS-F-build report has the full log):
  - `rem/absorb`: absorbs every held-backlog episode (9+ at WS-F-build time,
    including `2026-07-27-the-stuttering-mind.md`) — some `rejected` count
    is normal (real LLM output, degraded not fatal); the acceptance bar is
    that `the-stuttering-mind.md` itself contributes new atoms without
    duplicating an existing one (check the obs line for that filename: it
    should show `rejected: 0` or a low count, and its `new` count should not
    inflate `superseded`/near-dup churn).
  - `rem/propagation`: a JSON judgment; `malformed: true` would be a
    degraded event, not a stop condition — the run continues either way.
  - `rem/decay`: EXPECT a `DEGRADED` event here with a large
    `unmapped_addresses` count (rehearsal saw 177, from ~89 pre-switchover
    v1 `rem` scoreboard events whose `SELF.Doctrine[n]`-style addresses
    predate the atom-based manifest and cannot map to it). **This is
    expected, first-run-only noise, not a failure** — the ledger's own
    high-water mark means every SUBSEQUENT decay run only looks at rem
    events after this one, so the unmapped count should drop to ~0 on the
    very next cycle.
  - `rem/render`: `ok`, no `fail` event. A `fail` here means R8 broke —
    STOP, do not proceed to step 9, and inspect `git -C "$LIVE_MIND" status`
    for a partial write (the commit phase never ran if this failed).
  - `rem/greeting`: a 1-3 line greeting. Quote it in the switchover
    deliverable; read it for Law 8 (anchors to the work, not the memory
    system) as a human quality check — the automated validation is
    structural (line count/non-empty) only.
  - `rem/commit`: `wave committed: rem: <date> — stacked N, bumped M, sank K,
    population P`.

## 9. Reload the launchd jobs (now that the manual run is done)

```bash
launchctl bootout gui/$(id -u)/com.circadian.rem 2>&1 || true
launchctl bootstrap gui/$(id -u) /Users/jrg/Library/LaunchAgents/com.circadian.rem.plist
launchctl bootout gui/$(id -u)/com.circadian.rem-catchup 2>&1 || true
launchctl bootstrap gui/$(id -u) /Users/jrg/Library/LaunchAgents/com.circadian.rem-catchup.plist
launchctl list | grep -i circadian.rem
```
`com.circadian.rem-catchup`'s `RunAtLoad` fires immediately on bootstrap —
expected: it runs `rem-popmem.ts --if-due`, finds the last rem event is the
one step 8 just committed (well inside the current slot), and idles
(`schedule-guard IDLE: not due`). Confirm via:
```bash
tail -5 /Users/jrg/circadian/logs/rem.log
```

## 10. Verification checklist

```bash
# R8: fresh disk re-render matches the committed SELF.md
cd /Users/jrg/circadian
bun -e '
import { assertRenderInvariant } from "./src/rem-popmem.ts";
import * as fs from "fs";
const md = fs.readFileSync("/Users/jrg/circadian/mind/SELF.md", "utf8");
console.log(JSON.stringify(assertRenderInvariant("/Users/jrg/circadian/mind/beliefs", "/Users/jrg/circadian/mind/beliefs.jsonl", md)));
'
# expect {"ok":true, ...}

# strip: population/last-REM/verdict segments all present, no stale/degraded markers
CIRCADIAN_HOME=/Users/jrg/circadian bun src/status.ts --line

# zoom drill: zoom.ts resolves EPISODES (by [ep:] stamp/date/filename), not
# atom ids directly (it predates atoms.ts and was not extended in this
# workstream — out of WS-F scope, see docs/POPULATION-MEMORY.md §3). Pick any
# rendered atom's source quote and drill its EPISODE instead; the rendered
# SELF.md still carries the same [ep:YYYY-MM-DD] stamps verbatim (render.ts's
# renderAtomLine), so zoom's own `selfLinesForDate` keeps working unmodified.
SOURCE_EP=$(grep -h '^quote: ' /Users/jrg/circadian/mind/beliefs/*.md | head -1 | sed -E 's/.* \| //')
echo "drilling atom source episode: $SOURCE_EP"
CIRCADIAN_HOME=/Users/jrg/circadian bun src/zoom.ts "$SOURCE_EP"

# porcelain: only the expected residual backlog remains untracked (or none,
# if this run drained it entirely), nothing else
git -C /Users/jrg/circadian/mind status --porcelain
```

All four must pass before declaring the switchover complete. If any fails,
STOP, do not delete `$STAGING` or the freeze-lift, and escalate to the
human with the exact command output.

## 11. Cleanup

```bash
rm -rf /Users/jrg/circadian-popmem-staging /Users/jrg/circadian-popmem-staging-review.md
```
Only after step 10 passes in full.

---

## Rollback (if step 8 or step 10 fails)

The mind is a git repo — every write above is a commit. To back out:
```bash
git -C /Users/jrg/circadian/mind log --oneline -5   # find the pre-switchover commit (the last one before step 5)
git -C /Users/jrg/circadian/mind reset --hard <pre-switchover-sha>   # DESTRUCTIVE — confirm with the human first
echo "popmem program: switchover rolled back, re-freezing pending investigation" > /Users/jrg/circadian/.rem-freeze
launchctl bootout gui/$(id -u)/com.circadian.rem 2>&1 || true
launchctl bootout gui/$(id -u)/com.circadian.rem-catchup 2>&1 || true
```
Re-installing the OLD plists (from `~/dotfiles/launchagents/` git history, or
`git show <rev>:docs/...` if archived) restores rem.ts as the payload while
the failure is investigated.
