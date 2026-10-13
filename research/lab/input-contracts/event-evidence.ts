/** Prospective research boundary, not a semantic extractor or a production hook. */
import { bindSourceSpan, type Source, type SourceSpan } from './source-spans';
import { composeReports, type Record as RelationRecord, type Query, type SourceState } from '../../prototypes/03-relations';
import { recallOccasion, jointOccasions, type Occasion, type Interpretation, type Sources } from '../../prototypes/05-experiences';

export type EventFact = {
  owner: string;
  relation: 'recording-location' | 'event-location' | 'participation';
  subject: string;
  value: string;
  span: SourceSpan;
};
/** Passed separately by the caller after independent source review, never extracted
 * alongside the claim. Code binds the review to a claim; it cannot authenticate
 * a reviewer or prove that a caller actually obtained independent review. */
export type EventReview = { claim: EventFact; decision: 'supported' | 'unsupported' | 'unknown'; reviewer: string };
export type EventDecision = { fact: EventFact; status: 'supported' | 'unsupported' | 'pending'; evidence: ReturnType<typeof bindSourceSpan> };

function sameClaim(a: EventFact, b: EventFact) {
  return a.owner === b.owner && a.relation === b.relation && a.subject === b.subject && a.value === b.value
    && a.span.sourceId === b.span.sourceId && a.span.revision === b.span.revision
    && a.span.start === b.span.start && a.span.end === b.span.end;
}

/** Exact source bytes are necessary provenance, never affirmative entailment. */
export function reviewEventFacts(sources: readonly Source[], facts: readonly EventFact[], reviews: readonly EventReview[]): EventDecision[] {
  if (facts.length > 100 || reviews.length > 100) throw new Error('Event evidence exceeds record cap');
  return facts.map((fact, index) => {
    if (![fact.owner, fact.subject, fact.value].every(x => typeof x === 'string' && x.trim() && x.length <= 600)
      || !['recording-location', 'event-location', 'participation'].includes(fact.relation)) throw new Error('Invalid event fact');
    if (facts.slice(0, index).some(x => x.owner === fact.owner && x.relation === fact.relation && x.subject === fact.subject))
      throw new Error('Duplicate event fact');
    const evidence = bindSourceSpan(sources, fact.span);
    const matching = reviews.filter(review => sameClaim(review.claim, fact));
    if (matching.length > 1) throw new Error('Conflicting or duplicate reviews');
    const review = matching[0];
    if (review && (typeof review.reviewer !== 'string' || !review.reviewer.trim() || review.reviewer.length > 128
      || !['supported', 'unsupported', 'unknown'].includes(review.decision))) throw new Error('Invalid independent review');
    return { fact, evidence, status: !review || review.decision === 'unknown' ? 'pending' : review.decision };
  });
}

/** Caller-supplied report/person identities are unchanged. Only reviewed location
 * facts populate episode/occasion fields; missing approval remains unresolved. */
export function composeReviewedLocations(records: readonly RelationRecord[], query: Query,
  states: { [id: string]: SourceState }, sources: readonly Source[], facts: readonly EventFact[], reviews: readonly EventReview[]) {
  if (records.length > 100) throw new Error('Relation packet exceeds record cap');
  const decisions = reviewEventFacts(sources, facts, reviews);
  for (const { fact } of decisions) {
    const owner = records.find(r => r.id === fact.owner);
    if (!owner || (fact.relation === 'recording-location' ? owner.kind !== 'episode' : fact.relation !== 'event-location' || owner.kind !== 'occasion')
      || fact.subject !== owner.id || !owner.sources.some(ref => ref.id === fact.span.sourceId && ref.revision === fact.span.revision)
      || !records.some(r => r.kind === 'place' && r.id === fact.value)) throw new Error('Location evidence does not match packet');
  }
  const packet = records.map(record => {
    if (record.kind !== 'episode' && record.kind !== 'occasion') return record;
    const relation = record.kind === 'episode' ? 'recording-location' : 'event-location';
    const accepted = decisions.find(d => d.fact.owner === record.id && d.fact.relation === relation && d.status === 'supported');
    return record.kind === 'episode' ? { ...record, recordingLocation: accepted?.fact.value ?? null }
      : { ...record, setting: accepted?.fact.value ?? null };
  });
  return { decisions, composition: composeReports(packet, query, states), semantics: 'caller-reviewed-location-only' as const };
}

/** Only affirmative reviewed participation reaches the unchanged incidence reader.
 * Narrative and interpretation meaning remain caller-reviewed inputs, outside
 * this gate; pending membership is reported, never treated as absence. */
export function recallReviewedParticipation(occasion: Omit<Occasion, 'participants'>,
  interpretations: Interpretation[], states: Sources, sources: readonly Source[], facts: readonly EventFact[], reviews: readonly EventReview[], people: string[]) {
  const decisions = reviewEventFacts(sources, facts, reviews);
  for (const { fact } of decisions) {
    if (fact.relation !== 'participation' || fact.owner !== occasion.id || !people.includes(fact.subject)
      || fact.span.sourceId !== occasion.ref.source || fact.span.revision !== occasion.ref.revision) throw new Error('Participation evidence does not match packet');
  }
  const participants = decisions.filter(d => d.status === 'supported').map(d => ({ person: d.fact.subject, role: d.fact.value }));
  if (occasion.mentioned.some(person => participants.some(p => p.person === person))) throw new Error('Mention-only and participation overlap');
  if (occasion.coPresence.some(group => group.some(person => !participants.some(p => p.person === person)))) throw new Error('Co-presence lacks reviewed participants');
  const record = { ...occasion, participants };
  const population = { occasions: [record], interpretations, revisits: [] };
  return { decisions, recall: recallOccasion(occasion.id, population, states), participation: jointOccasions(people, [record], states),
    semantics: 'caller-reviewed-participation-only' as const };
}
