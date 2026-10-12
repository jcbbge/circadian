// Diagnostic serving ablation: same exposed sources and strict consumers, no native grammar.
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verify as verifyParent } from '../extractor-008/runner';
import { decode, readerPacket, structuredMemory, runtimeFixture, READER } from '../extractor-007/runner';
import { complete, preflight, type Message } from '../extractor-006/transport';
import { compareTransformations } from '../extractor-006/adapters_04_06';
import type { Candidate, Fixture } from '../extractor-006/contract';

const ROOT = dirname(fileURLToPath(import.meta.url)), PARENT = resolve(ROOT, '../extractor-008/run-local');
const hash = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const save = (p: string, value: unknown) => writeFileSync(p, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
const files = ['runner.ts', 'PROTOCOL.md'].map(p => join(ROOT, p));

export function prepare(dir: string) {
  verifyParent(PARENT);
  if (existsSync(dir)) throw new Error('Run already exists');
  const review = read(join(ROOT, 'PRE-RUN-REVIEW.json'));
  if (!review.accepted || files.some(p => review.hashes[p] !== hash(p))) throw new Error('Independent review missing or stale');
  const config = read(join(PARENT, 'config.json'));
  if (!['127.0.0.1', 'localhost'].includes(new URL(config.endpoint.url).hostname)) throw new Error('Local only');
  preflight(config.endpoint);
  if (Object.hasOwn(config.endpoint.settings, 'response_format')) throw new Error('Native grammar forbidden in this ablation');
  const jobs = read(join(PARENT, 'jobs.json')).map((job: any) => {
    const messages: Message[] = structuredClone(job.structured.messages);
    const clause = 'The server constrains its syntax; you remain responsible for the meaning.';
    if (!messages[0]!.content.endsWith(clause)) throw new Error('Unexpected parent instruction');
    messages[0]!.content = messages[0]!.content.slice(0, -clause.length) + 'You remain responsible for the meaning.';
    return { id: job.id, previousCohort: job.cohort, messages };
  });
  if (jobs.length !== 18) throw new Error('Expected 18 exposed cases');
  mkdirSync(dir, { recursive: true });
  for (const p of ['fixtures.json', 'config.json', 'pairs.json']) writeFileSync(join(dir, p), readFileSync(join(PARENT, p)), { flag: 'wx', mode: 0o600 });
  save(join(dir, 'jobs.json'), jobs);
  save(join(dir, 'manifest.json'), { study: 'extractor-009-serving-ablation', at: new Date().toISOString(), calls: 36,
    cohort: 'exposed-development', parentManifest: hash(join(PARENT, 'manifest.json')),
    historicalComparator: hash(join(PARENT, 'calls.jsonl')), reviewHash: hash(join(ROOT, 'PRE-RUN-REVIEW.json')),
    sourceHashes: Object.fromEntries(files.map(p => [p, hash(p)])),
    inputs: Object.fromEntries(['fixtures.json', 'config.json', 'pairs.json', 'jobs.json'].map(p => [p, hash(join(dir, p))])) });
  writeFileSync(join(dir, 'manifest.sha256'), hash(join(dir, 'manifest.json')) + '\n', { flag: 'wx' });
  return { calls: 36, bundles: 18 };
}

export function verify(dir: string) {
  verifyParent(PARENT);
  const m = read(join(dir, 'manifest.json'));
  if (hash(join(dir, 'manifest.json')) !== readFileSync(join(dir, 'manifest.sha256'), 'utf8').trim()) throw new Error('Manifest drift');
  if (hash(join(PARENT, 'manifest.json')) !== m.parentManifest || hash(join(PARENT, 'calls.jsonl')) !== m.historicalComparator || hash(join(ROOT, 'PRE-RUN-REVIEW.json')) !== m.reviewHash) throw new Error('Parent/review drift');
  for (const [p, h] of Object.entries(m.sourceHashes)) if (hash(p) !== h) throw new Error(`Source drift: ${p}`);
  for (const [p, h] of Object.entries(m.inputs)) if (hash(join(dir, p)) !== h) throw new Error(`Input drift: ${p}`);
  return m;
}

export async function run(dir: string) {
  const manifest = verify(dir), config = read(join(dir, 'config.json'));
  preflight(config.endpoint);
  save(join(dir, 'started.json'), { at: new Date().toISOString(), maxCalls: manifest.calls });
  let calls = 0, completedRows = 0;
  const candidates = new Map<string, Candidate>();
  const ask = async (messages: Message[], id: string) => {
    if (calls >= manifest.calls) throw new Error('Call ceiling exceeded');
    appendFileSync(join(dir, 'dispatch.jsonl'), JSON.stringify({ id, sequence: ++calls, at: new Date().toISOString(), endpoint: config.endpoint.url }) + '\n');
    const receipt = await complete(config.endpoint, messages, id);
    appendFileSync(join(dir, 'calls.jsonl'), JSON.stringify(receipt) + '\n');
    if (receipt.error) throw new Error(`${id}: ${receipt.error}`);
    return receipt.content!;
  };
  try {
    const fixtures: Fixture[] = read(join(dir, 'fixtures.json')), jobs = read(join(dir, 'jobs.json'));
    for (const f of fixtures) {
      const job = jobs.find((j: { id: string }) => j.id === f.id);
      const structured = await ask(job.messages, `${f.id}/extract`);
      let decoded: ReturnType<typeof decode> | null = null, decoderError: string | null = null;
      try { decoded = decode(f, structured); candidates.set(f.id, decoded.candidate); }
      catch (e) { decoderError = e instanceof Error ? e.message : 'Decode or mapping failure'; }
      const memory = decoded ? structuredMemory(decoded.candidate, decoded.operation, f.mechanism)
        : { status: 'extraction-unavailable', reason: 'The generated annotation failed validation. No source facts are supplied in this preparation.' };
      const answer = await ask([{ role: 'system', content: READER }, { role: 'user', content: JSON.stringify(readerPacket(f, memory)) }], `${f.id}/read-structured`);
      appendFileSync(join(dir, 'results.jsonl'), JSON.stringify({ id: f.id, cohort: 'exposed-development', previousCohort: job.previousCohort,
        mechanism: f.mechanism, structured, decoderError, ...decoded, answer }) + '\n'); completedRows++;
      console.log(JSON.stringify({ id: f.id, calls, usable: !decoderError, criticalFailures: decoded?.checks.filter(c => c.critical && !c.pass).length, error: decoderError }));
    }
    save(join(dir, 'transformations.json'), read(join(dir, 'pairs.json')).map((pair: { oldId: string; candidateId: string; expected: string }) => {
      const old = fixtures.find(f => f.id === pair.oldId)!, next = fixtures.find(f => f.id === pair.candidateId)!;
      const a = candidates.get(old.id), b = candidates.get(next.id);
      return { ...pair, report: a && b ? compareTransformations(a, runtimeFixture(old), b, runtimeFixture(next)) : { status: 'unavailable' } };
    }));
    save(join(dir, 'complete.json'), { at: new Date().toISOString(), calls, completedRows, semanticReview: 'pending' });
    return { calls, completedRows };
  } catch (e) {
    save(join(dir, 'stopped.json'), { at: new Date().toISOString(), calls, completedRows, error: e instanceof Error ? e.message : 'Stopped' });
    throw e;
  }
}

if (import.meta.main) {
  const [command, dir] = process.argv.slice(2);
  if (command === 'prepare' && dir) console.log(prepare(resolve(dir)));
  else if (command === 'verify' && dir) { verify(resolve(dir)); console.log('Frozen serving ablation verified'); }
  else if (command === 'run' && dir) console.log(await run(resolve(dir)));
  else throw new Error('Usage: runner.ts prepare DIR | verify DIR | run DIR');
}
