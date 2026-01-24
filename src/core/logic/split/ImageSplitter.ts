import { promises as fs } from 'fs';
import path from 'path';
import { ISplitter, SplitResult, PageInfo } from './ISplitter.js';
import { Task } from '../../types/index.js';
import { ImagePathUtil } from './ImagePathUtil.js';

/**
 * Image splitter implementation for single-page image files.
 *
 * Supports: JPG, JPEG, PNG, WebP
 *
 * Behavior:
 * - Copies image from uploads/{taskId}/{filename} to uploads/{taskId}/split/page-1.png
 * - Always returns single page (images are not split)
 * - Ignores page_range parameter
 * - Preserves image quality (direct file copy, no conversion)
 */
export class ImageSplitter implements ISplitter {
  private readonly uploadsDir: string;

  constructor(uploadsDir: string) {
    this.uploadsDir = uploadsDir;
  }

  /**
   * "Split" an image file (actually just copy to temp directory as page-1.png).
   *
   * @param task - Task containing image file information
   * @returns Split result with single page
   * @throws Error if file not found or copy fails
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
      // Validate source file exists
      await fs.access(sourcePath);

      // Get file extension (preserve original format)
      const ext = path.extname(filename).toLowerCase();
      if (!ext) {
        throw new Error(`Image file has no extension: ${filename}`);
      }

      // Ensure task directory exists
      const taskDir = ImagePathUtil.getTaskDir(taskId);
      await fs.mkdir(taskDir, { recursive: true });

      // Copy to standard location (page-1.png)
      const targetPath = ImagePathUtil.getPath(taskId, 1);
      await fs.copyFile(sourcePath, targetPath);

      const pageInfo: PageInfo = {
        page: 1,
        pageSource: 1,
        imagePath: targetPath,
      };

      return {
        pages: [pageInfo],
        totalPages: 1,
      };
    } catch (error) {
      throw this.wrapError(error, taskId, filename);
    }
  }

  /**
   * Wrap errors with friendly, actionable messages.
   */
  private wrapError(error: unknown, taskId: string, filename: string): Error {
    const err = error as Error;
    const message = err.message.toLowerCase();

    if (message.includes('enoent') || message.includes('no such file')) {
      return new Error(
        `Image file not found: ${filename}. The file may have been moved or deleted.`
      );
    }

    if (message.includes('eacces') || message.includes('permission denied')) {
      return new Error(
        `Permission denied accessing image file: ${filename}. Check file permissions.`
      );
    }

    if (message.includes('enospc') || message.includes('no space')) {
      return new Error(
        `Not enough disk space to process image: ${filename}. Free up space and try again.`
      );
    }

    // Generic error with context
    return new Error(`Failed to process image ${filename}: ${err.message}`);
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
      console.warn(`[ImageSplitter] Failed to cleanup task ${taskId}:`, error);
    }
  }
}
