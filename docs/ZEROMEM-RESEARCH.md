# ZERO-MEM RESEARCH — Zero-Token Memory Operations vs Circadian's Generative Metabolism

**Status:** Research artifact
**Date:** 2026-08-04
**Context:** Reading "Zero-Mem: Zero-Token Memory Operations for LLM Agents"
(arXiv 2607.29377v1, https://arxiv.org/html/2607.29377v1) through the lens of
Circadian's population-memory architecture. Zero-Mem claims memory *operations*
need no LLM generation at all — a direct challenge to Circadian's metabolism,
which uses LLM calls to EXTRACT candidate atoms and COMPARE them. Source read in
full from the pre-fetched HTML; code is NOT yet public (see §7), so every
implementation-level question the paper leaves open is marked UNKNOWN.

Every claim about the paper cites a section/table/figure/equation. Every claim
about Circadian cites a file/line read this session.

---

## 1. Summary of the Paper

### 1.1 The problem

LLM agents accumulate long interaction histories; reliability depends on
recovering the right evidence when it becomes relevant (§1). Two dominant
strategies both have a defect:

- **Generative memory** — LLMs summarize/reflect, build hierarchical
  abstractions and graph indexes, evolve linked records (Mem0, A-Mem, MemoryOS,
  Zep; §1–§2). This turns memory management into "a recurring generative
  workload," and omitted/merged/blurred details "weaken traceability to the
  original interaction" (§1).
- **Raw retrieval** — retain everything, retrieve from raw traces. Preserves
  source evidence but "flat lexical or dense retrieval can confuse semantically
  similar traces from different users, sessions, or temporal states" (§1).

Recent systems (SimpleMem, LightMem) *reduce* generative overhead but do not
eliminate it (§1). The paper's driving question (§1, verbatim): *"Can an agent
memory system eliminate LLM calls from every operation outside final question
answering, while retaining structured access beyond flat similarity
retrieval?"*

### 1.2 The claim

**Zero-token memory operations**: memory construction, organization, routing,
retrieval, evidence closure, and both pre-reader and post-reader calibration
"invoke no LLM and consume no LLM input or output tokens. Encoder computation
and final-QA inference are accounted for separately" (§1). Only the final-QA
reader is an LLM call (Abstract, §3 Eq 2). Headline efficiency result: with an
identical reader and equal context budget, a **57.6% reduction in
memory-operation latency** relative to the fastest baseline (Abstract, Table 2,
§5.3).

### 1.3 The method (§4)

Zero-Mem formalizes the memory function `R(q) = Memory(q, H)` over a history
`H = (s₁,…,s_T)` and hands `R(q)` to a reader `a = Reader(q, R(q))` (§3, Eq 1–2).
Four components, all token-free (§4.1):

1. **Provenance-preserving token-free substrate** (§4.2). Original traces are
   the authoritative source; each derived unit keeps its original text plus
   source id, session time, boundary id, metadata — so retrieved evidence stays
   "traceable to observed interactions rather than model-generated memory
   statements." Two non-generative views:
   - *Relational trace graph* `G = (V_d ∪ V_e, E_de ∪ E_dd)` (Eq 3) built by a
     **non-generative NER model (e.g., spaCy)**; entity–context edge weights are
     occurrence-frequency ratios (Eq 4). "The graph records observed
     co-occurrence and trace adjacency rather than generating semantic triples
     or inferred relations."
   - *Temporal hierarchy* `T(H) = U_turn ∪ U_window ∪ U_episode ∪ U_local`
     (Eq 5) — turns, windows, episodes, local spans; all inherit provenance.
   - *Access signals*: BM25 (lexical) + BGE-M3 (dense). These "support indexing,
     seeding, and scoring only; they do not generate or rewrite memory content"
     (§4.2).

2. **Query-conditioned evidence routing** (§4.3). A lightweight profile
   `φ(q) = {subject, keywords, answer-type, temporal-cues, boundary}` (Eq 6),
   obtained from the query + metadata **without gold answers**, decides
   `Route(q) ∈ {relational, local}` (Eq 7) by deterministic query-structure
   signals. Both views always run; routing sets the fusion weight ρ (relational
   queries give ρ to the graph, 1−ρ to hierarchy; local queries reverse).

3. **Dual-view retrieval + closure** (§4.4–§4.5). Graph view: align query
   entities by cosine (Eq 8), propagate activation across co-occurrence
   sentences (Eq 9), then **Personalized PageRank** with damping γ (Eq 10);
   lexical/phrase matches refine the ranking for names/dates/values. Hierarchy
   view: coarse-to-fine `U_episode → U_window → U_turn → U_local` (Eq 11).
   Closure: min-max normalize each view (Eq 12), fuse by ρ (Eq 13), then augment
   with bounded graph/hierarchy neighbors and dedup by provenance (Eq 14).

4. **Deterministic evidence calibration** (§4.6). `R(q) = Rank_φ(Filter(C(q),φ))`
   (Eq 15) — Filter enforces hard provenance/boundary constraints, Rank orders
   without altering content. After the reader emits `a₀`, answer-level
   calibration (Eq 16) preserves `a₀` when supported; otherwise applies
   evidence-preserving normalization, extractive shortening, or list pruning. A
   scalar answer is replaced "only by a unique type-compatible candidate"; if no
   deterministic correction exists, `a₀` is retained. No second LLM call.

### 1.4 Evaluation (§5)

- **Setup** (§5.1): benchmarks **LoCoMo** (multi-session conversational memory;
  single-hop / multi-hop / temporal / open-domain) and **HotpotQA** (multi-hop,
  distractor-padded to 56K / 224K / 448K tokens). Readers: **GPT-4o-mini** and
  **Qwen2.5-14B-Instruct**. Baselines: memory-free (LONG-LLM, RAG) and
  memory-based (A-Mem, Mem0, MemoryOS, LightMem, SimpleMem, CompassMem, GAM).
  γ = ρ = 0.6, RTX 4090, top-5 retrieval cap for all methods.
- **LoCoMo** (Table 1, §5.2): Zero-Mem best average F1/BLEU-1 under *both*
  readers. GPT-4o-mini average **F1 59.15 / BLEU-1 52.96** (single-hop 66.65,
  multi-hop 41.61, temporal 61.97, open-domain 35.52); +5.40 F1 / +5.45 BLEU-1
  over GAM, the strongest baseline. Qwen2.5-14B average 57.57 / 51.41 (+4.87 /
  +4.86 over GAM), ranking first on every question type.
- **HotpotQA** (Table 3, §5.2): highest F1 at *every* reader and length,
  including 448K (GPT-4o-mini 72.07 / 66.43 / 65.04; Qwen 68.58 / 65.47 / 61.02),
  average +5.52 over the strongest baseline.
- **Efficiency** (Table 2, §5.3): Zero-Mem F1 59.15 / BLEU-1 52.96, **0 tokens,
  0 tokens/query**, **334.77 s total / 0.22 s per query**. The 57.6% reduction
  is measured against **LightMem** (788.76 s / 0.51 s), the fastest baseline;
  LightMem still burns >0.87M tokens; GAM burns 28.5M. The paper is explicit
  (§5.3, verbatim): *"Zero-token operation does not imply zero computation, since
  encoder inference, memory organization, retrieval, and deterministic
  calibration still incur processing costs."*
- **Ablation** (Fig 3, §5.4; HotpotQA 56K, GPT-4o-mini): full model 72.07 F1 /
  69.66 BLEU-1; graph-only 62.50 / 59.90; hierarchy-only 54.88 / 51.40; no
  closure 67.90 / 65.43; no calibration 70.13 / 66.45 — both views and both
  post-steps contribute.
- **Retrieval budget** (Fig 4, §5.5): top-1→top-5 lifts avg F1/BLEU-1 from
  52.59/46.79 to 59.15/52.96; best at top-10; top-5 trails top-10 by only
  0.65 F1 / 0.83 BLEU-1.

---

## 2. The Circadian Lens — Where the Architectures Agree

Both systems are built by people who distrust the same thing: a generated
abstraction becoming the *only* record of what happened.

| Instinct | Zero-Mem | Circadian |
|---|---|---|
| Original trace is the source of record | "preserves original interaction traces as its source of record" (Abstract, §4.2) | atom carries a `quote:` that "MUST appear verbatim in that episode or the atom is rejected at extraction" (`templates/MIND-SPEC.md`, atom shape); git is the permanent archive, zoom resolves atoms→episodes |
| Structure beats flat retrieval | entity–context graph + temporal hierarchy (§4.2) | beliefs folded by `kind`, weight-sorted; append-only ledger is the temporal axis (`templates/MIND-SPEC.md`, the render) |
| The arithmetic is deterministic | calibration is `Filter`+`Rank`, no LLM (Eq 15) | "Weight is never stored — it is fold(ledger), deterministic"; render is byte-identical, "no clock in the fold" (`templates/MIND-SPEC.md`; `src/render.ts:52` `RENDER_FLOOR = 0.5`) |
| The model never composes the record | "no generated memory intervenes between the original trace and the evidence exposed to the reader" (§1) | five sentences, #5: "The model compares atoms — it never composes the document" (`templates/MIND-SPEC.md`) |
| Determinism first, model only at the boundary | both views run deterministically; only final QA is an LLM (§4.1) | dedupe pipeline: exact hash → jaccard ≥ 0.30 auto-SAME → **only** the borderline band `[0.05, 0.30)` reaches the model (`src/stack.ts:138` `BAND_HIGH = LTP_THRESHOLD`, `:147` `BAND_LOW = 0.05`) |

The last row is the deep agreement and it is easy to miss. Circadian is **already
Zero-Mem-shaped on most of the write path**: exact-hash and high-overlap merges
never call the model; the LLM is consulted only for the ambiguous middle
(`src/stack.ts:377–384`). Zero-Mem's contribution is to ask whether even that
middle needs generation — see §4.1.

---

## 3. The Circadian Lens — Where They Diverge

### 3.1 The headline divergence: generation in the loop

Zero-Mem's whole thesis is "no step outside final QA invokes an LLM" (§1).
Circadian's metabolism **does** invoke LLMs, at exactly two points, both via
`src/llm.ts` (`complete()`, `:251`):

- **EXTRACT** — episode → ≤5 candidate atoms (genuinely generative: it *writes*
  the `claim`/`why`/`quote` text). (`templates/MIND-SPEC.md`, the stacker.)
- **COMPARE** — two claims → one token `SAME | DISTINCT | SUPERSEDES_A |
  SUPERSEDES_B` (`src/stack.ts:21–22`, `:328` `CompareToken`). This is a
  *classifier*, not a generator.

So the challenge is asymmetric. COMPARE is already a one-token classification of
the kind Zero-Mem replaces with cosine + calibration (Eq 8, Eq 12). **EXTRACT is
the truly generative organ** and Zero-Mem has no equivalent — it never distills a
trace into a claim, because its product is retrieved evidence, not a written
belief.

### 3.2 The deeper divergence: what the memory is *for*

This is the divergence that matters more than the token count.

- **Zero-Mem is a read-time QA retriever.** `R(q) = Memory(q, H)` (Eq 1) — memory
  is *pulled* per question, evidence re-derived each query, **nothing is ever
  distilled or forgotten**. There is no decay, no size budget, no standing
  document, no greeting.
- **Circadian is a write-time consolidator with a push read path.** Law 2:
  "Memory is injected at session start; the working agent has zero memory
  duties" (`templates/MIND-SPEC.md`). Law 4: "Finite body. Size targets force
  excretion." Forgetting is a nightly multiply (×0.95) and atoms sink below
  `RENDER_FLOOR` (`src/render.ts:52`, `src/decay.ts`).

They are **not competing for the same slot.** Zero-Mem's zero-generation trick
lives on the *read/retrieval* path; Circadian's generation lives on the
*write/consolidation* path (EXTRACT, COMPARE, sleep drafting, REM distill).
Circadian's read path (wake) is *already* zero-LLM: "Wake is file reads only. No
step in WAKE may depend on a running service" (Law 7; `src/wake.ts` is pure file
reads). **Wake is already Zero-Mem-compliant.**

