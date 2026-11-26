// Reads and validates the input catalog kept in this repository.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { schemaErrors } from './schemas.mjs';
import { idFromRepository, isValidPluginId } from './plugin-ids.mjs';
import { compareVersions, isValidVersion } from './semver.mjs';

export const PLUGIN_FILES = { plugin: 'plugin.json', release: 'release.json', maintainers: 'maintainers.json' };

export const BUILD_DEFAULTS = Object.freeze({
  nodeVersion: '24',
  allowNetwork: false,
  allowInstallScripts: false,
  outputDir: 'dist',
});

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function listPluginIds(root) {
  const dir = join(root, 'plugins');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** Loads plugins/<id>/; `release` is null for a plugin admitted but not yet published. */
export function loadPlugin(root, id) {
  const dir = join(root, 'plugins', id);
  const plugin = readJson(join(dir, PLUGIN_FILES.plugin));
  const maintainers = readJson(join(dir, PLUGIN_FILES.maintainers));
  const releasePath = join(dir, PLUGIN_FILES.release);
  const release = existsSync(releasePath) ? readJson(releasePath) : null;
  return { id, plugin, maintainers, release, build: { ...BUILD_DEFAULTS, ...plugin.build } };
}

export function loadSdkTable(root) {
  return readJson(join(root, 'data', 'bbb-sdk-versions.json'));
}

/** Errors of one plugin folder, beyond what the JSON Schemas check. */
export function pluginErrors(root, id) {
  const errors = [];
  const dir = join(root, 'plugins', id);
  if (!isValidPluginId(id)) errors.push(`plugins/${id}: invalid or reserved plugin id`);
  for (const [kind, file] of Object.entries(PLUGIN_FILES)) {
    const path = join(dir, file);
    if (!existsSync(path)) {
      if (kind !== 'release') errors.push(`plugins/${id}/${file}: missing`);
      continue;
    }
    let data;
    try {
      data = readJson(path);
    } catch (error) {
      errors.push(`plugins/${id}/${file}: not valid JSON (${error.message})`);
      continue;
    }
    for (const message of schemaErrors(kind, data)) errors.push(`plugins/${id}/${file}: ${message}`);
    if (kind === 'plugin' && data.repository && idFromRepository(data.repository) !== id) {
      errors.push(`plugins/${id}/plugin.json: repository must be named bbb-plugin-${id}`);
    }
    if (kind === 'release') {
      for (const entry of data.security ?? []) {
        if (!isValidVersion(entry.version)) errors.push(`plugins/${id}/release.json: invalid security version [${entry.version}]`);
        if (entry.fixedIn && isValidVersion(entry.fixedIn) && isValidVersion(entry.version)
          && compareVersions(entry.fixedIn, entry.version) <= 0) {
          errors.push(`plugins/${id}/release.json: fixedIn ${entry.fixedIn} must be newer than ${entry.version}`);
        }
      }
    }
  }
  return errors;
}

/** Every error of the repository: plugin folders, SDK table and CODEOWNERS coverage. */
export function repositoryErrors(root) {
  const errors = listPluginIds(root).flatMap((id) => pluginErrors(root, id));
  const tablePath = join(root, 'data', 'bbb-sdk-versions.json');
  if (!existsSync(tablePath)) errors.push('data/bbb-sdk-versions.json: missing');
  else for (const message of schemaErrors('bbb-sdk-versions', readJson(tablePath))) errors.push(`data/bbb-sdk-versions.json: ${message}`);
  const codeowners = existsSync(join(root, '.github', 'CODEOWNERS')) ? readFileSync(join(root, '.github', 'CODEOWNERS'), 'utf8') : '';
  errors.push(...codeownersErrors(codeowners));
  return errors;
}

/**
 * CODEOWNERS must leave release.json without an owner (deploy PRs need no
 * approval) and give maintainers.json one (deploy PRs can never change it).
 * The last matching line wins, so the order is checked too.
 */
export function codeownersErrors(text) {
  const rules = text.split('\n')
    .map((line) => line.replace(/#.*/, '').trim())
    .filter(Boolean)
    .map((line) => {
      const [pattern, ...owners] = line.split(/\s+/);
      return { pattern, owners };
    });
  const last = (pattern) => rules.map((r, i) => ({ ...r, i })).filter((r) => r.pattern === pattern).at(-1);
  const errors = [];
  const all = last('*');
  const release = last('/plugins/*/release.json');
  const maintainers = last('/plugins/*/maintainers.json');
  if (!all?.owners.length) errors.push('.github/CODEOWNERS: "*" must have an owner');
  if (!release || release.owners.length) errors.push('.github/CODEOWNERS: "/plugins/*/release.json" must be listed with no owner');
  if (!maintainers?.owners.length) errors.push('.github/CODEOWNERS: "/plugins/*/maintainers.json" must have an owner');
  if (all && release && all.i > release.i) errors.push('.github/CODEOWNERS: "*" must come before "/plugins/*/release.json"');
  if (release && maintainers && maintainers.i < release.i) errors.push('.github/CODEOWNERS: "/plugins/*/maintainers.json" must come after "/plugins/*/release.json"');
  return errors;
}
