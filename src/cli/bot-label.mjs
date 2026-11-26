#!/usr/bin/env node
// Bot 1. Runs on pull_request_target (opened, synchronize, reopened, edited)
// with the base branch checked out. Reads the PR through the API only and
// applies the `deploy` label when the PR is a well-formed deploy request; on
// every new commit the label is removed and the checks run again.
//
// Environment: GH_TOKEN (GitHub App installation token), GITHUB_REPOSITORY, GITHUB_EVENT_PATH.

import { readFileSync } from 'node:fs';
import { GitHub } from '../lib/github.mjs';
import { DEPLOY_LABEL, DEPLOY_TITLE_PREFIX } from '../lib/deploy-pr.mjs';
import { evaluateDeployPr, reasonsMessage, upsertBotComment } from '../lib/deploy-evaluation.mjs';

const repo = process.env.GITHUB_REPOSITORY;
const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
const gh = new GitHub({ token: process.env.GH_TOKEN });
const number = event.pull_request.number;
const pr = await gh.get(`/repos/${repo}/pulls/${number}`);
const hasLabel = () => pr.labels.some((l) => l.name === DEPLOY_LABEL);

async function removeLabel() {
  if (hasLabel()) {
    await gh.delete(`/repos/${repo}/issues/${number}/labels/${DEPLOY_LABEL}`);
    pr.labels = pr.labels.filter((l) => l.name !== DEPLOY_LABEL);
    console.log('Removed the deploy label');
  }
}

if (pr.state !== 'open') process.exit(0);
// New commits always take the label away first: the checks run on the new head.
if (event.action === 'synchronize') await removeLabel();

const looksLikeDeploy = pr.title.startsWith(DEPLOY_TITLE_PREFIX);
const result = await evaluateDeployPr(gh, repo, pr);
if (result.reasons.length === 0) {
  if (!hasLabel()) await gh.post(`/repos/${repo}/issues/${number}/labels`, { labels: [DEPLOY_LABEL] });
  const readBack = await gh.get(`/repos/${repo}/issues/${number}/labels`);
  if (!readBack.some((l) => l.name === DEPLOY_LABEL)) throw new Error('The deploy label did not stick');
  console.log(`PR ${number} is a deploy request for ${result.pluginId}; labeled ${DEPLOY_LABEL}`);
  await upsertBotComment(gh, repo, number, `Deploy request for \`${result.pluginId}\` ${result.headRelease.version}: the shape checks passed. It is merged automatically once the author, the tag and the verification build are confirmed.`);
} else {
  await removeLabel();
  console.log(`PR ${number} is not a deploy request:\n  ${result.reasons.join('\n  ')}`);
  if (looksLikeDeploy) await upsertBotComment(gh, repo, number, reasonsMessage('This PR is titled as a deploy request but cannot be merged automatically:', result.reasons));
}
