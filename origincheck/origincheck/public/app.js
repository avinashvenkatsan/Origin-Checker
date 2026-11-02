import { renderResult, renderError, esc } from './render.js';

const $ = (id) => document.getElementById(id);
let cfg = null;
let imageFile = null;
let timer = null;

function showTab(which) {
  for (const t of ['image', 'text']) {
    const sel = t === which;
    $(`tab-${t}`).setAttribute('aria-selected', String(sel));
    $(`tab-${t}`).tabIndex = sel ? 0 : -1;
    $(`panel-${t}`).hidden = !sel;
  }
  $('output').innerHTML = '';
}
$('tab-image').addEventListener('click', () => showTab('image'));
$('tab-text').addEventListener('click', () => showTab('text'));
for (const [k, other] of [['ArrowRight', 'text'], ['ArrowLeft', 'image']]) {
  document.querySelector('.tabs').addEventListener('keydown', (e) => { if (e.key === k) { showTab(other); $(`tab-${other}`).focus(); } });
}

function privacyLine(info) {
  if (!info?.available) return '';
  if (!info.dataSent) return '';
  const link = info.privacyUrl ? ` <a href="${esc(info.privacyUrl)}" rel="noopener noreferrer" target="_blank">Provider privacy policy</a>.` : '';
  return `${esc(info.dataSent)}${link} Your content is not used for training by OriginCheck.`;
}

function setProgress(on) {
  $('progress').hidden = !on;
  clearInterval(timer);
  if (on) {
    const start = Date.now();
    timer = setInterval(() => { $('progress-text').textContent = `Analyzing… ${Math.floor((Date.now() - start) / 1000)}s`; }, 1000);
  }
}

async function submit(url, init, buttons) {
  $('output').innerHTML = '';
  buttons.forEach((b) => (b.disabled = true));
  setProgress(true);
  try {
    const res = await fetch(url, init);
    const body = await res.json().catch(() => ({}));
    $('output').innerHTML = res.ok ? renderResult(body) : renderError(body.error || { state: 'error' });
  } catch {
    $('output').innerHTML = renderError({ state: 'service-unavailable', message: 'Could not reach the server. Check your connection and try again.' });
  } finally {
    setProgress(false);
    updateButtons();
    $('output').focus();
  }
}

// ---- image ----
function setImage(file) {
  $('image-error').textContent = '';
  if (imageFile) URL.revokeObjectURL($('image-preview-img').src);
  imageFile = null;
  if (file) {
    const allowed = cfg?.image?.allowedTypes ?? ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowed.includes(file.type)) { $('image-error').textContent = 'Unsupported file type. Use PNG, JPEG, or WebP.'; }
    else if (file.size > (cfg?.maxImageBytes ?? 8 * 1048576)) { $('image-error').textContent = `Image is larger than ${Math.round((cfg?.maxImageBytes ?? 8388608) / 1048576)} MB.`; }
    else { imageFile = file; $('image-preview-img').src = URL.createObjectURL(file); }
  }
  $('image-preview').hidden = !imageFile;
  $('image-empty').hidden = Boolean(imageFile);
  if (!imageFile) $('image-input').value = '';
  $('output').innerHTML = '';
  updateButtons();
}
$('image-input').addEventListener('change', (e) => setImage(e.target.files[0]));
$('image-remove').addEventListener('click', () => setImage(null));
$('image-submit').addEventListener('click', () =>
  submit('/api/analyze/image', { method: 'POST', headers: { 'Content-Type': imageFile.type }, body: imageFile }, [$('image-submit')]));

// ---- text ----
function counts() {
  const t = $('text-input').value.trim();
  return { chars: t.length, words: t ? t.split(/\s+/).length : 0 };
}
$('text-input').addEventListener('input', () => {
  const { chars, words } = counts();
  $('text-counts').textContent = `${words.toLocaleString()} words · ${chars.toLocaleString()} characters`;
  updateButtons();
});
$('text-submit').addEventListener('click', () =>
  submit('/api/analyze/text', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: $('text-input').value }) }, [$('text-submit')]));

function updateButtons() {
  const busy = !$('progress').hidden;
  $('image-submit').disabled = busy || !imageFile || !cfg?.image?.available;
  const { chars } = counts();
  const min = cfg?.text?.minChars ?? 0;
  $('text-submit').disabled = busy || !cfg?.text?.available || chars < min || chars > (cfg?.maxTextChars ?? 50000);
}

// ---- init ----
(async function init() {
  try {
    cfg = await (await fetch('/api/config')).json();
  } catch {
    $('config-banner').hidden = false;
    $('config-banner').innerHTML = renderError({ state: 'service-unavailable', message: 'Could not reach the server.' });
    return;
  }
  $('image-limits').textContent = `Maximum size ${Math.round(cfg.maxImageBytes / 1048576)} MB.`;
  $('text-help').textContent = cfg.text.available ? `Minimum ${cfg.text.minChars} characters (set by the detector). Maximum ${cfg.maxTextChars.toLocaleString()}.` : '';
  $('image-privacy').innerHTML = privacyLine(cfg.image);
  $('text-privacy').innerHTML = privacyLine(cfg.text);
  const msgs = [];
  if (!cfg.image.available) msgs.push('Image analysis unavailable: no detector is configured.');
  if (!cfg.text.available) msgs.push('Text analysis unavailable: no detector is configured.');
  if (cfg.image.demo || cfg.text.demo) msgs.push('DEMO MODE — results are not real analyses.');
  if (msgs.length) { $('config-banner').hidden = false; $('config-banner').setAttribute('role', 'status'); $('config-banner').innerHTML = msgs.map((m) => `<p>${esc(m)}</p>`).join(''); }
  updateButtons();
})();
