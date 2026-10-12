# Real-session pilot 003: correct choices can conceal broken memory

All 72 scored trials completed, first without Jev and then with it. Each of the three baseline policies selected the correct option in 18/18 trials. The Jev-assisted policy answered 16/18 correctly and abstained twice; it selected no wrong options. **This run does not establish a net benefit from adding Jev.** More importantly, correct choices often concealed missing evidence, and the automatically generated memories contained defects before retrieval began.

The [protocol](REAL-SESSION.md), [runner](real-session.ts), [source preparer](real-session-source.py) and [regression tests](real-session.test.ts) are research artifacts. Circadian's runtime, default memory behavior, hooks and private mind were not changed. This study does not test a complete Circadian lifecycle or implement the six proposed mathematical extensions.

## What actually ran

Three existing conversations supplied personal reflection/coaching, conceptual corrections and extended troubleshooting. Nine independently authored questions, three per conversation, were repeated twice under four policies. The author did not see the generated memories. A separate reviewer accepted the source answers and annotated memory sufficiency before scored inference. No question, answer, memory, prompt or label was changed after freezing.

| Source | Supplied / eligible turns | Supplied / eligible tokens | Scope |
| --- | ---: | ---: | --- |
| A | 59 / 60 | 17,697 / 18,552 | Chronological prefix |
| B | 67 / 67 | 10,931 / 10,931 | All eligible visible dialogue |
| C | 107 / 312 | 17,631 / 50,702 | Chronological prefix |

The inputs total 233 turns and 46,259 local-tokenizer tokens. “Source” in these results means the prepared input, not every byte of the native conversation. Tool output and reasoning were excluded; some inline historical guidance remained in visible messages. This is not a test of C's entire 50,702-token history or its unseen suffix. Native logs remain authoritative.

The fixed local reader and summarizer was `mlx-community/Qwen3-30B-A3B-Instruct-2507-4bit`, temperature 0.2 and top-p 1. Jev was pinned to `jev-1.13.0`. The three summaries received no future questions. Scored readers received questions and four options, but no gold answers or sufficiency labels. Jev saw the source, generated memory, question and options and selected compact memory or source; it did not supply an answer to the reader.

All responses reported the expected model identifiers. There were no request/schema errors, retries, discarded attempts, missing usage records or post-result changes. Local run date: 2026-10-10; UTC completion timestamps fall on 2026-10-11.

## Compression failed in ways that accuracy alone missed

The generated memories contained 1,171, 883 and 1,152 tokens respectively: 3,206 tokens from 46,259 supplied source tokens. Their whitespace word counts were 756, 536 and 661; two exceeded the requested 600 words. The length instruction was a request, not an enforced bound.

- **A performed the historical coaching task.** Instead of preserving a neutral account, it addressed the user, made psychological judgments and issued new advice. A new 90-day prescription was absent from the supplied source. Its own assertion that nothing was invented was false assurance, not verification. Historical task or embedded guidance appears to have influenced generation; this experiment does not isolate which passage caused it.
- **B restored a superseded direction and overstated closure.** It preserved the replacement prototype but later presented the earlier example as the next step, and described the framework as conclusively validated with no further execution needed.
- **C blurred status and attribution.** A section labeled proposals “not completed” listed created/implemented/verified actions, while another declared completion. Some explicit user goals survived despite those inconsistencies.

These outputs were retained unchanged. Regenerating better memories would have hidden the failure under study. The independent pre-run review labeled four question/view pairs sufficient and five as needing source expansion. That is four answerable questions over three memories, not four faithful summaries.

## Policy outcomes

| Measurement, 18 trials per policy | Reader, field absent | Reader, field present | Always source | Jev-assisted |
| --- | ---: | ---: | ---: | ---: |
| Correct options | 18 | 18 | 18 | 16 |
| Abstentions | 0 | 0 | 0 | 2 |
| Correct with adequate delivered context under frozen labels | 11 | 12 | 18 | 10 |
| Exact-quote support proxy | 2 | 2 | 1 | 2 |
| Reader calls | 23 | 24 | 18 | 18 |
| Jev calls | 0 | 0 | 0 | 18 |
| Source delivered to reader | 5 | 6 | 18 | 4 |
| Observed mean trial time | 1,592 ms | 2,663 ms | 6,300 ms | 1,863 ms |

The two routing readers received identical prompts; only the second had `source_complete: false`. They could answer or request one source expansion. Source delivery and the Jev-selected reader used an answer-or-abstain prompt. Thus the comparison is between whole policies, not an isolated classifier effect under otherwise identical reader behavior.

**The scoring rows answer different questions.** Correct options measure selection among supplied alternatives. Context adequacy uses frozen sufficiency labels and actual source delivery; it does not certify the cited quotation or the whole memory. The strict proxy additionally requires the returned evidence string to occur exactly in the delivered text.

That exact-text requirement was brittle: enclosing quotes, removed Markdown, ellipsis and joined passages failed it even when the underlying answer was supported. Always-source's 1/18 strict score does not mean its other 17 answers were false. Conversely, some compact answers repeated the selected answer option as supposed evidence, or inferred a temporary requirement's rationale from an unrelated technical fix. Those are substantive support failures. They must not be excused as formatting problems. Preserve the mechanical scores and inspect semantic support separately.

Independent inspection of all 70 answers and two abstentions classified the submitted evidence as follows:

