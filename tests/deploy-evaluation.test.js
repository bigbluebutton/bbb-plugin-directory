import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDeployPr, upsertBotComment, BOT_COMMENT_MARKER } from '../src/lib/deploy-evaluation.js';
import { parseLsRemoteTags } from '../src/lib/tags.js';
import { COMMIT, PLUGIN } from './helpers/fixtures.js';

// Fake GitHub: files keyed by "repo@ref:path".
function fakeGitHub({ files, prFiles }) {
  const calls = [];
  return {
    calls,
    async paginate(path) {
      calls.push(`GET ${path}`);
      if (path.endsWith('/files')) return prFiles;
      if (path.endsWith('/comments')) return this.comments ?? [];
      return [];
    },
    async fileText(repo, path, ref) {
      calls.push(`file ${repo}@${ref}:${path}`);
      return files[`${repo}@${ref}:${path}`] ?? null;
    },
    async post(path, body) { calls.push(`POST ${path} ${JSON.stringify(body)}`); },
    async patch(path, body) { calls.push(`PATCH ${path} ${JSON.stringify(body)}`); },
  };
}

const pr = (title = 'deploy: pick-random-user 0.1.5') => ({
  number: 7, title, base: { ref: 'main' }, head: { sha: 'f'.repeat(40), repo: { full_name: 'alice/bbb-plugin-directory' } },
});

const mainFiles = {
  'bigbluebutton/bbb-plugin-directory@main:plugins/pick-random-user/plugin.json': JSON.stringify(PLUGIN),
  'bigbluebutton/bbb-plugin-directory@main:plugins/pick-random-user/release.json': JSON.stringify({ version: '0.1.4', commit: COMMIT }),
  'bigbluebutton/bbb-plugin-directory@main:plugins/pick-random-user/maintainers.json': JSON.stringify({ maintainers: ['alice'] }),
};

test('the evaluation reads trusted data from main and the release from the PR head', async () => {
  const gh = fakeGitHub({
    prFiles: [{ filename: 'plugins/pick-random-user/release.json', status: 'modified' }],
    files: { ...mainFiles, [`alice/bbb-plugin-directory@${'f'.repeat(40)}:plugins/pick-random-user/release.json`]: JSON.stringify({ version: '0.1.5', commit: COMMIT }) },
  });
  const result = await evaluateDeployPr(gh, 'bigbluebutton/bbb-plugin-directory', pr());
  assert.deepEqual(result.reasons, []);
  assert.equal(result.pluginId, 'pick-random-user');
  assert.deepEqual(result.base.maintainers, { maintainers: ['alice'] });
  // maintainers.json is read from main, never from the PR.
  assert.ok(!gh.calls.some((c) => c.includes('alice/bbb-plugin-directory') && c.includes('maintainers.json')));
});

test('a broken release.json in the PR is reported, not thrown', async () => {
  const gh = fakeGitHub({
    prFiles: [{ filename: 'plugins/pick-random-user/release.json', status: 'modified' }],
    files: { ...mainFiles, [`alice/bbb-plugin-directory@${'f'.repeat(40)}:plugins/pick-random-user/release.json`]: '{ "version": ' },
  });
  const result = await evaluateDeployPr(gh, 'bigbluebutton/bbb-plugin-directory', pr());
  assert.match(result.reasons[0], /not valid JSON/);
});

test('a PR that is not a deploy request stops at the shape check without reading files', async () => {
  const gh = fakeGitHub({ prFiles: [{ filename: 'README.md', status: 'modified' }], files: {} });
  const result = await evaluateDeployPr(gh, 'bigbluebutton/bbb-plugin-directory', pr('Fix typo'));
  assert.equal(result.pluginId, null);
  assert.ok(!gh.calls.some((c) => c.startsWith('file ')));
});

test('the bot keeps a single comment per PR', async () => {
  const gh = fakeGitHub({ prFiles: [], files: {} });
  await upsertBotComment(gh, 'o/r', 7, 'first');
  assert.ok(gh.calls.at(-1).startsWith('POST /repos/o/r/issues/7/comments'));
  gh.comments = [{ id: 99, body: `${BOT_COMMENT_MARKER}\nfirst` }];
  await upsertBotComment(gh, 'o/r', 7, 'second');
  assert.ok(gh.calls.at(-1).startsWith('PATCH /repos/o/r/issues/comments/99'));
});

test('annotated tags resolve to the commit they point to', () => {
  const output = [
    `${'1'.repeat(40)}\trefs/tags/v0.1.4`,
    `${COMMIT}\trefs/tags/v0.1.4^{}`,
    `${'2'.repeat(40)}\trefs/tags/0.1.3`,
  ].join('\n');
  assert.deepEqual(parseLsRemoteTags(output), { 'v0.1.4': COMMIT, '0.1.3': '2'.repeat(40) });
});
