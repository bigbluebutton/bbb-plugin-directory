// Generates catalog.json. What is published comes from the object storage
// itself (the contract file of each folder), so the catalog always describes
// what servers will actually download; the descriptive data and the security
// marks come from this repository.

import { CONTRACT_FILE } from './package.mjs';
import { assertSchema } from './schemas.mjs';
import { compareVersions } from './semver.mjs';
import { listPluginIds, loadPlugin } from './repo.mjs';
import { versionPrefix } from './routes.mjs';
import { joinUrl } from './verify.mjs';

async function stableRoutes(storage, kind, id, baseUrl) {
  const routes = [];
  for (const key of await storage.listFolders(`${kind}/`)) {
    const prefix = `${kind}/${key}/${id}/`;
    const contract = await storage.getJson(`${prefix}${CONTRACT_FILE}`);
    if (contract) routes.push({ key, version: contract.version, manifestUrl: joinUrl(baseUrl, `${prefix}manifest.json`) });
  }
  return routes.sort((a, b) => compareVersions(asVersion(b.key), asVersion(a.key)));
}

/** "4.0" -> "4.0.0", "1" -> "1.0.0": line names sorted like versions, newest first. */
function asVersion(line) {
  const parts = line.split('.');
  while (parts.length < 3) parts.push('0');
  return parts.join('.');
}

function securityOf(release, version) {
  const entry = (release?.security ?? []).find((e) => e.version === version);
  if (!entry) return { vulnerable: false, fixedIn: null };
  return { vulnerable: true, fixedIn: entry.fixedIn ?? null, ...(entry.advisory ? { advisory: entry.advisory } : {}) };
}

export async function buildCatalog({ storage, root, baseUrl, generatedAt = new Date().toISOString() }) {
  const plugins = [];
  for (const id of listPluginIds(root)) {
    const { plugin, maintainers, release } = loadPlugin(root, id);
    const versions = [];
    for (const version of await storage.listFolders(`${id}/`)) {
      const contract = await storage.getJson(`${versionPrefix(id, version)}${CONTRACT_FILE}`);
      // A folder without a contract is an interrupted upload, not a version.
      if (!contract) continue;
      versions.push({
        version: contract.version,
        commit: contract.commit,
        tag: contract.tag,
        requiredSdkVersion: contract.requiredSdkVersion,
        manifestUrl: joinUrl(baseUrl, `${versionPrefix(id, version)}manifest.json`),
        contractUrl: joinUrl(baseUrl, `${versionPrefix(id, version)}${CONTRACT_FILE}`),
        manifestSha256: contract.manifestSha256,
        bundleSha256: contract.bundleSha256,
        security: securityOf(release, contract.version),
      });
    }
    versions.sort((a, b) => compareVersions(b.version, a.version));
    const perBbbVersion = (await stableRoutes(storage, 'bbb', id, baseUrl)).map(({ key, ...rest }) => ({ bbb: key, ...rest }));
    const perSdkLine = (await stableRoutes(storage, 'sdk', id, baseUrl)).map(({ key, ...rest }) => ({ sdk: key, ...rest }));
    plugins.push({
      id,
      name: plugin.name,
      repository: plugin.repository,
      description: plugin.description,
      status: plugin.status,
      maintainers: maintainers.maintainers,
      versions,
      perBbbVersion,
      perSdkLine,
    });
  }
  return assertSchema('catalog', { schemaVersion: 1, generatedAt, baseUrl, plugins }, 'catalog.json');
}
