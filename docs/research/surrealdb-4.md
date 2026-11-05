# SurrealDB 4: recommendation for Circadian

**Verdict: not now for Circadian storage.** SurrealDB is worth evaluating for a new application that genuinely needs graph, vector, document and transactional queries together. It is not evidence of a 10X improvement to this project's memory. Replacing markdown/git would violate the current contract, not merely change an implementation detail. A disposable, local, read-only derived index is the only experiment recommended here; it needs separate authorization.

Research fetched **2026-11-05 UTC**. Baseline: `98f6a936662a2b5fa7e32bc85f80d2a45df8aefa`, especially [`templates/MIND-SPEC.md`](../../templates/MIND-SPEC.md), laws 1, 2, 5 and 7, the ledger and deterministic render. No database was installed, no services started, no migrations or runtime benchmarks run. All performance figures below are vendor claims, not measurements of Circadian.

## What is actually available

The official release index calls **4.0.0**, released **2026-11-03**, latest stable. GitHub's latest-release API independently lists `v4.0.0`, `prerelease: false`, published `2026-11-03T15:22:58Z`. This is a released major version, not merely an announcement or beta. It is also only two days old at this research date: the stable label does not establish operational maturity on our workload. [S1–S3]

| Surface | What the sources establish | Qualification |
| --- | --- | --- |
| Query engine | Release notes describe one bytecode executor, plan caching, parallel scans and spilling large sorts/joins/aggregations to disk. | Results without `ORDER BY` can change order. Deterministic consumers must specify ordering. [S2] |
| Multi-model data | Documents, graph, vectors and relational data share the engine; full-text and vector indexing are documented. | This consolidates stores only where those stores are actually needed. It does not supply Circadian's belief rules. [S1, S2] |
| SQL compatibility | PostgreSQL and MySQL dialects and wire listeners; SQL RPC methods also run over HTTP/WebSocket. | **Official sources conflict:** `/4` says window functions are refused; 4.0.0 release notes demonstrate `rank() OVER (...)` and say window functions work. Treat exact SQL/ORM coverage as unverified until tested, not drop-in compatibility. [S1, S2] |
| MongoDB compatibility | Launch page presents `mql.js 1.0` as a Node-driver API adapter, including aggregation and Mongoose. | It is a client library, not a MongoDB server protocol: the same page excludes mongosh, Compass and other-language drivers. Package execution was not verified. [S1] |
| Local/browser storage | SurrealKV replaces RocksDB/IndexedDB engines; browser persistence uses Origin Private File System. | Embedded removes a separate service, not the database dependency or storage-format lifecycle. [S2] |
| Transactions | Read-only and explicit isolation levels are documented. | Snapshot is default. Serializable is available on memory and SurrealDS, **not SurrealKV**. Do not assume local persistent serializable semantics. [S2] |
| Enterprise distribution | SurrealDS 1.0 uses object storage and disk logs; default two-zone acknowledgement is described. | This is Enterprise/managed-cluster territory, not a free local feature. [S1, S2] |
| Earth | Launch and pricing pages offer serverless databases on Cloudflare, scale-to-zero and paid/free tiers. | Advertised availability, not a provisioned or tested account here. Cold-start and aggregate throughput claims do not establish interactive task latency. [S1, S6] |
| Agent Memory | Official docs describe an **application tier in front of SurrealDB**, with durable records in the DB, provenance, retrieval traces and tri-temporal history. | Separate from the core engine. The documentation notes an ongoing rename from Spectron, with legacy environment/header names retained. Do not conflate core DB installation with a ready Circadian replacement. [S7] |

The launch page's **22X indexed-query** number is explicitly *projected*. Its 7.4X HNSW build claim is a million 768-dimensional vectors on a 64-core server, and its 27 ms to 1.1 ms filtered-search claim is a particular 1% filter benchmark. None measures our laptop, corpus, correctness, development time or agent usefulness. “10+ billion peak rows per second” on Earth is not an individual query latency guarantee. [S1]

## Developer and agent surface

