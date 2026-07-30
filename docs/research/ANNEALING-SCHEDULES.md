# Annealing Schedules for Circadian Population Memory

**Research Document — July 30, 2026**

## 1. Current State

### 1.1 Architecture Summary

The circadian system is a population memory with **84 atoms** (beliefs) in `mind/beliefs/`. Each atom has:
- Immutable content: `kind`, `claim`, `why`, `quotes`, `eps` (source episodes)
- Dynamic state via ledger: `weight`, `status` (folded from `beliefs.jsonl`)

Weight dynamics (`atoms.ts:295-340`, `foldWeights`):
```
stack{atom}      → weight +1 (makes atom decay-eligible)
potentiate{atom} → weight +1 (propagation hit)
decay{factor}    → weight *= 0.95 for all ever-stacked atoms
supersede{w,l}   → loser's weight transfers to winner
```

Render threshold: `RENDER_FLOOR = 0.5` (`render.ts:52`). Below this, atoms leave the rendered `SELF.md` but files persist (defocus, never delete).

### 1.2 Current Weight Distribution

```
>5 weight:    17 atoms  (20%)  — the "establishment"
2-5 weight:   26 atoms  (31%)
1-2 weight:    9 atoms  (11%)
0.5-1 weight: 32 atoms  (38%)  — just above floor
<0.5 weight:   0 atoms  (0%)   — none yet sunk
```

The population is **converged**: the system has reached equilibrium between decay (×0.95/cycle, `DECAY_FACTOR` at `decay.ts:50`) and absorption/propagation. The top atoms (`w=58.5`, `w=56.5`) dominate — they're 88× heavier than the floor atoms.

### 1.3 Selection Mechanism

The renderer (`render.ts:119-154`) selects atoms by:
1. Filter: `status === "active" && weight >= RENDER_FLOOR`
2. Sort: weight descending (tiebreak: id lexicographically)
3. Budget: stop at first atom that would exceed section token budget

This is **greedy selection by weight** — no randomness, no exploration.

### 1.4 The Problem: Local Minimum Lock-In

The current system is deterministic: same state → same render → same exposure → same propagation pattern → same weight distribution. This creates:

1. **Rich-get-richer**: High-weight atoms get rendered → get propagated → gain weight
2. **Burial**: Low-weight atoms never render → never propagate → decay toward floor
3. **No escape path**: A valuable belief that entered during a low-activity period may be permanently stuck below heavier incumbents

**Metallurgical analogy**: The grain structure is locked. Atoms are in their local energy wells. Without heating, the crystal cannot reorganize.

---

## 2. The Thread: Simulated Annealing

### 2.1 Physical Metallurgical Annealing

In metallurgy, annealing:
1. **Heat**: Increase thermal energy, allowing atoms to escape local energy minima
2. **Soak**: Hold at temperature to allow diffusion and reorganization
3. **Cool**: Gradually reduce temperature to lock in a better global structure

The key insight: **controlled disorder enables better order**.

### 2.2 Simulated Annealing in Optimization

The Metropolis-Hastings algorithm:
```
At temperature T:
  - Generate candidate solution s' from current solution s
  - If E(s') < E(s): accept (downhill move)
  - If E(s') > E(s): accept with probability exp(-(E(s')-E(s))/T)
```

High T → accept almost anything (exploration)
Low T → accept only improvements (exploitation)
Cooling schedule: T(t) decreases over time

### 2.3 Mapping to Circadian

| Annealing Concept | Circadian Analog |
|-------------------|------------------|
| Energy E(s) | Negative utility of rendered population |
| Temperature T | Probability of surfacing below-floor beliefs |
| Candidate generation | Select atom for potential inclusion |
| Acceptance | Actually render/surface in a session |
| Cooling schedule | How T changes over time |

**What is the "energy function"?** This is the key question. Options:
- **Relevance**: How relevant is the belief to current work?
- **Coherence**: How well does the population cohere as a whole?
- **Utility**: How often do rendered beliefs propagate?

The spec's answer (POPULATION-MEMORY.md §7 R7): **"Motion is the metric — memory earns residence by causing thoughts."** The energy function is implicitly **negative propagation rate**.

