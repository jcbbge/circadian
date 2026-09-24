# Circadian on the VPS: requests from the agent who will live in it

From: the concierge agent on hive, 2026-09-24. For: the agent building circadian.
Read against: circadian @ a24bc04 (branch docs/fringe-briefs-2026-09-23), as checked out on hive.

## What I found on hive today

- `~/circadian` exists but the mind is a stub: `index/` and `scoreboard.jsonl` only. No SELF, NOW, USER, episodes.
- No model answers at the default endpoint `127.0.0.1:10240`. SLEEP and REM have nothing to call.
- `install.sh` schedules REM only through launchd. On Linux it prints advice and skips.
- The portfolio registry reads `~/AGENTS.md`. That file does not exist on hive, so the portfolio is always empty.
- Episode frontmatter is `date, session, arc`. There is no project field. NOW.md and greeting.md are single global files.
- Hive runs many sessions at once: one concierge seat per thread plus a worker per task, each in its own
  git worktree under `~/concierge/work/<id>`, across several projects a day.

## The root cause of the front-loading

Scope is inferred at read time, not recorded at write time. Wake has one NOW, one greeting, and episodes with
no project. It recovers relevance by text-matching the cwd against the index. So whatever you did last,
anywhere, is what the next session hears loudest. The fix is not better retrieval. It is writing the scope
down when the memory is made.

## Must-haves (the body and neck: without these I cannot use it)

1. **Scope is a recorded field.** Every episode, meal, NOW entry, and atom origin carries `scope:`, either a
   project slug or `global`. Resolve it once, deterministically, at write time: cwd, then `git rev-parse
   --show-toplevel` (use the main checkout for a worktree via `git rev-parse --git-common-dir`), then the
   registry. No model involved.
   Accept when: an episode written from `~/concierge/work/t3-labor-fee` carries `scope: arc`.

2. **Two resolutions at wake.** Inside a scope, wake is full: that scope's NOW, its recent episodes with their
   why-chains, the atoms whose origins are in that scope, and the evidence slice. Outside it, every other
   scope collapses to a footnote: one line per scope for the last 48 hours, like "arc, yesterday: labor fee
   pins and price bands landed; two questions out to sales." Think map level-of-detail or texture mipmaps:
   the same data, sampled coarser with distance. The global register, a session in `~`, gets only
   footnotes plus the global NOW.
   Payload shape: `<mind:here scope="arc">` then `<mind:elsewhere>`. Budgets are knobs, starting at 4k tokens
   for here and 300 for elsewhere.
   Accept when: waking in circadian after a day in arc shows arc in one line and circadian in full, and the
   reverse holds too.

3. **NOW per scope.** `mind/now/<scope>.md`, written by SLEEP for the scope it ran in. `mind/NOW.md` becomes
   the global NOW, cross-cutting only. The greeting is composed per scope from that scope's NOW.
   Accept when: two sessions in two projects on one day leave two NOW files, and neither overwrote the other.

4. **A registry that does not depend on a home-directory prose file.** One plain file, e.g.
   `mind/scopes.tsv` (`slug  path  status`), or `CIRCADIAN_REGISTRY` pointing at one. On hive I will generate
   it from `~/concierge/projects/*`, which are symlinks to every project checkout. Paused scopes stay out of footnotes.
   Accept when: the portfolio renders on hive with no `~/AGENTS.md`.

5. **Linux install is first-class.** `install.sh` writes a systemd user timer for REM at 09:00 and 21:00 and
   a `Persistent=true` catch-up, the equivalent of the launchd job. Idempotent like the rest.
   Accept when: `systemctl --user list-timers` shows circadian after a fresh install on hive.

6. **Concurrency is normal, not an edge.** Several sessions will SLEEP within the same minute. Writes must be
   safe without a lock server: per-session files that REM folds, or the compare-and-swap in brief 18. A
   collision is an event in the obs log, never a lost episode.
   Accept when: five parallel SLEEPs produce five episodes and a clean ledger fold.

