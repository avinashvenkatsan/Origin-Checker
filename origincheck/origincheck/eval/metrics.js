// Pure evaluation math. "Positive" = AI-generated.

export function wilson(k, n, z = 1.96) {
  if (n === 0) return { value: null, lo: null, hi: null, n };
  const p = k / n, z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { value: p, lo: Math.max(0, center - half), hi: Math.min(1, center + half), n };
}

// Pool-adjacent-violators: monotone non-decreasing fit of label (0/1) vs score. Returns [[score, prob], ...].
export function isotonic(rows) {
  const s = [...rows].sort((a, b) => a.score - b.score).map((r) => ({ x: r.score, sum: r.label, w: 1, xmax: r.score }));
  const blocks = [];
  for (const b of s) {
    blocks.push({ ...b });
    while (blocks.length > 1) {
      const a = blocks[blocks.length - 2], c = blocks[blocks.length - 1];
      if (a.sum / a.w <= c.sum / c.w) break;
      blocks.splice(blocks.length - 2, 2, { x: a.x, xmax: c.xmax, sum: a.sum + c.sum, w: a.w + c.w });
    }
  }
  const pts = [];
  for (const b of blocks) {
    const y = b.sum / b.w;
    pts.push([b.x, y]);
    if (b.xmax !== b.x) pts.push([b.xmax, y]);
  }
  return pts;
}

export function chooseThresholds(tuneRows, { targetFpr = 0.01, targetFnrBelowHuman = 0.05 } = {}) {
  const humans = tuneRows.filter((r) => r.label === 0).map((r) => r.score).sort((a, b) => a - b);
  const ais = tuneRows.filter((r) => r.label === 1).map((r) => r.score).sort((a, b) => a - b);
  if (!humans.length || !ais.length) return null;
  const cand = [...new Set([...humans, ...ais, 1.0000001])].sort((a, b) => a - b);
  let ai = cand[cand.length - 1];
  for (const t of cand) {
    if (humans.filter((x) => x >= t).length / humans.length <= targetFpr) { ai = t; break; }
  }
  const idx = Math.floor(targetFnrBelowHuman * ais.length);
  let human = ais[Math.min(idx, ais.length - 1)];
  if (human > ai) human = ai;
  return { ai, human, targetFpr, targetFnrBelowHuman };
}

function confusion(rows, th) {
  let tp = 0, fp = 0, tn = 0, fn = 0, abstain = 0;
  for (const r of rows) {
    const aiCall = r.score >= th.ai, humanCall = r.score <= th.human;
    if (!aiCall && !humanCall) { abstain++; continue; }
    if (r.label === 1) aiCall ? tp++ : fn++;
    else aiCall ? fp++ : tn++;
  }
  return { tp, fp, tn, fn, abstain };
}

export function metricsAt(rows, th) {
  const c = confusion(rows, th);
  const nPos = rows.filter((r) => r.label === 1).length;
  const nNeg = rows.length - nPos;
  return {
    n: rows.length, nAI: nPos, nHuman: nNeg, ...c,
    precision: wilson(c.tp, c.tp + c.fp),
    recall: wilson(c.tp, nPos),                 // AI samples flagged as AI (abstentions count as misses)
    falsePositiveRate: wilson(c.fp, nNeg),      // human samples flagged as AI
    falseNegativeRate: wilson(nPos - c.tp, nPos),
    abstainRate: wilson(c.abstain, rows.length),
  };
}

export function calibrationReport(rows, points, bins = 10) {
  const p = (x) => {
    if (x <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) if (x <= points[i][0]) { const [x0, y0] = points[i - 1], [x1, y1] = points[i]; return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); }
    return points[points.length - 1][1];
  };
  const pr = rows.map((r) => ({ p: p(r.score), y: r.label }));
  const brier = pr.reduce((s, r) => s + (r.p - r.y) ** 2, 0) / Math.max(1, pr.length);
  const bucket = Array.from({ length: bins }, () => ({ n: 0, sp: 0, sy: 0 }));
  for (const r of pr) { const b = bucket[Math.min(bins - 1, Math.floor(r.p * bins))]; b.n++; b.sp += r.p; b.sy += r.y; }
  const table = bucket.map((b, i) => ({ bin: `${(i / bins).toFixed(1)}–${((i + 1) / bins).toFixed(1)}`, n: b.n, meanPredicted: b.n ? b.sp / b.n : null, observedRate: b.n ? b.sy / b.n : null }));
  const ece = bucket.reduce((s, b) => s + (b.n ? (b.n / Math.max(1, pr.length)) * Math.abs(b.sp / b.n - b.sy / b.n) : 0), 0);
  return { brier, ece, table };
}

// Per-group breakdown: for AI rows -> detection rate; for human rows -> false-positive rate.
export function breakdown(rows, keys, th) {
  const out = {};
  for (const key of keys) {
    const groups = {};
    for (const r of rows) { const g = r.meta[key] || 'unspecified'; (groups[g] ||= []).push(r); }
    out[key] = Object.fromEntries(Object.entries(groups).map(([g, rs]) => {
      const ai = rs.filter((r) => r.label === 1), hu = rs.filter((r) => r.label === 0);
      return [g, {
        n: rs.length,
        aiDetectionRate: ai.length ? wilson(ai.filter((r) => r.score >= th.ai).length, ai.length) : 'Not yet measured',
        humanFalsePositiveRate: hu.length ? wilson(hu.filter((r) => r.score >= th.ai).length, hu.length) : 'Not yet measured',
      }];
    }));
  }
  return out;
}

export const MIN_PER_CLASS_TO_VALIDATE = 100;

export function reliabilityLevel(m, cal) {
  const fprHi = m.falsePositiveRate.hi, n = Math.min(m.nAI, m.nHuman);
  if (n >= 300 && fprHi != null && fprHi <= 0.05 && cal.ece <= 0.05) return { level: 'high', basis: `Held-out n=${m.nAI} AI / ${m.nHuman} human; false-positive rate 95% CI upper bound ${(fprHi * 100).toFixed(1)}%; ECE ${cal.ece.toFixed(3)}.` };
  if (n >= MIN_PER_CLASS_TO_VALIDATE && fprHi != null && fprHi <= 0.1) return { level: 'medium', basis: `Held-out n=${m.nAI} AI / ${m.nHuman} human; false-positive rate 95% CI upper bound ${(fprHi * 100).toFixed(1)}%; ECE ${cal.ece.toFixed(3)}.` };
  return { level: 'low', basis: `Held-out n=${m.nAI} AI / ${m.nHuman} human; false-positive rate 95% CI upper bound ${fprHi == null ? 'n/a' : (fprHi * 100).toFixed(1) + '%'}.` };
}