The JavaScript/TypeScript SDK docs identify **2.2.2** as latest and explicitly support SurrealDB 4.0.0. They document remote HTTP/WebSocket connections, embedded engines, authentication, transactions, typed values, live queries and API invocation, and link a Bun starter and SolidJS integration. [S4]

The official JavaScript guide shows the `surrealdb` package with `Surreal`, `connect`, parameter-bound `query(...).collect()`, `RecordId`, and `close`. It also presents optional Surqlize typed schema/query builders and `@surrealdb/pg` / `@surrealdb/mysql` HTTP/WebSocket clients for SQL/ORM use. These are documented interfaces, not APIs exercised in this research. The SQL compatibility conflict above still applies. [S5]

For agents, scoped MCP capabilities and graph-query tracing in 4.0 can make database operations and result paths more inspectable. But an MCP tool is another authority surface: use explicit read-only credentials/capabilities and bounded outputs, not root access. Release notes include fixes for MCP statement injection, permission bypasses and export disclosure; these are reasons to pin and verify the security boundary, not evidence that all risk is gone. [S2]

Agent Memory's provenance and temporal modeling are conceptually useful for a source-backed research application. They do **not** prove a remembered claim true. A stored source relationship is not semantic entailment, and the docs' memory system does not establish parity with Circadian's exact quotes, immutable atom identity, deterministic ledger fold or history erasure. [S7; local contract]

## Deployment, cost and licensing

- **Local self-hosted/embedded:** the licensing FAQ permits ordinary production use and self-hosting under BSL 1.1, subject to its Database Service restriction. Infrastructure, backup, upgrade and recovery work still cost time. No paid plan is needed merely to investigate ordinary local use. [S8, S9]
- **Earth:** fetched pricing lists Free at $0, with 3M requests/month, 10 GB storage and 100 active database hours; it pauses at limits while retaining data. Pro is a **launch price** of $15/month with 10M requests, 25 GB and 1,000 hours; excess meters are $0.65/M requests, $0.25/GB-month and $0.05/hour. This is a dated quote, not a projected Circadian bill or Agent Memory price. [S6]
- **Managed Cloud:** pricing starts at $0.021/node-hour; self-hosted Enterprise is custom-priced. Do not infer a complete bill from the starting node rate. Branching/forking on Earth and Cloud is marked **coming soon**, not an available advantage. [S6]
- **Source available, not unrestricted open source:** the tagged core license explicitly says BSL is not an Open Source license. Its additional grant excludes Database Service offerings where third parties create/manage/control schemas or tables; assess this before a user-configurable hosted platform. SDKs have their own Apache/MIT licensing per the FAQ. [S8, S9]
- **License discrepancy to resolve before adoption:** `v4.0.0/LICENSE` still names the Licensed Work “SurrealDB 3.0” and lists change date `2030-01-01`. Do not silently relabel that file or interpret this as permission beyond its text. Obtain clarification for commercial redistribution/service plans. [S9]
- **Upgrade risk:** 4.0's release notes require explicit opt-in to the one-way 3.x datastore conversion, SDK checks and index rebuild checks. Backup/export and a tested restore path matter; “3.x records remain readable” does not mean rollback is available. [S1, S2]

Cloud/Earth is out of bounds for Circadian's private mind under the present contract: it has no remote, and private user memory never leaves the machine. Local embedded storage would avoid that particular violation but still violate the no-database critical-path rule if made authoritative.

## Does this improve DX, UX or agent work here?

| Lens | Plausible benefit | Current judgment |
| --- | --- | --- |
| Developer | One engine for typed records, relationship traversal, ranked search and transactions; fewer integrations in a new multi-model app. | Circadian already has one authoritative file/git substrate. Adding a database creates schema, synchronization, recovery and version obligations unless it replaces a demonstrated bottleneck. No 10X DX result measured. |
| User | Source/relationship browsing and live result updates could improve a research UI. | No existing user-flow result was measured. Wake must remain file-only, usable offline and after infrastructure failure. Cloud latency or pause-at-limit would be a regression if inserted there. |
| Agent | A single scoped query could return evidence relationships instead of several searches. | More retrieved inventory is not improved memory propagation. Preserve code-owned eligibility, revision checks, exact source spans and deterministic publication. No improvement in answer correctness or task completion measured. |

