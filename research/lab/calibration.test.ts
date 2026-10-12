import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { READER_PROMPT, VARIANTS, parseReader, prepare, run, verify } from './calibration.ts';
import { READER_MODEL, type Transport } from './harness.ts';
import { COMPRESS } from './real-session.ts';

const temporary: string[] = [];
const read = (dir: string, file: string) => JSON.parse(readFileSync(join(dir, file), 'utf8'));
const save = (dir: string, file: string, data: unknown) => writeFileSync(join(dir, file), JSON.stringify(data));
const rows = (dir: string, file: string): any[] => readFileSync(join(dir, file), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
let fetchGuard: ReturnType<typeof spyOn>, consoleGuard: ReturnType<typeof spyOn>;
beforeEach(() => {
  fetchGuard = spyOn(globalThis, 'fetch').mockImplementation(async () => { throw new Error('Network forbidden in runner tests'); });
  consoleGuard = spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  const count = fetchGuard.mock.calls.length;
  fetchGuard.mockRestore(); consoleGuard.mockRestore();
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true });
  expect(count).toBe(0);
});
const response = (content: string, finish_reason = 'stop') => ({ model: READER_MODEL,
  choices: [{ finish_reason, message: { content } }], usage: { prompt_tokens: 11, completion_tokens: 3 } });
const answer = (refs = ['s1']) => ({ status: 'answer', claims: [{ text: 'Ada requested the blue notebook.', refs }], unknown: [] });
const abstain = () => ({ status: 'abstain', claims: [], unknown: ['The request is not established.'] });

// Entirely fabricated inputs. No native transcripts, paths, or prior trial outputs.
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'circadian-calibration-test-')); temporary.push(dir);
  const segment = { id: 's1', role: 'user', text: 'Ada requested the blue notebook.', origin: { nativeLine: 1, sourceHash: 'fictional-hash', modified: false, path: 'PRIVATE_PATH_SENTINEL' } };
  const f = { schema: 'calibration-004', provenance: { nativePath: 'PRIVATE_PATH_SENTINEL' },
    cases: Array.from({ length: 3 }, (_, i) => ({ id: `case-${i}`, sourceId: `fictional-${i}`, question: `What did the speaker request in account ${i}?`,
      variants: Object.fromEntries(VARIANTS.map(variant => [variant, {
        segments: variant === 'empty' ? [] : [{ ...segment,
          role: variant === 'attributed' ? 'assistant' : 'user',
          text: variant === 'removed' ? 'Ada arrived on Tuesday.' : segment.text }],
        rubric: { required: ['GOLD_SENTINEL'], forbidden: [], acceptableUnknown: [], supportingRefs: variant === 'empty' ? [] : ['s1'] },
        transformation: { description: 'TRANSFORMATION_SENTINEL', removedLines: [], edits: [] },
      }])), sampleAnswers: Array.from({ length: 3 }, (_, n) => ({ id: `sample-${n}`, response: answer(), reason: 'SAMPLE_SENTINEL' })) })),
    writerPair: { id: 'writer-pair', equivalence: 'EQUIVALENCE_SENTINEL', rubric: { required: ['WRITER_GOLD_SENTINEL'], forbidden: [] },
      variants: [{ id: 'writer-a', mode: 'imperative', segments: [{ ...segment, text: 'Please choose the blue notebook.' }] },
        { id: 'writer-b', mode: 'declarative', segments: [{ ...segment, text: 'I requested that you choose the blue notebook.' }] }] },
  };
  save(dir, 'fixtures.json', f); save(dir, 'fixture-contract.json', { schema: 'calibration-004' });
  save(dir, 'endpoint-evidence.json', { endpoint: 'http://127.0.0.1:10240/v1/models', models: [READER_MODEL] });
  return { dir, f };
}
const successful: Transport = async (kind, body) => {
  expect(kind).toBe('reader');
  if (body.messages[0].content === COMPRESS) return response('The speaker requested a blue notebook; completion is not established.');
  const input = JSON.parse(body.messages[1].content);
  return response(JSON.stringify(input.memory.length ? answer([input.memory[0].id]) : abstain()));
};
function prepared() { const fixture = setup(); prepare(fixture.dir); return fixture; }

