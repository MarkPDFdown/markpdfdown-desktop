import { promises as fs } from 'fs';
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
} as const;

/**
 * Word document splitter.
 *
 * Supports: .docx, .dotx
 *
 * Technical approach:
 * - Uses mammoth to parse DOCX to HTML (preserves styles, tables, images)
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
        window.webContents.setZoomFactor(PAGE_CONFIG.DEVICE_SCALE_FACTOR);
        await this.loadAndWait(window, tempHtmlPath);

        // Get total document height
        const totalHeight = await window.webContents.executeJavaScript(
          'document.body.scrollHeight'
        );

        // Chunked screenshot rendering
        const totalPages = await this.chunkedRenderer.renderToPages(window, totalHeight, (pageNum) =>
          ImagePathUtil.getPath(taskId, pageNum)
        );

        // Build page info
        let pages: PageInfo[] = Array.from({ length: totalPages }, (_, i) => ({
          page: i + 1,
          pageSource: i + 1,
          imagePath: ImagePathUtil.getPath(taskId, i + 1),
        }));

        // Apply page range filter
        if (task.page_range) {
          const parsed = PageRangeParser.parse(task.page_range, totalPages);
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
    } catch (error) {
      throw this.wrapError(error, filename);
    } finally {
      await this.tempFileManager.cleanup();
    }
  }

  /**
   * Build complete HTML for Word document.
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
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      line-height: 1.6;
    }
    body { padding: 60px 50px; }
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
