# MIND-SPEC.md — Circadian Memory Substrate

This is the contract for `~/circadian/mind`. It is the design authority for every
process that reads or writes this repo (wake, sleep, rem, status, content
archaeology). If a process's behavior conflicts with this document, the
process is wrong.

The mind repo is a plain git repository. It has no remote, ever. `USER.md` is
private relational memory and never leaves this machine.

---

## The Eight Laws

1. **Storage dumb, metabolism smart.** The mind is plain markdown in git at
   `~/circadian/mind`; all intelligence lives in the processes around it (wake, sleep,
   rem, status), not in the storage layer. No database sits in the critical
   path of reading or writing the mind.

2. **Push, not pull.** Memory is injected at session start. The working
   agent has zero memory duties during a session — it does not need to
   query, search, or fetch anything to "remember." The transcript itself is
   the deposit; nothing has to be manually saved.

3. **Load-bearing or dead.** Every wake begins with a greeting composed from
   memory, placed directly in the user's face. The greeting is the test: if
   the memory in it isn't good enough to say out loud to the user at the
   top of a session, it isn't earning its keep.

4. **Finite body.** Hard token caps force excretion (composting). A mind that
   never forgets is not a mind, it is a landfill. Caps are enforced by
   character count using the rule chars/4 = tokens (see "Token Caps"
   below). The wake injection payload has a hard cap of 15k tokens; if the
   payload would exceed it, this must be announced loudly with an
   "OVER-CAP" line — never silently truncated.

5. **Ash banned.** Retained conclusions must carry their why-chain and, where
   voice matters, verbatim quotes. A summary that flattens voice down to a
   bare conclusion is a defect, not an optimization. "jrg prefers X" without
   the reasoning behind it is ash.

6. **Motion is the metric.** REM records which injected items actually
   propagated — were read, referenced, or built upon — during the session
   they were injected into. Items with zero propagation across their
   lifetime become compost candidates. Memory that sits inert is not memory,
   it is inventory.

7. **The mind survives infra death.** If SurrealDB, daemons, or any other
   service is down, wake still works, because wake is file reads only. No
   step in WAKE may depend on a running service.

8. **Anchor-aware.** Greetings orient the user to the work — the current
   arc, the live tension, the next move — never to the memory system
   itself. A greeting that talks about Circadian instead of the work has
   failed law 3.

9. **Nothing silent.** Every signal is context-bound. If code in this system
   can fail, warn, or make a decision, it emits a context-bound event to the
   obs ledger (`logs/circadian.events.jsonl`) via `src/obs.ts` — enough that
   an agent picking it up cold knows WHAT happened, in WHICH process and
   phase, WHY, and WHAT TO DO NEXT. A bare exit code is not telemetry. See
   `docs/OBSERVABILITY.md` for the full doctrine: four-word outcomes
   (ok | idle | degraded | failed); degraded/failed MUST carry cause +
   next_action; every event surfaces to stderr + the ledger + the tower bus.
   A process that runs and produces NO event is operating silently — the
   cardinal sin this law exists to prevent.

---

## The Cycle

Five phases: WAKE, GRAZE, LIVE, SLEEP, REM.

Two tempos govern the cycle:
- **Per-meal fast path** (GRAZE + SLEEP): the transcript is metabolized
  in-session via graze checkpoints, then consolidated into an episode at
  session end. Immediate digestion — the letter is written while the ink is
  still wet.
- **Twice-daily worldview consolidation** (REM): at 09:00 and 21:00, REM
  absorbs new episodes into `SELF.md`, composts what's been digested, plants
  a serendipity, and drafts tomorrow's greeting. The slow fold.

### WAKE

Triggered by SessionStart. A hook injects, in order:
- `SELF.md`
- `USER.md`
- `NOW.md`
- the greeting instruction (present the precomputed `greeting.md` content to
  the user at the top of the session)

