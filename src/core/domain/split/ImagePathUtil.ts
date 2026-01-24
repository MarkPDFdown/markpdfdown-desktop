import path from 'path';

/**
 * Static utility class for centralized split image path management.
 *
 * Critical: Image paths are NOT stored in the database.
 * They are dynamically calculated to avoid path synchronization issues.
 *
 * Split results are stored in: {uploadsDir}/{taskId}/split/page-{N}.png
 * This keeps all task-related files (uploads + splits) in one place.
 *
 * This class must be initialized once at application startup with the uploads directory path.
 */
export class ImagePathUtil {
  private static uploadsDir: string | null = null;

  /**
   * Initialize the utility with the uploads directory path.
   * Must be called once at application startup.
   *
   * @param uploadsDir - Base uploads directory path (e.g., {userData}/files)
   */
  static init(uploadsDir: string): void {
    this.uploadsDir = uploadsDir;
  }

  /**
   * Get the full path to a page image file.
   *
   * @param taskId - Task ID
   * @param page - Page number (1-based)
   * @returns Full path to the image file (e.g., {uploadsDir}/{taskId}/split/page-{page}.png)
   * @throws Error if utility is not initialized
   */
  static getPath(taskId: string, page: number): string {
    if (!this.uploadsDir) {
      throw new Error('ImagePathUtil not initialized. Call ImagePathUtil.init() first.');
    }
    return path.join(this.uploadsDir, taskId, 'split', `page-${page}.png`);
  }

  /**
   * Get the task split directory path (contains all page images).
   *
   * @param taskId - Task ID
   * @returns Full path to the split directory (e.g., {uploadsDir}/{taskId}/split)
   * @throws Error if utility is not initialized
   */
  static getTaskDir(taskId: string): string {
    if (!this.uploadsDir) {
      throw new Error('ImagePathUtil not initialized. Call ImagePathUtil.init() first.');
    }
    return path.join(this.uploadsDir, taskId, 'split');
  }

  /**
   * Get the uploads directory (for testing/debugging).
   *
   * @returns The uploads directory path or null if not initialized
   */
  static getUploadsDir(): string | null {
    return this.uploadsDir;
  }

  /**
   * Reset the utility (for testing purposes only).
   */
  static reset(): void {
    this.uploadsDir = null;
  }
}
