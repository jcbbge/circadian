import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  executeRound, GATE, JEV_MODEL, parseGate, parseReader, prepareRun,
  READER_MODEL, summarize, SYSTEM,
  type Fixture, type Transport,
} from './harness.ts';

// These cases test the runner, not the pending authored research benchmark.
function fixtureRows(): Fixture[] {
  return Array.from({ length: 6 }, (_, pair) => ['a', 'b'].map(variant => {
    const id = `fixture-${pair}-${variant}`;
    const kind = pair < 3 ? 'stability' : 'sensitivity';
    return {
      id, pair: `pair-${pair}`, domain: `fictional-domain-${pair}`, kind,
      variant: variant as 'a' | 'b',
      source: `Original account ${id}: a remembered detail with its explicit qualification.`,
      plain: `Plain view ${id}: a compact account.`,
      preserved: `Preserved view ${id}: a qualified compact account.`,
      question: `What is supported in ${id}?`,
      options: { A: 'First possibility', B: 'Second possibility', C: 'Third possibility', D: 'Not established' },
      expected: kind === 'sensitivity' && variant === 'b' ? 'B' : 'A',
      rationale: `PRIVATE_GOLD_RATIONALE_${id}`,
      sufficiency: 'expand' as const,
    };
  })).flat();
}

function answer(content = JSON.stringify({ action: 'answer', choice: 'A', explanation: 'Fixture evidence only.' })) {
  return {
    model: READER_MODEL,
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 10, completion_tokens: 3 },
  };
}

function gate(choice: 'sufficient' | 'expand' | 'unknown' = 'sufficient') {
  return {
    model: JEV_MODEL,
    answers: { sufficiency: {
      type: 'choice', choice, confidence: 1,
      probabilities: { sufficient: +(choice === 'sufficient'), expand: +(choice === 'expand'), unknown: +(choice === 'unknown') },
    } },
    usage: { input_tokens: 7, output_tokens: 2 },
  };
}

const directories: string[] = [];
let networkGuard: ReturnType<typeof spyOn>;
let consoleGuard: ReturnType<typeof spyOn>;

beforeEach(() => {
  networkGuard = spyOn(globalThis, 'fetch').mockImplementation(async () => {
    throw new Error('Network forbidden in inference-free runner tests');
  });
  consoleGuard = spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  const networkCalls = networkGuard.mock.calls.length;
  networkGuard.mockRestore();
  consoleGuard.mockRestore();
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
  expect(networkCalls).toBe(0);
});

function prepare(fixtures = fixtureRows()) {
  const root = mkdtempSync(join(tmpdir(), 'circadian-harness-test-'));
  directories.push(root);
  const file = join(root, 'fixtures.json');
  writeFileSync(file, JSON.stringify(fixtures));
  const dir = join(root, 'run');
  prepareRun(dir, file);
  return { dir, file, fixtures };
}

function rows(dir: string, name: string): any[] {
  return readFileSync(join(dir, name), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
}

const answerOnly: Transport = async kind => {
  if (kind !== 'reader') throw new Error('Unexpected auxiliary model call');
  return answer();
};

function assertNoGold(value: unknown) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    expect(['expected', 'rationale', 'armSufficiency', 'gateCorrect', 'correct']).not.toContain(key);
    assertNoGold(child);
  }
}

describe('run preparation and immutability', () => {
  test('preparation freezes its own synthetic inputs and does not overwrite an existing run', () => {
    const { dir, file, fixtures } = prepare();
    const bundleText = readFileSync(join(dir, 'bundles.json'), 'utf8');
    const bundles = JSON.parse(bundleText);
    expect(bundles).toHaveLength(72);
    expect(new Set(bundles.map((b: any) => b.id)).size).toBe(72);
    const frozenGold = JSON.parse(readFileSync(join(dir, 'gold.json'), 'utf8'));
    expect(frozenGold).toHaveLength(fixtures.length);
    for (const fixture of fixtures) expect(frozenGold.find((f: Fixture) => f.id === fixture.id)).toMatchObject(fixture);
    assertNoGold(bundles);
    expect(() => prepareRun(dir, file)).toThrow(/already exists/);
    expect(readFileSync(join(dir, 'bundles.json'), 'utf8')).toBe(bundleText);
  });

  for (const file of ['bundles.json', 'gold.json', 'manifest.json']) {
    test(`changing frozen ${file} fails before any request or result is written`, async () => {
      const { dir } = prepare();
      writeFileSync(join(dir, file), readFileSync(join(dir, file), 'utf8') + ' ');
      let calls = 0;
      await expect(executeRound(dir, 'baseline', async () => { calls++; return answer(); })).rejects.toThrow();
      expect(calls).toBe(0);
      expect(existsSync(join(dir, 'baseline.jsonl'))).toBe(false);
    });
  }

  test('changed model settings in the manifest cannot silently become a new protocol', async () => {
    const { dir } = prepare();
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
    manifest.reader.model = 'an-unreviewed-model';
    manifest.reader.temperature = 1.9;
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
    let calls = 0;
    await expect(executeRound(dir, 'baseline', async () => { calls++; return answer(); })).rejects.toThrow();
    expect(calls).toBe(0);
  });

  test('a source omitted by current recall cannot be presented as complete', () => {
    const fixtures = fixtureRows();
    fixtures[0].source = 'Long original account. '.repeat(1200);
    expect(() => prepare(fixtures)).toThrow(/source|complete|recall|budget/i);
  });
});

