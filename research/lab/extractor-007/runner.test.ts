import { describe, expect, test } from 'bun:test';
import { calibration, fixtures, preparation, runtimeFixture, sourcePacket, structuredMemory } from './runner';
import { adapters as firstLegacy } from '../extractor-006/adapters_01_03';
import { adapters as lastLegacy } from '../extractor-006/adapters_04_06';

describe('experimental boundary', () => {
  test('all six additions remain in both cohorts', () => {
    expect(calibration).toHaveLength(8);
    expect(fixtures).toHaveLength(18);
    expect(new Set(calibration.map(f => f.mechanism)).size).toBe(6);
    expect(new Set(fixtures.slice(8).map(f => f.mechanism)).size).toBe(6);
  });
  test('production adapter input excludes grading and future queries', () => {
    for (const fixture of fixtures) {
      const input = runtimeFixture(fixture);
      for (const key of ['gold', 'checks', 'rubric', 'question', 'note']) expect(Object.hasOwn(input, key)).toBe(false);
      const packet = sourcePacket(input);
      expect(Object.hasOwn(packet.caller, 'role')).toBe(false);
      expect(Object.hasOwn(packet.caller, 'pairId')).toBe(false);
      expect(Object.hasOwn(packet.caller, 'sourceStates')).toBe(false);
    }
  });
  test('plain preparation has no schema or competing output instructions', () => {
    for (const fixture of fixtures) {
      const plain = preparation(fixture, 'plain'), structured = preparation(fixture, 'structured');
      const prosePacket = JSON.parse(plain.messages[1]!.content), jsonPacket = JSON.parse(structured.messages[1]!.content);
      expect(plain.schema).toBeUndefined();
      expect(Object.hasOwn(prosePacket, 'output')).toBe(false);
      expect(prosePacket.assignment).not.toMatch(/JSON|schema|evidence path|sourceId|source ID|top-level|wrapper/i);
      const { output, ...semanticPacket } = jsonPacket;
      expect(semanticPacket).toEqual(prosePacket);
      expect(output.schema).toEqual(structured.schema);
      expect(JSON.stringify(prosePacket)).not.toContain(fixture.question);
      expect(Object.hasOwn(prosePacket, 'gold')).toBe(false);
    }
  });
  test('code-owned full-source references cannot leak through transformation reading', () => {
    const marker = 'FULL SOURCE MUST NOT BE DELIVERED';
    const candidate = { data: { subject: { state: 'known', value: 'Someone' } }, evidence: [{ path: 'subject', sourceId: 'x', quote: marker }], unknown: [] };
    const operation = { operation: 'inspection', result: { fields: candidate.data, evidence: candidate.evidence }, scope: 'annotations only' };
    const memory = structuredMemory(candidate, operation, '06');
    expect(JSON.stringify(memory)).not.toContain(marker);
    expect(memory.candidate).toEqual(candidate.data);
  });
  test('actual operation packets for every mechanism exclude generated full-source evidence', () => {
    const marker = ' GENERATED PROVENANCE SENTINEL MUST NOT REACH READER';
    for (const fixture of fixtures) {
      const f = structuredClone(fixture), c = structuredClone(f.gold);
      f.sources.forEach(s => { s.text += marker; });
      c.evidence.forEach(e => { e.quote = f.sources.find(s => s.id === e.sourceId)!.text; });
      const operation = [...firstLegacy, ...lastLegacy].find(a => a.mechanism === f.mechanism)!.operate(c, runtimeFixture(f));
      expect(JSON.stringify(structuredMemory(c, operation, f.mechanism))).not.toContain(marker);
      expect(c.evidence.every(e => e.quote.includes(marker))).toBe(true);
    }
  });
});
