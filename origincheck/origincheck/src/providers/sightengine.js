import { ProviderError } from '../errors.js';

// Adapter for Sightengine's AI-generated image detection ("genai" model).
// Docs: https://sightengine.com/docs/ai-generated-image-detection
// NOTE: written from the public docs; not exercised against the live API in this repo's tests
// (tests use a mocked fetch). Verify against a real key before relying on it.
export function createSightengine({ env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 20000 } = {}) {
  return {
    id: 'sightengine',
    name: 'Sightengine AI-generated image detection',
    contentType: 'image',
    supportsAvif: false,
    privacyUrl: 'https://sightengine.com/privacy',
    dataSent: 'The uploaded image file is sent to Sightengine for analysis.',
    isConfigured: () => Boolean(env.SIGHTENGINE_API_USER && env.SIGHTENGINE_API_SECRET),
    async analyze({ buffer, mime }) {
      const form = new FormData();
      form.append('media', new Blob([buffer], { type: mime }), 'upload');
      form.append('models', 'genai');
      form.append('api_user', env.SIGHTENGINE_API_USER);
      form.append('api_secret', env.SIGHTENGINE_API_SECRET);
      let res;
      try {
        res = await fetchImpl('https://api.sightengine.com/1.0/check.json', { method: 'POST', body: form, signal: AbortSignal.timeout(timeoutMs) });
      } catch {
        throw new ProviderError('unavailable');
      }
      if (res.status === 429) throw new ProviderError('rate_limited');
      if (res.status >= 500 || res.status === 401 || res.status === 403) throw new ProviderError('unavailable');
      if (!res.ok) throw new ProviderError('bad_response');
      let data;
      try { data = await res.json(); } catch { throw new ProviderError('bad_response'); }
      const score = data?.type?.ai_generated;
      if (data?.status !== 'success' || typeof score !== 'number' || score < 0 || score > 1) throw new ProviderError('bad_response');
      return { score, version: env.SIGHTENGINE_MODEL_VERSION || 'unreported', providerLabel: null, providerConfidence: null };
    },
  };
}
