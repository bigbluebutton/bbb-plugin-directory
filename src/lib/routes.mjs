// Where a published version is served. Every version has a fixed folder
// (<id>/<version>/); the stable folders (bbb/<line>/<id>/ and sdk/<line>/<id>/)
// are overwritten with a copy of the newest compatible version. "Compatible"
// means the plugin loads on every SDK version shipped by the releases of the
// BigBlueButton line from its `minSupported` release on, so a server that has
// not upgraded inside a line keeps a working plugin behind the same URL.

import { compareVersions, parseVersion, satisfies, sdkLineOf } from './semver.mjs';

export const versionPrefix = (id, version) => `${id}/${version}/`;
export const bbbPrefix = (line, id) => `bbb/${line}/${id}/`;
export const sdkPrefix = (line, id) => `sdk/${line}/${id}/`;

/** SDK versions still in use per BBB line, keeping only supported lines. */
export function sdkVersionsInUse(table) {
  const result = {};
  for (const [line, data] of Object.entries(table.lines)) {
    if (!data.supported) continue;
    result[line] = [...new Set(
      Object.entries(data.releases)
        .filter(([release]) => compareVersions(release, data.minSupported) >= 0)
        .map(([, sdk]) => sdk),
    )].sort(compareVersions);
  }
  return result;
}

function compatibleWithAll(sdkVersions, requiredSdkVersion) {
  return sdkVersions.length > 0 && sdkVersions.every((sdk) => satisfies(sdk, requiredSdkVersion));
}

/**
 * Stable folders a plugin version may be copied to, given its manifest's
 * requiredSdkVersion. Pre-release plugin versions only get their own folder.
 */
export function stableTargets(table, id, pluginVersion, requiredSdkVersion) {
  if (parseVersion(pluginVersion).preRelease.length) return [];
  const inUse = sdkVersionsInUse(table);
  const targets = [];
  for (const [line, sdks] of Object.entries(inUse)) {
    if (compatibleWithAll(sdks, requiredSdkVersion)) targets.push({ kind: 'bbb', key: line, prefix: bbbPrefix(line, id) });
  }
  const bySdkLine = {};
  for (const sdk of Object.values(inUse).flat()) (bySdkLine[sdkLineOf(sdk)] ??= new Set()).add(sdk);
  for (const [line, sdks] of Object.entries(bySdkLine)) {
    if (compatibleWithAll([...sdks], requiredSdkVersion)) targets.push({ kind: 'sdk', key: line, prefix: sdkPrefix(line, id) });
  }
  return targets.sort((a, b) => a.prefix.localeCompare(b.prefix));
}

/** A stable folder only moves forward: it is replaced by a newer version, never an older one. */
export function shouldReplace(currentVersion, newVersion) {
  return currentVersion == null || compareVersions(newVersion, currentVersion) > 0;
}
