import { describe, expect, test } from 'bun:test';
import { adapters as first } from '../extractor-006/adapters_01_03';
import { adapters as second, compareTransformations } from '../extractor-006/adapters_04_06';
import { arr, fieldAt, obj, type Fixture } from '../extractor-006/contract';
import { jointOccasions, type Occasion, type Sources } from '../../prototypes/05-experiences';
import { fixtures, pairs } from './confirmation';

const adapters = [...first, ...second];
function fixture(id: string): Fixture {
  const found = fixtures.find(f => f.id === id);
  if (!found) throw new Error(`Missing confirmation fixture: ${id}`);
  return found;
}
function adapter(f: Fixture) { return adapters.find(a => a.mechanism === f.mechanism)!; }
function operated(id: string) { const f = fixture(id); return adapter(f).operate(f.gold, f); }

describe('independently authored confirmation sources', () => {
  test('ten unique fixtures cover all six existing mechanisms without labeled source IDs', () => {
    expect(fixtures).toHaveLength(10);
    expect(new Set(fixtures.map(f => f.id)).size).toBe(10);
    expect(fixtures.reduce<Record<string, number>>((n, f) => { n[f.mechanism] = (n[f.mechanism] ?? 0) + 1; return n; }, {}))
      .toEqual({ '01': 1, '02': 2, '03': 2, '04': 1, '05': 1, '06': 3 });
    const sources = fixtures.flatMap(f => f.sources);
    expect(new Set(sources.map(s => s.id)).size).toBe(sources.length);
    for (const f of fixtures) {
      expect(JSON.stringify({ id: f.id, sourceIds: f.sources.map(s => s.id), caller: f.caller, note: f.note }))
        .not.toMatch(/\b(?:harmless|harmful|preserved|changed|conflict|disjoint)\b/i);
      expect(f.question.length).toBeGreaterThan(30);
      expect(f.rubric.required.length).toBeGreaterThan(0);
    }
  });

  for (const f of fixtures) {
    test(`${f.id}: gold decodes, every closed check matches, and evidence is exact`, () => {
      const decoded = adapter(f).decode(f.gold, f);
      expect(decoded).toEqual(f.gold);
      for (const c of f.checks) {
        expect(fieldAt(decoded, c.path)).toEqual(c.value);
      }
      for (const e of decoded.evidence) {
        const source = f.sources.find(s => s.id === e.sourceId);
        expect(source).toBeDefined();
        expect(source!.text.includes(e.quote)).toBe(true);
      }
      expect(() => adapter(f).operate(decoded, f)).not.toThrow();
    });
  }

  test('view retains all loan conditions and truthfully reports omitted background', () => {
    const f = fixture('confirm-h31');
    expect(f.sources[0]!.text).toContain('for four days');
    expect(f.sources[0]!.text).toContain('by two days only if a staff member approves before the due date');
    expect(f.sources[1]!.text).toContain('east entrance is closed during deliveries');
    const view = obj(operated(f.id).result);
    expect(view.kind).toBe('view');
    expect(view.includedRefs).toEqual([{ id: 'src-j52', revision: 'r1' }]);
    expect(view.eligibleCount).toBe(2);
    expect(view.omittedCount).toBe(1);
    expect(view.populationComplete).toBe(true);
    expect(String(view.text)).toContain('before the due date');
    expect(String(view.text)).not.toContain('local photographs');
  });

  test('different day requirements stay separate instead of manufacturing conflict', () => {
    const result = obj(operated('confirm-p84').result);
    expect(result.unresolvedValues).toEqual([]);
    const reports = arr(result.reports).map(value => obj(value));
    expect(reports).toHaveLength(1);
    expect(reports[0]!.alignment).toBe('separate');
    expect(reports[0]!.reason).toBe('disjoint-applicability');
    expect(reports[0]!.joint).toBeUndefined();
    expect(fixture('confirm-p84').sources.map(s => s.text)).toEqual([
      'On Thursday, the equipment gate must stay locked for inventory.',
      'On Saturday, the equipment gate must stay unlocked for scheduled pickups.',
    ]);
  });

  test('same Monday running and stopped requirements produce a real finite conflict', () => {
    const result = obj(operated('confirm-v26').result);
    const reports = arr(result.reports).map(value => obj(value));
    expect(reports).toHaveLength(1);
    expect(reports[0]!.alignment).toBe('aligned');
    expect(obj(reports[0]!.joint).status).toBe('conflict');
    expect(reports[0]!.region).toEqual([{ name: 'day', dimension: { kind: 'set', values: ['Monday'] } }]);
    for (const s of fixture('confirm-v26').sources) expect(s.text).toContain('throughout Monday');
  });

  test('attribution composition keeps speaker, subject, occasion and record location separate', () => {
    const results = arr(operated('confirm-d57').result).map(value => obj(value));
    const speakers = results.find(r => obj(r.query).select === 'speakers')!;
    expect(arr(obj(speakers.composition).rows).map(r => obj(r).speaker)).toEqual(['selma']);
    const about = results.find(r => obj(r.query).select === 'about' && obj(r.query).person === 'tomas' && obj(r.query).project === 'occasionSetting')!;
    expect(arr(obj(about.composition).rows).map(r => obj(r).setting)).toEqual(['studio']);
    const byTomas = results.find(r => obj(r.query).select === 'by' && obj(r.query).person === 'tomas')!;
    expect(obj(byTomas.composition).rows).toEqual([]);
    expect(fieldAt(fixture('confirm-d57').gold, 'data.reports.0.recordingLocation')).toBe('counter');
    expect(obj(about.composition).semantics).toBe('notChecked');
  });

  test('unidentified people stay null, not empty, and missing speaker yields unresolved output', () => {
    const f = fixture('confirm-m93');
    expect(f.sources[0]!.text).toContain('Neither the speaker nor the people meant by "they" are identified');
    expect(fieldAt(f.gold, 'data.reports.0.subjects')).toBeNull();
    expect(fieldAt(f.gold, 'data.reports.0.occasionSetting')).toBeNull();
    const results = arr(operated(f.id).result).map(value => obj(value));
    const composition = obj(results[0]!.composition);
    expect(composition.rows).toEqual([]);
    expect(arr(composition.unresolved).length).toBeGreaterThan(0);
    expect(JSON.stringify(composition)).not.toContain('"speaker":"kiosk"');
    const emptySubjects = structuredClone(f.gold);
    const report = obj(arr(obj(emptySubjects.data).reports)[0]);
    report.subjects = [];
    expect(() => adapter(f).decode(emptySubjects, f)).toThrow();
    expect(f.rubric.forbidden).toContain('No people made the choice.');
  });

  test('non-round times convert exactly and current time controls earliest start', () => {
    const f = fixture('confirm-t68');
    const clocks = [...f.sources[0]!.text.matchAll(/\b(\d{2}):(\d{2})\b/g)].map(m => Number(m[1]) * 60 + Number(m[2]));
    expect(clocks).toEqual([847, 911, 859, 903]);
    expect(fieldAt(f.gold, 'data.availability.0.windows')).toEqual([[clocks[0], clocks[1]]]);
    expect(fieldAt(f.gold, 'data.availability.1.windows')).toEqual([[clocks[2], clocks[3]]]);
    const result = obj(obj(operated(f.id).result).computation);
    expect(result.status).toBe('result');
    expect(result.asOf).toBe(866);
    expect(result.options).toEqual([{ place: 'reading alcove', window: [866, 889], tentative: true }]);
    const before = structuredClone(f);
    before.caller.asOf = 840;
    expect(obj(obj(adapter(before).operate(before.gold, before).result).computation).options)
      .toEqual([{ place: 'reading alcove', window: [859, 882], tentative: true }]);
    expect(fieldAt(f.gold, 'data.preferences.0.seating')).toBe(false);
    expect(fieldAt(f.gold, 'data.preferences.1.quiet')).toBe(false);
  });

  test('reflection author remains attendance-unknown, while the pair is simultaneous', () => {
    const f = fixture('confirm-c42');
    const result = obj(operated(f.id).result);
    const recall = obj(result.recall);
    expect(recall.status).toBe('ok');
    const accounts = arr(recall.accounts).map(value => obj(value));
    expect(accounts).toHaveLength(1);
    expect(accounts[0]!.author).toBe('Bex');
    expect(accounts[0]!.attendance).toBe('unknown');
    expect(accounts[0]!.account).toBe('Their careful repairs were an example of patience.');
    expect(obj(result.participation).matches).toEqual([]);
    expect(obj(result.participation).unresolved).toEqual([{ id: 'occasion-p53', reason: 'participation-unknown' }]);
    expect(f.gold.unknown).toEqual(['Whether Bex attended is not established.']);
    const data = obj(f.gold.data);
    const occasion: Occasion = {
      id: String(f.caller.occasionId), ref: { source: String(f.caller.eventSourceId), revision: 'r1' }, narrative: String(data.narrative),
      participants: arr(data.participants).map(value => { const p = obj(value); return { person: String(p.person), role: String(p.role) }; }),
      mentioned: arr(data.mentioned).map(String), coPresence: arr(data.coPresence).map(group => arr(group).map(String)),
    };
    const pairResult = obj(jointOccasions(['Kato', 'Elin'], [occasion], f.caller.sourceStates as Sources));
    expect(pairResult.matches).toEqual([{ id: 'occasion-p53', roles: [{ person: 'Kato', role: 'replaced a spar' }, { person: 'Elin', role: 'patched a sail' }], simultaneous: 'supported' }]);
    expect(pairResult.unresolved).toEqual([]);
    expect(fieldAt(f.gold, 'data.coPresence')).toEqual([['Kato', 'Elin']]);
    expect(f.sources[0]!.text).toContain('They worked simultaneously at the same bench.');
  });

  test('text-span equality is diagnostic while known/unknown state checks stay critical', () => {
    for (const f of fixtures.filter(f => f.mechanism === '06')) {
      const states = f.checks.filter(c => c.path.endsWith('.state'));
      const values = f.checks.filter(c => c.path.endsWith('.value'));
      expect(states).toHaveLength(5);
      expect(values).toHaveLength(5);
      expect(states.every(c => c.critical)).toBe(true);
      expect(values.every(c => !c.critical)).toBe(true);
    }
    const f = fixture('confirm-r15');
    const alternate = structuredClone(f.gold);
    obj(obj(alternate.data).modality).value = 'I could favor';
    alternate.evidence.find(e => e.path === 'modality')!.quote = 'I could favor';
    const decoded = adapter(f).decode(alternate, f);
    const mismatches = f.checks.filter(c => JSON.stringify(fieldAt(decoded, c.path)) !== JSON.stringify(c.value));
    expect(mismatches).toEqual([{ path: 'data.modality.value', value: 'could favor', critical: false }]);
    expect(mismatches.some(c => c.critical)).toBe(false);
  });

  test('independent text annotations preserve one rewrite and detect qualification plus modality changes', () => {
    expect(pairs).toHaveLength(2);
    for (const pair of pairs) {
      const old = structuredClone(fixture(pair.oldId));
      const candidate = structuredClone(fixture(pair.candidateId));
      expect(old.caller.role).toBe('old');
      expect(candidate.caller.role).toBe('candidate');
      expect(old.caller.pairId).toBe(candidate.caller.pairId);
      expect(old.sources[0]!.text).not.toBe(candidate.sources[0]!.text);
      const result = obj(compareTransformations(old.gold, old, candidate.gold, candidate).result);
      expect(result.status).toBe('checked');
      expect(result.byteChange).toBe('changed');
      expect(result.differences).toEqual(pair.expected === 'preserved' ? [] : ['circumstance', 'modality']);
      const properties = arr(result.properties).map(value => obj(value));
      expect(properties.find(p => p.name === 'prose-preservation')!.status).toBe('notChecked');
      expect(obj(result.representationCoverage).knownFields).toBe(5);
      expect(properties.filter(p => p.name !== 'prose-preservation' && !['circumstance', 'modality'].includes(String(p.name))).every(p => p.status === 'pass')).toBe(true);
    }
    expect(fieldAt(fixture('confirm-r15').gold, 'data.modality.value')).toBe('could favor');
    expect(fieldAt(fixture('confirm-b76').gold, 'data.modality.value')).toBe('could favor');
    expect(fieldAt(fixture('confirm-n24').gold, 'data.modality.value')).toBe('often favor');
  });
});
