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
const { countDarkPixels } = require('./fixtures/count-dark-pixels.cjs');

const appModules = path.join(process.argv[2], 'app.asar', 'node_modules');
const loadFromApp = (name) => require(path.join(appModules, name));

async function checkCanvas() {
  const canvasModule = loadFromApp('@napi-rs/canvas');
  const canvas = canvasModule.createCanvas(20, 10);
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, 20, 10);
  context.fillStyle = '#000';
  context.fillRect(0, 0, 10, 10);

  // ImageReencoder decodes and encodes every uploaded image this way.
  const { width, dark } = await countDarkPixels(await canvas.encode('jpeg', 80), canvasModule);
  if (width !== 20 || dark < 90) throw new Error(`A re-encoded image lost its pixels: ${dark} dark of ${width} wide`);

  // Some canvas versions segfault on a damaged image, which in the app takes down the main process,
  // again on each start once its task is picked up again. Getting past this line is the check.
  const encoded = await canvas.encode('jpeg', 80);
  await canvasModule.loadImage(encoded.subarray(0, encoded.length >> 1)).catch(() => {});

  // The app reaches canvas through this module, which requires it at load time.
  loadFromApp('pdf-to-png-converter');
}

/** Linux only: the engine Prisma really picked, which verify-package-distros.mjs checks. */
function loadedPrismaEngine() {
  if (process.platform !== 'linux') return undefined;
  const engine = fs.readFileSync('/proc/self/maps', 'utf8').match(/libquery_engine-[^/\s]+\.so\.node/);
  return engine?.[0];
}

async function checkPrisma() {
  const { PrismaClient } = loadFromApp('@prisma/client');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'markpdfdown-load-check-'));
  const client = new PrismaClient({
    datasources: { db: { url: `file:${path.join(tempDir, 'check.db')}` } },
  });
  try {
    await client.$queryRaw`SELECT 1`;
    return loadedPrismaEngine();
  } finally {
    await client.$disconnect();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function main() {
  const checks = { '@napi-rs/canvas': checkCanvas, 'Prisma query engine': checkPrisma };
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
