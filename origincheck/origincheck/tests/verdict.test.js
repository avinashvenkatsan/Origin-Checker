import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResult, DISCLAIMER } from '../src/verdict.js';
import { calibrate } from '../src/validation.js';
import { parseC2paReport } from '../src/provenance.js';

const provider = { name: 'P' };
const validation = { version: 'v1', thresholds: { ai: 0.8, human: 0.2 }, reliability: { level: 'medium', basis: 'n=…' }, calibration: { points: [[0, 0], [0.5, 0.3], [1, 0.95]] } };
const run = (o) => buildResult({ contentType: 'image', provider, now: new Date('2026-01-01T00:00:00Z'), ...o });
const out = (score, extra = {}) => ({ score, version: '1', providerLabel: null, providerConfidence: null, ...extra });

test('no validation → unable to assess, low reliability, no probability, still shows raw score', () => {
  const r = run({ outcome: out(0.97), validation: null });
  assert.equal(r.verdictLabel, 'Unable to assess reliably');
  assert.equal(r.estimatedProbability, null);
  assert.equal(r.reliability.level, 'low');
  assert.equal(r.detector.score, 0.97);
  assert.equal(r.disclaimer, DISCLAIMER);
});
test('validated thresholds → ai / human / mixed', () => {
  assert.equal(run({ outcome: out(0.9), validation }).verdict, 'ai');
  assert.equal(run({ outcome: out(0.1), validation }).verdict, 'human');
  assert.equal(run({ outcome: out(0.5), validation }).verdict, 'mixed');
});
test('probability only with calibration; interpolates', () => {
  assert.equal(run({ outcome: out(0.5), validation }).estimatedProbability, 0.3);
  assert.equal(run({ outcome: out(0.9), validation: { ...validation, calibration: undefined } }).estimatedProbability, null);
  assert.equal(calibrate([[0, 0], [1, 1]], 0.25), 0.25);
});
test('provider low confidence → mixed (inconclusive)', () => {
  assert.equal(run({ outcome: out(0.95, { providerConfidence: 'low' }), validation }).verdict, 'mixed');
});
test('provider label is used only when explicitly allowed, reliability stays low', () => {
  const o = out(0.9, { providerLabel: 'ai' });
  assert.equal(run({ outcome: o, validation: null }).verdict, 'unable');
  const r = run({ outcome: o, validation: null, allowUnvalidatedVerdicts: true });
  assert.equal(r.verdict, 'ai'); assert.equal(r.reliability.level, 'low');
});
test('valid AI credential + human detector → mixed; credential alone → ai/high', () => {
  const prov = { status: 'found', valid: true, declaresAI: true, generator: 'Tool', note: '' };
  assert.equal(run({ outcome: out(0.05), validation, provenance: prov }).verdict, 'mixed');
  const r = run({ outcome: null, validation: null, provenance: prov });
  assert.equal(r.verdict, 'ai'); assert.equal(r.reliability.level, 'high');
});
test('missing credentials never imply human-made', () => {
  const r = run({ outcome: out(0.5), validation: null, provenance: { status: 'none-found', note: 'No Content Credentials found.' } });
  assert.equal(r.verdict, 'unable');
});
test('invalid credential is not treated as AI evidence', () => {
  const r = run({ outcome: out(0.5), validation: null, provenance: { status: 'found', valid: false, declaresAI: true, generator: 'T', note: '' } });
  assert.equal(r.verdict, 'unable');
});
test('demo results are flagged', () => {
  const r = run({ outcome: out(0.9), validation: null, demo: true });
  assert.equal(r.demo, true); assert.match(r.reliability.basis, /DEMO/);
});
test('parseC2paReport detects AI source type and validity', () => {
  const m = { active_manifest: 'a', validation_state: 'Valid', manifests: { a: { claim_generator_info: [{ name: 'GenTool' }], assertions: [{ label: 'c2pa.actions', data: { actions: [{ digitalSourceType: 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia' }] } }] } } };
  const r = parseC2paReport(JSON.stringify(m));
  assert.deepEqual([r.status, r.valid, r.declaresAI, r.generator], ['found', true, true, 'GenTool']);
  assert.equal(parseC2paReport('not json').status, 'error');
});
