// A plugin id names the folders of the plugin, in this repository and on the
// object storage, so it can never change after the first publication.

export const PLUGIN_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Top-level names on the object storage that are not plugins.
export const RESERVED_IDS = new Set(['bbb', 'sdk', 'catalog', 'catalog.json', 'schemas', 'latest']);

export function isValidPluginId(id) {
  return PLUGIN_ID_PATTERN.test(id) && !RESERVED_IDS.has(id);
}

/** "https://github.com/o/bbb-plugin-pick-random-user" -> "pick-random-user". */
export function idFromRepository(repositoryUrl) {
  const name = new URL(repositoryUrl).pathname.split('/').filter(Boolean)[1] ?? '';
  return name.startsWith('bbb-plugin-') ? name.slice('bbb-plugin-'.length) : null;
}

/** { owner, repo } of a GitHub repository URL. */
export function parseRepository(repositoryUrl) {
  const [owner, repo] = new URL(repositoryUrl).pathname.split('/').filter(Boolean);
  return { owner, repo };
}
