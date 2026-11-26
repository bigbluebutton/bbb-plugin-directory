import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { completeManifest } from '../src/lib/package.mjs';
import { sha256 } from '../src/lib/files.mjs';
import { schemaErrors } from '../src/lib/schemas.mjs';
import { COMMIT, PLUGIN, fakeBuildOutput, prepared } from './helpers/fixtures.mjs';

const release = { version: '0.1.4', commit: COMMIT };

test('the publication folder carries the contract, SHA256SUMS and hashes that match the files', () => {
  const { dir, contract } = prepared();
  assert.deepEqual(schemaErrors('contract', contract), []);
  assert.equal(contract.manifestSha256, sha256(readFileSync(join(dir, 'manifest.json'))));
  assert.equal(contract.bundleSha256, sha256(readFileSync(join(dir, 'BbbPluginPickRandomUser.js'))));
  assert.deepEqual(Object.keys(contract.files), ['BbbPluginPickRandomUser.js', 'locales/en.json', 'manifest.json']);
  const sums = readFileSync(join(dir, 'SHA256SUMS'), 'utf8').trim().split('\n');
  assert.deepEqual(sums.map((l) => l.split('  ')[1]), ['BbbPluginPickRandomUser.js', 'contract.json', 'locales/en.json', 'manifest.json']);
  assert.ok(sums.includes(`${sha256(readFileSync(join(dir, 'contract.json')))}  contract.json`));
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.javascriptEntrypointUrl, 'BbbPluginPickRandomUser.js');
  assert.equal(manifest.localesBaseUrl, 'locales');
});

test('the directory completes the manifest: sets a missing version, drops the integrity field', () => {
  const outputDir = fakeBuildOutput();
  const raw = JSON.parse(readFileSync(join(outputDir, 'manifest.json'), 'utf8'));
  delete raw.version;
  raw.javascriptEntrypointIntegrity = 'sha384-abc';
  const { manifest, warnings } = completeManifest(raw, { outputDir, plugin: PLUGIN, release });
  assert.equal(manifest.version, '0.1.4');
  assert.equal(manifest.javascriptEntrypointIntegrity, undefined);
  assert.equal(warnings.length, 2);
});

test('the manifest contract rejects absolute or escaping paths, wrong names, versions and ranges', () => {
  const outputDir = fakeBuildOutput();
  const base = JSON.parse(readFileSync(join(outputDir, 'manifest.json'), 'utf8'));
  const failsWith = (changes, pattern) => assert.throws(() => completeManifest({ ...base, ...changes }, { outputDir, plugin: PLUGIN, release }), pattern);
  failsWith({ javascriptEntrypointUrl: 'https://cdn.example.org/x.js' }, /not a URL/);
  failsWith({ javascriptEntrypointUrl: '/BbbPluginPickRandomUser.js' }, /must not start with/);
  failsWith({ javascriptEntrypointUrl: '../x.js' }, /inside the plugin folder/);
  failsWith({ javascriptEntrypointUrl: 'missing.js' }, /not in the build output/);
  failsWith({ localesBaseUrl: 'https://cdn.example.org/locales' }, /not a URL/);
  failsWith({ name: 'Other' }, /catalog expects/);
  failsWith({ version: '0.1.3' }, /release\.json asks for/);
  failsWith({ requiredSdkVersion: 'not a range' }, /not a valid range/);
});
