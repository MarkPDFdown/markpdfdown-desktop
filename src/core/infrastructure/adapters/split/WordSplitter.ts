import { promises as fs } from 'fs';
import path from 'path';
import { app } from 'electron';
import mammoth from 'mammoth';
import { pdfToPng } from 'pdf-to-png-converter';
import { ISplitter, SplitResult, PageInfo } from '../../../domain/split/ISplitter.js';
import { Task } from '../../../../shared/types/index.js';
import { ImagePathUtil } from './ImagePathUtil.js';
import { RenderWindowPoolFactory, RenderWindowPool } from './RenderWindowPoolFactory.js';
import { TempFileManager } from './TempFileManager.js';
import { PageRangeParser } from '../../../domain/split/PageRangeParser.js';
import { PathValidator } from './PathValidator.js';
import { WORKER_CONFIG } from '../../config/worker.config.js';

/**
 * Get the directory path for loading bundles.
 * Works in both development and production environments.
 */
function getBundleDir(): string {
  try {
    // In Electron, use app.getAppPath() to get the correct base path
    // In production: resources/app.asar or resources/app
    // In development: project root
    const appPath = app?.getAppPath?.() || process.cwd();

    // Bundles are copied to dist/main/bundles during build
    return path.join(appPath, 'dist', 'main', 'bundles');
  } catch {
    // Fallback for test environment where electron is not available
    return path.join(process.cwd(), 'src/core/infrastructure/adapters/split/bundles');
  }
}

/**
 * Page configuration constants.
 * A4 size: 210mm x 297mm
 * At 96 DPI: 794px x 1123px
 */
const PAGE_CONFIG = {
  /** A4 page width (pixels at 96 DPI) */
  PAGE_WIDTH: 794,
  /** A4 page height (pixels at 96 DPI) */
  PAGE_HEIGHT: 1123,
  /** Render timeout in milliseconds */
  RENDER_TIMEOUT: 60000,
} as const;

/**
 * Word document splitter.
 *
 * Supports: .docx, .dotx
 *
 * Technical approach:
 * - Primary: Uses docx-preview for high-fidelity HTML rendering
 * - Converts HTML to PDF using Electron's printToPDF (Chromium engine)
 * - Converts PDF to images using pdf-to-png-converter
 * - This approach preserves Word's logical page breaks accurately
 *
 * Fallback: Uses mammoth for basic HTML conversion when docx-preview fails
 */
export class WordSplitter implements ISplitter {
  private readonly uploadsDir: string;
  private readonly windowPool: RenderWindowPool;
  private readonly tempFileManager: TempFileManager;
  private bundleCache: string | null = null;

  constructor(uploadsDir: string) {
    this.uploadsDir = uploadsDir;
    this.windowPool = RenderWindowPoolFactory.create({ maxSize: 2, acquireTimeout: 60000 });
    this.tempFileManager = new TempFileManager();
  }

  /**
   * Split a Word file into page images.
   */
  async split(task: Task): Promise<SplitResult> {
    if (!task.id || !task.filename) {
      throw new Error('Task ID and filename are required');
    }

    const taskId = task.id;
    const filename = task.filename;

    // Security validation
    const sourcePath = PathValidator.safePath(this.uploadsDir, taskId, filename);

    try {
      await fs.access(sourcePath);

      const taskDir = ImagePathUtil.getTaskDir(taskId);
      await fs.mkdir(taskDir, { recursive: true });

      // Try docx-preview + printToPDF rendering first
      try {
        return await this.renderWithPrintToPDF(sourcePath, taskId, task.page_range);
      } catch (previewError) {
        console.warn(
          '[WordSplitter] docx-preview + printToPDF failed, falling back to mammoth:',
          previewError
        );
        // Fallback to mammoth
        return await this.renderWithMammoth(sourcePath, taskId, task.page_range);
      }
    } catch (error) {
      throw this.wrapError(error, filename);
    } finally {
      await this.tempFileManager.cleanup();
    }
  }

  /**
   * Load the docx-preview bundle from file.
   */
  private async loadDocxPreviewBundle(): Promise<string> {
    if (this.bundleCache) {
      return this.bundleCache;
    }

    const bundlePath = path.join(getBundleDir(), 'docx-preview.bundle.js');
    this.bundleCache = await fs.readFile(bundlePath, 'utf-8');
    return this.bundleCache;
  }

