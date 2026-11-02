import test from 'node:test';
import assert from 'node:assert/strict';
import { wilson, isotonic, chooseThresholds, metricsAt } from '../eval/metrics.js';
import { parseCsv } from '../eval/run.js';

test('wilson interval', () => {
  const w = wilson(5, 100); assert.ok(w.lo < 0.05 && w.hi > 0.05 && w.lo > 0.01);
  assert.equal(wilson(0, 0).value, null);
});
test('isotonic is monotone', () => {
  const rows = [[0.1, 0], [0.2, 1], [0.3, 0], [0.8, 1], [0.9, 1], [0.7, 0]].map(([score, label]) => ({ score, label }));
  const pts = isotonic(rows);
  for (let i = 1; i < pts.length; i++) assert.ok(pts[i][1] >= pts[i - 1][1]);
});
test('thresholds & metrics on separable data', () => {
  const rows = [...Array(50).keys()].flatMap((i) => [{ score: i / 200, label: 0 }, { score: 0.6 + i / 130, label: 1 }]);
  const th = chooseThresholds(rows); const m = metricsAt(rows, th);
  assert.equal(m.fp, 0); assert.ok(m.recall.value > 0.9);
});
test('csv parser handles quotes', () => {
  assert.deepEqual(parseCsv('a,b\n"x,1",2\n'), [{ a: 'x,1', b: '2' }]);
});
