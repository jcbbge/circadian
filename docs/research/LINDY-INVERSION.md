# Research: Inverting the Lindy Filter

> Exploring whether old beliefs that survive decay should gain weight, not lose it.

## 1. Current State — How Decay Works Now

### The Weight Model (`src/atoms.ts:295-341`)

Weight is computed by **folding** the ledger, never stored directly:

```
weight starts at 0
stack{atom}:      weight += 1
potentiate{atom}: weight += 1
decay{factor}:    weight *= 0.95 (for all ever-stacked atoms)
supersede:        loser's weight transfers to winner
```

### The Decay Process (`src/decay.ts:50`)

- **DECAY_FACTOR = 0.95** applied nightly
- A decay event multiplies ALL atoms that have ever been stacked
- Below **RENDER_FLOOR = 0.5**, atoms leave the render but files persist ("defocus, never delete")
- Computed consequence: an unused singleton belief renders for ~13 nights before defocusing (from POPULATION-MEMORY.md §11)

### Current Weight Distribution (from ledger analysis)

| Metric | Value |
|--------|-------|
| Total atoms | 84 |
| Active atoms | 84 |
| Weight range | 0.663 - 58.49 |
| Decay events applied | 8 |

Top atoms by weight:
- `82b31f787458`: w=58.49, 12 stacks, first seen 2026-07-24
- `6ed0b774ec2a`: w=56.50, 5 stacks, first seen 2026-07-24
- `83e65cb841d0`: w=17.36, 11 stacks, first seen **2026-06-17** (oldest)

Bottom active atoms:
- Multiple at w=0.66: all with 1 stack, first seen 2026-07-27/28

### Tenure Detection — What Data Exists

The atom itself carries:
- `eps: string[]` — episode dates when the belief was reinforced (`[ep:YYYY-MM-DD]`)
- `quotes[].source` — source episode filenames

The ledger carries:
- `stack{atom, ep, ts}` — the **first stack event** serves as `first_seen`
- Timestamp progression allows computing "days since first seen"

**Critical insight:** Tenure is DERIVABLE but not explicit. The earliest `stack` event for an atom is its birth date. The earliest `[ep:]` date is its conceptual origin.

Example from `83e65cb841d0.md`:
```
[ep:2026-06-17]  <- conceptual origin (oldest ep date)
[ep:2026-07-24]  <- later reinforcement
...
```

This is the oldest belief in the system (41 days old as of 2026-07-30) and it has survived 8 decay cycles.

---

## 2. The Gap — What Lindy Inversion Would Address

### The Lindy Effect

> The longer something has survived, the longer it will survive.

Applied to beliefs:
- A doctrine held for 40 days that hasn't decayed below floor is **battle-tested**
- It's been through ~40 decay cycles × 0.95 = 0.95^40 ≈ 0.13 decay factor
- Yet it persists because it keeps getting reinforced (stacked/potentiated)
- This survival IS signal — the system keeps finding it relevant

### Current System Bias

The current model is **recency-biased**:
- A belief stacked 12 times yesterday has weight ~12
- A belief stacked once 40 days ago, reinforced once per week, has accumulated decay
- The old belief may be MORE durable but LOOK weaker

### What's Missing

No mechanism to say: "This belief has been around for N days and hasn't died — that survival itself is evidence of truth/utility, weight it accordingly."

---

## 3. The Intervention — Tenure-Based Weight Bonus

### Tenure Detection Implementation

