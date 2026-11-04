import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(new URL('../package-load-check.cjs', import.meta.url));

const FAKE_SHARP = `
module.exports = () => ({ png: () => ({ toBuffer: async () => Buffer.alloc(0) }) });
module.exports.versions = { vips: 'fake' };
`;
const FAKE_CANVAS = 'module.exports = { createCanvas: () => ({ getContext: () => ({}) }) };';

/** A Prisma client that fails where the test's environment tells it to, as a packaged one might. */
const FAKE_PRISMA = `
const fs = require('node:fs');
const { FAIL_QUERY, FAIL_DISCONNECT, FAIL_REMOVE } = process.env;

if (FAIL_REMOVE) {
  fs.rmSync = (_dir, options) => {
    throw new Error(options.maxRetries > 0 ? 'EBUSY after retrying' : 'EBUSY without retrying');
  };
}

module.exports.PrismaClient = class {
  async $queryRaw() {
    if (FAIL_QUERY) throw new Error('engine not found');
  }
  async $disconnect() {
    if (FAIL_DISCONNECT) throw new Error('disconnect failed');
  }
};
`;

describe('package-load-check', () => {
  let root;
  let tempDir;

  /** Runs the script against a fake package, keeping its temp files in a directory of their own. */
  const runCheck = (failures = {}) =>
    spawnSync(process.execPath, [SCRIPT, path.join(root, 'resources')], {
      encoding: 'utf8',
      env: { ...process.env, TMPDIR: tempDir, TEMP: tempDir, TMP: tempDir, ...failures },
    });

  const putModule = (name, source) => {
    const dir = path.join(root, 'resources', 'app.asar', 'node_modules', name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'index.js'), source);
  };

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'package-load-check-'));
    tempDir = path.join(root, 'tmp');
    mkdirSync(tempDir);
    putModule('sharp', FAKE_SHARP);
    putModule('@napi-rs/canvas', FAKE_CANVAS);
    putModule('pdf-to-png-converter', '');
    putModule('@prisma/client', FAKE_PRISMA);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('passes and removes its temp directory when everything loads', () => {
    const result = runCheck();

    expect(result.stdout).toContain('load ok    Prisma query engine');
    expect(result.status).toBe(0);
    expect(readdirSync(tempDir)).toEqual([]);
  });

  it('fails when a native module does not work', () => {
    const result = runCheck({ FAIL_QUERY: '1' });

    expect(result.stderr).toContain('load FAIL  Prisma query engine: engine not found');
    expect(result.status).toBe(1);
  });

  it('only warns when the temp directory cannot be removed, after retrying', () => {
    const result = runCheck({ FAIL_REMOVE: '1' });

    expect(result.stdout).toContain('load ok    Prisma query engine');
    expect(result.stderr).toMatch(/warning: could not remove .*: EBUSY after retrying/);
    expect(result.status).toBe(0);
  });

  it('only warns when Prisma fails to disconnect, and still removes the temp directory', () => {
    const result = runCheck({ FAIL_DISCONNECT: '1' });

    expect(result.stderr).toContain('warning: could not disconnect Prisma: disconnect failed');
    expect(result.status).toBe(0);
    expect(readdirSync(tempDir)).toEqual([]);
  });

  it('keeps the original error when cleanup fails too', () => {
    const result = runCheck({ FAIL_QUERY: '1', FAIL_DISCONNECT: '1', FAIL_REMOVE: '1' });

    expect(result.stderr).toContain('load FAIL  Prisma query engine: engine not found');
    expect(result.status).toBe(1);
  });
});
