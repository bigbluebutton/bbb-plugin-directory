#!/usr/bin/env node
// The deploy bot. Runs when the verification build or the CI of a PR
// finishes. For a PR titled `deploy:` it checks the deploy rules, that the PR
// author maintains the plugin (maintainers.json on the base branch), that the
// tag points to the commit and that the verification build passed, merges
// without human review and dispatches the Publish workflow for the plugin
// (a merge made with GITHUB_TOKEN does not trigger workflows; a dispatch does).
//
// Environment: GH_TOKEN (the workflow's GITHUB_TOKEN), GITHUB_REPOSITORY,
// GITHUB_EVENT_PATH, VERIFY_CHECK_NAME (default verify-build),
// DEFAULT_BRANCH (default main).

import { readFileSync } from 'node:fs';
import { GitHub } from '../lib/github.js';
import { DEPLOY_TITLE_PREFIX, checkMergeConditions } from '../lib/deploy-pr.js';
import { evaluateDeployPr, reasonsMessage, upsertBotComment } from '../lib/deploy-evaluation.js';
import { resolveVersionTag } from '../lib/tags.js';

const repo = process.env.GITHUB_REPOSITORY;
const checkName = process.env.VERIFY_CHECK_NAME || 'verify-build';
const defaultBranch = process.env.DEFAULT_BRANCH || 'main';
const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
const gh = new GitHub({ token: process.env.GH_TOKEN });

async function candidatePrs() {
  // The PR list in the workflow_run payload is empty for forks, so match by head sha.
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
  if (!pr.title.startsWith(DEPLOY_TITLE_PREFIX)) return console.log(`PR ${number}: not a deploy request`);

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
  // If this call fails the run turns red and nothing is published: run Publish by hand.
  await gh.post(`/repos/${repo}/actions/workflows/publish.yml/dispatches`, {
    ref: defaultBranch,
    inputs: { plugin: evaluation.pluginId },
  });
  console.log(`PR ${number}: dispatched Publish for ${evaluation.pluginId}`);
}

for (const number of await candidatePrs()) await handlePullRequest(number);
