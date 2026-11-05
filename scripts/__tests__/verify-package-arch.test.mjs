import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseBinaryHeader, resolvePackageLayout, verifyBinaries } from '../verify-package-arch.mjs';

const CPU_TYPE = { x64: 0x01000007, arm64: 0x0100000c };

function elf(machine) {
  const buffer = Buffer.alloc(64);
  buffer.write('\x7fELF', 0, 'latin1');
  buffer[4] = 2; // 64-bit
  buffer[5] = 1; // little endian
  buffer.writeUInt16LE(machine, 18);
  return buffer;
}

function macho(arch) {
  const buffer = Buffer.alloc(32);
  buffer.writeUInt32LE(0xfeedfacf, 0);
  buffer.writeInt32LE(CPU_TYPE[arch], 4);
  return buffer;
}

function fatMacho(archs) {
  const buffer = Buffer.alloc(8 + archs.length * 20);
  buffer.writeUInt32BE(0xcafebabe, 0);
  buffer.writeUInt32BE(archs.length, 4);
  archs.forEach((arch, i) => buffer.writeInt32BE(CPU_TYPE[arch], 8 + i * 20));
  return buffer;
}

function pe(machine) {
  const buffer = Buffer.alloc(0x100);
  buffer.write('MZ', 0, 'latin1');
  buffer.writeUInt32LE(0x80, 0x3c);
  buffer.write('PE\0\0', 0x80, 'latin1');
  buffer.writeUInt16LE(machine, 0x84);
  return buffer;
}

describe('parseBinaryHeader', () => {
  it.each([
    ['ELF x64', elf(62), { format: 'elf', archs: ['x64'] }],
    ['ELF arm64', elf(183), { format: 'elf', archs: ['arm64'] }],
    ['Mach-O x64', macho('x64'), { format: 'macho', archs: ['x64'] }],
    ['Mach-O arm64', macho('arm64'), { format: 'macho', archs: ['arm64'] }],
    ['fat Mach-O', fatMacho(['x64', 'arm64']), { format: 'macho', archs: ['x64', 'arm64'] }],
    ['PE x64', pe(0x8664), { format: 'pe', archs: ['x64'] }],
    ['PE arm64', pe(0xaa64), { format: 'pe', archs: ['arm64'] }],
    ['PE ia32', pe(0x14c), { format: 'pe', archs: ['ia32'] }],
  ])('recognises %s', (_name, header, expected) => {
    expect(parseBinaryHeader(header)).toEqual(expected);
  });

  it('labels an unrecognised machine instead of treating the file as non-native', () => {
    expect(parseBinaryHeader(elf(0x1234))).toEqual({ format: 'elf', archs: ['unknown(0x1234)'] });
  });

  it.each([
    ['text starting with MZ', Buffer.from('MZ is not a PE file, and this text is long enough to be read as one'.padEnd(0x100))],
    ['Java class file (same magic as fat Mach-O)', Buffer.from([0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 61])],
    ['JavaScript', Buffer.from('module.exports = {};\n')],
    ['a file shorter than a header', Buffer.from('hi')],
  ])('ignores %s', (_name, content) => {
    expect(parseBinaryHeader(content)).toBeNull();
  });
});

describe('resolvePackageLayout', () => {
  const names = { releaseDir: 'release', productName: 'MarkPDFdown', executableName: 'markpdfdown' };

  it.each([
    ['mac', 'x64', 'release/mac/MarkPDFdown.app/Contents/Resources', 'release/mac/MarkPDFdown.app/Contents/MacOS/MarkPDFdown'],
    ['mac', 'arm64', 'release/mac-arm64/MarkPDFdown.app/Contents/Resources', 'release/mac-arm64/MarkPDFdown.app/Contents/MacOS/MarkPDFdown'],
    ['linux', 'x64', 'release/linux-unpacked/resources', 'release/linux-unpacked/markpdfdown'],
    ['linux', 'arm64', 'release/linux-arm64-unpacked/resources', 'release/linux-arm64-unpacked/markpdfdown'],
    ['win', 'x64', 'release/win-unpacked/resources', 'release/win-unpacked/MarkPDFdown.exe'],
  ])('finds the %s-%s package', (platform, arch, resourcesDir, executable) => {
    const layout = resolvePackageLayout({ ...names, platform, arch });
    expect(layout.resourcesDir.split(path.sep).join('/')).toBe(resourcesDir);
    expect(layout.executable.split(path.sep).join('/')).toBe(executable);
  });
});

