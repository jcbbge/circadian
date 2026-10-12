// The semantic experiment is frozen in 007. This runner repairs only serving grammar cost.
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode, readerPacket, structuredMemory, runtimeFixture, READER, verify as verifyParent } from '../extractor-007/runner';
import { complete, preflight, type Message, type Endpoint } from '../extractor-006/transport';
import { compareTransformations } from '../extractor-006/adapters_04_06';
import type { Candidate, Fixture } from '../extractor-006/contract';
import { servingSchema } from './serving-schema';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PARENT = resolve(ROOT, '../extractor-007/run-local');
const hash = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const save = (p: string, value: unknown) => writeFileSync(p, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });

export function prepare(dir: string) {
  verifyParent(PARENT);
  if (existsSync(dir)) throw new Error('Run already exists');
  const config = read(join(ROOT, 'local-config.json'));
  if (JSON.stringify(config) !== JSON.stringify(read(join(PARENT, 'config.json')))) throw new Error('Semantic experiment configuration drift');
  if (!['127.0.0.1', 'localhost'].includes(new URL(config.endpoint.url).hostname)) throw new Error('Local only');
  preflight(config.endpoint);
  const reviewed = readdirSync(ROOT).filter(n => /\.(ts|md)$/.test(n)).map(n => join(ROOT, n));
  reviewed.push(join(ROOT, 'local-config.json'), join(ROOT, 'ENDPOINT-EVIDENCE.json'));
  const review = read(join(ROOT, 'PRE-RUN-REVIEW.json'));
  if (!review.accepted) throw new Error('Independent review required');
  for (const f of reviewed) if (review.hashes[f] !== hash(f)) throw new Error(`Review drift: ${f}`);
  mkdirSync(dir, { recursive: true });
  const inputs = ['fixtures.json', 'jobs.json', 'config.json', 'pairs.json'];
  for (const name of inputs) writeFileSync(join(dir, name), readFileSync(join(PARENT, name)), { flag: 'wx', mode: 0o600 });
  save(join(dir, 'manifest.json'), { study: 'extractor-008', at: new Date().toISOString(), calls: 72,
    parentManifest: hash(join(PARENT, 'manifest.json')), reviewHash: hash(join(ROOT, 'PRE-RUN-REVIEW.json')),
    sourceHashes: Object.fromEntries(reviewed.map(p => [p, hash(p)])), inputs: Object.fromEntries(inputs.map(p => [p, hash(join(dir, p))])),
    servingChange: 'Omit maxLength only in server grammar; full local validation and semantic experiment unchanged.' });
  writeFileSync(join(dir, 'manifest.sha256'), hash(join(dir, 'manifest.json')) + '\n', { flag: 'wx' });
  return { calls: 72, bundles: 18 };
}

export function verify(dir: string) {
  verifyParent(PARENT);
  const m = read(join(dir, 'manifest.json'));
  if (hash(join(dir, 'manifest.json')) !== readFileSync(join(dir, 'manifest.sha256'), 'utf8').trim()) throw new Error('Manifest drift');
  if (hash(join(PARENT, 'manifest.json')) !== m.parentManifest || hash(join(ROOT, 'PRE-RUN-REVIEW.json')) !== m.reviewHash) throw new Error('Parent/review drift');
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
  const ask = async (messages: Message[], id: string, schema?: Record<string, unknown>) => {
    if (calls >= manifest.calls) throw new Error('Call ceiling exceeded');
    const endpoint: Endpoint = { ...config.endpoint, settings: { ...config.endpoint.settings,
      ...(schema ? { response_format: { type: 'json_schema', json_schema: { name: 'memory_annotation', strict: true, schema: servingSchema(schema) } } } : {}) } };
    preflight(endpoint);
    appendFileSync(join(dir, 'dispatch.jsonl'), JSON.stringify({ id, sequence: ++calls, at: new Date().toISOString(), endpoint: endpoint.url }) + '\n');
    const receipt = await complete(endpoint, messages, id);
    appendFileSync(join(dir, 'calls.jsonl'), JSON.stringify(receipt) + '\n');
    if (receipt.error) throw new Error(`${id}: ${receipt.error}`);
    return receipt.content!;
  };
  try {
    const fixtures: Fixture[] = read(join(dir, 'fixtures.json')), jobs = read(join(dir, 'jobs.json'));
    for (const f of fixtures) {
      const job = jobs.find((j: { id: string }) => j.id === f.id);
      const structured = await ask(job.structured.messages, `${f.id}/extract`, job.structured.schema);
      const plain = await ask(job.plain.messages, `${f.id}/plain`);
      let decoded: ReturnType<typeof decode> | null = null, decoderError: string | null = null;
      try { decoded = decode(f, structured); candidates.set(f.id, decoded.candidate); }
      catch (e) { decoderError = e instanceof Error ? e.message : 'Decode or mapping failure'; }
      const memory = decoded ? structuredMemory(decoded.candidate, decoded.operation, f.mechanism)
        : { status: 'extraction-unavailable', reason: 'The generated annotation failed validation. No source facts are supplied in this preparation.' };
      const answer = (prepared: unknown, form: string) => ask([{ role: 'system', content: READER },
        { role: 'user', content: JSON.stringify(readerPacket(f, prepared)) }], `${f.id}/read-${form}`);
      const answers = { structured: await answer(memory, 'structured'), plain: await answer({ prose: plain }, 'plain') };
      appendFileSync(join(dir, 'results.jsonl'), JSON.stringify({ id: f.id, cohort: job.cohort, mechanism: f.mechanism,
        structured, plain, decoderError, ...decoded, answers }) + '\n'); completedRows++;
      console.log(JSON.stringify({ id: f.id, cohort: job.cohort, calls, usable: !decoderError, checks: decoded?.checks.filter(c => c.pass).length,
        checksTotal: decoded?.checks.length, criticalFailures: decoded?.checks.filter(c => c.critical && !c.pass).length, error: decoderError }));
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
  else if (command === 'verify' && dir) { verify(resolve(dir)); console.log('Frozen run and inherited experiment verified'); }
  else if (command === 'run' && dir) console.log(await run(resolve(dir)));
  else throw new Error('Usage: runner.ts prepare DIR | verify DIR | run DIR');
}
