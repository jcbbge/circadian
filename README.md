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
  | `when`, `bisect` | `src/archaeology.ts` | read-only belief and episode git history |

  The processes are **storage-agnostic machines over markdown**: beliefs are
  weighted atoms, recurrence bumps weight instead of adding copies, forgetting
  is a nightly multiply, and `SELF.md` is a deterministic render of the top of
  the population.

## When

- **Session start** → `wake` injects context.
- **During a session** → `graze` fires on every tool use and prompt submit.
- **Session end** → `sleep` drafts the episode.
- **Twice daily (09:00 & 21:00, machine-local time)** → `rem` consolidates.
  `install.sh` installs macOS launchd jobs with login/restart catch-up, or a
  Linux systemd user timer with persistent catch-up for missed runs.
- **Anytime** → `status` (vitals), `doctor` (health check), `circadian when <id|claim-substring>` (birth, bumps, supersedes), and `circadian bisect <claim>` (first episode mention). Run `bun src/archaeology.ts when|bisect ...` from the program checkout without the package bin.
- **Historical sessions** → `circadian backfill [--source claude|pi] [--since YYYY-MM-DD]` drafts one stamped episode per transcript through SLEEP. Run REM afterward to extract; backfilled episodes count once each. This may call the configured local model.
- **Hard forget** → `circadian erase <12-hex-atom-id> --reason "..."` previews the destructive history rewrite; repeat with `--yes` to remove the atom, redact its text from the mind's history and prune old objects. Mind must be clean and have no remote. Keep erased text out of the reason.
- **Quorum births** → with at least two checked-out `fm/*` lanes, new atoms require 2 of 3 independent DISTINCT decisions against lane views. Disagreement keeps an immutable `mind/proposed/<id>.md` without a birth event; `bun src/status.ts` lists proposals, and `bun src/admit.ts <id> [--mind <repo>]` is the human promotion door (`circadian admit <id>` in a command-dispatching installation). Recurrences do not vote. Without multiple lanes the gate is off.
- **Worker lanes** → `circadian lane open <id>` makes local mind branch `fm/<id>` in `mind-lanes/<id>` (sibling of `mind/`). Point the worker's `CIRCADIAN_HOME` at a sandbox home with `mind/` symlinked to that worktree (or commit directly in it), then `circadian lane conflicts [id]` and `circadian lane land <id>` from the main mind root. Landing requires clean committed worktrees; it merges immutable atoms, unions ledger events by hash and timestamp, re-renders SELF, and surfaces divergent supersessions as contradictions. Unlanded branches are preserved. Each command accepts `--mind <repo>` for a non-default mind path.