test('freeze creates twelve shuffled readers followed by two writers with complete projections and no gold', async () => {
  const { dir, f } = setup();
  expect(prepare(dir)).toEqual({ readerTrials: 12, writerTrials: 2, maxCalls: 14 });
  const trials = read(dir, 'requests.json'), second = setup(); prepare(second.dir);
  expect(read(second.dir, 'requests.json')).toEqual(trials);
  expect(trials.slice(0, 12).every((t: any) => t.kind === 'reader')).toBe(true);
  expect(trials.slice(12).every((t: any) => t.kind === 'writer')).toBe(true);
  expect(trials.slice(0, 12).map((t: any) => t.id)).not.toEqual(f.cases.flatMap(c => VARIANTS.map(v => `${c.id}-${v}`)));
  for (const c of f.cases) expect(trials.filter((t: any) => t.caseId === c.id).map((t: any) => t.variant).sort()).toEqual([...VARIANTS].sort());
  for (const t of trials) {
    expect(t.request).toMatchObject({ model: READER_MODEL, temperature: 0.2, top_p: 1, stream: false, max_tokens: t.kind === 'reader' ? 640 : 1200 });
    expect(t.request.messages.map((m: any) => m.role)).toEqual(['system', 'user']);
    for (const hidden of ['GOLD_SENTINEL', 'PRIVATE_PATH_SENTINEL', 'TRANSFORMATION_SENTINEL', 'SAMPLE_SENTINEL', 'EQUIVALENCE_SENTINEL']) expect(JSON.stringify(t.request)).not.toContain(hidden);
    if (t.kind === 'reader') {
      expect(t.request.messages[0].content).toBe(READER_PROMPT);
      const input = JSON.parse(t.request.messages[1].content);
      expect(Object.keys(input).sort()).toEqual(['memory', 'question']);
      for (const s of input.memory) expect(Object.keys(s).sort()).toEqual(['id', 'role', 'text']);
    } else {
      expect(t.request.messages[0].content).toBe(COMPRESS);
      expect(t.request.messages[1].content).toStartWith('[s1 | user]\n');
      for (const c of f.cases) expect(t.request.messages[1].content).not.toContain(c.question);
    }
  }
  const done = await run(dir, successful);
  expect(done).toMatchObject({ completed: 14, expected: 14, calls: 14, infrastructureFailures: 0, modelOutputFailures: 0, stoppedEarly: false });
  expect(rows(dir, 'calls.jsonl').map(r => r.request)).toEqual(trials.map((t: any) => t.request));
  const results = rows(dir, 'results.jsonl');
  expect(results.slice(0, 12).every(r => r.schemaValid && r.refsResolved)).toBe(true);
  expect(results.slice(12).every(r => r.schemaValid === null && r.parsed === null && typeof r.text === 'string')).toBe(true);
  expect(results.every(r => r.usage.input === 11 && r.usage.output === 3 && !r.usage.missing)).toBe(true);
  for (const file of ['manifest.json', 'requests.json', 'calls.jsonl', 'results.jsonl', 'complete.json']) expect(statSync(join(dir, file)).mode & 0o777).toBe(0o600);
});

test('answer, partial and abstain schemas are distinct and extraneous fields do not pass', () => {
  const partial = { ...answer(), status: 'partial', unknown: ['The reason is not given.'] };
  for (const v of [answer(), partial, abstain()]) expect(parseReader(JSON.stringify(v))).toEqual(v);
  for (const v of [
    { ...answer(), unknown: ['Missing reason'] }, { ...partial, unknown: [] }, { ...abstain(), claims: answer().claims },
    { ...answer(), claims: [] }, { ...abstain(), unknown: [] }, answer([]), answer(['']),
    { ...answer(), confidence: 1 }, { ...answer(), claims: [{ ...answer().claims[0], unsupported: true }] },
    { ...answer(), claims: [{ text: '', refs: ['s1'] }] }, null, [],
  ]) expect(() => parseReader(JSON.stringify(v))).toThrow();
  expect(() => parseReader('```json\n' + JSON.stringify(answer()) + '\n```')).toThrow();
});

