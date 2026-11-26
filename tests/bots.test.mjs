// Runs both bots end to end against a fake GitHub API (a local HTTP server)
// and a local plugin repository with a real tag.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BOT_COMMENT_MARKER } from '../src/lib/deploy-evaluation.mjs';
import { tempDir } from './helpers/fixtures.mjs';

const run = promisify(execFile);
const REPO = 'bigbluebutton/bbb-plugin-directory';
const FORK = 'alice/bbb-plugin-directory';
const HEAD_SHA = 'f'.repeat(40);

function pluginRepoWithTag(tag) {
  const dir = tempDir('pd-plugin-');
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
  git('init', '--quiet');
  git('config', 'user.email', 'test@example.org');
  git('config', 'user.name', 'test');
  writeFileSync(join(dir, 'README.md'), 'plugin\n');
  git('add', '-A');
  git('commit', '--quiet', '-m', 'release');
  git('tag', '-a', tag, '-m', tag);
  return { dir, commit: git('rev-parse', 'HEAD') };
}

function fakeGitHub(state) {
  const calls = [];
  const b64 = (text) => Buffer.from(text).toString('base64');
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      const path = url.pathname;
      calls.push(`${req.method} ${path}`);
      const send = (status, data) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(data === undefined ? '' : JSON.stringify(data));
      };
      const pr = state.pr;
      const page = Number(url.searchParams.get('page') ?? 1);
      if (req.method === 'GET' && path === `/repos/${REPO}/pulls/7`) return send(200, { ...pr, labels: state.labels.map((name) => ({ name })) });
      if (req.method === 'GET' && path === `/repos/${REPO}/pulls`) return send(200, page === 1 ? [pr] : []);
      if (req.method === 'GET' && path === `/repos/${REPO}/pulls/7/files`) return send(200, page === 1 ? state.files : []);
      const contents = /^\/repos\/([^/]+\/[^/]+)\/contents\/(.+)$/.exec(path);
      if (req.method === 'GET' && contents) {
        const text = state.contents[`${contents[1]}@${url.searchParams.get('ref')}:${decodeURIComponent(contents[2])}`];
        return text === undefined ? send(404, { message: 'Not Found' }) : send(200, { type: 'file', content: b64(text) });
      }
      if (req.method === 'GET' && path === `/repos/${REPO}/issues/7/labels`) return send(200, state.labels.map((name) => ({ name })));
      if (req.method === 'POST' && path === `/repos/${REPO}/issues/7/labels`) {
        state.labels.push(...JSON.parse(body).labels);
        return send(200, []);
      }
      if (req.method === 'DELETE' && path === `/repos/${REPO}/issues/7/labels/deploy`) {
        if (!state.labels.includes('deploy')) return send(404, { message: 'Label does not exist' });
        state.labels = state.labels.filter((l) => l !== 'deploy');
        return send(200, []);
      }
      if (req.method === 'GET' && path === `/repos/${REPO}/issues/7/comments`) return send(200, page === 1 ? state.comments : []);
      if (req.method === 'POST' && path === `/repos/${REPO}/issues/7/comments`) {
        state.comments.push({ id: state.comments.length + 1, body: JSON.parse(body).body });
        return send(201, {});
      }
      if (req.method === 'PATCH' && path.startsWith(`/repos/${REPO}/issues/comments/`)) {
        const comment = state.comments.find((c) => String(c.id) === path.split('/').pop());
        comment.body = JSON.parse(body).body;
        return send(200, {});
      }
      if (req.method === 'GET' && path === `/repos/${REPO}/commits/${HEAD_SHA}/check-runs`) {
        return send(200, { check_runs: state.verifyBuild ? [{ app: { slug: 'github-actions' }, ...state.verifyBuild }] : [] });
      }
      if (req.method === 'PUT' && path === `/repos/${REPO}/pulls/7/merge`) {
        state.mergeRequest = JSON.parse(body);
        state.pr = { ...pr, merged: true, merge_commit_sha: 'c'.repeat(40) };
        return send(200, { merged: true });
      }
      return send(500, { message: `unexpected ${req.method} ${path}` });
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, calls, url: `http://127.0.0.1:${server.address().port}` })));
}

