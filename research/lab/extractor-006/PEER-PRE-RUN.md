**Verdict: BLOCKED by one trivial fixture correction; otherwise READY.**

I traced every fixture's gold through its own decoder and operation as `prepare` does, checked the preparation packet contents against the question-blind policy, and read the transport, call ceiling and stop paths. The instrument is sound. One leak needs fixing before freeze.

## Material blocker

**06 pair identity leaks the discriminating field into the extractor prompt.** `sourcePacket` sends the whole `caller` object, and both 06 packages carry `pairId: "journal-modality"` and `role: "old" | "candidate"` (`adapters_04_06.ts:237`, `FIXTURES.json:871-873, 992-994`). The extractor is told it is annotating the candidate of a pair named after modality, the one field the paired check tests. The protocol promises the preparer sees only its own text. Minimal correction: rename `pairId` to an opaque value such as `pair-a` in both the TS fixtures and `FIXTURES.json`, and drop `role` from the extractor packet by filtering it in `sourcePacket` for mechanism 06, or accept the role with disclosure. The runner still needs `pairId` and `role`; only the packet changes. This requires re-hashing the reviewed files, which the review mechanism already enforces.

## Corrections recommended before freeze, not blocking

- **Unstated evidence-path rejection.** Every decoder rejects an evidence entry whose path is not a populated claim (`evidenceFor` at `adapters_01_03.ts:22-34`; `evidencePaths` at `adapters_04_06.ts:29-31`). The 04 and 05 instructions say "no quote is required for caller IDs" but never say extra entries are rejected, and the 01–03 envelope says "or more when needed," which invites extra paths. A helpful model adding evidence for `preferences.0.participant` fails decoding, and that failure counts against the 8/8 usable gate. The decoder error is recorded, so it is diagnosable, but one sentence per instruction set would avoid spending the single sample on an instruction mismatch: "Evidence entries for any other path are rejected."
- **FIXTURES.json is not in `REVIEWED_FILES`** (`runner.ts:41`). It is a derived copy of the TS fixtures and matches them on inspection. Either add it to the review hashes or state in the protocol that the TS modules are authoritative and the JSON is a reference export.

## Rubric ambiguities to settle before review

- **cal-01 required #2** ("the initial view omits one supplied record") is answerable only by the structured reader; the plain arm has no view. Mark it structured-only so the plain comparator is not scored on an impossible proposition.
- **cal-04 required** gives both clock time and minutes. Accept either form; the operation emits minutes only, and the reader is not told to convert.
- **cal-04 Pavel "no quiet requirement."** The instruction says a missing preference is null, never false; the gold says false. The source is explicit, so false is right, but this is the likeliest critical-check failure and should be read as the unknown-versus-explicit-negative test it is, not an instrument defect.
- **cal-05 `jointOccasions`** is queried over all three people, so it always returns `participation-unknown` for the occasion because Jules is not a participant. A reader could read that as uncertainty about Mira and Soren too. The recall result carries their roles, so the information is present; the reviewer should not penalize a reader for that phrasing.

## Verified properties

Preparation packets contain sources, caller state, the adapter contract and the task only where the fixture declares one; no question, rubric, gold or checks (`runner.ts:21-30`, manifest `futureQuestionPolicy`). Caller vocabulary is menu-like for 02 and 03, which the fixture notes already disclose. All eight golds pass their own decoders and operations, including the 06 pair through `compareTransformations`, which yields modality fail and byteChange changed with prose unassessed. The reader prompt lets a clearly labelled operation result be cited and tells the reader to distinguish interpretation from calculation, which resolves the handoff concern from 005. Model identity mismatch, HTTP error or missing content stops the run with no retry; dispatch intents are written before the call; the 32-call ceiling is enforced before dispatch; secrets are scrubbed from every artifact including the dispatch log. Unknown, absent and false are kept distinct in 03, 04 and 06 and the instructions say so.

## Limitations to report, not fix

Evidence quotes may be the entire source text, as the gold's are, so "neither reader receives raw sources separately" is true in form only. The 01 structured reader sees both records' claims through the candidate even though the view omitted one, so the case tests coverage reporting, not information hiding. The 02 and 03 extractions select from supplied vocabulary; they do not test alignment or identity discovery. One sample per bundle, structured-then-plain order, and local serving make cost and latency descriptive. Exact-quote presence is checked mechanically; entailment is left to the blinded reviewer, as the protocol states.

## Defects versus hypotheses

Implementation findings: the 06 packet leak, the unstated evidence-path rule, and the unhashed JSON reference. Everything else above is a scientific limitation or a rubric reading, and the predeclared gates are appropriately strict for a readiness diagnosis rather than an accuracy estimate.
