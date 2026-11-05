/**
 * Judges how pdf-render-check.pdf was rendered (see build-pdf-render-check.py for its pages).
 * Shared by scripts/package-load-check.cjs and the PDF rendering integration test.
 */

const path = require('node:path');
const { countDarkPixels } = require('./count-dark-pixels.cjs');

const SAMPLE_PDF = path.join(__dirname, 'pdf-render-check.pdf');
const PAGE_COUNT = 5;
const PAGE_WIDTH_PT = 200;
const BOX_SIZE_PT = 40;
const BOXES_PER_PAGE = 2;
// Pages 1-4 hold text in the fixture's box font. Page 5 falls back to a system font when the
// standard font is missing, so only the warning below can tell.
const BOX_PAGES = ['UniGB-UCS2-H', 'GBK-EUC-H', 'Identity-H/Identity', 'Identity-H/Adobe-GB1'];
// Leaves room for anti-aliasing, while a single missing box still falls short.
const MIN_BOX_COVERAGE = 0.9;
// pdf.js reports both a CMap and a standard font it can't read this way.
const LOAD_FAILURE = /Unable to load/;

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

  for (const [index, name] of BOX_PAGES.entries()) {
    if (!pngs[index]) continue;
    const { width, dark } = await countDarkPixels(pngs[index], canvasModule);
    const scale = width / PAGE_WIDTH_PT;
    const expected = BOXES_PER_PAGE * (BOX_SIZE_PT * scale) ** 2;
    if (dark < expected * MIN_BOX_COVERAGE) {
      problems.push(`Page ${index + 1} (${name}) lost its text: ${dark} of ${expected} dark pixels`);
    }
  }
  return problems;
}

module.exports = { SAMPLE_PDF, findRenderProblems };
