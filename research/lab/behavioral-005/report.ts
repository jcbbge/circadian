import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, verify, parseAnnotation } from './runner.ts';
import { parseReader } from '../calibration.ts';
import type { StudyCase } from './contract.ts';

const ARMS = ['baseline', 'augmented', 'jev'] as const;
type Arm = typeof ARMS[number];
type Phase = { name: 'plain' | 'jev'; completion: any; rows: any[]; calls: any[] };
export type Evidence = {
  cases: StudyCase[]; manifest: any; prepared: any[]; phases: Phase[];
  blindMap: Record<string, string>; blindAnswers: any[]; semanticScores: any;
  smoke: any; hashes: Record<string, string>;
};
function requireThat(ok: unknown, message: string): asserts ok { if (!ok) throw Error(message); }
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const token = (x: unknown): number | null => finite(x) && Number.isInteger(x) ? x : null;
const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a,b) => a-b), m = Math.floor(sorted.length/2);
  return sorted.length % 2 ? sorted[m] : (sorted[m-1]! + sorted[m]!) / 2;
};
function amount(values: (number | null)[]) {
  const known = values.filter((v): v is number => v !== null);
  return { total: known.length === values.length ? known.reduce((a,b)=>a+b,0) : null,
    knownSum: known.length ? known.reduce((a,b)=>a+b,0) : values.length ? null : 0,
    missing: values.length-known.length };
}
function accounting(calls: any[]) {
  const input = calls.map(c => token(c.response?.usage?.[c.kind === 'reader' ? 'prompt_tokens' : 'input_tokens']));
  const output = calls.map(c => token(c.response?.usage?.[c.kind === 'reader' ? 'completion_tokens' : 'output_tokens']));
  return { requests: calls.length, readerRequests: calls.filter(c=>c.kind==='reader').length,
    annotationRequests: calls.filter(c=>c.kind==='gate').length,
    transportFailures: calls.filter(c=>c.error || !c.response).length,
    inputTokens: amount(input), outputTokens: amount(output),
    missingUsageCalls: calls.filter((_,i)=>input[i]===null || output[i]===null).length,
    totalTokens: input.every(v=>v!==null) && output.every(v=>v!==null) ?
      (input as number[]).reduce((a,b)=>a+b,0)+(output as number[]).reduce((a,b)=>a+b,0) : null,
    elapsedMs: amount(calls.map(c=>finite(c.elapsedMs)?c.elapsedMs:null)) };
}
function pairedRatios(rows: any[], left: Arm, right: Arm, ids: string[]) {
  const tokens: number[] = [], latency: number[] = [];
  for(const id of ids) {
    const a=rows.find(r=>r.caseId===id && r.arm===left), b=rows.find(r=>r.caseId===id && r.arm===right);
    if(!a || !b) continue;
    // A gate-only failure is counted in totals, but is not a completed reader
    // workflow to compare with a reader trial for a speed/efficiency claim.
    if(a.cost.readerRequests!==1 || b.cost.readerRequests!==1) continue;
    if(a.cost.totalTokens!==null && a.cost.totalTokens>0 && b.cost.totalTokens!==null) tokens.push(b.cost.totalTokens/a.cost.totalTokens);
    if(a.cost.elapsedMs.total!==null && a.cost.elapsedMs.total>0 && b.cost.elapsedMs.total!==null) latency.push(b.cost.elapsedMs.total/a.cost.elapsedMs.total);
  }
  return { left, right, tokens:{median:median(tokens),pairs:tokens.length}, latency:{median:median(latency),pairs:latency.length} };
}

/** Pure aggregation is exported so accounting can be checked with synthetic
 * failed/missing-usage calls without inference or real run writes. */
