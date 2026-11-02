import { execFile as nodeExecFile } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/avif': 'avif' };

// Reads C2PA / Content Credentials using the real `c2patool` CLI (https://github.com/contentauth/c2patool).
// If the tool is not installed/configured, provenance is reported as "not-checked" — never guessed.
export async function checkProvenance(buffer, mime, config, { execFile = nodeExecFile } = {}) {
  if (!config.c2patoolPath) {
    return { status: 'not-checked', valid: null, declaresAI: false, generator: null, note: 'C2PA checking is not configured on this server (set C2PATOOL_PATH).' };
  }
  const dir = await mkdtemp(path.join(tmpdir(), 'origincheck-'));
  const file = path.join(dir, `upload.${EXT[mime] || 'bin'}`);
  try {
    await writeFile(file, buffer, { mode: 0o600 });
    const { stdout, stderr, failed } = await new Promise((resolve) => {
      execFile(config.c2patoolPath, [file], { timeout: 10_000, maxBuffer: 5 * 1024 * 1024 }, (err, out, errOut) =>
        resolve({ stdout: out || '', stderr: errOut || '', failed: Boolean(err) }));
    });
    if (failed && /no (claim|jumbf|manifest)|no content credentials/i.test(stderr + stdout)) {
      return { status: 'none-found', valid: null, declaresAI: false, generator: null, note: 'No Content Credentials found. This does not mean the image is human-made; most metadata is stripped by screenshots and re-uploads.' };
    }
    if (failed) return { status: 'error', valid: null, declaresAI: false, generator: null, note: 'The provenance check could not be completed.' };
    return parseC2paReport(stdout);
  } catch {
    return { status: 'error', valid: null, declaresAI: false, generator: null, note: 'The provenance check could not be completed.' };
  } finally {
    await rm(dir, { recursive: true, force: true }); // always delete the temp copy
  }
}

export function parseC2paReport(stdout) {
  let data;
  try { data = JSON.parse(stdout); } catch { return { status: 'error', valid: null, declaresAI: false, generator: null, note: 'Could not parse the provenance report.' }; }
  const active = data.manifests?.[data.active_manifest] ?? Object.values(data.manifests ?? {})[0];
  if (!active) return { status: 'none-found', valid: null, declaresAI: false, generator: null, note: 'No Content Credentials found.' };
  const state = data.validation_state;
  const errors = Array.isArray(data.validation_status) ? data.validation_status.length : 0;
  const valid = state ? ['Valid', 'Trusted'].includes(state) : errors === 0;
  const generator = active.claim_generator_info?.[0]?.name || active.claim_generator || null;
  // IPTC digital source types for AI: trainedAlgorithmicMedia / compositeWithTrainedAlgorithmicMedia
  const declaresAI = /trainedAlgorithmicMedia/i.test(JSON.stringify(active));
  return {
    status: 'found', valid, declaresAI, generator,
    note: valid
      ? 'Content Credentials were found and their signature validated. They describe what the signer claims about the content’s source.'
      : 'Content Credentials were found but failed validation, so they should not be relied on.',
  };
}
