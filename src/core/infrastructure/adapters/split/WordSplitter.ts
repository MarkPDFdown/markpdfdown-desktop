import { promises as fs } from 'fs';
import path from 'path';
import { app } from 'electron';
import mammoth from 'mammoth';
import { ISplitter, SplitResult, PageInfo } from '../../../domain/split/ISplitter.js';
import { Task } from '../../../../shared/types/index.js';
import { ImagePathUtil } from './ImagePathUtil.js';
import { RenderWindowPoolFactory, RenderWindowPool } from './RenderWindowPoolFactory.js';
import { TempFileManager } from './TempFileManager.js';
import { ChunkedRenderer } from './ChunkedRenderer.js';
import { PageRangeParser } from '../../../domain/split/PageRangeParser.js';
import { PathValidator } from './PathValidator.js';

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
 */
const PAGE_CONFIG = {
  /** A4 page width (pixels at 96 DPI) */
  PAGE_WIDTH: 794,
  /** A4 page height (pixels at 96 DPI) */
  PAGE_HEIGHT: 1123,
  /** Device scale factor for high DPI */
  DEVICE_SCALE_FACTOR: 2,
  /** Chunk height for chunked rendering */
  CHUNK_HEIGHT: 4000,
  /** Render timeout in milliseconds */
  RENDER_TIMEOUT: 60000,
} as const;

/**
 * Word document splitter.
 *
 * Supports: .docx, .dotx
 *
 * Technical approach:
 * - Primary: Uses docx-preview for high-fidelity rendering with styles, images, tables
 * - Fallback: Uses mammoth for basic HTML conversion
 * - Uses ChunkedRenderer for memory-optimized screenshots
 * - Splits into A4-sized pages
 *
 * Note: pageRange is based on rendered page numbers, not original document pages.
 */
export class WordSplitter implements ISplitter {
  private readonly uploadsDir: string;
  private readonly windowPool: RenderWindowPool;
  private readonly tempFileManager: TempFileManager;
  private readonly chunkedRenderer: ChunkedRenderer;
  private bundleCache: string | null = null;