  /**
   * Build HTML template for docx-preview rendering optimized for printToPDF.
   * Uses @page CSS rules to control page size and margins precisely.
   */
  private buildDocxPreviewHtmlForPrint(base64Data: string, bundle: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    /* CSS @page rule for precise PDF page control */
    @page {
      size: A4;
      margin: 0;
    }

    @media print {
      html, body {
        width: 210mm;
        height: 297mm;
        margin: 0;
        padding: 0;
      }
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    html, body {
      width: 210mm;
      background: white;
      font-family: 'Times New Roman', serif;
    }

    #docx-container {
      width: 210mm;
    }

    /* docx-preview wrapper styles */
    .docx-wrapper {
      background: white !important;
      padding: 0 !important;
    }

    /* Each section represents a page from Word */
    .docx-wrapper > section.docx {
      box-shadow: none !important;
      margin: 0 !important;
      width: 210mm !important;
      min-height: 297mm !important;
      padding: 20mm 15mm !important;
      page-break-after: always !important;
      page-break-inside: avoid !important;
      overflow: hidden !important;
      background: white !important;
    }

    /* Remove page break after the last section */
    .docx-wrapper > section.docx:last-child {
      page-break-after: auto !important;
    }

    /* Ensure images don't break across pages */
    .docx img {
      max-width: 100%;
      page-break-inside: avoid;
    }

    /* Ensure tables don't break awkwardly */
    .docx table {
      page-break-inside: avoid;
    }

    /* Handle Word's page break elements */
    .docx [style*="page-break-before: always"],
    .docx [style*="break-before: page"] {
      page-break-before: always !important;
    }

    .docx [style*="page-break-after: always"],
    .docx [style*="break-after: page"] {
      page-break-after: always !important;
    }
  </style>
</head>
<body>
  <div id="docx-container"></div>
  <script>${bundle}</script>
  <script>
    (async function() {
      window.renderComplete = false;
      window.renderError = null;

      try {
        // Decode base64 to ArrayBuffer
        const base64 = '${base64Data}';
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const arrayBuffer = bytes.buffer;

        // Render with docx-preview
        const container = document.getElementById('docx-container');
        await window.docxPreview.renderAsync(arrayBuffer, container, null, {
          className: 'docx',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          breakPages: true,
          ignoreLastRenderedPageBreak: false,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
          useBase64URL: true,
          debug: false
        });

        // Wait for images to load
        const images = container.querySelectorAll('img');
        await Promise.all(Array.from(images).map(img => {
          if (img.complete) return Promise.resolve();
          return new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
          });
        }));

        // Wait for fonts to load
        await document.fonts.ready;

        // Additional stabilization delay
        await new Promise(resolve => setTimeout(resolve, 500));

        window.renderComplete = true;
      } catch (error) {
        window.renderError = error.message || 'Unknown error';
        window.renderComplete = true;
      }
    })();
  </script>
