import { execFileSync } from 'node:child_process';
import { tagCandidates } from './deploy-pr.mjs';

/** Parses `git ls-remote --tags` output into { tagName: peeledCommit }. */
export function parseLsRemoteTags(output) {
  const direct = {};
  const peeled = {};
  for (const line of output.split('\n')) {
    const [sha, ref] = line.trim().split(/\s+/);
    if (!ref?.startsWith('refs/tags/')) continue;
    const name = ref.slice('refs/tags/'.length);
    if (name.endsWith('^{}')) peeled[name.slice(0, -3)] = sha;
    else direct[name] = sha;
  }
  return Object.fromEntries(Object.entries(direct).map(([name, sha]) => [name, peeled[name] ?? sha]));
}

/**
 * Finds the tag of `version` in the plugin repository and tells whether it
 * points to `commit`. Reads refs only; nothing from the repository runs.
 */
export function resolveVersionTag(repository, version, commit) {
  const output = execFileSync('git', ['ls-remote', '--tags', repository, ...tagCandidates(version).flatMap((t) => [`refs/tags/${t}`, `refs/tags/${t}^{}`])], { encoding: 'utf8' });
  const tags = parseLsRemoteTags(output);
  const name = tagCandidates(version).find((t) => tags[t]);
  if (!name) return null;
  return { name, commit: tags[name], pointsToCommit: tags[name] === commit };
}
