// Minimal HTTP transport for this calibration only. No provider SDK or retries.
export type Message = { role: 'system' | 'user'; content: string };
export type Endpoint = {
  url: string;
  model: string;
  keyEnv?: string;
  settings: { temperature: number; top_p: number; max_tokens: number; reasoning_effort?: string };
};
export type Call = {
  id: string; startedAt: string; endpoint: string; elapsedMs: number; status: number | null;
  request: unknown; response: unknown; rawResponse: string | null; content: string | null; servedModel: string | null;
  usage: unknown; error: string | null;
};
export function scrub(value: string, secret?: string) {
  for (const part of secret ? [secret, ...secret.split('.')] : []) {
    if (part.length >= 8) value = value.replaceAll(part, '[REDACTED]');
  }
  return value;
}
export function validateEndpoint(endpoint: Endpoint) {
  const u = new URL(endpoint.url);
  if (u.username || u.password || u.search || u.hash || !u.pathname.endsWith('/v1/chat/completions')) throw new Error('Invalid endpoint URL');
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(u.hostname))) throw new Error('HTTPS required outside loopback');
  if (typeof endpoint.model !== 'string' || !endpoint.model.trim()) throw new Error('Missing model identity');
  const s = endpoint.settings;
  if (!Number.isFinite(s.temperature) || !Number.isFinite(s.top_p) || !Number.isSafeInteger(s.max_tokens) || s.max_tokens < 1 || s.max_tokens > 4096) throw new Error('Invalid calibration settings');
}
export function preflight(endpoint: Endpoint) {
  validateEndpoint(endpoint);
  const secret = endpoint.keyEnv ? process.env[endpoint.keyEnv] : undefined;
  if (endpoint.keyEnv && !secret) throw new Error('Configured endpoint credential is unavailable');
  return secret;
}
export async function complete(endpoint: Endpoint, messages: Message[], id: string): Promise<Call> {
  const secret = preflight(endpoint);
  const request = { model: endpoint.model, messages, ...endpoint.settings, stream: false };
  const call: Call = { id, startedAt: new Date().toISOString(), endpoint: endpoint.url, elapsedMs: 0,
    status: null, request, response: null, rawResponse: null, content: null, servedModel: null, usage: null, error: null };
  const start = performance.now();
  try {
    const response = await fetch(endpoint.url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(secret ? { Authorization: `Bearer ${secret}` } : {}) },
      body: JSON.stringify(request), signal: AbortSignal.timeout(120_000), redirect: 'error',
    });
    call.status = response.status;
    // The cap applies while streaming so an oversized body cannot exhaust memory.
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Empty HTTP body');
    const chunks: Uint8Array[] = []; let bytes = 0;
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 2_000_000) { await reader.cancel(); throw new Error('Response exceeded byte cap'); }
      chunks.push(chunk.value);
    }
    const joined = new Uint8Array(bytes); let offset = 0;
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
    const text = scrub(new TextDecoder().decode(joined), secret);
    call.rawResponse = text;
    if (!response.ok) {
      // Preserve a bounded sanitized API error, never headers or environment.
      call.error = `HTTP ${response.status}`;
      call.response = { errorBody: text.slice(0, 8000) };
    } else {
      const data = JSON.parse(text);
      call.response = data; call.servedModel = typeof data.model === 'string' ? data.model : null;
      call.usage = data.usage ?? null;
      const content = data.choices?.[0]?.message?.content;
      if (call.servedModel !== endpoint.model) call.error = 'Served model identity mismatch';
      else if (typeof content !== 'string' || !content.trim()) call.error = 'Missing completion content';
      else call.content = content;
    }
  } catch (error) {
    call.error = error instanceof Error && ['Response exceeded byte cap', 'Empty HTTP body'].includes(error.message)
      ? error.message : 'Transport or response parsing failure';
  }
  call.elapsedMs = Math.round(performance.now() - start);
  return JSON.parse(scrub(JSON.stringify(call), secret));
}
