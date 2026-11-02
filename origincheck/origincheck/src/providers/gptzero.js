import { ProviderError } from '../errors.js';

// Adapter for GPTZero's text detection API. Docs: https://gptzero.me/docs
// NOTE: written from the public docs; not exercised against the live API here (tests use a mocked fetch).
// Verify field names, minimum length, and supported languages against current docs with a real key.
export function createGptzero({ env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 30000 } = {}) {
  const minChars = parseInt(env.GPTZERO_MIN_CHARS || '250', 10) || 250;
  return {
    id: 'gptzero',
    name: 'GPTZero text detection',
    contentType: 'text',
    minChars,
    privacyUrl: 'https://gptzero.me/privacy-policy',
    dataSent: 'The text you paste is sent to GPTZero for analysis.',
    isConfigured: () => Boolean(env.GPTZERO_API_KEY),
    async analyze({ text }) {
      let res;
      try {
        res = await fetchImpl('https://api.gptzero.me/v2/predict/text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': env.GPTZERO_API_KEY, Accept: 'application/json' },
          body: JSON.stringify({ document: text }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        throw new ProviderError('unavailable');
      }
      if (res.status === 429) throw new ProviderError('rate_limited');
      if (res.status >= 500 || res.status === 401 || res.status === 403) throw new ProviderError('unavailable');
      if (res.status === 400 || res.status === 422) throw new ProviderError('unsupported');
      if (!res.ok) throw new ProviderError('bad_response');
      let data;
      try { data = await res.json(); } catch { throw new ProviderError('bad_response'); }
      const doc = data?.documents?.[0];
      const probs = doc?.class_probabilities;
      const score = typeof probs?.ai === 'number' ? probs.ai : doc?.completely_generated_prob;
      if (typeof score !== 'number' || score < 0 || score > 1) throw new ProviderError('bad_response');
      const label = ['ai', 'human', 'mixed'].includes(doc.predicted_class) ? doc.predicted_class : null;
      const conf = ['low', 'medium', 'high'].includes(doc.confidence_category) ? doc.confidence_category : null;
      return { score, version: String(data.version ?? doc.version ?? 'unreported'), providerLabel: label, providerConfidence: conf };
    },
  };
}
