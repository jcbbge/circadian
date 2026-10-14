/** Optional extraction encoding. The model selects numbered source segments; code copies evidence.
 * Selection establishes source provenance, never support for the belief. */
// A 2 KiB character cap rejected valid 2,420-character source evidence.
export const SOURCE_QUOTE_MAX_CHARS = 4096;
export const SOURCE_QUOTES_MAX = 8;
export const SOURCE_QUOTES_MAX_BYTES = 32768;
export const SOURCE_SEGMENT_MAX_CHARS = 1000;

type SourceSegment = { start: number; end: number };

/** Short physical lines retain their numbering. Long lines become bounded
 * segments with offsets into the unmodified source, never reconstructed text. */
function sourceSegments(content: string): SourceSegment[] {
  const segments: SourceSegment[] = [];
  let lineStart = 0;
  for (const line of content.split("\n")) {
    const lineEnd = lineStart + line.length;
    if (!line.length) segments.push({ start: lineStart, end: lineEnd });
    for (let start = lineStart; start < lineEnd;) {
      let end = Math.min(start + SOURCE_SEGMENT_MAX_CHARS, lineEnd);
      // A UTF-16 boundary may fall between the two halves of a code point.
      if (end < lineEnd && /[\uD800-\uDBFF]/.test(content[end - 1]!) && /[\uDC00-\uDFFF]/.test(content[end]!)) end--;
      segments.push({ start, end });
      start = end;
    }
    lineStart = lineEnd + 1;
  }
  return segments;
}

export function numberSourceLines(content: string): string {
  return sourceSegments(content).map(({ start, end }, index) => `${index + 1}: ${content.slice(start, end)}`).join('\n');
}

/** One-based inclusive segments. Original text between selected offsets is
 * copied, including original newlines; display breaks never become evidence. */
export function bindSourceLines(content: string, range: string): string {
  const match = /^([1-9]\d*)-([1-9]\d*)$/.exec(range);
  if (!match) throw new Error('invalid quote-lines range');
  const start = Number(match[1]), end = Number(match[2]);
  const segments = sourceSegments(content);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || end > segments.length)
    throw new Error('quote-lines range out of source bounds');
  const quote = content.slice(segments[start - 1]!.start, segments[end - 1]!.end);
  if (!quote.trim()) throw new Error('empty quote-lines evidence');
  if (quote.length > SOURCE_QUOTE_MAX_CHARS) throw new Error(`quote-lines evidence exceeds ${SOURCE_QUOTE_MAX_CHARS} chars`);
  return quote;
}

/** Converts only the declared selector encoding. Generated quote text and
 * mixed encodings are rejected rather than silently repaired or accepted. */
export function bindCandidateSourceLines(lines: readonly string[], content: string): string[] {
  const selectors = lines.slice(3);
  if (selectors.length > SOURCE_QUOTES_MAX) throw new Error('quote-lines exceeds 8 evidence selections');
  let bytes = 0;
  return [...lines.slice(0, 3), ...selectors.map(line => {
    if (!line.startsWith('quote-lines: ')) throw new Error('expected quote-lines selector');
    const quote = bindSourceLines(content, line.slice('quote-lines: '.length));
    const encoded = JSON.stringify(quote);
    bytes += Buffer.byteLength(encoded, 'utf8');
    if (bytes > SOURCE_QUOTES_MAX_BYTES) throw new Error('quote-lines exceeds 32 KiB encoded evidence');
    return `quote: ${encoded}`;
  })];
}
