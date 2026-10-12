// Research-only extraction boundary; provenance is assigned by code, meaning by the model.
import type { Candidate, Evidence, Fixture, Mechanism, OperationReport } from '../extractor-006/contract';
export type { Candidate, Evidence, Fixture, Mechanism, OperationReport } from '../extractor-006/contract';

export type DraftAdapter = {
  mechanism: Mechanism;
  semanticInstructions: string;
  format(f: Fixture): { schema: Record<string, unknown>; instructions: string };
  bind(raw: unknown, f: Fixture): Candidate;
  operate(candidate: Candidate, f: Fixture): OperationReport;
};

export function support(f: Fixture, path: string, sourceIndex: number): Evidence {
  const source = f.sources[sourceIndex];
  if (!source || !source.text.trim()) throw new Error('Missing source binding');
  return { path, sourceId: source.id, quote: source.text };
}

export function candidate(data: unknown, evidence: Evidence[], unknown: string[]): Candidate {
  return { data, evidence, unknown };
}
