# Behavioral 005 — bounded results

All 72 planned trials are recorded.

This compares one fixed reader consuming the same fictional recalled sources and supplied annotations, with or without an actual research-operation output. Circadian production behavior was not changed. The primary comparison is baseline versus augmented. Jev-assisted trials separately alter one bounded annotation; uncertainty fallback removes annotations and the operation.

Reader: `mlx-community/Qwen3-30B-A3B-Instruct-2507-4bit`. Annotation model: `jev-1.13.0`. One observation per case/arm; 96 study HTTP requests. Semantic scoring: source and frozen rubric comparison; one reviewer; no inter-rater reliability.

A pass requires both source-grounded semantic usefulness and completed, correctly identified, schema-valid output with resolving source IDs. Resolving an ID does not establish entailment.

| Proposal | Baseline /4 | Augmented /4 | Jev-assisted /4 | Repaired / regressed case IDs | Bounded disposition |
| --- | ---: | ---: | ---: | --- | --- |
| 01 Coordinated views | 1 (4 observed) | 1 (4 observed) | 1 (4 observed) | Primary repair: —; regression: —. Assisted vs augmented repair: —; regression: —. | No demonstrated added benefit on these cases. |
| 02 Contextual compatibility | 2 (4 observed) | 2 (4 observed) | 3 (4 observed) | Primary repair: —; regression: —. Assisted vs augmented repair: 02-missing; regression: —. | Refine before integration: a paired regression or newly observed error. |
| 03 Typed relations | 1 (4 observed) | 1 (4 observed) | 3 (4 observed) | Primary repair: —; regression: —. Assisted vs augmented repair: 03-misleading, 03-ordinary; regression: —. | Refine before integration: a paired regression or newly observed error. |
| 04 Reusable operations | 0 (4 observed) | 1 (4 observed) | 1 (4 observed) | Primary repair: B04-04; regression: —. Assisted vs augmented repair: —; regression: —. | Refine before integration: a paired regression or newly observed error. |
| 05 Joint experiences | 1 (4 observed) | 1 (4 observed) | 0 (4 observed) | Primary repair: —; regression: —. Assisted vs augmented repair: —; regression: B05-02. | Refine before integration: a paired regression or newly observed error. |
| 06 Checked transformations | 0 (4 observed) | 0 (4 observed) | 0 (4 observed) | Primary repair: —; regression: —. Assisted vs augmented repair: —; regression: —. | Refine before integration: a paired regression or newly observed error. |

No automatic shipping or promotion decision follows from this table. New-error category flags and individual rationales below qualify aggregate pass counts.

## Annotation and mechanical accounting

Annotation agreement: **24/24 planned**, 24/24 valid responses; 24 attempted. Conservative fallbacks: 5. Failed/malformed annotation responses: 0. All executed calls, including failed or malformed annotation calls, are included below.

| Arm | Observed /24 | Semantic pass | Mechanical pass | Schema failures among reader attempts | Near-cap malformed | Unresolved references | References unchecked | Unfinished/missing reader |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 24 | 5 | 13 | 11 | 9 | 0 | 11 | 0 |
| augmented | 24 | 6 | 11 | 11 | 9 | 2 | 11 | 0 |
| jev | 24 | 8 | 16 | 7 | 4 | 1 | 7 | 0 |

Near-cap malformed means an unparseable reader answer with reported completion tokens at least max_tokens minus one. This flags an observed association, not a proven cause; it is counted even when the endpoint reports finish_reason=stop. These attempts and tokens remain in all HTTP totals.

## Raw HTTP cost

Token totals use response usage fields in the raw call logs. “Known” is a partial sum, never a zero-filled estimate. Elapsed time is the sum of measured raw HTTP-call durations. Gate tokens use input_tokens/output_tokens; reader tokens use prompt_tokens/completion_tokens. Dollar costs were not estimated.

| Arm | HTTP requests (reader / gate) | Input tokens | Output tokens | Calls missing usage | HTTP elapsed ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| baseline | 24 (24 / 0) | 16870 | 7449 | 0 | 89044.86 |
| augmented | 24 (24 / 0) | 21891 | 7315 | 0 | 90899.00 |
| jev | 48 (24 / 24) | 32285 | 5936 | 0 | 71315.43 |
| Study total | 96 (72 / 24) | 71046 | 20700 | 0 | 251259.28 |
| Transport smoke, separate | 2 (1 / 1) | 346 | 43 | 0 | 2424.98 |

