import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CAPABILITY, ROUTING, comparisonReady, executeDiagnostic, parseDecision,
  prepareDiagnostic, readRows, scoreDecision, summarizeDiagnostic,
  validateFixtures, verifyDiagnostic, type DiagnosticFixture,
} from './diagnostic.ts';
import { JEV_MODEL, READER_MODEL, type Transport } from './harness.ts';

// Runner fixtures only: none of the study author's cases or measured outcomes.
function fixtures(): DiagnosticFixture[] {
  const colors = ['amber', 'blue', 'sage', 'rose'];
  return colors.map((color, i) => {
    const support = `During outing ${i}, Etta chose the ${color} notebook.`;
    const background = `Account ${i} also records an ordinary walk.`;
    return {
      id: `case-${i}`, domain: `fictional-${i}`,
      source: `${support} ${background} Unrelated source-only detail ${i}.`,
      sufficient: `${support} ${background}`, missing: background,
      question: `Which notebook did Etta choose in account ${i}?`,
      options: { A: 'Amber', B: 'Blue', C: 'Sage', D: 'Rose' },
      expected: 'ABCD'[i], support, rationale: `HIDDEN_RATIONALE_${i}`,
    };
  });
}

function response(decision: unknown) {
  return { model: READER_MODEL, choices: [{ message: { content: JSON.stringify(decision) } }], usage: { prompt_tokens: 11, completion_tokens: 3 } };
}

function gate(choice: 'sufficient' | 'expand' | 'unknown') {
  return { model: JEV_MODEL, answers: { sufficiency: {
    type: 'choice', choice, confidence: 1,
    probabilities: { sufficient: +(choice === 'sufficient'), expand: +(choice === 'expand'), unknown: +(choice === 'unknown') },
  } }, usage: { input_tokens: 7, output_tokens: 2 } };
}

function idealReader(body: any, cases: DiagnosticFixture[]) {
  const input = JSON.parse(body.messages[1].content);
  const f = cases.find(row => row.question === input.question)!;
  if (input.memory.includes(f.support)) return response({ action: 'answer', choice: f.expected, evidence: f.support });
  return response({ action: body.messages[0].content === ROUTING ? 'expand' : 'abstain', reason: 'The notebook choice is absent.' });
}

function idealTransport(cases: DiagnosticFixture[]): Transport {
  return async (kind, body) => {
    if (kind === 'reader') return idealReader(body, cases);
    const f = cases.find(row => row.question === body.state.question)!;
    return gate(body.state.memory_view.includes(f.support) ? 'sufficient' : 'expand');
  };
}

const temporary: string[] = [];
let networkGuard: ReturnType<typeof spyOn>;
let consoleGuard: ReturnType<typeof spyOn>;
beforeEach(() => {
  networkGuard = spyOn(globalThis, 'fetch').mockImplementation(async () => { throw new Error('Network forbidden in diagnostic tests'); });
  consoleGuard = spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  const calls = networkGuard.mock.calls.length;
  networkGuard.mockRestore();
  consoleGuard.mockRestore();
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true });
  expect(calls).toBe(0);
});

function prepare() {
  const root = mkdtempSync(join(tmpdir(), 'circadian-diagnostic-test-'));
  temporary.push(root);
  const file = join(root, 'fixtures.json'), dir = join(root, 'run'), cases = fixtures();
  writeFileSync(file, JSON.stringify(cases));
  prepareDiagnostic(dir, file);
  return { dir, file, cases, transport: idealTransport(cases) };
}

async function throughBaseline() {
  const lab = prepare();
  await executeDiagnostic(lab.dir, 'diagnostic', lab.transport);
  await executeDiagnostic(lab.dir, 'baseline', lab.transport);
  return lab;
}

function assertNoGold(body: any, cases: DiagnosticFixture[]) {
  const input = body.state ?? JSON.parse(body.messages[1].content);
  for (const key of ['expected', 'support', 'rationale', 'view', 'probe', 'caseId', 'repeat', 'domain']) expect(Object.hasOwn(input, key)).toBe(false);
  for (const f of cases) expect(JSON.stringify(body)).not.toContain(f.rationale);
}

