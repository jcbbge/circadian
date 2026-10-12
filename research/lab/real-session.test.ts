import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { COMPRESS, ROUTE, TERMINAL, compress, freeze, report, run, verify, type Case } from './real-session.ts';
import { JEV_MODEL, READER_MODEL, type Transport } from './harness.ts';

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const read = (dir: string, file: string) => JSON.parse(readFileSync(join(dir, file), 'utf8'));
const save = (dir: string, file: string, value: unknown) => writeFileSync(join(dir, file), JSON.stringify(value));
const rows = (dir: string, file: string): any[] => readFileSync(join(dir, file), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
const temporary: string[] = [];
let networkGuard: ReturnType<typeof spyOn>, consoleGuard: ReturnType<typeof spyOn>;

beforeEach(() => {
  networkGuard = spyOn(globalThis, 'fetch').mockImplementation(async () => { throw new Error('Network forbidden in runner tests'); });
  consoleGuard = spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  const calls = networkGuard.mock.calls.length;
  networkGuard.mockRestore(); consoleGuard.mockRestore();
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true });
  expect(calls).toBe(0);
});

function reply(content: string) {
  return { model: READER_MODEL, choices: [{ finish_reason: 'stop', message: { content } }], usage: { prompt_tokens: 11, completion_tokens: 3 } };
}
const answer = (decision: unknown) => reply(JSON.stringify(decision));
function selection(choice: 'sufficient' | 'expand' | 'unknown') {
  return { model: JEV_MODEL, answers: { sufficiency: { type: 'choice', choice, confidence: 1,
    probabilities: { sufficient: +(choice === 'sufficient'), expand: +(choice === 'expand'), unknown: +(choice === 'unknown') },
  } }, usage: { input_tokens: 7, output_tokens: 2 } };
}

// Fictional runner fixtures only; no real conversations, paths, or study outcomes.
// Token counts are bounded schema fixtures, not measurements of these strings.
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'circadian-real-runner-test-')); temporary.push(dir);
  const cases: Case[] = [];
  const sources = Array.from({ length: 3 }, (_, i) => {
    const turns = [
      { line: 1, role: 'user', text: `On outing ${i}, Ada chose the amber notebook.` },
      { line: 3, role: 'assistant', text: `On outing ${i}, Ada's stated preference was the quiet path.` },
      { line: 5, role: 'user', text: `On outing ${i}, Ada reserved the late ferry.` },
    ];
    const source = turns.map(t => `[line ${t.line} | ${t.role}]\n${t.text}`).join('\n\n');
    turns.forEach((t, j) => cases.push({ id: `case-${i}-${j}`, sourceId: `source-${i}`,
      question: `What is the recorded selection for outing ${i}, detail ${j}?`,
      options: { A: 'Amber notebook', B: 'Quiet path', C: 'Late ferry', D: 'Not established' },
      expected: 'ABC'[j], rationale: `HIDDEN_GOLD_RATIONALE_${i}_${j}`,
      evidence: [{ line: t.line, quote: t.text }], sufficiency: j === 2 ? 'expand' : 'sufficient',
    }));
    return { id: `source-${i}`, source, source_sha256: hash(source), token_count: 128, full_token_count: 128, turns };
  });
  const memories = sources.map(s => s.turns.slice(0, 2).map(t => t.text).join('\n'));
  const transport: Transport = async (kind, body) => {
    if (kind === 'reader' && body.messages[0].content === COMPRESS) return reply(memories[sources.findIndex(s => s.source === body.messages[1].content)]);
    const input = kind === 'gate' ? body.state : JSON.parse(body.messages[1].content);
    const c = cases.find(c => c.question === input.question)!;
    const supported = (kind === 'gate' ? input.memory_view : input.memory).includes(c.evidence[0].quote);
    if (kind === 'gate') return selection(supported ? 'sufficient' : 'expand');
    return supported ? answer({ action: 'answer', choice: c.expected, evidence: c.evidence[0].quote })
      : answer({ action: body.messages[0].content === ROUTE ? 'expand' : 'abstain', reason: 'The relevant detail is absent.' });
  };
  save(dir, 'sources.json', { sources }); save(dir, 'cases.json', cases);
  return { dir, sources, cases, memories, transport };
}
async function prepared() {
  const lab = setup(); await compress(lab.dir, lab.transport); freeze(lab.dir); return lab;
}
function assertNoGold(body: any, cases: Case[]) {
  const input = body.state ?? JSON.parse(body.messages[1].content);
  for (const field of ['expected', 'rationale', 'sufficiency', 'evidence', 'caseId', 'sourceId', 'policy', 'repeat']) expect(Object.hasOwn(input, field)).toBe(false);
  for (const c of cases) expect(JSON.stringify(body)).not.toContain(c.rationale);
}

