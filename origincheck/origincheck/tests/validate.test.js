import test from 'node:test';
import assert from 'node:assert/strict';
import { validateImage, validateText, sniffImage } from '../src/validate.js';
import { PNG, JPEG, WEBP, baseConfig } from './helpers.js';

test('accepts PNG/JPEG/WebP with matching header', () => {
  assert.equal(validateImage({ headerType: 'image/png', buffer: PNG }, baseConfig), 'image/png');
  assert.equal(validateImage({ headerType: 'image/jpeg', buffer: JPEG }, baseConfig), 'image/jpeg');
  assert.equal(validateImage({ headerType: 'image/webp', buffer: WEBP }, baseConfig), 'image/webp');
});
test('rejects unsupported type, mismatch, empty, oversize', () => {
  assert.throws(() => validateImage({ headerType: 'image/svg+xml', buffer: PNG }, baseConfig), { code: 'unsupported_type' });
  assert.throws(() => validateImage({ headerType: 'image/png', buffer: JPEG }, baseConfig), { code: 'type_mismatch' });
  assert.throws(() => validateImage({ headerType: 'image/png', buffer: Buffer.alloc(0) }, baseConfig), { code: 'empty_body' });
  assert.throws(() => validateImage({ headerType: 'image/png', buffer: Buffer.concat([PNG, Buffer.alloc(2000)]) }, baseConfig), { code: 'too_large' });
});
test('AVIF only when provider supports it', () => {
  const avif = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypavif'), Buffer.alloc(16)]);
  assert.equal(sniffImage(avif), 'image/avif');
  assert.throws(() => validateImage({ headerType: 'image/avif', buffer: avif }, baseConfig, { supportsAvif: false }), { code: 'unsupported_type' });
  assert.equal(validateImage({ headerType: 'image/avif', buffer: avif }, baseConfig, { supportsAvif: true }), 'image/avif');
});
test('text: below provider minimum returns insufficient text', () => {
  assert.throws(() => validateText({ text: 'short' }, baseConfig, { minChars: 250 }), (e) => e.code === 'insufficient_text' && e.message === 'Insufficient text to assess.');
  assert.throws(() => validateText({ text: 5 }, baseConfig, { minChars: 10 }), { code: 'bad_request' });
  assert.throws(() => validateText({ text: 'x'.repeat(6000) }, baseConfig, { minChars: 10 }), { code: 'too_large' });
  assert.equal(validateText({ text: '  ' + 'word '.repeat(60) }, baseConfig, { minChars: 250 }).words, 60);
});
