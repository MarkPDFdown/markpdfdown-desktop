#!/usr/bin/env node

/**
 * Verifies an unpacked electron-builder package (release/mac, release/linux-unpacked, ...):
 *
 * 1. Every native binary in the third-party module trees matches the target platform and arch.
 * 2. The native modules the app needs at startup are present (sharp, libvips, canvas, Prisma).
 * 3. When the host can execute the package, those modules really load inside the packaged Electron.
 *    This catches what headers cannot, such as a library left inside app.asar where dlopen can't see it.
 *
 * Binary headers are parsed directly rather than through `file`/`lipo`, so the check behaves the
 * same on every runner, including Windows and machines without those tools.
 *
 * Usage:
 *   npm run verify:package                                  # host platform and arch
 *   npm run verify:package -- --platform mac --arch x64
 *   npm run verify:package -- --platform linux --arch arm64 --release-dir out
 */

import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const LOAD_CHECK_SCRIPT = path.join(SCRIPT_DIR, 'package-load-check.cjs');
const LOAD_CHECK_TIMEOUT_MS = 120_000;

// 4 KiB comfortably covers the DOS stub of a PE file and the arch table of a fat Mach-O.
const HEADER_BYTES = 4096;

// Keyed by electron-builder's platform names.
const PLATFORMS = {
  mac: { format: 'macho', nodePlatform: 'darwin' },
  linux: { format: 'elf', nodePlatform: 'linux' },
  win: { format: 'pe', nodePlatform: 'win32' },
};

const ELF_MACHINES = { 3: 'ia32', 40: 'arm', 62: 'x64', 183: 'arm64' };
const MACHO_CPU_TYPES = { 7: 'ia32', 12: 'arm', 0x01000007: 'x64', 0x0100000c: 'arm64' };
const PE_MACHINES = { 0x014c: 'ia32', 0x8664: 'x64', 0xaa64: 'arm64' };

const archName = (table, id) => table[id] ?? `unknown(0x${id.toString(16)})`;

function parseElf(header) {
  if (header.length < 20) return null;
  const isLittleEndian = header[5] === 1;
  const machine = isLittleEndian ? header.readUInt16LE(18) : header.readUInt16BE(18);
  return { format: 'elf', archs: [archName(ELF_MACHINES, machine)] };
}

function parseFatMacho(header, entrySize) {
  const count = header.readUInt32BE(4);
  // Java class files share the 0xCAFEBABE magic, but there this field is a version number (>= 45).
  if (count === 0 || count > 16 || header.length < 8 + count * entrySize) return null;
  const archs = [];
  for (let i = 0; i < count; i++) {
    archs.push(archName(MACHO_CPU_TYPES, header.readInt32BE(8 + i * entrySize)));
  }
  return { format: 'macho', archs };
}

function parsePe(header) {
  if (header.length < 0x40) return null;
  const peOffset = header.readUInt32LE(0x3c);
  if (peOffset + 6 > header.length) return null;
  if (header.readUInt32LE(peOffset) !== 0x00004550) return null; // "PE\0\0"
  return { format: 'pe', archs: [archName(PE_MACHINES, header.readUInt16LE(peOffset + 4))] };
}

/**
 * Identifies a native binary from the first bytes of a file.
 * @returns {{format: 'elf'|'macho'|'pe', archs: string[]} | null} null when not a native binary
 */
export function parseBinaryHeader(header) {
  if (header.length < 8) return null;

  const magicBE = header.readUInt32BE(0);
  const magicLE = header.readUInt32LE(0);

  if (magicBE === 0x7f454c46) return parseElf(header);
  if (magicLE === 0xfeedfacf || magicLE === 0xfeedface) {
    return { format: 'macho', archs: [archName(MACHO_CPU_TYPES, header.readInt32LE(4))] };
  }
  if (magicBE === 0xcafebabe) return parseFatMacho(header, 20);
  if (magicBE === 0xcafebabf) return parseFatMacho(header, 32);
  if (header[0] === 0x4d && header[1] === 0x5a) return parsePe(header);
  return null;
}

function readHeader(filePath) {
  const fd = openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(HEADER_BYTES);
    return buffer.subarray(0, readSync(fd, buffer, 0, HEADER_BYTES, 0));
  } finally {
    closeSync(fd);
  }
}

function* walkFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkFiles(entryPath);
    else if (entry.isFile()) yield entryPath;
  }
}

/** Where electron-builder puts an unpacked package and what's inside it. */
export function resolvePackageLayout({ releaseDir, platform, arch, productName, executableName }) {
  // x64 is electron-builder's default arch and gets no suffix in the output directory name.
  const archSuffix = arch === 'x64' ? '' : `-${arch}`;

  if (platform === 'mac') {
    const contents = path.join(releaseDir, `mac${archSuffix}`, `${productName}.app`, 'Contents');
    return {
      resourcesDir: path.join(contents, 'Resources'),
      executable: path.join(contents, 'MacOS', productName),
    };
  }

  const appDir = path.join(releaseDir, `${platform}${archSuffix}-unpacked`);
  return {
    resourcesDir: path.join(appDir, 'resources'),
    executable: path.join(appDir, platform === 'win' ? `${productName}.exe` : executableName),
  };
}

/**
 * Native modules without which the app can't work. `electron-builder` leaves them out silently,
 * e.g. when the matching optional dependency wasn't installed on the build machine.
 */
