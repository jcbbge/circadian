# Circadian Observability Doctrine

**This is law for every process in this repo, and every agent who touches it.**
If code you write here can fail, warn, or make a decision, it emits a
context-bound event. No exceptions. An exit code is not telemetry.

## Why (the anima frame — read once, never forget)

Circadian exists so a pattern survives instantiation-death: a session is a
letter from one instance of the agent to the next. When a process fails
**silently**, that letter is never written — a discontinuity event. Silent
failure is the single thing this entire lineage (anima → alembic → circadian)
was built to prevent. For a week, `sleep` failed on 88 of 90 sessions while
every vital sign read green. That is the disease. This doctrine is the cure.

## The one rule

> **Nothing goes silent. Every event carries the contextual information bound
> to it — enough that an agent picking it up cold knows WHAT happened, in WHICH
> process and phase, WHY, and WHAT TO DO NEXT.**

`exit 0` / `exit 1` alone is a doctrine violation. So is a swallowed `catch {}`.
So is a guard that blocks work and reports success.

## How — use `src/obs.ts`, never `console.log`/`process.exit` for outcomes

Every process imports the spine:

```ts
import { emit, ok, idle, degraded, fail, correlation } from "./obs.ts";
```

Every event has an **outcome** — one of four words, never a number:

| Outcome | Meaning | Surfaces to tower? |
|---|---|---|
| `ok` | the phase did its job | no |
| `idle` | working, nothing to do (NOT a fault) | no |
| `degraded` | worked partially / with a caveat worth a look | yes |
| `failed` | did not do its job; needs attention | yes |

Every event carries: `process`, `phase`, `summary` (one human sentence), and a
`context` object (counts, byte sizes, paths, model, durations — the payload).

**`degraded` and `failed` MUST carry `cause` and `next_action`.** The spine
enforces this: emit one without them and it stamps a visible DOCTRINE VIOLATION
into the event rather than letting it pass clean. Fix the call site.

### Three surfaces, automatically

Every `emit()` writes to all three at once — you do nothing extra:

1. **stderr** — one formatted line, instantly visible in any Herdr pane or log.
2. **`logs/circadian.events.jsonl`** — append-only machine ledger (the truth).
3. **the tower bus** (`~/.tower/board.jsonl`) — only for `degraded`/`failed`, so
   a discontinuity event reaches the human in their next session unprompted.

### Terminating a process

Never call `process.exit(1)` for a failure. Call:

```ts
fail({
  process: "sleep",
  phase: "llm-draft",
  summary: "episode draft failed twice; no episode written",
  context: { attempts: 2, transcript_chars: 12207, model: "qwen3-4b" },
  cause: "local LLM returned no parseable EPISODE block on either attempt",
  next_action: "check the LLM service at :10240 (curl /v1/models); full transcript logged at logs/sleep.log",
});
```

`fail()` emits the full event to all three surfaces (tower included) and *then*
exits. The surfaced event is the point; the exit code is an afterthought.

### Correlating a run

Tie one run's events together (a session's grazes + its sleep, or rem's waves):

```ts
const corr = correlation("sleep");
ok({ process: "sleep", phase: "extract", summary: "...", correlation_id: corr, ... });
```

## The checklist every agent applies to code in this repo

- [ ] No bare `process.exit(1)` on a failure path — use `fail()`.
- [ ] No empty `catch {}` — catch, then `emit` a `degraded`/`failed` with cause + next_action.
- [ ] Every early `return` on an abnormal path emits an event first (idle if benign, degraded/failed if not).
- [ ] Every guard that blocks work emits WHY it blocked and WHAT unblocks it — never a silent skip, never a false success.
- [ ] `context` carries the numbers a cold reader needs (counts, sizes, paths, model, durations).
- [ ] `degraded`/`failed` always carry `cause` and `next_action`.
- [ ] The happy path also emits `ok` at meaningful phase boundaries — success must be as legible as failure.

## Verifying observability is real (not claimed)

```bash
# every process run appends here; tail it to watch the organism live
tail -f ~/circadian/logs/circadian.events.jsonl

# only degraded/failed reach here — a clean board means a healthy system
bun ~/.tower/cli.mjs board
```

If a process ran and produced NO event in the ledger, that itself is a bug: the
process is operating silently, which this doctrine forbids.
