import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PDFSplitter } from '../PDFSplitter.js';
import { ImagePathUtil } from '../ImagePathUtil.js';
import { promises as fs } from 'fs';
import path from 'path';

// Mock pdf-to-png-converter
vi.mock('pdf-to-png-converter', () => ({
  pdfToPng: vi.fn(),
}));

// Mock fs promises
vi.mock('fs', () => ({
  promises: {
    mkdir: vi.fn(),
    rename: vi.fn(),
    rm: vi.fn(),
    unlink: vi.fn(),
  },
}));

import { pdfToPng } from 'pdf-to-png-converter';

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

      // Mock pdfToPng to return 3 pages
      vi.mocked(pdfToPng).mockResolvedValueOnce([
        { pageCount: 3, path: '/tmp/page-1.png', name: 'page-1.png', page: 1, content: Buffer.from('') },
      ]);

      vi.mocked(pdfToPng).mockResolvedValueOnce([
        { path: '/tmp/page-1.png', name: 'page-1.png', page: 1, content: Buffer.from('') },
        { path: '/tmp/page-2.png', name: 'page-2.png', page: 2, content: Buffer.from('') },
        { path: '/tmp/page-3.png', name: 'page-3.png', page: 3, content: Buffer.from('') },
      ]);

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

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

      // Mock pdfToPng to return page count
      vi.mocked(pdfToPng).mockResolvedValueOnce([
        { pageCount: 5, path: '/tmp/page-1.png', name: 'page-1.png', page: 1, content: Buffer.from('') },
      ]);

      // Mock pdfToPng to return selected pages
      vi.mocked(pdfToPng).mockResolvedValueOnce([
        { path: '/tmp/page-1.png', name: 'page-1.png', page: 1, content: Buffer.from('') },
        { path: '/tmp/page-3.png', name: 'page-3.png', page: 3, content: Buffer.from('') },
      ]);

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      const result = await splitter.split(task);

      expect(result.totalPages).toBe(2);
      expect(result.pages).toHaveLength(2);
      expect(result.pages[0].pageSource).toBe(1);
      expect(result.pages[1].pageSource).toBe(3);
    });

    it('should rename files to page-{N}.png format', async () => {
      const task = {
        id: 'task789',
        filename: 'document.pdf',
        page_range: '',
      };

      vi.mocked(pdfToPng).mockResolvedValueOnce([
        { pageCount: 2, path: '/tmp/page-1.png', name: 'page-1.png', page: 1, content: Buffer.from('') },
      ]);

      vi.mocked(pdfToPng).mockResolvedValueOnce([
        { path: '/tmp/temp-1.png', name: 'temp-1.png', page: 1, content: Buffer.from('') },
        { path: '/tmp/temp-2.png', name: 'temp-2.png', page: 2, content: Buffer.from('') },
      ]);

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      await splitter.split(task);

      // Verify rename was called with correct paths
      expect(fs.rename).toHaveBeenCalledWith(
        '/tmp/temp-1.png',
        path.join(uploadsDir, 'task789', 'split', 'page-1.png')
      );
      expect(fs.rename).toHaveBeenCalledWith(
        '/tmp/temp-2.png',
        path.join(uploadsDir, 'task789', 'split', 'page-2.png')
      );
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

      vi.mocked(pdfToPng).mockRejectedValueOnce(new Error('PDF is password protected'));

      await expect(splitter.split(task)).rejects.toThrow(/Cannot process password-protected PDF/);
    });

    it('should handle corrupted PDF', async () => {
      const task = {
        id: 'task123',
        filename: 'corrupted.pdf',
        page_range: '',
      };

      vi.mocked(pdfToPng).mockRejectedValueOnce(new Error('Invalid PDF structure'));

      await expect(splitter.split(task)).rejects.toThrow(/PDF file appears to be corrupted/);
    });

    it('should handle file not found', async () => {
      const task = {
        id: 'task123',
        filename: 'missing.pdf',
        page_range: '',
      };

      // Mock all retry attempts with the same error
      vi.mocked(pdfToPng).mockRejectedValue(new Error('ENOENT: no such file'));

      await expect(splitter.split(task)).rejects.toThrow(/PDF file not found/);
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

      // First call: fail with transient error
      // Second call: succeed
      vi.mocked(pdfToPng)
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValueOnce([
          { pageCount: 1, path: '/tmp/page-1.png', name: 'page-1.png', page: 1, content: Buffer.from('') },
        ])
        .mockResolvedValueOnce([
          { path: '/tmp/page-1.png', name: 'page-1.png', page: 1, content: Buffer.from('') },
        ]);

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      const result = await splitter.split(task);

      expect(result.totalPages).toBe(1);
      // pdfToPng should have been called at least twice (once failed, once succeeded)
      expect(pdfToPng).toHaveBeenCalledTimes(3); // 1 failed + 1 success for pageCount + 1 for pages
    });

    it('should not retry password errors', async () => {
      const task = {
        id: 'task123',
        filename: 'protected.pdf',
        page_range: '',
      };

      vi.mocked(pdfToPng).mockRejectedValue(new Error('password required'));

      await expect(splitter.split(task)).rejects.toThrow();

      // Should only be called once (no retry)
      expect(pdfToPng).toHaveBeenCalledTimes(1);
    });

    it('should not retry encrypted PDF errors', async () => {
      const task = {
        id: 'task123',
        filename: 'encrypted.pdf',
        page_range: '',
      };

      vi.mocked(pdfToPng).mockRejectedValue(new Error('PDF is encrypted'));

      await expect(splitter.split(task)).rejects.toThrow();

      // Should only be called once (no retry)
      expect(pdfToPng).toHaveBeenCalledTimes(1);
    });
  });

  describe('edge cases', () => {
    it('should handle single page PDF', async () => {
      const task = {
        id: 'task123',
        filename: 'single.pdf',
        page_range: '',
      };

      vi.mocked(pdfToPng).mockResolvedValueOnce([
        { pageCount: 1, path: '/tmp/page-1.png', name: 'page-1.png', page: 1, content: Buffer.from('') },
      ]);

      vi.mocked(pdfToPng).mockResolvedValueOnce([
        { path: '/tmp/page-1.png', name: 'page-1.png', page: 1, content: Buffer.from('') },
      ]);

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

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

      vi.mocked(pdfToPng).mockResolvedValueOnce([
        { pageCount: 200, path: '/tmp/page-1.png', name: 'page-1.png', page: 1, content: Buffer.from('') },
      ]);

      // Mock 100 pages
      const pages = Array.from({ length: 100 }, (_, i) => ({
        path: `/tmp/page-${i + 1}.png`,
        name: `page-${i + 1}.png`,
        page: i + 1,
        content: Buffer.from(''),
      }));

      vi.mocked(pdfToPng).mockResolvedValueOnce(pages);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      const result = await splitter.split(task);

      expect(result.totalPages).toBe(100);
      expect(result.pages).toHaveLength(100);
    });
  });
});