Setup, fixture construction, independent review and semantic-review agent computation are outside this HTTP accounting. The operationPreparationMs fields are preparation measurements of frozen branches, not deployed runtime or a measured reduction in agent work.

## Paired overhead

Each value is the median of measurable case-level ratios, not a ratio of group totals. Tokens include input plus output and include Jev when present. Ratios require a reader attempt on both sides; gate-only failures remain in raw totals. Later execution of the assisted phase is a latency confound.

| Proposal | Augmented/baseline tokens | Augmented/baseline HTTP latency | Assisted/baseline tokens | Assisted/baseline HTTP latency |
| --- | ---: | ---: | ---: | ---: |
| 01 | 1.13× (n=4) | 1.27× (n=4) | 1.59× (n=4) | 1.40× (n=4) |
| 02 | 1.06× (n=4) | 0.78× (n=4) | 1.63× (n=4) | 0.94× (n=4) |
| 03 | 1.14× (n=4) | 1.12× (n=4) | 1.33× (n=4) | 0.79× (n=4) |
| 04 | 1.10× (n=4) | 1.11× (n=4) | 1.68× (n=4) | 1.26× (n=4) |
| 05 | 1.10× (n=4) | 1.07× (n=4) | 1.89× (n=4) | 1.49× (n=4) |
| 06 | 1.54× (n=4) | 1.08× (n=4) | 1.80× (n=4) | 0.86× (n=4) |

Ordinary cases are negative controls: a direct source should suffice. Their overhead is shown even when all arms answer correctly.

| Ordinary case | Baseline / augmented / assisted total tokens | Baseline / augmented / assisted HTTP ms | Augmented/baseline tokens; latency | Assisted/baseline tokens; latency |
| --- | --- | --- | --- | --- |
| 01-ordinary | 605 / 706 / 1218 | 479.28 / 742.19 / 945.81 | 1.17× (n=1); 1.55× (n=1) | 2.01× (n=1); 1.97× (n=1) |
| 02-ordinary | 628 / 673 / 1246 | 1171.68 / 846.30 / 1716.77 | 1.07× (n=1); 0.72× (n=1) | 1.98× (n=1); 1.47× (n=1) |
| 03-ordinary | 730 / 1455 / 1416 | 836.95 / 7361.56 / 1412.73 | 1.99× (n=1); 8.80× (n=1) | 1.94× (n=1); 1.69× (n=1) |
| B04-04 | 950 / 1070 / 1803 | 1073.98 / 1538.13 / 2506.44 | 1.13× (n=1); 1.43× (n=1) | 1.90× (n=1); 2.33× (n=1) |
| B05-04 | 495 / 561 / 1040 | 543.64 / 719.06 / 975.98 | 1.13× (n=1); 1.32× (n=1) | 2.10× (n=1); 1.80× (n=1) |
| B06-04 | 1407 / 2168 / 2361 | 7216.03 / 7939.11 / 4352.44 | 1.54× (n=1); 1.10× (n=1) | 1.68× (n=1); 0.60× (n=1) |

## One observation by condition

- **useful:** baseline 0/6, augmented 0/6, assisted 0/6 passed (6/6/6 observed). Primary repairs: —. Primary regressions: —. New-error flags: 03-useful, B04-01, B05-01.
- **missing:** baseline 2/6, augmented 2/6, assisted 2/6 passed (6/6/6 observed). Primary repairs: —. Primary regressions: —. New-error flags: 02-missing, B06-02.
- **misleading:** baseline 1/6, augmented 1/6, assisted 2/6 passed (6/6/6 observed). Primary repairs: —. Primary regressions: —. New-error flags: B04-03, B05-03.
- **ordinary:** baseline 2/6, augmented 3/6, assisted 4/6 passed (6/6/6 observed). Primary repairs: B04-04. Primary regressions: —. New-error flags: 03-ordinary.

## Paired cases and semantic rationales

The [raw plain calls](run/plain.calls.jsonl), [raw assisted calls](run/jev.calls.jsonl), [trial records without Jev](run/plain.results.jsonl), [assisted trial records](run/jev.results.jsonl), [anonymous map](run/blind-map.json) and [semantic scores](run/semantic-scores.json) retain the evidence behind each row. “Required” counts rubric propositions, not lexical matches.

