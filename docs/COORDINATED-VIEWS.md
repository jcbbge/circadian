# Coordinated memory views

This optional addition lets an agent read a small view of existing memories,
see what was left out, and expand a selected memory into its recorded evidence.
It uses Circadian's existing atoms, episodes, and belief ledger. It makes no
model calls and adds no database or background process.

The separate optional [memory checks](MEMORY-CHECKS.md) addition provides exact source selections and bounded annotation comparisons after expansion, plus code-bound quotes during normal extraction. It has its own on/off setting.

Ordinary recall already exists. What this adds is a budget over the complete
JSON response, explicit coverage, and a reference that is checked against the
current files and eligibility before expansion. This is the first production
addition from the coordinated-views proposal; it does not implement a general
mathematical ontology engine.

## Turn it on

These commands operate on the machine where you run them:

| You want to know or do | Command | What it proves or changes |
| --- | --- | --- |
| Is it enabled? | `circadian extensions status` | Prints ON/OFF, config location and the last recorded view/expand request. |
| Does it actually work? | `circadian extensions check views` | Reads a real global memory, expands it, checks budgets and compares atom/source bytes to the current files. |
| Turn it off | `circadian extensions disable views` | Immediately rejects new view/expand calls; ordinary Circadian continues. |
| Turn it on | `circadian extensions enable views` | Enables the optional tools and next wake's usage notice. |
| Show usage | `circadian --help` | Lists controls, read commands and agent usage. |

Controls/checks print readable text. Add `--json` for scripts. A check reports
`PASS`, `INCOMPLETE`, `FAIL`, or `OFF`; only PASS exits zero. INCOMPLETE/OFF exit
2 and FAIL exits 1. An empty global view or unavailable evidence is incomplete,
not a made-up success. The check reads memory and writes an operational receipt
to the existing event log; it calls no model and changes no memory.

ON describes configuration. The last recorded request describes a call through
CLI, MCP or Pi; it cannot tell whether a person or an agent initiated that call,
or whether a later answer used the evidence well. Status checks only the last
64 KiB of the event log and says when no request was found there. Running the
check command does not manufacture an ordinary view/expand usage receipt.

```sh
circadian extensions enable views
circadian extensions status
circadian view global --chars 6000
```

Replace the last command's scope with the scope you want. `global` selects
global memories; it does not combine every project. From a source checkout,
`bun bin/circadian` is an equivalent command. The package command also supports
these operations through `src/archaeology.ts`.

Older atoms inherit scope from their available quoted episodes. If those
episodes are unscoped, the memories remain global. Registering a project does
not retroactively assign its older memories. An empty project view therefore
does not establish that no relevant memory exists in the global scope.

The setting lives in `<CIRCADIAN_HOME>/extensions.json` (default
`~/circadian/extensions.json`), outside the private mind. Missing configuration
means off. A malformed configuration disables this addition and reports an
error when requested; ordinary tools remain available.

```sh
circadian extensions disable views
```

The disabled default retains its original wake output. When enabled, wake adds
a short capability notice outside remembered data, and the existing status
strip shows `views ON`. Graze, sleep, REM, and ordinary recall are unchanged.

## How the agent knows and uses it

You normally keep talking to the agent. For example: “What did we decide about
that trip?” or “Use my earlier preferences when suggesting options.” You do not
have to name this extension each time. Enabled startup guidance and tool
descriptions tell the agent to use it when the task needs remembered
preferences, decisions or context absent from wake, then expand relevant
references for evidence. They do not require a call on every prompt.

1. The existing wake path delivers the short usage note when views are enabled.
2. The MCP server advertises `memory_view` and `memory_expand` with their
   triggers and rules. Pi's existing extension registers the same definitions
   as native tools. Both paths check the flag again when called.
3. The agent chooses the scope, checks omissions, expands relevant records,
   checks freshness/eligibility, and uses the returned evidence in its response.
4. A harness with shell access can use the equivalent CLI commands.