For Linux and VPS setup, see [Linux / VPS](#linux--vps) below. Other operating
systems need a separately configured scheduler.

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
- **An OpenAI-compatible LLM endpoint** for checkpoint digestion, drafting,
  and consolidation. GRAZE's worker, SLEEP, and REM need it; WAKE doesn't.
  The installer probes the configured shell endpoint and
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
3. Installs the twice-daily REM schedule: launchd and login/restart catch-up
   on macOS, or a persistent systemd user timer on Linux.
4. Wires Claude Code hooks (`SessionStart`→wake, `SessionEnd`→sleep,
   `PostToolUse`+`UserPromptSubmit`→graze) by auto-merging into
   `~/.claude/settings.json` — zero manual JSON editing.
5. Installs the pi.dev extension (`circadian-mind.ts`, reload with `/reload`).

The installer wires Claude Code and Pi; it does not install Codex bindings
or rewrite global/project `AGENTS.md` or `CLAUDE.md` directives. Start a fresh
harness session and verify its lifecycle before treating installation as live.

### Linux / VPS

Run the installer as the account that runs your agents, from its Circadian
checkout. Cloning the program alone does not create the private mind, register
session hooks, or activate consolidation.

1. Make Bun available, or supply its absolute path through
   `CIRCADIAN_BUN_BIN`.
2. Configure the model endpoint and credentials in the private
   `~/.config/circadian/env` file described under [Configuration](#configuration).
   The runtime reads this file for hooks and scheduled workers. The installer's
   preliminary endpoint probe only reads shell environment variables, so its
   warning is not a substitute for the runtime health check.
3. Run `CIRCADIAN_USER_NAME="Your name" ./install.sh`. This registers the same
   Claude Code hooks and Pi extension as on macOS, plus
   `~/.config/systemd/user/circadian-rem.service` and `circadian-rem.timer`
   (under `XDG_CONFIG_HOME` when set). Existing mind files and service-unit
   files are preserved; an existing timer is re-enabled and started.
4. Verify the schedule and runtime:

   ```bash
   systemctl --user is-active circadian-rem.timer
   systemctl --user list-timers circadian-rem.timer --all
   loginctl show-user "$USER" --property=Linger
   bun src/doctor.ts --json
   ```

   Check both that the timer is active and that it has a next run. On a VPS
   that must keep working after logout, confirm user lingering is enabled with
   the machine administrator. The timer uses the server's timezone and
   `Persistent=true` catches missed runs. If the user service manager was
   unavailable during installation, activate the written units once it is
   available with `systemctl --user daemon-reload` followed by
   `systemctl --user enable --now circadian-rem.timer`.
5. Start, use, and close a real harness session. Inspect
   `logs/circadian.events.jsonl` for wake, checkpoint, and sleep outcomes;
   short sessions can legitimately skip checkpoints or episode drafting.
   Doctor checks Claude Code/Pi registration and recent process events, but
   does not prove context reached the model or audit Codex integration.

To stop scheduled consolidation, run
`systemctl --user stop circadian-rem.timer`; to keep it disabled across login
or restart, run `systemctl --user disable --now circadian-rem.timer`.

**Program updates and shared memory are separate.** Updating this checkout
updates the program; `mind/` is an ignored, separate private repository.
There is no automatic Mac–VPS memory synchronization. The
[September migration report](docs/MAC-MIND-MERGE-2026-09-27.md) records a
one-time history merge, not an ongoing sync mechanism. Do not overwrite an
existing mind with another machine's directory or treat independent REM
ledgers as interchangeable: the migration had to reconcile duplicate decay
events. A shared mind needs an explicit authority, synchronization protocol,
and privacy-contract change before enabling cross-machine replication.

Episodes already record their machine, harness, model, and session through
`src/provenance.ts`. These fields identify the source of an experience;
they do not create a separate identity or belief population per harness.
The intended cross-machine experience is one continuous identity and shared
memory, with origin retained for traceability. Replication is still future
work; the existing per-machine installations do not yet provide that continuity.

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

Runtime settings can also live in `~/.config/circadian/env` (or the path in
`CIRCADIAN_ENV_FILE`): plain `KEY=VALUE` lines, blank lines and `#` comments;
no shell expansion. Set `chmod 600` on this file. The installer never creates
it; systemd REM loads it optionally. Exported environment variables take
precedence. For a remote endpoint, for example:

```text
CIRCADIAN_LLM_BASE_URL=https://developer-78339--ep-hivevps-server.us-west.modal.direct/v1
CIRCADIAN_LLM_MODEL=deepseek-ai/DeepSeek-V4.1-Flash
CIRCADIAN_LLM_API_KEY=<token-id>.<token-secret>
CIRCADIAN_LLM_NO_THINK_PREFIX=0
CIRCADIAN_LLM_EXTRA_BODY={"reasoning_effort":"low"}
```

Configuration knobs (install-time and runtime):

| Variable | Default | Purpose |
|---|---|---|
| `CIRCADIAN_HOME` | `~/circadian` | Repo root |
| `CIRCADIAN_BUN_BIN` | `bun` on PATH | Installer's bun |
| `CIRCADIAN_USER_NAME` | prompt | Name written into `USER.md` |
| `CIRCADIAN_LLM_BASE_URL` | `LOCAL_LLM_BASE_URL` else `http://127.0.0.1:10240/v1` | Drafting/consolidation endpoint |
| `CIRCADIAN_LLM_MODEL` | local default | Model used for drafting/consolidation |
| `CIRCADIAN_LLM_API_KEY` | `LOCAL_LLM_API_KEY` else `"local"` | Key for the endpoint |
| `CIRCADIAN_ENV_FILE` | `~/.config/circadian/env` | Optional private runtime settings file |
| `CIRCADIAN_LLM_NO_THINK_PREFIX` | `1` | `0` disables `/no_think` prompt prefix |
| `CIRCADIAN_LLM_EXTRA_BODY` | unset | JSON object merged into requests; core protocol fields cannot be overridden |
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