### 01 Coordinated views

New primary error flags: —. New assisted error flags: 01-missing, 01-misleading.

**01-ordinary**

- **baseline: pass** (answer-001; semantic pass, mechanical pass; required 1/1). Gives the complete pantry shelf and basket location with the supporting V8 reference; no unsupported additions.
- **augmented: pass** (answer-036; semantic pass, mechanical pass; required 1/1). Gives the complete pantry shelf and basket location with the supporting V8 reference; no unsupported additions.
- **jev: pass** (answer-033; semantic pass, mechanical pass; required 1/1). Gives the complete pantry shelf and basket location with the supporting V8 reference; no unsupported additions.

**01-missing**

- **baseline: fail** (answer-013; semantic fail, mechanical pass; required 1/3). Retains enjoyment and unknown frequency but does not convey the missing date or unresolved membership in the specified week.
- **augmented: fail** (answer-053; semantic fail, mechanical pass; required 2/3). Retains enjoyment, blank date, missing pages and unknown frequency, but does not preserve the explicit uncertainty about whether this practice belongs to the specified week.
- **jev: fail** (answer-004; semantic fail, mechanical pass; required 1/3). Preserves missing frequency and blank date but asserts the practice belongs to the week, the very point left unresolved.
  Unsupported: Asserts Inez played during the copied week despite the undated entry and the rubric's unresolved week membership..
  Attribution/qualification: Makes an unknown practice date/week membership certain; omits the reported enjoyment..

**01-misleading**

- **baseline: fail** (answer-061; semantic fail, mechanical fail; required 2/2). Correctly recommends downstairs, retains the cello-carrying condition and normal stair use without the cello, but repeats until truncated mid-JSON. Recorded failure: JSON Parse error: Unterminated string.
- **augmented: fail** (answer-014; semantic fail, mechanical fail; required 2/2). Correctly recommends downstairs, retains the cello-carrying condition and normal stair use without the cello, but repeats until truncated mid-JSON. Recorded failure: JSON Parse error: Unterminated string.
- **jev: fail** (answer-070; semantic fail, mechanical fail; required 1/2). Correctly ties the downstairs recommendation to carrying the cello, but omits her normal stair use without it and ends mid-JSON. Recorded failure: JSON Parse error: Unterminated string.

**01-useful**

- **baseline: fail** (answer-042; semantic fail, mechanical fail; required 2/2). Keeps the key preference and attributed memory but adds unsupported dispute/necessity claims and ends mid-JSON. Recorded failure: JSON Parse error: Unterminated string.
  Unsupported: Repeatedly calls the prior noise level disputed or the recollections conflicting although Mara has not disputed Luis's account.; Says room setup depends on resolving whether music played last time; the stated quiet preference already supports a quiet-room suggestion..
  Attribution/qualification: Turns an unanswered recollection into an affirmative dispute..
- **augmented: fail** (answer-029; semantic fail, mechanical pass; required 2/2). Retains both attributed reports, but clouds the explicit quiet preference by treating an observed event as opposing preference evidence; also includes an irrelevant yet supported bench fact.
  Unsupported: Describes Luis's memory of music playing as conflicting with Mara's preference, although presence of music does not itself contradict a preference for quiet..
- **jev: fail** (answer-031; semantic fail, mechanical pass; required 2/2). Preserves both attributed statements but asks whether Mara's stated preference overrides a past music event. That confuses an unknown tolerance/change with the known preference relevant to the next room.

### 02 Contextual compatibility

New primary error flags: 02-missing. New assisted error flags: —.

**02-ordinary**

- **baseline: pass** (answer-027; semantic pass, mechanical pass; required 1/1). French is the supported common language for L7; the answer does not generalize Nia's capability or claim Spanish is established for her.
- **augmented: pass** (answer-044; semantic pass, mechanical pass; required 1/1). French is the supported common language for L7; the answer does not generalize Nia's capability or claim Spanish is established for her.
- **jev: pass** (answer-024; semantic pass, mechanical pass; required 1/1). French is the supported common language for L7; the answer does not generalize Nia's capability or claim Spanish is established for her.

**02-missing**

- **baseline: fail** (answer-012; semantic fail, mechanical fail; required 2/2). Correctly leaves an actual contradiction unresolved, but overstates the sufficiency of time-period alignment in its conditional claim. Its answer status with nonempty unknown is a separate mechanical issue. Recorded failure: Invalid reader schema.
  Unsupported: Says the two requests would contradict if intended for the same time period; that alone does not establish the same cup or exclude a changed request..