describe('fixture and scoring boundaries', () => {
  test('four balanced cases require exact support deletion', () => {
    expect(validateFixtures(fixtures())).toHaveLength(4);
    const unbalanced = fixtures(); unbalanced[3].expected = 'A';
    expect(() => validateFixtures(unbalanced)).toThrow(/Unbalanced/);
    const altered = fixtures(); altered[0].missing += ' An extra claim.';
    expect(() => validateFixtures(altered)).toThrow(/deletion/);
    const duplicate = fixtures(); duplicate[0].source += duplicate[0].support;
    expect(() => validateFixtures(duplicate)).toThrow(/deletion/);
  });

  test('correct options alone do not earn grounded credit, including quotes from a different source', () => {
    const [f, other] = fixtures();
    const correct = { action: 'answer', choice: f.expected, evidence: f.support };
    expect(scoreDecision(correct, f, f.sufficient, true, false)).toMatchObject({ answerCorrect: true, quoteFromMemory: true, decisiveSupport: true, supportedAnswer: true, decisionCorrect: true });
    expect(scoreDecision(correct, f, f.missing, false, false)).toMatchObject({ answerCorrect: true, quoteFromMemory: false, supportedAnswer: false, decisionCorrect: false });
    expect(scoreDecision({ ...correct, evidence: other.support }, f, f.sufficient, true, false)).toMatchObject({ answerCorrect: true, quoteFromMemory: false, decisiveSupport: false, supportedAnswer: false, decisionCorrect: true });
    expect(scoreDecision({ ...correct, evidence: f.missing }, f, f.sufficient, true, false)).toMatchObject({ quoteFromMemory: true, decisiveSupport: false, supportedAnswer: false, decisionCorrect: true });
    expect(scoreDecision({ ...correct, choice: 'B' }, f, f.sufficient, true, false)).toMatchObject({ answerCorrect: false, decisiveSupport: true, supportedAnswer: false, decisionCorrect: true });
    expect(scoreDecision({ action: 'abstain' }, f, f.missing, false, false).decisionCorrect).toBe(true);
    expect(scoreDecision({ action: 'expand' }, f, f.missing, false, true).decisionCorrect).toBe(true);
  });

  test('decision schema rejects coercible option arrays and actions unavailable in that condition', () => {
    const f = fixtures()[0];
    expect(() => parseDecision(response({ action: 'answer', choice: ['A'], evidence: f.support }), f.options, false)).toThrow(/Invalid reader decision/);
    expect(() => parseDecision(response({ action: 'expand', reason: 'Missing detail.' }), f.options, false)).toThrow(/Invalid reader decision/);
    expect(() => parseDecision(response({ action: 'abstain', reason: 'Missing detail.' }), f.options, true)).toThrow(/Invalid reader decision/);
    expect(() => parseDecision(response({ action: 'answer', choice: 'A', evidence: '' }), f.options, false)).toThrow();
  });
});