WAKE is file reads only (Law 7). If `NOW.md`'s "Last sleep" timestamp is
more than 48 hours old, the injected greeting MUST be prepended with an
explicit staleness warning line before it reaches the user.

If the assembled injection payload exceeds the 15k-token hard cap, WAKE must
emit a loud `OVER-CAP` line identifying the offending file(s) and the
overage — never silently truncate any file's content.

### GRAZE

In-session metabolizer. Fires from cheap, frequent Claude Code hooks
(PostToolUse / UserPromptSubmit), self-throttles to one real checkpoint per
~15 minutes. Each checkpoint reads only the transcript DELTA since the last
checkpoint (byte offset in a per-session state file), digests it via the local
LLM into 2-4 bullet notes, and appends them to `mind/meals/<session_id>.md`
— working memory, never committed to git.

GRAZE is the per-meal fast path: the transcript is metabolized WHILE the
session happens, not after. At SessionEnd, SLEEP folds the accumulated meal
notes into its whole-meal digest prompt (as pre-chewed context) and deletes
the meal file — the episode supersedes it.

### LIVE

The working agent carries zero memory duties for the duration of the
session. It does not write to `~/circadian/mind`, does not curate what it says,
does not manage its own memory. The full transcript is implicitly the
deposit that SLEEP will later read. GRAZE runs beneath LIVE as the
in-session checkpoint layer; the agent itself is unaware of it.

### SLEEP

Triggered by SessionEnd, via a detached worker. SLEEP:
- drafts an episode file (`episodes/YYYY-MM-DD-<slug>.md`) from the session
  transcript
- rewrites `NOW.md` (arc, flight plan, live tensions, commitments,
  serendipity, last-sleep timestamp)
- may fall back to composing `greeting.md` if REM has not run since (see
  "Greeting Protocol")

SLEEP does not commit `~/circadian/mind`. Only REM commits (see below), except for
the two bootstrap commits: the founding commit (Worker A) and the
archaeology commit (Worker D, content-population).

### REM

A launchd job, scheduled twice daily at 09:00 and 21:00. REM:
1. reads new episodes against `SELF.md`, asking of each claim: does it
   confirm, contradict, supersede, or deepen the existing worldview?
2. rewrites the worldview file (`SELF.md`) under the rule: shrink unless
   justified. If `SELF.md`'s token count grows in a REM pass, the commit
   body MUST carry a written justification line explaining why growth was
   warranted.
3. composts eligible episodes under the digestion-completeness rule (see
   "Compost Rules").