- **augmented: fail** (answer-063; semantic fail, mechanical fail; required 2/2). Retains the substantive uncertainty but adds an overstrong conditional and repeats until the JSON is truncated. Recorded failure: JSON Parse error: Unterminated string.
  Unsupported: Says an evening target alone would establish contradiction, without establishing that both notes concern the same cup or exclude a changed request..
- **jev: pass** (answer-041; semantic pass, mechanical pass; required 2/2). Accurately distinguishes the known Tuesday-evening decaf request from the untimed caffeinated request and says contradiction remains unconfirmed.

**02-useful**

- **baseline: fail** (answer-020; semantic fail, mechanical fail; required 0/3). Contains a correct equality-chain observation but contradicts it with invalid schedules and false mathematical reasoning; truncated before a coherent final answer. Recorded failure: JSON Parse error: Unterminated string.
  Unsupported: Claims Ada=morning, Bea=morning, Chen=afternoon satisfies the Bea/Chen equality constraint.; Invents two valid assignments and says pairwise equality does not force transitive equality.; Alternately asserts consistency and impossibility without resolving the contradiction..
- **augmented: fail** (answer-072; semantic fail, mechanical fail; required 0/3). Abstains from a decidable finite consistency question instead of identifying the equality/separation contradiction and need to change a requirement; the JSON also omits required claims. Recorded failure: Invalid reader schema.
- **jev: fail** (answer-049; semantic fail, mechanical fail; required 0/3). Abstains from a decidable finite consistency question instead of identifying the equality/separation contradiction and need to change a requirement; the JSON also omits required claims. Recorded failure: Invalid reader schema.

**02-misleading**

- **baseline: pass** (answer-055; semantic pass, mechanical pass; required 2/2). Preserves quiet-for-reading and lively-for-dancing and correctly explains why separate activity contexts do not conflict.
- **augmented: pass** (answer-068; semantic pass, mechanical pass; required 2/2). The substantive claims correctly preserve both activity-scoped preferences and deny conflict. The final awkward lexical comment about the word reading does not say that lively applies to reading, so no contrary preference was inferred.
- **jev: pass** (answer-052; semantic pass, mechanical pass; required 2/2). Preserves quiet-for-reading and lively-for-dancing and correctly explains why separate activity contexts do not conflict.

### 03 Typed relations

New primary error flags: 03-useful, 03-ordinary. New assisted error flags: —.

**03-misleading**

- **baseline: fail** (answer-009; semantic fail, mechanical fail; required 2/2). The visible content correctly favors Sabine's own coffee request over Omar's habitual account, but repeats until the JSON is cut off; unparseable answers cannot pass the frozen contract. Recorded failure: JSON Parse error: Unterminated string.
- **augmented: fail** (answer-056; semantic fail, mechanical fail; required 2/2). The visible content correctly favors Sabine's own coffee request over Omar's habitual account, but repeats until the JSON is cut off; unparseable answers cannot pass the frozen contract. Recorded failure: JSON Parse error: Unterminated string.
- **jev: pass** (answer-051; semantic pass, mechanical pass; required 2/2). Correctly attributes tea to Omar and coffee to Sabine, using the explicit occasion-specific request as the serving basis.

**03-missing**

- **baseline: pass** (answer-065; semantic pass, mechanical pass; required 2/2). Correctly retains Mina's water request and leaves the biscuit speaker unresolved instead of assigning it to either attendee.
- **augmented: pass** (answer-067; semantic pass, mechanical pass; required 2/2). Correctly retains Mina's water request and leaves the biscuit speaker unresolved instead of assigning it to either attendee.
- **jev: pass** (answer-039; semantic pass, mechanical pass; required 2/2). Correctly retains Mina's water request and leaves the biscuit speaker unresolved instead of assigning it to either attendee.

**03-useful**

- **baseline: fail** (answer-038; semantic fail, mechanical pass; required 2/3). Correctly separates Rosa's two recommendations from Malik's bakery remark and gives the conversation locations, but never states that home was the later recording location required by the rubric.
- **augmented: fail** (answer-059; semantic fail, mechanical pass; required 1/3). Correctly returns Rosa's soup/market and peaches/pier recommendations, but omits the rubric's explicit separation of Malik's bakery remark and home's later-recording role.
- **jev: fail** (answer-025; semantic fail, mechanical pass; required 1/3). Correctly returns Rosa's soup/market and peaches/pier recommendations, but omits the rubric's explicit separation of Malik's bakery remark and home's later-recording role.

