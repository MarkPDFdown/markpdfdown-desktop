import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ImageSplitter } from '../ImageSplitter.js';
import { ImagePathUtil } from '../ImagePathUtil.js';
import { promises as fs } from 'fs';
import path from 'path';

// Mock fs promises
vi.mock('fs', () => ({
  promises: {
    access: vi.fn(),
    mkdir: vi.fn(),
    copyFile: vi.fn(),
    rm: vi.fn(),
  },
}));

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
  });

  afterEach(() => {
    ImagePathUtil.reset();
  });

  describe('split()', () => {
    it('should copy JPG image to split directory', async () => {
      const task = {
        id: 'task123',
        filename: 'photo.jpg',
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.copyFile).mockResolvedValue(undefined);

      const result = await splitter.split(task);

      expect(result.totalPages).toBe(1);
      expect(result.pages).toHaveLength(1);
      expect(result.pages[0].page).toBe(1);
      expect(result.pages[0].pageSource).toBe(1);
      expect(result.pages[0].imagePath).toBe(path.join(uploadsDir, 'task123', 'split', 'page-1.png'));

      expect(fs.copyFile).toHaveBeenCalledWith(
        path.join(uploadsDir, 'task123', 'photo.jpg'),
        path.join(uploadsDir, 'task123', 'split', 'page-1.png')
      );
    });

    it('should copy PNG image to split directory', async () => {
      const task = {
        id: 'task456',
        filename: 'screenshot.png',
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.copyFile).mockResolvedValue(undefined);

      const result = await splitter.split(task);

      expect(result.totalPages).toBe(1);
      expect(fs.copyFile).toHaveBeenCalledWith(
        path.join(uploadsDir, 'task456', 'screenshot.png'),
        path.join(uploadsDir, 'task456', 'split', 'page-1.png')
      );
    });

    it('should handle JPEG extension', async () => {
      const task = {
        id: 'task789',
        filename: 'image.jpeg',
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.copyFile).mockResolvedValue(undefined);

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
      vi.mocked(fs.copyFile).mockResolvedValue(undefined);

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
      vi.mocked(fs.copyFile).mockResolvedValue(undefined);

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
      vi.mocked(fs.copyFile).mockResolvedValue(undefined);

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
      vi.mocked(fs.copyFile).mockResolvedValue(undefined);

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

      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT: no such file'));

      await expect(splitter.split(task)).rejects.toThrow(/Image file not found/);
    });

    it('should throw error for permission denied', async () => {
      const task = {
        id: 'task123',
        filename: 'photo.jpg',
      };

      vi.mocked(fs.access).mockRejectedValue(new Error('EACCES: permission denied'));

      await expect(splitter.split(task)).rejects.toThrow(/Permission denied/);
    });

    it('should throw error for disk full', async () => {
      const task = {
        id: 'task123',
        filename: 'photo.jpg',
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.copyFile).mockRejectedValue(new Error('ENOSPC: no space left on device'));

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
      vi.mocked(fs.copyFile).mockResolvedValue(undefined);

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
      vi.mocked(fs.copyFile).mockResolvedValue(undefined);

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
      vi.mocked(fs.copyFile).mockResolvedValue(undefined);

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
      vi.mocked(fs.copyFile).mockResolvedValue(undefined);

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
      vi.mocked(fs.copyFile).mockResolvedValue(undefined);

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
      vi.mocked(fs.copyFile).mockResolvedValue(undefined);

      const result = await splitter.split(task);

      expect(result.totalPages).toBe(1);
    });
  });
});
