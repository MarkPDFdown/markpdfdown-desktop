import { promises as fs } from 'fs';
import path from 'path';

/**
 * Utility for waiting on file availability.
 *
 * On Windows, antivirus software may temporarily lock newly copied files for scanning,
 * or filesystem operations may have slight delays. This utility retries file access
 * checks before proceeding with actual file processing.
 */
export class FileWaitUtil {
  private static readonly MAX_ATTEMPTS = 5;
  private static readonly DELAY_MS = 1000;

  /**
   * Wait for a file to become available and non-empty.
   *
   * @param filePath - Full path to the file
   * @param uploadsDir - Base uploads directory for diagnostic logging
   * @param taskId - Task ID for diagnostic logging
   * @param filename - Original filename for error messages
   * @param label - Log label (e.g., 'PDFSplitter', 'ImageSplitter')
   * @throws Error if the file is not found after all retries
   */
  static async waitForFile(
    filePath: string,
    uploadsDir: string,
    taskId: string,
    filename: string,
    label: string
  ): Promise<void> {
    for (let attempt = 1; attempt <= this.MAX_ATTEMPTS; attempt++) {
      try {
        await fs.access(filePath);
        const stats = await fs.stat(filePath);
        if (stats.size > 0) {
          if (attempt > 1) {
            console.log(
              `[${label}] File became available on attempt ${attempt}: ${filePath}`
            );
          }
          return;
        }
        console.warn(
          `[${label}] File exists but is empty (attempt ${attempt}/${this.MAX_ATTEMPTS}): ${filePath}`
        );
      } catch {
        console.warn(
          `[${label}] File not accessible (attempt ${attempt}/${this.MAX_ATTEMPTS}): ${filePath}`
        );
      }

      if (attempt < this.MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, this.DELAY_MS));
      }
    }

    // Log diagnostic info before throwing
    await this.logDiagnostics(uploadsDir, taskId, filename, label);

    throw new Error(
      `${label === 'PDFSplitter' ? 'PDF' : 'Image'} file not found: ${filename}. The file may have been moved or deleted.`
    );
  }

  /**
   * Log diagnostic information about the task directory contents.
   */
  private static async logDiagnostics(
    uploadsDir: string,
    taskId: string,
    filename: string,
    label: string
  ): Promise<void> {
    const taskDir = path.join(uploadsDir, taskId);
    try {
      const dirExists = await fs.stat(taskDir).then(() => true).catch(() => false);
      if (dirExists) {
        const files = await fs.readdir(taskDir);
        console.error(
          `[${label}] Task directory exists but target file not found. ` +
          `Dir: ${taskDir}, Files in dir: [${files.join(', ')}], Expected: ${filename}`
        );
      } else {
        console.error(`[${label}] Task directory does not exist: ${taskDir}`);
      }
    } catch (diagError) {
      console.error(`[${label}] Diagnostic check failed:`, diagError);
    }
  }
}
