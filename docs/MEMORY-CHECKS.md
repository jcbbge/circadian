# Optional memory checks

Memory checks make source copying a code operation instead of a model recopying task. When enabled, normal extraction selects numbered source segments and code copies their original text before applying the existing shape and verbatim-quote guards. Agents also get `memory_check` to select exact remembered evidence, keep readable document labels and compare explicitly supplied fields or contexts.

This is a supplement to Circadian. Missing configuration defaults it off. It adds no package, database, service or scheduled job. Extraction keeps its existing model call; the read tool calls no model and never writes memory. Ordinary wake, recall, graze, sleep and REM remain available.

## Operator controls

Run these on the machine you want to configure:

```sh
circadian extensions enable views
circadian extensions enable checks
circadian extensions status
circadian extensions check checks
```

Both capabilities are enabled for the complete read workflow. Checks alone enables source-selector extraction; acquiring fresh read-check refs through `memory_view`/`memory_expand` requires views too. The settings live in the existing machine-local `extensions.json`, outside the shared mind.

```sh
circadian extensions disable checks
```

Disabling restores the ordinary extraction format for the next extraction and immediately rejects new `memory_check` calls. It leaves views and ordinary memory enabled. A call already in flight keeps its selected format; disabling cannot erase evidence already loaded into a conversation or undo published memories.

Status prints `checks ON/OFF`; the status strip shows `checks ON` when enabled. `extensions check checks` binds a real current source span and compares returned text to source bytes. PASS proves that live read operation, not semantic truth, model obedience or a successful extraction run. Empty/unavailable evidence is INCOMPLETE. Add `--json` to controls and checks for scripts.

## Normal agent use

Keep asking ordinary questions. Enabled startup guidance and the registered tool description tell agents when to use the addition:

1. When past context is needed, inspect `memory_view` coverage and expand relevant refs using `memory_expand`.
2. Before quoting evidence or comparing accounts, call `memory_check` with those atom refs and source selections. The source filename/revision come from expansion. Offsets are half-open UTF-16 code-unit offsets into the returned source text.
3. Read each selection status. `source-current-exact` means code copied a current eligible source span. Changed, forgotten, unavailable and over-budget evidence remains explicit.
4. Use returned document titles/filenames to identify sources. A document heading is not an inferred author or participant.
5. Optional field comparisons report exact selected-string matches/differences. Context comparisons require the same explicitly supplied subject/property and finite day/value annotations. Results apply within those annotations; they do not certify the annotations against prose.
6. Recording-location, event-location and participation candidates remain distinct and explicitly semantic UNKNOWN. Assess their meaning against the source before using them; recording a note somewhere does not establish event location, and authorship does not establish attendance. Unknown attendance is not absence.

MCP and native Pi expose the same handler. Existing MCP clients need a reconnect/new session, and Pi needs `/reload` or a new session to discover the new tool. New startup guidance covers usage; previously loaded context does not receive a retroactive startup injection.

For an agent with shell access, the same operation is available immediately:

```sh
circadian check --input request.json
# Or pipe a JSON request to:
circadian check --input -
```

Requests contain `refs`, `selections`, optional `comparison`, optional typed `claims`, and optional `chars`. The advertised tool schema defines all fields. Limits are 12 refs, 32 selections, 32 fields/values/claims and 128,000 output characters (default 32,000). The complete JSON payload counts toward the budget. Whole quotes are omitted with explicit statuses when necessary; comparisons become unknown if their evidence is unavailable. CLI JSON input is limited to 64 KiB. Existing safe expansion path and I/O ceilings apply.

## Automatic extraction

The model outputs `quote-lines: N-M` for numbered source segments rather than generated quote text. Long physical lines are split into bounded segments with original offsets; code reconstructs the selected original substring without inserting artificial newlines. Up to eight selections per candidate are accepted, with at most 4,096 characters per selected range and 32 KiB of JSON-encoded quotation data in total. Invalid, blank, oversized or mixed-format selectors reject rather than silently producing a substitute quote.

The original raw completion remains in the existing private stacker log. Existing candidate shape, counterfeit-quote, exposure, comparison and publication checks remain in force. Selecting a genuine source segment proves provenance only: it does not prove that the segment supports the proposed belief. Existing published atoms and historical failed outputs are not rewritten by enabling this addition.

Before publishing a new atom in this mode, the stacker also checks the actual serialized atom against the existing 64 KiB reader limit. Oversized atoms reject before publication, rather than becoming memories the bounded reader cannot reopen.

## Relationship to the six proposals

This promotes bounded pieces of the preserved research: readable source labels and finite contextual comparison (02), distinct attributed relation candidates (03), distinct participation candidates (05), and exact source-bound field comparison (06), alongside shipped coordinated views (01). Proposal 04's retirement invariant remains verified research; there is no production temporary-aid store to rewrite. This is not automatic activation of six engines or a general plugin loader.

The research adapters and frozen studies remain under `research/`. Production code imports no research fixture, rubric or grading material. Further semantic automation or promotion needs its own evidence; exact copying is not an assertion that a model understands the selected text.

Current verification and remaining work are recorded once in [SESSION-HANDOFF.md](SESSION-HANDOFF.md).
