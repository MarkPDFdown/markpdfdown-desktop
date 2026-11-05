/**
 * Judges how pdf-render-check.pdf was rendered (see build-pdf-render-check.py for its pages).
 * Shared by scripts/package-load-check.cjs and the PDF rendering integration test.
 */

const path = require('node:path');
const { countDarkPixels } = require('./count-dark-pixels.cjs');

const SAMPLE_PDF = path.join(__dirname, 'pdf-render-check.pdf');
const PAGE_COUNT = 6;
const PAGE_WIDTH_PT = 200;
// Two boxes of the fixture's font, 40 points wide.
const BOX_TEXT_AREA_PT = 2 * 40 ** 2;
// Page 5 is left out: it falls back to a system font when the standard font is missing, so only
// the warning below can tell.
const DRAWN_PAGES = [
  { page: 1, name: 'UniGB-UCS2-H', darkAreaPt: BOX_TEXT_AREA_PT },
  { page: 2, name: 'GBK-EUC-H', darkAreaPt: BOX_TEXT_AREA_PT },
  { page: 3, name: 'Identity-H/Identity', darkAreaPt: BOX_TEXT_AREA_PT },
  { page: 4, name: 'Identity-H/Adobe-GB1', darkAreaPt: BOX_TEXT_AREA_PT },
  { page: 6, name: 'JPXDecode image', darkAreaPt: 160 * 60 },
];
// Leaves room for anti-aliasing, while a single missing box still falls short.
const MIN_COVERAGE = 0.9;
// pdf.js reports both a CMap and a standard font it can't read as "Unable to load". For JPX the
// warning is all there is: without the wasm it falls back to a JS decoder, which may well draw.
const LOAD_FAILURE = /Unable to load|JpxImage#/;

/**
 * @param {Buffer[]} pngs the rendered pages, in order
 * @param {string[]} warnings what pdf.js wrote to console.warn during the rendering
 * @param {object} canvasModule the @napi-rs/canvas module; the packaged app has to pass its own
 * @returns {Promise<string[]>} problems found, empty when the rendering is complete
 */
async function findRenderProblems(pngs, warnings, canvasModule) {
  const problems = warnings.filter((warning) => LOAD_FAILURE.test(warning));
  if (pngs.length !== PAGE_COUNT) {
    problems.push(`Expected ${PAGE_COUNT} pages, got ${pngs.length}`);
  }

  for (const { page, name, darkAreaPt } of DRAWN_PAGES) {
    const png = pngs[page - 1];
    if (!png) continue;
    const { width, dark } = await countDarkPixels(png, canvasModule);
    const expected = darkAreaPt * (width / PAGE_WIDTH_PT) ** 2;
    if (dark < expected * MIN_COVERAGE) {
      problems.push(`Page ${page} (${name}) lost its content: ${dark} of ${expected} dark pixels`);
    }
  }
  return problems;
}

module.exports = { SAMPLE_PDF, findRenderProblems };