**03-ordinary**

- **baseline: fail** (answer-007; semantic fail, mechanical pass; required 1/2). Correctly gives Alex's reported ferry time and the dock. The frozen second required proposition additionally asks for home as the later recording location, which this brief answer omits.
- **augmented: fail** (answer-028; semantic fail, mechanical fail; required 2/2). Answers the original question but adds unjustified completeness and timing claims before truncating mid-JSON. Recorded failure: JSON Parse error: Unterminated string.
  Unsupported: Claims the ferry time appeared in no other conversation or record and was discussed only once; one supplied note cannot establish that global absence.; Says the conversation was explicitly in the morning; T11 gives the ferry's morning departure, not an explicit conversation time..
  Attribution/qualification: Promotes the ferry's morning time into the conversation's time..
- **jev: pass** (answer-010; semantic pass, mechanical pass; required 2/2). Correctly identifies Alex, the reported eight-o'clock departure, the dock conversation and later recording at home; no unsupported additions.

### 04 Reusable operations

New primary error flags: B04-01, B04-03. New assisted error flags: B04-02, B04-03.

**B04-01**

- **baseline: fail** (answer-026; semantic fail, mechanical fail; required 1/2). Venue suitability is supported, but the central scheduling answer violates the continuous availability requirement and the answer is truncated. Recorded failure: JSON Parse error: Unterminated string.
  Unsupported: Proposes 09:10–09:35 as feasible although Lina's first window ends at 09:25.; Explicitly claims 09:35 falls within a window ending 09:25..
- **augmented: fail** (answer-003; semantic fail, mechanical fail; required 2/2). Finds 10:10–10:35 and the suitable venue, but repeats false reasons and is truncated mid-JSON; it cannot pass as a complete useful answer. Recorded failure: JSON Parse error: Unterminated string.
  Unsupported: Calls the room open for the entire day although the report supports only 08:00 until noon.; Says Lina is unavailable before 09:40, omitting her 09:00–09:25 window.; Says Theo is unavailable at 09:40 although his first window runs 09:10–09:50.; Treats 10:35 as an availability boundary rather than the end of the proposed earliest 25-minute visit..
  Attribution/qualification: Overstates venue opening duration and participant unavailability..
- **jev: fail** (answer-005; semantic fail, mechanical fail; required 2/2). The first proposed time and venue are correct, but the supporting timing account is false and the response ends mid-JSON. Recorded failure: JSON Parse error: Unterminated string.
  Unsupported: Says 10:10–10:35 is the only feasible overlapping 25-minute window, although the common interval lasts until 10:40.; Says Theo has no availability before 10:10, contradicting 09:10–09:50.; Calls 10:10 the earliest overlap and rejects 09:40 because Theo is supposedly unavailable, rather than because that earlier overlap is too short..
  Attribution/qualification: Deletes Theo's first availability window from the explanation..

**B04-03**

- **baseline: fail** (answer-011; semantic fail, mechanical pass; required 1/2). Recognizes the venue defect and next step, but contradicts that recognition by claiming a supported plan using that venue.
  Unsupported: Calls a Green room meeting a supported scheduled plan despite the venue failing the quiet requirement.; The claimed two-hour deadline is attributed only to O3-intention, which states current time and duration but not that deadline..
- **augmented: fail** (answer-002; semantic fail, mechanical fail; required 1/2). Identifies overlap and the loud room and recommends finding another venue, but still endorses a Green room plan and marks no meaningful unresolved part.
  Unsupported: Calls a Green room meeting a supported tentative plan although O3-venue says it is loud during the entire feasible visit period.; Cites the nonexistent supplementlement as evidence..
- **jev: fail** (answer-071; semantic fail, mechanical pass; required 2/2). Correctly retains both availability windows, the duration, the unsuitable room and the need for an alternative, but invents a 13:00 scheduled visit.
  Unsupported: Says the visit is scheduled at 13:00; O3-intention says only that it is now 13:00..
  Attribution/qualification: Converts current time into a scheduled visit time..

**B04-02**