Delivery and registration are testable. Whether a particular model follows the
instructions is a behavioral outcome, visible in that session's actual tool
calls and answer. An enabled flag alone is not evidence of that outcome.

Existing MCP sessions need a reconnect/new session to load updated server code
and discover tools. Pi needs `/reload` or a new session for newly registered
tools; a new session also receives the wake note. Turning views off takes effect
on the next call, including from a previously advertised tool. Already loaded
context cannot be removed from an ongoing conversation by disabling a tool.

For Codex installations without a Circadian connection, register the existing
local server with `codex mcp add circadian --env CIRCADIAN_HOME=/absolute/path/to/circadian -- /absolute/path/to/bun /absolute/path/to/circadian/src/serve.ts`.
Use the actual installation paths and verify with `codex mcp get circadian`.
This adds the read tools; it does not install Codex wake/sleep lifecycle hooks.
See [official MCP configuration](https://developers.openai.com/codex/mcp/).

Other harnesses need either that MCP connection or an existing wake/CLI binding;
enabling the flag does not install an integration into an arbitrary harness.

## Use the returned reference

Each returned record includes `ref.id` and `ref.revision`. Pass them back together:

```sh
circadian expand <id>@<revision> --chars 32000
```

Expansion returns the whole atom and its available quoted episode texts. It
checks current eligibility and revisions rather than trusting the earlier view.
A forgotten or superseded atom is ineligible; changed bytes yield
`changed-revision`. Get a new view to inspect the new version. A missing source
is reported as unavailable. Nothing is silently substituted from git history.
Expansion's `complete` means every requested reference received a status;
check each entry's `status` and each source's availability before using it.
For example, a complete response can consist entirely of `over-budget`
receipts. Exact original atom text is in an available entry's `content`; the
preview carries the parsed atom fields once to avoid spending context on a
duplicate copy.

The tools take the same options, with `maxRecords` and `scanCap` in camel
case; `memory_expand` takes a `refs` array of `{id, revision}` objects. The
configuration is rechecked on each optional call, so disabling it also rejects
calls made from a previously discovered tool list.

## Read the result honestly

- A view keeps each memory whole: claim, rationale, quotes, episode references,
  and stored scope. It does not create a new summary or reinterpret rationale
  as a qualification.
- Coverage reports inspected candidates, eligible records, included records,
  omissions, and unresolved candidates. An incomplete view is not evidence that
  the omitted memories do not exist. Increase the budget or scan cap when the
  task warrants it.
- Open disagreement references remain visible even when the opposing memory
  is omitted. This preserves the relationship; it does not resolve the dispute.
- A revision describes the atom bytes, observed quote sources, and open
  disagreement references at read time. It does not prove that an old episode
  is identical to its original extraction version, that a claim is true, or
  that several files were read as one atomic snapshot.
- The view reads current files only. Use the existing history/read tools for
  historical investigation. Missing historical evidence is explicit.

The view defaults to 6,000 characters, 12 records, and at most 500 inspected
atom candidates. Expansion defaults to 32,000 characters and 12 inspected
references. `--chars`, `--max-records` (view only), and `--scan-cap` set those
limits. The JSON payload, including metadata and escaping, counts toward the
character budget; the CLI newline and MCP transport wrapper do not. A budget
too small even for a receipt returns an explicit error instead of cutting text.

For a larger population, `circadian view global --chars 6000 --scan-cap 2000`
inspects more candidates while retaining the same output budget. Candidates
are considered by ledger weight, then ID; the view keeps a whole-record prefix.
If its first record exceeds the budget, raise `--chars` rather than expecting a
different lower-ranked record to replace it. Source reads also have fixed size
ceilings: 64 KiB per atom, 256 KiB per episode, 8 MiB for the ledger, and 16 MiB
total per request. Size-limited records or sources are reported as unresolved
or unavailable, not silently read in full.

This is a read capability, not a new source of behavioral instructions. Memory
content remains data. The intended agent workflow is: inspect the relevant
scope, check coverage and disagreements, expand evidence when needed, and
reacquire a view if the reference is stale.