  constructor(uploadsDir: string) {
    this.uploadsDir = uploadsDir;
    this.windowPool = RenderWindowPoolFactory.create({ maxSize: 2, acquireTimeout: 60000 });
    this.tempFileManager = new TempFileManager();
    this.chunkedRenderer = new ChunkedRenderer({
      chunkHeight: PAGE_CONFIG.CHUNK_HEIGHT,
      deviceScaleFactor: PAGE_CONFIG.DEVICE_SCALE_FACTOR,
      pageWidth: PAGE_CONFIG.PAGE_WIDTH,
      pageHeight: PAGE_CONFIG.PAGE_HEIGHT,
    });
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

      // Try docx-preview rendering first
      try {
        return await this.renderWithDocxPreview(sourcePath, taskId, task.page_range);
      } catch (previewError) {
        console.warn(
          'docx-preview rendering failed, falling back to mammoth:',
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
   * Build HTML template for docx-preview rendering.
   */
  private buildDocxPreviewHtml(base64Data: string, bundle: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: ${PAGE_CONFIG.PAGE_WIDTH}px;
      background: white;
    }
    #docx-container {
      width: ${PAGE_CONFIG.PAGE_WIDTH}px;
    }
    /* docx-preview default styles override */
    .docx-wrapper {
      background: white !important;
      padding: 0 !important;
    }
    .docx-wrapper > section.docx {
      box-shadow: none !important;
      margin-bottom: 0 !important;
      padding: 60px 50px !important;
      min-height: auto !important;
      height: auto !important;
    }
    /* Remove page breaks and their spacing */
    .docx-wrapper > section.docx + section.docx {
      padding-top: 20px !important;
    }
    /* Hide page break elements */
    .docx [style*="page-break"],
    .docx [style*="break-after"],
    .docx [style*="break-before"],
    .docx br[clear="all"],
    .docx .page-break {
      display: none !important;
      height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    /* Collapse empty paragraphs that might be used for spacing */
    .docx p:empty {
      display: none !important;
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

        // Render with docx-preview (use window.docxPreview for explicit global access)
        const container = document.getElementById('docx-container');
        await window.docxPreview.renderAsync(arrayBuffer, container, null, {
          className: 'docx',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: true,
          breakPages: false,
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

        // Additional wait for fonts
        await document.fonts.ready;
        await new Promise(resolve => setTimeout(resolve, 300));

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
   * Render document using docx-preview.
   */
  private async renderWithDocxPreview(
    sourcePath: string,
    taskId: string,
    pageRange?: string
  ): Promise<SplitResult> {
    const fileBuffer = await fs.readFile(sourcePath);
    const base64Data = fileBuffer.toString('base64');
    const bundle = await this.loadDocxPreviewBundle();
    const html = this.buildDocxPreviewHtml(base64Data, bundle);
    const tempHtmlPath = await this.tempFileManager.createHtmlFile(html);

    const window = await this.windowPool.acquire(
      PAGE_CONFIG.PAGE_WIDTH,
      PAGE_CONFIG.CHUNK_HEIGHT
    );

    try {
      await this.loadAndWaitForRender(window, tempHtmlPath);

      // Check for render errors
      const renderError = await window.webContents.executeJavaScript('window.renderError');
      if (renderError) {
        throw new Error(`docx-preview render error: ${renderError}`);
      }

      // Chunked screenshot rendering (handles zoom and height calculation internally)
      const totalPages = await this.chunkedRenderer.renderToPages(window, 0, (pageNum) =>
        ImagePathUtil.getPath(taskId, pageNum)
      );

      // Build page info
      let pages: PageInfo[] = Array.from({ length: totalPages }, (_, i) => ({
        page: i + 1,
        pageSource: i + 1,
        imagePath: ImagePathUtil.getPath(taskId, i + 1),
      }));

      // Apply page range filter
      if (pageRange) {
        const parsed = PageRangeParser.parse(pageRange, totalPages);
        const keepPages = new Set(parsed);

        // Delete unwanted page files
        for (const page of pages) {
          if (!keepPages.has(page.page)) {
            await fs.unlink(page.imagePath).catch(() => {});
          }
        }

        // Filter and renumber
        pages = pages
          .filter((p) => keepPages.has(p.page))
          .map((p, idx) => ({ ...p, page: idx + 1 }));
      }

      return { pages, totalPages: pages.length };
    } finally {
      await this.windowPool.release(window);
      await this.tempFileManager.deleteFile(tempHtmlPath);
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
   * Fallback: Render document using mammoth.
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

    const html = this.buildWordHtml(result.value);
    const tempHtmlPath = await this.tempFileManager.createHtmlFile(html);

    // Get render window
    const window = await this.windowPool.acquire(
      PAGE_CONFIG.PAGE_WIDTH,
      PAGE_CONFIG.CHUNK_HEIGHT
    );

    try {
      await this.loadAndWait(window, tempHtmlPath);

      // Chunked screenshot rendering (handles zoom and height calculation internally)
      const totalPages = await this.chunkedRenderer.renderToPages(window, 0, (pageNum) =>
        ImagePathUtil.getPath(taskId, pageNum)
      );

      // Build page info
      let pages: PageInfo[] = Array.from({ length: totalPages }, (_, i) => ({
        page: i + 1,
        pageSource: i + 1,
        imagePath: ImagePathUtil.getPath(taskId, i + 1),
      }));

      // Apply page range filter
      if (pageRange) {
        const parsed = PageRangeParser.parse(pageRange, totalPages);
        const keepPages = new Set(parsed);

        // Delete unwanted page files
        for (const page of pages) {
          if (!keepPages.has(page.page)) {
            await fs.unlink(page.imagePath).catch(() => {});
          }
        }

        // Filter and renumber
        pages = pages
          .filter((p) => keepPages.has(p.page))
          .map((p, idx) => ({ ...p, page: idx + 1 }));
      }

      return { pages, totalPages: pages.length };
    } finally {
      await this.windowPool.release(window);
      await this.tempFileManager.deleteFile(tempHtmlPath);
    }
  }

  /**
   * Build complete HTML for Word document (fallback).
   */
  private buildWordHtml(content: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: ${PAGE_CONFIG.PAGE_WIDTH}px;
      background: white;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      padding: 60px 50px;
    }
    h1, h2, h3, h4, h5, h6 {
      margin-top: 1em;
      margin-bottom: 0.5em;
      font-weight: bold;
    }
    h1 { font-size: 24px; }
    h2 { font-size: 20px; }
    h3 { font-size: 18px; }
    p { margin-bottom: 0.8em; text-align: justify; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f5f5f5; }
    img { max-width: 100%; height: auto; }
    ul, ol { margin-left: 2em; margin-bottom: 1em; }
    li { margin-bottom: 0.3em; }
  </style>
</head>
<body>${content}</body>
</html>`;
  }

  /**
   * Load HTML file and wait for rendering to complete (fallback).
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
        setTimeout(resolve, 200);
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
