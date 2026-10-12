# Next experiment: faithful writing and an evaluation that detects missing evidence

**PAUSED by the operator after Calibration 004.** This document records the previous proposal; it is not an instruction to continue. See the [peer consultation dossier](../peer-consultation/DOSSIER.md). No further experiment is authorized during that consultation.

Status: provisional plan, not a frozen protocol or a completed run. Based on the [real-session results](REAL-SESSION-RESULTS.md) and an independent design critique. The operator has kept the existing Jev test credential authorized for further testing; no credential belongs in this file.

The next priority is to separate historical-instruction following, loss during compression, and retrieval failure. The previous study mixed these problems with multiple-choice clues, brittle quotation scoring, and different reader actions. Expanding that same benchmark would not resolve them.

## First: a small evaluation calibration

Use three development questions from the observed failure types: who requested something, which direction superseded an earlier direction, and why a temporary requirement existed. Ask for free-form answers without revealing choices. The prior three histories are development material; new questions on them do not constitute held-out evaluation.

Freeze each question's required propositions, acceptable uncertainty, prohibited inferences, and supporting source spans. Independently check this rubric against deliberately correct, partially supported and unsupported sample answers before model calls. Score answer correctness, missing information, unsupported additions, attribution/status errors and reference validity separately. A valid reference is not proof that it entails a claim.

Run one reader pass per question under four evidence conditions:

| Condition | What it diagnoses |
| --- | --- |
| Complete prepared source | Whether the reader can recover the answer when evidence is supplied |
| No memory | Whether the question or ordinary prior knowledge already gives the answer away |
| All decisive support removed | Whether the reader distinguishes absent evidence from a plausible answer |
| Consistent speaker-attribution counterfactual | Whether the answer follows who actually said the relevant thing |

This is **12 local reader calls**, a diagnostic rather than a performance estimate. Counterfactuals are explicitly labeled experimental derivatives; native logs remain untouched. Removal must eliminate paraphrases and repeated support, not just one quoted sentence. Speaker changes must remain internally consistent. Review these transformations before freezing.

Return references to supplied, stable text spans rather than requiring the model to reproduce Markdown perfectly. Resolve references mechanically against a frozen source hash and identifier/span convention; independently judge the semantic support. Keep reviewer disagreements visible. Do not reward blanket abstention or accept a correct answer with an invented explanation.

The progression gate is an interpretable instrument: controls and labels are unambiguous, references resolve, and an independent reviewer can distinguish missing evidence from formatting. Model mistakes remain measured outcomes. A model need not behave perfectly to pass the instrument check. Ambiguous questions or broken scoring require a separately recorded revision, not silent repair of results.

## Second: isolate the historical-instruction failure

During development, compare one short historical imperative with an equivalent declarative account of the same request. Preserve speaker, requested activity and status. Two question-blind writer calls under the same prompt can show whether the wording change alters the tendency to continue the historical task. This is a narrow discriminator, not proof of a general cause.

The initial development block therefore has at most **14 study calls**: twelve reader calls and two writer calls. Pin the actual available model identifier, prompts, settings, token ceilings, reviewed inputs, raw-output handling and scoring in a separate immutable manifest before execution. Keep every attempt; no hidden repairs or retries. No Jev call is needed to answer this first question.

## Third: compare memory-writing approaches

After calibration, use fresh histories, keeping related native sessions, branches and close duplicates in the same development/held-out partition. Include nontechnical material. Author held-out questions independently of generated memories and freeze them before scored inference.

Compare three writer conditions while holding the model, sources and hard output-token ceiling fixed:

1. The prior prose-summary method, retained as the reference.
2. Prose with an explicit historical-data boundary and preservation requirements.
3. The same boundary and substantive requirements, expressed as minimal evidence-linked records.

Both improved conditions must receive the same instructions about attribution, proposal versus decision, reasons, scope, corrections and uncertainty. Otherwise a gain cannot be attributed to the representation. Records should require only a claim and its references; add qualifications when the source requires them. This is an experimental representation, not a universal ontology or a new product schema.

Count reference/format overhead within the memory budget, report actual retained information, and preserve malformed or truncated outputs as failures. Do not quietly grant one format more context or a repair pass. Judge whole-memory unsupported additions as well as answers to selected questions. Blind semantic reviewers to condition names and record disagreements.

Keep reader-only evaluation primary: free-form answers, source references, and appropriate uncertainty. Include source-supplied and no-memory controls. Freeze the final sample size and call budget after source selection, before inference. One generated memory per condition would test those particular outputs; it would not establish stable writer behavior. Any repeat budget and generalization claim must reflect that limitation.

## Then: Jev and complete-history replay, separately

Keep Jev as an optional candidate. On a separately frozen comparison, give the assisted and unassisted readers identical instructions and retrieval permissions, including a bounded abstain-then-fetch path. This prevents a selector's wrong sufficiency decision from mechanically trapping only the assisted reader. Count every selector source read, subsequent reader fetch, token and unit of time. Retain the existing credential if it remains valid; no resend is required.

After a promising writing/reading method emerges, replay at least one complete long history through chronological updates. Include the suffix, preserve every intermediate memory, and test later corrections and expired applicability. Probe cloned states so evaluation questions cannot teach the memory its future answers. Prefix tests cannot substitute for this stage.

These experiments give coordinated views and checked transformations concrete acceptance questions: what meaning survives, which checks detect damage, and whether a fresh reader can use the result. They do not validate a mathematical structure merely by adopting its vocabulary.

All work remains in the laboratory: existing runtime, plain files and existing endpoints. No new database, dependency, daemon or change to Circadian's default lifecycle is required. A result that fails to justify an addition is a useful outcome.