### 3.3 Conflict handling: discard vs supersede

Zero-Mem's calibration "first discards conflicting evidence" (Abstract; Eq 15
`Filter`) — an *ephemeral, per-query* drop. Circadian *supersedes*: the loser's
weight transfers to the winner, "loser's weight becomes 0 and its status becomes
`superseded-by:<winner>`" but the file and lineage are kept forever
(`src/atoms.ts` `foldWeights`, the `supersede` case; `templates/MIND-SPEC.md`).
The difference is forced by §3.2: Zero-Mem has no standing representation to keep
consistent, so "discard" just means "don't return it this time"; Circadian
maintains a durable `SELF.md`, so it needs permanent, lineage-preserving conflict
resolution.

---

## 4. What Zero-Mem Implies for Circadian's Open Problems

### 4.1 The stutter / distill mechanics — the strongest lesson

Circadian's live pathology is semantic stutter: paraphrase atoms re-telling one
belief (the detector `detectSelfStutter`, `src/immune.ts:305`, threshold
`SELF_STUTTER_THRESHOLD = 0.3`, `:258`). The live population currently FAILs with
a 12-member "mechanical fidelity" paraphrase cluster
(`briefs/06-rem-distill-stutter-guard.md`, §2). This is a **generation-side
pathology by construction** — it can only exist because EXTRACT writes free-text
claims, so the same belief can be worded fifteen ways.

