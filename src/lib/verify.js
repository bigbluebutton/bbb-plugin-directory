// Post-deploy check: reads the published files back over public HTTPS, the
// way a BigBlueButton server and a browser will, and compares them with the
// contract of the version that was just published.

import { sha256 } from './files.js';

// Any origin works for the CORS check: every BigBlueButton server has its own.
const CHECK_ORIGIN = 'https://bbb.example.org';

async function fetchBytes(url, headers = {}) {
  const response = await fetch(url, { headers: { 'cache-control': 'no-cache', ...headers }, cache: 'no-store' });
  const bytes = Buffer.from(await response.arrayBuffer());
  return { status: response.status, headers: response.headers, bytes };
}

export const joinUrl = (base, path) => `${base.replace(/\/+$/, '')}/${path}`;

/** Problems found in the folder at `prefix`; empty when it serves exactly `contract`. */
export async function verifyFolder(baseUrl, prefix, contract) {
  const problems = [];
  const at = (file) => joinUrl(baseUrl, `${prefix}${file}`);
  // A cache-busting query, as the client appends the version to the bundle URL.
  const bust = (url) => `${url}?v=${encodeURIComponent(contract.version)}-${Date.now()}`;

  const manifest = await fetchBytes(bust(at('manifest.json')));
  if (manifest.status !== 200) problems.push(`${at('manifest.json')}: HTTP ${manifest.status}`);
  else {
    if (sha256(manifest.bytes) !== contract.manifestSha256) problems.push(`${at('manifest.json')}: sha256 differs from the contract`);
    let version;
    try {
      version = JSON.parse(manifest.bytes.toString('utf8')).version;
    } catch {
      problems.push(`${at('manifest.json')}: not JSON`);
    }
    if (version !== undefined && version !== contract.version) problems.push(`${at('manifest.json')}: serves version ${version}, expected ${contract.version}`);
  }

  const bundle = await fetchBytes(bust(at(contract.bundle)), { origin: CHECK_ORIGIN });
  if (bundle.status !== 200) problems.push(`${at(contract.bundle)}: HTTP ${bundle.status}`);
  else {
    if (sha256(bundle.bytes) !== contract.bundleSha256) problems.push(`${at(contract.bundle)}: sha256 differs from the contract`);
    const allowOrigin = bundle.headers.get('access-control-allow-origin');
    if (allowOrigin !== '*' && allowOrigin !== CHECK_ORIGIN) {
      problems.push(`${at(contract.bundle)}: no CORS header for GET (Access-Control-Allow-Origin is ${allowOrigin ?? 'missing'})`);
    }
  }

  const served = await fetchBytes(bust(at('contract.json')));
  if (served.status !== 200) problems.push(`${at('contract.json')}: HTTP ${served.status}`);
  else if (JSON.parse(served.bytes.toString('utf8')).version !== contract.version) problems.push(`${at('contract.json')}: belongs to another version`);
  return problems;
}