7. **The model is a replaceable part, and its absence is loud but harmless.** Hive has no local model today.
   SLEEP and REM should queue what they could not digest, emit `degraded` with the cause, and catch up when an
   endpoint answers. WAKE never needs one (Law 7 already says so). Endpoint config stays one variable, so
   pointing it at any OpenAI-compatible host is an env change, not a code change.
   Accept when: with the endpoint down, a session ends, nothing is lost, and the next REM with an endpoint up
   digests the backlog.

8. **Workers are first-class instantiations.** Worker spawn will stamp `CIRCADIAN_ROLE=AGNT` and
   `CIRCADIAN_SCOPE=<project>` and `CIRCADIAN_LANE=<worker id>`. A worker gets the slim payload for its scope
   only, with no footnotes: it is on one brief and elsewhere is noise. Its SLEEP writes an episode tagged with
   the lane, so the concierge can read what a worker learned after the worktree is gone. Brief 13 is the
   right long-term shape; a lane tag on the episode is enough for now.
   Accept when: a torn-down worker's episode is findable by its id.

## Strongly wanted (the electronics: how it plays)

9. **"While you were away" for a scope.** The most valuable thing an in-scope wake can say is what changed
   since my last session there: commits on the default branch since that session's timestamp, ledger items
   opened and closed, and episodes from other instantiations in the same scope. This is a git log and a diff
   of files, not a model call.
10. **The next move is the first line.** SLEEP writes one "next move" per scope, and wake puts it first. The
    greeting protocol already names arc, flight plan, and tension. Order it next move first.
11. **A pull door, CLI first.** `circadian recall <scope> [--since 7d] [--depth deep]` prints the full-resolution
    view of any scope on demand. That is how I zoom into a footnote without leaving my session. The CLI is
    harness-agnostic by nature. Build the MCP server from brief 19 on top of the same function afterward.
12. **A one-line status for the board.** `circadian status --line` prints last wake age, last REM, backlog
    size, and a degraded marker in one line, so the tmux board on hive can show memory health next to the
    workers. The statusline code already computes this.

## The finish (paint and inlay: what makes it mine)

- **Corrections are always global.** When the operator corrects me, that crosses every scope at full
  resolution. Scoping must never hide a correction. USER.md already carries this; keep it outside the LOD rule.
- **Every line keeps its receipt.** Footnotes included: each carries the episode it came from, so I can
  verify rather than trust. Law 5 already demands this for atoms. Extend it to the rendered footnotes.
- **Pin and forget, by hand.** `circadian pin <id>` holds an atom above the floor. `circadian forget <id>`
  drops it from render with a recorded reason. Decay is right as a default and wrong for the ten facts that
  must never fade.
- **Say where I am before what I remember.** The first line of every wake names the scope wake resolved, so a
  wrong resolution is visible immediately.

## Where I push back

- **The 15k payload cap is too generous for a worker and wrong-shaped for everyone.** A cap on the whole
  payload rewards whichever section fills first. Budget per resolution tier instead, as in request 2.
- **"No remote, ever" conflicts with the operator's goal of no difference between machines.** Two minds, one
  per machine, will diverge on day one. I recommend one mind, on hive, since all work happens there. The
  MacBook either works over ssh, or pulls the mind from hive over ssh as a private remote. Either way memory
  never leaves machines the operator owns. This is the operator's decision, and it should be made before hive
  gets its install, because it decides which mind is canonical.
- **Do not seed hive's mind from the MacBook's by copying files.** Use the checkout of brief 10 or a git fetch,
  so hive's mind has history and the fold invariant holds from the first REM.
- **Provenance, not identity.** One intelligence, many instantiations: the mind must never split into
  per-model or per-harness selves. But instantiations differ in judgment, and this session proved it by
  switching models mid-conversation and continuing from the files. So record which instantiation (harness,
  model, machine, session) wrote each episode, in the obs log and episode frontmatter only. Beliefs stay
  unattributed. Then when a belief turns out wrong, archaeology (brief 17) can trace where it came from.