**Beyond Circadian:** a source-backed research workspace combining documents, assertion edges, semantic search and a live multi-user UI is a plausible fit; so is a geospatial application combining spatial and vector filters. These are proposed use cases, not adopted architecture. Avoid the “one database per agent” framing here: Circadian's durable subject is shared work and its provenance, not a process instance.

## Smallest useful future experiment — not executed or authorized

A bounded experiment becomes worthwhile only when an operator names an evidence-navigation task that the existing file/git path handles poorly.

1. Use a fixed, local, non-private synthetic or explicitly approved corpus with source hashes and known answers. Exclude `USER.md` and production mind writes. Pin DB/SDK versions, engine and settings; use no cloud or model API.
2. Build a disposable derived index for **one** question family: “show a claim, its source spans and its supersession/contradiction neighbors.” Keep markdown/git authoritative and compare against the existing file-based result path on exactly the same corpus. No Agent Memory ingestion/metabolism replacement.
3. Preserve query inputs, expected IDs/spans, source revision hashes, raw outputs and timings. Test source edits, forgotten/superseded atoms, deletion/erase, stale-index rejection, cross-scope access and index rebuild from files. A source hash must be rechecked before returning evidence.
4. Measure cold/warm end-to-end query latency, p95, total setup/rebuild time, storage/RAM, query/tool-call count and operator time to reach the correct source. Include failures, not just successful searches.
5. **Proposed success gate:** exact evidence parity on every fixture, zero unauthorized/stale/erased evidence, no production mind changes, identical normal wake behavior with the index unavailable, and at least 10X improvement in a preselected end-to-end bottleneck including validation overhead. Rebuild and teardown must be demonstrated. These are proposed thresholds, not observed results.
6. **Fail/stop:** any provenance/privacy divergence, an index dependency in wake or writes, no meaningful task improvement, or synchronization/maintenance effort outweighing the saved work. Remove the experiment rather than quietly promote a second source of truth.

Unproven today: Bun embedded-engine behavior on this machine, actual SQL/ORM coverage, recovery/durability under faults, Agent Memory output quality and cost, exact erasure parity, workload performance and any 10X user/agent benefit. Documentation alone cannot close these gates.

## Sources and acquisition notes

All sources below were directly fetched on **2026-11-05 UTC**. No private memory was sent in requests. HTML pages were text-extracted; release notes were also fetched through the site's Markdown representation. Assertions above distinguish vendor documentation from local observation and proposed experiments.

- **S1:** https://surrealdb.com/4 — operator-supplied launch page; capabilities, compatibility limits and qualified benchmark claims.
- **S2:** https://surrealdb.com/releases/4.0 (fetched as https://surrealdb.com/releases/4.0.md) — 4.0.0 release notes, availability, upgrade caveats, engine limitations and security fixes. Use the stable section, not the older beta section.
- **S3:** https://surrealdb.com/releases and https://api.github.com/repos/surrealdb/surrealdb/releases/latest — stable/version/date cross-check; release permalink https://github.com/surrealdb/surrealdb/releases/tag/v4.0.0.
- **S4:** https://surrealdb.com/docs/sdk/javascript — SDK version/support and integration surface, fetched with curl following redirects. An initial Python fetch hit HTTP 308; it was not treated as evidence of missing docs.
- **S5:** https://surrealdb.com/connect/javascript — SDK, SQL drivers, Surqlize and transport examples.
- **S6:** https://surrealdb.com/pricing — plan allowances, rates, limits, Enterprise pricing and coming-soon qualifiers.
- **S7:** https://surrealdb.com/docs/agent-memory — application-tier architecture, provenance/temporal model and rename caveat.
- **S8:** https://surrealdb.com/license — licensing FAQ.
- **S9:** https://raw.githubusercontent.com/surrealdb/surrealdb/v4.0.0/LICENSE — tag-pinned actual license, including its older Licensed Work label.

Research deliverable only. Parent review of citations and recommendation remains independent; no runtime acceptance is claimed.
