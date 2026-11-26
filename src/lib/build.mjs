// Central build of a plugin at an exact commit. The plugin's own code (npm
// install and its build script) only ever runs inside a throwaway container:
// no credentials, no capabilities, and no network for the build step unless
// the catalog declares an exception. Whoever calls this must not hold any
// publishing key in the same job.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { userInfo } from 'node:os';

function run(command, args, options = {}) {
  console.log(`$ ${command} ${args.join(' ')}`);
  execFileSync(command, args, { stdio: 'inherit', ...options });
}

/** Fetches exactly `commit` (never a tag: a tag can be moved) into `dir`. */
export function fetchSource(repository, commit, dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  run('git', ['init', '--quiet', dir]);
  run('git', ['-C', dir, 'fetch', '--quiet', '--depth', '1', repository, commit]);
  run('git', ['-C', dir, 'checkout', '--quiet', '--detach', commit]);
  const head = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (head !== commit) throw new Error(`Checked out ${head}, expected ${commit}`);
}

/** Minimum plugin contract that can be checked before running anything. */
export function sourceContractErrors(dir, build) {
  const errors = [];
  if (!existsSync(join(dir, 'package-lock.json'))) errors.push('package-lock.json is missing (the build must be reproducible)');
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) return [...errors, 'package.json is missing'];
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (!pkg.scripts?.['build-bundle']) errors.push('package.json has no "build-bundle" script');
  if (!build.allowInstallScripts && pkg.scripts && ['preinstall', 'install', 'postinstall', 'prepare'].some((s) => pkg.scripts[s])) {
    // They are skipped (--ignore-scripts); this is only reported so the maintainer knows.
    console.warn('note: the plugin declares install scripts; they are not run by the central build');
  }
  return errors;
}

function containerArgs(sourceDir, { network }) {
  const { uid, gid } = userInfo();
  return [
    'run', '--rm',
    '--user', `${uid}:${gid}`,
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--network', network ? 'bridge' : 'none',
    '--env', 'HOME=/tmp/home',
    '--env', 'npm_config_cache=/tmp/home/.npm',
    '--env', 'npm_config_update_notifier=false',
    '--env', 'CI=true',
    '--volume', `${resolve(sourceDir)}:/src`,
    '--workdir', '/src',
  ];
}

/**
 * Builds the checked-out plugin in `sourceDir`. `build` carries the catalog
 * exceptions (nodeVersion, allowNetwork, allowInstallScripts, outputDir).
 * Returns the absolute path of the output folder.
 */
export function buildInContainer(sourceDir, build) {
  const image = `node:${build.nodeVersion}`;
  const installArgs = ['npm', 'ci', '--no-audit', '--no-fund'];
  if (!build.allowInstallScripts) installArgs.push('--ignore-scripts');
  // Installing dependencies is the only step with network access by default.
  run('docker', [...containerArgs(sourceDir, { network: true }), image, ...installArgs]);
  run('docker', [...containerArgs(sourceDir, { network: build.allowNetwork }), image, 'npm', 'run', 'build-bundle']);
  const output = resolve(sourceDir, build.outputDir);
  if (!existsSync(join(output, 'manifest.json'))) throw new Error(`The build did not produce ${build.outputDir}/manifest.json`);
  return { output, image };
}
