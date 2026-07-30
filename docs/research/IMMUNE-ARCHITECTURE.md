# Immune System Architecture for Belief Mutation

**Research Document — Circadian Memory System Enhancement**

Status: Exploratory research, not a build brief
Date: 2026-07-30
Author: Research session

---

## 1. Current State

The circadian memory system operates as **population memory**: 84 immutable atoms (beliefs) stored in `mind/beliefs/`, weighted via an append-only ledger (`mind/beliefs.jsonl`), rendered deterministically into `SELF.md`.

### Core data structures

```
mind/beliefs/<id>.md     — immutable atom file (claim, why, quotes, eps)
mind/beliefs.jsonl       — append-only ledger (stack, decay, potentiate, supersede events)
mind/SELF.md             — deterministic render of top-weight atoms
mind/compost.md          — historical discards (frozen, legacy)
```

### The current lifecycle (pure absorption)

1. **EXTRACT** (`stack.ts:490-517`): Episodes yield <=5 candidate atoms via local LLM
2. **DEDUPE** (`stack.ts:389-484`): Hash/overlap/COMPARE routing collapses near-duplicates
3. **STACK**: New atoms created OR existing atoms gain weight +1
4. **DECAY** (`decay.ts:50`): Nightly weight *= 0.95
5. **POTENTIATE** (`decay.ts:91-119`): Propagation (beliefs that "caused thoughts") adds weight +1
6. **RENDER** (`render.ts:110-154`): Top-weight atoms appear in SELF.md

### Key parameters

| Parameter | Value | Location |
|-----------|-------|----------|
| Population | 84 atoms | `mind/beliefs/` |
| Decay factor | 0.95 | `decay.ts:50` |
| Render floor | 0.5 | `render.ts:52` |
| Max candidates/episode | 5 | `stack.ts:131` |
| Claim max chars | 280 | `stack.ts:135`, `atoms.ts:69` |
| LTP threshold | 0.30 | `ltp.ts:66` |

### What the system does NOT do

- **Mutation**: Atoms are immutable. Once written, a belief file is never edited.
- **Recombination**: No mechanism combines elements from multiple atoms.
- **Somatic hypermutation**: No local variation/improvement loop.
- **Generative diversity**: All beliefs originate from episodes; none are synthesized.

---

## 2. The Gap

The system is **absorptive only** — it stores, weights, and decays. It never generates.

Biological memory systems don't just select from what they receive. The immune system demonstrates a fundamentally different architecture:

### V(D)J Recombination

The immune system generates ~10^11 unique antibody configurations from ~300 gene segments through **combinatorial recombination**:

- **V (Variable)**: ~40 segments
- **D (Diversity)**: ~25 segments  
- **J (Joining)**: ~6 segments

Random selection + imprecise joining + junctional diversity creates astronomical variation from a small genome. The key insight: **diversity is generated, not received**.

### Clonal Selection

When an antigen arrives:
1. Naive B-cells with matching receptors are activated
2. Activated cells proliferate (clonal expansion)
3. Non-matching cells die (deletion)
4. Successful cells become memory cells

The "antigen" is the selection pressure — what tests whether a belief is useful.

### Somatic Hypermutation

During proliferation, activated B-cells introduce point mutations in their antibody genes at rates ~10^6 higher than normal. Variants that bind better are selected; variants that bind worse die. This is **Darwinian evolution on a weeks timescale**.

### The analogy to beliefs

| Immune System | Circadian Memory | Gap |
|---------------|------------------|-----|
| V(D)J recombination | — | No belief synthesis |
| Antigen testing | Propagation? | Weak/indirect selection signal |
| Clonal expansion | Weight +1 | Very conservative |
| Hypermutation | — | No variation mechanism |
| Deletion | Decay below floor | Present (defocus) |

---

## 3. The Intervention

### 3.1 Recombination Operator

**Hypothesis**: During REM (the "sleep" phase), occasionally **combine** two low-weight atoms into a novel proposition.

#### Candidate recombination rules

```typescript
interface RecombinationCandidate {
  atomA: Atom;  // claim donor
  atomB: Atom;  // evidence donor
}

interface RecombinedAtom {
  kind: AtomKind;
  claim: string;      // derived from atomA.claim + transformation
  why: string;        // new, synthesized from both
  quotes: Quote[];    // inherited from atomB (the evidence)
  eps: string[];      // union of both
  lineage: { a: string; b: string };  // provenance
}
```

