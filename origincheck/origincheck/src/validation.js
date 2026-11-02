import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

// Loads the newest *validated* evaluation report for a provider+version+content type.
// A report only counts if eval/run.js marked it validated:true (enough held-out data, separate tuning split).
export async function loadValidation(reportsDir, { contentType, providerName, providerVersion }) {
  let files = [];
  try { files = (await readdir(reportsDir)).filter((f) => f.endsWith('.json')); } catch { return null; }
  const reports = [];
  for (const f of files) {
    try { reports.push({ file: f, ...JSON.parse(await readFile(path.join(reportsDir, f), 'utf8')) }); } catch { /* skip malformed */ }
  }
  const match = reports
    .filter((r) => r.validated === true && r.contentType === contentType && r.provider?.name === providerName && r.provider?.version === providerVersion)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return match[0] ?? null;
}

// Piecewise-linear interpolation over monotone [score, probability] points from an isotonic fit.
export function calibrate(points, score) {
  if (!Array.isArray(points) || points.length < 2) return null;
  if (score <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x0, y0] = points[i - 1];
    if (score <= x1) return x1 === x0 ? y1 : y0 + ((y1 - y0) * (score - x0)) / (x1 - x0);
  }
  return points[points.length - 1][1];
}
