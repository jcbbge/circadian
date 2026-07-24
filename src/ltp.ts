// ltp.ts — long-term potentiation for the episode stream.
//
// The second face of the flatline disease (2026-07-24 post-mortem): one
// afternoon of PTY testing produced fourteen near-identical
// bidirectional-sync-test episodes. Fourteen meals of the same bite. Fed raw,
// they drown the wave: REM re-learns one lesson fourteen times, the greeting
// locks onto the loudest repeated theme, and genuinely-new episodes fight
// duplicates for batch slots.
//
// Biology's answer is not fourteen new synapses — it is ONE synapse,
// potentiated. Repetition is signal STRENGTH, not signal VOLUME. So before
// selectMeal, near-duplicate new episodes collapse into one representative
// carrying weight N and its member list. The prompt renders the weight
// ("repeated x14") so the model treats recurrence as evidence; the digested
// ledger records every member hash so none ever re-feeds; compost sheds the
// whole cluster when the representative is shed.
//
// Deliberately NOT embeddings: similarity here is plain token overlap you can
// verify by reading two files side by side. A memory system you cannot hold
// in your head is one you cannot trust (Doctrine[1]). Threshold tuned against
// the real fourteen on disk, not synthetic fixtures — see ltp.test.ts.

export interface ClusterableEpisode {
  filename: string;
  content: string;
}

export interface EpisodeCluster<T extends ClusterableEpisode> {
  representative: T; // longest member — most articulated telling of the lesson
  members: T[]; // the others (empty for singletons)
  weight: number; // total tellings, representative included
}

const STOPWORDS = new Set(
  "a an the and or but of to in on for with as at by from is are was were be been being it its this that these those i you he she we they not no so if then than which who whom what when where how all any both each few more most other some such only own same too very can will just should now".split(
    " "
  )
);

/** Content tokens that carry meaning: lowercase words, stopwords and
 * episode-boilerplate stripped. */
export function significantTokens(content: string): Set<string> {
  // Strip the metadata lines every episode carries (arc:, user-observed:,
  // taught ->) so structural boilerplate never counts as similarity.
  const body = content
    .replace(/^(arc|user-observed|date|session):.*$/gim, "")
    .replace(/\*\*taught -> absorbed-where:\*\*.*$/gim, "");
  const tokens = new Set<string>();
  for (const m of body.toLowerCase().matchAll(/[a-z][a-z0-9'-]{2,}/g)) {
    if (!STOPWORDS.has(m[0])) tokens.add(m[0]);
  }
  return tokens;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const t of small) if (large.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Empirical threshold, measured against the real 2026-07-24 backlog after
 * boilerplate stripping (see ltp.test.ts): flood-internal pairs cluster,
 * distinct-lesson pairs from the same day stay apart. */
export const LTP_THRESHOLD = 0.3;

/** Corpus-level boilerplate: a line repeated verbatim across a third or more
 * of the wave's episodes (the echoed wake greeting, shared headers) carries
 * zero discriminative signal — it says "same day", not "same lesson". Strip
 * before tokenizing so similarity measures lessons, not liturgy. */
function sharedBoilerplateLines(contents: string[]): Set<string> {
  const counts = new Map<string, number>();
  for (const c of contents) {
    const seen = new Set<string>();
    for (const line of c.split("\n")) {
      const t = line.trim();
      if (t.length < 20) continue; // short lines are structure, handled by tokenizer
      if (seen.has(t)) continue; // count once per episode
      seen.add(t);
      counts.set(t, (counts.get(t) || 0) + 1);
    }
  }
  const cut = Math.max(2, Math.ceil(contents.length / 3));
  const boiler = new Set<string>();
  for (const [line, n] of counts) if (n >= cut) boiler.add(line);
  return boiler;
}

/** Single-linkage clustering over token-set Jaccard. O(n^2) on the NEW
 * episodes of one wave — n is tens, not thousands; a nested loop you can
 * read beats an index you have to trust. */
export function clusterEpisodes<T extends ClusterableEpisode>(
  episodes: T[],
  threshold: number = LTP_THRESHOLD
): EpisodeCluster<T>[] {
  const boiler = sharedBoilerplateLines(episodes.map((e) => e.content));
  const stripBoiler = (c: string) =>
    c
      .split("\n")
      .filter((l) => !boiler.has(l.trim()))
      .join("\n");
  const tokens = episodes.map((e) => significantTokens(stripBoiler(e.content)));
  // union-find, path-halving
  const parent = episodes.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  for (let i = 0; i < episodes.length; i++) {
    for (let j = i + 1; j < episodes.length; j++) {
      if (jaccard(tokens[i], tokens[j]) >= threshold) union(i, j);
    }
  }

  const groups = new Map<number, T[]>();
  episodes.forEach((e, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(e);
  });

  const clusters: EpisodeCluster<T>[] = [];
  for (const group of groups.values()) {
    // Representative: the longest telling — most likely to carry the full
    // why-chain. The others become weight.
    const sorted = [...group].sort((a, b) => b.content.length - a.content.length);
    clusters.push({
      representative: sorted[0],
      members: sorted.slice(1),
      weight: group.length,
    });
  }
  // Stable order for deterministic prompts
  clusters.sort((a, b) => a.representative.filename.localeCompare(b.representative.filename));
  return clusters;
}
