import test from 'node:test';
import assert from 'node:assert/strict';
import { createSightengine } from '../src/providers/sightengine.js';
import { createGptzero } from '../src/providers/gptzero.js';
import { PNG, okFetch } from './helpers.js';

const seEnv = { SIGHTENGINE_API_USER: 'u', SIGHTENGINE_API_SECRET: 's' };
const gzEnv = { GPTZERO_API_KEY: 'k' };

test('providers report unconfigured without credentials', () => {
  assert.equal(createSightengine({ env: {} }).isConfigured(), false);
  assert.equal(createGptzero({ env: {} }).isConfigured(), false);
});
test('sightengine parses score', async () => {
  const p = createSightengine({ env: seEnv, fetchImpl: okFetch({ status: 'success', type: { ai_generated: 0.91 } }) });
  const r = await p.analyze({ buffer: PNG, mime: 'image/png' });
  assert.equal(r.score, 0.91);
});
test('sightengine error mapping', async () => {
  const run = (f) => createSightengine({ env: seEnv, fetchImpl: f }).analyze({ buffer: PNG, mime: 'image/png' });
  await assert.rejects(run(okFetch({}, 429)), { kind: 'rate_limited' });
  await assert.rejects(run(okFetch({}, 503)), { kind: 'unavailable' });
  await assert.rejects(run(async () => { throw new Error('net'); }), { kind: 'unavailable' });
  await assert.rejects(run(okFetch({ status: 'success', type: {} })), { kind: 'bad_response' });
  await assert.rejects(run(okFetch({ status: 'success', type: { ai_generated: 7 } })), { kind: 'bad_response' });
});
test('provider errors never leak secrets', async () => {
  const p = createSightengine({ env: seEnv, fetchImpl: async () => { throw new Error('boom s'); } });
  await assert.rejects(p.analyze({ buffer: PNG, mime: 'image/png' }), (e) => !/s$|secret/.test(e.message) && e.message === 'Provider error');
});
test('gptzero parses class probabilities and confidence', async () => {
  const body = { version: '2024-x', documents: [{ class_probabilities: { ai: 0.8, human: 0.1, mixed: 0.1 }, predicted_class: 'ai', confidence_category: 'low' }] };
  const r = await createGptzero({ env: gzEnv, fetchImpl: okFetch(body) }).analyze({ text: 'x' });
  assert.deepEqual([r.score, r.providerLabel, r.providerConfidence, r.version], [0.8, 'ai', 'low', '2024-x']);
});
test('gptzero errors', async () => {
  const run = (f) => createGptzero({ env: gzEnv, fetchImpl: f }).analyze({ text: 'x' });
  await assert.rejects(run(okFetch({}, 429)), { kind: 'rate_limited' });
  await assert.rejects(run(okFetch({}, 422)), { kind: 'unsupported' });
  await assert.rejects(run(okFetch({ documents: [] })), { kind: 'bad_response' });
});
test('gptzero min length is configurable', () => {
  assert.equal(createGptzero({ env: { ...gzEnv, GPTZERO_MIN_CHARS: '400' } }).minChars, 400);
});