describe('verifyBinaries', () => {
  let resourcesDir;
  let executable;

  const put = (relativePath, content) => {
    const filePath = path.join(resourcesDir, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  };

  /** The native files of an app package, with one header per file. */
  const putModules = (target, header) => {
    put(`app.asar.unpacked/node_modules/@napi-rs/canvas/node_modules/@napi-rs/canvas-${target}/skia.${target}.node`, header);
    put('node_modules/.prisma/client/libquery_engine-darwin.dylib.node', header);
  };

  const verifyMac = (arch) => verifyBinaries({ resourcesDir, executable, platform: 'mac', arch });

  beforeEach(() => {
    resourcesDir = mkdtempSync(path.join(tmpdir(), 'verify-package-arch-'));
    executable = path.join(resourcesDir, 'MarkPDFdown');
    writeFileSync(executable, macho('x64'));
  });

  afterEach(() => {
    rmSync(resourcesDir, { recursive: true, force: true });
  });

  it('accepts a package whose binaries all match', () => {
    putModules('darwin-x64', macho('x64'));
    put('app.asar.unpacked/node_modules/@napi-rs/canvas/package.json', '{}');

    const { problems, binaries } = verifyMac('x64');

    expect(problems).toEqual([]);
    expect(binaries).toHaveLength(3);
  });

  it('rejects the package from issue #77: an x64 app holding only arm64 modules', () => {
    putModules('darwin-arm64', macho('arm64'));

    const { problems } = verifyMac('x64');

    expect(problems.filter((p) => p.startsWith('Wrong architecture'))).toHaveLength(2);
    expect(problems).toContain('Missing native module for mac-x64: @napi-rs/canvas');
  });

  it('rejects a stray binary of another arch, even when all required modules are fine', () => {
    putModules('darwin-x64', macho('x64'));
    put('app.asar.unpacked/node_modules/@prisma/engines/schema-engine-darwin-arm64', macho('arm64'));

    const { problems } = verifyMac('x64');

    expect(problems).toEqual([
      'Wrong architecture: app.asar.unpacked/node_modules/@prisma/engines/schema-engine-darwin-arm64 is macho/arm64, expected macho/x64',
    ]);
  });

  it('rejects the right arch in the wrong binary format', () => {
    putModules('darwin-x64', macho('x64'));
    put('app.asar.unpacked/node_modules/some-module/native.node', elf(62));

    expect(verifyMac('x64').problems).toHaveLength(1);
  });

  it('accepts a universal binary that contains the target arch', () => {
    putModules('darwin-x64', fatMacho(['x64', 'arm64']));

    expect(verifyMac('x64').problems).toEqual([]);
  });

  it('rejects a package whose Electron executable has the wrong arch', () => {
    putModules('darwin-arm64', macho('arm64'));

    const { problems } = verifyMac('arm64');

    expect(problems).toEqual([expect.stringMatching(/^Wrong architecture: MarkPDFdown is macho\/x64/)]);
  });

  it('reports a missing Electron executable', () => {
    putModules('darwin-x64', macho('x64'));
    rmSync(executable);

    expect(verifyMac('x64').problems).toEqual([`Missing file: ${executable}`]);
  });

  it('accepts a Windows package, whose engine has no lib prefix', () => {
    writeFileSync(executable, pe(0x8664));
    put('app.asar.unpacked/node_modules/@napi-rs/canvas-win32-x64-msvc/skia.win32-x64-msvc.node', pe(0x8664));
    put('node_modules/.prisma/client/query_engine-windows.dll.node', pe(0x8664));

    expect(verifyBinaries({ resourcesDir, executable, platform: 'win', arch: 'x64' }).problems).toEqual([]);
  });

  it('accepts a Linux arm64 package with both of its engines', () => {
    writeFileSync(executable, elf(183));
    put('app.asar.unpacked/node_modules/@napi-rs/canvas-linux-arm64-gnu/skia.linux-arm64-gnu.node', elf(183));
    put('node_modules/.prisma/client/libquery_engine-linux-arm64-openssl-1.1.x.so.node', elf(183));
    put('node_modules/.prisma/client/libquery_engine-linux-arm64-openssl-3.0.x.so.node', elf(183));

    expect(verifyBinaries({ resourcesDir, executable, platform: 'linux', arch: 'arm64' }).problems).toEqual([]);
  });

  describe('Linux Prisma engines', () => {
    const X64_ENGINES = ['debian-openssl-1.1.x', 'debian-openssl-3.0.x', 'rhel-openssl-1.1.x', 'rhel-openssl-3.0.x'];

    const putLinuxX64Modules = (engines) => {
      writeFileSync(executable, elf(62));
      put('app.asar.unpacked/node_modules/@napi-rs/canvas-linux-x64-gnu/skia.linux-x64-gnu.node', elf(62));
      for (const engine of engines) {
        put(`node_modules/.prisma/client/libquery_engine-${engine}.so.node`, elf(62));
      }
    };

    const verifyLinuxX64 = () => verifyBinaries({ resourcesDir, executable, platform: 'linux', arch: 'x64' });

    it('accepts a package with the engine of every distro family and libssl version', () => {
      putLinuxX64Modules(X64_ENGINES);

      expect(verifyLinuxX64().problems).toEqual([]);
    });

    it('rejects the package from issue #86: only the engine of the build machine', () => {
      putLinuxX64Modules(['debian-openssl-3.0.x']);

      expect(verifyLinuxX64().problems).toEqual([
        'Missing native module for linux-x64: Prisma query engine (debian-openssl-1.1.x)',
        'Missing native module for linux-x64: Prisma query engine (rhel-openssl-1.1.x)',
        'Missing native module for linux-x64: Prisma query engine (rhel-openssl-3.0.x)',
      ]);
    });

    it('does not count an engine outside the generated client', () => {
      putLinuxX64Modules(X64_ENGINES.slice(1));
      put('app.asar.unpacked/node_modules/prisma/libquery_engine-debian-openssl-1.1.x.so.node', elf(62));

      expect(verifyLinuxX64().problems).toEqual([
        'Missing native module for linux-x64: Prisma query engine (debian-openssl-1.1.x)',
      ]);
    });

    it('rejects an engine of the other arch', () => {
      putLinuxX64Modules(X64_ENGINES);
      put('node_modules/.prisma/client/libquery_engine-linux-arm64-openssl-3.0.x.so.node', elf(183));

      expect(verifyLinuxX64().problems).toEqual([
        'Wrong architecture: node_modules/.prisma/client/libquery_engine-linux-arm64-openssl-3.0.x.so.node is elf/arm64, expected elf/x64',
      ]);
    });
  });
});