**Rule 1 — Evidence transplant**: Take claim from atom A, supporting quotes from atom B (when both concern related themes).

**Rule 2 — Generalization**: Abstract a shared principle from two doctrine atoms into a higher-level belief.

**Rule 3 — Contradiction resolution**: When two atoms conflict, synthesize a reconciling position.

#### Selection criteria for recombination candidates

```typescript
function selectRecombinationPair(
  atoms: Atom[],
  states: Map<string, AtomState>
): RecombinationCandidate | null {
  // Only consider low-weight atoms (0.5 < weight < 2.0)
  // Neither dead nor dominant
  const candidates = atoms.filter(a => {
    const w = states.get(a.id)?.weight ?? 0;
    return w >= RENDER_FLOOR && w < 2.0;
  });
  
  // Find thematically related pairs (token overlap in 0.15-0.30 band)
  // Too similar = redundant; too different = nonsense
  // ...
}
```

#### Implementation location

The natural insertion point is `rem-popmem.ts`, between decay (step 3) and render (step 4):

```
1. ABSORB (episodes -> atoms)
2. PROPAGATION JUDGMENT  
3. DECAY
3.5 RECOMBINATION (NEW)  <-- here
4. RENDER
5. GREETING
6. COMMIT
```

### 3.2 Selection Mechanism — What is the "Antigen"?

The immune system has antigens: foreign proteins that must be matched. What tests a belief?

**Current signal**: Propagation — beliefs that appear in scoreboard's `propagated` array caused thoughts in the next session. This is weak:
- Binary (propagated or not)
- Latent (signal arrives one cycle later)
- Noisy (propagation detection is LLM-based, imperfect)

**Proposed additional signals**:

| Signal | Mechanism | Strength |
|--------|-----------|----------|
| Explicit verdict | `--greet-bad` with reason citing specific beliefs | High |
| Contradiction detection | Episode asserts opposite of a belief | Medium |
| Staleness | Time since last propagation | Weak |
| Cluster health | Are related beliefs also decaying? | Weak |

**Selection pressure implementation**:

```typescript
interface SelectionPressure {
  atomId: string;
  signal: 'propagated' | 'contradicted' | 'stale' | 'verdicted';
  magnitude: number;  // -1.0 to +1.0
  evidence: string;   // episode filename or verdict text
}
```

A recombined atom that propagates in its first cycle earns full potentiation. One that contradicts an episode earns a malus. The same Darwinian loop that governs V(D)J-produced antibodies.

### 3.3 Compost as Raw Material

The current `mind/compost.md` is frozen legacy. But the concept — beliefs that "sank below floor" — could become the feedstock for recombination:

```typescript
// The "gene pool" for recombination
const recessivePool = atoms.filter(a => {
  const state = states.get(a.id);
  return state?.status === 'active' && state.weight < RENDER_FLOOR;
});
```

These are beliefs that:
- Were once extracted from real episodes (not hallucinated)
- Have valid provenance (quotes are verbatim)
- Simply haven't been useful recently

Recombining from this pool means: **no raw generation from nothing**. Every recombined atom has ancestry in real experience.

### 3.4 Lineage Tracking

Every recombined atom must carry its provenance:

```
kind: doctrine
claim: "Complexity accretes through guard-stacking; motion, not possession, is the metric."
why: "Combined insight: the cliff (cdca09e40f29) + motion-as-metric (83e65cb841d0)"
quote: "each instance starts off great... then falls off a cliff" | 2026-07-16-the-forest-session.md
quote: "Possession is inventory. Memory is what causes thoughts." | 2026-07-28-genesis-archaeology.md
lineage: { a: "cdca09e40f29", b: "83e65cb841d0", op: "generalization" }
[ep:2026-07-16]
[ep:2026-07-28]
```

The `lineage` field (new schema addition) allows:
- Tracing any belief back to original episodes
- Understanding which recombination operations worked
- Rolling back if recombination proves harmful

---

## 4. Risks

### 4.1 Drift

