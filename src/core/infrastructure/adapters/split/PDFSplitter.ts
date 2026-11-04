import { pdfToPng } from 'pdf-to-png-converter';
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

    let renderedPages: RenderedPage[];
    try {
      // Step 1: Get total page count with retry
      const totalPages = await this.getPDFPageCountWithRetry(sourcePath);

      // Step 2: Parse page range (defaults to all pages if not specified)
      const pageNumbers = PageRangeParser.parse(task.page_range, totalPages);

      // Step 3: Render specified pages with retry
      // Pass the page_range string to determine if user explicitly specified pages
      renderedPages = await this.renderPagesWithRetry(sourcePath, pageNumbers, task.page_range);
    } catch (error) {
      throw await this.wrapError(error, sourcePath, filename);
    }

    // Step 4: Write the images. Kept apart from the steps above so that an output
    // failure is never reported as a problem with the source PDF.
    const pages = await this.writePagesWithRetry(taskId, renderedPages);

    return {
      pages,
      totalPages: pages.length,
    };
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
   * Render specified pages to in-memory PNGs with retry logic.
   */
  private async renderPagesWithRetry(
    pdfPath: string,
    pageNumbers: number[],
    pageRange?: string | null
  ): Promise<RenderedPage[]> {
    return this.withRetry(async () => {
      // IMPORTANT: do not pass outputFolder to pdf-to-png-converter. It resolves it with
      // path.join(process.cwd(), outputFolder), which cannot address a directory on another
      // Windows drive or UNC share (#75). We take the PNG buffers and write them ourselves.
      const options: any = {
        returnPageContent: true,
        viewportScale: WORKER_CONFIG.splitter.viewportScale,
        strictPagesToProcess: false,
        verbosityLevel: 0,
      };

      // Only add pagesToProcess if user explicitly specified a page range
      // If pageRange is empty/null, let pdf-to-png-converter process all pages
      const hasPageRange = Boolean(pageRange && pageRange.trim() !== '');
      if (hasPageRange) {
        options.pagesToProcess = pageNumbers; // Array of page numbers
      }
      // Otherwise, don't specify pagesToProcess to convert all pages

      const result = await pdfToPng(pdfPath, options);

      if (!result || result.length === 0) {
        throw new Error('PDF conversion produced no output');
      }

      return result.map((output, i) => {
        const page = i + 1; // Sequential numbering
        if (!output.content) {
          throw new Error(`PDF conversion produced no image for page ${page}`);
        }
        return {
          page,
          // If page range was specified, use the mapped page numbers; otherwise use sequential numbering
          pageSource: hasPageRange ? pageNumbers[i] : page,
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
      return await this.withRetry(async () => {
        await fs.mkdir(taskDir, { recursive: true });

        const pages: PageInfo[] = [];
        for (const { page, pageSource, content } of renderedPages) {
          const imagePath = ImagePathUtil.getPath(taskId, page);
          await fs.writeFile(imagePath, content);
          pages.push({ page, pageSource, imagePath });
        }
        return pages;
      }, 'write page images');
    } catch (error) {
      throw new Error(`Failed to write split images to ${taskDir}: ${(error as Error).message}`);
    }
  }

  /**
   * Generic retry wrapper with exponential backoff.
   *
   * @param operation - Async operation to retry
   * @param operationName - Name for logging
   * @returns Operation result
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    const maxRetries = WORKER_CONFIG.splitter.maxRetries;
    const baseDelay = WORKER_CONFIG.splitter.retryDelayBase;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        // Check for non-retryable errors
        const errorMessage = lastError.message.toLowerCase();
        if (
          errorMessage.includes('password') ||
          errorMessage.includes('encrypted') ||
          errorMessage.includes('invalid pdf')
        ) {
          // Don't retry for these errors
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
