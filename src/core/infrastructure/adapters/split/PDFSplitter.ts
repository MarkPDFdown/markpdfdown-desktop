import { pdfToPng, type PdfToPngOptions } from 'pdf-to-png-converter';
import { PDFDocument } from 'pdf-lib';
import { promises as fs } from 'fs';
import path from 'path';
import { ISplitter, SplitResult, PageInfo } from '../../../domain/split/ISplitter.js';
import { Task } from '../../../../shared/types/index.js';
import { PageRangeParser } from '../../../domain/split/PageRangeParser.js';
import { ImagePathUtil } from './ImagePathUtil.js';
import { FileWaitUtil } from './FileWaitUtil.js';
import { WORKER_CONFIG } from '../../config/worker.config.js';

/** A rendered page, held in memory until it is written to the split directory. */
type RenderedPage = Omit<PageInfo, 'imagePath'> & { content: Buffer };

/** PDF errors that a retry cannot fix: the document itself is protected or invalid. */
function isRetryablePdfError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return !(
    message.includes('password') ||
    message.includes('encrypted') ||
    message.includes('invalid pdf')
  );
}

/**
 * PDF splitter implementation using pdf-to-png-converter.
 *
 * Features:
 * - High quality conversion (viewport scale 2.0 ~144 DPI)
 * - Retry logic for transient errors (3 attempts with exponential backoff)
 * - Graceful handling of non-retryable errors (password-protected PDFs)
 * - Sequential page numbering (page-1.png, page-2.png, ...)
 * - Output location independent of process.cwd() (pages are written by this class,
 *   see renderPagesWithRetry)
 * - Memory bounded by the batch size, not the page count: pages are rendered and
 *   written in batches, because pdfToPng holds every page it renders until it returns
 */
export class PDFSplitter implements ISplitter {
  private readonly uploadsDir: string;

  constructor(uploadsDir: string) {
    this.uploadsDir = uploadsDir;
  }

  /**
   * Split a PDF file into individual page images.
   *
   * @param task - Task containing PDF file information
   * @returns Split result with page information
   * @throws Error if splitting fails after retries
   */
  async split(task: Task): Promise<SplitResult> {
    if (!task.id) {
      throw new Error('Task ID is required');
    }
    if (!task.filename) {
      throw new Error('Task filename is required');
    }

    const taskId = task.id;
    const filename = task.filename;
    const sourcePath = path.join(this.uploadsDir, taskId, filename);

    // Pre-check: verify source file exists before processing
    // Retry with short delays to handle antivirus scanning or filesystem sync delays
    await FileWaitUtil.waitForFile(sourcePath, this.uploadsDir, taskId, filename, 'PDFSplitter');

    // Step 1: Resolve the pages to render (defaults to all pages if no range is specified)
    const pageNumbers = await this.withSourceErrors(sourcePath, filename, async () => {
      const totalPages = await this.getPDFPageCountWithRetry(sourcePath);
      return PageRangeParser.parse(task.page_range, totalPages);
    });

    // Step 2: Render and write batch by batch. Only `pages` (metadata) outlives an iteration,
    // so the PNG buffers of a batch can be collected before the next one is rendered.
    const hasPageRange = Boolean(task.page_range && task.page_range.trim() !== '');
    const batchSize = WORKER_CONFIG.splitter.renderBatchSize;
    const pages: PageInfo[] = [];
    for (let start = 0; ; start += batchSize) {
      // Without a range, pdf.js decides where the document ends, not the pdf-lib count: pdf-lib
      // misses pages whose tree nodes lack a /Type, and those pages must not be dropped.
      const batch = hasPageRange
        ? pageNumbers.slice(start, start + batchSize)
        : Array.from({ length: batchSize }, (_, i) => start + i + 1);
      if (batch.length === 0) {
        break;
      }

      const renderedPages = await this.withSourceErrors(sourcePath, filename, () =>
        this.renderPagesWithRetry(sourcePath, batch, pages.length)
      );

      // Not covered by withSourceErrors, so that an output failure is never reported
      // as a problem with the source PDF.
      pages.push(...(await this.writePagesWithRetry(taskId, renderedPages)));

      // Pages are ascending, so a short batch means the document has ended.
      if (renderedPages.length < batch.length) {
        break;
      }
    }

    return {
      pages,
      totalPages: pages.length,
    };
  }

  /**
   * Run a step that reads the source PDF, reporting its failure with a friendly message.
   */
  private async withSourceErrors<T>(
    sourcePath: string,
    filename: string,
    step: () => Promise<T>
  ): Promise<T> {
    try {
      return await step();
    } catch (error) {
      throw await this.wrapError(error, sourcePath, filename);
    }
  }

  /**
   * Get PDF page count with retry logic.
   * Uses pdf-lib for accurate page count without converting pages.
   */
  private async getPDFPageCountWithRetry(pdfPath: string): Promise<number> {
    return this.withRetry(async () => {
      // Read the PDF file
      const pdfBytes = await fs.readFile(pdfPath);

      // Load the PDF document using pdf-lib
      const pdfDoc = await PDFDocument.load(pdfBytes, {
        ignoreEncryption: false, // Will throw error for encrypted PDFs
      });

      // Get the total number of pages
      const pageCount = pdfDoc.getPageCount();

      if (pageCount < 1) {
        throw new Error('PDF has no pages');
      }

      return pageCount;
    }, 'get PDF page count');
  }

