export function loadConfig(env = process.env) {
  const int = (k, d) => {
    const v = parseInt(env[k] ?? '', 10);
    return Number.isFinite(v) && v > 0 ? v : d;
  };
  const nodeEnv = env.NODE_ENV || 'development';
  return {
    port: int('PORT', 3000),
    host: env.HOST || '127.0.0.1',
    nodeEnv,
    isProduction: nodeEnv === 'production',
    demoMode: env.DEMO_MODE === 'true' && nodeEnv !== 'production',
    trustProxy: env.TRUST_PROXY === 'true',
    rateLimitPerMinute: int('RATE_LIMIT_PER_MINUTE', 20),
    maxImageBytes: int('MAX_IMAGE_BYTES', 8 * 1024 * 1024),
    maxTextChars: int('MAX_TEXT_CHARS', 50000),
    c2patoolPath: env.C2PATOOL_PATH || '',
    allowUnvalidatedVerdicts: env.ALLOW_UNVALIDATED_VERDICTS === 'true',
  };
}