```typescript
// In atoms.ts or a new tenure.ts

interface AtomTenure {
  id: string;
  firstSeenTs: string;      // from first stack event
  oldestEpDate: string;     // from min(atom.eps)
  ageInDays: number;        // computed
  decayCyclesSurvived: number;
}

function computeTenure(events: LedgerEvent[], atoms: Atom[], asOf: Date): Map<string, AtomTenure> {
  const firstSeen = new Map<string, string>();
  let decayCount = 0;
  
  for (const ev of events) {
    if (ev.ev === "stack" && ev.atom && !firstSeen.has(ev.atom)) {
      firstSeen.set(ev.atom, ev.ts);
    }
    if (ev.ev === "decay") decayCount++;
  }
  
  const tenures = new Map<string, AtomTenure>();
  for (const atom of atoms) {
    const ts = firstSeen.get(atom.id);
    const oldestEp = atom.eps.sort()[0]; // lexicographic = chronological for YYYY-MM-DD
    const ageMs = ts ? asOf.getTime() - new Date(ts).getTime() : 0;
    const ageInDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
    
    tenures.set(atom.id, {
      id: atom.id,
      firstSeenTs: ts || "",
      oldestEpDate: oldestEp,
      ageInDays,
      decayCyclesSurvived: decayCount // crude: assumes atom existed for all cycles
    });
  }
  return tenures;
}
```

### The Lindy Bonus Formula

**Option A: Additive bonus after threshold**
```typescript
const TENURE_THRESHOLD_DAYS = 30;
const LINDY_BONUS_PER_DAY = 0.1;

function lindyBonus(ageInDays: number): number {
  if (ageInDays < TENURE_THRESHOLD_DAYS) return 0;
  return (ageInDays - TENURE_THRESHOLD_DAYS) * LINDY_BONUS_PER_DAY;
}

// effective_weight = folded_weight + lindyBonus(age)
```

**Option B: Multiplicative survival credit**
```typescript
// Counteract decay for survivors
// If decay = 0.95^n, Lindy says weight *= 1/0.95^(n - threshold)
const TENURE_THRESHOLD_CYCLES = 10;

function lindyMultiplier(cyclesSurvived: number): number {
  if (cyclesSurvived < TENURE_THRESHOLD_CYCLES) return 1;
  const excessCycles = cyclesSurvived - TENURE_THRESHOLD_CYCLES;
  return Math.pow(1 / DECAY_FACTOR, excessCycles);
}
```

**Option C: Asymptotic floor elevation**
```typescript
// Old beliefs can never sink below a tenure-based floor
const BASE_FLOOR = 0.5;
const TENURE_FLOOR_BONUS = 0.02; // per day past threshold

function dynamicFloor(ageInDays: number): number {
  if (ageInDays < TENURE_THRESHOLD_DAYS) return BASE_FLOOR;
  return BASE_FLOOR + (ageInDays - TENURE_THRESHOLD_DAYS) * TENURE_FLOOR_BONUS;
}
```

### Integration Points

1. **`foldWeights()` in atoms.ts:295** — Add tenure bonus after folding raw events
2. **`renderSelf()` in render.ts:110** — Use tenure-aware weights for selection
3. **New ledger event type** (optional): `{ev: "lindy-credit", atom, bonus, ts}`
4. **Vitals extension** in decay.ts — Report tenure distribution

### Threshold Tuning

| Threshold | Rationale |
|-----------|-----------|
| 30 days | ~1 month — belief survived a full attention cycle |
| 10 REM cycles | ~5 days if REM runs twice daily |
| "Never bumped but never sank" | Pure survival signal — no active reinforcement but still above floor |

The "never bumped but never sank" criterion is interesting:
```typescript
function isPureSurvivor(id: string, events: LedgerEvent[], state: AtomState): boolean {
  const stacks = events.filter(e => e.ev === "stack" && e.atom === id).length;
  const potentiates = events.filter(e => e.ev === "potentiate" && e.atom === id).length;
  return stacks === 1 && potentiates === 0 && state.weight >= RENDER_FLOOR;
}
```

---

## 4. Risks

### 4.1 Ossification — Beliefs Becoming Immortal

**Risk:** Old beliefs accumulate so much Lindy credit they can never be displaced, even when wrong.

**Mitigations:**
- Cap the Lindy bonus (e.g., max 2x base weight)
- Require active reinforcement alongside age (hybrid: tenure + recent activity)
- `supersede` explicitly transfers weight, so a SUPERSEDES_A verdict still works
- Decay still applies — Lindy just counteracts it for survivors

### 4.2 Stale Beliefs Persisting

**Risk:** A belief true in 2026-06 becomes false by 2026-12 but its age keeps it prominent.

