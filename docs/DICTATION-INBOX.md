# Dictation inbox

An optional VPS inbox supplies dictated text before ordinary wake memory. Memory
remains file-based and usable without Rivet. This change does not activate the
inbox, provision a stream, implement Tuna, or ship a deployment.

## Activation

Use the existing private `~/.config/circadian/env` configuration (or
`CIRCADIAN_ENV_FILE`), with mode 0600:

```text
CIRCADIAN_INBOX_URL=http://127.0.0.1:8642/durable-streams/v1/stream/circadian-dictation-v1
```

Exported environment variables take precedence. Remove `CIRCADIAN_INBOX_URL`
from both configuration and the environment to disable. `CIRCADIAN_INBOX_SKIP=1`
disables an individual invocation. `MW_WORKER=1` and `CIRCADIAN_INTERNAL=1`
bypass inbox configuration, state and network work. Continuation slots only
acknowledge prepared output; they never fetch. Amp's detached `session.start`
wake skips the inbox because its stdout is discarded; captured `agent.start`
wake remains eligible.

Only HTTP URLs with parsed hostname `127.0.0.1` or `[::1]` are accepted, without
credentials, query or fragment. Redirects are rejected. No public listener,
proxy, new service or dependency is introduced. Wake never starts Rivet.

Provision the stream separately while the existing on-demand Rivet machine is
running: PUT the URL above with `Content-Type: application/json` and body `[]`.
Wake does not create it. On the Mac, use the same path at
`http://localhost:<forwarded-port>/durable-streams/v1/stream/circadian-dictation-v1`
through the operator's existing SSH forward to VPS loopback port 8642.

## Mac sender contract

Each POST has `Content-Type: application/json` and exactly one JSON object:

```json
{"id":"d7b99a32-5f87-42df-a131-b9359f674395","text":"A dictated note.","createdAt":"2026-11-03T12:00:00.000Z","source":"mac"}
```

`id` is a UUID. `createdAt` is a UTC ISO timestamp produced by `toISOString()`.
`text` is nonempty and at most **16384 UTF-8 bytes**. Reject larger notes before
sending; never truncate or split them. `source` is always `"mac"`.

The sender owns a persistent producer UUID and uses these headers:

```text
Producer-Id: <persistent producer UUID>
Producer-Epoch: 0
Producer-Seq: <persistent sequence beginning at 0>
```

The durable FIFO spool is one continuing producer session across sender process
restarts. Persist each body's exact bytes and complete producer tuple before
sending. Allow only one outstanding append. Retry uncertain appends with
identical bytes and headers; remove a queued entry only after confirmed
successful append or duplicate acknowledgment. Advance sequence for the next
queued note, preserving FIFO order. Outages, Rivet being stopped, and startup
504s retain queued notes for later flushing. Conflicts retain the note and
surface an error; never change its identity to bypass a conflict.

Installation evidence is the operator-supplied verification dated 2026-11-03
for installed rivet-services 0.2.4 supervised by `rivet-core` in rivet-pilot:
PUT returned 201, POST returned `Stream-Next-Offset`, saved-offset GET returned
newer entries, retrying the same producer tuple stored one entry, and data
survived stop/start. The listener is host loopback only and absent when Rivet
is stopped; startup can briefly return 504. This implementation performs no
new live experiment and makes no changes to rivet-pilot.

## Wake and delivery progress

An eligible primary wake makes exactly one GET with its saved opaque offset.
One 1000 ms monotonic deadline covers connection, headers and complete body
acquisition. There is no retry, polling, HEAD or second pagination request.
Responses must succeed, be `application/json`, carry a nonempty
`Stream-Next-Offset`, and contain an array of valid envelopes. An invalid or
oversized entry fails the read without skipping data. Configuration, state,
HTTP, timeout, parsing and network failures preserve progress and print:

```text
[Circadian] Inbox unavailable.
```

Ordinary memory still appears. A caught-up empty response is silent. Wake
renders whole notes with a dictation-data heading, ID, timestamp and unchanged
text in stream order. Notes are input data, never executable instructions.
Plain/captured output selects at most 20 notes. Claude hooks select the largest
whole-note prefix of at most 20 fitting before the last of eight transport
slots. A note may span several parts within that wake; it is never abbreviated
or deliberately fragmented across wakes. Later notes wait when capacity fills.
Ordinary memory keeps its existing spool and overflow behavior.

Counts describe the read snapshot, not later appends. A caught-up response
reports an exact remaining count, `[Circadian] N notes waiting.` A partial
response reports `[Circadian] N+ notes waiting; more remain beyond this
response.` If its known remainder is zero, it says `[Circadian] More notes
waiting; count unavailable from this response.` No additional request discovers
a global total.

Progress is private local state at `$CIRCADIAN_HOME/logs/inbox/state.json`,
never `mind/`:

```json
{"v":1,"url":"http://127.0.0.1:8642/durable-streams/v1/stream/circadian-dictation-v1","offset":"-1","delivered":[]}
```

Missing state starts at `-1`. Malformed state, another version, or an endpoint
mismatch preserves the file and reports unavailability. Offsets are opaque
server response boundaries, not per-note positions. `delivered` holds ordered
SHA-256 hashes of UTF-8 `JSON.stringify([id,text,createdAt,source])` for notes
already displayed after the anchor. Wake rereads that anchor and verifies the
prefix before omitting it. After the whole response is displayed it adopts
the returned offset and clears the hashes. A shorter response can rebase the
anchor while preserving remaining prefix hashes, after output completion;
empty responses with unmatched hashes and mismatched prefixes fail safely.

Delivery is **at least once**. Stdout's successful write callback precedes
acknowledgment. Plain output acknowledges its selected prefix after one write.
Hook spools include a random attempt identity, endpoint identity and candidate
cursors with required parts. Each slot writes a completion receipt under
`logs/inbox/receipts/<attempt-id>/` only after its own output succeeds. Only the
greatest contiguous candidate supported by receipts for every part through
that note's end is published. Out-of-order slots are safe; absent or failed
parts prevent progress past them. Publishing a spool alone is not delivery.
An empty-read rebase also requires completed primary output.

State and receipts use unique temporary files and atomic rename, private 0700
directories and 0600 files. Note-bearing wake spools have equivalent private
permissions. Primary preparation prunes receipt attempts using the existing
24-hour spool lifetime. Failed temporary writes are cleaned up. A spool
publication failure removes the proposed notes, emits unavailability, keeps
the cursor and uses the ordinary-memory fallback.

Checkpoint failure prints, within reserved hook capacity:

```text
[Circadian] Inbox checkpoint unavailable; shown notes may repeat.
```

Interrupted output or checkpoint writes leave replay possible. Concurrent
wakes may conservatively rewind and repeat notes; unrelated attempts are never
merged and opaque offsets are never maximized. There is no exactly-once harness
acknowledgment or globally monotonic presentation across concurrent sessions.
Diagnostics record outcomes, reasons, counts and duration, never note bodies
or fetched response bodies. Independent Made Well verification covers the
plan's D1–D9; activation and shipment remain separate work.
