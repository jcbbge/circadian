import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { fixtures, adapters as legacy } from '../extractor-006/adapters_01_03';
import { fixtures as otherFixtures } from '../extractor-006/adapters_04_06';
import type { Fixture } from '../extractor-006/contract';
import { adapters } from './adapters_01_03';
import { adapters as otherAdapters } from './adapters_04_06';

const clone = <T>(value: T): T => structuredClone(value);
const adapter = (f: Fixture) => adapters.find(a => a.mechanism === f.mechanism)!;
function rawReviewed(f: Fixture): any {
  const data = clone(f.gold.data) as Record<string, any[]>;
  for (const entries of Object.values(data)) for (const entry of entries) {
    delete entry.sourceId;
    if (f.mechanism === '02') delete entry.property;
  }
  return data;
}
function ungraded(f: Fixture): Fixture {
  const runtime = { id: f.id, mechanism: f.mechanism, sources: f.sources, caller: f.caller, ...(f.task ? { task: f.task } : {}) };
  return new Proxy(runtime, { get(target, key) {
    if (['gold', 'checks', 'rubric', 'question'].includes(String(key))) throw new Error(`Forbidden grading access: ${String(key)}`);
    return Reflect.get(target, key);
  } }) as Fixture;
}

describe('minimal extraction with deterministic input provenance', () => {
  for (const f of fixtures) {
    test(`${f.id}: reviewed semantic data binds and runs the unchanged operation`, () => {
      const a = adapter(f), c = a.bind(rawReviewed(f), ungraded(f));
      expect(c.data).toEqual(f.gold.data);
      expect([...c.unknown].sort()).toEqual([...f.gold.unknown].sort());
      expect(legacy.find(x => x.mechanism === f.mechanism)!.decode(c, ungraded(f))).toEqual(c);
      expect(a.operate(c, ungraded(f))).toEqual(legacy.find(x => x.mechanism === f.mechanism)!.operate(f.gold, f));
      for (const e of c.evidence) expect(e.quote).toBe(f.sources.find(s => s.id === e.sourceId)!.text);
    });
    test(`${f.id}: prompts and binding cannot inspect grading-only fields`, () => {
      const a = adapter(f), runtime = ungraded(f);
      expect(() => a.format(runtime)).not.toThrow();
      expect(() => a.bind(rawReviewed(f), runtime)).not.toThrow();
      expect(a.semanticInstructions).not.toMatch(/JSON|schema|sourceId|data\.|evidence\[|wrapper|envelope/i);
      const format = a.format(runtime);
      expect(format.schema.additionalProperties).toBe(false);
      const schemaText = JSON.stringify(format.schema);
      expect(schemaText).not.toContain('"enum":[]');
      for (const forbidden of ['sourceId', 'evidence', 'revision', 'eligible', 'gold', 'question']) expect(schemaText).not.toContain(`"${forbidden}"`);
    });
    test(`${f.id}: rejects bookkeeping, missing/extra semantic keys and record counts`, () => {
      const a = adapter(f), original = rawReviewed(f), key = Object.keys(original)[0]!;
      const wrapped = { data: clone(original), evidence: [], unknown: [] };
      expect(() => a.bind(wrapped, ungraded(f))).toThrow();
      const withId = clone(original); withId[key][0].sourceId = f.sources[0]!.id;
      expect(() => a.bind(withId, ungraded(f))).toThrow();
      const extra = clone(original); extra[key][0].reviewed = true;
      expect(() => a.bind(extra, ungraded(f))).toThrow();
      const missing = clone(original); delete missing[key][0][Object.keys(missing[key][0])[0]!];
      expect(() => a.bind(missing, ungraded(f))).toThrow();
      const count = clone(original); count[key].pop();
      expect(() => a.bind(count, ungraded(f))).toThrow('one semantic entry per source');
    });
  }
});

describe('01 preserves candidate meaning without oracle correction', () => {
  const f = fixtures[0]!;
  test('unknown scope is preserved; unsupported prose is neither corrected nor certified', () => {
    const raw = rawReviewed(f); raw.records[0].scope = null; raw.records[0].claim = 'Invented trays are free to keep forever.';
    const c = adapter(f).bind(raw, ungraded(f)) as any;
    expect(c.data.records[0].claim).toBe(raw.records[0].claim);
    expect(c.data.records[0].scope).toBeNull();
    expect(c.unknown).toContain('data.records.0.scope');
    expect(c.evidence[0].quote).not.toContain('free to keep forever');
    expect((adapter(f).operate(c, ungraded(f)).result as any).text).toContain('free to keep forever');
  });
  test('malformed meaning fields remain failures despite generated envelope', () => {
    for (const bad of [false, '', 'unlisted-scope']) {
      const raw = rawReviewed(f); raw.records[0].scope = bad;
      expect(() => adapter(f).bind(raw, ungraded(f))).toThrow();
    }
    const raw = rawReviewed(f); raw.records[0].qualifications = 'a string';
    expect(() => adapter(f).bind(raw, ungraded(f))).toThrow();
  });
});

describe('02 supplies the comparison property without extracting an artificial quote', () => {
  const f = fixtures[1]!;
  test('property is caller-owned and its full-source reference is only provenance', () => {
    const raw = rawReviewed(f), c = adapter(f).bind(raw, ungraded(f)) as any;
    expect(c.data.accounts[0].property).toBe(f.caller.property);
    expect(f.sources[0]!.text).not.toContain(String(f.caller.property));
    expect(c.evidence.find((e: any) => e.path === 'data.accounts.0.property').quote).toBe(f.sources[0]!.text);
    raw.accounts[0].property = 'invented-property';
    expect(() => adapter(f).bind(raw, ungraded(f))).toThrow();
  });
  test('unknown, empty and unrestricted remain distinct', () => {
    const raw = rawReviewed(f); raw.accounts[0].values = null; raw.accounts[0].context.day = { kind: 'unknown' };
    const c = adapter(f).bind(raw, ungraded(f)) as any;
    expect(c.unknown).toContain('data.accounts.0.values');
    expect(c.unknown).toContain('data.accounts.0.context.day');
    expect((adapter(f).operate(c, ungraded(f)).result as any).unresolvedValues).toEqual(['darkroom-tue']);
    raw.accounts[0].values = []; raw.accounts[0].context.day = { kind: 'unrestricted' };
    const empty = adapter(f).bind(raw, ungraded(f)) as any;
    expect(empty.data.accounts[0].values).toEqual([]);
    expect(empty.unknown).not.toContain('data.accounts.0.values');
    expect(empty.data.accounts[0].context.day.kind).toBe('unrestricted');
    raw.accounts[0].context.day = { kind: 'set', values: [] };
    expect(() => adapter(f).bind(raw, ungraded(f))).toThrow('empty context set');
  });
  test('known but wrong day remains an observable semantic error', () => {
    const raw = rawReviewed(f); raw.accounts[1].context.day.values = ['Tuesday'];
    const c = adapter(f).bind(raw, ungraded(f)) as any;
    expect(c.data.accounts[1].context.day.values).toEqual(['Tuesday']);
    expect((adapter(f).operate(c, ungraded(f)).result as any).reports[0].joint.status).toBe('conflict');
  });
});

describe('03 preserves attribution and missing information', () => {
  test('wrong known speaker is not fixed by input provenance', () => {
    const f = fixtures[2]!, raw = rawReviewed(f); raw.reports[0].speaker = 'omar';
    const c = adapter(f).bind(raw, ungraded(f)) as any;
    expect(c.data.reports[0].speaker).toBe('omar');
    const result = adapter(f).operate(c, ungraded(f)).result as any[];
    expect(result[0].composition.rows[0].speaker).toBe('omar');
    expect(result[0].composition.semantics).toBe('notChecked');
  });
  test('unknown people remain null; an incorrect empty set is visible to grading', () => {
    const f = fixtures[3]!, raw = rawReviewed(f);
    const c = adapter(f).bind(raw, ungraded(f)) as any;
    expect(c.data.reports[0].subjects).toBeNull();
    expect(c.unknown).toContain('data.reports.0.subjects');
    raw.reports[0].subjects = [];
    const incorrect = adapter(f).bind(raw, ungraded(f)) as any;
    expect(incorrect.data.reports[0].subjects).toEqual([]);
    expect(incorrect.unknown).not.toContain('data.reports.0.subjects');
    expect(incorrect.evidence.find((e: any) => e.path === 'data.reports.0.subjects').quote).toBe(f.sources[0]!.text);
  });
  test('false, unknown IDs and oversized participant lists are rejected', () => {
    const f = fixtures[2]!;
    for (const value of [false, '', 'invented-person']) {
      const raw = rawReviewed(f); raw.reports[0].speaker = value;
      expect(() => adapter(f).bind(raw, ungraded(f))).toThrow();
    }
    const raw = rawReviewed(f); raw.reports[0].subjects = ['nia', 'omar', 'nia', 'omar', 'nia'];
    expect(() => adapter(f).bind(raw, ungraded(f))).toThrow();
  });
});

// This checks the actual installed serving compiler without loading a model or
// making an inference request. Non-local installations skip this machine gate.
const schemaPython = '/Users/jrg/local-llm/venv/bin/python';
test.skipIf(!existsSync(schemaPython))('all eight development schemas compile and accept normal multiword values', () => {
  const all = [...adapters, ...otherAdapters];
  const packets = [...fixtures, ...otherFixtures].map(f => {
    const a = all.find(x => x.mechanism === f.mechanism)!;
    const examples: { raw: unknown; accepted: boolean }[] = [];
    if (fixtures.includes(f)) {
      examples.push({ raw: rawReviewed(f), accepted: true });
      if (f.mechanism === '01') {
        const raw = rawReviewed(f); raw.records[0].claim = '  A longer claim, with "quoted words" and punctuation!  ';
        raw.records[0].qualifications = [' Only after the shared event; never before. '];
        examples.push({ raw, accepted: true });
      }
      if (f.mechanism === '03') {
        const raw = rawReviewed(f); raw.reports[0].statement = '  "A longer report," she said — with several words.  ';
        examples.push({ raw: clone(raw), accepted: true });
        raw.reports[0].subjects = null;
        examples.push({ raw: clone(raw), accepted: true });
        raw.reports[0].subjects = [];
        examples.push({ raw: clone(raw), accepted: true });
        if (!Object.keys(f.caller.people as object).length) {
          raw.reports[0].subjects = ['invented'];
          examples.push({ raw: clone(raw), accepted: false });
        }
      }
      if (f.mechanism === '02') {
        const raw = rawReviewed(f); raw.accounts[0].values = null; raw.accounts[0].context.day = { kind: 'unknown' };
        examples.push({ raw: clone(raw), accepted: true });
        raw.accounts[0].values = []; raw.accounts[0].context.day = { kind: 'unrestricted' };
        examples.push({ raw: clone(raw), accepted: true });
      }
    }
    return { id: f.id, schema: a.format(ungraded(f)).schema, examples };
  });
  const script = `import json,re,sys
from outlines_core.fsm.json_schema import build_regex_from_schema
results=[]
for entry in json.load(sys.stdin):
    pattern=build_regex_from_schema(json.dumps(entry['schema']))
    matches=[bool(re.fullmatch(pattern,json.dumps(x['raw'],ensure_ascii=False,separators=(',',':')))) == x['accepted'] for x in entry['examples']]
    results.append({'id':entry['id'],'compiled':True,'examples':len(matches),'matches':matches})
print(json.dumps(results))`;
  const result = Bun.spawnSync([schemaPython, '-c', script], { stdin: Buffer.from(JSON.stringify(packets)) });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  const compiled = JSON.parse(result.stdout.toString());
  expect(compiled).toHaveLength(8);
  for (const row of compiled) {
    expect(row.compiled, row.id).toBe(true);
    expect(row.matches.every(Boolean), JSON.stringify(row)).toBe(true);
  }
  expect(compiled.reduce((n: number, row: any) => n + row.examples, 0)).toBe(14);
});

test('serving string syntax does not replace local nonblank validation', () => {
  for (const f of [fixtures[0]!, fixtures[2]!]) {
    const raw = rawReviewed(f);
    if (f.mechanism === '01') raw.records[0].claim = '   ';
    else raw.reports[0].statement = '   ';
    expect(() => adapter(f).bind(raw, ungraded(f))).toThrow('Invalid bounded string');
  }
});