export function aggregate(e: Evidence) {
  const {cases,manifest:m}=e;
  requireThat(cases.length===24 && new Set(cases.map(c=>c.id)).size===24,'Expected 24 unique frozen cases');
  requireThat(e.phases.length===2 && e.phases.map(p=>p.name).sort().join()==='jev,plain','Both phase completion records are required');
  const byCase=new Map(cases.map(c=>[c.id,c])), prepared=new Map(e.prepared.map(b=>[b.id,b]));
  requireThat(prepared.size===24,'Expected 24 prepared request bundles');
  const expected=new Map<string,{caseId:string;arm:Arm;phase:string}>();
  for(const c of cases) for(const arm of ARMS) expected.set(`${c.id}-${arm}`,{caseId:c.id,arm,phase:arm==='jev'?'jev':'plain'});
  const allRows:any[]=[], allCalls:any[]=[], rowIds=new Set<string>();
  for(const p of e.phases) {
    const order=p.name==='plain'?m.plainOrder:m.jevOrder.map((id:string)=>({id,arm:'jev'}));
    const done=p.completion;
    requireThat(Array.isArray(order) && order.length===(p.name==='plain'?48:24),`Invalid frozen ${p.name} order`);
    requireThat(new Set(order.map((x:any)=>`${x.id}-${x.arm}`)).size===order.length,`Duplicate frozen ${p.name} trial`);
    requireThat(done.phase===p.name && done.planned===order.length && done.completed===p.rows.length && done.requests===p.calls.length,`${p.name} completion counts disagree with raw records`);
    requireThat(p.rows.length<=order.length && done.stopped===(p.rows.length!==order.length),`${p.name} has unacknowledged incompleteness`);
    requireThat(done.infrastructureFailures===p.rows.filter(r=>r.status==='error'&&r.failureKind==='infrastructure').length &&
      done.outputFailures===p.rows.filter(r=>r.status==='error'&&r.failureKind==='output').length,`${p.name} failure counts disagree`);
    requireThat(p.calls.length<=48,`${p.name} request ceiling exceeded`);
    for(const [i,r] of p.rows.entries()) {
      const x=expected.get(r.id), c=byCase.get(r.caseId);
      requireThat(x && c && x.phase===p.name && x.caseId===r.caseId && x.arm===r.arm && r.proposal===c.proposal && r.condition===c.condition,`Unknown or misidentified trial ${r.id}`);
      requireThat(r.id===`${order[i].id}-${order[i].arm}`,`${p.name} trial order drift`);
      requireThat(!rowIds.has(r.id),`Duplicate trial ${r.id}`); rowIds.add(r.id);
      requireThat(['ok','error'].includes(r.status),`Invalid status ${r.id}`);
      allRows.push(r);
    }
    for(const [i,c] of p.calls.entries()) {
      requireThat(c.sequence===i+1 && ['reader','gate'].includes(c.kind),`Invalid raw call ${p.name}/${i+1}`);
      requireThat(expected.get(c.trial)?.phase===p.name && p.rows.some(r=>r.id===c.trial),`Orphan raw call ${c.trial}`);
      requireThat(p.name==='jev'||c.kind==='reader',`Unexpected gate in plain phase`);
      requireThat(finite(c.elapsedMs),`Missing/invalid raw-call timing ${c.trial}`);
      allCalls.push({...c,phase:p.name});
    }
  }
  requireThat(allCalls.length<=m.maxStudyRequests,'Study request ceiling exceeded');
  requireThat(allRows.length===72 || e.phases.some(p=>p.completion.stopped),'Incomplete trials require explicit stopped completion');
  const mapKeys=Object.keys(e.blindMap), mappedTrials=Object.values(e.blindMap);
  requireThat(mapKeys.length===allRows.length && new Set(mappedTrials).size===allRows.length && mappedTrials.every(id=>rowIds.has(id)),'Blind map must cover every observed trial exactly once');
  requireThat(Array.isArray(e.blindAnswers) && e.blindAnswers.length===mapKeys.length && new Set(e.blindAnswers.map(a=>a.id)).size===mapKeys.length,'Blind answers must be unique and complete');
  const answers=new Map(e.blindAnswers.map(a=>[a.id,a]));
  requireThat(mapKeys.every(id=>answers.has(id)),'Unknown or missing anonymous answer');
  requireThat(e.semanticScores?.reviewer && Array.isArray(e.semanticScores.scores),'Semantic scores/reviewer missing');
  const scores=new Map<string,any>();
  for(const s of e.semanticScores.scores) {
    requireThat(Object.hasOwn(e.blindMap,s.id) && !scores.has(s.id),`Unknown/duplicate semantic score ${s.id}`);
    requireThat(typeof s.rationale==='string' && s.rationale.trim().length>0,`Score rationale missing ${s.id}`);
    requireThat(Array.isArray(s.unsupported) && s.unsupported.every((v:any)=>typeof v==='string') &&
      Array.isArray(s.attributionOrQualificationErrors) && s.attributionOrQualificationErrors.every((v:any)=>typeof v==='string'),`Invalid score error arrays ${s.id}`);
    requireThat(typeof s.uncertaintyAppropriate==='boolean' && typeof s.useful==='boolean' && typeof s.semanticPass==='boolean',`Nonboolean semantic flags ${s.id}`);
    scores.set(s.id,s);
  }
  requireThat(scores.size===mapKeys.length,'One semantic score is required per anonymous answer');
  const anonymousByTrial=new Map(Object.entries(e.blindMap).map(([a,t])=>[t,a]));
  const rows=allRows.map(r=>{
    const c=byCase.get(r.caseId)!, b=prepared.get(r.caseId), calls=allCalls.filter(x=>x.trial===r.id);
    const readers=calls.filter(x=>x.kind==='reader'), gates=calls.filter(x=>x.kind==='gate');
    requireThat(readers.length<=1 && gates.length===(r.arm==='jev'?1:0) && (r.arm==='jev'||readers.length===1),`Invalid stage counts ${r.id}`);
    const reader=readers[0], gate=gates[0];
    let annotation:any=null, annotationError:string|null=null;
    if(gate) {
      requireThat(same(gate.request,b.annotationRequest),`Annotation request differs from frozen bundle ${r.id}`);
      try {
        const a=parseAnnotation(gate.response,c);
        annotation={choice:a.choice,correct:a.choice===c.annotation.expected,fallback:c.annotation.variants[a.choice]===null,confidence:a.confidence};
      } catch(err) { annotationError=err instanceof Error?err.message:'Invalid annotation'; }
      requireThat(Boolean(r.annotation)===Boolean(annotation),`Annotation validity disagrees with raw response ${r.id}`);
      if(annotation) requireThat(r.annotation.choice===annotation.choice && r.annotation.correct===annotation.correct && r.annotation.fallback===annotation.fallback,`Annotation accounting drift ${r.id}`);
      requireThat(!reader||annotation!==null,`Reader follows invalid annotation ${r.id}`);
    }
    if(reader) {
      const frozen=r.arm==='baseline'?b.baseline:r.arm==='augmented'?b.augmented:b.branches[annotation.choice].request;
      requireThat(same(reader.request,frozen),`Reader request differs from frozen bundle ${r.id}`);
    }
    const expectedMs=r.arm==='augmented'?b.operationMs:r.arm==='jev'&&annotation?b.branches[annotation.choice].operationMs:0;
    requireThat(finite(r.operationMs) && r.operationMs===expectedMs,`Preparation operation timing drift ${r.id}`);
    const anonymousId=anonymousByTrial.get(r.id)!, blind=answers.get(anonymousId), score=scores.get(anonymousId);
    const rawAnswer=reader?.response?.choices?.[0]?.message?.content??null;
    requireThat(same(blind.sources,c.sources) && blind.question===c.question && same(blind.rubric,c.rubric) && blind.answer===rawAnswer,`Blinded evidence mismatch ${anonymousId}`);
    requireThat(Array.isArray(score.requiredMet) && score.requiredMet.length===c.rubric.required.length && score.requiredMet.every((v:any)=>typeof v==='boolean'),`Required proposition scores invalid ${anonymousId}`);
    const formula=score.requiredMet.every(Boolean) && score.unsupported.length===0 && score.attributionOrQualificationErrors.length===0 && score.uncertaintyAppropriate && score.useful;
    requireThat(score.semanticPass===formula,`Semantic formula disagreement ${anonymousId}`);
    let parsed:any=null;
    try { if(typeof rawAnswer==='string') parsed=parseReader(rawAnswer); } catch { /* Observed schema failure; no repair. */ }
    const schemaValid=r.parsed!==null;
    requireThat(!schemaValid || parsed!==null && same(parsed,r.parsed),`Parsed response mismatch ${r.id}`);
    const missingRefs=schemaValid?[...new Set(parsed.claims.flatMap((x:any)=>x.refs))].filter(id=>!c.sources.some(s=>s.id===id)):[];
    const refsResolved=schemaValid?missingRefs.length===0:null;
    requireThat(r.refsResolved===refsResolved,`Reference-existence result mismatch ${r.id}`);
    requireThat(same(blind.mechanical,{status:r.status,schemaValid,refsResolved}),`Blinded mechanical metadata drift ${anonymousId}`);
    requireThat(!score.semanticPass || parsed!==null,`Unparseable/null answer scored as passing ${anonymousId}`);
    const outputTokens=token(reader?.response?.usage?.completion_tokens), outputLimit=reader?.request?.max_tokens;
    const nearCapMalformed=typeof rawAnswer==='string' && parsed===null && outputTokens!==null &&
      Number.isInteger(outputLimit) && outputLimit>0 && outputTokens>=outputLimit-1;
    const mechanical={status:r.status,readerAttempted:!!reader,transportOk:!!reader?.response&&!reader.error,
      identityMatches:reader?.response?.model===m.reader.model,completed:reader?.response?.choices?.[0]?.finish_reason==='stop',
      schemaValid,refsResolved,missingRefs,nearCapMalformed};
    const mechanicalPass=r.status==='ok' && mechanical.transportOk && mechanical.identityMatches && mechanical.completed && schemaValid && refsResolved===true;
    return {id:r.id,caseId:r.caseId,proposal:r.proposal,condition:r.condition,arm:r.arm,anonymousId,
      pass:mechanicalPass&&score.semanticPass,semantic:score,mechanical,mechanicalPass,annotation,annotationError,
      cost:accounting(calls),operationPreparationMs:r.operationMs,
      readerInputCharacters:reader?JSON.stringify(reader.request).length:null,
      failureKind:r.failureKind,error:r.error??null};
  });
  const armSummary=Object.fromEntries(ARMS.map(arm=>{
    const rs=rows.filter(r=>r.arm===arm), ids=new Set(rs.map(r=>r.id));
    return [arm,{planned:24,observed:rs.length,pass:rs.filter(r=>r.pass).length,
      semanticPass:rs.filter(r=>r.semantic.semanticPass).length,mechanicalPass:rs.filter(r=>r.mechanicalPass).length,
      schemaFailures:rs.filter(r=>r.mechanical.readerAttempted && !r.mechanical.schemaValid).length,
      nearCapMalformed:rs.filter(r=>r.mechanical.nearCapMalformed).length,
      referenceFailures:rs.filter(r=>r.mechanical.refsResolved===false).length,
      referenceUnchecked:rs.filter(r=>r.mechanical.refsResolved===null).length,
      unfinishedOrMissing:rs.filter(r=>!r.mechanical.completed).length,
      cost:accounting(allCalls.filter(c=>ids.has(c.trial))),
      operationPreparationMs:rs.reduce((n,r)=>n+r.operationPreparationMs,0)}];
  }));
  function changes(ids:string[],left:Arm,right:Arm) {
    const repaired:string[]=[],regressed:string[]=[],newErrorCases:string[]=[];
    for(const id of ids) {
      const a=rows.find(r=>r.caseId===id&&r.arm===left),b=rows.find(r=>r.caseId===id&&r.arm===right);
      if(!a||!b)continue;
      if(!a.pass&&b.pass)repaired.push(id);if(a.pass&&!b.pass)regressed.push(id);
      if(a.mechanicalPass&&!b.mechanicalPass || a.semantic.requiredMet.some((v:boolean,i:number)=>v&&!b.semantic.requiredMet[i]) ||
        a.semantic.unsupported.length===0&&b.semantic.unsupported.length>0 ||
        a.semantic.attributionOrQualificationErrors.length===0&&b.semantic.attributionOrQualificationErrors.length>0 ||
        a.semantic.uncertaintyAppropriate&&!b.semantic.uncertaintyAppropriate || a.semantic.useful&&!b.semantic.useful) newErrorCases.push(id);
    }
    return {repaired,regressed,newErrorCases};
  }
  const proposals=['01','02','03','04','05','06'].map(proposal=>{
    const cs=cases.filter(c=>c.proposal===proposal),ids=cs.map(c=>c.id);
    requireThat(cs.length===4,'Four cases required per proposal');
    const primary=changes(ids,'baseline','augmented'),assisted=changes(ids,'augmented','jev');
    const observed=Object.fromEntries(ARMS.map(arm=>[arm,rows.filter(r=>ids.includes(r.caseId)&&r.arm===arm).length]));
    const pass=Object.fromEntries(ARMS.map(arm=>[arm,rows.filter(r=>ids.includes(r.caseId)&&r.arm===arm&&r.pass).length]));
    const remainingUnsupported=rows.some(r=>ids.includes(r.caseId)&&r.arm==='augmented'&&r.semantic.unsupported.length>0);
    const disposition=observed.baseline!==4||observed.augmented!==4?'Incomplete primary comparison; no benefit conclusion.':
      primary.regressed.length||primary.newErrorCases.length?'Refine before integration: a paired regression or newly observed error.':
      primary.repaired.length&&remainingUnsupported?'Repairs with unsupported content remaining; refine before integration.':
      primary.repaired.length?'Useful signal on these cases; candidate for confirmation, not integration approval.':
      'No demonstrated added benefit on these cases.';
    const ordinary=cs.find(c=>c.condition==='ordinary')!;
    return {proposal,pass,observed,primary,assisted,disposition,
      pairedRatios:{primary:pairedRatios(rows,'baseline','augmented',ids),assisted:pairedRatios(rows,'baseline','jev',ids)},
      ordinary:{caseId:ordinary.id,rows:rows.filter(r=>r.caseId===ordinary.id),primary:pairedRatios(rows,'baseline','augmented',[ordinary.id]),assisted:pairedRatios(rows,'baseline','jev',[ordinary.id])}};
  });
  const annotationRows=rows.filter(r=>r.arm==='jev');
  const annotations={planned:24,attempted:allCalls.filter(c=>c.kind==='gate').length,valid:annotationRows.filter(r=>r.annotation).length,
    correct:annotationRows.filter(r=>r.annotation?.correct).length,fallback:annotationRows.filter(r=>r.annotation?.fallback).length,
    failedOrMalformed:annotationRows.filter(r=>r.annotationError).length};
  const smokeCalls=['reader','annotation'].filter(k=>e.smoke[k]?.request).map(k=>({...e.smoke[k],kind:k==='reader'?'reader':'gate'}));
  requireThat(smokeCalls.length<=m.maxSmokeRequests,'Smoke request ceiling exceeded');
  const conditions=['useful','missing','misleading','ordinary'].map(condition=>({condition,plannedPerArm:6,
    observed:Object.fromEntries(ARMS.map(arm=>[arm,rows.filter(r=>r.condition===condition&&r.arm===arm).length])),
    passes:Object.fromEntries(ARMS.map(arm=>[arm,rows.filter(r=>r.condition===condition&&r.arm===arm&&r.pass).length])),
    primary:changes(cases.filter(c=>c.condition===condition).map(c=>c.id),'baseline','augmented')}));
  return {study:m.study,generatedAt:new Date().toISOString(),complete:rows.length===72,
    plannedTrials:72,observedTrials:rows.length,missingTrials:[...expected.keys()].filter(id=>!rowIds.has(id)),
    phaseCompletions:e.phases.map(p=>p.completion),reader:m.reader,annotationModel:m.annotation,
    semanticReviewer:e.semanticScores.reviewer,annotations,arms:armSummary,
    studyCalls:accounting(allCalls),smokeCalls:{purpose:'Transport only; excluded from study outcomes',cost:accounting(smokeCalls)},
    proposals,conditions,rows,artifactHashes:e.hashes,sourceHashes:m.sourceHashes,inputHashes:m.inputHashes,
    limitations:[...m.limits,'Single frozen observation per case and arm; no inference retries or inter-rater reliability estimate.',
      'Resolving references establish source-ID existence only; entailment is evaluated separately by the semantic reviewer.',
      'Operation durations were measured during frozen branch preparation, not deployed runtime.',
      'Raw-call HTTP accounting excludes fixture preparation and setup/review/scoring model computation.',
      'Assisted fallback removes annotations and the operation; its outcome does not isolate annotation correction alone.',
      'Ratios include all reported gate and reader usage/timing for reader-attempted paired trials; missing usage is never zero-filled.',
      'New-error flags compare required propositions and error categories; concrete paired rationales remain necessary when both answers have errors.']};
}

