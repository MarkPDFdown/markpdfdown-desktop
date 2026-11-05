/**
 * Non-native files the packaged app reads from outside app.asar (see asarUnpack in package.json).
 * Shared by verify-package-arch.mjs, which runs on any host, and package-load-check.cjs.
 */

const fs = require('node:fs');
const path = require('node:path');

const WASM_MAGIC = Buffer.from('\0asm', 'latin1');
// Without it pdf.js drops JPEG2000 images and draws the page without them (#95).
const UNPACKED_WASM_FILES = ['node_modules/pdfjs-dist/wasm/openjpeg.wasm'];

/**
 * @param {string} resourcesDir the package's resources directory
 * @returns {string[]} problems found, empty when every file is in place
 */
function findUnpackedAssetProblems(resourcesDir) {
  const problems = [];
  for (const file of UNPACKED_WASM_FILES) {
    const unpackedFile = path.join(resourcesDir, 'app.asar.unpacked', ...file.split('/'));
    if (!fs.existsSync(unpackedFile)) {
      problems.push(`Missing from app.asar.unpacked: ${file}`);
    } else if (!fs.readFileSync(unpackedFile).subarray(0, WASM_MAGIC.length).equals(WASM_MAGIC)) {
      problems.push(`Not a WebAssembly file: app.asar.unpacked/${file}`);
    }
  }
  return problems;
}

module.exports = { findUnpackedAssetProblems };