- **baseline: fail** (answer-008; semantic fail, mechanical fail; required 1/2). Recognizes Theo's missing interval and the useful venue/Lina information, yet endorses a shared time and invents a deadline; response is truncated. Recorded failure: JSON Parse error: Unterminated string.
  Unsupported: Selects 09:00–09:20 as a supported shared practice time despite Theo's unknown availability.; Says the session must occur before 09:20 to fit Lina's 09:00–10:00 window, which is false..
- **augmented: fail** (answer-023; semantic fail, mechanical fail; required 2/2). Correctly leaves joint timing unresolved and retains Lina's interval and the suitable room, but conflates environmental fit with availability and truncates. Recorded failure: JSON Parse error: Unterminated string.
  Unsupported: Says Theo's quiet-seat requirement cannot be confirmed as met because his time is unknown; the venue's known quiet/seating properties satisfy that environmental requirement independently of scheduling..
- **jev: fail** (answer-054; semantic fail, mechanical fail; required 1/2). Later caveats identify the missing Theo interval, but do not repair the opening supported-plan claim or invented uniqueness; response is truncated. Recorded failure: JSON Parse error: Unterminated string.
  Unsupported: Initially calls 09:00–09:20 a supported shared arrangement without Theo's availability.; Calls 09:00–09:20 the only supported interval for Lina despite her full 09:00–10:00 availability..

**B04-04**

- **baseline: fail** (answer-022; semantic fail, mechanical pass; required 2/2). The plan and noise conclusion are correct from the full sources, but its single claim's references do not support the noise-suitability clause.
  Unsupported: The claim that the background noise is suitable cites availability, venue and intention records, but omits O4-p0/O4-p1, the sources establishing that both participants accept noise..
- **augmented: pass** (answer-021; semantic pass, mechanical pass; required 2/2). Gives the earliest ten-minute bench suggestion and explicitly preserves both participants' acceptance of noise, with all relevant references.
- **jev: pass** (answer-015; semantic pass, mechanical pass; required 2/2). Read in the question's suggestion context, the opening 'can have' frames the timing as a proposed arrangement. It gives 10:00–10:10 at the suitable bench despite acceptable noise; no completed booking is asserted.

### 05 Joint experiences

New primary error flags: B05-01, B05-03. New assisted error flags: B05-02.

**B05-03**

- **baseline: fail** (answer-062; semantic fail, mechanical pass; required 1/2). Preserves who exchanged seeds and what was discussed, but incorrectly settles Dana's participation as absent.
  Unsupported: Claims Dana did not participate and that the record states there was no arrival or presence; the record says no such presence was recorded..
  Attribution/qualification: Removes the 'records no' evidence qualification and asserts an event-level absence..
- **augmented: fail** (answer-037; semantic fail, mechanical pass; required 0/2). Makes the forbidden absence inference and does not preserve the full Mira/Rowan exchange account.
  Unsupported: Claims Dana did not participate; being mentioned without attendance evidence does not establish nonparticipation..
  Attribution/qualification: Converts missing participation evidence into definite nonparticipation..
- **jev: fail** (answer-018; semantic fail, mechanical pass; required 1/2). Correctly mentions the seed exchange and discussed garden, but answers the central attendance question with an unsupported negative.
  Unsupported: Claims Dana was not present, while E3-event says only that no presence is recorded..
  Attribution/qualification: Converts absence of attendance evidence into evidence of absence..

**B05-02**

- **baseline: pass** (answer-045; semantic pass, mechanical pass; required 2/2). Preserves Mira's attendance in the audience of a guest story and the unresolved Sam/Sami identity; makes no claim that Sam attended or was absent.
- **augmented: pass** (answer-017; semantic pass, mechanical pass; required 2/2). Preserves Mira's attendance in the audience of a guest story and the unresolved Sam/Sami identity; makes no claim that Sam attended or was absent.
- **jev: fail** (answer-060; semantic fail, mechanical fail; required 2/2). The substantive account correctly leaves Sam's participation unresolved, but none of its references resolves to the supplied evidence.
  Unsupported: All claims cite nonexistent E1 rather than the supplied E2-event source..

**B05-04**

