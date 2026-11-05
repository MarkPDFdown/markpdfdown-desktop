/**
 * Loads and exercises the app's native modules from an unpacked package, and renders a sample PDF.
 * verify-package-arch.mjs runs this inside the packaged Electron (ELECTRON_RUN_AS_NODE=1),
 * so modules resolve the way they do in the app, through app.asar and app.asar.unpacked.
 *
 * Usage: ELECTRON_RUN_AS_NODE=1 <packaged electron> scripts/package-load-check.cjs <resources dir>
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { countDarkPixels } = require('./fixtures/count-dark-pixels.cjs');
const { SAMPLE_PDF, findRenderProblems } = require('./fixtures/pdf-render-check.cjs');
const { findUnpackedAssetProblems } = require('./unpacked-assets.cjs');

const resourcesDir = path.resolve(process.argv[2]);
const appDir = path.join(resourcesDir, 'app.asar');
const appModules = path.join(appDir, 'node_modules');
const loadFromApp = (name) => require(path.join(appModules, name));

/** Cleanup is not what's being checked: a failure here must neither fail the check nor mask its error. */
async function cleanUp(description, action) {
  try {
    await action();
  } catch (error) {
    console.warn(`  warning: could not ${description}: ${error.message}`);
  }
}

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

function checkUnpackedAssets() {
  const problems = findUnpackedAssetProblems(resourcesDir);
  if (problems.length > 0) throw new Error(problems.join('; '));
}

/** Runs the app's own renderer, so this fails when the renderer stops finding the pdf.js data. */
async function checkPdfRendering() {
  const rendererUrl = pathToFileURL(path.join(appDir, 'dist', 'main', 'pdf-page-renderer.js')).href;
  const { renderPdfPages } = await import(rendererUrl);

  const warnings = [];
  const consoleWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  let pages;
  try {
    pages = await renderPdfPages(SAMPLE_PDF, { returnPageContent: true, viewportScale: 2 });
  } finally {
    console.warn = consoleWarn;
  }

  const pngs = pages.map((page) => page.content);
  const problems = await findRenderProblems(pngs, warnings, loadFromApp('@napi-rs/canvas'));
  if (problems.length > 0) throw new Error(problems.join('; '));
  return `${pngs.length} pages`;
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
    await cleanUp('disconnect Prisma', () => client.$disconnect());
    // Windows can hold the db file for a moment after the engine disconnects.
    await cleanUp(`remove ${tempDir}`, () =>
      fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }),
    );
  }
}

async function main() {
  const checks = {
    '@napi-rs/canvas': checkCanvas,
    'Prisma query engine': checkPrisma,
    'Unpacked assets': checkUnpackedAssets,
    'PDF rendering': checkPdfRendering,
  };

  // Start from a directory holding nothing, like the installed app. Must precede every check:
  // pdf-to-png-converter reads the cwd once when it loads, and from the repo root (where CI runs
  // this) it would find the repo's node_modules, passing with the app's own lookup broken (#85).
  const emptyCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'markpdfdown-load-check-cwd-'));
  process.chdir(emptyCwd);

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

  process.chdir(os.tmpdir());
  await cleanUp(`remove ${emptyCwd}`, () =>
    fs.rmSync(emptyCwd, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }),
  );
  process.exit(failed ? 1 : 0);
}

main();
