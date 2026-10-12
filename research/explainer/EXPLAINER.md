# Circadian: memory that can be used with care

[Explore the interactive anatomy](index.html).

Circadian already provides working, general-purpose memory across sessions. The question behind these six additions is practical: when an agent recalls, combines, reuses or rewrites something, which distinctions should survive? A preference belongs to circumstances. A statement has a speaker. A shared evening can have several meanings. A useful reminder can stop helping without making the original experience disposable.

The additions are **implemented research prototypes**, each usable independently over supplied evidence. They use the existing runtime without a new package, database or always-on service. They are not installed production plugins. Their tests demonstrate specific operations; whether those operations make an agent more helpful remains unmeasured. The [prototype inventory](../prototypes/README.md) records that boundary.

## Who, what, where, when, why, how

| Question | Concrete answer |
|---|---|
| **Who?** | An agent using memory on a person's behalf; people in remembered accounts remain separately attributed. |
| **What?** | Six optional operations for views, compatibility, relationships, reusable aids, shared occasions and checked rewrites. |
| **Where?** | Research code under `research/prototypes/`; possible future consumers sit alongside existing recall, rendering and episode processing. |
| **When?** | At a relevant recall, planning or proposed-rewrite opportunity. No universal startup classifier is required. |
| **Why?** | To make qualifications, supporting evidence, missing information and the limits of a result explicit. |
| **How?** | Small bounded functions over reviewed records, source references and current source states. |

These are the [verified integration seams](../refinements/SOURCE-MAP.md), not a claim that a general extension interface already exists.

## The working foundation

