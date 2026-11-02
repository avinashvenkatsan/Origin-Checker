import { HttpError } from './errors.js';

export function sniffImage(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.toString('latin1', 4, 8) === 'ftyp' && /^(avif|avis)$/.test(buf.toString('latin1', 8, 12))) return 'image/avif';
  return null;
}

export function validateImage({ headerType, buffer }, config, { supportsAvif = false } = {}) {
  const allowed = ['image/png', 'image/jpeg', 'image/webp', ...(supportsAvif ? ['image/avif'] : [])];
  if (!buffer || buffer.length === 0) throw new HttpError(400, 'empty_body', 'unsupported-input', 'No image was received.');
  if (buffer.length > config.maxImageBytes)
    throw new HttpError(413, 'too_large', 'unsupported-input', `Image is larger than the ${Math.round(config.maxImageBytes / 1048576)} MB limit.`);
  const declared = (headerType || '').split(';')[0].trim().toLowerCase();
  if (!allowed.includes(declared)) throw new HttpError(415, 'unsupported_type', 'unsupported-input', `Unsupported file type. Allowed: ${allowed.map((t) => t.replace('image/', '').toUpperCase()).join(', ')}.`);
  const sniffed = sniffImage(buffer);
  if (!sniffed || !allowed.includes(sniffed) || sniffed !== declared)
    throw new HttpError(415, 'type_mismatch', 'unsupported-input', 'The file contents do not match an allowed image type.');
  return sniffed;
}

export function countText(text) {
  const trimmed = text.trim();
  return { chars: trimmed.length, words: trimmed ? trimmed.split(/\s+/).length : 0 };
}

export function validateText(body, config, provider) {
  if (!body || typeof body.text !== 'string') throw new HttpError(400, 'bad_request', 'unsupported-input', 'Request must include a "text" string.');
  const text = body.text.trim();
  const counts = countText(text);
  if (counts.chars > config.maxTextChars)
    throw new HttpError(413, 'too_large', 'unsupported-input', `Text is longer than the ${config.maxTextChars.toLocaleString('en-US')} character limit.`);
  if (counts.chars < provider.minChars)
    throw new HttpError(422, 'insufficient_text', 'insufficient-text', 'Insufficient text to assess.', { minChars: provider.minChars, ...counts });
  return { text, ...counts };
}
