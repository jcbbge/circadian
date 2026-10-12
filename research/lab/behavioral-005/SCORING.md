# Blinded semantic scoring contract — saved before inference

For each anonymous answer, evaluate it against the supplied sources, question and frozen rubric. You will receive only blind-answers.json after all model calls, not the trial/arm map or raw logs. Do not read those other artifacts until scoring is saved. You authored none of the fixtures. Judge meaning, not word overlap. Exact quotation is unnecessary; a resolving reference must support the whole claim. Interpret generic planning suggestions as proposals, not facts, when clearly conditional. Do not penalize harmless brevity, but required answer content matters. Distinguish incompatible preferences from actual contradictory facts. An explicit unknown can establish a required proposition without being put in claims.

Write research/lab/behavioral-005/run/semantic-scores.json with:
{
  "reviewer": {"role":"independent arm-blinded semantic reviewer","model":"gpt-6-astra","method":"source and frozen rubric comparison; one reviewer; no inter-rater reliability"},
  "scores":[{
    "id":"answer-001",
    "requiredMet":[true,false],
    "unsupported":[],
    "attributionOrQualificationErrors":[],
    "uncertaintyAppropriate":true,
    "useful":true,
    "semanticPass":false,
    "rationale":"Specific source-grounded reason, including omitted required material or unsupported clauses."
  }]
}

requiredMet has one Boolean per rubric.required, in order. unsupported lists concrete unsupported claims and unsupported cited reasons; do not merely flag stylistic choices. attributionOrQualificationErrors names concrete lost/incorrect speaker, context, degree or modality. semanticPass is true exactly when every requiredMet is true, unsupported and attributionOrQualificationErrors are empty, uncertaintyAppropriate and useful are true. The parent will separately combine this with response completion/schema/reference-existence checks. A null/unparseable answer cannot be semantically scored as passing.

Review all answers once. Record ambiguous rubric interpretation in your report; do not rewrite the frozen gold, rescue a particular arm, add model calls or change the score after unblinding. If the instrument itself is defective, identify affected answers and the limitation explicitly. This is bounded diagnosis, not a new experiment.
