#!/usr/bin/env node
// Bot 2. Runs when the `deploy` label is applied and when the verification
// build of a PR finishes. Does not trust the label: checks the deploy rules
// again, then that the PR author maintains the plugin (maintainers.json on the
// base branch), that the tag points to the commit and that the verification
// build passed, and merges without human review.
//
// Environment: GH_TOKEN (GitHub App installation token), GITHUB_REPOSITORY,
// GITHUB_EVENT_NAME, GITHUB_EVENT_PATH, VERIFY_CHECK_NAME (default verify-build),
// DEFAULT_BRANCH (default main).

import { readFileSync } from 'node:fs';
import { GitHub } from '../lib/github.js';
import { DEPLOY_LABEL, checkMergeConditions } from '../lib/deploy-pr.js';
import { evaluateDeployPr, reasonsMessage, upsertBotComment } from '../lib/deploy-evaluation.js';
import { resolveVersionTag } from '../lib/tags.js';

const repo = process.env.GITHUB_REPOSITORY;
const checkName = process.env.VERIFY_CHECK_NAME || 'verify-build';
const defaultBranch = process.env.DEFAULT_BRANCH || 'main';
const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
const gh = new GitHub({ token: process.env.GH_TOKEN });

async function candidatePrs() {
  if (event.pull_request) return [event.pull_request.number];
  // workflow_run: the PR list in the payload is empty for forks, so match by head sha.
  const headSha = event.workflow_run?.head_sha;
  if (!headSha) return [];
  const open = await gh.paginate(`/repos/${repo}/pulls?state=open&base=${defaultBranch}`);
  return open.filter((p) => p.head.sha === headSha).map((p) => p.number);
}

async function verifyBuildConclusion(sha) {
  const result = await gh.get(`/repos/${repo}/commits/${sha}/check-runs?check_name=${encodeURIComponent(checkName)}&filter=latest`);
  const runs = (result?.check_runs ?? []).filter((run) => run.app?.slug === 'github-actions');
  if (!runs.length) return undefined;
  const run = runs[0];
  return run.status === 'completed' ? run.conclusion : run.status;
}

async function handlePullRequest(number) {
  const pr = await gh.get(`/repos/${repo}/pulls/${number}`);
  if (pr.state !== 'open' || pr.draft || pr.base.ref !== defaultBranch) return console.log(`PR ${number}: not an open PR against ${defaultBranch}`);
  if (!pr.labels.some((l) => l.name === DEPLOY_LABEL)) return console.log(`PR ${number}: no ${DEPLOY_LABEL} label`);

  const evaluation = await evaluateDeployPr(gh, repo, pr);
  const reasons = [...evaluation.reasons];
  if (!reasons.length) {
    const { headRelease, base } = evaluation;
    const verifyBuild = await verifyBuildConclusion(pr.head.sha);
    if (verifyBuild === undefined || ['queued', 'in_progress', 'pending', 'waiting', 'requested'].includes(verifyBuild)) {
      // The verify workflow wakes this bot again when it finishes.
      return console.log(`PR ${number}: verification build is ${verifyBuild ?? 'not started'}; waiting`);
    }
    const tag = resolveVersionTag(base.plugin.repository, headRelease.version, headRelease.commit);
    reasons.push(...checkMergeConditions({ author: pr.user.login, maintainers: base.maintainers, tag, verifyBuild }).reasons);
  }
  if (reasons.length) {
    await gh.delete(`/repos/${repo}/issues/${number}/labels/${DEPLOY_LABEL}`);
    await upsertBotComment(gh, repo, number, reasonsMessage('Automatic merge refused:', reasons));
    return console.log(`PR ${number}: refused\n  ${reasons.join('\n  ')}`);
  }

  // `sha` makes GitHub refuse the merge if a commit arrived after the checks.
  await gh.put(`/repos/${repo}/pulls/${number}/merge`, {
    sha: pr.head.sha,
    merge_method: 'squash',
    commit_title: `${pr.title} (#${number})`,
  });
  const merged = await gh.get(`/repos/${repo}/pulls/${number}`);
  if (!merged.merged) throw new Error(`PR ${number}: the merge call returned but the PR is not merged`);
  console.log(`PR ${number}: merged as ${merged.merge_commit_sha}`);
}

for (const number of await candidatePrs()) await handlePullRequest(number);
