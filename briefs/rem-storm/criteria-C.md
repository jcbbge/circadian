# Criteria — Task C: endpoint truth (`src/llm.ts`)

Test-maker: rem-storm-criteria-w3. Test file: `src/llm.test.ts` (new).
Written from the brief only — no implementation exists yet. All three tests
below are RED today, for the documented reason. Implementer target:
`agnt-endpoint-truth`.

## Assumed contract (not yet in `src/llm.ts` — implementer must match or negotiate via need-help)

- **Cross-process concurrency cap env override:** `CIRCADIAN_LLM_MAX_CONCURRENT`
  (house style, mirrors `CIRCADIAN_LLM_RETRIES` at `src/llm.ts:58`). Default
  must be `1` per CORD's ruling. Tests set this explicitly to `"1"`; they do
  not depend on the default.
- No other new exports are assumed. Classification (busy vs down) and jitter
  are proven black-box, through `complete()`'s thrown `Error.message` and
  through real timing/connection evidence from throwaway servers this file
  owns — not through new exported symbols. If the implementer's classifier
  needs a different env var name for the cap, that is a `need-help` to ORCH,
  not a silent rename — this file's tests hard-code
  `CIRCADIAN_LLM_MAX_CONCURRENT`.

## Done-when -> test -> command

1. **A refusing endpoint is classified busy, backed off WITH JITTER, and
   never worded "unreachable"**
   Test: `src/llm.test.ts` — describe `"llm.ts — down vs busy classification
   (rem-storm Task C)"` > `"(a) a refusing endpoint is classified busy,
   backed off WITH JITTER, and never reported as unreachable"`.
   Command: `bun test src/llm.test.ts -t "a refusing endpoint"`
   Evidence today (RED, right reason): `complete()` throws
   `LLM preflight failed: http://127.0.0.1:<port>/v1 unreachable (the socket
   connection was closed unexpectedly. ...)` — the exact "unreachable"
   wording work item 1 says must not be emitted for a refused-under-load
   connection. Mechanism: a raw TCP server that accepts every connection and
   immediately resets it (`socket.resetAndDestroy()`), timestamping each
   accepted connection; the test additionally asserts >= 2 attempts occurred
   and that at least one inter-attempt gap deviates from the configured
   fixed 300ms backoff by more than a 10ms noise band (jitter proof).

2. **A genuinely absent endpoint is classified down and does not retry to
   exhaustion**
   Test: `src/llm.test.ts` — same describe > `"(b) a genuinely absent
   endpoint is classified down and does NOT retry to exhaustion"`.
   Command: `bun test src/llm.test.ts -t "genuinely absent"`
   Evidence today (RED, right reason): elapsed time 638–685ms across runs
   against `expect(result.elapsedMs).toBeLessThan(150)` — proves the current
   code retries into a real ECONNREFUSED port through the full configured
   backoff (2 sleeps @ 300ms) instead of stopping after one attempt.
   Mechanism: bind a port, close it before firing the request (awaited, so
   no race), guaranteeing a real OS-level ECONNREFUSED with nothing listening
   — distinct from test (a)'s "refuses" server, which accepts the TCP
   connection before resetting it.

3. **The concurrency cap holds across real separate processes**
   Test: `src/llm.test.ts` — describe `"llm.ts — cross-process concurrency
   cap (rem-storm Task C, CORD-ruled N=1)"` > `"(c) the cap serializes calls
   across two REAL separate processes, not just within one"`.
   Command: `bun test src/llm.test.ts -t "REAL separate processes"`
   Evidence today (RED, right reason): server-side overlap between two
   concurrently-spawned real subprocesses' 400ms calls measured at
   396–402ms (against `expect(overlapMs).toBeLessThanOrEqual(50)`) — proves
   the two calls ran essentially fully in parallel today, i.e. no cap exists.
   Mechanism: a real `Bun.serve()` OpenAI-shaped SSE endpoint (GET
   `/v1/models` -> 200, POST `/v1/chat/completions` -> one delayed streamed
   chunk) logs its own per-request `[start, end]` server-side (not the
   subprocess's self-reported timing, which a broken cap could make look
   serial by scheduling accident); two subprocesses share one temp
   `CIRCADIAN_HOME` so a directory-based lock under `logs/` would be shared
   between them.
   Supplementary (not a done-when, but guards the "released immediately
   after, never held across calls" requirement): `"(c-supplement) the cap's
   slot is held per-call and released immediately after, not across calls"`
   — currently PASSES (trivially, since no cap exists yet to deadlock on);
   keep it green through implementation as a no-self-deadlock regression
   guard. Command: `bun test src/llm.test.ts -t "released immediately after"`

4. **Full suite floor, `bun test` (whole suite, not just this file)**
   Command: `bun test`
   Result at hand-off: `521 pass / 5 fail / 3824 expect() / 26 files / 527
   tests`. Of the 5 failures: 3 are this file's tests above (expected red);
   the other 2 (`"poison quarantine — corpus containment"` ...) belong to
   sibling worker w2's `src/stack.test.ts` (Task B, in flight concurrently in
   this shared checkout per ORCH's correction) — not caused by this file and
   not in this partition. Confirmed by name: their failure messages reference
   `stack.test.ts` line numbers (734, 761) and `fail()`/episode semantics,
   nothing in `src/llm.ts`.

## Zero live-LLM calls

No test in `src/llm.test.ts` contacts `:10240`. All three scenarios run
against throwaway local servers (`node:net` raw TCP for refuse/absent,
`Bun.serve()` for the fake OpenAI-shaped endpoint used only in the
concurrency-cap tests). `CIRCADIAN_LIVE_LLM` is never read by this file —
nothing in it is live-LLM-gated because nothing in it needs the live grant.
