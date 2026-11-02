#!/usr/bin/env node
// Evaluation harness. Usage:
//   node --env-file=.env eval/run.js --type image --provider sightengine --manifest eval/datasets/image-manifest.csv
// Manifest CSV columns: path,label,split,source,generator,condition,language
//   label: ai | human     split: tune | heldout     (tune is used for thresholds/calibration; heldout for reported metrics)
// Nothing is fabricated: a report is marked validated:true only with enough held-out data in both classes.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createSightengine } from '../src/providers/sightengine.js';
import { createGptzero } from '../src/providers/gptzero.js';
import { sniffImage } from '../src/validate.js';
import { isotonic, chooseThresholds, metricsAt, calibrationReport, breakdown, reliabilityLevel, MIN_PER_CLASS_TO_VALIDATE } from './metrics.js';

export function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some((x) => x !== '')) rows.push(row); row = []; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

function arg(name, def) { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : def; }

async function main() {
  const type = arg('type'), providerId = arg('provider'), manifestPath = arg('manifest');
  const outDir = arg('out', 'eval/reports');
  const delayMs = parseInt(arg('delay-ms', '250'), 10);
  if (!['image', 'text'].includes(type) || !manifestPath) { console.error('Usage: --type image|text --provider <id> --manifest <csv>'); process.exit(2); }
  const provider = { sightengine: createSightengine, gptzero: createGptzero }[providerId]?.();
  if (!provider || provider.contentType !== type) { console.error('Unknown provider for this content type.'); process.exit(2); }
  if (!provider.isConfigured()) { console.error('Provider credentials are not configured; refusing to produce results.'); process.exit(2); }

  const manifest = parseCsv(await readFile(manifestPath, 'utf8'));
  const base = path.dirname(manifestPath);
  const scored = []; let version = 'unreported', failures = 0;
  for (const m of manifest) {
    if (!['ai', 'human'].includes(m.label) || !['tune', 'heldout'].includes(m.split)) { console.error(`Skipping row with bad label/split: ${m.path}`); failures++; continue; }
    try {
      const data = await readFile(path.resolve(base, m.path));
      const input = type === 'image' ? { buffer: data, mime: sniffImage(data) } : { text: data.toString('utf8') };
      const out = await provider.analyze(input);
      version = out.version;
      scored.push({ label: m.label === 'ai' ? 1 : 0, split: m.split, score: out.score, meta: { source: m.source, generator: m.generator, condition: m.condition, language: m.language } });
    } catch (e) { failures++; console.error(`Failed: ${m.path} (${e.kind || e.name})`); }
    await new Promise((r) => setTimeout(r, delayMs));
  }

  const tune = scored.filter((r) => r.split === 'tune');
  const held = scored.filter((r) => r.split === 'heldout');
  const count = (rs, l) => rs.filter((r) => r.label === l).length;
  const enough = Math.min(count(held, 1), count(held, 0)) >= MIN_PER_CLASS_TO_VALIDATE && Math.min(count(tune, 1), count(tune, 0)) >= MIN_PER_CLASS_TO_VALIDATE;
  const date = new Date().toISOString();
  const report = {
    version: `${type}-${providerId}-${date.slice(0, 10)}`, date, contentType: type,
    provider: { id: providerId, name: provider.name, version },
    validated: false,
    datasets: { tune: { n: tune.length, ai: count(tune, 1), human: count(tune, 0) }, heldout: { n: held.length, ai: count(held, 1), human: count(held, 0) }, manifest: manifestPath, failedRows: failures,
      note: 'Document dataset provenance, collection dates, generators, and licenses in eval/datasets/README.md. Verify no overlap between tune and held-out (and with the provider’s training data, where knowable).' },
  };
  if (!enough) {
    report.status = `Not yet measured: need at least ${MIN_PER_CLASS_TO_VALIDATE} AI and ${MIN_PER_CLASS_TO_VALIDATE} human samples in BOTH tune and heldout splits.`;
  } else {
    const thresholds = chooseThresholds(tune);
    const points = isotonic(tune);
    const m = metricsAt(held, thresholds);
    const cal = calibrationReport(held, points);
    report.thresholds = thresholds;
    report.calibration = { method: 'isotonic (fit on tune split)', points, heldout: cal };
    report.metrics = m;
    report.breakdown = breakdown(held, ['source', 'generator', 'condition', 'language'], thresholds);
    report.reliability = reliabilityLevel(m, cal);
    report.validated = true;
    report.caveat = 'Reliability level uses a documented heuristic (see docs/EVALUATION.md). Results apply only to datasets/conditions like those evaluated.';
  }
  await mkdir(outDir, { recursive: true });
  const file = path.join(outDir, `${report.version}.json`);
  await writeFile(file, JSON.stringify(report, null, 2));
  await writeFile(file.replace(/\.json$/, '.md'), toMarkdown(report));
  console.log(`Wrote ${file}\nvalidated=${report.validated}`);
}

const pct = (w) => (w && typeof w === 'object' && w.value != null ? `${(w.value * 100).toFixed(1)}% (95% CI ${(w.lo * 100).toFixed(1)}–${(w.hi * 100).toFixed(1)}, n=${w.n})` : 'Not yet measured');
export function toMarkdown(r) {
  let s = `# Evaluation report: ${r.version}\n\n- Provider: ${r.provider.name} (version: ${r.provider.version})\n- Date: ${r.date}\n- Validated: ${r.validated}\n- Datasets: tune ${JSON.stringify(r.datasets.tune)}, heldout ${JSON.stringify(r.datasets.heldout)}\n\n`;
  if (!r.validated) return s + `**${r.status}**\n`;
  const m = r.metrics;
  s += `## Held-out metrics (AI = positive)\n\nThresholds: human ≤ ${r.thresholds.human.toFixed(3)}, AI ≥ ${r.thresholds.ai.toFixed(3)}; scores between are "mixed" (abstain).\n\n- Precision: ${pct(m.precision)}\n- Recall: ${pct(m.recall)}\n- False-positive rate: ${pct(m.falsePositiveRate)}\n- False-negative rate: ${pct(m.falseNegativeRate)}\n- Abstain rate: ${pct(m.abstainRate)}\n- Calibration: ECE ${r.calibration.heldout.ece.toFixed(3)}, Brier ${r.calibration.heldout.brier.toFixed(3)}\n- Reliability: **${r.reliability.level}** — ${r.reliability.basis}\n\n## Breakdowns\n`;
  for (const [k, groups] of Object.entries(r.breakdown)) {
    s += `\n### By ${k}\n\n| group | n | AI detection rate | human false-positive rate |\n|---|---|---|---|\n`;
    for (const [g, v] of Object.entries(groups)) s += `| ${g} | ${v.n} | ${pct(v.aiDetectionRate)} | ${pct(v.humanFalsePositiveRate)} |\n`;
  }
  return s + `\n${r.caveat}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