Start with the loop. **Wake** reads memory into a new session. **Graze** captures observations during it. **Sleep** turns the session and its checkpoints into an episode and current handoff. **REM** consolidates episodes into the belief population and refreshes its rendered view and retrieval index. An episode preserves an account; an atom carries a concise claim, its reason and supporting quotations. The ledger tracks changes such as reinforcement, supersession and recorded disagreement. See the [lifecycle description](../../README.md#what) and [source map](../refinements/SOURCE-MAP.md).

Circadian already selects by scope, budgets rendered context, retains source links and represents contradictions. These supplements add more explicit constraints to particular operations. For example, today's location-based scope records where information originated; it does not establish whether a preference applies while reading, dancing or recovering from a tiring day.

All six prototypes work outside the model: they select records, follow references, combine declared inputs or compare fields. They do not change model weights or enlarge its context window. A smaller view may change what occupies that window; tests have not established that it improves the model's use of it. Here, “experience” means a recorded occasion and attributed accounts, without a claim that the agent has subjective experience.

## 1. Coordinated views: shorten without hiding the conditions

**Everyday problem.** Before a family visit, you want the relevant reading preferences, not every travel memory. But “likes quiet” becomes misleading if “while reading” disappears.

**Operation.** Restrict a supplied population first, then render complete qualified records within a budget. Show omissions and open disagreement references. Expand by reading the original source again. Mathematically, **restriction** means narrowing the same population: selecting family records and then selected IDs should equal their direct intersection. Lossy ranking is a separate operation.

**Demonstrated capability.** The fixture selects family records b and c; a smaller view keeps b's disagreement reference even when c cannot fit. Expansion checks supplied current eligibility and revision. A fixed order makes larger budgets extend the same prefix. The whole successful serialized response counts toward a character budget; these are not token measurements.

**Unknown.** Whether this saves useful context or avoids misunderstandings for an actual reader. Ordinary selection already finds the same records; the added behavior is preservation and honest coverage. [Specification](../refinements/01-coordinated-memory-views.md) · [Demo](../prototypes/01-views/demo.ts).

In Circadian, this fits selected recall and rendering.

## 2. Contextual compatibility: decide what can coexist

**Everyday problem.** Someone likes quiet while reading and lively rooms while dancing. Flattening those statements creates a false contradiction. Separately, several individually reasonable planning requirements can fail together.

**Operation.** Establish whose claim, which property and which circumstances are being compared. Unknown circumstances stay unknown. For explicit finite constraints, search for an assignment satisfying every constraint. **Consistency** here means a common solution exists; it does not mean the annotations are true.

**Demonstrated capability.** The reading and dancing accounts remain separate. With binary A, B and C, every pair of A=B, B=C and A≠C has a solution; all three have none after checking eight assignments. A search stopped by its work cap returns unknown, not conflict. An undeclared relevant context dimension also returns unknown.

**Unknown.** Whether people or models can supply these meanings accurately and cheaply enough. An ordinary exhaustive checker can perform the same joint check. This adds contextual and joint constraints beyond Circadian's existing disagreement edges. [Specification](../refinements/02-contextual-compatibility.md) · [Demo](../prototypes/02-compatibility/demo.ts).

It would run as an explicit report over selected memories.

## 3. Typed relations: preserve who said what, where

**Everyday problem.** Noor's account of Mira's preference is different evidence from Mira's own statement. The place where someone writes about a conversation may differ from where it happened.

**Operation.** Follow declared relationships: report → speaker; report → occasion → setting. **Typed composition** allows only the intended kinds of connection. Two paths ending at a place are not automatically interchangeable. An explicit equality rule can expose inconsistent annotations without choosing which account is true.

**Demonstrated capability.** Querying occasions where Mira spoke returns the garden and library with supporting paths. It does not substitute the home where an episode was written. A conflicting declared occasion setting is reported. Several routes supporting one report remain several evidence paths, not several independent confirmations.

**Unknown.** Correct attribution and identity still depend on supplied annotations. The ordinary typed-join comparator answers the same positive question. The added contract makes paths, declared equations and unresolved cases inspectable; repeated reports do not automatically establish a permanent trait. [Specification](../refinements/03-typed-relations-and-composition.md) · [Demo](../prototypes/03-relations/demo.ts).

It fits an optional recall consumer over source-backed episode annotations.

## 4. Reusable operations: remember some work already done

**Everyday problem.** Planning another conversation repeats familiar work: combine preferences, calendars, places and an intention. A temporary mnemonic likewise packages a useful association while leaving its current use undecided.

**Operation.** Save known inputs for one supported recipe, with their sources and conditions; expose the remaining inputs. **Partial application** means binding some arguments now and supplying the rest later. The mnemonic analogy is a readable aid with its decoding and applicability, not unexplained initials. Retiring the aid need not delete the experience.

**Demonstrated capability.** Binding preferences first or calendars first produces the same tentative plan at place G: a 15-minute interval [90,105), within the fictional minute scale. Both equal full application. Missing Noor's availability produces a missing-input result. Conflicting or stale bindings require reconsideration.

**Unknown.** Discovery, checking and maintenance may cost more than a concise note or direct reasoning. R14, the actual cost/usefulness comparison, is deferred. The implemented operation is one fixed planning recipe, not a general executable-memory language or tested navigation mnemonic. [Specification](../refinements/04-reusable-multi-input-operations.md) · [Demo](../prototypes/04-operations/demo.ts).

Its place is an already relevant planning or recall opportunity.

## 5. Joint experiences: keep the occasion and its interpretations

**Everyday problem.** Three pairwise meetings do not establish that three friends shared one dinner. A later reflection may change how the narrator understands that dinner's silence without replacing the earlier account.

**Operation.** Record evidenced participation in an occasion and preserve separately attributed interpretations. **Incidence** asks who belongs to which occasion. A checked revisit connects interpretations of the same resolved occasion and the same local question; a shared vague label is insufficient.

**Demonstrated capability.** The shared-dinner fixture answers a three-person query; the pairwise fixture does not. Checked links connect supplied interpretations, and removing the link exposes an omitted relevant account with incomplete coverage. Mentioning Dana does not establish attendance or absence. The narrator's feeling is not assigned to everyone.

**Unknown.** Both interpretations already carry occasion IDs, so this demonstrates neither discovery of hidden reflections nor an advantage over direct occasion lookup. The ordinary incidence comparator is an implementation alias. Narrative value, extraction accuracy and practical recall benefit remain unmeasured. [Specification](../refinements/05-joint-experiences-and-interpretations.md) · [Demo](../prototypes/05-experiences/demo.ts).

It could enrich recall of committed episodes and later reflections.

## 6. Checked transformations: name exactly what survived

**Everyday problem.** Shortening “often prefers quiet conversation after a tiring day” can silently turn it into an unconditional trait.

**Operation.** Independently compare designated fields before and after a proposed rewrite. **Invariance** means a named property remains unchanged under that particular operation. A receipt binds the check to exact inputs and versions; it is not a truth certificate.

**Demonstrated capability.** Changing “often” to “always” fails the modality check. Changed candidate bytes make an earlier receipt stale. A fixed renderer can be checked exactly. Free prose remains semantically unassessed even when its metadata matches; changed bytes are reported separately.

**Unknown.** Correct metadata cannot prove faithful prose. Missing annotation means not checked, while explicit removal can fail equality. Ordinary field comparison catches the same modality change. Circadian already checks quotation presence and deterministic rendering; these add selected properties and exact-input applicability. [Specification](../refinements/06-checked-memory-transformations.md) · [Demo](../prototypes/06-transformations/demo.ts).

It could check selected proposed derivations before an explicit acceptance step.

## What the evidence says

The captured [results manifest](../prototypes/results.json), validated at **2026-10-11T22:45:23.873102+00:00**, records:

| Evidence | Result |
|---|---|
| Executed tests / assertions | 120 / 492; zero failures or skips |
| Specification case IDs | 93 mapped; 92 deterministic mappings |
| Deferred case | R14: actual total cost and usefulness |
| Behavioral model calls | 0 |

The [peer review](../prototypes/PEER-REVIEW.md) and [closure](../prototypes/PEER-CLOSURE.md) document corrections to ignored context and silent interpretation omissions. The final small accounting follow-ups were inspected and tested by the parent, as [resolution](../prototypes/REVIEW-RESOLUTION.md) records; no further peer review is claimed.

The mathematics supplies operational constraints, not full sheaves, higher categories or evidence of superiority over graphs. A future classifier could suggest evidence-backed labels; it would not prove them. This phase ran no behavioral evaluation.

## Putting the abilities together

Imagine planning another dinner. A view could supply qualified memories; compatibility could separate occasion-specific needs; typed relations could distinguish a friend's request from hearsay. A reusable aid could combine those needs with current calendars. Occasion records could preserve what happened together and later interpretations. A rewrite check could catch specified losses when the account is shortened.

That combined flow remains a possibility, not an integrated demonstration. Production adapters, optional configuration, discovery, persistence and deletion behavior remain unresolved integration work. Behavioral comparison must still measure annotation fidelity, narrative usefulness and total cost against competent simpler approaches. The six [independent prototypes](../prototypes/README.md) make those questions concrete without requiring all six to be installed together.
