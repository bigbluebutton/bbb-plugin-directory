import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImmutableVersionError, publishVersionFolder, updateStableFolders, uploadOrder } from '../src/lib/publish.js';
import { buildCatalog } from '../src/lib/catalog.js';
import { loadSdkTable } from '../src/lib/repo.js';
import { schemaErrors } from '../src/lib/schemas.js';
import { MemoryStorage } from './helpers/memory-storage.js';
import { COMMIT, prepared, repoRoot } from './helpers/fixtures.js';

const BASE = 'https://plugins.example.org';

test('assets go up before the manifest, and the contract goes up last', () => {
  assert.deepEqual(uploadOrder(['SHA256SUMS', 'a.js', 'contract.json', 'locales/en.json', 'manifest.json']),
    ['a.js', 'locales/en.json', 'manifest.json', 'SHA256SUMS', 'contract.json']);
});

test('a version folder is written once and stable folders get byte-identical copies', async () => {
  const storage = new MemoryStorage();
  const root = repoRoot({ release: { version: '0.1.4', commit: COMMIT } });
  const { dir, contract } = prepared();
  assert.deepEqual(await publishVersionFolder(storage, dir, contract), { prefix: 'pick-random-user/0.1.4/', resumed: false });
  const stable = await updateStableFolders(storage, dir, contract, loadSdkTable(root));
  assert.deepEqual(stable.map((s) => [s.prefix, s.previous, s.replaced]), [
    ['bbb/4.0/pick-random-user/', null, true],
    ['sdk/1/pick-random-user/', null, true],
  ]);
  for (const prefix of ['pick-random-user/0.1.4/', 'bbb/4.0/pick-random-user/', 'sdk/1/pick-random-user/']) {
    assert.deepEqual((await storage.getText(`${prefix}manifest.json`)), readFileSync(join(dir, 'manifest.json'), 'utf8'));
    assert.equal(await storage.getText(`${prefix}contract.json`), readFileSync(join(dir, 'contract.json'), 'utf8'));
  }
  assert.equal(storage.objects.get('pick-random-user/0.1.4/manifest.json').cacheControl, 'public, max-age=31536000, immutable');
  assert.equal(storage.objects.get('bbb/4.0/pick-random-user/manifest.json').cacheControl, 'public, max-age=300');

  // The same build again (a re-run of the deploy) resumes; another build is refused.
  assert.equal((await publishVersionFolder(storage, dir, contract)).resumed, true);
  // A rebuild that came out different (here, another manifest) is a different build.
  const rebuilt = prepared({ requiredSdkVersion: '^1.0.0-beta.3' });
  await assert.rejects(publishVersionFolder(storage, rebuilt.dir, rebuilt.contract), ImmutableVersionError);
  assert.equal(await storage.getText('pick-random-user/0.1.4/contract.json'), readFileSync(join(dir, 'contract.json'), 'utf8'));
});

test('a newer version moves the stable folders and removes files the old version had', async () => {
  const storage = new MemoryStorage();
  const root = repoRoot();
  const table = loadSdkTable(root);
  const v1 = prepared({ version: '0.1.4', bundle: 'old-name.js' });
  await publishVersionFolder(storage, v1.dir, v1.contract);
  await updateStableFolders(storage, v1.dir, v1.contract, table);
  const v2 = prepared({ version: '0.1.5' });
  await publishVersionFolder(storage, v2.dir, v2.contract);
  const moved = await updateStableFolders(storage, v2.dir, v2.contract, table);
  assert.deepEqual(moved.map((s) => [s.prefix, s.previous, s.replaced]), [
    ['bbb/4.0/pick-random-user/', '0.1.4', true],
    ['sdk/1/pick-random-user/', '0.1.4', true],
  ]);
  assert.equal(await storage.exists('bbb/4.0/pick-random-user/old-name.js'), false);
  assert.equal(await storage.exists('pick-random-user/0.1.4/old-name.js'), true, 'version folders are never touched');
  // An older version published later (a backport) does not move them back.
  const backport = prepared({ version: '0.0.9' });
  await publishVersionFolder(storage, backport.dir, backport.contract);
  const kept = await updateStableFolders(storage, backport.dir, backport.contract, table);
  assert.deepEqual(kept.map((s) => s.replaced), [false, false]);
  assert.equal((await storage.getJson('bbb/4.0/pick-random-user/contract.json')).version, '0.1.5');
});

test('the catalog lists published versions newest first, the stable routes and the security marks', async () => {
  const storage = new MemoryStorage();
  const root = repoRoot({ release: { version: '0.1.5', commit: COMMIT, security: [{ version: '0.1.4', fixedIn: '0.1.5' }] } });
  const table = loadSdkTable(root);
  for (const version of ['0.1.4', '0.1.5']) {
    const { dir, contract } = prepared({ version });
    await publishVersionFolder(storage, dir, contract);
    await updateStableFolders(storage, dir, contract, table);
  }
  // An interrupted upload (no contract) is not a version.
  await storage.put('pick-random-user/0.1.6/BbbPluginPickRandomUser.js', 'x', {});
  const catalog = await buildCatalog({ storage, root, baseUrl: BASE, generatedAt: '2026-11-26T00:00:00Z' });
  assert.deepEqual(schemaErrors('catalog', catalog), []);
  const [plugin] = catalog.plugins;
  assert.deepEqual(plugin.versions.map((v) => [v.version, v.security.vulnerable, v.security.fixedIn]), [['0.1.5', false, null], ['0.1.4', true, '0.1.5']]);
  assert.equal(plugin.versions[0].manifestUrl, `${BASE}/pick-random-user/0.1.5/manifest.json`);
  assert.deepEqual(plugin.perBbbVersion, [{ bbb: '4.0', version: '0.1.5', manifestUrl: `${BASE}/bbb/4.0/pick-random-user/manifest.json` }]);
  assert.deepEqual(plugin.perSdkLine, [{ sdk: '1', version: '0.1.5', manifestUrl: `${BASE}/sdk/1/pick-random-user/manifest.json` }]);
  assert.deepEqual(plugin.maintainers, ['alice']);
});