Zero-Mem's stance is the sharpest possible commentary on this: *if you never
paraphrase the trace, you can never stutter.* It avoids the entire class by never
generating an abstraction (§1). Circadian cannot simply adopt that — the distilled
prose *is* the product (SELF.md is a readable identity, the greeting is spoken
aloud, Law 3). But the current stutter DETECTOR uses jaccard over significant
tokens (`src/immune.ts:313,322`; `src/ltp.ts:55` `jaccard`, `:66`
`LTP_THRESHOLD = 0.3`), which fails precisely when paraphrases share few surface
tokens — the exact failure mode of "mechanical fidelity said twelve ways."
Zero-Mem's dense+lexical fusion (Eq 12–13, BGE-M3) is a non-generative detector
that catches semantic near-duplicates jaccard misses. **This is the highest-value,
lowest-risk borrowing** — see Adoption A and D in §6.

### 4.2 Token budgets (wake's 15k cap)

`src/wake.ts:27` sets `CAP_TOKENS = 15000`; over-cap is a degraded event, never a
silent truncation (`:172,:186`, "exceeds the 15k-token hard cap (MIND-SPEC Law
4)"). Zero-Mem's lesson is reassuring, not disruptive: the expensive,
token-burning work is *consolidation*, not injection, and Circadian's injection
is already zero-token. The 15k cap is a *payload-size* budget (how much to push),
not a generation-cost budget. Where Zero-Mem *could* touch this: today the
injection set is weight-sort + budget stop (`src/render.ts:51`
`DEFAULT_BUDGETS`); a Zero-Mem entity–context graph could select *which* atoms to
inject relative to the session's opening context — but this is the cliff-dangerous
idea (§4.5, Adoption B).

