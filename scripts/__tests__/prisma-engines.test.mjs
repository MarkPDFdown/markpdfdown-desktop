import { describe, expect, it } from 'vitest';
import { binaryTargetsForHost, linuxEngineTargets } from '../prisma-engines.mjs';

describe('binaryTargetsForHost', () => {
  it.each([
    ['darwin', 'x64'],
    ['darwin', 'arm64'],
    ['win32', 'x64'],
  ])('keeps %s-%s on its single native engine', (platform, arch) => {
    expect(binaryTargetsForHost(platform, arch)).toEqual(['native']);
  });

  it('gives Linux x64 every distro family and libssl version', () => {
    expect(binaryTargetsForHost('linux', 'x64')).toEqual([
      'native',
      'debian-openssl-1.1.x',
      'debian-openssl-3.0.x',
      'rhel-openssl-1.1.x',
      'rhel-openssl-3.0.x',
    ]);
  });

  it('gives Linux arm64 only arm64 engines, which an x64 target would fail the arch check with', () => {
    expect(binaryTargetsForHost('linux', 'arm64')).toEqual([
      'native',
      'linux-arm64-openssl-1.1.x',
      'linux-arm64-openssl-3.0.x',
    ]);
  });
});

describe('linuxEngineTargets', () => {
  it('has nothing for an arch without a Linux package', () => {
    expect(linuxEngineTargets('ia32')).toEqual([]);
  });
});
