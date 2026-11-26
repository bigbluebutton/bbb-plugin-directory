import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkDeployShape, checkReleaseChange, checkMergeConditions } from '../src/lib/deploy-pr.js';

const COMMIT = 'a'.repeat(40);
const release = (version, extra = {}) => ({ version, commit: COMMIT, ...extra });
const production = { name: 'BbbPluginPickRandomUser', status: 'production' };
const releaseFile = (status = 'modified') => [{ filename: 'plugins/pick-random-user/release.json', status }];

test('a deploy title and a single release.json change pass the shape check', () => {
  assert.deepEqual(checkDeployShape({ title: 'deploy: pick-random-user 0.1.5', files: releaseFile() }), {
    pluginId: 'pick-random-user', reasons: [],
  });
  assert.equal(checkDeployShape({ title: 'deploy: first release', files: releaseFile('added') }).pluginId, 'pick-random-user');
});

test('the shape check rejects a wrong title, extra files, maintainers changes and deletions', () => {
  assert.match(checkDeployShape({ title: 'Deploy pick-random-user', files: releaseFile() }).reasons[0], /title/);
  assert.match(checkDeployShape({ title: 'deploy:', files: releaseFile() }).reasons[0], /title/);
  const two = checkDeployShape({
    title: 'deploy: x',
    files: [...releaseFile(), { filename: 'plugins/pick-random-user/maintainers.json', status: 'modified' }],
  });
  assert.equal(two.pluginId, null);
  assert.ok(two.reasons.some((r) => /exactly one file/.test(r)));
  assert.ok(two.reasons.some((r) => /maintainers/.test(r)));
  const renamed = checkDeployShape({
    title: 'deploy: x',
    files: [{ filename: 'plugins/pick-random-user/release.json', previous_filename: 'plugins/pick-random-user/maintainers.json', status: 'renamed' }],
  });
  assert.ok(renamed.reasons.some((r) => /maintainers/.test(r)));
  assert.match(checkDeployShape({ title: 'deploy: x', files: [{ filename: 'src/lib/publish.js', status: 'modified' }] }).reasons[0], /must be plugins/);
  assert.match(checkDeployShape({ title: 'deploy: x', files: releaseFile('removed') }).reasons[0], /added or modified/);
  assert.match(checkDeployShape({ title: 'deploy: x', files: [] }).reasons[0], /exactly one/);
});

test('the release change must be a new, valid version of an admitted production plugin', () => {
  assert.deepEqual(checkReleaseChange({ base: { plugin: production, release: release('0.1.4') }, headRelease: release('0.1.5') }).reasons, []);
  assert.deepEqual(checkReleaseChange({ base: { plugin: production, release: null }, headRelease: release('0.1.4') }).reasons, []);
  assert.match(checkReleaseChange({ base: null, headRelease: release('1.0.0') }).reasons[0], /admitted/);
  assert.match(checkReleaseChange({ base: { plugin: { ...production, status: 'archived' }, release: null }, headRelease: release('1.0.0') }).reasons[0], /archived/);
  assert.match(checkReleaseChange({ base: { plugin: production, release: release('0.1.4') }, headRelease: release('0.1.4') }).reasons[0], /already/);
  assert.match(checkReleaseChange({ base: { plugin: production, release: null }, headRelease: { version: 'v1.0.0', commit: COMMIT } }).reasons[0], /release\.json/);
  assert.match(checkReleaseChange({ base: { plugin: production, release: null }, headRelease: new Error('Unexpected token') }).reasons[0], /not valid JSON/);
});

test('security entries can be added by a deploy PR but never changed or removed', () => {
  const base = { plugin: production, release: release('0.1.4', { security: [{ version: '0.1.2', fixedIn: '0.1.3' }] }) };
  const added = release('0.1.5', { security: [{ version: '0.1.2', fixedIn: '0.1.3' }, { version: '0.1.4', fixedIn: '0.1.5' }] });
  assert.deepEqual(checkReleaseChange({ base, headRelease: added }).reasons, []);
  const removed = release('0.1.5', { security: [{ version: '0.1.4', fixedIn: '0.1.5' }] });
  assert.match(checkReleaseChange({ base, headRelease: removed }).reasons[0], /changed or removed/);
  const future = release('0.1.5', { security: [{ version: '0.1.2', fixedIn: '0.1.3' }, { version: '0.1.5' }] });
  assert.match(checkReleaseChange({ base, headRelease: future }).reasons[0], /older/);
});

test('bot 2 needs a listed author, a tag on the commit and a green verification build', () => {
  const ok = { author: 'Alice', maintainers: { maintainers: ['alice'] }, tag: { name: 'v0.1.5', pointsToCommit: true }, verifyBuild: 'success' };
  assert.deepEqual(checkMergeConditions(ok).reasons, []);
  assert.match(checkMergeConditions({ ...ok, author: 'mallory' }).reasons[0], /not listed/);
  assert.match(checkMergeConditions({ ...ok, tag: null }).reasons[0], /no tag/);
  assert.match(checkMergeConditions({ ...ok, tag: { name: 'v0.1.5', pointsToCommit: false, commit: 'b'.repeat(40) } }).reasons[0], /points to/);
  assert.match(checkMergeConditions({ ...ok, verifyBuild: 'in_progress' }).reasons[0], /in_progress/);
  assert.match(checkMergeConditions({ ...ok, verifyBuild: undefined }).reasons[0], /missing/);
});
