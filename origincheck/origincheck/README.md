# OriginCheck

A web app that gives an **estimate** of whether an image or a text sample was AI-generated. It is deliberately conservative: it never claims full accuracy, never shows an uncalibrated score as a probability, and returns **"Unable to assess reliably"** when it has no validated basis for a verdict.

## Stack (no existing repo was provided, so this is a fresh project)
- Node.js ≥ 20, **zero npm dependencies** (built-in `http`, `fetch`, `node:test`)
- `server.js` – entry point · `src/` – handler, validation, rate limiting, providers, provenance, verdict logic
- `public/` – accessible, responsive vanilla-JS frontend (`render.js` is pure and unit-tested)
- `eval/` – evaluation harness and versioned reports · `tests/` – 36 tests

## Run
```bash
cp .env.example .env        # fill in credentials
npm run start:env           # or export the variables and run: npm start
# open http://127.0.0.1:3000
npm test
```
Try the UI without credentials: `DEMO_MODE=true npm start` (every result is labelled **DEMO — not a real analysis**; demo mode is ignored when `NODE_ENV=production`).

## Providers (real, documented services)
| Content | Provider | Env vars |
|---|---|---|
| Image | Sightengine AI-generated image detection | `SIGHTENGINE_API_USER`, `SIGHTENGINE_API_SECRET` |
| Text | GPTZero text detection | `GPTZERO_API_KEY`, `GPTZERO_MIN_CHARS` |
| Provenance | `c2patool` (Content Authenticity Initiative) | `C2PATOOL_PATH` |

**Important:** the adapters were written from the providers' public documentation and are covered by tests that use a *mocked* `fetch`. They have **not been run against the live APIs** in this repository. Test with your own keys and confirm field names, the text minimum length (`GPTZERO_MIN_CHARS`, default 250 — verify), and supported formats against current docs. AVIF is disabled because Sightengine's AVIF support is not confirmed here.

With no provider configured and `NODE_ENV=production`, the API returns **503 "Analysis unavailable"**.

## How verdicts work
1. **Detector score** – the provider's raw 0–1 output. Always labelled as *not a probability*.
2. **Verdict** – derived only from thresholds stored in a *validated* evaluation report for that exact provider + model version + content type. No report → "Unable to assess reliably" (the raw score is still shown). Optional `ALLOW_UNVALIDATED_VERDICTS=true` shows GPTZero's own class label with reliability "low".
3. **Estimated probability** – shown only if the validated report contains an isotonic calibration fitted on a separate tuning split.
4. **Reliability** – read from the report (sample sizes, false-positive CI, calibration error); otherwise "low — Not yet measured".
5. **Provenance (C2PA)** – a separate evidence source. A *validly signed* credential declaring AI generation can yield an AI verdict on its own; conflicts with the detector produce "Mixed signals"; missing credentials never imply human-made. Without `c2patool` it reports "not-checked". Only C2PA is inspected (no EXIF heuristics).
6. Provider-reported low confidence → "Mixed signals".

## Accuracy: what has and has not been measured
**Nothing has been measured yet.** No datasets or evaluation reports ship with this repo; every metric is **Not yet measured**. See `docs/EVALUATION.md` to run an evaluation (`npm run eval:image`, `npm run eval:text`).

## Privacy & security
See `docs/PRIVACY.md`. Summary: no storage of submissions, no logging of content or secrets, credentials server-side only, strict size/type validation, per-client rate limiting, CSP and security headers, generic error messages.

## Known limitations
See `docs/LIMITATIONS.md`.
