import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadCheckProblems, parseBinaryHeader, resolvePackageLayout, verifyBinaries } from '../verify-package-arch.mjs';

const SCRIPT = fileURLToPath(new URL('../verify-package-arch.mjs', import.meta.url));

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

describe('loadCheckProblems', () => {
  it('accepts a clean exit', () => {
    expect(loadCheckProblems({ status: 0, signal: null })).toEqual([]);
  });

  it('reports the exit code of a failed check', () => {
    expect(loadCheckProblems({ status: 1, signal: null })).toEqual(['Load check failed with exit code 1']);
  });

  it('names the signal when the check was killed, as there is no exit code then', () => {
    expect(loadCheckProblems({ status: null, signal: 'SIGSEGV' })).toEqual(['Load check was killed by signal SIGSEGV']);
  });

  it('prefers the spawn error, which explains a timeout better than the signal it sends', () => {
    const error = new Error('spawnSync ETIMEDOUT');

    expect(loadCheckProblems({ error, status: null, signal: 'SIGTERM' })).toEqual([
      'Load check could not run: spawnSync ETIMEDOUT',
    ]);
  });
});

describe('command line entry', () => {
  // An unknown platform makes main() fail right away, so a non-zero exit proves that it ran.
  const run = (script) => spawnSync(process.execPath, [script, '--platform', 'nope'], { encoding: 'utf8' });

  it('runs when started directly', () => {
    const result = run(SCRIPT);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unknown --platform "nope"');
  });

  // Creating a symlink needs extra privileges on Windows.
  it.skipIf(process.platform === 'win32')('runs when started through a symlink, rather than passing silently', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'verify-package-arch-link-'));
    try {
      const link = path.join(dir, 'verify.mjs');
      symlinkSync(SCRIPT, link);

      const result = run(link);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Unknown --platform "nope"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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
    put(`app.asar.unpacked/node_modules/@img/sharp-${target}/lib/sharp-${target}.node`, header);
    put(`app.asar.unpacked/node_modules/@img/sharp-libvips-${target}/lib/libvips-cpp.8.17.3.dylib`, header);
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
    put('app.asar.unpacked/node_modules/@img/sharp-darwin-x64/package.json', '{}');

    const { problems, binaries } = verifyMac('x64');

    expect(problems).toEqual([]);
    expect(binaries).toHaveLength(5);
  });

  it('rejects the package from issue #77: an x64 app holding only arm64 modules', () => {
    putModules('darwin-arm64', macho('arm64'));

    const { problems } = verifyMac('x64');

    expect(problems.filter((p) => p.startsWith('Wrong architecture'))).toHaveLength(4);
    expect(problems).toEqual(
      expect.arrayContaining([
        'Missing native module for mac-x64: sharp',
        'Missing native module for mac-x64: libvips',
        'Missing native module for mac-x64: @napi-rs/canvas',
      ]),
    );
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

  it('knows libvips lives in the sharp package on Windows', () => {
    writeFileSync(executable, pe(0x8664));
    put('app.asar.unpacked/node_modules/@img/sharp-win32-x64/lib/sharp-win32-x64.node', pe(0x8664));
    put('app.asar.unpacked/node_modules/@img/sharp-win32-x64/lib/libvips-42.dll', pe(0x8664));
    put('app.asar.unpacked/node_modules/@napi-rs/canvas-win32-x64-msvc/skia.win32-x64-msvc.node', pe(0x8664));
    put('node_modules/.prisma/client/query_engine-windows.dll.node', pe(0x8664));

    expect(verifyBinaries({ resourcesDir, executable, platform: 'win', arch: 'x64' }).problems).toEqual([]);
  });

  it('finds the versioned libvips on Linux', () => {
    writeFileSync(executable, elf(183));
    put('app.asar.unpacked/node_modules/@img/sharp-linux-arm64/lib/sharp-linux-arm64.node', elf(183));
    put('app.asar.unpacked/node_modules/@img/sharp-libvips-linux-arm64/lib/libvips-cpp.so.8.17.3', elf(183));
    put('app.asar.unpacked/node_modules/@napi-rs/canvas-linux-arm64-gnu/skia.linux-arm64-gnu.node', elf(183));
    put('node_modules/.prisma/client/libquery_engine-linux-arm64-openssl-3.0.x.so.node', elf(183));

    expect(verifyBinaries({ resourcesDir, executable, platform: 'linux', arch: 'arm64' }).problems).toEqual([]);
  });
});
