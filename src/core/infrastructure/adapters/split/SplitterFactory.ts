import path from 'path';
import { ISplitter } from '../../../domain/split/ISplitter.js';
import { PDFSplitter } from './PDFSplitter.js';
import { ImageSplitter } from './ImageSplitter.js';
import { WordSplitter } from './WordSplitter.js';
import { PowerPointSplitter } from './PowerPointSplitter.js';
import { ExcelSplitter } from './ExcelSplitter.js';
import {
  DocType,
  EXTENSION_TO_DOCTYPE,
  isLegacyFormat,
} from '../../../../shared/types/DocType.js';

/**
 * Factory for creating appropriate file splitters.
 *
 * Implements the Factory pattern to encapsulate splitter instantiation
 * and file type detection logic.
 *
 * Supported file types:
 * - PDF: pdf
 * - Images: jpg, jpeg, png, webp
 * - Word: docx, dotx
 * - PowerPoint: pptx, potx
 * - Excel: xlsx, xltx, csv
 */
export class SplitterFactory {
  private readonly uploadsDir: string;

  constructor(uploadsDir: string) {
    this.uploadsDir = uploadsDir;
  }

  /**
   * Create a splitter for the given file type (legacy method).
   *
   * @param fileType - File type (e.g., "pdf", "jpg", "png", "docx")
   * @returns Appropriate splitter instance
   * @throws Error if file type is not supported
   */
  create(fileType: string): ISplitter {
    const normalizedType = fileType.toLowerCase().trim();

    // Check for legacy formats first
    if (isLegacyFormat(normalizedType)) {
      throw new Error(
        `Legacy format ".${normalizedType}" is not supported. ` +
          `Please convert to Office Open XML format (.docx, .pptx, .xlsx) first.`
      );
    }

    // Get DocType from extension
    const docType = EXTENSION_TO_DOCTYPE[normalizedType];

    if (!docType) {
      const supportedExts = Object.keys(EXTENSION_TO_DOCTYPE).join(', ');
      throw new Error(
        `Unsupported file type: ${fileType}. Supported types: ${supportedExts}`
      );
    }

    return this.createByDocType(docType);
  }

  /**
   * Create a splitter based on document type.
   *
   * @param docType - Document type enum value
   * @returns Appropriate splitter instance
   * @throws Error if document type is not supported
   */
  createByDocType(docType: DocType): ISplitter {
    switch (docType) {
      case DocType.PDF:
        return new PDFSplitter(this.uploadsDir);

      case DocType.IMAGE:
        return new ImageSplitter(this.uploadsDir);

      case DocType.WORD:
        return new WordSplitter(this.uploadsDir);

      case DocType.POWERPOINT:
        return new PowerPointSplitter(this.uploadsDir);

      case DocType.EXCEL:
        return new ExcelSplitter(this.uploadsDir);

      default: {
        const supportedTypes = Object.values(DocType).join(', ');
        throw new Error(
          `Unsupported document type: ${docType}. Supported types: ${supportedTypes}`
        );
      }
    }
  }

  /**
   * Get document type from filename.
   *
   * @param filename - File name (e.g., "document.pdf", "report.docx")
   * @returns Document type enum value
   * @throws Error if filename has no extension or extension is not supported
   */
  static getDocType(filename: string): DocType {
    const ext = path.extname(filename);

    if (!ext || ext === '.') {
      throw new Error(`Filename has no extension: ${filename}`);
    }

    const normalizedExt = ext.slice(1).toLowerCase();

    // Check for legacy formats
    if (isLegacyFormat(normalizedExt)) {
      throw new Error(
        `Legacy format ".${normalizedExt}" is not supported. ` +
          `Please convert to Office Open XML format (.docx, .pptx, .xlsx) first.`
      );
    }

    const docType = EXTENSION_TO_DOCTYPE[normalizedExt];

    if (!docType) {
      const supportedExts = Object.keys(EXTENSION_TO_DOCTYPE).join(', ');
      throw new Error(
        `Unsupported file extension: ${ext}. Supported extensions: ${supportedExts}`
      );
    }

    return docType;
  }

  /**
   * Extract file type from filename (legacy method for backwards compatibility).
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
   * Convenience method that combines getDocType() and createByDocType().
   *
   * @param filename - File name
   * @returns Appropriate splitter instance
   * @throws Error if file type is not supported or filename has no extension
   */
  createFromFilename(filename: string): ISplitter {
    const docType = SplitterFactory.getDocType(filename);
    return this.createByDocType(docType);
  }
}
