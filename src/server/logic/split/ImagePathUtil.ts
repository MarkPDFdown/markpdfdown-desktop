import path from 'path';

/**
 * Static utility class for centralized image path management.
 *
 * Critical: Image paths are NOT stored in the database.
 * They are dynamically calculated to avoid path synchronization issues.
 *
 * This class must be initialized once at application startup with the temp directory path.
 */
export class ImagePathUtil {
  private static tempDir: string | null = null;

  /**
   * Initialize the utility with the temp directory path.
   * Must be called once at application startup.
   *
   * @param tempDir - Base temporary directory path (e.g., {userData}/temp)
   */
  static init(tempDir: string): void {
    this.tempDir = tempDir;
  }

  /**
   * Get the full path to a page image file.
   *
   * @param taskId - Task ID
   * @param page - Page number (1-based)
   * @returns Full path to the image file (e.g., {tempDir}/{taskId}/page-{page}.png)
   * @throws Error if utility is not initialized
   */
  static getPath(taskId: string, page: number): string {
    if (!this.tempDir) {
      throw new Error('ImagePathUtil not initialized. Call ImagePathUtil.init() first.');
    }
    return path.join(this.tempDir, taskId, `page-${page}.png`);
  }

  /**
   * Get the task directory path (contains all page images).
   *
   * @param taskId - Task ID
   * @returns Full path to the task directory (e.g., {tempDir}/{taskId})
   * @throws Error if utility is not initialized
   */
  static getTaskDir(taskId: string): string {
    if (!this.tempDir) {
      throw new Error('ImagePathUtil not initialized. Call ImagePathUtil.init() first.');
    }
    return path.join(this.tempDir, taskId);
  }

  /**
   * Get the temp directory (for testing/debugging).
   *
   * @returns The temp directory path or null if not initialized
   */
  static getTempDir(): string | null {
    return this.tempDir;
  }

  /**
   * Reset the utility (for testing purposes only).
   */
  static reset(): void {
    this.tempDir = null;
  }
}
