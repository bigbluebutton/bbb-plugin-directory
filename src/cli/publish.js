#!/usr/bin/env node
// Publishes a folder prepared by build-plugin.js, moves the stable folders and
// checks everything over public HTTPS. The only step that holds the storage key.
//
// Usage: node src/cli/publish.js --dir <prepared folder> [--root .] [--report report.json]
// Environment: the S3_* variables of src/lib/storage.js and PUBLIC_BASE_URL
// (the public HTTPS address of the storage prefix, e.g. https://plugins.example.org).

import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { isDeepStrictEqual, parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { assertSchema } from '../lib/schemas.js';
import { hashFiles } from '../lib/files.js';
import { CONTRACT_FILE, SUMS_FILE } from '../lib/package.js';
import { loadSdkTable } from '../lib/repo.js';
import { Storage, storageConfigFromEnv } from '../lib/storage.js';
import { publishVersionFolder, replaceStableFolder, updateStableFolders } from '../lib/publish.js';
import { verifyFolder } from '../lib/verify.js';

const { values } = parseArgs({
  options: {
    dir: { type: 'string' },
    root: { type: 'string', default: '.' },
    report: { type: 'string' },
  },
});
const baseUrl = process.env.PUBLIC_BASE_URL;
if (!values.dir || !baseUrl) {
  console.error('--dir and PUBLIC_BASE_URL are required');
  process.exit(2);
}

const dir = resolve(values.dir);
const contract = assertSchema('contract', JSON.parse(readFileSync(join(dir, CONTRACT_FILE), 'utf8')), CONTRACT_FILE);
// The folder travelled between jobs as an artifact: check it is the one the build described.
const { [CONTRACT_FILE]: _contract, [SUMS_FILE]: _sums, ...files } = hashFiles(dir);
if (!isDeepStrictEqual(files, contract.files)) throw new Error('The prepared folder does not match its contract.json');

const storage = new Storage(storageConfigFromEnv());
const table = loadSdkTable(resolve(values.root));
const report = { plugin: contract.plugin, version: contract.version, manifestSha256: contract.manifestSha256 };

const { prefix, resumed } = await publishVersionFolder(storage, dir, contract);
report.versionFolder = { prefix, resumed };
console.log(resumed ? `${prefix} already holds this build; continuing` : `Published ${prefix}`);

report.stable = await updateStableFolders(storage, dir, contract, table);
for (const s of report.stable) {
  console.log(s.replaced ? `Moved ${s.prefix} from ${s.previous ?? 'nothing'} to ${contract.version}` : `Kept ${s.prefix} at ${s.previous}`);
}

const failures = [];
const versionProblems = await verifyFolder(baseUrl, prefix, contract);
if (versionProblems.length) {
  // No automatic rebuild: a rebuild may change the sha256 that servers pinned.
  failures.push(`Version folder ${prefix} does not serve the published build. A human has to look at it; it is not rebuilt automatically.`, ...versionProblems);
}
for (const target of report.stable.filter((s) => s.replaced)) {
  let problems = await verifyFolder(baseUrl, target.prefix, contract);
  if (problems.length) {
    console.warn(`${target.prefix} failed the check, copying again:\n  ${problems.join('\n  ')}`);
    await replaceStableFolder(storage, dir, target.prefix);
    await sleep(5000);
    problems = await verifyFolder(baseUrl, target.prefix, contract);
  }
  target.verified = problems.length === 0;
  if (problems.length) failures.push(`Stable folder ${target.prefix} still fails after copying again.`, ...problems);
}
report.verified = failures.length === 0;
report.failures = failures;

if (values.report) writeFileSync(values.report, `${JSON.stringify(report, null, 2)}\n`);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
    `### ${contract.plugin} ${contract.version}`,
    `- manifest sha256 \`${contract.manifestSha256}\``,
    `- bundle sha256 \`${contract.bundleSha256}\``,
    `- version folder \`${prefix}\`${resumed ? ' (already there, same build)' : ''}`,
    ...report.stable.map((s) => `- \`${s.prefix}\`: ${s.replaced ? `${s.previous ?? 'new'} -> ${contract.version}` : `kept ${s.previous}`}`),
    report.verified ? '- post-deploy check: passed' : `- post-deploy check: **failed**\n${failures.map((f) => `  - ${f}`).join('\n')}`,
    '',
  ].join('\n'));
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Post-deploy check passed');