**Mitigations:**
- The COMPARE comparator can still emit SUPERSEDES_A/B
- Weight from Lindy is additive/multiplicative, not absolute immunity
- Consider a "staleness" counter: days since last reinforcement

### 4.3 Complexity Creep

**Risk:** Adding a tenure layer violates "the cliff" doctrine (Doctrine[1]).

**Mitigations:**
- Tenure is DERIVED, not a new store — zero new files
- The bonus is ONE function call in foldWeights or renderSelf
- No new ledger event types needed (optional enrichment only)

### 4.4 Breaking Idempotence

**Risk:** Tenure depends on "as of" date — render(beliefs/) would vary by day.

**Mitigation:** Tenure bonus computed at fold time with explicit `asOf` parameter. For deterministic renders, pass a fixed timestamp. For live renders, pass `now`.

---

## 5. Implementation Sketch

### Phase 1: Observability (no behavior change)

```typescript
// decay.ts — extend vitals with tenure stats
const vitals = {
  ts: runTs,
  src_loc: srcLoc,
  population: atoms.length,
  top_weight: ...,
  // NEW
  oldest_atom: { id, age_days, weight },
  tenure_distribution: {
    "<7d": count,
    "7-30d": count,
    ">30d": count
  }
};
```

### Phase 2: Experimental Lindy Bonus

```typescript
// atoms.ts — new export

export const LINDY_THRESHOLD_DAYS = 30;
export const LINDY_BONUS_CAP = 10; // max bonus weight

export function applyLindyBonus(
  states: Map<string, AtomState>,
  tenures: Map<string, AtomTenure>
): Map<string, AtomState> {
  const result = new Map<string, AtomState>();
  for (const [id, state] of states) {
    const tenure = tenures.get(id);
    if (!tenure || tenure.ageInDays < LINDY_THRESHOLD_DAYS) {
      result.set(id, state);
      continue;
    }
    const excessDays = tenure.ageInDays - LINDY_THRESHOLD_DAYS;
    const bonus = Math.min(excessDays * 0.1, LINDY_BONUS_CAP);
    result.set(id, { ...state, weight: state.weight + bonus });
  }
  return result;
}
```

### Phase 3: Integration

```typescript
// render.ts changes
export function renderSelf(
  atoms: Atom[],
  states: Map<string, AtomState>,
  budgets?: Partial<RenderBudgets>,
  options?: { asOf?: Date; applyLindy?: boolean }
): RenderResult {
  let effectiveStates = states;
  if (options?.applyLindy) {
    const tenures = computeTenure(/* need events */, atoms, options.asOf || new Date());
    effectiveStates = applyLindyBonus(states, tenures);
  }
  // ... rest of render logic uses effectiveStates
}
```

### Phase 4: A/B Comparison

Before full rollout, generate two renders:
1. `SELF-baseline.md` — current weights
2. `SELF-lindy.md` — with Lindy bonus

Diff them. Which beliefs moved? Are the promotions sensible?

---

## 6. Open Questions for Brief

1. **Which formula?** Additive bonus vs multiplicative vs floor elevation?
2. **Threshold calibration?** 30 days is arbitrary — should it be based on observed survival curves?
3. **Hybrid criteria?** Require tenure AND recent activity (e.g., potentiated in last 7 days)?
4. **Ledger purity?** Should Lindy bonus be a new ledger event, or purely computed at render time?
5. **Supersede interaction?** When atom A supersedes B, does A inherit B's tenure?

---

## 7. References

- `src/atoms.ts:295-341` — foldWeights implementation
- `src/decay.ts:50` — DECAY_FACTOR constant
- `src/render.ts:52` — RENDER_FLOOR constant
- `src/render.ts:110` — renderSelf selection logic
- `docs/POPULATION-MEMORY.md §11` — decay-rate risk discussion
- `mind/beliefs.jsonl` — 574 events, 8 decay cycles applied
- Taleb, N.N. — *Antifragile* (2012), esp. Ch. 18 "On the Difference Between a Large Stone and a Thousand Pebbles"
- The Lindy Effect — originally from "Lindy's Law" re: comedians' career longevity
