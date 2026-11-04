import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PDFSplitter } from '../PDFSplitter.js';
import { ImagePathUtil } from '../ImagePathUtil.js';
import { promises as fs } from 'fs';
import path from 'path';

// Mock pdf-to-png-converter
vi.mock('pdf-to-png-converter', () => ({
  pdfToPng: vi.fn(),
}));

// Mock pdf-lib
vi.mock('pdf-lib', () => ({
  PDFDocument: {
    load: vi.fn(),
  },
}));

// Mock FileWaitUtil
vi.mock('../FileWaitUtil.js', () => ({
  FileWaitUtil: {
    waitForFile: vi.fn(),
  },
}));

// Mock fs promises
vi.mock('fs', () => ({
  promises: {
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    rm: vi.fn(),
    unlink: vi.fn(),
    readFile: vi.fn(),
    access: vi.fn(),
    stat: vi.fn(),
    readdir: vi.fn(),
  },
}));

import { pdfToPng } from 'pdf-to-png-converter';
import { PDFDocument } from 'pdf-lib';
import { FileWaitUtil } from '../FileWaitUtil.js';

describe('PDFSplitter', () => {
  const uploadsDir = '/mock/uploads';
  let splitter: PDFSplitter;

  beforeEach(() => {
    // Initialize ImagePathUtil
    ImagePathUtil.init(uploadsDir);

    // Create splitter instance
    splitter = new PDFSplitter(uploadsDir);

    // Reset mocks
    vi.clearAllMocks();

    // Setup default mock for FileWaitUtil (file available immediately)
    vi.mocked(FileWaitUtil.waitForFile).mockResolvedValue(undefined);

    // Setup default mocks for PDFDocument
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('mock-pdf-bytes'));
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(PDFDocument.load).mockResolvedValue({
      getPageCount: () => 3,
    } as any);
  });

  afterEach(() => {
    ImagePathUtil.reset();
  });

  describe('split()', () => {
    it('should split PDF with all pages', async () => {
      const task = {
        id: 'task123',
        filename: 'document.pdf',
        page_range: '',
      };

      // Mock pdfToPng to return 3 pages (PDFDocument.load already mocked in beforeEach)
      vi.mocked(pdfToPng).mockResolvedValueOnce([
        { path: '/tmp/page-1.png', name: 'page-1.png', page: 1, content: Buffer.from('') },
        { path: '/tmp/page-2.png', name: 'page-2.png', page: 2, content: Buffer.from('') },
        { path: '/tmp/page-3.png', name: 'page-3.png', page: 3, content: Buffer.from('') },
      ]);

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      const result = await splitter.split(task);

      expect(result.totalPages).toBe(3);
      expect(result.pages).toHaveLength(3);
      expect(result.pages[0].page).toBe(1);
      expect(result.pages[1].page).toBe(2);
      expect(result.pages[2].page).toBe(3);
    });

    it('should split PDF with page range', async () => {
      const task = {
        id: 'task456',
        filename: 'document.pdf',
        page_range: '1,3',
      };

      // Mock PDF with 5 pages
      vi.mocked(PDFDocument.load).mockResolvedValueOnce({
        getPageCount: () => 5,
      } as any);

      // Mock pdfToPng to return selected pages
      vi.mocked(pdfToPng).mockResolvedValueOnce([
        { path: '/tmp/page-1.png', name: 'page-1.png', page: 1, content: Buffer.from('') },
        { path: '/tmp/page-3.png', name: 'page-3.png', page: 3, content: Buffer.from('') },
      ]);

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      const result = await splitter.split(task);

      expect(result.totalPages).toBe(2);
      expect(result.pages).toHaveLength(2);
      expect(result.pages[0].pageSource).toBe(1);
      expect(result.pages[1].pageSource).toBe(3);
    });

    it('should write page images as page-{N}.png in the task split dir', async () => {
      const task = {
        id: 'task789',
        filename: 'document.pdf',
        page_range: '',
      };

      // Mock PDF with 2 pages
      vi.mocked(PDFDocument.load).mockResolvedValueOnce({
        getPageCount: () => 2,
      } as any);

      vi.mocked(pdfToPng).mockResolvedValueOnce([
        { path: '', name: 'temp-1.png', pageNumber: 1, content: Buffer.from('png-1') },
        { path: '', name: 'temp-2.png', pageNumber: 2, content: Buffer.from('png-2') },
      ]);

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      await splitter.split(task);

      expect(fs.mkdir).toHaveBeenCalledWith(path.join(uploadsDir, 'task789', 'split'), {
        recursive: true,
      });
      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(uploadsDir, 'task789', 'split', 'page-1.png'),
        Buffer.from('png-1')
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(uploadsDir, 'task789', 'split', 'page-2.png'),
        Buffer.from('png-2')
      );
    });

    it('should not hand an output folder to the converter', async () => {
      vi.mocked(pdfToPng).mockResolvedValueOnce([
        { path: '', name: 'temp-1.png', pageNumber: 1, content: Buffer.from('png-1') },
      ] as any);

      await splitter.split({ id: 'task789', filename: 'document.pdf', page_range: '' });

      expect(vi.mocked(pdfToPng).mock.calls[0][1]).not.toHaveProperty('outputFolder');
    });

    it('should throw error for missing task ID', async () => {
      const task = {
        filename: 'document.pdf',
      };

      await expect(splitter.split(task)).rejects.toThrow(/Task ID is required/);
    });

    it('should throw error for missing filename', async () => {
      const task = {
        id: 'task123',
      };

      await expect(splitter.split(task)).rejects.toThrow(/Task filename is required/);
    });

    it('should handle password-protected PDF (non-retryable)', async () => {
      const task = {
        id: 'task123',
        filename: 'protected.pdf',
        page_range: '',
      };

      vi.mocked(PDFDocument.load).mockRejectedValueOnce(new Error('PDF is password protected'));

      await expect(splitter.split(task)).rejects.toThrow(/Cannot process password-protected PDF/);
    });

    it('should handle corrupted PDF', async () => {
      const task = {
        id: 'task123',
        filename: 'corrupted.pdf',
        page_range: '',
      };

      vi.mocked(PDFDocument.load).mockRejectedValueOnce(new Error('Invalid PDF structure'));

      await expect(splitter.split(task)).rejects.toThrow(/PDF file appears to be corrupted/);
    });

    it('should handle file not found', async () => {
      const task = {
        id: 'task123',
        filename: 'missing.pdf',
        page_range: '',
      };

      // Mock FileWaitUtil to reject (file not found)
      vi.mocked(FileWaitUtil.waitForFile).mockRejectedValue(
        new Error('PDF file not found: missing.pdf. The file may have been moved or deleted.')
      );

      await expect(splitter.split(task)).rejects.toThrow(/PDF file not found/);
    });
  });

  describe('error reporting', () => {
    const task = { id: 'task123', filename: 'document.pdf', page_range: '' };
    const splitDir = path.join(uploadsDir, 'task123', 'split');
    const sourcePath = path.join(uploadsDir, 'task123', 'document.pdf');
    const MISSING_FILE_HINT = /moved or deleted/;

    const systemError = (code: string, syscall: string, target: string) =>
      Object.assign(new Error(`${code}: no such file or directory, ${syscall} '${target}'`), {
        code,
        path: target,
      });

    beforeEach(() => {
      vi.spyOn(splitter as any, 'sleep').mockResolvedValue(undefined);
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.mocked(pdfToPng).mockResolvedValue([
        { path: '', name: 'temp-1.png', pageNumber: 1, content: Buffer.from('png-1') },
      ] as any);
    });

    afterEach(() => {
      vi.mocked(pdfToPng).mockReset();
      vi.restoreAllMocks();
    });

    it('should report a failure to create the output dir as an output problem', async () => {
      const error = systemError('ENOENT', 'mkdir', splitDir);
      vi.mocked(fs.mkdir).mockRejectedValue(error);

      const failure = splitter.split(task);

      await expect(failure).rejects.toThrow(`Failed to write split images to ${splitDir}`);
      await expect(failure).rejects.toThrow(error.message);
      await expect(failure).rejects.not.toThrow(MISSING_FILE_HINT);
    });

    it('should retry a failed write without rendering the PDF again', async () => {
      vi.mocked(fs.writeFile).mockRejectedValueOnce(systemError('EBUSY', 'open', splitDir));

      const result = await splitter.split(task);

      expect(result.totalPages).toBe(1);
      expect(fs.writeFile).toHaveBeenCalledTimes(2);
      expect(pdfToPng).toHaveBeenCalledTimes(1);
    });

    it('should not blame the source when writing a page keeps failing, even if it is ENOENT', async () => {
      const target = path.join(splitDir, 'page-1.png');
      vi.mocked(fs.writeFile).mockRejectedValue(systemError('ENOENT', 'open', target));

      const failure = splitter.split(task);

      await expect(failure).rejects.toThrow(`Failed to write split images to ${splitDir}`);
      await expect(failure).rejects.toThrow(target);
      await expect(failure).rejects.not.toThrow(MISSING_FILE_HINT);
      expect(fs.writeFile).toHaveBeenCalledTimes(3);
    });

    it('should not blame the source for an ENOENT on another file while it still exists', async () => {
      const fontPath = '/resources/standard_fonts/missing.pfb';
      vi.mocked(pdfToPng).mockRejectedValue(systemError('ENOENT', 'open', fontPath));

      const failure = splitter.split(task);

      await expect(failure).rejects.toThrow(`Failed to split PDF document.pdf`);
      await expect(failure).rejects.toThrow(fontPath);
      await expect(failure).rejects.not.toThrow(MISSING_FILE_HINT);
      expect(fs.access).toHaveBeenCalledWith(sourcePath);
    });

    it('should report a missing source when the PDF disappears after the pre-check', async () => {
      const error = systemError('ENOENT', 'open', sourcePath);
      vi.mocked(fs.readFile).mockRejectedValue(error);
      vi.mocked(fs.access).mockRejectedValue(error);

      await expect(splitter.split(task)).rejects.toThrow(
        'PDF file not found: document.pdf. The file may have been moved or deleted.'
      );
    });

    it('should not call an unreadable source missing', async () => {
      const error = systemError('EACCES', 'open', sourcePath);
      vi.mocked(fs.readFile).mockRejectedValue(error);
      vi.mocked(fs.access).mockRejectedValue(error);

      const failure = splitter.split(task);

      await expect(failure).rejects.toThrow(`Failed to split PDF document.pdf`);
      await expect(failure).rejects.not.toThrow(MISSING_FILE_HINT);
    });
  });

  describe('cleanup()', () => {
    it('should remove task directory', async () => {
      vi.mocked(fs.rm).mockResolvedValue(undefined);

      await splitter.cleanup('task123');

      expect(fs.rm).toHaveBeenCalledWith(
        path.join(uploadsDir, 'task123', 'split'),
        { recursive: true, force: true }
      );
    });

    it('should not throw error if cleanup fails', async () => {
      vi.mocked(fs.rm).mockRejectedValueOnce(new Error('Permission denied'));

      // Should not throw
      await expect(splitter.cleanup('task123')).resolves.toBeUndefined();
    });

    it('should handle non-existent directory gracefully', async () => {
      vi.mocked(fs.rm).mockResolvedValue(undefined);

      await expect(splitter.cleanup('nonexistent')).resolves.toBeUndefined();
    });
  });

  describe('retry logic', () => {
    it('should retry transient errors', async () => {
      const task = {
        id: 'task123',
        filename: 'document.pdf',
        page_range: '',
      };

      // Mock PDF with 1 page
      vi.mocked(PDFDocument.load)
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValueOnce({
          getPageCount: () => 1,
        } as any);

      vi.mocked(pdfToPng).mockResolvedValueOnce([
        { path: '/tmp/page-1.png', name: 'page-1.png', page: 1, content: Buffer.from('') },
      ]);

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      const result = await splitter.split(task);

      expect(result.totalPages).toBe(1);
      // PDFDocument.load should have been called twice (once failed, once succeeded)
      expect(PDFDocument.load).toHaveBeenCalledTimes(2);
    });

    it('should not retry password errors', async () => {
      const task = {
        id: 'task123',
        filename: 'protected.pdf',
        page_range: '',
      };

      vi.mocked(PDFDocument.load).mockRejectedValue(new Error('password required'));

      await expect(splitter.split(task)).rejects.toThrow();

      // Should only be called once (no retry)
      expect(PDFDocument.load).toHaveBeenCalledTimes(1);
    });

    it('should not retry encrypted PDF errors', async () => {
      const task = {
        id: 'task123',
        filename: 'encrypted.pdf',
        page_range: '',
      };

      vi.mocked(PDFDocument.load).mockRejectedValue(new Error('PDF is encrypted'));

      await expect(splitter.split(task)).rejects.toThrow();

      // Should only be called once (no retry)
      expect(PDFDocument.load).toHaveBeenCalledTimes(1);
    });
  });

  describe('edge cases', () => {
    it('should handle single page PDF', async () => {
      const task = {
        id: 'task123',
        filename: 'single.pdf',
        page_range: '',
      };

      // Mock PDF with 1 page
      vi.mocked(PDFDocument.load).mockResolvedValueOnce({
        getPageCount: () => 1,
      } as any);

      vi.mocked(pdfToPng).mockResolvedValueOnce([
        { path: '/tmp/page-1.png', name: 'page-1.png', page: 1, content: Buffer.from('') },
      ]);

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      const result = await splitter.split(task);

      expect(result.totalPages).toBe(1);
      expect(result.pages).toHaveLength(1);
    });

    it('should handle large PDFs (100+ pages)', async () => {
      const task = {
        id: 'task123',
        filename: 'large.pdf',
        page_range: '1-100',
      };

      // Mock PDF with 200 pages
      vi.mocked(PDFDocument.load).mockResolvedValueOnce({
        getPageCount: () => 200,
      } as any);

      // Mock 100 pages
      const pages = Array.from({ length: 100 }, (_, i) => ({
        path: `/tmp/page-${i + 1}.png`,
        name: `page-${i + 1}.png`,
        page: i + 1,
        content: Buffer.from(''),
      }));

      vi.mocked(pdfToPng).mockResolvedValueOnce(pages);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      const result = await splitter.split(task);

      expect(result.totalPages).toBe(100);
      expect(result.pages).toHaveLength(100);
    });
  });
});
