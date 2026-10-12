import { describe, expect, test } from 'bun:test';
import { scrub, validateEndpoint, type Endpoint } from './transport.ts';
const valid: Endpoint = { url: 'http://127.0.0.1:10240/v1/chat/completions', model: 'fixture-model',
  settings: { temperature: 0.3, top_p: 0.95, max_tokens: 2048 } };
describe('calibration transport boundaries', () => {
  test('redacts both complete bearer values and reflected credential components', () => {
    const secret = 'wk-fixture-token.ws-fixture-secret';
    expect(scrub(`Bearer ${secret}; token wk-fixture-token; secret ws-fixture-secret`, secret))
      .toBe('Bearer [REDACTED]; token [REDACTED]; secret [REDACTED]');
    expect(scrub('ordinary evidence text')).toBe('ordinary evidence text');
  });
  test('refuses credentials in URL, remote plaintext and excess output allocations', () => {
    expect(() => validateEndpoint(valid)).not.toThrow();
    for (const url of ['https://user:pass@example.test/v1/chat/completions',
      'http://example.test/v1/chat/completions', 'https://example.test/v1/chat/completions?key=secret'])
      expect(() => validateEndpoint({ ...valid, url })).toThrow();
    expect(() => validateEndpoint({ ...valid, settings: { ...valid.settings, max_tokens: 100000 } })).toThrow();
  });
});
