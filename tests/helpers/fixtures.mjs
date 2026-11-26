import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { preparePublication } from '../../src/lib/package.mjs';

export const COMMIT = '54df0eaae12dcd551bba3cfd2397a2b652be59e2';
export const PLUGIN = {
  name: 'BbbPluginPickRandomUser',
  repository: 'https://github.com/bigbluebutton/bbb-plugin-pick-random-user',
  description: 'Picks a random user from the meeting.',
  status: 'production',
};

export function tempDir(prefix = 'pd-test-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** A build output shaped like the one of bbb-plugin-pick-random-user. */
export function fakeBuildOutput({ version = '0.1.4', requiredSdkVersion = '^1.0.0-beta.2', bundle = 'BbbPluginPickRandomUser.js', extra = {} } = {}) {
  const dir = tempDir('pd-build-');
  mkdirSync(join(dir, 'locales'));
  writeFileSync(join(dir, bundle), `console.log("bundle ${version}");\n`);
  writeFileSync(join(dir, 'locales', 'en.json'), '{"hello":"Hello"}\n');
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({
    requiredSdkVersion, name: PLUGIN.name, version, javascriptEntrypointUrl: bundle, localesBaseUrl: 'locales', ...extra,
  }));
  return dir;
}

export function prepared({ version = '0.1.4', requiredSdkVersion, bundle } = {}) {
  const outputDir = fakeBuildOutput({ version, requiredSdkVersion, bundle });
  const targetDir = tempDir('pd-pub-');
  const { contract } = preparePublication({
    outputDir,
    targetDir,
    id: 'pick-random-user',
    plugin: PLUGIN,
    release: { version, commit: COMMIT },
    source: { repository: PLUGIN.repository, commit: COMMIT, tag: `v${version}` },
    build: { nodeImage: 'node:24', allowNetwork: false, allowInstallScripts: false, builtAt: '2026-11-26T00:00:00.000Z' },
  });
  return { dir: targetDir, contract };
}

/** A directory repository root with one plugin. */
export function repoRoot({ release = null, maintainers = ['alice'], plugin = PLUGIN, table } = {}) {
  const root = tempDir('pd-root-');
  mkdirSync(join(root, 'plugins', 'pick-random-user'), { recursive: true });
  mkdirSync(join(root, 'data'));
  mkdirSync(join(root, '.github'));
  writeFileSync(join(root, '.github', 'CODEOWNERS'), '* @o/t\n/plugins/*/release.json\n/plugins/*/maintainers.json @o/t\n');
  writeFileSync(join(root, 'plugins', 'pick-random-user', 'plugin.json'), JSON.stringify(plugin));
  writeFileSync(join(root, 'plugins', 'pick-random-user', 'maintainers.json'), JSON.stringify({ maintainers }));
  if (release) writeFileSync(join(root, 'plugins', 'pick-random-user', 'release.json'), JSON.stringify(release));
  writeFileSync(join(root, 'data', 'bbb-sdk-versions.json'), JSON.stringify(table ?? {
    lines: {
      '3.0': { supported: true, minSupported: '3.0.0', releases: { '3.0.0': '0.0.73', '3.0.42': '0.0.105' } },
      '4.0': { supported: true, minSupported: '4.0.0', releases: { '4.0.0': '1.0.0-beta.3', '4.0.4': '1.0.0-beta.3' } },
    },
  }));
  return root;
}
