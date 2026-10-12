# Preserved infrastructure failure: 007

The repaired semantic instrument was frozen and started at `2026-10-12T05:06:03.825Z`. Its first study request timed out after 120,002 ms with no HTTP status, content or usage. Zero cases completed. The request is preserved in [calls.jsonl](run-local/calls.jsonl), with [dispatch intent](run-local/dispatch.jsonl) and a [stopped receipt](run-local/stopped.json).

The local service also failed a subsequent discovery request. Inspection found synchronous schema compilation in its request loop; a process sample remained inside the native compiler after client cancellation. The earlier schema-to-regex preflight had not established full tokenizer/FSM compilation performance. The existing registered service was restarted once, with no configuration or package changes, and discovery recovered.

[008](../extractor-008/RESULTS.md) removed only `maxLength` from the serving grammar, retained full local validation, passed a separate live probe and completed the 72-call battery. This failed attempt was neither overwritten nor resumed. Its code, fixtures and original manifest remain frozen and are dependencies of the subsequent diagnostic runs.