### 2.4 Boltzmann Selection

Instead of greedy weight-based selection, use **Boltzmann selection**:

```
P(select atom i) ∝ exp(weight_i / T)
```

At T→0: Deterministic (current behavior — highest weight wins)
At T→∞: Uniform random (all atoms equally likely)
At intermediate T: Soft selection biased toward high weight

This naturally emerges from the statistical mechanics interpretation: weight = negative energy, T = temperature.

---

## 3. The Gap

### 3.1 What's Missing

1. **No exploration mechanism**: The system has no way to test low-weight beliefs
2. **No temperature parameter**: All selection is deterministic
3. **No cooling schedule**: No concept of "annealing phases"
4. **No measurement of annealing success**: No metric for "did the anneal help?"

### 3.2 Structural Constraints

The five sentences (POPULATION-MEMORY.md §2) constrain the design:
1. Beliefs are immutable weighted atoms ✓
2. Recurrence bumps weight instead of adding copies ✓
3. Forgetting is a nightly multiply ✓
4. SELF.md is a deterministic render of the top of the population ← **tension here**
5. The model compares atoms — it never composes the document ✓

Sentence #4 says "deterministic render." But the *selection* can be stochastic while the *rendering* (formatting, output) remains deterministic given a selection.

---

## 4. The Intervention

### 4.1 Core Mechanism: Temperature-Gated Exploration

Add a temperature parameter `T` that controls atom selection:

```typescript
// render.ts — new export
export interface RenderOptions {
  budgets?: Partial<RenderBudgets>;
  temperature?: number;  // 0 = deterministic (current), >0 = exploration
}

// Selection probability for atom with weight w at temperature T
function selectionProbability(w: number, T: number): number {
  if (T <= 0) return w;  // Deterministic ranking
  return Math.exp(w / T);
}
```

### 4.2 Implementation Sketch: Boltzmann Selection

In `renderSelf()` (`render.ts:110-154`), replace the greedy loop:

```typescript
// CURRENT (greedy, lines 135-143):
for (const atom of eligible) {
  const line = renderAtomLine(atom);
  const cost = tokensOf(line);
  if (used + cost > budget) break;  // Stop at first overflow
  selectedLines.push(line);
  used += cost;
  manifest.push({ address: `${section.addressPrefix}[${selectedLines.length}]`, atom: atom.id });
}

// PROPOSED (Boltzmann selection):
const T = options?.temperature ?? 0;
const selected = boltzmannSelect(eligible, states, budget, T, tokensOf, renderAtomLine);
for (const atom of selected) {
  const line = renderAtomLine(atom);
  selectedLines.push(line);
  manifest.push({ address: `${section.addressPrefix}[${selectedLines.length}]`, atom: atom.id });
}
```

The `boltzmannSelect` function:

```typescript
function boltzmannSelect(
  eligible: Atom[],
  states: Map<string, AtomState>,
  budget: number,
  T: number,
  tokensOf: (s: string) => number,
  renderAtomLine: (a: Atom) => number
): Atom[] {
  if (T <= 0) {
    // Deterministic: current greedy behavior
    // ... existing code ...
  }
  
  // Stochastic: Boltzmann sampling without replacement
  const remaining = [...eligible];
  const selected: Atom[] = [];
  let used = 0;
  
  while (remaining.length > 0) {
    // Compute selection probabilities
    const probs = remaining.map(a => {
      const w = states.get(a.id)?.weight ?? 0;
      return Math.exp(w / T);
    });
    const total = probs.reduce((a, b) => a + b, 0);
    
    // Sample one atom
    let r = Math.random() * total;
    let idx = 0;
    while (idx < probs.length - 1 && r > probs[idx]) {
      r -= probs[idx];
      idx++;
    }
    
    const candidate = remaining[idx];
    const line = renderAtomLine(candidate);
    const cost = tokensOf(line);
    
    if (used + cost > budget) {
      // Remove this atom from consideration (doesn't fit)
      remaining.splice(idx, 1);
      continue;
    }
    
    selected.push(candidate);
    used += cost;
    remaining.splice(idx, 1);
  }
  
  return selected;
}
```