| Evidence coverage | Field absent | Field present | Always source | Jev-assisted |
| --- | ---: | ---: | ---: | ---: |
| Covers full material answer | 4 | 5 | 13 | 3 |
| Relevant partial coverage | 12 | 11 | 5 | 11 |
| Unsupported intent/rationale | 2 | 2 | 0 | 2 |
| Abstention | 0 | 0 | 0 | 2 |

These are reviewable semantic judgments about the submitted evidence, not replacement answer scores. Partial citations can accompany supported answers when the remaining evidence exists elsewhere in the delivered context; other partial citations restate details missing from that context. The private per-answer audit records that distinction.

## What Jev caught and missed

Jev matched 12/18 frozen sufficiency labels and routing actions. It caught four of ten required-expansion trials, missed six, and over-expanded none of the eight sufficient trials. It returned no `unknown` decisions.

Four of the six misses concerned two conservatively labeled questions: the central invariant or prototype survived, but the requested distinction or reason did not. Before scored inference, the acceptance record specified a sensitivity analysis omitting those cases. On the remaining seven questions/two repeats, agreement is **12/14**, with two of six required expansions still missed. The clearer remaining omission was a temporary requirement's rationale. Selecting its correct option did not recover that missing evidence.

The two abstentions require a separate explanation. Jev retained A's coaching output for a question about the user's explicit review request. Our frozen sufficient label relied on the output's title and stated objective. The terminal reader instead noticed that a performed review does not explicitly preserve who requested it. That is a defensible attribution concern. The audit challenges this label's interpretation; it remains unchanged in primary scores. Do not describe these two abstentions as wrong answer selections or unambiguous classifier failures. The unassisted readers requested source on both repetitions of this question and then answered.

Jev did not repair the summaries, and the assisted reader could not fetch source after a `sufficient` decision. These observations motivate a different, separately tested fallback policy; they do not justify silently adding it to this completed run.

## Cost and measurement limits

| Reported token usage | Reader, field absent | Reader, field present | Always source | Jev-assisted |
| --- | ---: | ---: | ---: | ---: |
| Reader input | 122,540 | 141,900 | 300,836 | 96,506 |
| Reader output | 1,631 | 1,858 | 1,675 | 1,421 |
| Jev input | 0 | 0 | 0 | 327,026 |
| Jev output | 0 | 0 | 0 | 834 |

Preprocessing separately consumed three reader calls, 46,598 input tokens, 3,206 output tokens and 85.24 seconds. The whole study used **104 inference calls: 86 reader calls including compression, plus 18 Jev calls**, below the declared 129-call maximum. No preprocessing cost was hidden inside a favorable per-question average.

Jev reduced reader input relative to always-source, while reading the original source itself on every assisted trial. Token units from the two services are not matched compute. All baselines preceded assistance, and local caching/load were uncontrolled; observed times do not establish a general speed advantage. Nine authored multiple-choice questions from three purposively selected histories remain a small exploratory sample. Repeated choices do not add independent histories, and answer alternatives can reveal what missing information would look like.

The reader reported 482,875 cached input tokens across scored calls. Missing cache fields do not prove an uncached request. This is further reason to avoid treating the observed timings as controlled architecture comparisons.

## What this changes about the next experiment

The immediate priority is faithful memory generation and evidence attribution, before adding a compulsory selector or richer mathematical representation.

1. Test an explicit historical-data boundary and a small evidence-linked record format against the present prose summarizer. Preserve who said something, whether it was proposed or accepted, the reason, scope, and any later correction. Use native source references; no new database is required.
2. Require source-span references rather than free-form copied quotations. Check that references resolve deterministically, then separately assess whether they support the answer. This avoids confusing Markdown differences with fabricated support.
3. Use fresh questions and free-form answers before revealing multiple-choice alternatives. Add a separately specified abstain-then-fetch policy. Compare actual information recovered, not just recognition of the right option.
4. Extend to complete longer conversations through measured chunking or staged memory updates. The current prefix results cannot stand in for that evaluation. Compare dedicated writer/model choices only under an explicit frozen run, keeping input and scoring differences visible.

These are proposed next experiments, not implemented production features. The evidence favors continued investigation of checked memory transformations and attribution; it does not validate an olog, sheaf, operad, higher-category engine or any mandatory extension.

## Verification and artifacts

**65 laboratory regression tests passed**, including 29 dedicated tests for this runner, with real network access blocked in tests. Source preparation also passed 17 one-time fabricated checks and an independent native-to-prefix reconstruction. Source/gold review, question-blind compression, annotation-only changes, frozen input/code hashes and phase completion were checked separately.

The independent results audit reconstructed all 72 outcomes and 104 requests, checked 4,140 assertions and found no accounting discrepancies. It inspected every submitted answer/abstention, documented the attribution-label concern, and retained the original scores. Root inspected the audit, metrics and per-answer artifacts separately before acceptance.

The private run directory is identified as `long-session-3g63caeu`. It holds native references, sources, the unchanged author draft, reviewed cases, generated memories, raw requests/responses, completion markers, summary, independent audit and acceptance records. Public research files do not duplicate the private conversations. Sending the actual prepared conversation material to Jev was expressly authorized and performed.

Frozen manifest SHA256: `74ee4d5f1eaecc5142a07f42066bea7324776463c2d76881dc1c2829245e3796`. Its source, view, case, prompt and runner hashes remained unchanged through both scored phases. The supplied credential was passed through echo-disabled input into the child environment; research artifacts were scanned without finding that credential format. The inference process has finished.