  /**
   * Render one batch of pages to in-memory PNGs with retry logic.
   *
   * @param pdfPath - Source PDF
   * @param sourcePages - Source page numbers of this batch, ascending
   * @param pagesBefore - Pages produced by the previous batches, which the numbering continues from
   */
  private async renderPagesWithRetry(
    pdfPath: string,
    sourcePages: number[],
    pagesBefore: number
  ): Promise<RenderedPage[]> {
    return this.withRetry(async () => {
      // IMPORTANT: do not pass outputFolder to pdf-to-png-converter. It resolves it with
      // path.join(process.cwd(), outputFolder), which cannot address a directory on another
      // Windows drive or UNC share (#75). We take the PNG buffers and write them ourselves.
      const options: PdfToPngOptions = {
        returnPageContent: true,
        viewportScale: WORKER_CONFIG.splitter.viewportScale,
        pagesToProcess: sourcePages,
        verbosityLevel: 0,
      };

      const result = await pdfToPng(pdfPath, options);

      // pdfToPng skips pages beyond the end of the document, so a later batch may come back
      // short or empty, but the document as a whole must produce something.
      if (!result || (result.length === 0 && pagesBefore === 0)) {
        throw new Error('PDF conversion produced no output');
      }

      return result.map((output, i) => {
        const page = pagesBefore + i + 1; // Sequential numbering
        if (!output.content) {
          throw new Error(`PDF conversion produced no image for page ${page}`);
        }
        return {
          page,
          // Only trailing pages can be skipped, so the indexes of `sourcePages` still line up.
          pageSource: sourcePages[i],
          content: output.content,
        };
      });
    }, 'convert PDF pages');
  }

  /**
   * Write rendered pages to the task split directory as page-{N}.png with retry logic.
   */
  private async writePagesWithRetry(
    taskId: string,
    renderedPages: RenderedPage[]
  ): Promise<PageInfo[]> {
    const taskDir = ImagePathUtil.getTaskDir(taskId);

    try {
      // Retry whatever the error says: its message embeds the output path, which can hold any word.
      return await this.withRetry(async () => {
        await fs.mkdir(taskDir, { recursive: true });

        const pages: PageInfo[] = [];
        for (const { page, pageSource, content } of renderedPages) {
          const imagePath = ImagePathUtil.getPath(taskId, page);
          await fs.writeFile(imagePath, content);
          pages.push({ page, pageSource, imagePath });
        }
        return pages;
      }, 'write page images', () => true);
    } catch (error) {
      throw new Error(`Failed to write split images to ${taskDir}: ${(error as Error).message}`);
    }
  }

  /**
   * Generic retry wrapper with exponential backoff.
   *
   * @param operation - Async operation to retry
   * @param operationName - Name for logging
   * @param isRetryable - Whether a failure is worth another attempt (default: PDF errors)
   * @returns Operation result
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    isRetryable: (error: Error) => boolean = isRetryablePdfError
  ): Promise<T> {
    const maxRetries = WORKER_CONFIG.splitter.maxRetries;
    const baseDelay = WORKER_CONFIG.splitter.retryDelayBase;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (!isRetryable(lastError)) {
          throw lastError;
        }

        // Log retry attempt
        if (attempt < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff: 1s, 2s, 4s
          console.warn(
            `[PDFSplitter] Failed to ${operationName} (attempt ${attempt + 1}/${maxRetries}): ${lastError.message}. Retrying in ${delay}ms...`
          );
          await this.sleep(delay);
        }
      }
    }

    // All retries exhausted
    throw new Error(
      `Failed to ${operationName} after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`
    );
  }

  /**
   * Wrap source read/render errors with friendly, actionable messages.
   */
  private async wrapError(error: unknown, sourcePath: string, filename: string): Promise<Error> {
    const err = error as Error;

    // Ask the file system instead of matching ENOENT in the message: an ENOENT can
    // also come from other files, and the message embeds paths with arbitrary words.
    if (await this.isFileMissing(sourcePath)) {
      return new Error(
        `PDF file not found: ${filename}. The file may have been moved or deleted.`
      );
    }

    const message = err.message.toLowerCase();

    if (message.includes('password') || message.includes('encrypted')) {
      return new Error(
        `Cannot process password-protected PDF: ${filename}. Please provide an unencrypted version.`
      );
    }

    if (message.includes('invalid pdf') || message.includes('corrupt')) {
      return new Error(
        `PDF file appears to be corrupted or invalid: ${filename}. Please check the file.`
      );
    }

    // Generic error with context
    return new Error(`Failed to split PDF ${filename}: ${err.message}`);
  }

  private async isFileMissing(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return false;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'ENOENT';
    }
  }

  /**
   * Clean up temporary files for a task.
   *
   * @param taskId - Task ID to clean up
   */
  async cleanup(taskId: string): Promise<void> {
    const taskDir = ImagePathUtil.getTaskDir(taskId);

    try {
      await fs.rm(taskDir, { recursive: true, force: true });
    } catch (error) {
      // Log but don't throw - cleanup is best effort
      console.warn(`[PDFSplitter] Failed to cleanup task ${taskId}:`, error);
    }
  }

  /**
   * Sleep for the specified duration.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
