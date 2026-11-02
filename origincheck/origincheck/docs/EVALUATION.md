# Evaluation

Image and text detectors are evaluated **separately**. Nothing is reported until `eval/run.js` has actually been run; until then every metric is **Not yet measured**.

## Steps
1. Build datasets under `eval/datasets/` and document them in its README (provenance, size, dates, generators, licenses, limitations).
2. Write a manifest CSV (`path,label,split,source,generator,condition,language`). Use `split=tune` for threshold/calibration fitting and `split=heldout` for reported metrics. Keep them disjoint (no duplicates, near-duplicates, shared prompts, or shared authors).
3. Include multiple generators, multiple human sources, and edited / compressed / paraphrased / translated / mixed-source conditions (via `condition`).
4. Run with credentials set: `node --env-file=.env eval/run.js --type image --provider sightengine --manifest eval/datasets/image-manifest.csv`
5. Reports are written to `eval/reports/<type>-<provider>-<date>.json` (+ `.md`). Commit them to keep a versioned history; compare reports when a provider version or threshold changes.

## What the report contains
Precision, recall, false-positive rate, false-negative rate, abstain rate (each with Wilson 95% CI and n), isotonic calibration, ECE and Brier score on held-out data, and breakdowns by `source`, `generator`, `condition`, `language`.

## When is a report "validated"?
Only if each of tune and heldout has ≥ 100 AI and ≥ 100 human samples. Only validated reports affect results shown to users (thresholds, calibration, reliability), and only when provider name **and model version** match. If a provider doesn't report a version, it is stored as `unreported` — re-evaluate whenever you suspect the provider changed.

## Heuristics you should review
- Thresholds: AI ≥ the lowest score keeping tune false-positive rate ≤ 1%; human ≤ the 5th percentile of AI tune scores; between = "mixed".
- Reliability: *high* if ≥ 300 per class, FPR CI upper bound ≤ 5% and ECE ≤ 0.05; *medium* if ≥ 100 per class and FPR CI upper ≤ 10%; otherwise *low*. These cut-offs are judgment calls, not standards — adjust to your risk tolerance.
- Reported performance applies only to data like what was evaluated; real-world accuracy can be lower.
