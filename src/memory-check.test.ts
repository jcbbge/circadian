import { expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { atomId, serializeAtom } from './atoms.ts';
import { memoryView, type MemoryView } from './views.ts';
import { memoryCheck } from './memory-check.ts';

function fixture(run: (f: ReturnType<typeof setup>) => void) {
  const f = setup(); try { run(f); } finally { fs.rmSync(f.home, { recursive: true, force: true }); }
}
function setup() {
  const home = fs.mkdtempSync(path.join(tmpdir(), 'circadian-check-')), mind = path.join(home, 'mind');
  fs.mkdirSync(path.join(mind, 'episodes'), { recursive: true }); fs.mkdirSync(path.join(mind, 'beliefs'));
  const source = '2026-10-13-memory.md', content = '# Maintenance note\nA😀B might prefer tea over coffee.\nThe note was written in the hall.\n';
  fs.writeFileSync(path.join(mind, 'episodes', source), content);
  const id = atomId('Remember a conditional preference');
  fs.writeFileSync(path.join(mind, 'beliefs', `${id}.md`), serializeAtom({ kind: 'doctrine', claim: 'Remember a conditional preference',
    why: 'Keep context', quotes: [{ text: 'might prefer', source }], eps: ['2026-10-13'], scope: 'global' }));
  const event = (value: object) => fs.appendFileSync(path.join(mind, 'beliefs.jsonl'), JSON.stringify({ ...value, ts: '2026-10-13' }) + '\n');
  event({ ev: 'stack', atom: id });
  const args = (phrase = 'might prefer') => {
    const record = (memoryView(mind, 'global') as MemoryView).records[0], observed = record.sources[0];
    return { refs: [record.ref], selections: [{ atomId: id, source, sourceRevision: observed.status === 'available' ? observed.revision : '0'.repeat(64),
      start: content.indexOf(phrase), end: content.indexOf(phrase) + phrase.length }] };
  };
  return { home, mind, source, content, id, event, args };
}
const check = (mind: string, args: unknown) => memoryCheck(mind, args) as any;

test('real source spans produce exact quotes with labels and no write or semantic approval', () => fixture(f => {
  const before = fs.readFileSync(path.join(f.mind, 'beliefs.jsonl'), 'utf8');
  const result = check(f.mind, { ...f.args(), claims: [
    { relation: 'recording-location', subject: 'note', value: 'hall', selection: 0 },
    { relation: 'event-location', subject: 'occasion', value: 'hall', selection: 0 },
    { relation: 'participation', subject: 'author', value: 'present', selection: 0 },
  ] });
  expect(result.kind).toBe('check'); expect(result.complete).toBe(true);
  expect(result.selections[0]).toMatchObject({ quote: 'might prefer', status: 'source-current-exact', label: 'Maintenance note', labelKind: 'document-title', semantic: 'UNKNOWN' });
  expect(result.claims.map((c: any) => c.relation)).toEqual(['recording-location', 'event-location', 'participation']);
  expect(result.claims.every((c: any) => c.status === 'candidate' && c.semantic === 'UNKNOWN')).toBe(true);
  expect(fs.readFileSync(path.join(f.mind, 'beliefs.jsonl'), 'utf8')).toBe(before);
}));

test('filename remains readable when document has no heading', () => fixture(f => {
  fs.writeFileSync(path.join(f.mind, 'episodes', f.source), f.content.replace('# Maintenance note', 'Maintenance note'));
  const args = f.args(); args.selections[0].start -= 2; args.selections[0].end -= 2;
  expect(check(f.mind, args).selections[0]).toMatchObject({ label: f.source, labelKind: 'filename', quote: 'might prefer' });
}));

test('current eligibility and both atom/source revisions are rechecked', () => fixture(f => {
  const original = f.args();
  fs.appendFileSync(path.join(f.mind, 'episodes', f.source), 'New evidence.');
  expect(check(f.mind, original)).toMatchObject({ complete: false, selections: [{ status: 'changed-revision' }] });
  const fresh = f.args(); fresh.selections[0].sourceRevision = original.selections[0].sourceRevision;
  expect(check(f.mind, fresh)).toMatchObject({ complete: false, selections: [{ status: 'source-changed-revision' }] });
  const eligible = f.args(); f.event({ ev: 'forget', atom: f.id, reason: 'correction' });
  expect(check(f.mind, eligible)).toMatchObject({ complete: false, selections: [{ status: 'ineligible' }] });
}));

test('missing atom or source remains unavailable, never a false absence conclusion', () => fixture(f => {
  fs.unlinkSync(path.join(f.mind, 'episodes', f.source));
  const missingSource = f.args();
  expect(check(f.mind, missingSource)).toMatchObject({ complete: false, selections: [{ status: 'source-unavailable' }] });
  fs.unlinkSync(path.join(f.mind, 'beliefs', `${f.id}.md`));
  expect(check(f.mind, missingSource)).toMatchObject({ complete: false, selections: [{ status: 'unavailable' }] });
}));

test('rejects malformed refs, unbound selections, paths and span bounds', () => fixture(f => {
  for (const change of [ { refs: [] }, { refs: [{ id: f.id, revision: 'bad' }] }, { refs: [...f.args().refs, ...f.args().refs] },
    { selections: [{ ...f.args().selections[0], atomId: '0'.repeat(12) }] },
    { selections: [{ ...f.args().selections[0], source: '../secret.md' }] },
    { selections: [{ ...f.args().selections[0], start: 0, end: 0 }] },
    { selections: [{ ...f.args().selections[0], start: -1 }] },
    { selections: [{ ...f.args().selections[0], end: 200 }] },
    { selections: [{ ...f.args().selections[0], start: 0.5 }] },
    { selections: [{ ...f.args().selections[0], value: 'ForFor' }] }, { chars: 128001 }, { invented: true } ]) {
    expect(check(f.mind, { ...f.args(), ...change }).kind).toBe('invalid-input');
  }
}));

test('UTF16 selections copy complete characters; split surrogate pairs reject', () => fixture(f => {
  const args = f.args('😀'); expect(check(f.mind, args).selections[0].quote).toBe('😀');
  args.selections[0].end--; expect(check(f.mind, args).kind).toBe('invalid-input');
}));

test('field comparisons check exact bytes and preserve absent/unknown without certifying meaning', () => fixture(f => {
  const args = f.args(), field = { state: 'known', selection: 0 };
  const result = check(f.mind, { ...args, comparison: { kind: 'fields',
    left: { strength: field, missing: { state: 'absent' }, uncertain: { state: 'unknown' } },
    right: { strength: field, missing: field, uncertain: { state: 'absent' } } } });
  expect(result.comparison.fields).toEqual([{ name: 'strength', status: 'match' }, { name: 'missing', status: 'different' }, { name: 'uncertain', status: 'unknown' }]);
  expect(result.comparison.semantic).toBe('UNKNOWN');
  expect(check(f.mind, { ...args, comparison: { kind: 'fields', left: { strength: { state: 'known', selection: 1 } }, right: { strength: field } } }).kind).toBe('invalid-input');
  expect(check(f.mind, { ...args, comparison: { kind: 'fields', left: { toString: { state: 'absent' } }, right: { strength: field } } }).comparison.fields)
    .toEqual([{ name: 'toString', status: 'unknown' }, { name: 'strength', status: 'unknown' }]);
  const next = f.args('tea').selections[0];
  expect(check(f.mind, { ...args, selections: [...args.selections, next], comparison: { kind: 'fields',
    left: { strength: field }, right: { strength: { state: 'known', selection: 1 } } } }).comparison.fields[0].status).toBe('different');
}));

test('hard request caps and malformed relation annotations reject before evidence access', () => fixture(f => {
  const args = f.args();
  expect(check(f.mind, { ...args, selections: Array.from({ length: 33 }, () => args.selections[0]) }).kind).toBe('invalid-input');
  expect(check(f.mind, { ...args, refs: Array.from({ length: 13 }, () => args.refs[0]) }).kind).toBe('invalid-input');
  expect(check(f.mind, { ...args, claims: [{ relation: 'authorship-means-attended', subject: 'author', value: 'present', selection: 0 }] }).kind).toBe('invalid-input');
  expect(check(f.mind, { ...args, claims: [{ relation: 'participation', subject: 'author', value: 'present', selection: 1 }] }).kind).toBe('invalid-input');
}));

test('finite same-subject contexts give conflict, compatibility, disjoint and unknown only within annotations', () => fixture(f => {
  const args = f.args();
  const left = { subject: 'pump', property: 'state', day: { kind: 'set', values: ['Monday'] }, values: ['running'], evidence: [0] };
  const compare = (right: object) => check(f.mind, { ...args, comparison: { kind: 'contexts', left, right: { ...left, ...right } } });
  expect(compare({}).comparison.status).toBe('compatible');
  expect(compare({ values: ['stopped'] }).comparison.status).toBe('conflict');
  expect(compare({ values: ['stopped'], day: { kind: 'set', values: ['Tuesday'] } }).comparison.status).toBe('disjoint');
  expect(compare({ values: null }).comparison.status).toBe('unknown');
  expect(compare({ day: { kind: 'unknown' } }).comparison.status).toBe('unknown');
  expect(compare({ day: { kind: 'unrestricted' }, values: [] }).comparison.status).toBe('conflict');
  expect(compare({ subject: 'other' }).kind).toBe('invalid-input');
  expect(compare({ property: 'other' }).kind).toBe('invalid-input');
  expect(compare({ day: { kind: 'set', values: [] } }).kind).toBe('invalid-input');
}));

test('unavailable selections cannot yield matches or finite-context conclusions', () => fixture(f => {
  const args = f.args(), known = { state: 'known', selection: 0 };
  fs.unlinkSync(path.join(f.mind, 'episodes', f.source));
  expect(check(f.mind, { ...args, comparison: { kind: 'fields', left: { strength: known }, right: { strength: known } } }).comparison.fields[0].status).toBe('unknown');
  const account = { subject: 'pump', property: 'state', day: { kind: 'unrestricted' }, values: ['running'], evidence: [0] };
  expect(check(f.mind, { ...args, comparison: { kind: 'contexts', left: account, right: account } }).comparison.status).toBe('unknown');
}));

test('escaped JSON and metadata budgets omit whole quotes with explicit unknown comparisons', () => fixture(f => {
  const content = '# Notes\n' + '"\\'.repeat(1000);
  fs.writeFileSync(path.join(f.mind, 'episodes', f.source), content);
  const args = f.args(); args.selections[0].start = 8; args.selections[0].end = content.length;
  const known = { state: 'known', selection: 0 }, comparison = { kind: 'fields', left: { text: known }, right: { text: known } };
  const full = check(f.mind, { ...args, comparison });
  expect(full.complete).toBe(true);
  const partial = check(f.mind, { ...args, comparison, chars: 1300 });
  expect(partial.kind).toBe('check'); expect(JSON.stringify(partial).length).toBeLessThanOrEqual(1300);
  expect(partial.selections[0]).not.toHaveProperty('quote'); expect(partial.selections[0].status).toBe('over-budget');
  expect(partial.complete).toBe(false); expect(partial.comparison.fields[0].status).toBe('unknown');
  expect(check(f.mind, { ...args, chars: 0 }).kind).toBe('invalid-budget');
}));
