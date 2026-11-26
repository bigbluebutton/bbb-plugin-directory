import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildShowcase } from '../src/lib/showcase.js';
import { tempDir } from './helpers/fixtures.js';

const catalog = {
  schemaVersion: 1,
  generatedAt: '2026-11-26T00:00:00Z',
  baseUrl: 'https://plugins.example.org',
  plugins: [{
    id: 'pick-random-user',
    name: 'BbbPluginPickRandomUser',
    repository: 'https://github.com/bigbluebutton/bbb-plugin-pick-random-user',
    description: 'Picks a <random> user & more',
    status: 'production',
    maintainers: ['alice'],
    versions: [{
      version: '0.1.4', commit: 'a'.repeat(40), tag: 'v0.1.4', requiredSdkVersion: '^1.0.0-beta.2',
      manifestUrl: 'https://plugins.example.org/pick-random-user/0.1.4/manifest.json',
      contractUrl: 'https://plugins.example.org/pick-random-user/0.1.4/contract.json',
      manifestSha256: 'b'.repeat(64), bundleSha256: 'c'.repeat(64),
      security: { vulnerable: true, fixedIn: null },
    }],
    perBbbVersion: [{ bbb: '4.0', version: '0.1.4', manifestUrl: 'https://plugins.example.org/bbb/4.0/pick-random-user/manifest.json' }],
    perSdkLine: [],
  }, {
    id: 'old-thing', name: 'Old', repository: 'https://github.com/o/bbb-plugin-old-thing', description: 'gone',
    status: 'archived', maintainers: ['bob'], versions: [], perBbbVersion: [], perSdkLine: [],
  }],
};

test('the showcase escapes catalog text and gives copy-ready configuration', () => {
  const out = tempDir('pd-site-');
  buildShowcase(catalog, out);
  const index = readFileSync(join(out, 'index.html'), 'utf8');
  assert.ok(index.includes('Picks a &lt;random&gt; user &amp; more'));
  assert.ok(!index.includes('<random>'));
  assert.ok(!index.includes('old-thing'), 'archived plugins are not listed');
  const page = readFileSync(join(out, 'plugins', 'pick-random-user.html'), 'utf8');
  assert.ok(page.includes('pluginManifests=[{&quot;url&quot;:&quot;https://plugins.example.org/bbb/%%BBB_MAIN_VERSION%%/pick-random-user/manifest.json&quot;}]'));
  assert.ok(page.includes(`&quot;checksum&quot;:&quot;${'b'.repeat(64)}&quot;`));
  assert.ok(page.includes('Vulnerable versions: 0.1.4'));
  assert.ok(readFileSync(join(out, 'catalog.json'), 'utf8').includes('pick-random-user'));
});
