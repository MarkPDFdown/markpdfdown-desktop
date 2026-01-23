import { pdfToPng } from 'pdf-to-png-converter';
import { promises as fs } from 'fs';
import path from 'path';
import { ISplitter, SplitResult, PageInfo } from './ISplitter.js';
import { Task } from '../../types/index.js';
import { PageRangeParser } from './PageRangeParser.js';
import { ImagePathUtil } from './ImagePathUtil.js';
import { WORKER_CONFIG } from '../../config/worker.config.js';

/**
 * PDF splitter implementation using pdf-to-png-converter.
 *
 * Features:
 * - High quality conversion (viewport scale 2.0 ~144 DPI)
 * - Retry logic for transient errors (3 attempts with exponential backoff)
 * - Graceful handling of non-retryable errors (password-protected PDFs)
 * - Sequential page numbering (page-1.png, page-2.png, ...)
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

    try {
      // Step 1: Get total page count with retry
      const totalPages = await this.getPDFPageCountWithRetry(sourcePath);

      // Step 2: Parse page range (defaults to all pages if not specified)
      const pageNumbers = PageRangeParser.parse(task.page_range, totalPages);

      // Step 3: Convert specified pages with retry
      const pages = await this.convertPagesWithRetry(sourcePath, taskId, pageNumbers);

      return {
        pages,
        totalPages: pages.length,
      };
    } catch (error) {
      throw this.wrapError(error, taskId, filename);
    }
  }

  /**
   * Get PDF page count with retry logic.
   */
  private async getPDFPageCountWithRetry(pdfPath: string): Promise<number> {
    return this.withRetry(async () => {
      // Convert first page to get metadata
      const result = await pdfToPng(pdfPath, {
        outputFolder: ImagePathUtil.getUploadsDir()!,
        viewportScale: WORKER_CONFIG.splitter.viewportScale,
        pagesToProcess: [1], // Array of page numbers, not a number
        strictPagesToProcess: false,
        verbosityLevel: 0,
      });

      if (!result || result.length === 0) {
        throw new Error('Failed to get PDF metadata');
      }

      // The library returns page info with total page count
      return result[0].pageCount || 1;
    }, 'get PDF page count');
  }

  /**
   * Convert specified pages with retry logic.
   */
  private async convertPagesWithRetry(
    pdfPath: string,
    taskId: string,
    pageNumbers: number[]
  ): Promise<PageInfo[]> {
    const taskDir = ImagePathUtil.getTaskDir(taskId);

    // Ensure task directory exists
    await fs.mkdir(taskDir, { recursive: true });

    return this.withRetry(async () => {
      // Convert all specified pages
      const options: any = {
        outputFolder: taskDir,
        viewportScale: WORKER_CONFIG.splitter.viewportScale,
        strictPagesToProcess: false,
        verbosityLevel: 0,
      };

      // Only add pagesToProcess if specific pages are requested
      if (pageNumbers.length > 0) {
        options.pagesToProcess = pageNumbers; // Array of page numbers
      }
      // If empty, convert all pages (don't specify pagesToProcess)

      const result = await pdfToPng(pdfPath, options);

      if (!result || result.length === 0) {
        throw new Error('PDF conversion produced no output');
      }

      // Rename files to page-{N}.png format and build PageInfo array
      const pages: PageInfo[] = [];

      for (let i = 0; i < result.length; i++) {
        const pageNum = i + 1; // Sequential numbering
        const sourcePageNum = pageNumbers.length > 0 ? pageNumbers[i] : pageNum;
        const targetPath = ImagePathUtil.getPath(taskId, pageNum);

        // Rename from temporary name to standard format
        if (result[i].path !== targetPath) {
          await fs.rename(result[i].path, targetPath);
        }

        pages.push({
          page: pageNum,
          pageSource: sourcePageNum,
          imagePath: targetPath,
        });
      }

      return pages;
    }, 'convert PDF pages');
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
   * Wrap errors with friendly, actionable messages.
   */
  private wrapError(error: unknown, taskId: string, filename: string): Error {
    const err = error as Error;
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

    if (message.includes('enoent') || message.includes('file not found')) {
      return new Error(
        `PDF file not found: ${filename}. The file may have been moved or deleted.`
      );
    }

    // Generic error with context
    return new Error(`Failed to split PDF ${filename}: ${err.message}`);
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