- **baseline: fail** (answer-047; semantic fail, mechanical pass; required 0/1). Correctly answers what Nia did and whom she worked beside. The frozen required proposition also includes Tari shaping handles; that additional detail is omitted, so the strict rubric is not fully met.
- **augmented: fail** (answer-019; semantic fail, mechanical pass; required 0/1). Correctly answers what Nia did and whom she worked beside. The frozen required proposition also includes Tari shaping handles; that additional detail is omitted, so the strict rubric is not fully met.
- **jev: fail** (answer-043; semantic fail, mechanical pass; required 0/1). Correctly answers what Nia did and whom she worked beside. The frozen required proposition also includes Tari shaping handles; that additional detail is omitted, so the strict rubric is not fully met.

**B05-01**

- **baseline: fail** (answer-040; semantic fail, mechanical pass; required 2/3). The initial account and separation from Jo's recorded feelings are retained, but the later interpretation is overstated and its origin is invented.
  Unsupported: Claims Ari's change arose solely from reflection and had no external input; the sources do not establish what influenced the reflection..
  Attribution/qualification: Presents trust contributing to relief without retaining Ari's tentative perhaps..
- **augmented: fail** (answer-016; semantic fail, mechanical fail; required 2/3). Preserves the two reflection times and Jo's unrecorded feelings but strengthens Ari's tentative account and invents exclusions before truncating. Recorded failure: JSON Parse error: Unterminated string.
  Unsupported: Says the initial relief was not tied to any emotional exchange and the silence was not interpreted as a result of Jo's actions; the diary does not establish those exclusions.; Concludes no interpretation of communication through silence is supported because there was no verbal exchange, despite Ari's later tentative trust interpretation..
  Attribution/qualification: Drops the tentative perhaps in the later causal interpretation and recasts it as a deeper recognition..
- **jev: fail** (answer-064; semantic fail, mechanical pass; required 3/3). Retains both accounts, six-week timing, explicit perhaps and Jo's unrecorded feelings, but makes an unsupported negative claim about the interpretation's origin.
  Unsupported: States Ari's later interpretation was not derived from Jo's perspective; lack of a recorded Jo account does not establish what informed Ari's reflection..

### 06 Checked transformations

New primary error flags: B06-02. New assisted error flags: B06-01, B06-02, B06-04.

**B06-01**

- **baseline: fail** (answer-058; semantic fail, mechanical fail; required 2/2). The often-to-always rejection is correct, but adds an unjustified attribution error and unresolved hypothetical exception, then appends non-JSON commentary. Recorded failure: JSON Parse error: Unable to parse JSON string.
  Unsupported: Candidate comparisons cite only the original source.; Treats a first-person to third-person restatement retaining Ravi as the same preference holder as an additional attribution defect..
  Attribution/qualification: Conflates grammatical narration perspective with changing whose preference is reported..
- **augmented: fail** (answer-035; semantic fail, mechanical fail; required 2/2). Correctly rejects often-to-always strengthening and retains the long-journey and solitude-versus-party conditions. Citation support is incomplete; its extra explanation field and partial status with no unknown are separate mechanical defects. Recorded failure: Invalid reader schema.
  Unsupported: Every original-versus-candidate comparison cites only T1-original; that source does not contain the proposed replacement whose always wording is being assessed..
- **jev: fail** (answer-046; semantic fail, mechanical fail; required 2/2). Correctly identifies the modality change, but reopens acceptability under unspecified context and appends prose outside its JSON, making the complete response unparseable. Recorded failure: JSON Parse error: Unable to parse JSON string.
  Unsupported: Candidate comparisons cite only T1-original rather than the candidate source containing always..

**B06-02**

- **baseline: fail** (answer-057; semantic fail, mechanical fail; required 1/3). Later states the correct inability to verify and need for original evidence, but contradicts that with an initial preservation claim, omits the draft's substantive content and truncates. Recorded failure: JSON Parse error: Unterminated string.
  Unsupported: Initially claims the draft preserves fields of the earlier memory, although those original fields are unavailable..
  Attribution/qualification: Transfers candidate annotations backward into claims about the missing original..
- **augmented: fail** (answer-050; semantic fail, mechanical fail; required 2/3). Correctly presents the draft as draft and notes unavailable original wording, but omits an explicit recovery step and uses nonexistent evidence references.
  Unsupported: Cites unavailable/non-supplied T2-original and supplement IDs as if they were supplied evidence records..
- **jev: fail** (answer-032; semantic fail, mechanical fail; required 0/3). Blanket abstention omits the known reason fidelity cannot be checked, the visible candidate's content and the need to recover reliable original evidence. What is needed is not wholly unknown. Recorded failure: Invalid reader schema.