### 4.3 The R7 verdict (silence is a verdict)

Zero-Mem has **no analog**. It is a static system scored on QA benchmarks; it
never judges whether its own memory *moved* a downstream decision. Circadian's R7
fitness — a greeting whose items propagate earns an implicit `ok`, seven silent
greetings surface the decommission question (`src/status.test.ts`
"the R7 fitness streak"; `src/sleep.ts:647–698` implicit-ok verdict; Doctrine 6:
"Motion is the metric") — is an axis Zero-Mem does not model. **Circadian is ahead
here.** Worth stating plainly so the comparison isn't read as one-directional.

### 4.4 Decay vs structure

Zero-Mem has structure (graph + hierarchy) and **no decay** — it keeps every
trace. Circadian has both. The implicit argument in Zero-Mem is that good
structure removes the *need* to forget: keep everything, just don't retrieve the
irrelevant. But every Zero-Mem workload is **bounded** — one LoCoMo conversation,
one HotpotQA context ≤448K tokens (§5.1). Circadian runs unboundedly across
months. "Keep everything and retrieve" is untested at that scale (§7). Decay
(Law 4) may be Circadian answering a question Zero-Mem's benchmarks cannot pose.

### 4.5 The cliff (complexity accretion, Doctrine 1)

Circadian's north star: "If a change doesn't fit on this page, the change is
wrong" (`templates/MIND-SPEC.md`). Zero-Mem is *simpler* on one axis (no
generative pipeline, no memory-op prompt engineering) but *far more complex* on
another: entity–context graph + temporal hierarchy + PPR + BM25 + BGE-M3 + query
router + closure + two-level calibration (Eq 3–16). **It would not fit on one
page.** Wholesale adoption violates Circadian's core discipline. Selective
adoption of *one deterministic idea* is the only cliff-safe path — which is
exactly how §6 is framed.

