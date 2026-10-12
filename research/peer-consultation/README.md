# Circadian outside peer consultation

**Latest consultation: the completed Behavioral 005 results were delivered to the existing peer, followed by a corrective design discussion about full-model extraction.** Read the [results brief](BEHAVIORAL-005-RESULTS-BRIEF.md), [verbatim advice](PEER-005-REDESIGN.md), [parent follow-up](BEHAVIORAL-005-REDESIGN-FOLLOWUP.md), [peer resolution](PEER-005-REDESIGN-RESOLUTION.md), and [delivery receipt](BEHAVIORAL-005-REDESIGN-RECEIPT.json). The [synthesized extractor study design](../lab/EXTRACTOR-STUDY-DESIGN.md) preserves all six proposals and distinguishes extraction, operation and consumer benefit. No new benchmark or production change was executed in this consultation.

**Earlier deterministic deliverables:** [All six prototypes](../prototypes/README.md), [captured results](../prototypes/results.json), the [verbatim code review](../prototypes/PEER-REVIEW.md), [parent resolution](../prototypes/REVIEW-RESOLUTION.md), and [focused closure](../prototypes/PEER-CLOSURE.md). The code review and closure each have an adjacent request brief and receipt. The combined corrected suite passes 120 tests with 492 assertions; all 93 original case IDs remain mapped, 92 deterministic and R14 deferred behavioral.

The earlier [implementation, usage and test refinements](../refinements/README.md) retain the design rationale and shared comparison protocol. Each original proposal received its own turn in the persistent peer session. The parent then sent the six actual drafts back to resolve specific disagreements and incorporated the useful corrections.

Read the [six-topic brief](SIX-REFINEMENT-BRIEF.md), [six verbatim replies](SIX-REFINEMENT-DISCUSSION.md), [focused follow-up](SIX-REFINEMENT-FOLLOWUP.md), and [peer resolution](PEER-SIX-REFINEMENT-RESOLUTION.md). The [integrated index](../refinements/README.md) records accepted refinements and remaining qualifications; raw replies are preserved unedited. These are proposed designs and cases, not demonstrated improvements.

Earlier material: [two worked examples](../worked-examples/README.md), their [peer assessment](PEER-WORKED-EXAMPLES.md), the [augmentation reassessment](PEER-AUGMENTATION-REASSESSMENT.md), and its [parent qualifications](REASSESSMENT-NOTES.md). They supply history and examples; the six refinement supplements carry the current concrete designs.

**Operator's controlling correction:** Circadian works. This is exclusively an augmentation effort: optional abilities that supplement the working default. Production audits, repairs and validating baseline health are outside the assignment. Prior peer recommendations on those subjects are historical and superseded. All six proposals remain open for discussion. The dossier and brief now carry this scope explicitly; the correction has also been sent into the persistent peer session.

The operator requested an outside colleague to help restore clarity after four research rounds. The parent delivered the dossier, discussed the first reply, delivered the operator's scope correction, and obtained a fresh substantive augmentation assessment in the same persistent conversation. The peer was introduced as an esteemed collaborator, with explicit permission to disagree or replace the framing.

## Read the exchange

Start with the six-proposal exchange linked above. The earlier [reassessment brief](AUGMENTATION-REASSESSMENT-BRIEF.md), [peer response](PEER-AUGMENTATION-REASSESSMENT.md), and [parent's qualifications](REASSESSMENT-NOTES.md) remain available. The earlier exchange below is preserved as history, including the [operator's correction](SCOPE-CORRECTION.md) and the [peer's acknowledgment](PEER-SCOPE-ACKNOWLEDGMENT.md).

1. [Dossier](DOSSIER.md) — product purpose, operator intent, six proposals, four studies, source map, limitations, scope drift and questions.
2. [Peer brief](BRIEF.md) — role, boundaries and completion conditions.
3. [Initial peer response](PEER-RESPONSE.md) — preserved verbatim.
4. [Parent clarification](FOLLOWUP.md) — separates new capabilities from repairing defects and challenges overclaimed safeguards.
5. [Peer clarification](PEER-CLARIFICATION.md) — preserved verbatim; revises the original recommendation.
6. [Parent's assessment](PARENT-NOTES.md) — what changed, remaining disagreements and the continuing pause.
7. [Session receipt](SESSION.json) — verified delivery and model details.

The replies are advice, not authoritative implementation instructions. Read the clarification alongside the initial response because it corrects material claims. The parent's notes retain remaining disagreements.

## Thread and control

- CLI: Claude Code 2.1.296.
- Actual model reported throughout the consultation, including all six refinements and the follow-up: `claude-fable-5-1`.
- Session: `3f7fb1c5-76d4-4306-aca6-3905d4575466`.
- Initial display name: `Circadian peer consultation`; the 005 consultation was launched as `Circadian 005 peer redesign`.
- Initial discussion ran October 10, 2026 at 22:30–22:34 America/Chicago. The fresh reassessment completed at 22:50 (October 11 at 03:50 UTC).
- The parent controlled delivery and the follow-up. No operator copy/paste was needed.
- Only Read, Grep and Glob were exposed. Invocation-local safe mode disabled custom hooks/plugins; no persistent harness configuration was changed. No MCP servers were loaded.
- The native CLI session remains authoritative. Private transport receipts are in `/Users/jrg/Library/Caches/circadian-research/peer-consultation-fuhb0my4/`; no credential was included in the request.

T3's exposed tools did not provide thread creation, so this is a persistent CLI session rather than a new T3 thread. The parent can continue it. To open it yourself with the same read-only tool scope:

```sh
cd /Users/jrg/circadian
claude --resume 3f7fb1c5-76d4-4306-aca6-3905d4575466 \
  --model fable --safe-mode \
  --tools Read,Glob,Grep --allowedTools Read,Glob,Grep \
  --strict-mcp-config --mcp-config '{"mcpServers":{}}' \
  --add-dir /Users/jrg/Library/Caches/circadian-research
```

These are consultation exchanges, separate from behavioral laboratory trials. All six deterministic prototypes have been executed and reviewed; Behavioral 005 subsequently completed its own frozen study. The latest consultation proposes an extractor study without executing it. Production hooks and live integration remain outside this effort. The research remains local and uncommitted.
