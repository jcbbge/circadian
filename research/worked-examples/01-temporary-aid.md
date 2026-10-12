# Worked example 1 — an aid for the unfamiliar, then retirement

**Status:** Paper exploration of an optional augmentation. All places, sources and utterances below are invented. These are illustrative records, not a proposed schema, new API, actual memory entries or observed model results. Circadian's default is the working foundation. No experiment is being run.

## The situation and ordinary memory

In fictional Lumen, the user is staying in a temporary flat. An invented account S1 says:

> The riverside path from this flat takes me to Lantern Market. The hill steps take me to the library. Street names mean nothing to me yet; landmarks help.

Ordinary Circadian can remember that account. A concise ordinary note could already say: “From the temporary flat: market via riverside; library via hill steps. Landmarks help while unfamiliar.” A later agent could read it and reason about the current request. That competent ordinary behavior is our comparison, not a deliberately forgetful agent.

The optional candidate is **a reusable aid with some work already done**. The agent deliberately binds the starting place and the two observed destination associations, leaving the current destination and circumstances to be supplied later. Its purpose is to make a useful association easy to reuse at the right moment, if doing so saves work or improves continuity.

The user's original letter-based mnemonic motivates this example, but an agent's aid need not imitate a human mnemonic. A private abbreviation such as `M/R; L/H` needs its decoding carried with it; otherwise a later model may not recover the association. It can cost more than the plain note. The initial example therefore keeps the aid readable. No model-weight learning or speedup is assumed.

## What the optional addition might look like

One supplemental note, with fictional source labels local to this document:

```text
Aid: orient-from-temporary-flat
Purpose: reuse two known landmark associations while orienting in Lumen.
Basis: S1, the user's account; association prepared by the agent.
Bound information: market → riverside; library → hill steps.
Remaining information: current starting place, destination, relevant changes.
Use when: starting at that flat, going to one of those destinations,
          and a landmark reminder would help the present request.
Reconsider when: the starting place or routes change, or current validity is unknown.
Retire from routine use when: the user says the reminder is no longer useful
                            or that stay ends.
Keep: the underlying account of arriving and learning the city.
```

This note is agent-authored data, not an authority over the current user's request. A different agent/model may inspect, adapt or decline it. It belongs to the shared memory, not to a separate model persona. Its origin explains the interpretation; it does not prove the interpretation useful.

Creation should happen while the relevant reasoning is already available. If a future implementation stores it, an optional capture step could retain this note alongside ordinary memory. No global ontology or new identity system is implied.

## The operation, and where it fits

At an already relevant recall or in-session reasoning opportunity:

1. Obtain this aid through the same opportunity that supplied the relevant memory, or explicit selection. Include any extra discovery work in its cost.
2. Match the current request to its bound information and conditions.
3. If it applies and is useful, reuse the association, supplying the remaining information. Otherwise continue ordinary reasoning. Uncertainty does not block the task; it limits reliance on the shortcut.

For “I'm at the flat; remind me how I got to the market,” a possible response is simply “You used the riverside path.” Its source remains available. For “I'm at the station,” this aid has not supplied a route. For an unrelated conversation, it contributes nothing.

No task-specific information is assumed available before the first user message. The paper candidate adds no universal wake chooser, timer, standing inference call or separate retrieval gateway. If the addition is disabled, the original account and ordinary recall remain usable. The exact extension seam and storage location are undecided.

## Evolution across sessions

| Moment | Evidence available now | Proposed behavior |
| --- | --- | --- |
| Arrival | S1 and a current need for orientation | The agent may author the aid while solving the task. |
| Later relevant request | User is again at the flat and asks about one destination | Reuse the bound association if appropriate; preserve its source. |
| Unrelated session | No navigation question or relevant context | Do not surface the aid merely because it was recent. |
| Familiarity | S2: “I know these routes now; no more reminders.” | Stop routine prompting. Retain the aid as historical material if useful to recall explicitly. |
| Changed route | S3: “The riverside path is closed.” | Do not reuse that association for current navigation. The old account remains a record of its time. |
| Move away | S4: “I've left that flat.” | The flat-bound aid is out of the present context; preserve the experience of learning the city. |
| Return later | User wants help again, but current route conditions are unknown | Revisit it as historical evidence, reconsider applicability/validity, and avoid automatic reactivation. |

S2, S3 and S4 are different possible developments, not mandatory consecutive events. No retirement is inferred solely from silence, elapsed time, a low weight, or three apparently successful uses. A condition is only useful if the agent has evidence to evaluate it; “unknown” stays available.

Retirement here means withdrawing a working aid from routine use. It does not mean forgetting a meaningful episode. Disabling an extension and an explicit user request to erase memory are different operations; an auxiliary note must not defeat the latter.

## The six proposals, applied without forcing them

| Proposal | Possible contribution in this example |
| --- | --- |
| 01 — Views | Surface just the relevant association and its qualification, with a source route. |
| 02 — Compatibility | Match starting place, period and current circumstances before reuse. |
| 03 — Typed relations | Keep the user's observation, the agent's shortcut and the present destination distinct. |
| 04 — Multi-input operations | Bind stable inputs once and retain the remaining work; this is the central candidate. |
| 05 — Joint experiences | No special operation is needed for this small aid; ordinary episode context can suffice. |
| 06 — Checked transformations | A narrow check could preserve the declared starting place and source bindings in a rendered aid; it cannot establish current route truth. |

The [operations dossier](../04-multi-input-operations.md) supplies the partial-evaluation analogy: retain remaining work rather than only a previous answer. This example is not a formal partial evaluator or an operad. A plain function or conditional note might deliver the entire benefit. Mathematical structure becomes useful only if an additional operation and its laws do useful work.

## Benefit, cost and the decision this clarifies

The candidate benefit is deliberate reuse and context-sensitive withdrawal of agent-created help. Costs are the added note, its authoring and retrieval, evidence needed to check conditions, extra context, and any maintenance when circumstances change. None has been measured. A compact mnemonic is not automatically cheap once decoding, conditions and source access are counted.

The strongest simpler alternative is the concise ordinary note above, carrying the same conditions, with normal agent reasoning. If an explicit aid offers no improvement over that, this particular structure is unnecessary; the ordinary note remains a valid augmentation technique.

**The next conceptual decision:** is the value in the artifact's representation, or in giving the agent a deliberate practice of creating, using and retiring temporary aids? This paper example distinguishes those possibilities without requiring either a plugin framework or a new experiment.