---

## 5. Side-by-side

| Axis | Zero-Mem | Circadian |
|---|---|---|
| Primary path | read-time retrieval `R(q)=Memory(q,H)` (Eq 1) | write-time consolidation + push read (Law 2) |
| LLM in memory ops | none (§1) | EXTRACT (generative) + COMPARE (1-token classifier), `src/llm.ts:251` |
| LLM at read/inject | reader only (Eq 2) | none — wake is file reads (Law 7, `src/wake.ts`) |
| Forgetting | none (retain all traces) | nightly ×0.95, sink below `RENDER_FLOOR` (`src/decay.ts`, `src/render.ts:52`) |
| Conflict | ephemeral discard (Eq 15) | durable supersede, lineage kept (`src/atoms.ts`) |
| Provenance | source id + session time + boundary (§4.2) | verbatim `quote:` in named episode or rejected (`templates/MIND-SPEC.md`) |
| Fitness / self-judgment | none | R7 verdict, "silence is a verdict" (`src/sleep.ts:647`) |
| Complexity budget | many components (Eq 3–16) | one page or the change is wrong (Doctrine 1) |
| Tested scale | ≤448K-token context, bounded (§5.1) | unbounded, months, cross-session |

---

## 6. Candidate Adoptions / Experiments

Each is scoped to fit the cliff discipline (§4.5): one deterministic idea at a
time, reusing organs that already exist.

### Adoption A — deterministic COMPARE via embeddings (LOW cost)
Replace the borderline-band LLM COMPARE token with dense cosine + lexical
calibration (Zero-Mem Eq 8/12). The band is narrow (`[0.05, 0.30)`,
`src/stack.ts:147,138`) and a local embedding service already exists on this
machine (Qwen3-Embedding-4B, per the stack). **Cost:** low — one function swap
behind the existing `routeCandidate` seam. **What it invalidates if it works:**
the claim that COMPARE needs a generative model — drops Circadian's model surface
from two calls to one (EXTRACT only) and removes a generation-side stutter vector
(the LLM waffling SAME vs DISTINCT on paraphrases). **Test:** run both on the
12-member "mechanical fidelity" cluster (`briefs/06`, §2) and measure merge
consistency.

### Adoption B — entity–context graph for wake injection selection (HIGH cost, RESEARCH-ONLY)
Build a Zero-Mem-style entity–context graph over the belief population and select
the wake injection set by query-conditioned PPR against the session's opening
context, instead of weight-sort + budget truncation (`src/render.ts`). **Cost:**
high — adds graph + NER + routing to what is currently a pure fold; risks putting
a structure in the read path, brushing against Law 1 ("storage dumb") and Law 7
(wake must survive infra death). **What it invalidates if it works:** Law 2's
"push the whole worldview" becomes "push the *relevant* worldview," which could
make the 15k cap (`src/wake.ts:27`) almost never bind and raise greeting
relevance. **Flag:** most cliff-dangerous; prototype in a throwaway branch, never
in the wake critical path. Note the mismatch in §7 (coding sessions have no crisp
`q`).

### Adoption C — provenance/boundary Filter at render (LOW cost)
Extend the render-time counterfeit-quote assert (`templates/MIND-SPEC.md`,
render-time health checks) into a Zero-Mem-style deterministic `Filter` (Eq 15)
that also checks temporal/boundary consistency before ranking. **Cost:** low — a
strengthening of an existing guard, no new organ. **What it invalidates if it
works:** nothing structural; it hardens an existing check and imports Zero-Mem's
"discard-before-rank" discipline without importing its architecture.