test('valid schema with nonexistent references remains distinct from invalid schema', async () => {
  const { dir } = prepared();
  await run(dir, async (_kind, body) => body.messages[0].content === COMPRESS ? response('Historical memory.') : response(JSON.stringify(answer(['s1', 'absent']))));
  const rr = rows(dir, 'results.jsonl').slice(0, 12);
  expect(rr.every(r => r.schemaValid && !r.refsResolved && r.status === 'ok' && r.refCount === 2)).toBe(true);
  expect(rr.filter(r => r.variant !== 'empty').every(r => r.resolvedRefCount === 1 && r.missingRefs.join() === 'absent')).toBe(true);
  expect(rr.filter(r => r.variant === 'empty').every(r => r.resolvedRefCount === 0 && r.missingRefs.length === 2)).toBe(true);
});

test('invalid outputs and truncated writer/reader outputs remain preserved without retries or early stop', async () => {
  const { dir } = prepared(); let n = 0;
  await run(dir, async (_kind, body) => {
    n++;
    if (n <= 4) return response('BROKEN_JSON');
    if (body.messages[0].content === COMPRESS) return response('Unfinished historical memory', 'length');
    return response(JSON.stringify(answer()), 'length');
  });
  expect(n).toBe(14);
  expect(read(dir, 'complete.json')).toMatchObject({ modelOutputFailures: 14, infrastructureFailures: 0, stoppedEarly: false });
  const rr = rows(dir, 'results.jsonl'), calls = rows(dir, 'calls.jsonl');
  expect(rr.slice(0, 4).every(r => !r.schemaValid && r.error === 'Invalid reader schema')).toBe(true);
  expect(calls.slice(0, 4).every(r => r.response.choices[0].message.content === 'BROKEN_JSON')).toBe(true);
  expect(rr.slice(4, 12).every(r => r.schemaValid && r.truncated && r.error === 'Incomplete output')).toBe(true);
  expect(rr.slice(12).every(r => r.text === 'Unfinished historical memory' && r.truncated)).toBe(true);
});

test('three consecutive wrong-model responses stop; invalid output resets the infrastructure sequence', async () => {
  const { dir } = prepared();
  await run(dir, async () => ({ ...response('{}'), model: 'unselected-model' }));
  expect(read(dir, 'complete.json')).toMatchObject({ completed: 3, calls: 3, infrastructureFailures: 3, stoppedEarly: true });
  expect(rows(dir, 'calls.jsonl')).toHaveLength(3);
  expect(rows(dir, 'results.jsonl').every(r => r.model === 'unselected-model')).toBe(true);
  const other = prepared(); let calls = 0;
  await run(other.dir, async (kind, body) => {
    calls++;
    if ([1, 2, 4, 5].includes(calls)) return { ...response('{}'), model: 'unselected-model' };
    if (calls === 3) return response('INVALID');
    return successful(kind, body);
  });
  expect(calls).toBe(14);
  expect(read(other.dir, 'complete.json')).toMatchObject({ infrastructureFailures: 4, modelOutputFailures: 1, stoppedEarly: false });
});

test('transport failures stop at three with sanitized errors and no response fabrication', async () => {
  const { dir } = prepared(); let n = 0;
  await run(dir, async () => { n++; throw new Error('Untrusted transport body: PRIVATE_FAILURE_SENTINEL'); });
  expect(n).toBe(3);
  expect(read(dir, 'complete.json')).toMatchObject({ completed: 3, infrastructureFailures: 3 });
  expect(rows(dir, 'calls.jsonl').every(r => r.error === 'Request failed' && !Object.hasOwn(r, 'response'))).toBe(true);
  for (const file of ['calls.jsonl', 'results.jsonl']) expect(readFileSync(join(dir, file), 'utf8')).not.toContain('PRIVATE_FAILURE_SENTINEL');
});

test('missing or partial usage is explicit and zero usage is accepted', async () => {
  const { dir } = prepared(); let n = 0;
  await run(dir, async (kind, body) => {
    const reply: any = await successful(kind, body); n++;
    if (n === 1) delete reply.usage;
    else if (n === 2) reply.usage = { prompt_tokens: 8 };
    else reply.usage = { prompt_tokens: 0, completion_tokens: 0 };
    return reply;
  });
  const rr = rows(dir, 'results.jsonl');
  expect(rr[0].usage).toEqual({ input: null, output: null, missing: true });
  expect(rr[1].usage).toEqual({ input: 8, output: null, missing: true });
  expect(rr.slice(2).every(r => r.usage.input === 0 && r.usage.output === 0 && !r.usage.missing)).toBe(true);
});