### 4.3 Cooling Schedules

The temperature should decrease over time. Options:

**A. Linear cooling**
```
T(t) = T_max * (1 - t/t_max)
```
Simple, but may cool too fast early or too slow late.

**B. Exponential cooling**
```
T(t) = T_max * α^t,  where α ∈ (0,1)
```
Standard choice. α=0.95 gives ~50% reduction every 14 cycles.

**C. Adaptive cooling (recommended)**
```
if (propagation_rate > target):
  T *= 0.9  // Cool faster — exploration found good stuff
else:
  T *= 1.05  // Warm up — need more exploration
```
This is **reheat** or **adaptive simulated annealing** — if the system isn't finding good beliefs, increase temperature.

### 4.4 The RENDER_FLOOR Question

Currently, atoms below `RENDER_FLOOR = 0.5` never render. With annealing:

**Option A: Keep floor, heat above it**
- Temperature only affects selection among above-floor atoms
- Below-floor atoms stay invisible
- Problem: Doesn't help truly buried beliefs

**Option B: Probabilistically include below-floor atoms**
```typescript
const effectiveFloor = RENDER_FLOOR * (1 - Math.exp(-1/T));
// At T=0: floor=0.5 (current)
// At T=1: floor≈0.18
// At T=2: floor≈0.07
// At T→∞: floor→0
```
This lowers the floor during high-temperature phases.

**Option C: Separate "exploration slots"**
- Reserve 1-2 render slots per section for below-floor atoms
- Select these purely stochastically (uniform or inverse-weight weighted)
- These are explicitly marked as "exploration" in the manifest

Recommendation: **Option C** — explicit, measurable, doesn't corrupt the main render.

### 4.5 Where Temperature Lives

Temperature needs persistent state (survives across REM cycles). Options:

1. **In ledger** (new event type): `{ev: "temperature", T: 1.5, ts: "..."}`
2. **In scoreboard**: Add `temperature` field to rem events
3. **Separate state file**: `mind/annealing-state.json`

Recommendation: **Ledger event** — the ledger is already the source of truth for population dynamics.

---

## 5. Integration Points

### 5.1 File Changes

| File | Change |
|------|--------|
| `src/atoms.ts` | Add `temperature` ledger event type to `LedgerEvent` union |
| `src/render.ts` | Add `temperature` option, implement Boltzmann selection |
| `src/decay.ts` | Add temperature update logic (cooling/reheating) |
| `src/rem-popmem.ts` | Pass temperature to render, record exploration outcomes |

### 5.2 New Ledger Event

```typescript
// atoms.ts:45-53
export interface LedgerEvent {
  ev: "stack" | "decay" | "potentiate" | "supersede" | "temperature";  // + temperature
  ts: string;
  atom?: string;
  ep?: string;
  factor?: number;
  winner?: string;
  loser?: string;
  T?: number;  // for temperature events
}
```

### 5.3 Manifest Extension

Track which atoms were selected via exploration vs deterministic:

```typescript
// render.ts:100-103
export interface RenderManifestEntry {
  address: string;
  atom: string;
  exploratory?: boolean;  // NEW: true if selected via temperature noise
}
```

### 5.4 Propagation Feedback

In `rem-popmem.ts:591-637`, the propagation judgment already records which addresses propagated. Extend to measure:

```typescript
// After propagation judgment
const exploratoryPropagated = propagatedAddresses.filter(addr => {
  const entry = manifest.find(m => m.address === addr);
  return entry?.exploratory;
}).length;
const exploratoryTotal = manifest.filter(m => m.exploratory).length;

// Record this for cooling schedule feedback
```

---

## 6. Risks and Edge Cases

### 6.1 Determinism vs Reproducibility

**Risk**: Stochastic selection breaks byte-identical renders.

**Mitigation**: 
- Always allow `T=0` mode for deterministic renders (tests, verification)
- R8 invariant (`rem-popmem.ts:460-465`) runs with `T=0`
- Use seeded RNG for reproducibility in tests

### 6.2 Cooling Too Fast

