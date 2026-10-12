# Coordinated memory views

This optional addition lets an agent read a small view of existing memories,
see what was left out, and expand a selected memory into its recorded evidence.
It uses Circadian's existing atoms, episodes, and belief ledger. It makes no
model calls and adds no database or background process.

Ordinary recall already exists. What this adds is a budget over the complete
JSON response, explicit coverage, and a reference that is checked against the
current files and eligibility before expansion. This is the first production
addition from the coordinated-views proposal; it does not implement a general
mathematical ontology engine.

## Turn it on

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

Wake, graze, sleep, REM, and ordinary recall retain their existing behavior.
Enabling this addition does not add material to the wake injection.

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

The existing MCP server exposes `memory_view` and `memory_expand` when enabled.
Ask the harness to refresh its tool discovery if it retains the earlier tool
list. The tools take the same options, with `maxRecords` and `scanCap` in camel
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