describe('query-blind compression and review freeze', () => {
  test('compression receives only source text and frozen views match actual output', async () => {
    const { dir, sources, memories, transport } = setup();
    expect(await compress(dir, transport)).toEqual({ summaries: 3 });
    const calls = rows(dir, 'compression.calls.jsonl'), views = read(dir, 'views.json');
    expect(calls).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      expect(calls[i].request.messages).toEqual([{ role: 'system', content: COMPRESS }, { role: 'user', content: sources[i].source }]);
      expect(calls[i].request.max_tokens).toBe(1200);
      expect(views[i]).toEqual({ sourceId: sources[i].id, memory: memories[i], memoryHash: hash(memories[i]) });
      expect(calls[i].response.choices[0].message.content).toBe(views[i].memory);
    }
    expect(read(dir, 'compression-manifest.json').futureQuestionsSupplied).toBe(false);
    expect(freeze(dir)).toEqual({ trials: 72 });
    const trials = read(dir, 'trials.json');
    expect(trials.filter((t: any) => t.policy !== 'jev')).toHaveLength(54);
    expect(trials.filter((t: any) => t.policy === 'jev')).toHaveLength(18);
    for (const c of read(dir, 'cases.json')) for (const repeat of [1, 2]) {
      expect(trials.filter((t: any) => t.caseId === c.id && t.repeat === repeat).map((t: any) => t.policy).sort()).toEqual(['absent', 'flagged', 'jev', 'source']);
    }
  });

  test('bad source hashes, renderings, roles, and token bounds reject before inference', async () => {
    for (const mutate of [
      (s: any) => { s.source_sha256 = 'wrong'; },
      (s: any) => { s.turns[0].text = 'Changed after rendering'; },
      (s: any) => { s.turns[0].role = 'tool'; },
      (s: any) => { s.token_count = 18001; },
      (s: any) => { s.token_count = 0; },
    ]) {
      const { dir, sources } = setup(); mutate(sources[0]); save(dir, 'sources.json', { sources });
      let calls = 0;
      await expect(compress(dir, async () => { calls++; return reply('Unexpected'); })).rejects.toThrow(/sources/);
      expect(calls).toBe(0);
      expect(existsSync(join(dir, 'compression-manifest.json'))).toBe(false);
    }
  });

  for (const [label, mutate] of [
    ['wrong source', (c: Case) => { c.sourceId = 'absent'; }],
    ['wrong evidence line', (c: Case) => { c.evidence[0].line = 5; }],
    ['unsupported quote', (c: Case) => { c.evidence[0].quote = 'Never stated'; }],
    ['invalid option key', (c: Case) => { c.expected = 'Z'; }],
  ] as const) test(`${label} rejects a reviewed case`, async () => {
    const { dir, cases, transport } = setup(); await compress(dir, transport);
    mutate(cases[0]); save(dir, 'cases.json', cases);
    expect(() => freeze(dir)).toThrow();
    expect(existsSync(join(dir, 'manifest.json'))).toBe(false);
  });

  test('a rewritten view cannot be legitimized by recomputing its own hash', async () => {
    const { dir, transport } = setup(); await compress(dir, transport);
    const views = read(dir, 'views.json'); views[0].memory += ' Added after compression.'; views[0].memoryHash = hash(views[0].memory);
    save(dir, 'views.json', views);
    expect(() => freeze(dir)).toThrow(/artifact drift/);
  });

  test('altered raw compression output or query-bearing request cannot freeze', async () => {
    for (const field of ['response', 'request']) {
      const { dir, transport } = setup(); await compress(dir, transport);
      const calls = rows(dir, 'compression.calls.jsonl');
      if (field === 'response') calls[0].response.choices[0].message.content = 'Rewritten output';
      else calls[0].request.messages[1].content += '\nFuture question added.';
      writeFileSync(join(dir, 'compression.calls.jsonl'), calls.map(c => JSON.stringify(c)).join('\n') + '\n');
      expect(() => freeze(dir)).toThrow(/artifact drift/);
    }
  });
});

