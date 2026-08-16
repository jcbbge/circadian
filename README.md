# Circadian

**A file-based memory substrate for AI coding agents.** Plain markdown in git;
all intelligence lives in six small processes around it. One install per
machine, private by construction.

The design contract lives in `templates/MIND-SPEC.md` — *"storage dumb,
metabolism smart."* If a process conflicts with that one page, the process is
wrong.

---

## Who

For anyone running AI coding agents — Claude Code, cursor, pi.dev, prime,
opencode, any harness that can fire a hook or load an extension — who is tired
of their agent starting every session with amnesia.

One central install spans your whole machine: every project, every directory.
The cloned repo is the program, not a project dependency; local installation
never touches project source.

## What

- **Storage.** `mind/` is plain markdown in git. No database sits in the
  critical path of reading or writing it. Templates seed a fresh `mind/`;
  `install.sh` scaffolds it as a **private local git repo with no remote —
  your memory never leaves your machine**.
- **Metabolism.** All intelligence lives in small processes:

  | Process | File | Runs |
  |---|---|---|
  | `wake` | `src/wake.ts` | injects memory at session start |
  | `graze` | `src/graze.ts` | captures in-session observations (after tool use, on prompt submit) |
  | `sleep` | `src/sleep.ts` | drafts an episode at session end |
  | `rem` | `src/rem-popmem.ts` | twice-daily consolidation into the population |
  | `status` | `src/status.ts` | vitals, on demand |
  | `doctor` | `src/doctor.ts` | health check, on demand |

  The processes are **storage-agnostic machines over markdown**: beliefs are
  weighted atoms, recurrence bumps weight instead of adding copies, forgetting
  is a nightly multiply, and `SELF.md` is a deterministic render of the top of
  the population.

## When

- **Session start** → `wake` injects context.
- **During a session** → `graze` fires on every tool use and prompt submit.
- **Session end** → `sleep` drafts the episode.
- **Twice daily (09:00 & 21:00)** → `rem` consolidates (macOS launchd job,
  installed by `install.sh`; a catch-up job runs `rem --if-due` at login and
  restart so a slot missed while the laptop was closed still runs).
- **Anytime** → `status` (vitals) and `doctor` (health check).

Non-macOS? `install.sh` prints the equivalent cron/systemd schedule and the
`--if-due` catch-up command.

## Where

- **Program:** `~/circadian` (this repo, cloned once).
- **Memory:** `~/circadian/mind/` — a separate git repository, **no remote,
  ever**. `USER.md` is private relational memory and never leaves this machine.
- **LLM:** any OpenAI-compatible endpoint, used only for drafting and
  consolidation. Default `http://127.0.0.1:10240/v1` (see **Configuration**).

## Why

- AI coding agents are stateless between sessions. Circadian gives them
  durable, truthful, compoundable memory — and it self-hosts: the first data
  in the store is the store's own backlog, so the system has been running its
  own loop since day one.
- **Private by construction.** No cloud, no account, no remote. Memory is a
  plain git repo you own.
- **You stay in control.** Memory degrades gracefully (nightly decay), every
  claim is an atom with provenance, and nothing is hidden in a vector index
  you can't read.

## How

### Prerequisites