function requiredModules(platform, arch) {
  const target = `${PLATFORMS[platform].nodePlatform}-${arch}`;
  return [
    { label: 'sharp', pattern: new RegExp(`/@img/sharp-${target}/lib/[^/]+\\.node$`) },
    // On Windows libvips ships inside the sharp package rather than in its own package.
    { label: 'libvips', pattern: new RegExp(`/@img/sharp-(libvips-)?${target}/lib/libvips[^/]*$`) },
    { label: '@napi-rs/canvas', pattern: new RegExp(`/@napi-rs/canvas-${target}[^/]*/[^/]+\\.node$`) },
    { label: 'Prisma query engine', pattern: /\/\.prisma\/client\/[^/]*query_engine[^/]*\.node$/ },
  ];
}

/**
 * Checks binary architectures and the presence of required modules.
 * @returns {{binaries: Array<{path: string, format: string, archs: string[]}>, problems: string[]}}
 */
export function verifyBinaries({ resourcesDir, executable, platform, arch }) {
  const expectedFormat = PLATFORMS[platform].format;
  // Only the third-party trees: Electron's own resources may hold helpers of another arch on
  // purpose, such as the 32-bit elevate.exe on Windows.
  const roots = ['app.asar.unpacked', 'node_modules'].map((dir) => path.join(resourcesDir, dir));
  const files = [executable];
  for (const root of roots) {
    if (existsSync(root)) files.push(...walkFiles(root));
  }

  const binaries = [];
  const problems = [];
  for (const file of files) {
    if (!existsSync(file)) {
      problems.push(`Missing file: ${file}`);
      continue;
    }
    const binary = parseBinaryHeader(readHeader(file));
    if (!binary) continue;

    const relativePath = path.relative(resourcesDir, file).split(path.sep).join('/');
    binaries.push({ path: relativePath, ...binary });
    if (binary.format !== expectedFormat || !binary.archs.includes(arch)) {
      problems.push(
        `Wrong architecture: ${relativePath} is ${binary.format}/${binary.archs.join('+')}, ` +
          `expected ${expectedFormat}/${arch}`,
      );
    }
  }

  for (const { label, pattern } of requiredModules(platform, arch)) {
    if (!binaries.some((binary) => pattern.test(`/${binary.path}`))) {
      problems.push(`Missing native module for ${platform}-${arch}: ${label}`);
    }
  }

  return { binaries, problems };
}

/** @returns {string[]} problems found in the spawnSync result of the load check */
export function loadCheckProblems({ error, status, signal }) {
  if (error) return [`Load check could not run: ${error.message}`];
  if (signal) return [`Load check was killed by signal ${signal}`];
  if (status !== 0) return [`Load check failed with exit code ${status}`];
  return [];
}

/** Loads the native modules in the packaged Electron. @returns {string[]} problems */
function runLoadCheck({ resourcesDir, executable }) {
  const result = spawnSync(executable, [LOAD_CHECK_SCRIPT, resourcesDir], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8',
    timeout: LOAD_CHECK_TIMEOUT_MS,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  return loadCheckProblems(result);
}

function main() {
  const hostPlatform = Object.keys(PLATFORMS).find((key) => PLATFORMS[key].nodePlatform === process.platform);
  const { values } = parseArgs({
    options: {
      platform: { type: 'string', default: hostPlatform },
      arch: { type: 'string', default: process.arch },
      'release-dir': { type: 'string', default: 'release' },
    },
  });
  const { platform, arch } = values;
  const releaseDir = path.resolve(values['release-dir']);

  if (!PLATFORMS[platform]) {
    throw new Error(`Unknown --platform "${platform}", expected mac, win or linux`);
  }

  const packageJson = JSON.parse(readFileSync(path.join(SCRIPT_DIR, '..', 'package.json'), 'utf8'));
  const layout = resolvePackageLayout({
    releaseDir,
    platform,
    arch,
    productName: packageJson.build.productName,
    executableName: packageJson.name,
  });
  if (!existsSync(layout.resourcesDir)) {
    throw new Error(`Package not found at ${layout.resourcesDir}. Was ${platform}-${arch} built?`);
  }

  console.log(`Verifying ${platform}-${arch} package in ${layout.resourcesDir}`);
  const { binaries, problems } = verifyBinaries({ ...layout, platform, arch });
  for (const binary of binaries) {
    console.log(`  ${binary.format}/${binary.archs.join('+')}  ${binary.path}`);
  }
  console.log(`Checked ${binaries.length} native binaries.`);

  const hostCanRun = hostPlatform === platform && process.arch === arch;
  if (problems.length === 0) {
    if (hostCanRun) problems.push(...runLoadCheck(layout));
    else console.log(`Load check skipped: this ${process.platform}-${process.arch} host can't run the package.`);
  }

  if (problems.length > 0) {
    console.error(`\n${problems.length} problem(s) found:`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log(`\nPackage ${platform}-${arch} is OK.`);
}

/**
 * Node resolves symlinks in this module's URL but not in argv[1], so comparing them directly would
 * skip main() when started through a symlink, and the gate would pass with exit code 0.
 */
function isEntryPoint() {
  const entry = process.argv[1];
  return Boolean(entry) && existsSync(entry) && realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
}

if (isEntryPoint()) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
