// Pure rendering helpers (no DOM access) so they can be unit-tested in Node.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const TONE = { ai: 'tone-ai', human: 'tone-human', mixed: 'tone-mixed', unable: 'tone-unable' };

export function renderResult(r) {
  const fmtTime = (() => { try { return new Date(r.timestamp).toLocaleString(); } catch { return r.timestamp; } })();
  const score = r.detector.score == null ? 'Not available' : r.detector.score.toFixed(3);
  const prob = r.estimatedProbability == null
    ? `<p><strong>Estimated probability:</strong> Not shown.</p><p class="muted">${esc(r.probabilityNote)}</p>`
    : `<p><strong>Estimated probability of AI generation:</strong> ${(r.estimatedProbability * 100).toFixed(1)}%</p><p class="muted">${esc(r.probabilityNote)}</p>`;
  const prov = r.provenance ? `<p><strong>Provenance (C2PA):</strong> ${esc(r.provenance.status)} — ${esc(r.provenance.note)}</p>` : '';
  return `
<article class="result ${TONE[r.verdict] || ''}" aria-labelledby="verdict-h">
  ${r.demo ? '<p class="demo-banner" role="alert">DEMO — not a real analysis</p>' : ''}
  <h2 id="verdict-h">${esc(r.verdictLabel)}</h2>
  <p class="notice">${esc(r.disclaimer)}</p>
  <h3>Detector score</h3>
  <p><strong>${esc(score)}</strong></p>
  <p class="muted">${esc(r.detector.scoreMeaning)}</p>
  <h3>Estimated likelihood</h3>
  ${prob}
  <h3>Reliability: ${esc(r.reliability.level)}</h3>
  <p class="muted">${esc(r.reliability.basis)}</p>
  <h3>Signals used</h3>
  <ul>${r.signals.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
  ${prov}
  <h3>Detector</h3>
  <p>${esc(r.detector.provider)}${r.detector.version ? `, model version: ${esc(r.detector.version)}` : ''}</p>
  <h3>Key limitations</h3>
  <ul>${r.limitations.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
  <p class="muted">Analyzed: <time datetime="${esc(r.timestamp)}">${esc(fmtTime)}</time></p>
</article>`;
}

const ERROR_TITLES = {
  'unsupported-input': 'Unsupported input',
  'insufficient-text': 'Insufficient text to assess',
  'rate-limited': 'Rate limited',
  'service-unavailable': 'Analysis unavailable',
  error: 'Something went wrong',
};

export function renderError(err) {
  const state = err?.state || 'error';
  return `<div class="state state-${esc(state)}" role="alert"><h2>${esc(ERROR_TITLES[state] || ERROR_TITLES.error)}</h2><p>${esc(err?.message || 'Something went wrong.')}</p></div>`;
}
