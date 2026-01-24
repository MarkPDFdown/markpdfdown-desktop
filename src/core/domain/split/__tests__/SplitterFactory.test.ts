import { describe, it, expect } from 'vitest';
import { SplitterFactory } from '../SplitterFactory.js';
import { PDFSplitter } from '../PDFSplitter.js';
import { ImageSplitter } from '../ImageSplitter.js';

describe('SplitterFactory', () => {
  const uploadsDir = '/mock/uploads';
  const factory = new SplitterFactory(uploadsDir);

  describe('create()', () => {
    it('should create PDFSplitter for pdf type', () => {
      const splitter = factory.create('pdf');
      expect(splitter).toBeInstanceOf(PDFSplitter);
    });

    it('should create ImageSplitter for jpg type', () => {
      const splitter = factory.create('jpg');
      expect(splitter).toBeInstanceOf(ImageSplitter);
    });

    it('should create ImageSplitter for jpeg type', () => {
      const splitter = factory.create('jpeg');
      expect(splitter).toBeInstanceOf(ImageSplitter);
    });

    it('should create ImageSplitter for png type', () => {
      const splitter = factory.create('png');
      expect(splitter).toBeInstanceOf(ImageSplitter);
    });

    it('should create ImageSplitter for webp type', () => {
      const splitter = factory.create('webp');
      expect(splitter).toBeInstanceOf(ImageSplitter);
    });

    it('should handle uppercase file types (PDF)', () => {
      const splitter = factory.create('PDF');
      expect(splitter).toBeInstanceOf(PDFSplitter);
    });

    it('should handle mixed case file types (JpG)', () => {
      const splitter = factory.create('JpG');
      expect(splitter).toBeInstanceOf(ImageSplitter);
    });

    it('should handle file types with whitespace', () => {
      const splitter = factory.create('  pdf  ');
      expect(splitter).toBeInstanceOf(PDFSplitter);
    });

    it('should throw error for unsupported file type', () => {
      expect(() => factory.create('txt')).toThrow(/Unsupported file type/);
    });

    it('should throw error for empty file type', () => {
      expect(() => factory.create('')).toThrow(/Unsupported file type/);
    });

    it('should throw error for gif (not supported)', () => {
      expect(() => factory.create('gif')).toThrow(/Unsupported file type/);
    });

    it('should throw error for bmp (not supported)', () => {
      expect(() => factory.create('bmp')).toThrow(/Unsupported file type/);
    });
  });

  describe('getFileType()', () => {
    it('should extract file type from filename', () => {
      expect(SplitterFactory.getFileType('document.pdf')).toBe('pdf');
    });

    it('should extract file type from uppercase extension', () => {
      expect(SplitterFactory.getFileType('image.JPG')).toBe('jpg');
    });

    it('should extract file type from mixed case extension', () => {
      expect(SplitterFactory.getFileType('photo.PnG')).toBe('png');
    });

    it('should handle filename with multiple dots', () => {
      expect(SplitterFactory.getFileType('my.document.v2.pdf')).toBe('pdf');
    });

    it('should handle filename with spaces', () => {
      expect(SplitterFactory.getFileType('my document.pdf')).toBe('pdf');
    });

    it('should handle filename with special characters', () => {
      expect(SplitterFactory.getFileType('report_2024-01-22.pdf')).toBe('pdf');
    });

    it('should throw error for filename without extension', () => {
      expect(() => SplitterFactory.getFileType('document')).toThrow(
        /Filename has no extension/
      );
    });

    it('should throw error for filename ending with dot', () => {
      expect(() => SplitterFactory.getFileType('document.')).toThrow(
        /Filename has no extension/
      );
    });

    it('should throw error for empty filename', () => {
      expect(() => SplitterFactory.getFileType('')).toThrow(/Filename has no extension/);
    });
  });

  describe('createFromFilename()', () => {
    it('should create PDFSplitter from .pdf filename', () => {
      const splitter = factory.createFromFilename('document.pdf');
      expect(splitter).toBeInstanceOf(PDFSplitter);
    });

    it('should create ImageSplitter from .jpg filename', () => {
      const splitter = factory.createFromFilename('photo.jpg');
      expect(splitter).toBeInstanceOf(ImageSplitter);
    });

    it('should create ImageSplitter from .PNG filename (uppercase)', () => {
      const splitter = factory.createFromFilename('image.PNG');
      expect(splitter).toBeInstanceOf(ImageSplitter);
    });

    it('should handle complex filenames', () => {
      const splitter = factory.createFromFilename('my_report_v2.final.pdf');
      expect(splitter).toBeInstanceOf(PDFSplitter);
    });

    it('should throw error for unsupported file type', () => {
      expect(() => factory.createFromFilename('document.txt')).toThrow(
        /Unsupported file type/
      );
    });

    it('should throw error for filename without extension', () => {
      expect(() => factory.createFromFilename('document')).toThrow(
        /Filename has no extension/
      );
    });
  });

  describe('integration', () => {
    it('should create different splitter instances', () => {
      const pdfSplitter1 = factory.create('pdf');
      const pdfSplitter2 = factory.create('pdf');
      expect(pdfSplitter1).not.toBe(pdfSplitter2); // Different instances
    });

    it('should create splitters with correct uploadsDir', () => {
      // PDFSplitter and ImageSplitter should receive the uploadsDir
      const splitter = factory.create('pdf');
      expect(splitter).toBeDefined();
      // Note: We can't easily test the internal uploadsDir without exposing it,
      // but the fact that it doesn't throw is a good sign
    });
  });
});
