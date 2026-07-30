# Counterfactual Dreaming — Research Document

> Research for potential enhancement of the Circadian memory system's REM cycle

**Date:** 2026-07-30  
**Status:** Research / Pre-brief  
**Related:** `docs/POPULATION-MEMORY.md`, `src/rem-popmem.ts`, `src/stack.ts`

---

## 1. Current State

### 1.1 The REM Cycle as Implemented

The circadian system's REM process (`src/rem-popmem.ts:1-838`) performs a scheduled digestion cycle:

```
stack(new episodes) -> propagation judgment -> decay -> render -> greeting -> commit
```

**Key operations:**
1. **ABSORB**: Episodes → EXTRACT (via LLM) → candidate atoms → dedupe → ledger writes
2. **PROPAGATION**: Which beliefs propagated into new episodes? (LLM judgment)
3. **DECAY**: Weight ×= 0.95 nightly; potentiation from propagation events
4. **RENDER**: `SELF.md = fold(beliefs/)` — deterministic, top-weight atoms rendered

**What REM currently does NOT do:**
- Generate synthetic episodes
- Test beliefs against counterfactuals
- Stress-test the worldview with hypothetical scenarios
- Distinguish between fragile and robust beliefs

### 1.2 The Episode → Atom Pipeline

Episodes are produced by SLEEP (`src/sleep.ts:1-1092`) from real session transcripts:

```
transcript → LLM drafting → episode file (verbatim quotes required) → REM stacking
```

The stacker (`src/stack.ts:1-799`) extracts atoms with strict provenance:
- Every quote must appear VERBATIM in the source episode (counterfeit-quote assert, line 194)
- Source and `[ep:]` stamps are injected from known facts, never model-generated
- The model only extracts claim/why/quote text — provenance is never hallucinated

**Critical invariant:** Every belief traces to a real episode with real quotes from real sessions.

---

## 2. The Hypothesis: Dreams as Counterfactual Simulation

### 2.1 Neuroscience Background

**Revonsuo's Threat Simulation Theory** (2000):
> "Dreams serve the biological function of rehearsing possibly threatening situations in order to aid survival."

Six propositions from Revonsuo's framework (mapped to memory systems):
1. Dreams embody an "organized and selective simulation of the perceptual world"
2. Daily life is absent; bias toward **threatening/critical situations**
3. Real traumatic experiences trigger simulations of responses
4. Simulated content feels realistic and provides **effective practice**
5. Skills learned in dreams transfer to waking performance (implicit learning)
6. The system was **selected for** during evolutionary history

**Erik Hoel's Overfitting Hypothesis** (2021):
> "Dreams prevent overfitting to past experiences; they enable the dreamer to learn from novel situations."

Hoel frames dreams as **regularization** in the machine-learning sense: the brain's way of preventing its world-model from becoming too specialized to the exact experiences it has had, making it fragile to variation.

**Counterfactual Thinking** (Kahneman & Tversky, 1982):
- Upward counterfactuals: "How could it have been better?" → preparative function
- Downward counterfactuals: "How could it have been worse?" → affective regulation
- Functional: counterfactuals serve goal-directed activity and behavioral correction

### 2.2 The Gap

The current circadian system has **no mechanism to**:

1. **Probe beliefs with perturbations** — "What if jrg had said X instead of Y?"
2. **Generate synthetic stress-tests** — hypothetical scenarios that challenge doctrine
3. **Distinguish fragile beliefs from robust ones** — beliefs that break under counterfactuals vs. those that hold
4. **Practice threat responses** — doctrine about handling edge cases, without waiting for those edges to occur

The system only learns from **what happened**. It never asks **what if something else had happened?**

---

## 3. The Intervention: Synthetic Episode Generator

### 3.1 Concept

A **counterfactual dreaming** phase in REM that:

1. Takes real episodes as seeds
2. Generates **perturbations** — synthetic episodes with deliberate alterations
3. Runs the stacker against these synthetic episodes
4. Observes which beliefs **hold** vs. **contradict** under the perturbation
5. Uses this to **score belief robustness** without altering the canonical population

### 3.2 Perturbation Strategies

| Strategy | Description | Example |
|----------|-------------|---------|
| **Inversion** | Flip a key claim or outcome | "jrg agreed" → "jrg pushed back hard" |
| **Intensification** | Amplify a tendency | "jrg preferred X" → "jrg absolutely insisted on X" |
| **Absence** | Remove a key element | Delete the resolution, leave only the problem |
| **Substitution** | Replace one concept with another | "SolidJS" → "React" — does doctrine hold? |
| **Temporal shift** | Change when something occurred | "After the fix, X" → "Before the fix, X" |
| **Voice swap** | Change who said what | User statement becomes assistant statement |

### 3.3 Validation Loop

