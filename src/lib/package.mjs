// Turns a plugin build output into the folder the directory publishes: the
// manifest completed by the directory, every file with its sha256, the
// contract file with the provenance, and SHA256SUMS.

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { assertValidRange } from './semver.mjs';
import { assertSchema } from './schemas.mjs';
import { hashFiles, sha256 } from './files.mjs';

export const CONTRACT_FILE = 'contract.json';
export const SUMS_FILE = 'SHA256SUMS';

const ABSOLUTE_URL = /^[a-z][a-z0-9+.-]*:/i;

function relativePathError(field, value) {
  if (typeof value !== 'string' || !value) return `${field} is missing`;
  if (ABSOLUTE_URL.test(value) || value.startsWith('//')) {
    return `${field} must be a path relative to the manifest, not a URL (${value}); the directory serves the files next to it`;
  }
  // The server concatenates relative paths to the manifest folder, so a
  // leading "/" would produce a broken URL (docs/docs/plugins.md).
  if (value.startsWith('/')) return `${field} must not start with "/" (${value})`;
  if (posix.normalize(value).startsWith('..')) return `${field} must stay inside the plugin folder (${value})`;
  return null;
}

/**
 * Checks and completes the manifest produced by the build. Returns
 * { manifest, warnings } or throws with every contract error found.
 */
export function completeManifest(raw, { outputDir, plugin, release }) {
  const errors = [];
  const warnings = [];
  const manifest = { ...raw };
  if (manifest.name !== plugin.name) errors.push(`manifest name is ${manifest.name}, the catalog expects ${plugin.name}`);
  try {
    assertValidRange(manifest.requiredSdkVersion);
  } catch {
    errors.push(`manifest requiredSdkVersion is not a valid range (${manifest.requiredSdkVersion})`);
  }
  const entryError = relativePathError('javascriptEntrypointUrl', manifest.javascriptEntrypointUrl);
  if (entryError) errors.push(entryError);
  else {
    const entry = join(outputDir, manifest.javascriptEntrypointUrl.split('?')[0]);
    if (!existsSync(entry) || !statSync(entry).isFile()) errors.push(`the bundle ${manifest.javascriptEntrypointUrl} is not in the build output`);
  }
  if (manifest.localesBaseUrl !== undefined) {
    const localesError = relativePathError('localesBaseUrl', manifest.localesBaseUrl);
    if (localesError) errors.push(localesError);
    else if (!existsSync(join(outputDir, manifest.localesBaseUrl))) errors.push(`localesBaseUrl ${manifest.localesBaseUrl} is not in the build output`);
  }
  if (manifest.version === undefined) {
    // The version is appended to the bundle URL by the client, which keeps
    // browsers from reusing a cached bundle after a stable URL moves.
    manifest.version = release.version;
    warnings.push(`the manifest had no version; the directory set it to ${release.version}`);
  } else if (manifest.version !== release.version) {
    errors.push(`manifest version is ${manifest.version}, release.json asks for ${release.version}`);
  }
  if (manifest.javascriptEntrypointIntegrity !== undefined) {
    // The client loader does not set crossorigin yet, so a browser would block
    // a bundle served from another origin that carries an integrity value.
    delete manifest.javascriptEntrypointIntegrity;
    warnings.push('javascriptEntrypointIntegrity was removed: the browser cannot verify it on a bundle from another origin yet');
  }
  if (errors.length) throw new Error(`The plugin does not meet the directory contract:\n  ${errors.join('\n  ')}`);
  return { manifest, warnings };
}

/**
 * Builds the publication folder in `targetDir` from the build output.
 * `source` = { repository, commit, tag }, `build` = catalog build settings plus
 * { nodeImage, directoryCommit, workflowRunUrl, builtAt }.
 */
export function preparePublication({ outputDir, targetDir, id, plugin, release, source, build }) {
  const raw = JSON.parse(readFileSync(join(outputDir, 'manifest.json'), 'utf8'));
  const { manifest, warnings } = completeManifest(raw, { outputDir, plugin, release });
  rmSync(targetDir, { recursive: true, force: true });
  mkdirSync(targetDir, { recursive: true });
  cpSync(outputDir, targetDir, { recursive: true });
  for (const reserved of [CONTRACT_FILE, SUMS_FILE]) rmSync(join(targetDir, reserved), { force: true });
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(targetDir, 'manifest.json'), manifestBytes);

  const files = hashFiles(targetDir);
  const bundle = posix.normalize(manifest.javascriptEntrypointUrl.split('?')[0]);
  const contract = assertSchema('contract', {
    schemaVersion: 1,
    plugin: id,
    name: plugin.name,
    version: release.version,
    repository: source.repository,
    commit: source.commit,
    tag: source.tag,
    requiredSdkVersion: manifest.requiredSdkVersion,
    manifest: 'manifest.json',
    manifestSha256: sha256(manifestBytes),
    bundle,
    bundleSha256: files[bundle],
    files,
    build: {
      nodeImage: build.nodeImage,
      allowNetwork: build.allowNetwork,
      allowInstallScripts: build.allowInstallScripts,
      directoryCommit: build.directoryCommit ?? null,
      workflowRunUrl: build.workflowRunUrl ?? null,
      builtAt: build.builtAt,
    },
  }, 'contract.json');
  const contractBytes = Buffer.from(`${JSON.stringify(contract, null, 2)}\n`);
  writeFileSync(join(targetDir, CONTRACT_FILE), contractBytes);
  const sums = { ...files, [CONTRACT_FILE]: sha256(contractBytes) };
  writeFileSync(
    join(targetDir, SUMS_FILE),
    Object.keys(sums).sort().map((path) => `${sums[path]}  ${path}\n`).join(''),
  );
  return { contract, warnings };
}