</body>
</html>`;
  }

  /**
   * Render document using docx-preview + printToPDF + pdf-to-png.
   * This approach provides accurate page breaks matching the original Word document.
   */
  private async renderWithPrintToPDF(
    sourcePath: string,
    taskId: string,
    pageRange?: string
  ): Promise<SplitResult> {
    const fileBuffer = await fs.readFile(sourcePath);
    const base64Data = fileBuffer.toString('base64');
    const bundle = await this.loadDocxPreviewBundle();
    const html = this.buildDocxPreviewHtmlForPrint(base64Data, bundle);
    const tempHtmlPath = await this.tempFileManager.createHtmlFile(html);

    // Create temp PDF path
    const tempPdfPath = path.join(
      path.dirname(tempHtmlPath),
      `word-${Date.now()}.pdf`
    );

    const window = await this.windowPool.acquire(
      PAGE_CONFIG.PAGE_WIDTH,
      PAGE_CONFIG.PAGE_HEIGHT
    );

    try {
      // Step 1: Load and render HTML
      await this.loadAndWaitForRender(window, tempHtmlPath);

      // Check for render errors
      const renderError = await window.webContents.executeJavaScript('window.renderError');
      if (renderError) {
        throw new Error(`docx-preview render error: ${renderError}`);
      }

      // Get section count for logging
      const sectionCount = await window.webContents.executeJavaScript(
        'document.querySelectorAll("section.docx").length'
      );
      console.log(`[WordSplitter] Document rendered with ${sectionCount} sections`);

      // Step 2: Print to PDF using Chromium's print engine
      console.log('[WordSplitter] Converting to PDF via printToPDF...');
      const pdfBuffer = await window.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        margins: {
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
        },
        preferCSSPageSize: true,
      });

      // Write PDF to temp file
      await fs.writeFile(tempPdfPath, pdfBuffer);
      console.log(`[WordSplitter] PDF created: ${pdfBuffer.length} bytes`);

      // Step 3: Convert PDF to images using pdf-to-png-converter
      const result = await this.convertPdfToImages(tempPdfPath, taskId, pageRange);

      return result;
    } finally {
      await this.windowPool.release(window);
      await this.tempFileManager.deleteFile(tempHtmlPath);
      // Clean up temp PDF
      await fs.unlink(tempPdfPath).catch(() => {});
    }
  }

  /**
   * Convert PDF to page images using pdf-to-png-converter.
   * Reuses the same logic as PDFSplitter for consistency.
   * Automatically detects and removes blank pages.
   */
  private async convertPdfToImages(
    pdfPath: string,
    taskId: string,
    pageRange?: string
  ): Promise<SplitResult> {
    const taskDir = ImagePathUtil.getTaskDir(taskId);
    const relativeOutputFolder = path.relative(process.cwd(), taskDir);

    // Convert PDF to PNG images
    const pngResults = await pdfToPng(pdfPath, {
      outputFolder: relativeOutputFolder,
      viewportScale: WORKER_CONFIG.splitter.viewportScale,
      strictPagesToProcess: false,
      verbosityLevel: 0,
    });

    if (!pngResults || pngResults.length === 0) {
      throw new Error('PDF conversion produced no output');
    }

    const totalPages = pngResults.length;
    console.log(`[WordSplitter] PDF converted to ${totalPages} page images`);

    // Parse page range
    const pageNumbers = pageRange
      ? PageRangeParser.parse(pageRange, totalPages)
      : Array.from({ length: totalPages }, (_, i) => i + 1);

    const selectedPages = new Set(pageNumbers);

    // Rename files and build PageInfo array
    const pages: PageInfo[] = [];
    let outputPageNum = 1;
    let blankPagesRemoved = 0;

    for (let i = 0; i < pngResults.length; i++) {
      const sourcePageNum = i + 1;

      if (!selectedPages.has(sourcePageNum)) {
        // Delete unwanted page
        await fs.unlink(pngResults[i].path).catch(() => {});
        continue;
      }

      // Check if page is blank
      const isBlank = await this.isBlankPage(pngResults[i].path);
      if (isBlank) {
        console.log(`[WordSplitter] Removing blank page ${sourcePageNum}`);
        await fs.unlink(pngResults[i].path).catch(() => {});
        blankPagesRemoved++;
        continue;
      }

      const targetPath = ImagePathUtil.getPath(taskId, outputPageNum);

      // Rename from temporary name to standard format
      if (pngResults[i].path !== targetPath) {
        await fs.rename(pngResults[i].path, targetPath);
      }

      pages.push({
        page: outputPageNum,
        pageSource: sourcePageNum,
        imagePath: targetPath,
      });
      outputPageNum++;
    }

    if (blankPagesRemoved > 0) {
      console.log(`[WordSplitter] Removed ${blankPagesRemoved} blank page(s)`);
    }

    return { pages, totalPages: pages.length };
  }

  /**
   * Detect if a page image is blank (nearly all white).
   * Uses sharp to analyze pixel statistics.
   */
  private async isBlankPage(imagePath: string): Promise<boolean> {
    try {
      const sharp = (await import('sharp')).default;

      // Get image statistics
      const stats = await sharp(imagePath).stats();

      // Check all channels (R, G, B)
      // A blank page should have:
      // 1. Very high mean values (close to 255 for white)
      // 2. Very low standard deviation (uniform color)
      const channels = stats.channels;

      // Calculate average mean and std across RGB channels
      const avgMean = (channels[0].mean + channels[1].mean + channels[2].mean) / 3;
      const avgStd = (channels[0].stdev + channels[1].stdev + channels[2].stdev) / 3;

      // Thresholds for blank page detection:
      // - Mean should be > 250 (very close to white 255)
      // - Std should be < 5 (very uniform color)
      const isBlank = avgMean > 250 && avgStd < 5;

      return isBlank;
    } catch (error) {
      // If analysis fails, assume page is not blank
      console.warn(`[WordSplitter] Failed to analyze page for blank detection:`, error);
      return false;
    }
  }

  /**
   * Load HTML and wait for docx-preview render to complete.
   */
  private loadAndWaitForRender(
    window: Electron.BrowserWindow,
    htmlPath: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeoutId);
        clearInterval(pollId);
      };

      const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error('docx-preview render timeout'));
      }, PAGE_CONFIG.RENDER_TIMEOUT);

      let pollId: ReturnType<typeof setInterval>;

      window.webContents.once('did-finish-load', () => {
        // Poll for render completion
        pollId = setInterval(async () => {
          try {
            const complete = await window.webContents.executeJavaScript(
              'window.renderComplete'
            );
            if (complete) {
              cleanup();
              // Additional wait for visual rendering
              setTimeout(resolve, 200);
            }
          } catch {
            // Ignore errors during polling
          }
        }, 100);
      });

      window.webContents.once('did-fail-load', (_event, errorCode, errorDesc) => {
        cleanup();
        reject(new Error(`Failed to load page: ${errorDesc} (${errorCode})`));
      });

      window.loadFile(htmlPath).catch((err) => {
        cleanup();
        reject(err);
      });
    });
  }

  /**
   * Fallback: Render document using mammoth + printToPDF.
   */
  private async renderWithMammoth(
    sourcePath: string,
    taskId: string,
    pageRange?: string
  ): Promise<SplitResult> {
    // Parse DOCX to HTML using mammoth
    const result = await mammoth.convertToHtml(
      { path: sourcePath },
      {
        styleMap: [
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
          "p[style-name='Heading 3'] => h3:fresh",
        ],
      }
    );

    const html = this.buildMammothHtmlForPrint(result.value);
    const tempHtmlPath = await this.tempFileManager.createHtmlFile(html);
    const tempPdfPath = path.join(
      path.dirname(tempHtmlPath),
      `mammoth-${Date.now()}.pdf`
    );

    const window = await this.windowPool.acquire(
      PAGE_CONFIG.PAGE_WIDTH,
      PAGE_CONFIG.PAGE_HEIGHT
    );

    try {
      await this.loadAndWait(window, tempHtmlPath);

      // Print to PDF
      const pdfBuffer = await window.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        margins: {
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
        },
        preferCSSPageSize: true,
      });

      await fs.writeFile(tempPdfPath, pdfBuffer);

      // Convert PDF to images
      return await this.convertPdfToImages(tempPdfPath, taskId, pageRange);
    } finally {
      await this.windowPool.release(window);
      await this.tempFileManager.deleteFile(tempHtmlPath);
      await fs.unlink(tempPdfPath).catch(() => {});
    }
  }

  /**
   * Build HTML for mammoth output optimized for printToPDF.
   */
  private buildMammothHtmlForPrint(content: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page {
      size: A4;
      margin: 20mm 15mm;
    }

    @media print {
      html, body {
        width: 210mm;
        margin: 0;
        padding: 0;
      }
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    html, body {
      width: 210mm;
      background: white;
    }

    body {
      font-family: 'Times New Roman', Georgia, serif;
      font-size: 12pt;
      line-height: 1.5;
      padding: 20mm 15mm;
    }

    h1, h2, h3, h4, h5, h6 {
      margin-top: 1em;
      margin-bottom: 0.5em;
      font-weight: bold;
      page-break-after: avoid;
    }

    h1 { font-size: 18pt; }
    h2 { font-size: 16pt; }
    h3 { font-size: 14pt; }

    p {
      margin-bottom: 0.8em;
      text-align: justify;
      orphans: 3;
      widows: 3;
    }

    table {
      border-collapse: collapse;
      width: 100%;
      margin: 1em 0;
      page-break-inside: avoid;
    }

    th, td {
      border: 1px solid #333;
      padding: 6px 8px;
      text-align: left;
    }

    th {
      background-color: #f0f0f0;
    }

    img {
      max-width: 100%;
      height: auto;
      page-break-inside: avoid;
    }

    ul, ol {
      margin-left: 2em;
      margin-bottom: 1em;
    }

    li {
      margin-bottom: 0.3em;
    }
  </style>
</head>
<body>${content}</body>
</html>`;
  }

  /**
   * Load HTML file and wait for rendering to complete.
   */
  private loadAndWait(window: Electron.BrowserWindow, htmlPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeoutId);
      };

      const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error('Page load timeout'));
      }, 30000);

      window.webContents.once('did-finish-load', () => {
        cleanup();
        // Wait for rendering to stabilize
        setTimeout(resolve, 500);
      });

      window.webContents.once('did-fail-load', (_event, errorCode, errorDesc) => {
        cleanup();
        reject(new Error(`Failed to load page: ${errorDesc} (${errorCode})`));
      });

      window.loadFile(htmlPath).catch((err) => {
        cleanup();
        reject(err);
      });
    });
  }

  /**
   * Wrap errors with user-friendly messages.
   */
  private wrapError(error: unknown, filename: string): Error {
    const err = error as Error;
    const message = err.message.toLowerCase();

    if (message.includes('security error') || message.includes('path traversal')) {
      return err;
    }
    if (message.includes('enoent') || message.includes('no such file')) {
      return new Error(`Word file not found: ${filename}`);
    }
    if (message.includes('corrupt') || message.includes('invalid')) {
      return new Error(`Word file appears to be corrupted: ${filename}`);
    }

    return new Error(`Failed to process Word file ${filename}: ${err.message}`);
  }

  /**
   * Clean up temporary files for a task.
   */
  async cleanup(taskId: string): Promise<void> {
    const taskDir = ImagePathUtil.getTaskDir(taskId);
    await fs.rm(taskDir, { recursive: true, force: true }).catch(() => {});
    this.windowPool.destroy();
  }
}
