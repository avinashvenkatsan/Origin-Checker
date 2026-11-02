import test from 'node:test';
import assert from 'node:assert/strict';
import { renderResult, renderError } from '../public/render.js';
import { buildResult } from '../src/verdict.js';

const base = buildResult({ contentType: 'text', provider: { name: 'Prov <b>' }, outcome: { score: 0.5, version: '9', providerLabel: null, providerConfidence: null }, validation: null, now: new Date('2026-01-01T00:00:00Z') });

test('result shows all required fields and the disclaimer', () => {
  const html = renderResult(base);
  for (const s of ['Unable to assess reliably', 'This is an estimate, not proof of how the content was made.', 'Detector score', '0.500', 'Estimated probability:</strong> Not shown', 'Reliability: low', 'Signals used', 'model version: 9', 'Key limitations', '2026-01-01T00:00:00.000Z']) assert.ok(html.includes(s), s);
});
test('escapes provider-controlled text', () => {
  assert.ok(!renderResult(base).includes('<b>'));
});
test('demo banner and probability render', () => {
  const html = renderResult({ ...base, demo: true, estimatedProbability: 0.42 });
  assert.ok(html.includes('DEMO — not a real analysis')); assert.ok(html.includes('42.0%'));
});
test('error states render titles', () => {
  assert.match(renderError({ state: 'rate-limited', message: 'm' }), /Rate limited/);
  assert.match(renderError({ state: 'insufficient-text', message: 'Insufficient text to assess.' }), /Insufficient text/);
  assert.match(renderError({ state: 'service-unavailable', message: 'x' }), /Analysis unavailable/);
  assert.match(renderError({ state: 'unsupported-input', message: 'x' }), /Unsupported input/);
});
