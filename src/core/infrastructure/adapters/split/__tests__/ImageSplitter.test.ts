import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ImageSplitter } from '../ImageSplitter.js';
import { ImagePathUtil } from '../ImagePathUtil.js';
import { FileWaitUtil } from '../FileWaitUtil.js';
import { reencodeImage } from '../ImageReencoder.js';
import { promises as fs } from 'fs';
import path from 'path';

// Mock FileWaitUtil
vi.mock('../FileWaitUtil.js', () => ({
  FileWaitUtil: {
    waitForFile: vi.fn(),
  },
}));

// Mock fs promises
vi.mock('fs', () => ({
  promises: {
    access: vi.fn(),
    stat: vi.fn(),
    readdir: vi.fn(),
    mkdir: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    rm: vi.fn(),
  },
}));

// The real thing is covered by ImageSplitter.integration.test.ts
vi.mock('../ImageReencoder.js', () => ({
  reencodeImage: vi.fn(),
}));

const ORIGINAL = Buffer.from('original image');
const REENCODED = Buffer.from('re-encoded image');

describe('ImageSplitter', () => {
  const uploadsDir = '/mock/uploads';
  let splitter: ImageSplitter;

  beforeEach(() => {
    // Initialize ImagePathUtil
    ImagePathUtil.init(uploadsDir);

    // Create splitter instance
    splitter = new ImageSplitter(uploadsDir);

    // Reset mocks
    vi.clearAllMocks();

    // Setup default mock for FileWaitUtil (file available immediately)
    vi.mocked(FileWaitUtil.waitForFile).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue(ORIGINAL);
    vi.mocked(reencodeImage).mockResolvedValue(REENCODED);
  });

  afterEach(() => {
    ImagePathUtil.reset();
  });

  describe('split()', () => {
    it('should re-encode JPG image into split directory', async () => {
      const task = {
        id: 'task123',
        filename: 'photo.jpg',
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await splitter.split(task);

      expect(result.totalPages).toBe(1);
      expect(result.pages).toHaveLength(1);
      expect(result.pages[0].page).toBe(1);
      expect(result.pages[0].pageSource).toBe(1);
      expect(result.pages[0].imagePath).toBe(path.join(uploadsDir, 'task123', 'split', 'page-1.png'));

      expect(fs.readFile).toHaveBeenCalledWith(path.join(uploadsDir, 'task123', 'photo.jpg'));
      expect(reencodeImage).toHaveBeenCalledWith(ORIGINAL);
      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(uploadsDir, 'task123', 'split', 'page-1.png'),
        REENCODED
      );
    });

    it('should re-encode PNG image into split directory', async () => {
      const task = {
        id: 'task456',
        filename: 'screenshot.png',
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await splitter.split(task);

      expect(result.totalPages).toBe(1);
      expect(fs.readFile).toHaveBeenCalledWith(path.join(uploadsDir, 'task456', 'screenshot.png'));
      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(uploadsDir, 'task456', 'split', 'page-1.png'),
        REENCODED
      );
    });

    it('should handle JPEG extension', async () => {
      const task = {
        id: 'task789',
        filename: 'image.jpeg',
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await splitter.split(task);

      expect(result.totalPages).toBe(1);
    });

    it('should handle WebP images', async () => {
      const task = {
        id: 'task101',
        filename: 'modern.webp',
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await splitter.split(task);

      expect(result.totalPages).toBe(1);
    });

    it('should handle uppercase extensions', async () => {
      const task = {
        id: 'task202',
        filename: 'IMAGE.JPG',
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await splitter.split(task);

      expect(result.totalPages).toBe(1);
    });

    it('should create task directory if it does not exist', async () => {
      const task = {
        id: 'task123',
        filename: 'photo.jpg',
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await splitter.split(task);

      expect(fs.mkdir).toHaveBeenCalledWith(
        path.join(uploadsDir, 'task123', 'split'),
        { recursive: true }
      );
    });

    it('should ignore page_range parameter (images are single page)', async () => {
      const task = {
        id: 'task123',
        filename: 'photo.jpg',
        page_range: '1-10', // Should be ignored
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await splitter.split(task);

      expect(result.totalPages).toBe(1); // Always 1 page for images
    });

    it('should throw error for missing task ID', async () => {
      const task = {
        filename: 'photo.jpg',
      };

      await expect(splitter.split(task)).rejects.toThrow(/Task ID is required/);
    });

    it('should throw error for missing filename', async () => {
      const task = {
        id: 'task123',
      };

      await expect(splitter.split(task)).rejects.toThrow(/Task filename is required/);
    });

    it('should throw error for file without extension', async () => {
      const task = {
        id: 'task123',
        filename: 'image',
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);

      await expect(splitter.split(task)).rejects.toThrow(/Image file has no extension/);
    });

    it('should throw error if file does not exist', async () => {
      const task = {
        id: 'task123',
        filename: 'missing.jpg',
      };

      // Mock FileWaitUtil to reject (file not found)
      vi.mocked(FileWaitUtil.waitForFile).mockRejectedValue(
        new Error('Image file not found: missing.jpg. The file may have been moved or deleted.')
      );

      await expect(splitter.split(task)).rejects.toThrow(/Image file not found/);
    });

    it('should not write the original when it cannot be re-encoded', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(reencodeImage).mockRejectedValue(new Error('Unsupported image type'));

      await expect(splitter.split({ id: 'task', filename: 'broken.jpg' })).rejects.toThrow(
        /Failed to process image broken\.jpg: Unsupported image type/
      );
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('should throw error for permission denied', async () => {
      const task = {
        id: 'task123',
        filename: 'photo.jpg',
      };

      // FileWaitUtil passes, but writing the page fails with permission denied
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockRejectedValue(new Error('EACCES: permission denied'));

      await expect(splitter.split(task)).rejects.toThrow(/Permission denied/);
    });

    it('should throw error for disk full', async () => {
      const task = {
        id: 'task123',
        filename: 'photo.jpg',
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockRejectedValue(new Error('ENOSPC: no space left on device'));

      await expect(splitter.split(task)).rejects.toThrow(/Not enough disk space/);
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

  describe('result structure', () => {
    it('should return correct result structure', async () => {
      const task = {
        id: 'task123',
        filename: 'photo.jpg',
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await splitter.split(task);

      expect(result).toHaveProperty('pages');
      expect(result).toHaveProperty('totalPages');
      expect(result.pages).toBeInstanceOf(Array);
      expect(result.pages[0]).toHaveProperty('page');
      expect(result.pages[0]).toHaveProperty('pageSource');
      expect(result.pages[0]).toHaveProperty('imagePath');
    });

    it('should always set page and pageSource to 1', async () => {
      const task = {
        id: 'task123',
        filename: 'photo.jpg',
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await splitter.split(task);

      expect(result.pages[0].page).toBe(1);
      expect(result.pages[0].pageSource).toBe(1);
    });

    it('should use PNG extension in image path', async () => {
      const task = {
        id: 'task123',
        filename: 'photo.jpg', // Input is JPG
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await splitter.split(task);

      // Output should be PNG
      expect(result.pages[0].imagePath).toMatch(/\.png$/);
    });
  });

  describe('edge cases', () => {
    it('should handle filenames with special characters', async () => {
      const task = {
        id: 'task123',
        filename: 'my-photo_2024 (1).jpg',
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await splitter.split(task);

      expect(result.totalPages).toBe(1);
    });

    it('should handle filenames with multiple dots', async () => {
      const task = {
        id: 'task123',
        filename: 'image.v2.final.jpg',
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await splitter.split(task);

      expect(result.totalPages).toBe(1);
    });

    it('should handle very long task IDs', async () => {
      const task = {
        id: 'task-' + 'a'.repeat(100),
        filename: 'photo.jpg',
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await splitter.split(task);

      expect(result.totalPages).toBe(1);
    });
  });
});