const escape = (v:unknown) => String(v).replaceAll('|','\\|').replaceAll('\n',' ');
const number = (v:number|null,digits=2) => v===null?'unknown':v.toFixed(digits);
const quantity = (x:any) => x.total!==null?String(x.total):`${x.knownSum??'unknown'} known; ${x.missing} missing`;
const ratio = (x:any) => `${number(x.median)}× (n=${x.pairs})`;
const ids = (xs:string[]) => xs.length?xs.join(', '):'—';
export function markdown(s:ReturnType<typeof aggregate>) {
  const names:Record<string,string>={'01':'Coordinated views','02':'Contextual compatibility','03':'Typed relations','04':'Reusable operations','05':'Joint experiences','06':'Checked transformations'};
  const lines=[
    '# Behavioral 005 — bounded results','',
    s.complete?'All 72 planned trials are recorded.':'**INCOMPLETE STUDY: '+s.observedTrials+'/72 trials recorded. Missing trials are not silently counted as observed failures. No complete-study conclusion is available.**','',
    'This compares one fixed reader consuming the same fictional recalled sources and supplied annotations, with or without an actual research-operation output. Circadian production behavior was not changed. The primary comparison is baseline versus augmented. Jev-assisted trials separately alter one bounded annotation; uncertainty fallback removes annotations and the operation.','',
    `Reader: \`${s.reader.model}\`. Annotation model: \`${s.annotationModel.model}\`. One observation per case/arm; ${s.studyCalls.requests} study HTTP requests. Semantic scoring: ${escape(s.semanticReviewer.method)}.`, '',
    'A pass requires both source-grounded semantic usefulness and completed, correctly identified, schema-valid output with resolving source IDs. Resolving an ID does not establish entailment.','',
    '| Proposal | Baseline /4 | Augmented /4 | Jev-assisted /4 | Repaired / regressed case IDs | Bounded disposition |',
    '| --- | ---: | ---: | ---: | --- | --- |',
    ...s.proposals.map(p=>`| ${p.proposal} ${names[p.proposal]} | ${p.pass.baseline} (${p.observed.baseline} observed) | ${p.pass.augmented} (${p.observed.augmented} observed) | ${p.pass.jev} (${p.observed.jev} observed) | Primary repair: ${ids(p.primary.repaired)}; regression: ${ids(p.primary.regressed)}. Assisted vs augmented repair: ${ids(p.assisted.repaired)}; regression: ${ids(p.assisted.regressed)}. | ${p.disposition} |`),'',
    'No automatic shipping or promotion decision follows from this table. New-error category flags and individual rationales below qualify aggregate pass counts.','',
    '## Annotation and mechanical accounting','',
    `Annotation agreement: **${s.annotations.correct}/24 planned**, ${s.annotations.correct}/${s.annotations.valid} valid responses; ${s.annotations.attempted} attempted. Conservative fallbacks: ${s.annotations.fallback}. Failed/malformed annotation responses: ${s.annotations.failedOrMalformed}. All executed calls, including failed or malformed annotation calls, are included below.`, '',
    '| Arm | Observed /24 | Semantic pass | Mechanical pass | Schema failures among reader attempts | Near-cap malformed | Unresolved references | References unchecked | Unfinished/missing reader |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...ARMS.map(a=>{const r:any=s.arms[a];return `| ${a} | ${r.observed} | ${r.semanticPass} | ${r.mechanicalPass} | ${r.schemaFailures} | ${r.nearCapMalformed} | ${r.referenceFailures} | ${r.referenceUnchecked} | ${r.unfinishedOrMissing} |`;}),'',
    'Near-cap malformed means an unparseable reader answer with reported completion tokens at least max_tokens minus one. This flags an observed association, not a proven cause; it is counted even when the endpoint reports finish_reason=stop. These attempts and tokens remain in all HTTP totals.','',
    '## Raw HTTP cost','',
    'Token totals use response usage fields in the raw call logs. “Known” is a partial sum, never a zero-filled estimate. Elapsed time is the sum of measured raw HTTP-call durations. Gate tokens use input_tokens/output_tokens; reader tokens use prompt_tokens/completion_tokens. Dollar costs were not estimated.','',
    '| Arm | HTTP requests (reader / gate) | Input tokens | Output tokens | Calls missing usage | HTTP elapsed ms |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...ARMS.map(a=>{const c:any=s.arms[a].cost;return `| ${a} | ${c.requests} (${c.readerRequests} / ${c.annotationRequests}) | ${quantity(c.inputTokens)} | ${quantity(c.outputTokens)} | ${c.missingUsageCalls} | ${number(c.elapsedMs.total)} |`;}),
    `| Study total | ${s.studyCalls.requests} (${s.studyCalls.readerRequests} / ${s.studyCalls.annotationRequests}) | ${quantity(s.studyCalls.inputTokens)} | ${quantity(s.studyCalls.outputTokens)} | ${s.studyCalls.missingUsageCalls} | ${number(s.studyCalls.elapsedMs.total)} |`,
    `| Transport smoke, separate | ${s.smokeCalls.cost.requests} (${s.smokeCalls.cost.readerRequests} / ${s.smokeCalls.cost.annotationRequests}) | ${quantity(s.smokeCalls.cost.inputTokens)} | ${quantity(s.smokeCalls.cost.outputTokens)} | ${s.smokeCalls.cost.missingUsageCalls} | ${number(s.smokeCalls.cost.elapsedMs.total)} |`,'',
    'Setup, fixture construction, independent review and semantic-review agent computation are outside this HTTP accounting. The operationPreparationMs fields are preparation measurements of frozen branches, not deployed runtime or a measured reduction in agent work.','',
    '## Paired overhead','',
    'Each value is the median of measurable case-level ratios, not a ratio of group totals. Tokens include input plus output and include Jev when present. Ratios require a reader attempt on both sides; gate-only failures remain in raw totals. Later execution of the assisted phase is a latency confound.','',
    '| Proposal | Augmented/baseline tokens | Augmented/baseline HTTP latency | Assisted/baseline tokens | Assisted/baseline HTTP latency |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...s.proposals.map(p=>`| ${p.proposal} | ${ratio(p.pairedRatios.primary.tokens)} | ${ratio(p.pairedRatios.primary.latency)} | ${ratio(p.pairedRatios.assisted.tokens)} | ${ratio(p.pairedRatios.assisted.latency)} |`),'',
    'Ordinary cases are negative controls: a direct source should suffice. Their overhead is shown even when all arms answer correctly.','',
    '| Ordinary case | Baseline / augmented / assisted total tokens | Baseline / augmented / assisted HTTP ms | Augmented/baseline tokens; latency | Assisted/baseline tokens; latency |',
    '| --- | --- | --- | --- | --- |',
    ...s.proposals.map(p=>{const rs=ARMS.map(a=>p.ordinary.rows.find(r=>r.arm===a));return `| ${p.ordinary.caseId} | ${rs.map(r=>r?.cost.totalTokens??'unknown').join(' / ')} | ${rs.map(r=>number(r?.cost.elapsedMs.total??null)).join(' / ')} | ${ratio(p.ordinary.primary.tokens)}; ${ratio(p.ordinary.primary.latency)} | ${ratio(p.ordinary.assisted.tokens)}; ${ratio(p.ordinary.assisted.latency)} |`;}),'',
    '## One observation by condition','',
    ...s.conditions.map(c=>`- **${c.condition}:** baseline ${c.passes.baseline}/6, augmented ${c.passes.augmented}/6, assisted ${c.passes.jev}/6 passed (${c.observed.baseline}/${c.observed.augmented}/${c.observed.jev} observed). Primary repairs: ${ids(c.primary.repaired)}. Primary regressions: ${ids(c.primary.regressed)}. New-error flags: ${ids(c.primary.newErrorCases)}.`),'',
    '## Paired cases and semantic rationales','',
    'The [raw plain calls](run/plain.calls.jsonl), [raw assisted calls](run/jev.calls.jsonl), [trial records without Jev](run/plain.results.jsonl), [assisted trial records](run/jev.results.jsonl), [anonymous map](run/blind-map.json) and [semantic scores](run/semantic-scores.json) retain the evidence behind each row. “Required” counts rubric propositions, not lexical matches.','',
  ];
  for(const p of s.proposals) {
    lines.push(`### ${p.proposal} ${names[p.proposal]}`,'',`New primary error flags: ${ids(p.primary.newErrorCases)}. New assisted error flags: ${ids(p.assisted.newErrorCases)}.`,'');
    for(const caseId of [...new Set(s.rows.filter(r=>r.proposal===p.proposal).map(r=>r.caseId))]) {
      lines.push(`**${caseId}**`,'');
      for(const arm of ARMS) {
        const r=s.rows.find(r=>r.caseId===caseId&&r.arm===arm);
        if(!r){lines.push(`- ${arm}: unobserved.`);continue;}
        lines.push(`- **${arm}: ${r.pass?'pass':'fail'}** (${r.anonymousId}; semantic ${r.semantic.semanticPass?'pass':'fail'}, mechanical ${r.mechanicalPass?'pass':'fail'}; required ${r.semantic.requiredMet.filter(Boolean).length}/${r.semantic.requiredMet.length}). ${escape(r.semantic.rationale)}${r.error?` Recorded failure: ${escape(r.error)}.`:''}`);
        if(r.semantic.unsupported.length)lines.push(`  Unsupported: ${r.semantic.unsupported.map(escape).join('; ')}.`);
        if(r.semantic.attributionOrQualificationErrors.length)lines.push(`  Attribution/qualification: ${r.semantic.attributionOrQualificationErrors.map(escape).join('; ')}.`);
      }
      lines.push('');
    }
  }
  lines.push('## Evidence boundaries','',...s.limitations.map(v=>`- ${v}`),'',
    'Frozen sources, prompts, fixture hashes and preparation checks are in the [manifest](run/manifest.json). The [machine-readable summary](run/summary.json) repeats source/input hashes and records hashes of every scored artifact and this aggregator. No fixture or gold was rewritten after inference.','');
  if(s.missingTrials.length)lines.push('Missing trials: '+s.missingTrials.join(', '),'');
  return lines.join('\n');
}

