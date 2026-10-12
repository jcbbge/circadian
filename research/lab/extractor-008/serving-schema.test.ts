import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { fixtures, adapters as legacy } from '../extractor-006/adapters_01_03';
import { adapters } from '../extractor-007/adapters_01_03';
import { servingSchema } from './serving-schema';

const CLOCK = '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$|^24:00$';

describe('small serving-only schema projection', () => {
  test('preserves input and keeps types, required keys, alternatives, enums and constants', () => {
    const schema = { type: 'object', additionalProperties: false, required: ['entry'], properties: {
      entry: { anyOf: [{ type: 'array', minItems: 0, maxItems: 8, uniqueItems: true,
        items: { type: 'string', enum: ['known', 'unknown'], minLength: 1, maxLength: 64 } }, { type: 'null' }] },
    }, const: { maxLength: 7, nested: { minItems: 4 } } };
    const before = structuredClone(schema), out = servingSchema(schema) as any;
    expect(schema).toEqual(before);
    expect(out).toEqual({ type: 'object', additionalProperties: false, required: ['entry'], properties: {
      entry: { anyOf: [{ type: 'array', minItems: 0, maxItems: 8, uniqueItems: true,
        items: { type: 'string', enum: ['known', 'unknown'], minLength: 1 } }, { type: 'null' }] },
    }, const: { maxLength: 7, nested: { minItems: 4 } } });
    out.properties.entry.anyOf[0].items.enum.push('changed');
    out.const.nested.minItems = 100;
    expect(schema).toEqual(before);
  });

  test('property and definition names that resemble constraints are preserved', () => {
    const schema = { type: 'object', required: ['maxLength', 'minItems'], additionalProperties: false,
      properties: { maxLength: { type: 'string', maxLength: 2 }, minItems: { type: 'number', minimum: 3 } },
      $defs: { maxItems: { type: 'array', maxItems: 2, items: { type: 'string', maxLength: 5 } } },
      definitions: { minimum: { type: 'integer', minimum: 0 } },
      enum: [{ maxLength: 99, properties: { x: { maxItems: 4 } } }],
      default: { minItems: 5, pattern: 'literal' } };
    const out = servingSchema(schema) as any;
    expect(Object.keys(out.properties)).toEqual(['maxLength', 'minItems']);
    expect(out.properties.maxLength).toEqual({ type: 'string' });
    expect(out.properties.minItems).toEqual({ type: 'number', minimum: 3 });
    expect(out.$defs.maxItems).toEqual({ type: 'array', maxItems: 2, items: { type: 'string' } });
    expect(out.definitions.minimum).toEqual({ type: 'integer', minimum: 0 });
    expect(out.enum).toEqual(schema.enum);
    expect(out.default).toEqual(schema.default);
    expect(out.required).toEqual(schema.required);
  });

  test('projects nested array, composition and additional-property schemas only', () => {
    const schema = { allOf: [{ type: 'array', minItems: 2, maxItems: 4,
      items: { oneOf: [{ type: 'array', maxItems: 3, items: { type: 'number', minimum: 0, maximum: 9, multipleOf: 3 } }, { const: null }] },
      prefixItems: [{ type: 'number', exclusiveMinimum: 1, exclusiveMaximum: 20 }] }],
      additionalProperties: { type: 'string', minLength: 1, maxLength: 5, pattern: '^arbitrary+$' } };
    expect(servingSchema(schema)).toEqual({ allOf: [{ type: 'array', minItems: 2, maxItems: 4,
      items: { oneOf: [{ type: 'array', maxItems: 3, items: { type: 'number', minimum: 0, maximum: 9, multipleOf: 3 } }, { const: null }] },
      prefixItems: [{ type: 'number', exclusiveMinimum: 1, exclusiveMaximum: 20 }] }],
      additionalProperties: { type: 'string', minLength: 1, pattern: '^arbitrary+$' } });
  });

  test('retains all patterns and minimum lengths while removing maximum lengths', () => {
    const schema = { type: 'object', properties: {
      clock: { type: 'string', pattern: CLOCK, minLength: 1, maxLength: 5 },
      prose: { type: 'string', pattern: '[A-Z].{1,2000}', maxLength: 2000 },
    } };
    const out = servingSchema(schema) as any;
    expect(out.properties.clock).toEqual({ type: 'string', pattern: CLOCK, minLength: 1 });
    expect(out.properties.prose).toEqual({ type: 'string', pattern: '[A-Z].{1,2000}' });
  });

  test('retains zero-length array enforcement and separate null/empty representations', () => {
    const f = fixtures.find(f => f.id === 'cal-03-unknown-attribution')!;
    const a = adapters.find(a => a.mechanism === '03')!;
    const full = a.format(f).schema as any, out = servingSchema(full) as any;
    expect(full.properties.reports.items.properties.subjects.anyOf[0].maxItems).toBe(0);
    expect(out.properties.reports.items.properties.subjects).toEqual(full.properties.reports.items.properties.subjects);
    expect(out.properties.reports.items.properties.subjects.anyOf[0].maxItems).toBe(0);
    const raw = { reports: [{ statement: 'They preferred the covered route.', speaker: null,
      subjects: null, recordingLocation: 'ferry-office', occasionSetting: null }] } as any;
    const unknown = a.bind(raw, f) as any;
    expect(unknown.data.reports[0].subjects).toBeNull();
    raw.reports[0].subjects = [];
    const empty = a.bind(raw, f) as any;
    expect(empty.data.reports[0].subjects).toEqual([]);
    expect(empty.unknown).not.toContain('data.reports.0.subjects');
    raw.reports[0].subjects = ['invented'];
    expect(() => a.bind(raw, f)).toThrow('Invalid enum');
    expect(legacy.find(a => a.mechanism === '03')!.decode(unknown, f)).toEqual(unknown);
  });
});

const compilerPython = '/Users/jrg/local-llm/venv/bin/python';
test.skipIf(!existsSync(compilerPython))('actual serving regex admits an overlong string that the unchanged binder rejects', () => {
  const f = fixtures.find(f => f.id === 'cal-03-unknown-attribution')!;
  const a = adapters.find(a => a.mechanism === '03')!;
  const raw = { reports: [{ statement: 'A'.repeat(601), speaker: null,
    subjects: null, recordingLocation: 'ferry-office', occasionSetting: null }] };
  const full = a.format(f).schema, projected = servingSchema(full);
  const script = `import json,re,sys
from outlines_core.fsm.json_schema import build_regex_from_schema
x=json.load(sys.stdin)
payload=json.dumps(x['raw'],separators=(',',':'))
print(json.dumps({k:bool(re.fullmatch(build_regex_from_schema(json.dumps(x[k])),payload)) for k in ['full','projected']}))`;
  const result = Bun.spawnSync([compilerPython, '-c', script], { stdin: Buffer.from(JSON.stringify({ full, projected, raw })) });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  expect(JSON.parse(result.stdout.toString())).toEqual({ full: false, projected: true });
  expect(() => a.bind(raw, f)).toThrow('Invalid bounded string');
});
