import { describe, expect, test } from 'bun:test';
import { adapters, fixtures } from './adapters_01_03';
import type { Candidate, Fixture } from './contract';

const adapter = (f: Fixture) => adapters.find(a => a.mechanism === f.mechanism)!;
const copy = <T>(x: T): T => structuredClone(x);
function unknown(c: Candidate, path: string) {
  c.evidence = c.evidence.filter(e => e.path !== path);
  c.unknown.push(path);
}

describe('bounded candidate decoding', () => {
  for (const f of fixtures) {
    test(`${f.id}: gold decodes and real operation runs`, () => {
      expect(adapter(f).decode(f.gold, f)).toEqual(f.gold);
      expect(adapter(f).operate(f.gold, f).operation).toBeTruthy();
    });
    test(`${f.id}: rejects authority fields, fabricated quotes, references and paths`, () => {
      const extra = { ...copy(f.gold), reviewed: true };
      expect(() => adapter(f).decode(extra, f)).toThrow();
      const invented = copy(f.gold); invented.evidence[0]!.quote = 'This sentence is not in any supplied source.';
      expect(() => adapter(f).decode(invented, f)).toThrow('quote not present');
      const source = copy(f.gold); source.evidence[0]!.sourceId = 'nonexistent';
      expect(() => adapter(f).decode(source, f)).toThrow();
      const path = copy(f.gold); path.evidence[0]!.path = 'data.reviewed';
      expect(() => adapter(f).decode(path, f)).toThrow('Evidence path/source');
      const missing = copy(f.gold); missing.evidence.shift();
      expect(() => adapter(f).decode(missing, f)).toThrow('Missing field evidence');
    });
    test(`${f.id}: rejects malformed shapes and duplicate/omitted records`, () => {
      const missing = copy(f.gold); missing.data = {};
      expect(() => adapter(f).decode(missing, f)).toThrow();
      const malformed = copy(f.gold); malformed.data = [];
      expect(() => adapter(f).decode(malformed, f)).toThrow();
      const key = f.mechanism === '01' ? 'records' : f.mechanism === '02' ? 'accounts' : 'reports';
      const duplicate = copy(f.gold) as any; duplicate.data[key].push(copy(duplicate.data[key][0]));
      expect(() => adapter(f).decode(duplicate, f)).toThrow();
      const omitted = copy(f.gold) as any; omitted.data[key].pop();
      expect(() => adapter(f).decode(omitted, f)).toThrow();
      if (f.sources.length > 1) {
        const reordered = copy(f.gold) as any; reordered.data[key].reverse();
        expect(() => adapter(f).decode(reordered, f)).toThrow('source order');
      }
      const authority = copy(f.gold) as any; authority.data[key][0].identity = 'reviewed';
      expect(() => adapter(f).decode(authority, f)).toThrow();
    });
  }
});

describe('01 caller-bounded views', () => {
  const f = fixtures[0]!;
  test('retains the condition and reports record omission within the caller budget', () => {
    const r = adapter(f).operate(f.gold, f).result as any;
    expect(r.kind).toBe('view');
    expect(r.text).toContain('once only if nobody is waiting');
    expect(r.includedRefs).toEqual([{ id: 'seed-note', revision: 'r1' }]);
    expect(r.omittedCount).toBe(1);
    expect(JSON.stringify(r).length).toBeLessThanOrEqual(850);
  });
  test('current eligibility, revision, and completeness come from caller', () => {
    const changed = copy(f) as any;
    changed.caller.states['seed-note'].eligible = false;
    changed.caller.populationComplete = false;
    const r = adapter(changed).operate(changed.gold, changed).result as any;
    expect(r.includedRefs[0].id).toBe('garden-note');
    expect(r.populationComplete).toBe(false);
    changed.caller.states['garden-note'].revision = 'r2';
    const stale = adapter(changed).operate(changed.gold, changed).result as any;
    expect(stale.includedRefs).toEqual([]);
    expect(stale.unresolvedCount).toBe(1);
  });
  test('null scope stays unknown and may not become false', () => {
    const c = copy(f.gold) as any; c.data.records[0].scope = null;
    unknown(c, 'data.records.0.scope');
    expect(() => adapter(f).decode(c, f)).not.toThrow();
    c.data.records[0].scope = false;
    expect(() => adapter(f).decode(c, f)).toThrow();
  });
  test('cross-record evidence cannot support a field merely by existing elsewhere', () => {
    const c = copy(f.gold); c.evidence[0] = { path: 'data.records.0.claim', sourceId: 'garden-note', quote: f.sources[1]!.text };
    expect(() => adapter(f).decode(c, f)).toThrow('Evidence path/source');
  });
});