describe('paired policies and fresh retrieval', () => {
  test('baseline differs only by completeness field, then assisted uses one reader per trial', async () => {
    const { dir, cases, sources, transport } = await prepared();
    let early = 0;
    await expect(run(dir, 'jev', async () => { early++; return selection('sufficient'); })).rejects.toThrow();
    expect(early).toBe(0);
    expect(await run(dir, 'baseline', transport)).toMatchObject({ completed: 54, requests: 66, errors: 0, infrastructureErrors: 0 });
    const baseline = rows(dir, 'baseline.jsonl'), calls = rows(dir, 'baseline.calls.jsonl');
    expect(baseline.every(r => r.correct && r.supportedProxy)).toBe(true);
    const perTrial = (id: string) => calls.filter(c => c.trial === id);
    for (const row of baseline) {
      const requests = perTrial(row.id), c = cases.find(c => c.id === row.caseId)!;
      expect(requests).toHaveLength(row.policy !== 'source' && c.sufficiency === 'expand' ? 2 : 1);
      for (const call of requests) {
        expect(call.kind).toBe('reader');
        expect(call.request.messages).toHaveLength(2);
        expect(call.request.messages.map((m: any) => m.role)).toEqual(['system', 'user']);
        assertNoGold(call.request, cases);
      }
      if (requests.length === 2) {
        const terminal = requests[1].request;
        expect(terminal.messages[0].content).toBe(TERMINAL);
        expect(JSON.parse(terminal.messages[1].content)).toEqual({ memory: sources.find(s => s.id === c.sourceId)!.source, question: c.question, options: c.options });
      }
      if (row.policy === 'absent') {
        const flagged = structuredClone(perTrial(`${row.caseId}-${row.repeat}-flagged`)[0].request);
        const input = JSON.parse(flagged.messages[1].content);
        expect(input.source_complete).toBe(false); delete input.source_complete;
        flagged.messages[1].content = JSON.stringify(input);
        expect(flagged).toEqual(requests[0].request);
        expect(requests[0].request.messages[0].content).toBe(ROUTE);
      }
    }
    expect(await run(dir, 'jev', transport)).toMatchObject({ completed: 18, requests: 36, errors: 0, infrastructureErrors: 0 });
    const assisted = rows(dir, 'jev.jsonl');
    expect(assisted.every(r => r.readerCalls === 1 && r.gateCalls === 1 && r.supportedProxy && r.gateCorrect)).toBe(true);
    expect(assisted.filter(r => r.expansion)).toHaveLength(6);
    for (const call of rows(dir, 'jev.calls.jsonl')) assertNoGold(call.request, cases);
    const summary = report(dir);
    expect(summary).toHaveLength(4);
    expect(summary.find(r => r.policy === 'absent')).toMatchObject({ trials: 18, readerCalls: 24, readerInput: 264, readerOutput: 72, expansions: 6, errors: 0 });
    expect(summary.find(r => r.policy === 'jev')).toMatchObject({ trials: 18, readerCalls: 18, gateCalls: 18, readerInput: 198, gateInput: 126, gateOutput: 36 });
  });

  test('gate sufficient is never overridden by a hidden reader retrieval', async () => {
    const { dir, transport } = await prepared(); await run(dir, 'baseline', transport);
    expect(await run(dir, 'jev', async (kind, body) => kind === 'gate' ? selection('sufficient') : transport(kind, body))).toMatchObject({ completed: 18, requests: 36, errors: 0 });
    const failed = rows(dir, 'jev.jsonl').filter(r => r.finalDecision.action === 'abstain');
    expect(failed).toHaveLength(6);
    expect(failed.every(r => !r.full && !r.expansion && !r.supportedProxy && r.readerCalls === 1 && r.gateCalls === 1)).toBe(true);
  });

  test('every permitted expansion reaches the exact budget; unknown always supplies source', async () => {
    const { dir, transport } = await prepared();
    const baseline = await run(dir, 'baseline', async (kind, body) => body.messages[0].content === ROUTE ? answer({ action: 'expand', reason: 'Conservative retrieval.' }) : transport(kind, body));
    expect(baseline).toMatchObject({ completed: 54, requests: 90, errors: 0 });
    const assisted = await run(dir, 'jev', async (kind, body) => kind === 'gate' ? selection('unknown') : transport(kind, body));
    expect(assisted).toMatchObject({ completed: 18, requests: 36, errors: 0 });
    expect(rows(dir, 'jev.jsonl').every(r => r.full && r.expansion && r.supportedProxy && r.gateDecision === 'unknown' && r.readerCalls === 1)).toBe(true);
    const actual = ['compression', 'baseline', 'jev'].reduce((sum, phase) => sum + rows(dir, `${phase}.calls.jsonl`).length, 0);
    expect(actual).toBe(129);
    expect(actual).toBe(read(dir, 'manifest.json').totalRequestCapIncludingCompression);
  });
});