Unchecked recombination could drift beliefs away from grounded experience. The immune system's V(D)J recombination is constrained by the germline genome — there are only so many V, D, J segments. 

**Mitigation**: 
- Recombination quota: At most 1 per REM cycle
- Lineage depth limit: A recombined atom cannot be recombined again (max depth 1)
- Source constraint: Both parents must have weight > 0 (not dead)

### 4.2 Nonsense Generation

Combining unrelated atoms produces gibberish. "The cliff is complexity accretion" + "Tool permission requests must be explicit" = ?

**Mitigation**:
- Thematic overlap requirement (jaccard in [0.15, 0.30] band)
- LLM validation: Ask the COMPARE model "is this coherent?" before committing
- Immediate doom: If recombined atom receives `--greet-bad` citation within 3 cycles, auto-supersede it with a parent

### 4.3 Hallucination Amplification

The current system's counterfeit-quote check (`stack.ts:193-197`) guarantees every quote is verbatim from a real episode. Recombination could:
- Synthesize quotes (forbidden)
- Combine quotes from unrelated contexts (misleading)
- Generate claims with no grounding (pure hallucination)

**Mitigation**:
- Quotes are NEVER synthesized; they're transplanted wholesale from parent atoms
- Claims must be LLM-generated but immediately validated:
  - Length <= 280 chars
  - Not near-duplicate of existing atom (overlap < 0.30)
  - Coherence check vs parent claims

### 4.4 Premature Optimization

Recombination without selection pressure just makes noise. The immune system works because antigens kill useless variants.

**Mitigation**: 
- Selection-first: Don't implement recombination until propagation signal is reliable
- Kill switch: If recombined atoms never propagate over 7 cycles, disable the mechanism
- Metrics: Track recombined-atom propagation rate vs absorbed-atom propagation rate

---

## 5. Implementation Sketch

### Phase 0: Prerequisites

Before any mutation work:

1. **Strengthen selection signal** 
   - Instrument propagation detection accuracy
   - Add explicit atom-level verdicts to `--greet-bad`
   
2. **Schema extension**
   - Add optional `lineage` field to atom format
   - Extend `parseAtom`/`serializeAtom` in `atoms.ts`

### Phase 1: Recombination Operator (Prototype)

```typescript
// src/recombine.ts — the recombination operator

import { Atom, AtomKind, AtomState, atomId, writeAtom } from './atoms.ts';
import { significantTokens, jaccard } from './ltp.ts';
import { complete } from './llm.ts';

export const RECOMBINE_OVERLAP_LOW = 0.15;
export const RECOMBINE_OVERLAP_HIGH = 0.30;
export const RECOMBINE_WEIGHT_FLOOR = 0.5;
export const RECOMBINE_WEIGHT_CEILING = 2.0;

export interface RecombineCandidate {
  atomA: Atom;
  atomB: Atom;
  overlap: number;
}

export function findRecombinationCandidates(
  atoms: Atom[],
  states: Map<string, AtomState>
): RecombineCandidate[] {
  // Filter to low-weight, same-kind atoms
  const eligible = atoms.filter(a => {
    const w = states.get(a.id)?.weight ?? 0;
    const status = states.get(a.id)?.status ?? 'active';
    return status === 'active' 
      && w >= RECOMBINE_WEIGHT_FLOOR 
      && w < RECOMBINE_WEIGHT_CEILING;
  });

  const candidates: RecombineCandidate[] = [];
  const tokens = new Map(eligible.map(a => [a.id, significantTokens(a.claim)]));

  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      const a = eligible[i], b = eligible[j];
      if (a.kind !== b.kind) continue; // same kind only
      
      const overlap = jaccard(tokens.get(a.id)!, tokens.get(b.id)!);
      if (overlap >= RECOMBINE_OVERLAP_LOW && overlap < RECOMBINE_OVERLAP_HIGH) {
        candidates.push({ atomA: a, atomB: b, overlap });
      }
    }
  }

  // Sort by overlap descending (most related first)
  return candidates.sort((a, b) => b.overlap - a.overlap);
}

export async function synthesizeClaim(
  atomA: Atom,
  atomB: Atom,
  operation: 'generalize' | 'reconcile' | 'transplant'
): Promise<string | null> {
  // LLM generates a combined claim; null if incoherent
  const prompt = buildSynthesisPrompt(atomA, atomB, operation);
  const raw = await complete(prompt, { maxTokens: 100, temperature: 0.3 });
  return validateSynthesizedClaim(raw, atomA, atomB);
}
```