export function report() {
  const run=join(HERE,'run'),summaryPath=join(run,'summary.json'),resultPath=join(HERE,'RESULTS.md');
  if(existsSync(summaryPath)||existsSync(resultPath))throw Error('Report already exists; no overwrite');
  const manifest=verify();
  const hashes:Record<string,string>={};
  const readText=(p:string)=>{const text=readFileSync(join(HERE,p),'utf8');hashes[p]=createHash('sha256').update(text).digest('hex');return text;};
  const read=(p:string)=>JSON.parse(readText(p));
  const jsonl=(p:string)=>readText(p).split('\n').filter(x=>x.trim()).map((x,i)=>{try{return JSON.parse(x);}catch{throw Error(`Malformed JSONL ${p}:${i+1}`);}});
  const callFiles=readdirSync(run).filter(p=>p.endsWith('.calls.jsonl')).sort();
  requireThat(same(callFiles,['jev.calls.jsonl','plain.calls.jsonl']),'Unexpected/missing raw-call files; cannot silently omit requests');
  const phases:Phase[]=(['plain','jev'] as const).map(name=>({name,completion:read(`run/${name}.complete.json`),rows:jsonl(`run/${name}.results.jsonl`),calls:jsonl(`run/${name}.calls.jsonl`)}));
  readText('report.ts');readText('run/manifest.json');
  const summary=aggregate({manifest,cases:read('run/cases.json'),prepared:read('run/requests.json'),phases,
    blindMap:read('run/blind-map.json'),blindAnswers:read('run/blind-answers.json'),semanticScores:read('run/semantic-scores.json'),smoke:read('smoke.json'),hashes});
  const prose=markdown(summary);
  writeFileSync(summaryPath,JSON.stringify(summary,null,2)+'\n',{flag:'wx',mode:0o600});
  writeFileSync(resultPath,prose,{flag:'wx',mode:0o600});
  return {complete:summary.complete,trials:summary.observedTrials,studyRequests:summary.studyCalls.requests,summary:summaryPath,results:resultPath};
}
if(import.meta.main)console.log(report());