**Risk**: If temperature drops to 0 quickly, the system returns to local minimum.

**Mitigation**: 
- Set minimum temperature `T_min > 0` (e.g., 0.1)
- Use adaptive cooling — never cool if propagation rate is below target

### 6.3 Heating Too Much

**Risk**: High temperature makes render random, breaks user trust.

**Mitigation**:
- Cap exploration slots (e.g., max 2 per section)
- Mark exploratory atoms visually in SELF.md (e.g., with a `*` prefix)
- User can set `--no-exploration` flag

### 6.4 Spec Compliance

**Risk**: "SELF.md is a deterministic render" (sentence #4) — does annealing violate this?

**Resolution**: The render *process* is deterministic given inputs (atoms, states, T). The stochasticity is in T itself (a controlled input), not in the render function. This is analogous to: the hash function is deterministic, but which inputs you hash is your choice.

### 6.5 No Below-Floor Atoms Yet

Current state: 0 atoms below floor. This means:
- No urgency — all atoms are rendering
- But decay will eventually push some below (the bottom 32 at w≈0.66 are only 1-2 decay cycles from floor)
- The exploration mechanism should be in place before atoms start sinking

---

## 7. Implementation Sketch

### 7.1 Phase 1: Infrastructure

1. Add `temperature` event to ledger schema (`atoms.ts`)
2. Add `foldTemperature(events)` to read current T from ledger
3. Add `temperature` parameter to `renderSelf()` options
4. Add exploration slot logic (separate from main selection)

### 7.2 Phase 2: Core Annealing

1. Implement Boltzmann selection in `render.ts`
2. Add exploration outcome tracking to manifest
3. Extend propagation judgment to measure exploratory propagation rate
4. Implement adaptive cooling in `decay.ts`

### 7.3 Phase 3: Observability

1. Add temperature to `status.ts --line` (e.g., `T=0.5`)
2. Add exploration metrics to REM commit message
3. Add daily reading metrics for annealing health

### 7.4 Knobs

```typescript
// Proposed constants (all configurable)
export const T_INITIAL = 1.0;       // Starting temperature
export const T_MIN = 0.1;           // Never cool below this
export const T_MAX = 3.0;           // Never heat above this
export const COOLING_RATE = 0.95;   // Multiplicative per cycle
export const HEATING_RATE = 1.05;   // When propagation is low
export const EXPLORATION_SLOTS = 2; // Per section
export const PROPAGATION_TARGET = 0.2; // 20% of exploratory atoms should propagate
```

---

## 8. Success Criteria

1. **Measurable exploration**: After implementation, the manifest shows exploratory atoms
2. **Exploration propagates**: At least some exploratory atoms earn propagation hits
3. **Adaptive behavior**: Temperature adjusts based on propagation feedback
4. **No regression**: R8 invariant still passes (with T=0)
5. **Stable equilibrium**: System settles to a temperature that balances exploration/exploitation
6. **Diversity increase**: Over time, more distinct atoms render (measured by unique atom count in manifests)

---

## 9. Open Questions for the Brief

1. **What is the target propagation rate for exploratory atoms?** 
   - If 0% propagate, the exploration is noise
   - If 50%+ propagate, we're not exploring hard enough

2. **Should exploration be per-section or global?**
   - Per-section ensures each kind gets exploration
   - Global allows more flexibility but might ignore some kinds

3. **Visual marking of exploratory atoms?**
   - Mark them in SELF.md (transparency)
   - Or silent exploration (cleaner but less observable)

4. **Minimum time before cooling?**
   - Wait N cycles at each temperature before deciding to cool?
   - Or adapt immediately based on each cycle's feedback?

---

## References

- `src/atoms.ts:295-340` — `foldWeights` (current weight dynamics)
- `src/render.ts:110-154` — `renderSelf` (current selection)
- `src/decay.ts:50` — `DECAY_FACTOR = 0.95`
- `src/rem-popmem.ts:591-637` — propagation judgment
- `docs/POPULATION-MEMORY.md` — the spec (five sentences, R1-R11)
- Kirkpatrick et al. (1983), "Optimization by Simulated Annealing" — the foundational paper