describe('transport isolation and expansion protocol', () => {
  test('baseline makes only reader calls and transports no answer gold or rationale', async () => {
    const { dir, fixtures } = prepare();
    const seen: any[] = [];
    const result = await executeRound(dir, 'baseline', async (kind, body) => {
      expect(kind).toBe('reader');
      seen.push(body);
      return answer();
    });
    expect(result).toMatchObject({ completed: 72, errors: 0, requests: 72 });
    expect(seen).toHaveLength(72);
    for (const request of seen) {
      expect(request.model).toBe(READER_MODEL);
      expect(request.messages[0]).toEqual({ role: 'system', content: SYSTEM });
      const input = JSON.parse(request.messages[1].content);
      expect(Object.keys(input).sort()).toEqual(['memory', 'options', 'question', 'source_complete']);
      assertNoGold(input);
      for (const fixture of fixtures) expect(JSON.stringify(request)).not.toContain(fixture.rationale);
    }
    const original = readFileSync(join(dir, 'baseline.jsonl'), 'utf8');
    let extraCalls = 0;
    await expect(executeRound(dir, 'baseline', async () => { extraCalls++; return answer(); })).rejects.toThrow();
    expect(extraCalls).toBe(0);
    expect(readFileSync(join(dir, 'baseline.jsonl'), 'utf8')).toBe(original);
  });

  test('reader and gate expansion deliver equivalent full evidence with bounded requests', async () => {
    const { dir, fixtures } = prepare();
    const baseline = await executeRound(dir, 'baseline', async (kind, body) => {
      expect(kind).toBe('reader');
      const input = JSON.parse(body.messages[1].content);
      return input.source_complete ? answer() : answer('{"action":"expand"}');
    });
    expect(baseline).toMatchObject({ completed: 72, errors: 0, requests: 120 });
    expect(rows(dir, 'baseline.jsonl').filter(r => r.expansion === 'reader')).toHaveLength(48);
    const assisted = await executeRound(dir, 'jev', async (kind, body) => {
      assertNoGold(body);
      for (const fixture of fixtures) expect(JSON.stringify(body)).not.toContain(fixture.rationale);
      if (kind === 'gate') {
        expect(body.questions).toEqual({ sufficiency: GATE });
        expect(Object.keys(body.state).sort()).toEqual(['memory_view', 'options', 'original_source', 'question']);
        return gate(body.state.memory_view.startsWith('Plain') ? 'expand' : body.state.memory_view.startsWith('Preserved') ? 'unknown' : 'sufficient');
      }
      expect(JSON.parse(body.messages[1].content).source_complete).toBe(true);
      return answer();
    });
    expect(assisted).toMatchObject({ completed: 72, errors: 0, requests: 144 });
    expect(rows(dir, 'jev.jsonl').filter(r => r.expansion === 'gate')).toHaveLength(48);
    const finalBaseline = new Map(rows(dir, 'baseline.calls.jsonl').map(r => [r.trial, r.request]));
    for (const call of rows(dir, 'jev.calls.jsonl').filter(r => r.kind === 'reader')) {
      expect(call.request).toEqual(finalBaseline.get(call.trial));
    }
    const summary = summarize(dir);
    expect(summary).toHaveLength(6);
    for (const group of summary) expect(group).toMatchObject({ trials: 24, errors: 0, missingUsage: false });
    expect(summary.find(g => g.group === 'baseline/plain')).toMatchObject({ expansions: 24, readerInput: 480, readerOutput: 144, gateInput: 0 });
    expect(summary.find(g => g.group === 'jev/plain')).toMatchObject({ expansions: 24, readerInput: 240, readerOutput: 72, gateInput: 168 });
  });

  test('repeated expansion terminates each trial and trips the failure limit', async () => {
    const { dir } = prepare();
    const firstTrials = JSON.parse(readFileSync(join(dir, 'bundles.json'), 'utf8')).slice(0, 3);
    const expectedRequests = firstTrials.reduce((sum: number, b: { arm: string }) => sum + (b.arm === 'current' ? 1 : 2), 0);
    const result = await executeRound(dir, 'baseline', async () => answer('{"action":"expand"}'));
    expect(result).toMatchObject({ completed: 3, requests: expectedRequests, errors: 3 });
    const failures = rows(dir, 'baseline.jsonl');
    for (const failure of failures) expect(failure.error).toBe(failure.arm === 'current' ? 'Reader requested expansion of complete source' : 'Reader failed after expansion');
    for (const trial of failures) expect(rows(dir, 'baseline.calls.jsonl').filter(r => r.trial === trial.id).length).toBeLessThanOrEqual(2);
  });

  test('the assisted round requires a completed baseline without protocol failures', async () => {
    const { dir } = prepare();
    let calls = 0;
    const transport: Transport = async kind => { calls++; return kind === 'gate' ? gate() : answer(); };
    await expect(executeRound(dir, 'jev', transport)).rejects.toThrow();
    expect(calls).toBe(0);
    expect(existsSync(join(dir, 'jev.jsonl'))).toBe(false);
    await executeRound(dir, 'baseline', async () => ({ ...answer(), model: 'wrong-reader' }));
    await expect(executeRound(dir, 'jev', transport)).rejects.toThrow(/Baseline/);
    expect(calls).toBe(0);
    expect(existsSync(join(dir, 'jev.jsonl'))).toBe(false);
  });
});