function scenario({ title = 'deploy: pick-random-user 0.1.5', author = 'alice', tagFor = 'v0.1.5', verifyBuild = { status: 'completed', conclusion: 'success' } } = {}) {
  const plugin = pluginRepoWithTag(tagFor);
  const pluginJson = JSON.stringify({ name: 'BbbPluginPickRandomUser', repository: plugin.dir, description: 'x', status: 'production' });
  return {
    pluginCommit: plugin.commit,
    state: {
      pr: {
        number: 7, title, state: 'open', draft: false, merged: false, user: { login: author },
        base: { ref: 'main' }, head: { sha: HEAD_SHA, repo: { full_name: FORK } },
      },
      labels: [],
      comments: [],
      files: [{ filename: 'plugins/pick-random-user/release.json', status: 'modified' }],
      contents: {
        [`${REPO}@main:plugins/pick-random-user/plugin.json`]: pluginJson,
        [`${REPO}@main:plugins/pick-random-user/release.json`]: JSON.stringify({ version: '0.1.4', commit: 'a'.repeat(40) }),
        [`${REPO}@main:plugins/pick-random-user/maintainers.json`]: JSON.stringify({ maintainers: ['alice'] }),
        [`${FORK}@${HEAD_SHA}:plugins/pick-random-user/release.json`]: JSON.stringify({ version: '0.1.5', commit: plugin.commit }),
      },
      verifyBuild,
    },
  };
}

async function runBot(script, api, event) {
  const eventPath = join(tempDir('pd-event-'), 'event.json');
  writeFileSync(eventPath, JSON.stringify(event));
  return run(process.execPath, [`src/cli/${script}`], {
    env: { ...process.env, GH_TOKEN: 'test', GITHUB_API_URL: api, GITHUB_REPOSITORY: REPO, GITHUB_EVENT_PATH: eventPath },
  });
}

test('bot 1 labels a well-formed deploy request and bot 2 merges it at the checked head', async () => {
  const { state } = scenario();
  const gh = await fakeGitHub(state);
  try {
    await runBot('bot-label.mjs', gh.url, { action: 'opened', pull_request: { number: 7 } });
    assert.deepEqual(state.labels, ['deploy']);
    await runBot('bot-merge.mjs', gh.url, { action: 'labeled', pull_request: { number: 7 } });
    assert.deepEqual(state.mergeRequest, { sha: HEAD_SHA, merge_method: 'squash', commit_title: 'deploy: pick-random-user 0.1.5 (#7)' });
    assert.ok(gh.calls.some((c) => c === `GET /repos/${REPO}/contents/plugins/pick-random-user/maintainers.json`));
  } finally {
    gh.server.close();
  }
});

test('bot 2 waits while the verification build runs, then merges when woken by its end', async () => {
  const { state } = scenario({ verifyBuild: { status: 'in_progress', conclusion: null } });
  state.labels = ['deploy'];
  const gh = await fakeGitHub(state);
  try {
    const waiting = await runBot('bot-merge.mjs', gh.url, { action: 'labeled', pull_request: { number: 7 } });
    assert.match(waiting.stdout, /waiting/);
    assert.equal(state.mergeRequest, undefined);
    assert.deepEqual(state.labels, ['deploy']);
    state.verifyBuild = { status: 'completed', conclusion: 'success' };
    await runBot('bot-merge.mjs', gh.url, { workflow_run: { head_sha: HEAD_SHA } });
    assert.equal(state.mergeRequest.sha, HEAD_SHA);
  } finally {
    gh.server.close();
  }
});

test('bot 2 refuses an author who is not a maintainer, a tag on another commit and a failed build', async () => {
  for (const [options, reason] of [
    [{ author: 'mallory' }, /not listed in the plugin's maintainers\.json/],
    [{ tagFor: 'v9.9.9' }, /no tag v<version>/],
    [{ verifyBuild: { status: 'completed', conclusion: 'failure' } }, /verify-build check is failure/],
  ]) {
    const { state } = scenario(options);
    state.labels = ['deploy'];
    const gh = await fakeGitHub(state);
    try {
      await runBot('bot-merge.mjs', gh.url, { action: 'labeled', pull_request: { number: 7 } });
      assert.equal(state.mergeRequest, undefined);
      assert.deepEqual(state.labels, []);
      assert.match(state.comments[0].body, reason);
      assert.ok(state.comments[0].body.startsWith(BOT_COMMENT_MARKER));
    } finally {
      gh.server.close();
    }
  }
});

test('bot 1 removes the label on a new commit and explains why the PR is not a deploy request', async () => {
  const { state } = scenario();
  state.labels = ['deploy'];
  state.files.push({ filename: 'plugins/pick-random-user/maintainers.json', status: 'modified' });
  const gh = await fakeGitHub(state);
  try {
    await runBot('bot-label.mjs', gh.url, { action: 'synchronize', pull_request: { number: 7 } });
    assert.deepEqual(state.labels, []);
    assert.match(state.comments[0].body, /may not change a maintainers\.json/);
    // Bot 2 woken anyway (e.g. a stale event) does nothing without the label.
    await runBot('bot-merge.mjs', gh.url, { action: 'labeled', pull_request: { number: 7 } });
    assert.equal(state.mergeRequest, undefined);
  } finally {
    gh.server.close();
  }
});
