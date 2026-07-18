# Circadian

A file-based memory substrate for AI coding agents. Plain markdown in git;
all intelligence lives in four small processes around it — **wake** (inject
memory at session start), **sleep** (draft an episode at session end),
**rem** (twice-daily consolidation), and **status** (vitals).

See [`mind/MIND-SPEC.md`](templates/MIND-SPEC.md) for the design contract.

## Install

```bash
git clone <this-repo> ~/circadian
cd ~/circadian
./install.sh
```

The installer scaffolds your private `mind/` from `templates/`, initializes it
as a local git repo (no remote — your memory never leaves your machine), and
installs the twice-daily REM job (09:00 & 21:00). It prints the Claude Code hook config to add.

## Layout

- `src/` — the four processes (`wake`, `sleep`, `rem`, `status`)
- `templates/` — agnostic seed files a fresh `mind/` is built from
- `install.sh` — per-user scaffolder
- `mind/` — your private memory (created by the installer; never committed here)