```
synthetic_episode = perturb(real_episode, strategy)
candidates = EXTRACT(synthetic_episode)

for candidate in candidates:
    # Does this candidate contradict existing high-weight atoms?
    for existing_atom in population:
        verdict = COMPARE(candidate.claim, existing_atom.claim)
        if verdict == "SUPERSEDES_A":  # synthetic supersedes real
            flag(existing_atom, "fragile under", strategy, synthetic_episode)
        if verdict == "SAME":
            flag(existing_atom, "robust under", strategy, synthetic_episode)
```

**The key output:** A **robustness score** per atom, computed over many counterfactual probes.

### 3.4 Data Structures

```typescript
// New ledger event type
interface ProbeEvent extends LedgerEvent {
  ev: "probe";
  ts: string;
  atom: string;          // atom being probed
  seed_episode: string;  // real episode the synthetic was derived from
  strategy: PerturbStrategy;
  verdict: "robust" | "fragile" | "neutral";
  synthetic_hash: string; // hash of synthetic episode (never persisted as file)
}

// Robustness as a derived metric
interface AtomRobustness {
  atom_id: string;
  total_probes: number;
  robust_count: number;
  fragile_count: number;
  robustness_ratio: number;  // robust / total
}
```

### 3.5 Integration with REM

**Where it fits in the cycle:**

```
stack(new) -> propagation -> decay -> [DREAM] -> render -> greeting -> commit
                                 ^
                                 |
                          counterfactual probing
                          (read-only on beliefs)
```

The dreaming phase:
- Runs AFTER decay (beliefs have current weights)
- Runs BEFORE render (robustness scores could influence render priority)
- Is **read-only** on the belief population — synthetic episodes never create atoms
- Appends **probe events** to a separate ledger (`mind/probes.jsonl`)

---

## 4. Risks

### 4.1 Confabulation Leaking into Real Memory

**The danger:** Synthetic episodes could contaminate the canonical belief population.

**Mitigations:**
1. Synthetic episodes are **never written to disk** — they exist only in memory during the dream phase
2. Synthetic episodes carry a distinct marker (hash prefix, provenance flag) that the stacker rejects
3. The stacker's `quotesAreVerbatim` check would fail for any synthetic that somehow reached it (quotes don't exist in any real episode)
4. Belt-and-suspenders: a digest guard that rejects any episode with a synthetic provenance marker

**Implementation guard** (addition to `stack.ts`):
```typescript
const SYNTHETIC_MARKER = "SYNTHETIC:";
if (episodeContent.startsWith(SYNTHETIC_MARKER)) {
  fail({ /* synthetic episode reached canonical stacker */ });
}
```

### 4.2 Goodhart on Synthetic Data

**The danger:** Optimizing beliefs for robustness against perturbations might make them **generic** — beliefs that survive every counterfactual because they say nothing specific.

**Example of Goodhart collapse:**
- Real doctrine: "Always prefer composition over inheritance"
- Goodhart-collapsed: "Choose the appropriate design pattern for the situation"

The second survives every perturbation because it's unfalsifiable.

**Mitigations:**
1. Robustness is **informational**, not directly used for weight adjustments
2. Track both robustness AND **specificity** (token overlap with source quotes) — a belief must be both robust and specific
3. Human review: surface "maximally robust" atoms as potentially genericized
4. The propagation mechanism (real session use) remains the primary weight driver

### 4.3 Computational Cost

Each perturbation requires:
- 1 EXTRACT call (same as a real episode)
- N COMPARE calls (where N = number of relevant existing atoms)

**Mitigation:** Dream in batches; limit probes per REM cycle; cache COMPARE results for identical claim pairs.

### 4.4 The System Believing Its Own Hallucinations

**The most insidious risk:** A synthetic episode generates a candidate that the COMPARE layer calls "SAME" as an existing atom. The system might interpret this as "validation" of the real atom, when in fact it's circular confirmation from synthetic data.

**Mitigation:**
1. Never count synthetic-vs-real SAME as evidence FOR the real atom
2. Only count synthetic-vs-real SUPERSEDES_A as evidence AGAINST (fragility signal)
3. SAME from synthetic probes is neutral — it means the perturbation didn't break the belief, but doesn't strengthen it

---

## 5. Implementation Sketch

### 5.1 New Files

| File | Purpose |
|------|---------|
| `src/dream.ts` | Counterfactual episode generator + probe runner |
| `src/perturb.ts` | Perturbation strategies (pure functions) |
| `src/robustness.ts` | Robustness scoring from probe ledger |

### 5.2 Perturbation Generator (Pure)

