// Gathers, through the GitHub API only, what the deploy rules need about a PR
// and applies them. Shared by bot 1 (labels) and bot 2 (merges), so bot 2
// checks again everything bot 1 checked instead of trusting the label.

import { checkDeployShape, checkReleaseChange } from './deploy-pr.js';
import { parseJsonOrError } from './github.js';

const jsonOrNull = (text) => (text === null ? null : JSON.parse(text));

/** Returns { pluginId, reasons, base, headRelease }. */
export async function evaluateDeployPr(gh, repo, pr) {
  const files = await gh.paginate(`/repos/${repo}/pulls/${pr.number}/files`);
  const shape = checkDeployShape({ title: pr.title, files });
  if (!shape.pluginId) return { pluginId: null, reasons: shape.reasons };
  const dir = `plugins/${shape.pluginId}`;
  // Data at the base branch is what is trusted: plugin entry and maintainers.
  const baseRef = pr.base.ref;
  const base = {
    plugin: jsonOrNull(await gh.fileText(repo, `${dir}/plugin.json`, baseRef)),
    release: jsonOrNull(await gh.fileText(repo, `${dir}/release.json`, baseRef)),
    maintainers: jsonOrNull(await gh.fileText(repo, `${dir}/maintainers.json`, baseRef)),
  };
  const headText = await gh.fileText(pr.head.repo.full_name, `${dir}/release.json`, pr.head.sha);
  const headRelease = headText === null ? new Error('release.json not found at the PR head') : parseJsonOrError(headText);
  const { reasons } = checkReleaseChange({ base: base.plugin ? base : null, headRelease });
  return { pluginId: shape.pluginId, reasons, base, headRelease };
}

export const BOT_COMMENT_MARKER = '<!-- bbb-plugin-directory-bot -->';

/** Creates or updates the single bot comment of a PR. */
export async function upsertBotComment(gh, repo, number, body) {
  const comments = await gh.paginate(`/repos/${repo}/issues/${number}/comments`);
  const existing = comments.find((c) => c.body?.includes(BOT_COMMENT_MARKER));
  const text = `${BOT_COMMENT_MARKER}\n${body}`;
  if (existing) {
    if (existing.body !== text) await gh.patch(`/repos/${repo}/issues/comments/${existing.id}`, { body: text });
  } else {
    await gh.post(`/repos/${repo}/issues/${number}/comments`, { body: text });
  }
}

export function reasonsMessage(title, reasons) {
  return `${title}\n\n${reasons.map((r) => `- ${r}`).join('\n')}\n\nA directory maintainer reviews PRs that are not deploy requests.`;
}