4. plants exactly ONE labeled serendipity association in `NOW.md`'s
   "Serendipity" section (format: a single line starting "Might be
   nothing:").
5. drafts tomorrow's `greeting.md` (see "Greeting Protocol").
6. appends one `rem`-type event to `scoreboard.jsonl`.
7. commits `~/circadian/mind` with the REM commit convention (see below).

REM is the only regular committer of the mind repo. SLEEP and WAKE never
commit.

---

## Token Caps

Rule: **chars / 4 = tokens.** Every cap below is enforced by character
count divided by four.

| File | Cap (tokens) | Cap (chars) |
|---|---|---|
| `SELF.md` | 6,000 | 24,000 |
| `USER.md` | 2,000 | 8,000 |
| `NOW.md` | 3,000 | 12,000 |
| `compost.md` | 1,000 | 4,000 |
| each file in `episodes/` | 1,000 | 4,000 |
| **Wake injection payload (total)** | **15,000 (hard cap)** | 60,000 |

Over-cap handling: if the total wake injection payload would exceed 15,000
tokens, this must be announced loudly with an explicit `OVER-CAP` line
naming the offending file(s) and the overage amount. Silent truncation of
any file is never permitted, at any cap, for any file.

---

## File Formats

- **`SELF.md`** — four sections, exactly: "Who I am across sessions",
  "Doctrine" (each belief stamped with its origin episode, `[ep:YYYY-MM-DD]`),
  "Motifs" (recurring themes, capped at 10 lines), "How we work". Cap: 6k
  tokens / 24k chars.

- **`USER.md`** — relational memory: who the user is, registers, arcs, and
  preferences observed across sessions. PRIVATE: never pushed to any
  remote; the mind repo has no remote configured, ever. Cap: 2k tokens / 8k
  chars.

- **`NOW.md`** — six sections, exactly: "Arc", "Flight plan" (the
  successor session's first move), "Live tensions" (3 plus-or-minus 1
  open items, loaded but not resolved), "Commitments", "Serendipity" (one
  line, must start with "Might be nothing:"), "Last sleep" (an ISO-8601
  timestamp of the most recent SLEEP). Cap: 3k tokens / 12k chars.

- **`greeting.md`** — at most 3 lines, precomputed by REM (or by SLEEP as
  fallback): an arc summary, the flight plan, and one live tension.
  Anchor-aware per Law 8. If `NOW.md`'s "Last sleep" is more than 48 hours
  old at the time of injection, WAKE must prepend an explicit staleness
  warning line ahead of this content.

- **`episodes/YYYY-MM-DD-<slug>.md`** — frontmatter with `date`, `session
  id`, and `arc`; a narrative body containing at least 2 verbatim quotes;
  explicit why-chains for any conclusion recorded; a "what-changed" line
  classifying the episode's relationship to `SELF.md` as one of
  confirm / contradict / supersede / deepen. When an episode is composted, a
  "taught -> absorbed-where" line is added to it recording what it taught
  and where that lesson now lives. Cap: 1k tokens / 4k chars per episode.

- **`compost.md`** — a ROLLING WINDOW log of shed episodes (NOT append-only):
  what was shed, why it was shed, and where the lesson now lives (which
  file/section absorbed it). Entries open with the fixed form
  `Composted: <what> — <why> — lesson lives at <where>`.
  When the file exceeds its cap, REM prunes the OLDEST dated sections until
  it fits comfortably under cap (90%) — git history is the permanent archive,
  so old compost entries lose nothing by being dropped. No entries at genesis.
  Cap: 1k tokens / 4k chars.

- **`mind/meals/<session_id>.md`** — in-session working memory, written by
  GRAZE. Bullet notes from each checkpoint. Deleted by SLEEP at SessionEnd
  after the episode is drafted (the episode supersedes it). NEVER committed
  to git — it is working memory, not archive.

- **`scoreboard.jsonl`** — append-only, one JSON object per line. See
  "Scoreboard Schema" below.

---

## Scoreboard Schema

`scoreboard.jsonl` is append-only. One JSON object per line, newline
terminated. Fields:

```json
{
  "ts": "ISO-8601 timestamp, required",
  "type": "wake | sleep | rem | verdict, required",
  "worldview_tokens": "integer, current SELF.md token count, required",
  "greeting_verdict": "ok | bad, optional — only present on type=verdict events",
  "propagated": ["array of strings identifying injected items that propagated this session, optional"],
  "composted": ["array of strings identifying episodes/items composted this cycle, optional"]
}
```

Notes:
- `verdict` events are appended by the status CLI's `--greet-ok` /
  `--greet-bad "<reason>"` flags. `greeting_verdict` is `"ok"` or `"bad"`;
  when bad, an optional `reason` field carries the free-text reason string.
- `wake` events are appended at WAKE time; `sleep` events at SLEEP time;
  `rem` events at REM time, once per REM run (twice daily).

---

## Greeting Protocol

The greeting is composed by REM (twice daily, the normal path) or by SLEEP (as
a same-day fallback if REM has not yet run since the last sleep). It is at
most 3 lines:

1. Arc summary.
2. Flight plan — the successor session's first move.
3. One live tension.

Anchor-aware (Law 8): the greeting orients to the work — the current arc,
Infinity, whatever is live — never to the memory system itself.

Staleness rule: at WAKE, if `NOW.md`'s "Last sleep" timestamp is more than
48 hours old, the injected greeting MUST be prepended with an explicit
staleness warning line before being shown to the user. This warning is
generated at WAKE time (a live check against the current clock), not
precomputed.

---

## Compost Rules

**Digestion-completeness rule.** An episode is demoted (composted) ONLY when
REM can state, in the same pass, both:
(a) what the episode taught, and
(b) where that lesson now lives (which file/section of the mind absorbed
    it).

Both facts are recorded twice:
- as a dated entry in `compost.md` (what was shed, why, where the lesson now
  lives), and
- as a "taught -> absorbed-where" line appended to the episode file itself
  before it is removed.

An episode that cannot satisfy both (a) and (b) is not eligible for
composting in that REM pass, regardless of age or token pressure.

**Physical mechanics.** Once digestion-completeness is satisfied, the
composted episode file is `git rm`'d in the same REM commit that records the
compost. Git history is the permanent archive of the raw episode; `compost.md`
carries the living, human-readable record of what was shed and where it
went.

**Rolling window.** `compost.md` is NOT append-only — it is a rolling window
under its cap. After each REM pass appends new entries, if the file exceeds
90% of its token cap, REM prunes the OLDEST dated sections until it fits
comfortably. Git history is the archive; the compost log is recent history
only. This prevents the excretory organ from becoming a landfill (the
metabolism would jam permanently on OVER-CAP).

Zero-propagation trigger (Law 6): injected items that show zero
propagation across their observed lifetime are compost candidates, subject to
the same digestion-completeness rule above — zero propagation makes an
item a candidate, it does not bypass the rule.

---

## Digestion Ledger

`mind/digested.jsonl` is the single source of truth for "have I absorbed this
episode?" — it replaces the old mtime-based heuristic. Each line is a JSON
object:

```json
{
  "ts": "ISO-8601 timestamp of digestion",
  "hash": "sha256 hex of the episode's on-disk content at digestion time",
  "filename": "the episode filename (e.g. 2026-07-22-arc-name.md)",
  "disposition": "absorbed | composted"
}
```

Content-keyed, not time-keyed: `isNew = sha256(content) NOT IN ledger`. This
is rename-proof, mtime-touch-proof, and survives corrupt lines (a malformed
line is skipped, not fatal). An episode whose content changes is re-flagged
as new; an episode whose filename changes but content is identical is
correctly seen as already digested. REM appends to this ledger inside the
same commit that absorbs/composts the episode, so the invariant holds:
hash recorded == will never be re-fed as new.

---

## REM Commit Convention

Every REM commit uses exactly this subject line format:

```
rem: <date> — absorbed N, shed M, worldview XXk tokens
```

Where `<date>` is the REM run's date (YYYY-MM-DD), `N` is the count of
episodes/claims absorbed into `SELF.md` this pass, `M` is the count of
episodes composted this pass, and `XXk` is `SELF.md`'s resulting token count
rounded to the nearest thousand, suffixed `k`.

The commit body carries the shrink-justification line whenever `SELF.md`
grew in token count during the pass (required by Law 4 / the shrink-unless-
justified rule) — e.g. `justification: <why growth was warranted>`. If
`SELF.md` did not grow, no justification line is required.

---

## Kill Switch

The user records a verdict on each greeting via the status CLI:
`--greet-ok` or `--greet-bad "<reason>"`. Each verdict is appended to
`scoreboard.jsonl` as a `verdict`-type event (see "Scoreboard Schema").

The system must earn its keep in week one: **seven consecutive "bad"
verdicts is the decommission trigger.** The status CLI is responsible for
surfacing when this threshold is reached (tracking the running streak of
consecutive bad verdicts, reset by any "ok"); the decision to actually
decommission is made by the human, not automated.

---

## v1.1 Deferred

The following are explicitly deferred and must NOT be built as part of
this v1 system:

- ambient recall hook
- embeddings
- weekly flux entrainment report
- retirement of the tower doorbell line