describe('response validation', () => {
  test('reader parser accepts supported answers and rejects malformed decisions', () => {
    const options = fixtureRows()[0].options;
    expect(parseReader('```json\n{"action":"answer","choice":"B","explanation":"Evidence."}\n```', options)).toMatchObject({ action: 'answer', choice: 'B' });
    expect(parseReader('{"action":"expand"}', options)).toEqual({ action: 'expand' });
    for (const content of ['not JSON', 'null', '[]', '{"action":"answer","choice":"Z","explanation":"No."}', '{"action":"answer","choice":"A"}']) {
      expect(() => parseReader(content, options)).toThrow();
    }
  });

  test('gate parser rejects model drift, invalid JSON-shaped data, and malformed probabilities', () => {
    expect(parseGate(gate('unknown'))).toBe('unknown');
    const invalid: any[] = [null, {}, { ...gate(), model: 'different-jev-version' }];
    for (const probabilities of [
      { sufficient: 0.4, expand: 0.3, unknown: 0.3, extra: 'not-a-number' },
      { sufficient: 0.4, expand: 0.3, unknown: 0.2, extra: 0.1 },
      { sufficient: NaN, expand: 0, unknown: 1 },
      { sufficient: -0.1, expand: 0.1, unknown: 1 },
      { sufficient: 0.1, expand: 0.1, unknown: 0.1 },
      { sufficient: 1, expand: 0 },
    ]) {
      const response: any = gate();
      response.answers.sufficiency.probabilities = probabilities;
      invalid.push(response);
    }
    const invalidConfidence = gate();
    invalidConfidence.answers.sufficiency.confidence = Infinity;
    invalid.push(invalidConfidence);
    for (const response of invalid) expect(() => parseGate(response)).toThrow();
  });

  for (const [label, response, error] of [
    ['model mismatch', { ...answer(), model: 'different-reader' }, 'Unexpected reader model'],
    ['malformed JSON', answer('not JSON'), 'Malformed JSON'],
    ['missing content', { model: READER_MODEL, choices: [] }, 'Missing reader content'],
  ] as const) {
    test(`reader ${label} is durably recorded and stops after three consecutive failures`, async () => {
      const { dir } = prepare();
      const result = await executeRound(dir, 'baseline', async () => response);
      expect(result).toMatchObject({ completed: 3, requests: 3, errors: 3 });
      expect(rows(dir, 'baseline.jsonl').map(r => r.error)).toEqual([error, error, error]);
      expect(rows(dir, 'baseline.jsonl').every(r => r.status === 'error' && r.correct === false)).toBe(true);
    });
  }

  test('transport failure marks usage incomplete without discarding measured expansion costs', async () => {
    const { dir } = prepare();
    const result = await executeRound(dir, 'baseline', async (kind, body) => {
      expect(kind).toBe('reader');
      if (JSON.parse(body.messages[1].content).source_complete) throw new Error('HTTP 503');
      return answer('{"action":"expand"}');
    });
    expect(result).toMatchObject({ completed: 3, errors: 3 });
    for (const failure of rows(dir, 'baseline.jsonl')) {
      expect(failure).toMatchObject({ status: 'error', error: 'HTTP 503', correct: false });
      expect(failure.usage).toMatchObject({ missing: true,
        readerInput: failure.arm === 'current' ? 0 : 10,
        readerOutput: failure.arm === 'current' ? 0 : 3,
      });
    }
    expect(summarize(dir).every(group => group.missingUsage)).toBe(true);
  });

  test('a gate version mismatch fails before a reader request', async () => {
    const { dir } = prepare();
    await executeRound(dir, 'baseline', answerOnly);
    const kinds: string[] = [];
    const result = await executeRound(dir, 'jev', async kind => {
      kinds.push(kind);
      return { ...gate(), model: 'different-jev-version' };
    });
    expect(result).toMatchObject({ completed: 3, requests: 3, errors: 3 });
    expect(kinds).toEqual(['gate', 'gate', 'gate']);
    expect(rows(dir, 'jev.jsonl').map(r => r.error)).toEqual(Array(3).fill('Unexpected decision-model version'));
  });
});
