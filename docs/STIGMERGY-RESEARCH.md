# STIGMERGY RESEARCH — Distributed Memory as Codebase Structure

**Status:** Research artifact  
**Date:** 2026-07-30  
**Context:** Exploring stigmergy (ant-colony pheromone trails) as an alternative to circadian's central belief store

---

## 1. Current State

### The Centralized Model

Circadian v.next (population memory) uses a **central belief store**:

```
mind/beliefs/           # 84 atom files, content-addressed
mind/beliefs.jsonl      # append-only ledger (574 events)
```

The architecture follows these five sentences (MIND-SPEC.v.next.md):
1. Beliefs are immutable weighted atoms.
2. Recurrence bumps weight instead of adding copies.
3. Forgetting is a nightly multiply.
4. `SELF.md` is a deterministic render of the top of the population.
5. The model compares atoms — it never composes the document.

Weight is `fold(ledger)` — never stored, always computed. An atom like `83e65cb841d0.md` holds the belief text; the ledger holds `stack`, `potentiate`, `decay`, `supersede` events that determine its weight.

### Where Beliefs Already Live Distributed

The codebase **already contains embedded beliefs** — they're just not harvested:

1. **Law references in code comments** (30+ occurrences in `src/*.ts`):
   ```typescript
   // src/wake.ts
   // wake.ts is a specific cook: it does file reads and exits 0 per Law 7.
   
   // src/obs.ts
   // A silent failure is a discontinuity event — a letter never written
   
   // src/stack.ts
   // Law 9: every episode processed emits exactly one aggregate obs event
   ```

2. **Commit messages as belief assertions**:
   ```
   feat(circadian/atoms): WS-B — immutable atom store, append-only ledger
   fix(sleep): sever the autophagic loop — provenance guard + mind-echo redaction
   test(mutate): CONFIRM invariant tracks the living document
   ```

3. **Test names as behavioral contracts**:
   ```
   "manifest addresses match rem.ts's SELF.Doctrine[n]/SELF.Motifs[n] format"
   "--line never appends to logs/circadian.events.jsonl — obs-silent by design"
   ```

4. **Function/file docstrings** carry complete "why" chains:
   ```typescript
   /**
    * obs.ts — the observability spine of Circadian.
    * DOCTRINE: Nothing goes silent. There are no unknown failures.
    */
   ```

---

## 2. The Gap

### Central Store vs. Distributed Truth

The **central belief store is authoritative** but **the codebase is where beliefs are actually enforced**. The gap:

| Aspect | Central Store (`mind/beliefs/`) | Codebase (`src/`, commits, tests) |
|--------|--------------------------------|-----------------------------------|
| Claims | `"Motion is the metric..."` | `// Law 6: motion is the metric` |
| Provenance | `[ep:2026-07-24]` → episode | commit hash → change context |
| Weight | `fold(ledger)` | frequency of reference? enforcement severity? |
| Decay | nightly ×0.95 | organic (refactors remove dead code) |
| Verification | render invariant | tests pass/fail |

**The mind repo is a cache; the codebase is the territory.**

### Stigmergy: Indirect Coordination

In ant colonies:
- **No central memory** — individual ants have no global view
- **Pheromone trails** — deposited when food found, evaporate over time
- **Positive feedback** — more ants follow stronger trails, reinforcing them
- **Decay is natural** — unused trails evaporate, no cleanup required

The codebase analog:
- **Commit = pheromone deposit** — a belief that changed behavior
- **Co-location = trail strength** — beliefs referenced in many places are "strong"
- **Test green = reinforcement** — the belief continues to hold
- **Refactor/delete = evaporation** — dead code removal is natural decay

---

## 3. The Intervention

### Thesis: Codebase as Memory Substrate

Instead of:
```
Episode → EXTRACT → atoms → ledger → render → SELF.md
```

Consider:
```
Codebase → HARVEST → derived beliefs → SELF.md as index
```

The mind repo becomes a **computed view** of beliefs embedded in:
1. Code comments with explicit `Law N:` or `Doctrine[N]:` markers
2. Commit messages (especially those with `INVARIANT:` or `PRINCIPLE:`)
3. Test names and assertions
4. File organization and naming conventions

### Concrete Harvesting Strategy

**Phase 1: Extract from Code Comments**
```bash
# Find Law references
grep -rn "Law [0-9]" src/*.ts
# ~30 occurrences currently

# Find explicit doctrine markers
grep -rn "Doctrine\[" src/*.ts
# ~80 occurrences
```

Pattern: `// Law N: <claim>` or `// Doctrine[N]: <claim>`

**Phase 2: Extract from Commit Messages**
```bash
git log --oneline --all | grep -E 'INVARIANT|Law|Doctrine|PRINCIPLE'
```

Parse: `type(scope): description` → scope is subject, description is claim

**Phase 3: Extract from Test Names**
```typescript
test("render(archive) == committed SELF.md, byte-identical", () => {})
// → Belief: "render(archive) must equal committed SELF.md byte-identical"
```

**Phase 4: Weight = Reference Frequency**

```typescript
interface DistributedBelief {
  claim: string;
  sources: Array<{
    type: 'comment' | 'commit' | 'test' | 'docstring';
    location: string;  // file:line or commit:sha
    text: string;
  }>;
  weight: number;  // count(sources) + recency_factor
}
```

**What is the Pheromone?**

Several candidates:
1. **Explicit markers** — `Law N:`, `Doctrine[N]:`, `INVARIANT:`
2. **Co-occurrence** — beliefs mentioned in the same file/commit
3. **Enforcement severity** — appears in a test = stronger than comment
4. **Recency** — recent commits > old commits (git log ordering)

