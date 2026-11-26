import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stableTargets, shouldReplace, sdkVersionsInUse } from '../src/lib/routes.mjs';

const realTable = JSON.parse(readFileSync(new URL('../data/bbb-sdk-versions.json', import.meta.url)));
const keys = (targets) => targets.map((t) => t.prefix);

test('with the real table, a plugin for SDK ^1.0.0-beta.2 goes to the 4.0 and SDK 1 stable folders', () => {
  assert.deepEqual(keys(stableTargets(realTable, 'pick-random-user', '0.1.4', '^1.0.0-beta.2')), [
    'bbb/4.0/pick-random-user/',
    'sdk/1/pick-random-user/',
  ]);
});

test('a range that leaves out an SDK still shipped in the line keeps the plugin off that line', () => {
  const table = {
    lines: {
      '3.0': { supported: true, minSupported: '3.0.0', releases: { '3.0.0': '0.0.73', '3.0.1': '0.0.105' } },
    },
  };
  // ^0.0.105 does not load on 3.0.0 (SDK 0.0.73), so /bbb/3.0/ is not touched;
  // the SDK line 0.0 also contains 0.0.73, so /sdk/0.0/ is not touched either.
  assert.deepEqual(stableTargets(table, 'p', '1.0.0', '^0.0.105'), []);
  // Raising minSupported (a human decision) opens the line.
  table.lines['3.0'].minSupported = '3.0.1';
  assert.deepEqual(keys(stableTargets(table, 'p', '1.0.0', '^0.0.105')), ['bbb/3.0/p/', 'sdk/0.0/p/']);
  // An unsupported line is never updated.
  table.lines['3.0'].supported = false;
  assert.deepEqual(stableTargets(table, 'p', '1.0.0', '^0.0.105'), []);
});

test('a wide range reaches every line it satisfies; pre-release plugin versions reach none', () => {
  const table = {
    lines: {
      '3.0': { supported: true, minSupported: '3.0.0', releases: { '3.0.0': '0.0.73' } },
      '4.0': { supported: true, minSupported: '4.0.0', releases: { '4.0.0': '1.0.0-beta.3', '4.0.5': '1.1.0' } },
    },
  };
  assert.deepEqual(keys(stableTargets(table, 'p', '2.0.0', '>=0.0.73 || ^1.0.0-beta.3')), ['bbb/3.0/p/', 'bbb/4.0/p/', 'sdk/0.0/p/', 'sdk/1/p/']);
  // ^1.1.0 fails on 1.0.0-beta.3, still shipped by 4.0.0
  assert.deepEqual(stableTargets(table, 'p', '2.0.0', '^1.1.0'), []);
  assert.deepEqual(stableTargets(table, 'p', '2.0.0-rc.1', '>=0.0.73 || ^1.0.0-beta.3'), []);
  assert.deepEqual(sdkVersionsInUse(table), { '3.0': ['0.0.73'], '4.0': ['1.0.0-beta.3', '1.1.0'] });
});

test('stable folders only move forward', () => {
  assert.equal(shouldReplace(null, '0.1.4'), true);
  assert.equal(shouldReplace('0.1.4', '0.1.5'), true);
  assert.equal(shouldReplace('0.1.5', '0.1.4'), false);
  assert.equal(shouldReplace('0.1.5', '0.1.5'), false);
});
