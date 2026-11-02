import { calibrate } from './validation.js';

export const VERDICTS = {
  ai: 'Signals suggest AI-generated',
  human: 'Signals suggest human-created',
  mixed: 'Mixed signals',
  unable: 'Unable to assess reliably',
};
export const DISCLAIMER = 'This is an estimate, not proof of how the content was made.';

const LIMITS = {
  image: [
    'Cropping, screenshots, resizing, compression, and editing can change detector results.',
    'New or unfamiliar image generators may not be recognised.',
    'Missing provenance metadata does not mean an image is human-made.',
  ],
  text: [
    'Mixed human/AI writing, heavy editing, translation, and paraphrasing can change results.',
    'Unfamiliar models and some writing styles or languages may be misjudged.',
    'This result says nothing about who wrote the text and must not be used to accuse anyone of misconduct.',
  ],
};

export function buildResult({ contentType, provider, outcome, provenance, validation, allowUnvalidatedVerdicts = false, demo = false, now = new Date() }) {
  const signals = [];
  let detectorVerdict = null;
  let estimatedProbability = null;
  let probabilityNote = 'Not shown: this detector has no calibration data for this content type (Not yet measured).';
  let reliability = { level: 'low', basis: 'No validated evaluation exists for this detector and version (Not yet measured).' };

  if (outcome) {
    const th = demo ? { ai: 0.7, human: 0.3 } : validation?.thresholds;
    if (th) {
      detectorVerdict = outcome.score >= th.ai ? 'ai' : outcome.score <= th.human ? 'human' : 'mixed';
      signals.push(`Detector score ${outcome.score.toFixed(3)} compared with thresholds from the validation report (human ≤ ${th.human.toFixed(3)}, AI ≥ ${th.ai.toFixed(3)}).`);
    } else if (allowUnvalidatedVerdicts && outcome.providerLabel) {
      detectorVerdict = outcome.providerLabel;
      signals.push(`Provider’s own class label: “${outcome.providerLabel}” (not independently validated).`);
    } else {
      signals.push('Detector returned a raw score, but there are no validated thresholds, so no verdict is drawn from it.');
    }
    if (outcome.providerConfidence === 'low') {
      detectorVerdict = 'mixed';
      signals.push('The provider reported low confidence for this input.');
    }
    if (demo) {
      reliability = { level: 'low', basis: 'DEMO — not a real analysis.' };
    } else if (validation) {
      reliability = { level: validation.reliability.level, basis: validation.reliability.basis };
      const pts = validation.calibration?.points;
      const p = calibrate(pts, outcome.score);
      if (p != null) {
        estimatedProbability = Math.round(p * 1000) / 1000;
        probabilityNote = `Isotonic calibration fitted on a separate tuning split (report ${validation.version}); see the evaluation report for calibration error.`;
      }
    }
  } else {
    signals.push('The image detector was unavailable for this request.');
  }

  let provSignal = null;
  if (provenance) {
    if (provenance.status === 'found' && provenance.valid && provenance.declaresAI) {
      provSignal = 'ai';
      signals.push(`Valid Content Credentials declare AI-generated media${provenance.generator ? ` (signer/tool: ${provenance.generator})` : ''}.`);
    } else if (provenance.status === 'found') {
      signals.push(`Content Credentials found${provenance.valid ? '' : ' but failed validation'}${provenance.generator ? ` (tool: ${provenance.generator})` : ''}; they do not declare AI generation.`);
    } else {
      signals.push(provenance.note);
    }
  }

  let verdict;
  if (provSignal === 'ai') {
    if (detectorVerdict === 'human') {
      verdict = 'mixed';
      signals.push('Provenance and the detector disagree.');
    } else {
      verdict = 'ai';
      if (!detectorVerdict) reliability = { level: 'high', basis: 'A validly signed credential states the content was AI-generated; the detector did not contribute to the verdict.' };
    }
  } else {
    verdict = detectorVerdict ?? 'unable';
  }

  return {
    contentType,
    verdict,
    verdictLabel: VERDICTS[verdict],
    demo,
    detector: outcome
      ? {
          provider: provider.name,
          version: outcome.version,
          score: outcome.score,
          scoreMeaning: 'The detector’s raw model output (0 to 1; higher means more AI-like). It is not a probability that the content is AI-made.',
        }
      : { provider: provider.name, version: null, score: null, scoreMeaning: 'No detector score was available.' },
    estimatedProbability,
    probabilityNote,
    reliability,
    signals,
    provenance: provenance ?? null,
    limitations: LIMITS[contentType],
    timestamp: now.toISOString(),
    disclaimer: DISCLAIMER,
  };
}
