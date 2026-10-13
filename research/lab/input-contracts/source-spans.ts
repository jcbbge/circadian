// Research-only repairs. Frozen studies and production Circadian remain unchanged.
import { arr, exact, obj, str, type Fixture, type Source } from '../extractor-006/contract';
import { compareTransformations } from '../extractor-006/adapters_04_06';
import { adapters as firstAdapters } from '../extractor-007/adapters_01_03';
import { adapters as lastAdapters } from '../extractor-007/adapters_04_06';

/** Half-open offsets use JavaScript UTF-16 code units, not bytes or code points. */
export type { Source } from '../extractor-006/contract';
export type SourceSpan = { sourceId: string; revision: string; start: number; end: number };
export type SourceLabels = Record<string, { revision: string; label: string | null }>;
const names = ['person', 'attribution', 'circumstance', 'modality', 'comparison'] as const;

function splitsSurrogate(text: string, offset: number): boolean {
  return offset > 0 && offset < text.length &&
    text.charCodeAt(offset - 1) >= 0xd800 && text.charCodeAt(offset - 1) <= 0xdbff &&
    text.charCodeAt(offset) >= 0xdc00 && text.charCodeAt(offset) <= 0xdfff;
}

/** Exact copying only: a valid span does not prove its semantic role or entailment. */
export function sourcePhrase(text: string, raw: unknown, maxChars = 500): string {
  const span = obj(raw); exact(span, ['start', 'end']);
  const { start, end } = span;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
      !Number.isSafeInteger(maxChars) || maxChars < 1 ||
      (start as number) < 0 || (end as number) > text.length ||
      (start as number) >= (end as number) || (end as number) - (start as number) > maxChars ||
      splitsSurrogate(text, start as number) || splitsSurrogate(text, end as number)) {
    throw new Error('Invalid source span');
  }
  return str(text.slice(start as number, end as number), maxChars);
}

/** Bind an explicit reference to the supplied snapshot. No lookup or revision guess. */
export function bindSourceSpan(sources: readonly Source[], raw: unknown, maxChars = 500): SourceSpan & { text: string } {
  const span = obj(raw); exact(span, ['sourceId', 'revision', 'start', 'end']);
  const sourceId = str(span.sourceId, 128), revision = str(span.revision, 128);
  if (sources.length > 32 || new Set(sources.map(source => source.id)).size !== sources.length) throw new Error('Invalid source registry');
  const source = sources.find(source => source.id === sourceId);
  if (!source || source.revision !== revision) throw new Error('Unknown or stale span source');
  const text = sourcePhrase(source.text, { start: span.start, end: span.end }, maxChars);
  return { sourceId, revision, start: span.start as number, end: span.end as number, text };
}

/** Known fields select {state:'known',span:{start,end}}; other states have no span.
 * Selection and absent/unknown judgments remain model interpretations. This adapter
 * never guesses offsets, repairs text, reads gold, or weakens the frozen validator.
 */
export function bindTransformationSpans(raw: unknown, fixture: Fixture) {
  if (fixture.mechanism !== '06' || fixture.sources.length !== 1) throw new Error('Expected one transformation source');
  const fields = obj(raw); exact(fields, [...names]);
  const copied = Object.fromEntries(names.map(name => {
    const field = obj(fields[name]);
    if (!['known', 'absent', 'unknown'].includes(String(field.state))) throw new Error('Invalid field state');
    exact(field, field.state === 'known' ? ['state', 'span'] : ['state']);
    return [name, field.state === 'known'
      ? { state: 'known', value: sourcePhrase(fixture.sources[0]!.text, field.span) }
      : { state: field.state }];
  }));
  return lastAdapters.find(a => a.mechanism === '06')!.bind(copied, fixture);
}

export function compareSpanTransformations(oldRaw: unknown, oldFixture: Fixture, nextRaw: unknown, nextFixture: Fixture) {
  return compareTransformations(bindTransformationSpans(oldRaw, oldFixture), oldFixture,
    bindTransformationSpans(nextRaw, nextFixture), nextFixture);
}

/** Caller-owned labels are metadata, not newly inferred authority or source truth.
 * Without a supplied label, preserve null rather than invent a title from prose.
 * A future extractor may select label spans; this projection makes no such claim.
 */
export function compatibilityMemory(raw: unknown, fixture: Fixture, labels: SourceLabels = {}) {
  if (fixture.mechanism !== '02') throw new Error('Expected compatibility fixture');
  const sources = new Map(fixture.sources.map(source => [source.id, source]));
  if (sources.size !== fixture.sources.length) throw new Error('Duplicate source identity');
  const checked = new Map<string, string | null>();
  for (const [id, value] of Object.entries(obj(labels))) {
    const source = sources.get(id), metadata = obj(value); exact(metadata, ['revision', 'label']);
    if (!source || metadata.revision !== source.revision) throw new Error('Unknown or stale label source');
    checked.set(id, metadata.label === null ? null : str(metadata.label, 128));
  }
  const adapter = firstAdapters.find(a => a.mechanism === '02')!;
  const candidate = adapter.bind(raw, fixture), operation = adapter.operate(candidate, fixture);
  const accounts = arr(obj(candidate.data).accounts, 8).map(value => {
    const account = obj(value), id = str(account.sourceId, 128);
    return { ...account, sourceRevision: sources.get(id)!.revision, sourceLabel: checked.get(id) ?? null };
  });
  // No full source/evidence text is included in this reader-facing projection.
  return { candidate: { accounts }, unresolved: candidate.unknown, operation,
    provenanceMeaning: 'Source labels and references identify inputs; they do not establish entailment or authority.' };
}
