# Belief interchange — read-only atom shape

An atom is a claim with a why-chain and at least one quote grounded in a cited source. Identity is content: `id` is the first 12 lowercase hex digits of SHA-256 of the UTF-8 claim after trimming its edges and replacing every whitespace run with one space. Recompute it on read; never trust a stored id. Two atoms with the same claim have the same id regardless of container, status, or provenance.

Required fields: `kind` (`identity`, `doctrine`, `motif`, `agreement`), nonempty `claim` (at most 280 characters), nonempty `why`, and one or more pairs of nonempty `quote` text and `source` path. An origin date (`YYYY-MM-DD`) is required for an atom-file stamp. An entity fact may instead derive it from a source's timestamp. Quotes must occur in the cited source text after applying **exactly** this normalization to both strings: map curly double/single quotation marks to ASCII, en/em dashes to `-`, collapse whitespace runs to a single space, trim edges. An empty quote, missing source, unreadable source, or unmatched quote is rejected, not repaired. This is an evidence check, not semantic similarity.

Two read dialects:

| Atom file | Entity frontmatter | Meaning |
| --- | --- | --- |
| `kind: identity\|doctrine\|motif\|agreement` | `facts[].kind` | section/category |
| `claim: "…"` | `facts[].claim` | identity-bearing text |
| `why: "…"` | `facts[].why` | why-chain |
| `quote: "…" \| <source>` | `facts[].sources[].quote`, `facts[].sources[].path` | evidence pair; source path relative to store root |
| `[ep:YYYY-MM-DD]` | `facts[].sources[].timestamp` (ISO date prefix) | origin date |
| derived from `claim` | `facts[].id` (optional, checked if supplied) | recomputed id |
| separate ledger | `facts[].status` (optional) | not imported; including `superseded` creates no ledger event |

An atom file stores one atom in fixed slot order, JSON-quoted text and one or more quote lines and date stamps. Its filename is the derived id plus `.md`; its source text is checked against the cited episode before interchange. Entity files live under `memory/{people,orgs,workstreams,preferences}/*.md`, with YAML frontmatter containing a `facts` sequence. Each fact has the fields above; each source path points to a text file in the same store. The reader never writes either dialect, invents a missing why/quote/date, or translates status into an event. Unmapped metadata (entity name, timestamps other than source origin, status) remains with its container.