- **bun** (https://bun.sh). Installer fails fast if it's missing, or point it
  at your bun: `CIRCADIAN_BUN_BIN=/path/to/bun`.
- **An OpenAI-compatible LLM endpoint** for drafting/consolidation. SLEEP and
  REM need it; WAKE/GRAZE don't. The installer probes the default endpoint and
  warns (without failing) if it's down.

### Install (manual)

```bash
git clone https://github.com/jcbbge/circadian.git ~/circadian
cd ~/circadian
./install.sh
```

The installer is **idempotent and non-destructive** — it never overwrites an
existing `mind/`, never clobbers existing hooks, and fills in only what's
missing. It:

1. Scaffolds `mind/` from `templates/`, personalizing `USER.md` with your name
   (prompted, or `CIRCADIAN_USER_NAME=Ada ./install.sh` non-interactively).
2. Initializes `mind/` as a private git repo (no remote).
3. Installs the twice-daily REM launchd job and the login/restart catch-up.
4. Wires Claude Code hooks (`SessionStart`→wake, `SessionEnd`→sleep,
   `PostToolUse`+`UserPromptSubmit`→graze) by auto-merging into
   `~/.claude/settings.json` — zero manual JSON editing.
5. Installs the pi.dev extension (`circadian-mind.ts`, reload with `/reload`).

Done. WAKE/SLEEP now fire automatically — no commands to remember.

### Install (agent-assisted)

Paste this into your agent of choice (it installs, seeds, and self-checks):

> Install Circadian into `~/circadian` for me:
> 1. `git clone https://github.com/jcbbge/circadian.git ~/circadian` and
>    `cd ~/circadian`.
> 2. Run `./install.sh`. If it prompts for a name, use mine — otherwise set
>    `CIRCADIAN_USER_NAME` to my name and run it non-interactively.
> 3. Verify the seed: `mind/` should now contain `MIND-SPEC.md`, `SELF.md`,
>    `NOW.md`, `USER.md`, `greeting.md`, `compost.md`, and be its own git repo.
> 4. Run `bun src/doctor.ts` and confirm the health check passes (or report
>    exactly what it says if not).
> 5. Read `mind/USER.md` and fill it in from what you already know about me.
> 6. Report back: the doctor verdict, what got seeded, and the hook wiring
>    that's now active.

### What gets seeded (the documents)

`install.sh` builds a fresh `mind/` from `templates/`:

| Template | Seeded into `mind/` | Purpose |
|---|---|---|
| `templates/MIND-SPEC.md` | `MIND-SPEC.md` | The design contract — the whole architecture on one page |
| `templates/SELF.md` | `SELF.md` | Who the agent is across sessions (REM populates from episodes) |
| `templates/NOW.md` | `NOW.md` | Current thread, flight plan, live tensions (SLEEP fills each session) |
| `templates/USER.md` | `USER.md` | Who *you* are — edit freely; the metabolism never rewrites it |
| `templates/greeting.md` | `greeting.md` | First-wake orientation |
| `templates/compost.md` | `compost.md` | Shed episodes: what was let go, why, where the lesson lives |

`USER.md` is the only personalized one — everything else is agnostic seed
material the processes evolve on their own.

### Configuration

All knobs are environment variables (install-time and runtime):

| Variable | Default | Purpose |
|---|---|---|
| `CIRCADIAN_HOME` | `~/circadian` | Repo root |
| `CIRCADIAN_BUN_BIN` | `bun` on PATH | Installer's bun |
| `CIRCADIAN_USER_NAME` | prompt | Name written into `USER.md` |
| `CIRCADIAN_LLM_BASE_URL` | `LOCAL_LLM_BASE_URL` else `http://127.0.0.1:10240/v1` | Drafting/consolidation endpoint |
| `CIRCADIAN_LLM_MODEL` | local default | Model used for drafting/consolidation |
| `CIRCADIAN_LLM_API_KEY` | `LOCAL_LLM_API_KEY` else `"local"` | Key for the endpoint |
| `CIRCADIAN_LLM_THINK` | off | `"1"` to allow the reasoning trace |
| `CIRCADIAN_LLM_FALLBACK_BASE_URL` | unset | Optional fallback endpoint |
| `CIRCADIAN_LLM_RETRIES` | `3` | Total attempts per call |
| `CIRCADIAN_LLM_RETRY_BACKOFF_MS` | `"2000,10000,30000"` | Delay schedule |

### Development

```bash
bun test        # 509 tests across 24 files — zero runtime deps
bun src/doctor.ts   # health check against the live mind
```

- `src/` is the product: six small processes, each self-contained, each with
  its own test file. No framework — plain `bun` scripts with shebangs.
- `templates/` are the seed files a fresh `mind/` is built from.
- `install.sh` is the per-user scaffolder (idempotent, non-destructive).
- `mind/` is **your** memory — created by the installer, never committed here
  (`.gitignore` excludes it; `logs/*.mind-backup*` too).

### Package & distribute

`package.json` exposes the processes as bins and scripts, so the repo also
installs as a package:

```bash
npm install -g .        # or: bun link
circadian-doctor        # same as: bun src/doctor.ts
```

- **Binaries:** `circadian-wake`, `circadian-sleep`, `circadian-rem`,
  `circadian-graze`, `circadian-status`, `circadian-doctor`.
- **License:** MIT.
- **Privacy boundary for distribution:** everything personal lives in `mind/`
  (a separate repo with no remote, ever) and `logs/` — both gitignored. The
  shipped product is `src/`, `templates/`, `install.sh`, `docs/`. See
  `docs/RELEASE.md` for the release checklist.

## License

MIT — Copyright (c) 2026 Josh Gantt.
