// Publishes a prepared version folder and moves the stable folders that the
// version is compatible with. A version folder is written once and never
// touched again; only stable folders are overwritten, always with a
// byte-identical copy of a version folder (the manifest uses relative paths,
// so the copy keeps the same sha256).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contentType, listFiles } from './files.js';
import { CONTRACT_FILE, SUMS_FILE } from './package.js';
import { CACHE_IMMUTABLE, CACHE_SHORT } from './storage.js';
import { shouldReplace, stableTargets, versionPrefix } from './routes.js';

/**
 * Upload order inside a folder: assets first, then the manifest that points to
 * them, then SHA256SUMS and the contract, whose presence marks the folder as
 * complete (the catalog only lists folders that have a contract).
 */
export function uploadOrder(files) {
  const last = ['manifest.json', SUMS_FILE, CONTRACT_FILE];
  return [...files.filter((f) => !last.includes(f)), ...last.filter((f) => files.includes(f))];
}

async function uploadFolder(storage, localDir, prefix, cacheControl) {
  const files = uploadOrder(listFiles(localDir));
  for (const file of files) {
    await storage.put(`${prefix}${file}`, readFileSync(join(localDir, file)), { contentType: contentType(file), cacheControl });
  }
  return files;
}

export class ImmutableVersionError extends Error {}

/**
 * Writes <id>/<version>/. Refuses when anything already exists there, except
 * when the folder holds exactly this build (same contract bytes): that is a
 * re-run of the same deploy, which may go on to the stable folders.
 * Returns { prefix, resumed }.
 */
export async function publishVersionFolder(storage, localDir, contract) {
  const prefix = versionPrefix(contract.plugin, contract.version);
  const existing = await storage.list(prefix);
  if (existing.length) {
    const remote = await storage.getText(`${prefix}${CONTRACT_FILE}`);
    if (remote !== null && remote === readFileSync(join(localDir, CONTRACT_FILE), 'utf8')) return { prefix, resumed: true };
    throw new ImmutableVersionError(`${prefix} already exists (${existing.length} objects) with another build; a published version never changes`);
  }
  await uploadFolder(storage, localDir, prefix, CACHE_IMMUTABLE);
  return { prefix, resumed: false };
}

/** Replaces the content of a stable folder with the version in `localDir`. */
export async function replaceStableFolder(storage, localDir, prefix) {
  const before = await storage.list(prefix);
  const written = await uploadFolder(storage, localDir, prefix, CACHE_SHORT);
  const stale = before.filter((key) => !written.includes(key.slice(prefix.length)));
  if (stale.length) await storage.delete(stale);
}

/**
 * Moves every stable folder the version is compatible with, when the version
 * is newer than the one it serves. Returns what happened to each target.
 */
export async function updateStableFolders(storage, localDir, contract, table) {
  const results = [];
  for (const target of stableTargets(table, contract.plugin, contract.version, contract.requiredSdkVersion)) {
    const current = await storage.getJson(`${target.prefix}${CONTRACT_FILE}`);
    const previous = current?.version ?? null;
    if (!shouldReplace(previous, contract.version)) {
      results.push({ ...target, previous, replaced: false });
      continue;
    }
    await replaceStableFolder(storage, localDir, target.prefix);
    results.push({ ...target, previous, replaced: true });
  }
  return results;
}
