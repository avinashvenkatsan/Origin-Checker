import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHandler } from '../src/app.js';
import { createRateLimiter } from '../src/ratelimit.js';
import { ProviderError } from '../src/errors.js';
import { PNG, baseConfig } from './helpers.js';

const fake = (type, analyze, extra = {}) => ({ name: 'Fake', contentType: type, minChars: 50, supportsAvif: false, privacyUrl: 'https://x', dataSent: 'd', isConfigured: () => true, analyze, ...extra });
const noProv = async () => ({ status: 'not-checked', valid: null, declaresAI: false, generator: null, note: 'not configured' });

async function start(overrides = {}) {
  const handler = createHandler({
    config: { ...baseConfig, ...(overrides.config || {}) },
    providers: overrides.providers ?? { image: fake('image', async () => ({ score: 0.9, version: '1' })), text: fake('text', async () => ({ score: 0.9, version: '1' })) },
    checkProvenance: noProv,
    limiter: overrides.limiter ?? createRateLimiter({ limit: 100 }),
    reportsDir: '/nonexistent',
  });
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, close: () => new Promise((r) => server.close(r)) };
}
const postImage = (base, buf, type = 'image/png') => fetch(`${base}/api/analyze/image`, { method: 'POST', headers: { 'Content-Type': type }, body: buf });
const postText = (base, text) => fetch(`${base}/api/analyze/text`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });

test('image: success returns unable-to-assess when no validation exists, with score shown', async () => {
  const s = await start(); const res = await postImage(s.base, PNG); const j = await res.json();
  assert.equal(res.status, 200); assert.equal(j.verdictLabel, 'Unable to assess reliably'); assert.equal(j.detector.score, 0.9); assert.equal(j.estimatedProbability, null);
  await s.close();
});
test('image: unsupported type / mismatch / too large', async () => {
  const s = await start();
  assert.equal((await postImage(s.base, PNG, 'image/gif')).status, 415);
  assert.equal((await postImage(s.base, PNG, 'image/jpeg')).status, 415);
  const big = await postImage(s.base, Buffer.alloc(5000), 'image/png'); assert.equal(big.status, 413);
  assert.equal((await big.json()).error.state, 'unsupported-input');
  await s.close();
});
test('text: too short → insufficient text; ok text → 200', async () => {
  const s = await start();
  const short = await postText(s.base, 'hello'); const j = await short.json();
  assert.equal(short.status, 422); assert.equal(j.error.message, 'Insufficient text to assess.');
  assert.equal((await postText(s.base, 'word '.repeat(40))).status, 200);
  await s.close();
});
test('provider unavailable / rate limited map to states', async () => {
  const mk = (kind) => ({ image: fake('image', async () => { throw new ProviderError(kind); }), text: fake('text', async () => { throw new ProviderError(kind); }) });
  let s = await start({ providers: mk('unavailable') });
  let j = await (await postImage(s.base, PNG)).json(); assert.equal(j.error.state, 'service-unavailable'); await s.close();
  s = await start({ providers: mk('rate_limited') });
  const r = await postImage(s.base, PNG); assert.equal(r.status, 429); assert.equal((await r.json()).error.state, 'rate-limited'); await s.close();
});
test('per-client rate limiting returns 429 with Retry-After', async () => {
  const s = await start({ limiter: createRateLimiter({ limit: 1 }) });
  assert.equal((await postText(s.base, 'word '.repeat(40))).status, 200);
  const r = await postText(s.base, 'word '.repeat(40));
  assert.equal(r.status, 429); assert.ok(r.headers.get('retry-after'));
  await s.close();
});
test('no provider configured: unavailable in production-like config; DEMO labelled in demo mode', async () => {
  const none = { image: { isConfigured: () => false }, text: { isConfigured: () => false } };
  let s = await start({ providers: none });
  const r = await postImage(s.base, PNG); assert.equal(r.status, 503); assert.match((await r.json()).error.message, /Analysis unavailable/); await s.close();
  s = await start({ providers: none, config: { demoMode: true } });
  const d = await (await postImage(s.base, PNG)).json(); assert.equal(d.demo, true); assert.match(d.detector.provider, /DEMO/); await s.close();
});
test('config endpoint exposes no secrets; static files served; traversal blocked', async () => {
  const s = await start();
  const cfg = await (await fetch(`${s.base}/api/config`)).json();
  assert.equal(cfg.text.minChars, 50); assert.ok(!JSON.stringify(cfg).toLowerCase().includes('secret'));
  assert.equal((await fetch(`${s.base}/`)).status, 200);
  assert.equal((await fetch(`${s.base}/..%2Fpackage.json`)).status, 404);
  await s.close();
});
