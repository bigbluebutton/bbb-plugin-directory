import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  satisfies, compareVersions, normalizeVersion, sdkLineOf, mainVersionOf,
} from '../src/lib/semver.mjs';

const oracle = JSON.parse(readFileSync(new URL('./fixtures/semver-server-oracle.json', import.meta.url)));

test('satisfies() gives the same answer as the server for every recorded case', () => {
  const mismatches = [];
  for (const { version, range, expected } of oracle.cases) {
    let actual;
    try {
      actual = satisfies(version, range);
    } catch {
      actual = 'error';
    }
    if (actual !== expected) mismatches.push({ version, range, expected, actual });
  }
  assert.deepEqual(mismatches, []);
  assert.ok(oracle.cases.length > 300);
});

test('compareVersions orders pre-releases before the release', () => {
  const sorted = ['1.0.0', '1.0.0-beta.10', '1.0.0-beta.2', '0.9.9', '1.0.0-alpha']
    .sort(compareVersions);
  assert.deepEqual(sorted, ['0.9.9', '1.0.0-alpha', '1.0.0-beta.2', '1.0.0-beta.10', '1.0.0']);
});

test('normalizeVersion strips the tag prefix and build metadata', () => {
  assert.equal(normalizeVersion('v1.0.0-beta.3'), '1.0.0-beta.3');
  assert.equal(normalizeVersion('0.1.4+build.7'), '0.1.4');
  assert.throws(() => normalizeVersion('1.0'));
});

test('sdkLineOf and mainVersionOf match the server placeholders', () => {
  assert.equal(sdkLineOf('0.0.105'), '0.0');
  assert.equal(sdkLineOf('0.1.2'), '0.1');
  assert.equal(sdkLineOf('1.0.0-beta.3'), '1');
  assert.equal(sdkLineOf('2.3.4'), '2');
  assert.equal(mainVersionOf('4.0.4'), '4.0');
});