describe('independent diagnostic requests', () => {
  test('48 fresh requests split evenly and flag conditions differ only by the field', async () => {
    const { dir, cases, transport } = prepare();
    const result = await executeDiagnostic(dir, 'diagnostic', transport);
    expect(result).toMatchObject({ completed: 48, requests: 48, errors: 0 });
    expect(comparisonReady(dir)).toBe(true);
    const bundles = JSON.parse(readFileSync(join(dir, 'bundles.json'), 'utf8')).diagnostic;
    const calls = readRows(dir, 'diagnostic.calls.jsonl');
    const byId = new Map(calls.map(call => [call.trial, call.request]));
    for (const probe of ['capability', 'routing-absent', 'routing-false']) {
      expect(bundles.filter((t: any) => t.probe === probe)).toHaveLength(16);
      for (const view of ['sufficient', 'missing']) expect(bundles.filter((t: any) => t.probe === probe && t.view === view)).toHaveLength(8);
    }
    for (const call of calls) {
      expect(call.kind).toBe('reader');
      expect(call.request.messages).toHaveLength(2);
      expect(call.request.messages.map((m: any) => m.role)).toEqual(['system', 'user']);
      assertNoGold(call.request, cases);
      expect(call.request.messages[1].content).not.toContain('Unrelated source-only detail');
    }
    for (const t of bundles.filter((b: any) => b.probe === 'routing-absent')) {
      const partner = bundles.find((b: any) => b.caseId === t.caseId && b.view === t.view && b.repeat === t.repeat && b.probe === 'routing-false');
      const absent = byId.get(t.id), flagged = structuredClone(byId.get(partner.id));
      const input = JSON.parse(flagged.messages[1].content);
      expect(input.source_complete).toBe(false);
      delete input.source_complete;
      flagged.messages[1].content = JSON.stringify(input);
      expect(flagged).toEqual(absent);
    }
    const rows = readRows(dir, 'diagnostic.jsonl');
    expect(rows.every(r => r.readerCalls === 1 && r.gateCalls === 0)).toBe(true);
    expect(rows.filter(r => r.view === 'missing' && r.probe.startsWith('routing')).every(r => r.finalDecision.action === 'expand' && r.sourceDelivered === false)).toBe(true);
  });

  test('policy comparisons are blocked until sufficient capability is demonstrated', async () => {
    const { dir, cases } = prepare();
    let calls = 0;
    const count: Transport = async () => { calls++; return response({ action: 'abstain', reason: 'No evidence.' }); };
    await expect(executeDiagnostic(dir, 'baseline', count)).rejects.toThrow();
    expect(calls).toBe(0);
    await executeDiagnostic(dir, 'diagnostic', async (kind, body) => {
      expect(kind).toBe('reader');
      return body.messages[0].content === CAPABILITY ? response({ action: 'abstain', reason: 'Intentionally fail capability.' }) : idealReader(body, cases);
    });
    expect(comparisonReady(dir)).toBe(false);
    for (const phase of ['baseline', 'jev'] as const) await expect(executeDiagnostic(dir, phase, count)).rejects.toThrow(/gate/);
    expect(calls).toBe(0);
    expect(existsSync(join(dir, 'baseline.jsonl'))).toBe(false);
    expect(existsSync(join(dir, 'jev.jsonl'))).toBe(false);
  });

  test('eight correct capability actions cannot pass the gate with one unsupported answer', async () => {
    const { dir, cases } = prepare();
    let corrupted = false;
    await executeDiagnostic(dir, 'diagnostic', async (_kind, body) => {
      const reply = idealReader(body, cases);
      const decision = JSON.parse(reply.choices[0].message.content);
      if (!corrupted && body.messages[0].content === CAPABILITY && decision.action === 'answer') {
        corrupted = true;
        return response({ ...decision, choice: decision.choice === 'A' ? 'B' : 'A' });
      }
      return reply;
    });
    const sufficient = readRows(dir, 'diagnostic.jsonl').filter(r => r.probe === 'capability' && r.view === 'sufficient');
    expect(sufficient).toHaveLength(8);
    expect(sufficient.every(r => r.decisionCorrect && r.status === 'ok')).toBe(true);
    expect(sufficient.filter(r => r.supportedAnswer)).toHaveLength(7);
    expect(comparisonReady(dir)).toBe(false);
    let calls = 0;
    await expect(executeDiagnostic(dir, 'baseline', async () => { calls++; return response({}); })).rejects.toThrow(/gate/);
    expect(calls).toBe(0);
  });
});