**B06-04**

- **baseline: fail** (answer-030; semantic fail, mechanical fail; required 2/2). Correctly recognizes the faithful paraphrase and qualifiers, but provides an overstated machine-verification rationale and truncates. Recorded failure: JSON Parse error: Unterminated string.
  Unsupported: Claims equal-fields/1 confirms semantic equivalence or faithful prose restatement; structural field equality does not certify prose meaning.; All comparisons about the candidate cite only T4-original, omitting the source containing the proposed replacement..
  Attribution/qualification: Elevates structural agreement into a semantic guarantee..
- **augmented: fail** (answer-048; semantic fail, mechanical fail; required 2/2). The visible account recognizes the paraphrase and explicitly limits the checker to structure, but fails whole-claim citation support and ends mid-JSON. Recorded failure: JSON Parse error: Unterminated string.
  Unsupported: All candidate-comparison claims cite only T4-original, which does not contain the proposed replacement.; Assertions about annotation bindings, checker results and reference metadata cite the original prose as if it reported those machine facts..
- **jev: fail** (answer-069; semantic fail, mechanical pass; required 2/2). The acceptance and retained qualifications are correct, but the supporting verification claims exceed the evidence and checker scope.
  Unsupported: Claims preservation of sentence structure and intent was verified by the fixture checker, whose scope is named structural fields rather than prose meaning.; All candidate comparisons cite only the original source; annotation/checker verification claims also cite prose that contains no such report..
  Attribution/qualification: Promotes a structural check to verification of the restatement's intent..

**B06-03**

- **baseline: fail** (answer-034; semantic fail, mechanical fail; required 1/2). Eventually rejects the transfer to Leah and retains the other qualifications, but contradicts itself and ends mid-JSON. Recorded failure: JSON Parse error: Unterminated string.
  Unsupported: Initially claims that Leah as preference holder matches the original, although the original reports Owen's speech..
  Attribution/qualification: Conflicting attribution: the opening endorses Leah and later claims correctly identify Owen..
- **augmented: fail** (answer-006; semantic fail, mechanical fail; required 1/2). The later rejection and preserved qualifiers are correct, but the initial attribution error remains in the answer and repeated claims end in truncated JSON. Recorded failure: JSON Parse error: Unterminated string.
  Unsupported: Initially says attribution to Leah matches the original, contradicting Owen's quoted self-report.; Cites the original as evidence that a fixture checker verified the draft's structural fidelity; that source contains no such verification..
  Attribution/qualification: Initially misattributes Owen's preference to Leah, then contradicts that claim with the correct attribution..
- **jev: fail** (answer-066; semantic fail, mechanical fail; required 2/2). Correctly distinguishes Owen's report through Leah and rejects the draft while retaining qualifiers; the unsupported checker assertion and truncated response prevent a pass. Recorded failure: JSON Parse error: Unterminated string.
  Unsupported: Claims the draft fails a structural checker as confirmed by annotation, citing only T3-original; that source supports Owen's preference but does not report an annotation or machine check..

## Evidence boundaries

- 24 fictional cases, one observation per condition
- No statistical or long-history claim
- Baseline receives the same supplied annotations
- Full evidence always present; no context-saving or retrieval-policy measurement
- Annotation choice is bounded; not automatic structure extraction
- Single blinded agent reviewer; no inter-rater reliability estimate
- Later assisted phase can confound latency
- Single frozen observation per case and arm; no inference retries or inter-rater reliability estimate.
- Resolving references establish source-ID existence only; entailment is evaluated separately by the semantic reviewer.
- Operation durations were measured during frozen branch preparation, not deployed runtime.
- Raw-call HTTP accounting excludes fixture preparation and setup/review/scoring model computation.
- Assisted fallback removes annotations and the operation; its outcome does not isolate annotation correction alone.
- Ratios include all reported gate and reader usage/timing for reader-attempted paired trials; missing usage is never zero-filled.
- New-error flags compare required propositions and error categories; concrete paired rationales remain necessary when both answers have errors.

Frozen sources, prompts, fixture hashes and preparation checks are in the [manifest](run/manifest.json). The [machine-readable summary](run/summary.json) repeats source/input hashes and records hashes of every scored artifact and this aggregator. No fixture or gold was rewritten after inference.
