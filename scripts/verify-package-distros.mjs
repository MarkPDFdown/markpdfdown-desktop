#!/usr/bin/env node

/**
 * Loads an unpacked Linux package's native modules on other distros, in containers, and checks
 * that Prisma picks the engine meant for each. verify-package-arch.mjs only covers the distro of
 * the build machine, while Prisma chooses its engine from the distro and libssl of the user's.
 *
 * Usage:
 *   npm run verify:package:distros                          # host arch
 *   npm run verify:package:distros -- --release-dir out
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { linuxEngineTargets } from './prisma-engines.mjs';
import { resolvePackageLayout } from './verify-package-arch.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_LIMIT_BYTES = 64 * 1024 * 1024;

const RPM_LIBRARIES = 'gtk3 nss mesa-libgbm alsa-lib openssl';
const dnfInstall = (options = '') =>
  `dnf install -y -q --setopt=install_weak_deps=False ${options} ${RPM_LIBRARIES}`;
const APT =
  'apt-get update -qq && apt-get install -y -qq --no-install-recommends libgtk-3-0 libnss3 libgbm1 libasound2 openssl';

/** One distro per combination of family and libssl that the build machine itself doesn't cover. */
export const DISTROS = [
  {
    image: 'fedora:44',
    // Nothing here needs Cisco's OpenH264, and a third-party mirror shouldn't be able to fail the check.
    install: dnfInstall('--disablerepo=fedora-cisco-openh264'),
    engine: { x64: 'rhel-openssl-3.0.x', arm64: 'linux-arm64-openssl-3.0.x' },
  },
  { image: 'rockylinux:8', install: dnfInstall(), engine: { x64: 'rhel-openssl-1.1.x', arm64: 'linux-arm64-openssl-1.1.x' } },
  // Not debian:11, whose packages have started to disappear from the mirrors now that LTS is over.
  { image: 'ubuntu:20.04', install: APT, engine: { x64: 'debian-openssl-1.1.x', arm64: 'linux-arm64-openssl-1.1.x' } },
];

/** Mounts all of scripts/, since the load check requires files next to it. */
export function dockerRunArgs({ image, install, appDir, executableName, scriptsDir }) {
  return [
    'run',
    '--rm',
    '--volume', `${appDir}:/package:ro`,
    '--volume', `${scriptsDir}:/scripts:ro`,
    image,
    'bash',
    '-c',
    `${install} && ELECTRON_RUN_AS_NODE=1 /package/${executableName} /scripts/package-load-check.cjs /package/resources`,
  ];
}

/** @returns {string | null} what's wrong with a container's run, null when it's fine */
export function checkDistroResult({ status, stdout, error }, expectedEngine) {
  if (error) return `could not run: ${error.message}`;
  if (status !== 0) return `load check failed with exit code ${status}`;
  if (!stdout.includes(`libquery_engine-${expectedEngine}.so.node`)) {
    return `Prisma did not load the ${expectedEngine} engine`;
  }
  return null;
}

function main() {
  const { values } = parseArgs({
    options: {
      arch: { type: 'string', default: process.arch },
      'release-dir': { type: 'string', default: 'release' },
    },
  });
  const { arch } = values;
  if (linuxEngineTargets(arch).length === 0) throw new Error(`Unsupported --arch "${arch}"`);

  const packageJson = JSON.parse(readFileSync(path.join(SCRIPT_DIR, '..', 'package.json'), 'utf8'));
  const executableName = packageJson.name;
  const { resourcesDir } = resolvePackageLayout({
    releaseDir: path.resolve(values['release-dir']),
    platform: 'linux',
    arch,
    productName: packageJson.build.productName,
    executableName,
  });
  if (!existsSync(resourcesDir)) throw new Error(`Package not found at ${resourcesDir}. Was linux-${arch} built?`);

  const problems = [];
  for (const { image, install, engine } of DISTROS) {
    console.log(`\nChecking ${image}, expecting ${engine[arch]}`);
    const result = spawnSync(
      'docker',
      dockerRunArgs({
        image,
        install,
        appDir: path.dirname(resourcesDir),
        executableName,
        scriptsDir: SCRIPT_DIR,
      }),
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: OUTPUT_LIMIT_BYTES },
    );
    if (result.stdout) process.stdout.write(result.stdout);
    const problem = checkDistroResult(result, engine[arch]);
    if (problem) problems.push(`${image}: ${problem}`);
  }

  if (problems.length > 0) {
    console.error(`\n${problems.length} problem(s) found:`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log(`\nPackage linux-${arch} loads on ${DISTROS.map(({ image }) => image).join(', ')}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
