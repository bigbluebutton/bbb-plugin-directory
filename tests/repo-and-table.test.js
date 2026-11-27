import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { repositoryErrors } from '../src/lib/repo.js';
import { generateSdkTable } from '../src/lib/sdk-table.js';
import { idFromRepository, isValidPluginId } from '../src/lib/plugin-ids.js';
import { COMMIT, PLUGIN, repoRoot, tempDir } from './helpers/fixtures.js';

test('this repository itself is valid', () => {
  assert.deepEqual(repositoryErrors(new URL('..', import.meta.url).pathname), []);
});

test('repository validation catches bad plugin folders', () => {
  assert.deepEqual(repositoryErrors(repoRoot({ release: { version: '0.1.4', commit: COMMIT } })), []);
  const wrongRepo = repoRoot({ plugin: { ...PLUGIN, repository: 'https://github.com/o/bbb-plugin-other' } });
  assert.match(repositoryErrors(wrongRepo).join('\n'), /must be named bbb-plugin-pick-random-user/);
  const badRelease = repoRoot({ release: { version: '0.1.4', commit: 'abc', security: [{ version: '0.1.3', fixedIn: '0.1.2' }] } });
  const errors = repositoryErrors(badRelease).join('\n');
  assert.match(errors, /commit/);
  assert.match(errors, /must be newer/);
  const noMaintainers = repoRoot();
  rmSync(join(noMaintainers, 'plugins', 'pick-random-user', 'maintainers.json'));
  assert.match(repositoryErrors(noMaintainers).join('\n'), /maintainers\.json: missing/);
  const noCodeowners = repoRoot();
  writeFileSync(join(noCodeowners, '.github', 'CODEOWNERS'), '');
  assert.match(repositoryErrors(noCodeowners).join('\n'), /CODEOWNERS/);
  const releaseOwned = repoRoot();
  writeFileSync(join(releaseOwned, '.github', 'CODEOWNERS'), '* @o/t\n/plugins/*/maintainers.json @o/t\n/plugins/*/release.json @o/t\n');
  assert.match(repositoryErrors(releaseOwned).join('\n'), /no owner/);
  const reserved = repoRoot();
  mkdirSync(join(reserved, 'plugins', 'sdk'));
  assert.match(repositoryErrors(reserved).join('\n'), /plugins\/sdk: invalid or reserved/);
});

test('plugin ids', () => {
  assert.equal(idFromRepository('https://github.com/bigbluebutton/bbb-plugin-pick-random-user'), 'pick-random-user');
  assert.equal(idFromRepository('https://github.com/x/some-plugin'), null);
  assert.equal(isValidPluginId('pick-random-user'), true);
  assert.equal(isValidPluginId('bbb'), false);
  assert.equal(isValidPluginId('Pick'), false);
});

test('the SDK table comes from the release tags and keeps the human-edited fields', () => {
  const dir = tempDir('pd-bbb-');
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { stdio: 'pipe' });
  git('init', '--quiet');
  git('config', 'user.email', 'test@example.org');
  git('config', 'user.name', 'test');
  const release = (tag, { properties, packageSdk }) => {
    mkdirSync(join(dir, 'bigbluebutton-web/grails-app/conf'), { recursive: true });
    mkdirSync(join(dir, 'bigbluebutton-html5'), { recursive: true });
    writeFileSync(join(dir, 'bigbluebutton-web/grails-app/conf/bigbluebutton.properties'), properties ? `a=b\nhtml5PluginSdkVersion=${properties}\n` : 'a=b\n');
    writeFileSync(join(dir, 'bigbluebutton-html5/package.json'), JSON.stringify({ dependencies: { 'bigbluebutton-html-plugin-sdk': packageSdk } }));
    git('add', '-A');
    git('commit', '--quiet', '-m', tag);
    git('tag', tag);
  };
  release('v2.7.0', { packageSdk: '0.0.1' });
  release('v3.0.0', { packageSdk: '0.0.73' });
  release('v3.0.1-rc.1', { packageSdk: '0.0.74' });
  release('v3.0.42', { properties: '0.0.105', packageSdk: '0.0.104' });
  release('v4.0.0', { packageSdk: 'v1.0.0-beta.3' });
  const previous = { lines: { '3.0': { supported: false, minSupported: '3.0.42', releases: {} } } };
  assert.deepEqual(generateSdkTable(dir, previous).lines, {
    '3.0': { supported: false, minSupported: '3.0.42', releases: { '3.0.0': '0.0.73', '3.0.42': '0.0.105' } },
    '4.0': { supported: true, minSupported: '4.0.0', releases: { '4.0.0': '1.0.0-beta.3' } },
  });
});
