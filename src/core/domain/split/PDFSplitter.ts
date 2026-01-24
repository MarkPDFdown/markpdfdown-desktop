import { pdfToPng } from 'pdf-to-png-converter';
import { PDFDocument } from 'pdf-lib';
import { promises as fs } from 'fs';
import path from 'path';
import { ISplitter, SplitResult, PageInfo } from './ISplitter.js';
import { Task } from '../../../shared/types/index.js';
import { PageRangeParser } from './PageRangeParser.js';
import { ImagePathUtil } from './ImagePathUtil.js';
import { WORKER_CONFIG } from '../../infrastructure/config/worker.config.js';

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
      // Pass the page_range string to determine if user explicitly specified pages
      const pages = await this.convertPagesWithRetry(
        sourcePath,
        taskId,
        pageNumbers,
        task.page_range
      );

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
   * Convert specified pages with retry logic.
   */
  private async convertPagesWithRetry(
    pdfPath: string,
    taskId: string,
    pageNumbers: number[],
    pageRange?: string | null
  ): Promise<PageInfo[]> {
    const taskDir = ImagePathUtil.getTaskDir(taskId);

    // Ensure task directory exists
    await fs.mkdir(taskDir, { recursive: true });

    return this.withRetry(async () => {
      // Convert all specified pages
      // IMPORTANT: pdf-to-png-converter expects a RELATIVE path
      // It will internally do: path.join(process.cwd(), outputFolder)
      // So we must convert absolute path to relative path
      const relativeOutputFolder = path.relative(process.cwd(), taskDir);

      const options: any = {
        outputFolder: relativeOutputFolder,
        viewportScale: WORKER_CONFIG.splitter.viewportScale,
        strictPagesToProcess: false,
        verbosityLevel: 0,
      };

      // Only add pagesToProcess if user explicitly specified a page range
      // If pageRange is empty/null, let pdf-to-png-converter process all pages
      if (pageRange && pageRange.trim() !== '') {
        options.pagesToProcess = pageNumbers; // Array of page numbers
      }
      // Otherwise, don't specify pagesToProcess to convert all pages

      const result = await pdfToPng(pdfPath, options);

      if (!result || result.length === 0) {
        throw new Error('PDF conversion produced no output');
      }

      // Rename files to page-{N}.png format and build PageInfo array
      const pages: PageInfo[] = [];

      for (let i = 0; i < result.length; i++) {
        const pageNum = i + 1; // Sequential numbering
        // If page range was specified, use the mapped page numbers; otherwise use sequential numbering
        const sourcePageNum = pageRange && pageRange.trim() !== '' ? pageNumbers[i] : pageNum;
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
