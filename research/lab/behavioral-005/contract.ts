export type Proposal = '01' | '02' | '03' | '04' | '05' | '06';
export type Condition = 'useful' | 'missing' | 'misleading' | 'ordinary';
export type Source = { id: string; text: string };
export type Rubric = {
  required: string[];
  forbidden: string[];
  acceptableUnknown: string[];
  supportingRefs: string[];
};
export type StudyCase = {
  id: string;
  proposal: Proposal;
  condition: Condition;
  domain: string;
  sources: Source[];
  question: string;
  // Reviewed source annotations, except an explicitly adversarial misleading case.
  input: unknown;
  inputNote: string;
  annotation: {
    instructions: string;
    criteria: Record<string, string>;
    expected: string;
    // Each choice supplies a complete serialized input. Null means report
    // uncertainty and fall back to ordinary recalled evidence.
    variants: Record<string, unknown | null>;
    field: string;
  };
  rubric: Rubric;
};
