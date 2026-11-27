// Rules that decide whether a pull request is a deploy request that may be
// merged without human review. Pure functions: the bots gather the data
// (changed files, files at the base branch, files at the PR head) through the
// GitHub API and never check out or run anything from the PR.

import { isDeepStrictEqual } from 'node:util';
import { schemaErrors } from './schemas.js';
import { compareVersions } from './semver.js';

export const DEPLOY_TITLE_PREFIX = 'deploy:';
const RELEASE_FILE_PATTERN = /^plugins\/([a-z0-9]+(?:-[a-z0-9]+)*)\/release\.json$/;

/** Checks only the PR's title and changed files. Returns { pluginId, reasons }. */
export function checkDeployShape({ title, files }) {
  const reasons = [];
  if (!title.startsWith(DEPLOY_TITLE_PREFIX) || !title.slice(DEPLOY_TITLE_PREFIX.length).trim()) {
    reasons.push(`the title must start with "${DEPLOY_TITLE_PREFIX}" followed by a description`);
  }
  if (files.length !== 1) {
    reasons.push(`a deploy PR changes exactly one file, plugins/<plugin>/release.json (this one changes ${files.length})`);
  }
  if (files.some((f) => /\/maintainers\.json$/.test(f.filename) || /\/maintainers\.json$/.test(f.previous_filename ?? ''))) {
    reasons.push('a deploy PR may not change a maintainers.json file');
  }
  const file = files.length === 1 ? files[0] : null;
  const match = file ? RELEASE_FILE_PATTERN.exec(file.filename) : null;
  if (file && !match) reasons.push(`the changed file must be plugins/<plugin>/release.json, not ${file.filename}`);
  if (file && match && !['added', 'modified'].includes(file.status)) {
    reasons.push(`release.json must be added or modified, not ${file.status}`);
  }
  return { pluginId: match && reasons.length === 0 ? match[1] : null, reasons };
}

/**
 * Checks the content of the change. `base` is what main holds for the plugin
 * ({ plugin, release } with release null before the first publication);
 * `headRelease` is the parsed release.json of the PR (or an Error).
 */
export function checkReleaseChange({ base, headRelease }) {
  const reasons = [];
  if (!base?.plugin) return { reasons: ['the plugin is not in the directory yet: it is admitted by a reviewed PR first'] };
  if (base.plugin.status !== 'production') reasons.push(`the plugin status is ${base.plugin.status}; only production plugins publish versions`);
  if (headRelease instanceof Error) return { reasons: [...reasons, `release.json is not valid JSON: ${headRelease.message}`] };
  const schema = schemaErrors('release', headRelease);
  if (schema.length) return { reasons: [...reasons, ...schema.map((m) => `release.json ${m}`)] };
  if (base.release && base.release.version === headRelease.version) {
    reasons.push(`version ${headRelease.version} is already the published release`);
  }
  const headSecurity = headRelease.security ?? [];
  for (const entry of base.release?.security ?? []) {
    if (!headSecurity.some((e) => isDeepStrictEqual(e, entry))) {
      reasons.push(`the security entry for ${entry.version} was changed or removed; that needs human review`);
    }
  }
  for (const entry of headSecurity) {
    if (compareVersions(entry.version, headRelease.version) >= 0) {
      reasons.push(`security entry ${entry.version} must be older than the version being published`);
    }
  }
  return { reasons };
}

/** Candidate tag names for a version, in the order they are tried. */
export function tagCandidates(version) {
  return [`v${version}`, version];
}

/** Checks the bot adds on top of the PR's shape and content. */
export function checkMergeConditions({ author, maintainers, tag, verifyBuild }) {
  const reasons = [];
  if (!maintainers?.maintainers?.some((login) => login.toLowerCase() === author.toLowerCase())) {
    reasons.push(`@${author} is not listed in the plugin's maintainers.json on the main branch`);
  }
  if (!tag?.name) reasons.push('the plugin repository has no tag v<version> (or <version>) for this version');
  else if (!tag.pointsToCommit) reasons.push(`tag ${tag.name} points to ${tag.commit}, not to the commit in release.json`);
  if (verifyBuild !== 'success') reasons.push(`the verify-build check is ${verifyBuild ?? 'missing'}, not success`);
  return { reasons };
}
