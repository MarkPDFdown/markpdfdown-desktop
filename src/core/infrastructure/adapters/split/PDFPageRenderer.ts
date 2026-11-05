import { existsSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { pdfToPng } from 'pdf-to-png-converter';
// Not public API, which is why package.json pins the exact version of pdf-to-png-converter.
import { DOCUMENT_INIT_PARAMS_DEFAULTS } from 'pdf-to-png-converter/out/const.js';

type RenderOptions = NonNullable<Parameters<typeof pdfToPng>[1]>;

/** pdf.js VerbosityLevel.WARNINGS: a CMap or font it can't load is only ever reported as a warning. */
const PDFJS_WARNINGS = 1;

/**
 * Where a file unpacked by electron-builder's asarUnpack really is; other paths stay as they are.
 *
 * Electron's fs would redirect an app.asar path there as well, but its existsSync answers from the
 * archive's header, so a file gone from the disk would still seem to be there.
 */
export function outsideAsar(dir: string): string {
  return dir.replace(/([\\/])app\.asar(?=[\\/])/, '$1app.asar.unpacked');
}

/**
 * Points pdf.js at the CMaps, standard fonts and wasm decoders of the installed pdfjs-dist.
 *
 * pdf-to-png-converter derives the first two from process.cwd() when it loads and has no option to
 * change them. Only `npm run dev` starts in a directory that holds them. Anywhere else pdf.js fails
 * to load a predefined CMap and silently draws no text for that font (#85). It doesn't set wasmUrl
 * at all, without which pdf.js drops JPEG2000 images and draws the page without them (#95).
 *
 * @throws Error if the files are missing: rendering without them would silently lose content.
 */
function pointPdfjsAtInstalledAssets(): void {
  // pdfjs-dist is a dependency of the converter rather than ours, so resolve it from there.
  const converterEntry = createRequire(import.meta.url).resolve('pdf-to-png-converter');
  const pdfjsRoot = path.dirname(createRequire(converterEntry).resolve('pdfjs-dist/package.json'));
  const cMapDir = path.join(pdfjsRoot, 'cmaps');
  const standardFontDir = path.join(pdfjsRoot, 'standard_fonts');
  const wasmDir = outsideAsar(path.join(pdfjsRoot, 'wasm'));

  const expectedFiles = [
    path.join(cMapDir, 'UniGB-UCS2-H.bcmap'),
    path.join(standardFontDir, 'LiberationSans-Regular.ttf'),
    path.join(wasmDir, 'openjpeg.wasm'),
  ];
  const missingFile = expectedFiles.find((file) => !existsSync(file));
  if (missingFile) {
    console.error(`[PDFPageRenderer] Missing PDF.js data file: ${missingFile}`);
    // No path in the message: PDFSplitter classifies errors by their words, and a path can hold any.
    throw new Error('PDF.js data files are missing from this installation. Please reinstall the application.');
  }

  // pdf.js requires the trailing slash, also on Windows, and appends the file name to it.
  DOCUMENT_INIT_PARAMS_DEFAULTS.cMapUrl = `${cMapDir}/`;
  DOCUMENT_INIT_PARAMS_DEFAULTS.standardFontDataUrl = `${standardFontDir}/`;
  DOCUMENT_INIT_PARAMS_DEFAULTS.wasmUrl = `${wasmDir}/`;
}

/**
 * Renders PDF pages to PNG. The only way into pdf-to-png-converter, so that no caller depends on
 * the directory the app was started from.
 *
 * Bundled as its own entry (dist/main/pdf-page-renderer.js): scripts/package-load-check.cjs imports
 * it to exercise this code in the packaged app.
 */
export async function renderPdfPages(pdfPath: string, options: RenderOptions) {
  pointPdfjsAtInstalledAssets();
  return pdfToPng(pdfPath, { verbosityLevel: PDFJS_WARNINGS, ...options });
}