```typescript
// src/perturb.ts

export type PerturbStrategy = 
  | "inversion" 
  | "intensification" 
  | "absence" 
  | "substitution" 
  | "temporal_shift"
  | "voice_swap";

export interface Perturbation {
  strategy: PerturbStrategy;
  seed_episode: string;       // filename
  seed_content: string;       // original content
  synthetic_content: string;  // perturbed content
  synthetic_hash: string;     // content-addressed identity
  mutations: string[];        // what was changed
}

export function generatePerturbations(
  episodeContent: string,
  episodeFilename: string,
  strategies: PerturbStrategy[]
): Perturbation[] {
  // LLM-assisted perturbation, OR deterministic transforms for simple cases
}
```

### 5.3 Dream Runner

```typescript
// src/dream.ts

export interface DreamResult {
  seed_episode: string;
  perturbations_run: number;
  probes: ProbeEvent[];
  fragile_atoms: string[];
  robust_atoms: string[];
}

export async function dream(opts: {
  mindDir: string;
  beliefsDir: string;
  probeLogPath: string;
  maxPerturbationsPerEpisode: number;
  strategies: PerturbStrategy[];
}): Promise<DreamResult[]> {
  // 1. Select recent episodes as seeds
  // 2. Generate perturbations
  // 3. Run EXTRACT on each synthetic (in-memory only)
  // 4. COMPARE synthetic candidates against real population
  // 5. Log probe events
  // 6. Return fragility/robustness signals
}
```

### 5.4 Integration into rem-popmem.ts

```typescript
// After decay, before render
if (!dryRun && enableDreaming) {
  const dreamResults = await dream({
    mindDir: MIND_DIR,
    beliefsDir: BELIEFS_DIR,
    probeLogPath: PROBE_LOG_PATH,
    maxPerturbationsPerEpisode: 3,
    strategies: ["inversion", "absence", "substitution"],
  });
  
  ok({
    process: "rem",
    phase: "dream",
    summary: `dreamed over ${dreamResults.length} episodes, flagged ${flaggedCount} fragile atoms`,
    context: { /* stats */ },
  });
}
```

---

## 6. Open Questions

1. **Should robustness affect render priority?** Currently weight determines what renders. Should robustness be a tiebreaker? A multiplier? Display-only?

2. **How many perturbations per episode?** Too few = noisy signal; too many = computational cost. Start with 3 per recent episode?

3. **Which episodes to dream about?** Most recent? Random sample? Highest-quote-density? Episodes that produced high-weight atoms?

4. **LLM-generated perturbations vs. deterministic transforms?** LLM can generate semantically meaningful inversions but adds hallucination risk to the perturbation layer itself.

5. **Should fragile atoms surface in the greeting?** "This belief may not hold under X" as a caveat?

6. **Provenance chain for probes?** The probe ledger references synthetic hashes that don't exist as files. Is this sufficient, or do we need to persist synthetic episode content somewhere?

---

## 7. Relationship to Existing Doctrine

From `mind/episodes/2026-07-27-the-stuttering-mind.md`:
> "The solution lies not in better editing, but in eliminating editing entirely via content-addressed atoms, stacking, or population-based memory."

Counterfactual dreaming **extends** this insight:
- Atoms remain immutable
- Probes are read-only queries against the population
- The system never edits beliefs based on synthetic data
- It only **observes** how beliefs would respond if reality had been different

From the population memory spec (`docs/POPULATION-MEMORY.md`):
> "Beliefs are immutable weighted atoms. Recurrence bumps weight instead of adding copies."

Dreaming respects this:
- Synthetic episodes never recur atoms (no ledger writes to beliefs.jsonl)
- Probe events go to a separate ledger (probes.jsonl)
- Weight is untouched by dreaming — only propagation and decay affect weight

---

## 8. Next Steps

If this research direction is approved:

1. **WS-DREAM-A**: Spec for synthetic episode format and provenance isolation (half-day)
2. **WS-DREAM-B**: Implement `perturb.ts` with 3 deterministic strategies (inversion, absence, voice_swap)
3. **WS-DREAM-C**: Implement `dream.ts` probe runner (read-only, no stacker writes)
4. **WS-DREAM-D**: Integrate into rem-popmem.ts behind a flag
5. **WS-DREAM-E**: One-week observation: which atoms surface as fragile? Manual review.

**Gate:** After WS-DREAM-E, human decision: continue, adjust, or abandon.

---

## 9. References

- Revonsuo, A. (2000). "The reinterpretation of dreams: An evolutionary hypothesis of the function of dreaming." *Behavioral and Brain Sciences*, 23(6), 877-901.
- Hoel, E. (2021). "The overfitted brain: Dreams evolved to assist generalization." *Patterns*, 2(5).
- Kahneman, D., & Tversky, A. (1982). "The simulation heuristic." In *Judgment Under Uncertainty: Heuristics and Biases*.
- Roese, N. (1997). "Counterfactual thinking." *Psychological Bulletin*, 121(1), 133-148.
- Epstude, K., & Roese, N. J. (2008). "The functional theory of counterfactual thinking." *Personality and Social Psychology Review*, 12(2), 168-192.
