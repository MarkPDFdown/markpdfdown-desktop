import { describe, expect, it } from 'vitest';
import { linuxEngineTargets } from '../prisma-engines.mjs';
import { DISTROS, checkDistroResult, dockerRunArgs } from '../verify-package-distros.mjs';

const ENGINE = 'rhel-openssl-3.0.x';
const LOADED = `  load ok    Prisma query engine (libquery_engine-${ENGINE}.so.node)\n`;

describe('DISTROS', () => {
  it.each(['x64', 'arm64'])('only expects engines that the %s package carries', (arch) => {
    for (const { engine } of DISTROS) {
      expect(linuxEngineTargets(arch)).toContain(engine[arch]);
    }
  });

  it('covers every x64 engine except the one of the Ubuntu build machine', () => {
    const covered = new Set(DISTROS.map(({ engine }) => engine.x64));
    expect([...covered].sort()).toEqual(
      linuxEngineTargets('x64').filter((target) => target !== 'debian-openssl-3.0.x').sort(),
    );
  });
});

describe('dockerRunArgs', () => {
  it('mounts the package read-only and runs the load check after installing the libraries', () => {
    const args = dockerRunArgs({
      image: 'fedora:44',
      install: 'dnf install -y gtk3',
      appDir: '/repo/release/linux-unpacked',
      executableName: 'markpdfdown',
      scriptsDir: '/repo/scripts',
    });

    expect(args.slice(0, 2)).toEqual(['run', '--rm']);
    expect(args).toContain('/repo/release/linux-unpacked:/package:ro');
    expect(args).toContain('/repo/scripts:/scripts:ro');
    expect(args).toContain('fedora:44');
    expect(args.at(-1)).toBe(
      'dnf install -y gtk3 && ELECTRON_RUN_AS_NODE=1 /package/markpdfdown /scripts/package-load-check.cjs /package/resources',
    );
  });
});

describe('checkDistroResult', () => {
  it('accepts a run that loaded the expected engine', () => {
    expect(checkDistroResult({ status: 0, stdout: LOADED }, ENGINE)).toBeNull();
  });

  it('rejects a run that loaded the engine of another distro', () => {
    expect(checkDistroResult({ status: 0, stdout: LOADED }, 'rhel-openssl-1.1.x')).toBe(
      'Prisma did not load the rhel-openssl-1.1.x engine',
    );
  });

  it('reports a failed load check', () => {
    expect(checkDistroResult({ status: 1, stdout: '' }, ENGINE)).toBe('load check failed with exit code 1');
  });

  it('reports a machine without docker', () => {
    expect(checkDistroResult({ error: new Error('spawn docker ENOENT'), stdout: null }, ENGINE)).toBe(
      'could not run: spawn docker ENOENT',
    );
  });
});
