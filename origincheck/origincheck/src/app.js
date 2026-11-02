import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError, ProviderError } from './errors.js';
import { validateImage, validateText } from './validate.js';
import { buildResult } from './verdict.js';
import { loadValidation } from './validation.js';
import { createDemoProvider } from './providers/demo.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' blob:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
}

function sendJson(res, status, body, headers = {}) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(data), ...headers });
  res.end(data);
}

async function readBody(req, max) {
  const declared = parseInt(req.headers['content-length'] || '0', 10);
  if (declared > max) throw new HttpError(413, 'too_large', 'unsupported-input', 'The upload is too large.');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) throw new HttpError(413, 'too_large', 'unsupported-input', 'The upload is too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function clientKey(req, config) {
  if (config.trustProxy) {
    const xff = req.headers['x-forwarded-for'];
    if (xff) return String(xff).split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

export function createHandler({ config, providers, checkProvenance, limiter, reportsDir = path.join(ROOT, 'eval', 'reports'), now = () => new Date() }) {
  function pickProvider(type) {
    const p = providers[type];
    if (p?.isConfigured()) return { provider: p, demo: false };
    if (config.demoMode) return { provider: createDemoProvider(type), demo: true };
    throw new HttpError(503, 'analysis_unavailable', 'service-unavailable', 'Analysis unavailable: no detector is configured on this server.');
  }

  function publicConfig() {
    const info = (type) => {
      const p = providers[type];
      const configured = Boolean(p?.isConfigured());
      return {
        available: configured || config.demoMode,
        demo: !configured && config.demoMode,
        provider: configured ? p.name : config.demoMode ? 'DEMO — not a real analysis' : null,
        dataSent: configured ? p.dataSent : null,
        privacyUrl: configured ? p.privacyUrl : null,
        ...(type === 'text' ? { minChars: configured ? p.minChars : 20 } : { allowedTypes: ['image/png', 'image/jpeg', 'image/webp', ...(configured && p.supportsAvif ? ['image/avif'] : [])] }),
      };
    };
    return { maxImageBytes: config.maxImageBytes, maxTextChars: config.maxTextChars, image: info('image'), text: info('text') };
  }

  async function finish({ type, provider, demo, input, provenance }) {
    let outcome = null;
    try {
      outcome = await provider.analyze(input);
    } catch (e) {
      if (!(e instanceof ProviderError)) throw e;
      const provenanceUseful = provenance?.status === 'found' && provenance.valid && provenance.declaresAI;
      if (!provenanceUseful) {
        if (e.kind === 'rate_limited') throw new HttpError(429, 'provider_rate_limited', 'rate-limited', 'The analysis service is busy. Please try again shortly.');
        if (e.kind === 'unsupported') throw new HttpError(422, 'unsupported_by_provider', 'unsupported-input', 'The detector could not process this input.');
        throw new HttpError(503, 'provider_unavailable', 'service-unavailable', 'The analysis service is currently unavailable. Please try again later.');
      }
    }
    const validation = outcome && !demo
      ? await loadValidation(reportsDir, { contentType: type, providerName: provider.name, providerVersion: outcome.version })
      : null;
    return buildResult({ contentType: type, provider, outcome, provenance, validation, allowUnvalidatedVerdicts: config.allowUnvalidatedVerdicts, demo, now: now() });
  }

  async function route(req, res, url) {
    if (req.method === 'GET' && url.pathname === '/api/config') return sendJson(res, 200, publicConfig());

    if (req.method === 'POST' && (url.pathname === '/api/analyze/image' || url.pathname === '/api/analyze/text')) {
      const rl = limiter.check(clientKey(req, config));
      if (!rl.allowed) throw new HttpError(429, 'rate_limited', 'rate-limited', 'Too many requests. Please wait and try again.', { retryAfterSec: rl.retryAfterSec });

      if (url.pathname.endsWith('/image')) {
        const { provider, demo } = pickProvider('image');
        const buffer = await readBody(req, config.maxImageBytes);
        const mime = validateImage({ headerType: req.headers['content-type'], buffer }, config, provider);
        const provenance = await checkProvenance(buffer, mime, config);
        return sendJson(res, 200, await finish({ type: 'image', provider, demo, input: { buffer, mime }, provenance }));
      }
      const { provider, demo } = pickProvider('text');
      const raw = await readBody(req, config.maxTextChars * 4 + 1024); // UTF-8 + JSON overhead
      let body;
      try { body = JSON.parse(raw.toString('utf8')); } catch { throw new HttpError(400, 'bad_json', 'unsupported-input', 'Request body must be JSON.'); }
      const { text } = validateText(body, config, provider);
      return sendJson(res, 200, await finish({ type: 'text', provider, demo, input: { text } }));
    }

    if (req.method === 'GET') {
      const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      const file = path.resolve(PUBLIC_DIR, rel);
      if (!file.startsWith(PUBLIC_DIR + path.sep) || !MIME[path.extname(file)]) throw new HttpError(404, 'not_found', 'error', 'Not found.');
      try {
        const data = await readFile(file);
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] });
        return res.end(data);
      } catch { throw new HttpError(404, 'not_found', 'error', 'Not found.'); }
    }
    throw new HttpError(404, 'not_found', 'error', 'Not found.');
  }

  return async (req, res) => {
    securityHeaders(res);
    try {
      await route(req, res, new URL(req.url, 'http://localhost'));
    } catch (e) {
      if (e instanceof HttpError) {
        const headers = { Connection: 'close' };
        if (e.extra.retryAfterSec) headers['Retry-After'] = String(e.extra.retryAfterSec);
        return sendJson(res, e.status, { error: { code: e.code, state: e.state, message: e.message, ...e.extra } }, headers);
      }
      console.error('Unhandled error:', e?.name); // never log request content or secrets
      sendJson(res, 500, { error: { code: 'internal', state: 'service-unavailable', message: 'Something went wrong. Please try again later.' } });
    }
  };
}
