# Two concrete augmentation sketches

**Status:** Paper examples and a completed outside-peer discussion. No implementation, experimental inference, production audit or plugin architecture. Circadian remains the working default. All six proposals remain open.

- [Temporary aid](01-temporary-aid.md): an agent prepares a small navigation association, reuses it when relevant, and withdraws it from routine use without erasing the experience.
- [Shared experience](02-shared-experience.md): an occasion and a later reflection can be recalled together while preserving speaker, uncertainty and changing meaning.
- [Peer's response](../peer-consultation/PEER-WORKED-EXAMPLES.md), preserved verbatim. Its request and session receipt are in the [consultation folder](../peer-consultation/README.md).

The ordinary-note comparisons contain the same information as the proposed additions. The sketches show possible behavior; they do not establish that it improves on ordinary Circadian use.

## What became clearer

The temporary aid asks whether an agent benefits from deliberately preparing working material while the relevant reasoning is fresh. The proposed discipline is to keep the aid's source, current use and eventual retirement intelligible. A compact note may be enough; a new record schema has not earned a role. Finding and checking an aid can cost more than reasoning directly.

The shared experience offers a more sharply defined operation: when recalling one account, follow a relevant explicit connection to a later reflection. In the fictional example, the reflection says “that dinner” without repeating the participants' names. An explicit reference could make the connection less dependent on repeated wording. This is a hypothesis about useful co-retrieval, not a guarantee about existing rankings or lower cost.

Both can use an ordinary source-reference pattern:

```text
S1: account of arriving and learning the city
A1: agent-prepared navigation aid — prepared from S1

D1: account of a particular dinner
R1: later attributed reflection — revisits D1
```

This sketch does not introduce a universal record kind. A1 and R1 have different purposes. Withdrawing A1 from routine use need not delete S1. R1 can remain meaningful indefinitely; it does not inherit an aid's retirement policy. References can be shared without forcing all related material into one lifecycle.

## What to simplify, and what to keep distinct

- Keep an aid in readable language until an abbreviation demonstrates value. Its origin and purpose can share a sentence, but they are different information.
- A roles table is optional for the narrow dinner-reflection example. Preserve the narrative and attribution. Do not require an annotation for every absent person merely because the fixture includes one.
- Keep **applicability**, **validity**, and **usefulness** conceptually distinct. An aid can be irrelevant to today's task yet useful tomorrow; current route information can change even while navigation help is still needed. These are questions to ask using available evidence, not three new subsystems.
- The agent may assess the utility of its own aid from evidence about its use and cost. The operator need not become its memory clerk. A direct user correction remains decisive; silence alone establishes neither fluency nor obsolescence.
- Retiring working material is separate from erasing an experience. The peer suggested the existing forget mechanism, but applying it to a new kind of supplemental material would require a defined integration; the sketches do not establish that it works unchanged today.

## Mathematics and evidence

The partial-evaluation idea helps ask what information is already bound and what work remains. The occasion/reflection example helps ask what two accounts must refer to before their relationship is meaningful. These are useful design questions drawn from the existing dossiers. Neither example yet needs an operad, simplicial closure, higher cells or a theorem prover.

The peer's claim that an explicit occasion field is necessary for retrieval is too strong: a traversable reference through an earlier account could reach the occasion as well. The representation choice should follow the useful operation. Likewise, shared record syntax does not make a practical aid and a personal interpretation semantically identical.

A later observation of one linked pair would establish behavior for that pair only. It would not prove a general gain or prove the augmentation unnecessary everywhere if ordinary retrieval already found both. Any future evaluation must include the cost of supplying the connection and distinguish a useful additional account from unwanted context expansion.

## The bounded outcome

The peer prefers the explicit reflection link as the clearest slice to carry forward. The parent agrees it is easier to specify at the point of use: select an account, optionally include one clearly related reflection, preserve both sources, and avoid asserting a final interpretation. This is a candidate for a later isolated prototype, not a decision to implement it now.

The temporary-aid idea remains a separate, valuable question about agent practice. These examples clarify what an addition would do and expose where plain notes may suffice. They have not narrowed the six-proposal research agenda to a new universal memory architecture.
