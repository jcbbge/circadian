# Independent operational acceptance review

State: accepted within the scope and limits below. The sole blocker was corrected and independently rechecked. Production files were not edited by the verifier.

## Resolved blocker

The original `checkViews` returned PASS when its only cited episode existed but was zero bytes. Root corrected `sourcesMatchFiles` to require truthy `source.content.trim()` as well as equality with the current file. The existing live-check test now covers both zero-byte and whitespace-only sources and expects INCOMPLETE. I inspected the actual predicate and test, then reran the focused live-check test successfully. The false-green blocker is closed. No semantic claim-validation engine was added or required.

Observed reproduction result before correction:

```json
{"check":"PASS","checks":{"viewWithinBudget":true,"expansionWithinBudget":true,"atomMatchesFile":true,"sourcesMatchFiles":true},"coverage":{"inspected":1,"total":1,"eligible":1,"included":1,"omitted":0,"unresolved":0,"complete":true},"sourceCount":1}
```

## Evidence inspected

Read actual changes in both CLI doors, views CLI, operator status/check implementation and tests, shared usage instructions, wake assembly, wake integration, visible status strip, MCP tool list/dispatcher, native extension registration, discovery tests, integration tests, existing view/expansion core, and extension flag implementation. Read the discovery worker's durable report.

Ran `bun test src/views-ops.test.ts src/views-discovery.test.ts src/views-integration.test.ts`: **12 pass, 0 fail, 286 assertions**. This includes real temporary mind files, CLI subprocesses, MCP stdio requests, isolated startup scripts, and captured native registration followed by actual handlers. No live wake, model call, new service, or live mind mutation was performed by this review.

Root's subsequent `ops-tests-final.log` records **7 pass, 0 fail, 137 assertions** across operator and integration tests. I read that artifact and the actual updated source/test files. The added status-cache refresh is restricted to enable/disable, invokes the existing status renderer using the current executable, has a 5-second timeout, suppresses subprocess output, and honors `CIRCADIAN_STATUSLINE_CACHE=off`. It does not invoke wake or inference. The cache tests verify ON appears after enabling and disappears after disabling through both CLI doors. Cache refresh remains a best-effort presentation effect; the config flag and direct status command are authoritative even if the existing cache writer cannot write.

## Bounded acceptance

- Readable ON/OFF controls, machine-readable `--json`, live evidence check, and help are implemented on both installed CLI entrypoints. Disabled checks return code 2, rejected requests code 1, passing checks code 0.
- Status calls read at most the last 64 KiB of activity. Synthetic checks use `cli-extensions` and do not get counted as view/expand usage. The CLI explicitly says configuration and requests do not prove an answer used memory well.
- Disabling blocks already registered tool calls because the dispatcher checks the live flag on every invocation. Discovery is gated independently; malformed config hides optional tools while ordinary tools continue.
- Shared usage instructions give a task trigger, the view-to-expand sequence, coverage interpretation and stale-reference handling. The note is outside remembered data and is included only while enabled. Existing default content remains byte-identical with absent/empty capability text in the tested payload layouts.
- First-line scope, whole-payload preservation and hook output limits hold in the focused cases. Shared guidance is 877 characters for global and 1,025 for the maximum accepted 80-character scope; it fits the established first-part limit.
- Native tool error handling rejects invalid-budget results, identifies partial responses, and rechecks disabled state without requiring reload. Reload/reconnect is correctly required only to discover newly enabled tools.

## Limits

This review proves adapter delivery and actual file operations on isolated fixtures; it does not certify a model's autonomous choice or successful application of memory to an answer. Parent owns current machine registration, deployment and live-reader verification. The operator check selects one eligible global record; it can honestly report INCOMPLETE for a project-only mind or unavailable source without implying the extension is broken.
