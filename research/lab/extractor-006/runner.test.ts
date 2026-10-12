import { expect, test } from 'bun:test';
import { decode, fixtures, preparation, sourcePacket, verifyReview } from './runner.ts';
import { preflight } from './transport.ts';

test('all eight source references decode, map and meet their closed-field expectations', () => {
  expect(fixtures).toHaveLength(8);
  expect(new Set(fixtures.map(f => f.mechanism)).size).toBe(6);
  for (const f of fixtures) {
    const decoded = decode(f, JSON.stringify(f.gold));
    expect(decoded.operationError).toBeNull();
    expect(decoded.checks.every(c => c.pass)).toBe(true);
  }
});
test('preparation excludes future questions and grading, with equal source exposure', () => {
  for (const f of fixtures) {
    const structured = JSON.parse(preparation(f, 'structured')[1].content);
    const plain = JSON.parse(preparation(f, 'plain')[1].content);
    for (const packet of [structured, plain]) {
      for (const key of ['question', 'gold', 'checks', 'rubric', 'note']) expect(packet).not.toHaveProperty(key);
      expect(packet.sources).toEqual(f.sources);
      expect(packet.caller).toEqual(sourcePacket(f).caller);
      if (f.mechanism === '06') {
        for (const key of ['pairId', 'role', 'provenancePolicy']) expect(packet.caller).not.toHaveProperty(key);
        for (const source of packet.sources) expect(source.id).not.toMatch(/old|candidate|modality/);
      }
    }
    if (['01', '03', '05'].includes(f.mechanism)) expect(sourcePacket(f)).not.toHaveProperty('preparationTask');
    expect(structured.preparationContract).toBe(plain.preparationContract);
  }
});
test('approval cannot omit actual reviewed artifacts', () => {
  expect(() => verifyReview({ accepted: true })).toThrow();
  expect(() => verifyReview({ accepted: true, hashes: {} })).toThrow();
  expect(() => verifyReview({ accepted: true, hashes: { 'unrelated.md': 'a'.repeat(64) } })).toThrow();
});
test('missing credential fails before any dispatch can be recorded', () => {
  expect(() => preflight({ url: 'https://example.test/v1/chat/completions', model: 'fixture-model',
    keyEnv: 'CIRCADIAN_CALIBRATION_NONEXISTENT_TEST_KEY', settings: { temperature: 0.3, top_p: 0.95, max_tokens: 2048 } })).toThrow('credential');
});
