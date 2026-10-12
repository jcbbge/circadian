// Research-only calibration contracts. No runtime integration.
export type Mechanism = '01' | '02' | '03' | '04' | '05' | '06';
export type Source = { id: string; revision: string; text: string };
export type Evidence = { path: string; sourceId: string; quote: string };
export type Candidate = { data: unknown; evidence: Evidence[]; unknown: string[] };
export type FieldCheck = { path: string; value: unknown; critical: boolean };
export type Fixture = {
  id: string;
  mechanism: Mechanism;
  sources: Source[];
  // Reviewed identity vocabulary, resource/time state, and other caller inputs.
  caller: Record<string, unknown>;
  task?: string;
  question: string;
  gold: Candidate;
  checks: FieldCheck[];
  rubric: { required: string[]; forbidden: string[]; acceptableUnknown: string[] };
  note: string;
};
export type OperationReport = { operation: string; result: unknown; scope: string };
export type Adapter = {
  mechanism: Mechanism;
  instructions: string;
  decode(raw: unknown, fixture: Fixture): Candidate;
  operate(candidate: Candidate, fixture: Fixture): OperationReport;
};
export function obj(v: unknown, where = 'object'): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(`Invalid ${where}`);
  return v as Record<string, unknown>;
}
export function exact(v: Record<string, unknown>, names: string[], where = 'keys') {
  if (Object.keys(v).sort().join('|') !== [...names].sort().join('|')) throw new Error(`Invalid ${where}`);
}
export function str(v: unknown, max = 2000): string {
  if (typeof v !== 'string' || !v.trim() || v.length > max) throw new Error('Invalid bounded string');
  return v;
}
export function arr(v: unknown, max = 32): unknown[] {
  if (!Array.isArray(v) || v.length > max) throw new Error('Invalid bounded array');
  return v;
}
export function oneOf<T extends string>(v: unknown, choices: readonly T[]): T {
  if (typeof v !== 'string' || !choices.includes(v as T)) throw new Error('Invalid enum');
  return v as T;
}
export function envelope(raw: unknown, fixture: Fixture): Candidate {
  const root = obj(raw); exact(root, ['data', 'evidence', 'unknown']);
  const unknown = arr(root.unknown, 16).map(x => str(x, 600));
  const evidence = arr(root.evidence, 64).map(x => {
    const e = obj(x); exact(e, ['path', 'sourceId', 'quote']);
    const entry = { path: str(e.path, 128), sourceId: str(e.sourceId, 128), quote: str(e.quote, 2000) };
    const source = fixture.sources.find(s => s.id === entry.sourceId);
    if (!source || !source.text.includes(entry.quote)) throw new Error('Evidence quote not present in named source');
    return entry;
  });
  // Matching a quote checks presence, never entailment. Semantic grading is separate.
  return { data: root.data, evidence, unknown };
}
export function fieldAt(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((v, key) => v !== null && typeof v === 'object' && Object.hasOwn(v, key) ? (v as Record<string, unknown>)[key] : undefined, value);
}