### Adoption D — zero-generation DISTILL detector (LOW–MEDIUM cost)
In the planned REM DISTILL phase (`briefs/06`), augment the jaccard-token cluster
detector (`src/immune.ts:258`) with Zero-Mem's dense+lexical fusion (Eq 12–13)
for cluster detection. **Cost:** low–medium — the detector is already isolated and
"never throws" (`src/immune.ts:305`), so it can be swapped behind the same
interface. **What it invalidates if it works:** the jaccard-0.3 threshold as the
sole merge criterion — a dense-fusion detector should catch semantic paraphrases
that share few significant tokens, which is exactly the current failure mode
(§4.1). Winner selection and the auto-supersede mechanics in `briefs/06` are
unchanged; only *detection* improves.

**Recommended first move:** Adoption D, then A. Both attack the live stutter
FAIL (`briefs/06`, §2) from the non-generative side Zero-Mem validates, both
reuse existing seams, and neither touches the wake critical path or the one-page
discipline.

---

## 7. Honest UNKNOWNs

- **Encoder accounting.** The paper accounts encoder computation "separately"
  (Abstract, §1, §5.3) and states zero-token ≠ zero-compute, but this HTML gives
  **no wall-clock or FLOP breakdown** for the spaCy NER + BM25 + BGE-M3 encoding
  at ingest. The true build-time cost of the substrate is UNKNOWN from v1.
- **Code availability.** "After peer review, the code and implementation details
  will be available at github.com/TheMoon0815/Zero-mem" (Abstract). Not yet
  public; **I did not inspect code.** Implementation-level parameters — graph
  size, PPR iteration count, closure neighbor caps `N_g`/`N_h` (Eq 14) — are
  UNKNOWN.
- **Scale limits.** Max context tested is HotpotQA 448K tokens (§5.1); LoCoMo is
  multi-session but bounded. Behavior of the entity–context graph + PPR at
  Circadian's **unbounded, months-long, continuously growing** store is UNKNOWN —
  the paper never tests a store that keeps growing.
- **Non-QA workloads.** *Every* benchmark is QA (§5.1). Memory is defined as
  `R(q) = Memory(q, H)` — query-driven. **Coding-agent sessions are not QA**;
  there is no crisp `q` at wake — the "query" is the whole opening context.
  Whether query-conditioned routing (Eq 6–7) degrades to noise without a sharp
  `q` is UNKNOWN, and is the single biggest reason Zero-Mem does not drop into
  Circadian's push model (bears directly on Adoption B).
- **Answer calibration generality.** `Calibrate` (Eq 16) targets "answer forms
  admitting deterministic checks" (scalars, lists). The ablation removing
  calibration (Fig 3) is measured only on HotpotQA F1/BLEU-1. Its value on
  open-ended, non-extractive generation is UNKNOWN.

---

## 8. Verdict

Zero-Mem proves a strong, narrow thing: **structured agent memory can retrieve
provenance-bearing evidence with zero LLM calls and zero tokens, at competitive
QA accuracy and 57.6% lower latency than the fastest baseline** (Abstract,
Table 2). It is a rigorous read-path result on bounded QA workloads.

For Circadian, the honest reading is that Zero-Mem is **not a replacement and
barely a competitor** — it optimizes the read path, which Circadian already runs
at zero LLM cost (Law 7). Its real gift is *methodological*: it demonstrates that
the deterministic-first instinct Circadian already applies to dedupe
(`src/stack.ts`) can be pushed further — into COMPARE and into stutter detection —
using embeddings + calibration instead of generation. That directly attacks
Circadian's live generation-side pathology (`briefs/06`, `src/immune.ts:305`)
without asking Circadian to abandon the distilled prose that is its product.
Adopt the *idea* (non-generative near-duplicate resolution), not the
*architecture* (graph + hierarchy + PPR + dual calibration) — the latter would
not fit on one page, and on this project that means it is wrong (Doctrine 1).
