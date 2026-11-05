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
const { SAMPLE_PDF, findRenderProblems } = require('./fixtures/pdf-render-check.cjs');

const appDir = path.join(path.resolve(process.argv[2]), 'app.asar');
const appModules = path.join(appDir, 'node_modules');
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
  const problems = await findRenderProblems(pngs, warnings, loadFromApp('sharp'));
  if (problems.length > 0) throw new Error(problems.join('; '));
  return `${pngs.length} pages`;
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
  const checks = {
    sharp: checkSharp,
    '@napi-rs/canvas': checkCanvas,
    'Prisma query engine': checkPrisma,
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
  fs.rmSync(emptyCwd, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}

main();
