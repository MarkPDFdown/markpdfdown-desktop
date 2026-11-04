/**
 * Loads and exercises the app's native modules from an unpacked package.
 * verify-package-arch.mjs runs this inside the packaged Electron (ELECTRON_RUN_AS_NODE=1),
 * so modules resolve the way they do in the app, through app.asar and app.asar.unpacked.
 *
 * Usage: ELECTRON_RUN_AS_NODE=1 <packaged electron> scripts/package-load-check.cjs <resources dir>
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const appModules = path.join(process.argv[2], 'app.asar', 'node_modules');
const loadFromApp = (name) => require(path.join(appModules, name));

async function checkSharp() {
  const sharp = loadFromApp('sharp');
  await sharp({ create: { width: 1, height: 1, channels: 3, background: '#000' } }).png().toBuffer();
  return `libvips ${sharp.versions.vips}`;
}

async function checkCanvas() {
  const { createCanvas } = loadFromApp('@napi-rs/canvas');
  createCanvas(1, 1).getContext('2d');
  // The app reaches canvas through this module, which requires it at load time.
  loadFromApp('pdf-to-png-converter');
}

async function checkPrisma() {
  const { PrismaClient } = loadFromApp('@prisma/client');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'markpdfdown-load-check-'));
  const client = new PrismaClient({
    datasources: { db: { url: `file:${path.join(tempDir, 'check.db')}` } },
  });
  try {
    await client.$queryRaw`SELECT 1`;
  } finally {
    await client.$disconnect();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function main() {
  const checks = { sharp: checkSharp, '@napi-rs/canvas': checkCanvas, 'Prisma query engine': checkPrisma };
  let failed = false;
  for (const [name, check] of Object.entries(checks)) {
    try {
      const detail = await check();
      console.log(`  load ok    ${name}${detail ? ` (${detail})` : ''}`);
    } catch (error) {
      failed = true;
      console.error(`  load FAIL  ${name}: ${error.message}`);
    }
  }
  process.exit(failed ? 1 : 0);
}

main();
