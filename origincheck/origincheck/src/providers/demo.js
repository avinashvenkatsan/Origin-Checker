import { createHash } from 'node:crypto';

// DEMO ONLY. Produces a deterministic pseudo-score from a hash. It is NOT a detector.
export function createDemoProvider(contentType) {
  return {
    id: 'demo',
    name: 'DEMO — not a real analysis',
    contentType,
    minChars: 20,
    supportsAvif: false,
    privacyUrl: null,
    dataSent: 'Demo mode: nothing is sent to any external provider.',
    isConfigured: () => true,
    async analyze(input) {
      const h = createHash('sha256').update(input.buffer || input.text).digest();
      return { score: h[0] / 255, version: 'demo', providerLabel: null, providerConfidence: null };
    },
  };
}