---

## 4. Implementation Sketch

### New Module: `src/harvest.ts`

```typescript
#!/usr/bin/env bun
/**
 * harvest.ts — stigmergic belief extraction from codebase structure
 * 
 * Reads beliefs from where they are ENFORCED, not where they are DECLARED:
 *   - Code comments with Law/Doctrine markers
 *   - Commit messages with belief assertions
 *   - Test names as behavioral contracts
 *   - Docstrings with "why" chains
 * 
 * The codebase IS the memory. This module reads it.
 */

interface HarvestedBelief {
  claim: string;
  marker: string;  // "Law 7" | "Doctrine[1]" | "INVARIANT"
  sources: Source[];
  weight: number;
}

interface Source {
  type: 'code-comment' | 'commit-message' | 'test-name' | 'docstring';
  path: string;
  line?: number;
  sha?: string;
  text: string;
  timestamp?: string;
}

// Harvest from code comments
function harvestCodeComments(srcDir: string): HarvestedBelief[] {
  // grep for "Law [0-9]:", "Doctrine[", "INVARIANT:"
  // parse surrounding context
  // group by normalized claim
}

// Harvest from git history
function harvestCommits(repoPath: string, limit: number): HarvestedBelief[] {
  // git log --format='%H %s'
  // parse commit messages for belief patterns
  // weight by recency (newer = heavier)
}

// Harvest from test names
function harvestTests(testFiles: string[]): HarvestedBelief[] {
  // parse test("...", () => {}) strings
  // extract behavioral claims
}

// Compute weights
function computeWeight(sources: Source[]): number {
  let w = 0;
  for (const s of sources) {
    w += s.type === 'test-name' ? 3 : 1;  // tests are stronger enforcement
    w += s.type === 'commit-message' ? 2 : 0;  // commits are explicit decisions
    // recency factor: decay by age
  }
  return w;
}
```

### Modified Render Pipeline

```
harvest.ts                 atoms.ts (existing)
     │                           │
     ▼                           ▼
distributed beliefs      central beliefs
     │                           │
     └──────────┬────────────────┘
                │
                ▼
           merge(d, c)
                │
                ▼
           render.ts
                │
                ▼
           SELF.md
```

The central store becomes a **fallback** for beliefs not yet embedded in code.

### Migration Path

1. **Harvest current codebase** → find beliefs already distributed
2. **Diff against central store** → identify gaps
3. **For each gap**: either
   - The belief should be embedded (add Law marker to relevant code)
   - The belief is obsolete (it's not enforced anywhere)
4. **mind/beliefs/** becomes read-only, then historical

---

## 5. Risks

### Fragmentation
- **Risk:** Beliefs scattered across 100 files, no single source of truth
- **Mitigation:** SELF.md remains the rendered view; `harvest.ts` is the indexer

### Archaeology Required
- **Risk:** Understanding a belief requires `git log`, `grep`, cross-referencing
- **Mitigation:** Each harvested belief carries its full source chain

### Inconsistent Phrasing
- **Risk:** Same Law referenced differently in different places
- **Mitigation:** Canonical marker (`Law 7:`) normalizes; variants are sources

### Loss of Why-Chains
- **Risk:** Code comments are terse; episodes have rich context
- **Mitigation:** Episodes remain the originating source; code comments are tellings

### Decay is Invisible
- **Risk:** A refactor silently removes a belief's last enforcement
- **Mitigation:** Harvest runs in CI; delta from previous harvest is reported

---

## 6. Open Questions

1. **What makes a code comment a "belief" vs. just documentation?**
   - Proposal: explicit markers (`Law N:`, `Doctrine[N]:`, `INVARIANT:`)
   - Alternative: any comment that makes a claim about how the system SHOULD behave

2. **How do superseded beliefs work?**
   - In the current model: `supersede{winner,loser}` event
   - In stigmergy: the old comment is deleted/refactored; natural evaporation

3. **Can this coexist with the current system?**
   - Yes: harvest.ts reads codebase, atoms.ts reads central store, render merges
   - The merge function prioritizes distributed (enforced) over central (declared)

4. **What about beliefs that don't belong in code?**
   - Identity beliefs ("who I am across sessions") may not have code enforcement
   - These remain in the central store as "axioms"

---

## 7. The Deeper Pattern

Stigmergy inverts the memory model:

| Central Store | Stigmergy |
|---------------|-----------|
| Write beliefs → enforce later | Enforce beliefs → harvest later |
| Explicit deposit | Implicit deposit (the change IS the trail) |
| Explicit decay (nightly ×0.95) | Natural decay (refactor removes) |
| Single source of truth | Distributed truth, computed index |
| Archive holds history | Git holds history |

The **territory is the map**. The codebase isn't a place where beliefs are implemented — it IS the belief system. `SELF.md` becomes an index into the codebase, not a document that describes it.

---

## 8. Verdict

**This is not a replacement for population memory — it's an extension.**

The population memory model solved the "editor problem" (LLM with a pen creates pathologies). Stigmergy solves the "two sources of truth" problem (beliefs declared in `mind/` but enforced in `src/`).

**Recommended next step:** Build `harvest.ts` as a read-only probe. Run it against the current codebase. Compare harvested beliefs to the central store. The delta tells us:
1. Which central beliefs are actually enforced (keep them)
2. Which are orphaned declarations (sunset candidates)
3. Which codebase beliefs aren't in the central store (add them, or accept they're implicit)

The mind repo may not become redundant, but it should become *derivable*.