describe('baseline and assisted policies', () => {
  test('baseline uses only needed expansions; assisted policy uses one final reader call', async () => {
    const { dir, cases, transport } = prepare();
    await executeDiagnostic(dir, 'diagnostic', transport);
    let prematureCalls = 0;
    await expect(executeDiagnostic(dir, 'jev', async () => { prematureCalls++; return gate('sufficient'); })).rejects.toThrow();
    expect(prematureCalls).toBe(0);
    const baseline = await executeDiagnostic(dir, 'baseline', transport);
    expect(baseline).toMatchObject({ completed: 32, requests: 40, errors: 0 });
    const baselineRows = readRows(dir, 'baseline.jsonl');
    expect(baselineRows.every(r => r.supportedAnswer)).toBe(true);
    expect(baselineRows.filter(r => r.probe === 'reader-policy' && r.expansion)).toHaveLength(8);
    for (const row of baselineRows) expect(row.readerCalls).toBe(row.probe === 'reader-policy' && row.view === 'missing' ? 2 : 1);
    expect(readRows(dir, 'baseline.calls.jsonl').every(r => r.kind === 'reader')).toBe(true);
    const assisted = await executeDiagnostic(dir, 'jev', transport);
    expect(assisted).toMatchObject({ completed: 16, requests: 32, errors: 0 });
    const assistedRows = readRows(dir, 'jev.jsonl');
    expect(assistedRows.every(r => r.readerCalls === 1 && r.gateCalls === 1 && r.supportedAnswer)).toBe(true);
    for (const row of assistedRows) expect(row.expansion).toBe(row.view === 'missing');
    for (const call of readRows(dir, 'jev.calls.jsonl')) assertNoGold(call.request, cases);
    const summary = summarizeDiagnostic(dir);
    expect(summary).toHaveLength(12);
    expect(summary.find(r => r.group === 'reader-policy/missing')).toMatchObject({ trials: 8, readerCalls: 16, gateCalls: 0, supportedAnswer: 8 });
    expect(summary.find(r => r.group === 'jev-policy/missing')).toMatchObject({ trials: 8, readerCalls: 8, gateCalls: 8, readerInput: 88, gateInput: 56 });
  });

  test('a wrong sufficient selection is not silently overridden by the final reader', async () => {
    const { dir, cases } = await throughBaseline();
    const result = await executeDiagnostic(dir, 'jev', async (kind, body) => kind === 'gate' ? gate('sufficient') : idealReader(body, cases));
    expect(result).toMatchObject({ completed: 16, requests: 32, errors: 0 });
    const missing = readRows(dir, 'jev.jsonl').filter(r => r.view === 'missing');
    expect(missing).toHaveLength(8);
    expect(missing.every(r => r.finalDecision.action === 'abstain' && !r.expansion && !r.supportedAnswer && r.readerCalls === 1 && !r.sourceDelivered)).toBe(true);
  });

  test('unknown selector decisions supply source and still make only one reader request', async () => {
    const { dir, cases } = await throughBaseline();
    const result = await executeDiagnostic(dir, 'jev', async (kind, body) => kind === 'gate' ? gate('unknown') : idealReader(body, cases));
    expect(result).toMatchObject({ completed: 16, requests: 32, errors: 0 });
    expect(readRows(dir, 'jev.jsonl').every(r => r.gateDecision === 'unknown' && r.sourceDelivered && r.expansion && r.supportedAnswer && r.readerCalls === 1)).toBe(true);
  });
});