describe('durable failures and costs', () => {
  for (const [label, bad] of [
    ['malformed JSON', () => reply('not JSON')],
    ['invalid option array', () => answer({ action: 'answer', choice: ['A'], evidence: 'A quote.' })],
    ['truncated response', () => ({ ...reply('{}'), choices: [{ finish_reason: 'length', message: { content: '{}' } }] })],
  ] as const) test(`${label} counts all model failures and does not prevent assisted comparison`, async () => {
    const { dir, transport } = await prepared();
    expect(await run(dir, 'baseline', async () => bad())).toMatchObject({ completed: 54, requests: 54, errors: 54, infrastructureErrors: 0 });
    expect(rows(dir, 'baseline.jsonl').every(r => r.failureKind === 'model-output' && !r.correct && !r.supportedProxy)).toBe(true);
    expect(await run(dir, 'jev', transport)).toMatchObject({ completed: 18, requests: 36, errors: 0 });
  });

  test('wrong reader model is infrastructure drift and blocks the next phase', async () => {
    const { dir } = await prepared();
    expect(await run(dir, 'baseline', async () => ({ ...reply('{}'), model: 'wrong-reader' }))).toMatchObject({ completed: 3, requests: 3, errors: 3, infrastructureErrors: 3 });
    expect(rows(dir, 'baseline.jsonl').every(r => r.failureKind === 'infrastructure' && r.error === 'Unexpected model')).toBe(true);
    let calls = 0;
    await expect(run(dir, 'jev', async () => { calls++; return selection('sufficient'); })).rejects.toThrow(/Baseline not complete/);
    expect(calls).toBe(0);
  });

  test('wrong selector version stops without sending any reader requests', async () => {
    const { dir, transport } = await prepared(); await run(dir, 'baseline', transport);
    expect(await run(dir, 'jev', async () => ({ ...selection('sufficient'), model: 'wrong-selector' }))).toMatchObject({ completed: 3, requests: 3, errors: 3, infrastructureErrors: 3 });
    expect(rows(dir, 'jev.jsonl').every(r => r.failureKind === 'infrastructure' && r.readerCalls === 0 && r.gateCalls === 1)).toBe(true);
  });

  test('three transport errors stop with missing usage and sanitized error text', async () => {
    const { dir } = await prepared();
    const sensitive = 'FABRICATED_PRIVATE_RESPONSE_CONTENT';
    expect(await run(dir, 'baseline', async () => { throw new Error(sensitive); })).toMatchObject({ completed: 3, requests: 3, errors: 3, infrastructureErrors: 3 });
    expect(rows(dir, 'baseline.jsonl').every(r => r.missingUsage && r.error === 'Request or processing failure')).toBe(true);
    for (const file of ['baseline.jsonl', 'baseline.calls.jsonl']) expect(readFileSync(join(dir, file), 'utf8')).not.toContain(sensitive);
  });

  test('missing usage preserves known partial totals and marks summaries incomplete', async () => {
    const { dir, transport } = await prepared();
    await run(dir, 'baseline', async (kind, body) => {
      const result: any = await transport(kind, body);
      if (body.messages[0].content === ROUTE) delete result.usage;
      return result;
    });
    const expanded = rows(dir, 'baseline.jsonl').filter(r => r.expansion);
    expect(expanded).toHaveLength(12);
    expect(expanded.every(r => r.readerCalls === 2 && r.readerInput === 11 && r.readerOutput === 3 && r.missingUsage)).toBe(true);
    expect(report(dir).filter(r => r.policy !== 'source').every(r => r.missingUsage)).toBe(true);
  });

  test('configured synthetic credentials are redacted from raw and parsed logs', async () => {
    const { dir, transport } = await prepared();
    const priorReader = process.env.LAB_READER_API_KEY, priorGate = process.env.TYPESAFE_API_KEY;
    const readerSecret = 'SYNTHETIC_READER_SECRET_12345', gateSecret = 'SYNTHETIC_GATE_SECRET_67890';
    process.env.LAB_READER_API_KEY = readerSecret; process.env.TYPESAFE_API_KEY = gateSecret;
    const reflected: Transport = async (kind, body) => {
      const result: any = await transport(kind, body);
      result.reflection = `${readerSecret} ${gateSecret}`;
      if (kind === 'reader') {
        const value = JSON.parse(result.choices[0].message.content); value.reflection = result.reflection;
        result.choices[0].message.content = JSON.stringify(value);
      }
      return result;
    };
    try {
      await run(dir, 'baseline', reflected); await run(dir, 'jev', reflected);
      for (const file of ['baseline.jsonl', 'baseline.calls.jsonl', 'jev.jsonl', 'jev.calls.jsonl']) {
        const text = readFileSync(join(dir, file), 'utf8');
        expect(text).not.toContain(readerSecret); expect(text).not.toContain(gateSecret);
        expect(text).toContain('[REDACTED]'); expect(rows(dir, file).length).toBeGreaterThan(0);
      }
    } finally {
      if (priorReader === undefined) delete process.env.LAB_READER_API_KEY; else process.env.LAB_READER_API_KEY = priorReader;
      if (priorGate === undefined) delete process.env.TYPESAFE_API_KEY; else process.env.TYPESAFE_API_KEY = priorGate;
    }
  });
});

