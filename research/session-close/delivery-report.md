# Coordinated views operational delivery

State: accepted and installed on both assigned machines.

## Result

Commit `5df695dfe265a90dfbadbd762b4a912560e34a71` is on local main, origin/main and hive main. Hive is clean. Local pre-existing untracked `research/` was preserved; no other tracked work is outstanding.

Readable enable/disable/status/help and a live read/expand check are available through both CLI entrypoints. Status distinguishes configuration from recorded requests. The live check verifies whole atom and nonempty evidence bytes, bounds, and real eligibility. It writes only an operational receipt, never memory. Empty/missing evidence is INCOMPLETE. Ordinary check calls do not masquerade as agent usage.

Enabled wake sessions carry conditional usage instructions outside memory-as-data blocks. The status strip displays views ON; toggles refresh the existing cache with a five-second bound. Default disabled output remains unchanged. Existing native extension registration and MCP discovery expose both optional tools; calls recheck the live flag. Disabling blocks subsequent calls without requiring a reload.

## Installed verification

- Mac: views ON; live view/expand check PASS; status cache refreshed.
- Hive: views ON; live view/expand check PASS; status cache refreshed.
- Both machines: existing native extension shim imports the updated repository module.
- Both machines: registered the existing MCP server using the native configuration CLI, with the machine's existing absolute runtime/source paths.
- Both machines: fresh native app-server discovery returned all eight Circadian tools, including memory_view and memory_expand, with no discovery error. No thread/model request was made.
- Full Mac regression: 1005 pass, 21 skip, zero failures, 20265 assertions across 83 files.
- Hive focused regression: 33 pass, zero failures, 453 assertions across five files.
- Independent reviewer accepted after the empty-source false-green correction; see review-report.md. Parent read worker/reviewer artifacts and verified real installed state.

## Operational boundaries

Existing sessions must reconnect/reload to acquire newly registered tools and code. CLI access is immediate. No claim is made that every model follows guidance or that a recorded call proves a better answer. Codex MCP registration adds tools; it does not install Codex wake/sleep hooks. Other uninspected harnesses are not certified by this delivery. The enabled flag is per machine. Disabling does not erase context already in a conversation. No model evaluation, inference endpoint, database, timer or always-on service was added.

## Sources acquired in this session

Repository source/tests; both live CLIs; installed native extension shims; native MCP configuration get/add and generated app-server protocol; native app-server discovery on Mac and hive; actual git refs and working tree state; official MCP documentation linked from docs/COORDINATED-VIEWS.md. Evidence and test logs are in this directory; no private memory text or credentials are copied here.