describe('02 finite contextual compatibility', () => {
  const f = fixtures[1]!;
  test('opposite values on distinct days are separate, not a joint conflict', () => {
    const r = adapter(f).operate(f.gold, f).result as any;
    expect(r.reports[0].alignment).toBe('separate');
    expect(r.reports[0].reason).toBe('disjoint-applicability');
    expect(r.reports[0].joint).toBeUndefined();
  });
  test('unknown applicability cannot become unrestricted', () => {
    const c = copy(f.gold) as any; c.data.accounts[1].context.day = { kind: 'unknown' };
    unknown(c, 'data.accounts.1.context.day');
    const r = adapter(f).operate(c, f).result as any;
    expect(r.reports[0].alignment).toBe('unknown');
    expect(r.reports[0].reason).toBe('applicability-overlap-unresolved');
    c.data.accounts[1].context.day = { kind: 'set', values: [] };
    expect(() => adapter(f).decode(c, f)).toThrow('empty context set');
  });
  test('unknown allowed values produce an unresolved join, never an empty-domain conflict', () => {
    const c = copy(f.gold) as any; c.data.accounts[0].values = null;
    unknown(c, 'data.accounts.0.values');
    const r = adapter(f).operate(c, f).result as any;
    expect(r.unresolvedValues).toEqual(['darkroom-tue']);
    expect(r.reports[0].alignment).toBe('unknown');
    expect(r.reports[0].joint).toBeUndefined();
  });
  test('an explicitly empty allowed set is conflict rather than unknown when contexts overlap', () => {
    const changed = copy(f) as any;
    const text = 'On Tuesday the community darkroom permits neither dark nor bright lighting.';
    changed.sources[1].text = text;
    changed.gold.data.accounts[1].context.day.values = ['Tuesday'];
    changed.gold.data.accounts[1].values = [];
    changed.gold.evidence.filter((e: any) => e.sourceId === 'darkroom-wed').forEach((e: any) => { e.quote = text; });
    const r = adapter(changed).operate(changed.gold, changed).result as any;
    expect(r.reports[0].alignment).toBe('aligned');
    expect(r.reports[0].joint.status).toBe('conflict');
    expect(r.unresolvedValues).toEqual([]);
  });
  test('caller alignment and source state cannot be overwritten by extraction', () => {
    const changed = copy(f) as any; changed.caller.states['darkroom-tue'].eligible = false;
    expect((adapter(changed).operate(changed.gold, changed).result as any).reports[0].reason).toBe('source-ineligible');
    changed.caller.alignment = [];
    const r = adapter(changed).operate(changed.gold, changed).result as any;
    expect(r.reports.every((x: any) => x.reason === 'no-reviewed-group')).toBe(true);
    const c = copy(f.gold) as any; c.data.alignment = f.caller.alignment;
    expect(() => adapter(f).decode(c, f)).toThrow();
  });
});

describe('03 typed attribution', () => {
  const f = fixtures[2]!;
  test('speaker, subject, event setting, and recording location remain distinct', () => {
    const r = adapter(f).operate(f.gold, f).result as any[];
    expect(r.find(x => x.query.select === 'speakers').composition.rows[0].speaker).toBe('nia');
    expect(r.find(x => x.query.select === 'by' && x.query.person === 'omar').composition.rows).toEqual([]);
    expect(r.find(x => x.query.select === 'about' && x.query.person === 'omar' && x.query.project === 'report').composition.rows).toHaveLength(1);
    const setting = r.find(x => x.query.select === 'about' && x.query.person === 'omar' && x.query.project === 'occasionSetting').composition;
    expect(setting.rows[0].setting).toBe('shelter');
    expect(setting.semantics).toBe('notChecked');
  });
  test('unreviewed caller identity stays unresolved even when a model gives its ID', () => {
    const changed = copy(f) as any; changed.caller.people.nia.identity = 'unresolved';
    const speaker = (adapter(changed).operate(changed.gold, changed).result as any[])[0].composition;
    expect(speaker.rows).toEqual([]);
    expect(speaker.unresolved.some((x: any) => x.reason === 'identityUnresolved:nia')).toBe(true);
  });
  test('missing speaker is unresolved, never evidence of no speaker', () => {
    const f = fixtures[3]!;
    const r = adapter(f).operate(f.gold, f).result as any[];
    expect(r[0].composition.rows).toEqual([]);
    expect(r[0].composition.unresolved).toContainEqual({ record: 'report:unsigned-note', reason: 'personUnknown' });
    expect(r[0].composition.coverage.complete).toBe(false);
    const c = copy(f.gold) as any; c.data.reports[0].subjects = [];
    expect(() => adapter(f).decode(c, f)).toThrow('Missing field evidence');
    c.data.reports[0].subjects = false;
    expect(() => adapter(f).decode(c, f)).toThrow();
  });
  test('real quote presence is not semantic certification', () => {
    const c = copy(f.gold) as any; c.data.reports[0].speaker = 'omar';
    // The quote exists but contradicts this attribution. The semantic grader must fail it.
    expect(() => adapter(f).decode(c, f)).not.toThrow();
    const r = adapter(f).operate(c, f).result as any[];
    expect(r[0].composition.semantics).toBe('notChecked');
    expect(r[0].composition.rows[0].speaker).toBe('omar');
  });
});