### Phase 2: Integration into REM

```typescript
// In rem-popmem.ts, after decay step:

if (shouldAttemptRecombination(atomsBeforeDecay, statesAfterDecay)) {
  const candidates = findRecombinationCandidates(atomsBeforeDecay, statesAfterDecay);
  if (candidates.length > 0) {
    const best = candidates[0]; // one per cycle
    const synthesized = await synthesizeClaim(best.atomA, best.atomB, 'generalize');
    if (synthesized) {
      const recombined = createRecombinedAtom(best, synthesized);
      writeAtom(BELIEFS_DIR, recombined);
      appendLedger(LEDGER_PATH, { 
        ev: 'recombine', 
        atom: recombined.id, 
        parents: [best.atomA.id, best.atomB.id],
        ts: new Date().toISOString() 
      });
    }
  }
}
```

### Phase 3: Selection Pressure Tracking

```typescript
// Extend scoreboard event to track per-atom propagation

interface RemEvent {
  ts: string;
  type: 'rem';
  propagated: string[];           // addresses
  propagated_atoms: string[];     // resolved atom ids (new)
  recombined_atoms?: string[];    // ids of atoms born this cycle (new)
}

// After N cycles, compute:
// - recombined_propagation_rate = recombined that propagated / total recombined
// - absorbed_propagation_rate = absorbed that propagated / total absorbed
// If recombined_rate < absorbed_rate * 0.5 over 7 cycles, kill the mechanism
```

---

## 6. Open Questions

1. **What recombination operation is most useful?**
   - Generalization (abstract shared principle)
   - Evidence transplant (new quote for old claim)
   - Contradiction reconciliation
   - Something else?

2. **How do we validate synthesized claims without just generating more hallucination?**
   - COMPARE-style coherence check?
   - Human-in-the-loop for first N?
   - Automatic rollback on non-propagation?

3. **Is the compost pool large enough?**
   - Currently ~84 atoms total; need to track how many are below floor
   - If pool is too small, recombination candidates will be sparse

4. **Should recombined atoms inherit weight from parents or start at 1?**
   - Inherit: faster test of value, but skips the "earn your way up" discipline
   - Start at 1: fair, but may decay before it gets a chance to propagate

5. **What prevents runaway recombination if it accidentally works well?**
   - Quota (1 per cycle) helps
   - Lineage depth limit helps
   - But a "successful" recombination could crowd out absorption

---

## 7. Recommendation

**Do not implement recombination yet.**

The current system has:
- Weak selection pressure (propagation signal is noisy, latent)
- No per-atom verdict mechanism
- Only ~84 atoms (small gene pool)
- No instrumentation of belief usefulness

Before mutation makes sense, the system needs:
1. **Reliable selection signal**: Instrument and validate propagation detection
2. **Explicit verdicts**: `--greet-bad "claim X is wrong because Y"` citing specific atoms
3. **Larger population**: Let the current mechanism run for 30+ days
4. **Metrics baseline**: Know what "normal" propagation rates look like

The immune analogy is compelling, but the immune system didn't evolve recombination before selection. It evolved them together, with selection being the dominant force. A memory system that generates without selecting is a hallucination engine.

**Next step**: Strengthen `decay.ts`'s propagation-to-potentiation pathway and instrument it. When we can answer "which atoms are actually useful?", then we can ask "how do we make new useful atoms?"

---

## Appendix: Key File References

| File | Lines | Purpose |
|------|-------|---------|
| `src/atoms.ts` | 1-341 | Atom schema, ledger, foldWeights |
| `src/stack.ts` | 1-799 | EXTRACT, COMPARE, dedupe routing |
| `src/render.ts` | 1-238 | Deterministic SELF.md generation |
| `src/decay.ts` | 1-273 | Nightly decay + potentiation |
| `src/rem-popmem.ts` | 1-838 | Composite REM payload |
| `src/ltp.ts` | 1-145 | Token overlap, clustering |
| `docs/POPULATION-MEMORY.md` | 1-444 | System specification |
