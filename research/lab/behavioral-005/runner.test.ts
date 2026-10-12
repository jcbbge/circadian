import { describe, expect, test } from 'bun:test';
import { CASES, currentRecall, execute, parseAnnotation, validateCases } from './runner.ts';
import { parseReader } from '../calibration.ts';
import { JEV_MODEL } from '../harness.ts';

describe('bounded behavioral study instrument', () => {
  test('all six operations have the four declared conditions', () => {
    expect(validateCases()).toEqual({ cases:24, proposals:6 });
  });
  test('actual ordinary recall preserves every source and restores registry configuration', () => {
    const before = process.env.CIRCADIAN_REGISTRY;
    for (const c of CASES) {
      const recalled = currentRecall(c);
      for (const s of c.sources) expect(recalled).toContain(`[${s.id}]\n${s.text}`);
    }
    expect(process.env.CIRCADIAN_REGISTRY).toBe(before);
  });
  test('all actual operation branches execute without altering supplied evidence', () => {
    for (const c of CASES) for (const input of [c.input,...Object.values(c.annotation.variants).filter(x=>x!==null)]) {
      const before=JSON.stringify(input),result=execute(c,input);
      expect(result).toBeDefined();expect(JSON.stringify(input)).toBe(before);
    }
  });
  test('annotation parser rejects unknown choices, identity drift and invalid probability mass', () => {
    const c=CASES[0],keys=Object.keys(c.annotation.criteria),choice=keys[0];
    const response:any={model:JEV_MODEL,answers:{annotation:{type:'choice',choice,confidence:1,probabilities:Object.fromEntries(keys.map(k=>[k,k===choice?1:0]))}}};
    expect(parseAnnotation(response,c).choice).toBe(choice);
    expect(()=>parseAnnotation({...response,model:'unselected-model'},c)).toThrow();
    expect(()=>parseAnnotation({...response,answers:{annotation:{...response.answers.annotation,choice:'invented'}}},c)).toThrow();
    expect(()=>parseAnnotation({...response,answers:{annotation:{...response.answers.annotation,probabilities:{...response.answers.annotation.probabilities,[choice]:.4}}}},c)).toThrow();
  });
  test('reader format does not equate resolving references with semantic correctness', () => {
    expect(parseReader('{"status":"answer","claims":[{"text":"Unverified content","refs":["invented-id"]}],"unknown":[]}').claims[0].refs).toEqual(['invented-id']);
    expect(()=>parseReader('{"status":"answer","claims":[],"unknown":[]}')).toThrow();
    expect(parseReader('{"status":"abstain","claims":[],"unknown":["No date given"]}').status).toBe('abstain');
  });
});