describe('protocol failures and frozen artifacts', () => {
  for (const [label, makeResponse, expectedError] of [
    ['wrong model', () => ({ ...response({ action: 'abstain', reason: 'Absent.' }), model: 'wrong-model' }), 'Unexpected reader model'],
    ['malformed JSON', () => ({ model: READER_MODEL, choices: [{ message: { content: 'not JSON' } }] }), 'Malformed JSON'],
    ['invalid schema', () => response({ action: 'answer', choice: ['A'], evidence: 'A sentence.' }), 'Invalid reader decision'],
  ] as const) {
    test(`${label} preserves failures and stops after three attempts without retries`, async () => {
      const { dir } = prepare();
      const result = await executeDiagnostic(dir, 'diagnostic', async () => makeResponse());
      expect(result).toMatchObject({ completed: 3, requests: 3, errors: 3 });
      const failures = readRows(dir, 'diagnostic.jsonl');
      expect(failures.map(r => r.error)).toEqual(Array(3).fill(expectedError));
      expect(failures.every(r => !r.supportedAnswer && r.status === 'error')).toBe(true);
      expect(readRows(dir, 'diagnostic.calls.jsonl')).toHaveLength(3);
      let calls = 0;
      await expect(executeDiagnostic(dir, 'baseline', async () => { calls++; return response({}); })).rejects.toThrow(/gate/);
      expect(calls).toBe(0);
    });
  }

  test('transport failure and absent usage are reported as unknown costs', async () => {
    const failed = prepare();
    const result = await executeDiagnostic(failed.dir, 'diagnostic', async () => { throw new Error('HTTP 503'); });
    expect(result).toMatchObject({ completed: 3, requests: 3, errors: 3 });
    expect(readRows(failed.dir, 'diagnostic.jsonl').every(r => r.missingUsage && r.error === 'HTTP 503')).toBe(true);
    const missing = prepare();
    await executeDiagnostic(missing.dir, 'diagnostic', async (kind, body) => {
      const reply: any = await missing.transport(kind, body);
      delete reply.usage;
      return reply;
    });
    expect(readRows(missing.dir, 'diagnostic.jsonl').every(r => r.missingUsage && r.status === 'ok')).toBe(true);
    expect(summarizeDiagnostic(missing.dir).every(r => r.missingUsage)).toBe(true);
  });

  for (const file of ['gold.json', 'bundles.json', 'manifest.json']) {
    test(`changed ${file} fails before transport`, async () => {
      const { dir } = prepare();
      writeFileSync(join(dir, file), readFileSync(join(dir, file), 'utf8') + ' ');
      let calls = 0;
      await expect(executeDiagnostic(dir, 'diagnostic', async () => { calls++; return response({}); })).rejects.toThrow(/changed/);
      expect(calls).toBe(0);
      expect(existsSync(join(dir, 'diagnostic.jsonl'))).toBe(false);
    });
  }

  test('code hashes are checked without modifying any shared source file', () => {
    const { dir } = prepare();
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
    manifest.codeHashes['diagnostic.ts'] = '0'.repeat(64);
    const text = JSON.stringify(manifest);
    // Reseal only this temporary manifest to exercise the separate code check.
    writeFileSync(join(dir, 'manifest.json'), text);
    writeFileSync(join(dir, 'manifest.sha256'), createHash('sha256').update(text).digest('hex'));
    expect(() => verifyDiagnostic(dir)).toThrow(/Code changed/);
  });

  test('existing preparation, phase results and summaries cannot be overwritten', async () => {
    const { dir, file, transport } = prepare();
    const originalManifest = readFileSync(join(dir, 'manifest.json'), 'utf8');
    expect(() => prepareDiagnostic(dir, file)).toThrow(/exists/);
    expect(readFileSync(join(dir, 'manifest.json'), 'utf8')).toBe(originalManifest);
    await executeDiagnostic(dir, 'diagnostic', transport);
    const original = readFileSync(join(dir, 'diagnostic.jsonl'), 'utf8');
    let calls = 0;
    await expect(executeDiagnostic(dir, 'diagnostic', async () => { calls++; return response({}); })).rejects.toThrow(/exists/);
    expect(calls).toBe(0);
    expect(readFileSync(join(dir, 'diagnostic.jsonl'), 'utf8')).toBe(original);
    summarizeDiagnostic(dir);
    const summary = readFileSync(join(dir, 'summary.json'), 'utf8');
    expect(() => summarizeDiagnostic(dir)).toThrow();
    expect(readFileSync(join(dir, 'summary.json'), 'utf8')).toBe(summary);
  });

  test('reflected synthetic secrets are redacted from call and decision artifacts', async () => {
    const { dir, cases } = prepare();
    const prior = process.env.LAB_READER_API_KEY;
    const secret = 'SYNTHETIC_TEST_SECRET_123456';
    process.env.LAB_READER_API_KEY = secret;
    try {
      await executeDiagnostic(dir, 'diagnostic', async (_kind, body) => {
        const reply: any = idealReader(body, cases);
        const decision = JSON.parse(reply.choices[0].message.content);
        decision.reflection = secret;
        reply.choices[0].message.content = JSON.stringify(decision);
        reply.reflection = secret;
        return reply;
      });
      for (const file of ['diagnostic.calls.jsonl', 'diagnostic.jsonl']) {
        const text = readFileSync(join(dir, file), 'utf8');
        expect(text).not.toContain(secret);
        expect(text).toContain('[REDACTED]');
        expect(readRows(dir, file)).toHaveLength(48);
      }
    } finally {
      if (prior === undefined) delete process.env.LAB_READER_API_KEY;
      else process.env.LAB_READER_API_KEY = prior;
    }
  });
});
