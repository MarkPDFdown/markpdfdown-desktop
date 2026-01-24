import path from 'path';
import { ISplitter } from '../../../domain/split/ISplitter.js';
import { PDFSplitter } from './PDFSplitter.js';
import { ImageSplitter } from './ImageSplitter.js';

/**
 * Factory for creating appropriate file splitters.
 *
 * Implements the Factory pattern to encapsulate splitter instantiation
 * and file type detection logic.
 *
 * Supported file types:
 * - PDF: pdf
 * - Images: jpg, jpeg, png, webp
 */
export class SplitterFactory {
  private readonly uploadsDir: string;

  constructor(uploadsDir: string) {
    this.uploadsDir = uploadsDir;
  }

  /**
   * Create a splitter for the given file type.
   *
   * @param fileType - File type (e.g., "pdf", "jpg", "png")
   * @returns Appropriate splitter instance
   * @throws Error if file type is not supported
   */
  create(fileType: string): ISplitter {
    const normalizedType = fileType.toLowerCase().trim();

    switch (normalizedType) {
      case 'pdf':
        return new PDFSplitter(this.uploadsDir);

      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'webp':
        return new ImageSplitter(this.uploadsDir);

      default:
        throw new Error(
          `Unsupported file type: ${fileType}. Supported types: pdf, jpg, jpeg, png, webp`
        );
    }
  }

  /**
   * Extract file type from filename.
   *
   * @param filename - File name (e.g., "document.pdf", "image.JPG")
   * @returns File extension in lowercase without the dot (e.g., "pdf", "jpg")
   * @throws Error if filename has no extension
   */
  static getFileType(filename: string): string {
    const ext = path.extname(filename);

    if (!ext || ext === '.') {
      throw new Error(`Filename has no extension: ${filename}`);
    }

    // Remove leading dot and convert to lowercase
    return ext.slice(1).toLowerCase();
  }

  /**
   * Create a splitter for the given filename.
   *
   * Convenience method that combines getFileType() and create().
   *
   * @param filename - File name
   * @returns Appropriate splitter instance
   * @throws Error if file type is not supported or filename has no extension
   */
  createFromFilename(filename: string): ISplitter {
    const fileType = SplitterFactory.getFileType(filename);
    return this.create(fileType);
  }
}
