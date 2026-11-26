#!/usr/bin/env node
// Builds one plugin version and prepares the folder to publish. Holds no
// credentials and must run in a job without any.
//
// Usage: node src/cli/build-plugin.mjs --plugin <id> --out <dir> [--release <release.json>] [--work <dir>]
//   --release defaults to plugins/<id>/release.json (a PR's file is passed explicitly by the verify job).

import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadPlugin } from '../lib/repo.mjs';
import { assertSchema } from '../lib/schemas.mjs';
import { buildInContainer, fetchSource, sourceContractErrors } from '../lib/build.mjs';
import { preparePublication } from '../lib/package.mjs';
import { resolveVersionTag } from '../lib/tags.mjs';

const { values } = parseArgs({
  options: {
    plugin: { type: 'string' },
    release: { type: 'string' },
    out: { type: 'string' },
    work: { type: 'string', default: 'work' },
    root: { type: 'string', default: '.' },
  },
});
if (!values.plugin || !values.out) {
  console.error('--plugin and --out are required');
  process.exit(2);
}

const root = resolve(values.root);
const entry = loadPlugin(root, values.plugin);
const releasePath = values.release ?? join(root, 'plugins', values.plugin, 'release.json');
const release = assertSchema('release', JSON.parse(readFileSync(releasePath, 'utf8')), releasePath);

const tag = resolveVersionTag(entry.plugin.repository, release.version, release.commit);
if (!tag) throw new Error(`${entry.plugin.repository} has no tag v${release.version} or ${release.version}`);
if (!tag.pointsToCommit) throw new Error(`Tag ${tag.name} points to ${tag.commit}, release.json says ${release.commit}`);

const work = resolve(values.work);
mkdirSync(work, { recursive: true });
const sourceDir = join(work, 'source');
fetchSource(entry.plugin.repository, release.commit, sourceDir);
const contractErrors = sourceContractErrors(sourceDir, entry.build);
if (contractErrors.length) throw new Error(`The plugin does not meet the directory contract:\n  ${contractErrors.join('\n  ')}`);
const { output, image } = buildInContainer(sourceDir, entry.build);

const serverUrl = process.env.GITHUB_SERVER_URL;
const { contract, warnings } = preparePublication({
  outputDir: output,
  targetDir: resolve(values.out),
  id: values.plugin,
  plugin: entry.plugin,
  release,
  source: { repository: entry.plugin.repository, commit: release.commit, tag: tag.name },
  build: {
    ...entry.build,
    nodeImage: image,
    directoryCommit: process.env.GITHUB_SHA ?? null,
    workflowRunUrl: serverUrl ? `${serverUrl}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null,
    builtAt: new Date().toISOString(),
  },
});
for (const warning of warnings) console.warn(`warning: ${warning}`);
console.log(`Prepared ${values.plugin} ${contract.version}: manifest sha256 ${contract.manifestSha256}, bundle sha256 ${contract.bundleSha256}`);