describe('sealed artifacts and single attempts', () => {
  for (const file of ['sources.json', 'views.json', 'cases.json', 'trials.json', 'compression-manifest.json', 'compression.calls.jsonl', 'manifest.json']) {
    test(`changing ${file} blocks all transport`, async () => {
      const { dir } = await prepared();
      writeFileSync(join(dir, file), readFileSync(join(dir, file), 'utf8') + ' ');
      let calls = 0;
      await expect(run(dir, 'baseline', async () => { calls++; return answer({}); })).rejects.toThrow(/drift/);
      expect(calls).toBe(0); expect(existsSync(join(dir, 'baseline.jsonl'))).toBe(false);
    });
  }

  test('code verification rejects drift without editing shared runner code', async () => {
    const { dir } = await prepared();
    const manifest = read(dir, 'manifest.json'); manifest.codeHashes['real-session.ts'] = '0'.repeat(64);
    const text = JSON.stringify(manifest); writeFileSync(join(dir, 'manifest.json'), text);
    writeFileSync(join(dir, 'manifest.sha256'), hash(text));
    expect(() => verify(dir)).toThrow(/Code drift/);
  });

  test('failed compression cannot be retried and records its first attempt', async () => {
    const { dir, transport } = setup();
    await expect(compress(dir, async () => reply(''))).rejects.toThrow(/Compression failed/);
    expect(rows(dir, 'compression.calls.jsonl')).toHaveLength(1);
    expect(existsSync(join(dir, 'views.json'))).toBe(false);
    await expect(compress(dir, transport)).rejects.toThrow(/already attempted/);
  });

  test('compression, freeze, phase outputs and summary refuse overwrite', async () => {
    const { dir, transport } = await prepared();
    await expect(compress(dir, transport)).rejects.toThrow(/already attempted/);
    expect(() => freeze(dir)).toThrow();
    await run(dir, 'baseline', transport);
    const previous = readFileSync(join(dir, 'baseline.jsonl'), 'utf8');
    let calls = 0;
    await expect(run(dir, 'baseline', async () => { calls++; return answer({}); })).rejects.toThrow(/already attempted/);
    expect(calls).toBe(0); expect(readFileSync(join(dir, 'baseline.jsonl'), 'utf8')).toBe(previous);
    report(dir); const summary = readFileSync(join(dir, 'summary.json'), 'utf8');
    expect(() => report(dir)).toThrow(); expect(readFileSync(join(dir, 'summary.json'), 'utf8')).toBe(summary);
  });
});
