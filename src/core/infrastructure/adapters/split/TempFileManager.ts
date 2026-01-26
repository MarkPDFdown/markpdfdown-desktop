import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';

/**
 * Temporary file manager for HTML rendering.
 *
 * Creates and tracks temporary HTML files used for rendering
 * Office documents. Provides cleanup functionality to ensure
 * no temporary files are left behind.
 */
export class TempFileManager {
  private static readonly TEMP_PREFIX = 'markpdfdown-render-';
  private tempFiles: Set<string> = new Set();

  /**
   * Create a temporary HTML file with the given content.
   *
   * @param html - HTML content to write
   * @returns Path to the created temporary file
   */
  async createHtmlFile(html: string): Promise<string> {
    const tempDir = os.tmpdir();
    const filename = `${TempFileManager.TEMP_PREFIX}${randomUUID()}.html`;
    const filepath = path.join(tempDir, filename);

    await fs.writeFile(filepath, html, 'utf-8');
    this.tempFiles.add(filepath);

    return filepath;
  }

  /**
   * Delete a specific temporary file.
   *
   * @param filepath - Path to the file to delete
   */
  async deleteFile(filepath: string): Promise<void> {
    try {
      await fs.unlink(filepath);
      this.tempFiles.delete(filepath);
    } catch {
      // File may already be deleted, ignore error
    }
  }

  /**
   * Clean up all tracked temporary files.
   *
   * Safe to call multiple times. Errors during deletion are ignored.
   */
  async cleanup(): Promise<void> {
    const promises = Array.from(this.tempFiles).map((f) => this.deleteFile(f));
    await Promise.allSettled(promises);
    this.tempFiles.clear();
  }

  /**
   * Get the count of tracked temporary files.
   *
   * Useful for testing and debugging.
   */
  getTrackedFileCount(): number {
    return this.tempFiles.size;
  }
}