test('frozen fixtures, requests and endpoint metadata drift reject before calls', async () => {
  for (const file of ['fixtures.json', 'requests.json', 'endpoint-evidence.json', 'fixture-contract.json']) {
    const { dir } = prepared();
    const original = readFileSync(join(dir, file), 'utf8'); writeFileSync(join(dir, file), original + '\n');
    let calls = 0;
    await expect(run(dir, async () => { calls++; return response('{}'); })).rejects.toThrow('Input drift');
    expect(calls).toBe(0); expect(existsSync(join(dir, 'calls.jsonl'))).toBe(false);
  }
});

test('manifest and imported-code drift are checked without changing real source files', () => {
  const { dir } = prepared();
  const original = readFileSync(join(dir, 'manifest.json'), 'utf8');
  writeFileSync(join(dir, 'manifest.json'), original + '\n');
  expect(() => verify(dir)).toThrow('Manifest drift');
  const m = read(dir, 'manifest.json'); m.codeHashes['harness.ts'] = 'wrong-digest';
  const rewritten = JSON.stringify(m); writeFileSync(join(dir, 'manifest.json'), rewritten);
  writeFileSync(join(dir, 'manifest.sha256'), createHash('sha256').update(rewritten).digest('hex'));
  expect(() => verify(dir)).toThrow('Code drift');
});

test('prepared and attempted runs cannot be overwritten, including pre-existing empty logs', async () => {
  const { dir } = prepared();
  expect(() => prepare(dir)).toThrow('Preparation already attempted');
  await run(dir, successful);
  await expect(run(dir, successful)).rejects.toThrow('Run already attempted');
  const other = prepared(); writeFileSync(join(other.dir, 'calls.jsonl'), '');
  await expect(run(other.dir, successful)).rejects.toThrow('Run already attempted');
});

test('bad fixture references, duplicate segment IDs and absent selected model reject preparation', () => {
  for (const mutation of [
    (f: any) => { f.cases[0].variants.complete.rubric.supportingRefs = ['absent']; },
    (f: any) => { f.cases[0].variants.complete.segments.push(f.cases[0].variants.complete.segments[0]); },
    (f: any) => { f.cases[0].variants.empty.segments = f.cases[0].variants.complete.segments; },
    (f: any) => { f.writerPair.variants[1].mode = 'imperative'; },
  ]) {
    const { dir, f } = setup(); mutation(f); save(dir, 'fixtures.json', f);
    expect(() => prepare(dir)).toThrow(); expect(existsSync(join(dir, 'manifest.json'))).toBe(false);
  }
  const { dir } = setup(); save(dir, 'endpoint-evidence.json', { models: ['other-model'] });
  expect(() => prepare(dir)).toThrow('Selected model absent');
});

test('configured credentials reflected by a model are redacted in raw and parsed logs', async () => {
  const old = { reader: process.env.LAB_READER_API_KEY, gate: process.env.TYPESAFE_API_KEY };
  const secrets = ['synthetic-reader-key-004', 'synthetic-selector-key-004'];
  process.env.LAB_READER_API_KEY = secrets[0]; process.env.TYPESAFE_API_KEY = secrets[1];
  try {
    const { dir } = prepared();
    await run(dir, async (_kind, body) => body.messages[0].content === COMPRESS ? response(secrets.join(' '))
      : response(JSON.stringify({ ...answer(), claims: [{ text: secrets.join(' '), refs: ['s1'] }] })));
    for (const file of ['calls.jsonl', 'results.jsonl']) {
      const text = readFileSync(join(dir, file), 'utf8');
      for (const secret of secrets) expect(text).not.toContain(secret);
      expect(text).toContain('[REDACTED]');
    }
  } finally {
    if (old.reader === undefined) delete process.env.LAB_READER_API_KEY; else process.env.LAB_READER_API_KEY = old.reader;
    if (old.gate === undefined) delete process.env.TYPESAFE_API_KEY; else process.env.TYPESAFE_API_KEY = old.gate;
  }
});
