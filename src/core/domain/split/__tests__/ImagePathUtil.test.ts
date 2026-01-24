import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ImagePathUtil } from '../ImagePathUtil.js';
import path from 'path';

describe('ImagePathUtil', () => {
  const mockUploadsDir = '/mock/uploads';

  beforeEach(() => {
    // Reset state before each test
    ImagePathUtil.reset();
  });

  afterEach(() => {
    // Clean up after each test
    ImagePathUtil.reset();
  });

  describe('init()', () => {
    it('should initialize with uploads directory', () => {
      ImagePathUtil.init(mockUploadsDir);
      expect(ImagePathUtil.getUploadsDir()).toBe(mockUploadsDir);
    });

    it('should allow re-initialization', () => {
      ImagePathUtil.init('/first');
      ImagePathUtil.init('/second');
      expect(ImagePathUtil.getUploadsDir()).toBe('/second');
    });

    it('should handle paths with trailing slash', () => {
      ImagePathUtil.init('/mock/uploads/');
      expect(ImagePathUtil.getUploadsDir()).toBe('/mock/uploads/');
    });

    it('should handle relative paths', () => {
      ImagePathUtil.init('./uploads');
      expect(ImagePathUtil.getUploadsDir()).toBe('./uploads');
    });
  });

  describe('getPath()', () => {
    beforeEach(() => {
      ImagePathUtil.init(mockUploadsDir);
    });

    it('should return correct path for page 1', () => {
      const result = ImagePathUtil.getPath('task123', 1);
      expect(result).toBe(path.join(mockUploadsDir, 'task123', 'split', 'page-1.png'));
    });

    it('should return correct path for page 10', () => {
      const result = ImagePathUtil.getPath('task456', 10);
      expect(result).toBe(path.join(mockUploadsDir, 'task456', 'split', 'page-10.png'));
    });

    it('should return correct path for page 100', () => {
      const result = ImagePathUtil.getPath('task789', 100);
      expect(result).toBe(path.join(mockUploadsDir, 'task789', 'split', 'page-100.png'));
    });

    it('should handle different task IDs', () => {
      const result1 = ImagePathUtil.getPath('abc', 1);
      const result2 = ImagePathUtil.getPath('xyz', 1);
      expect(result1).toBe(path.join(mockUploadsDir, 'abc', 'split', 'page-1.png'));
      expect(result2).toBe(path.join(mockUploadsDir, 'xyz', 'split', 'page-1.png'));
    });

    it('should throw error if not initialized', () => {
      ImagePathUtil.reset();
      expect(() => ImagePathUtil.getPath('task123', 1)).toThrow(
        /ImagePathUtil not initialized/
      );
    });

    it('should include error message about calling init()', () => {
      ImagePathUtil.reset();
      expect(() => ImagePathUtil.getPath('task123', 1)).toThrow(/Call ImagePathUtil.init/);
    });
  });

  describe('getTaskDir()', () => {
    beforeEach(() => {
      ImagePathUtil.init(mockUploadsDir);
    });

    it('should return correct task split directory', () => {
      const result = ImagePathUtil.getTaskDir('task123');
      expect(result).toBe(path.join(mockUploadsDir, 'task123', 'split'));
    });

    it('should handle different task IDs', () => {
      const result1 = ImagePathUtil.getTaskDir('abc');
      const result2 = ImagePathUtil.getTaskDir('xyz');
      expect(result1).toBe(path.join(mockUploadsDir, 'abc', 'split'));
      expect(result2).toBe(path.join(mockUploadsDir, 'xyz', 'split'));
    });

    it('should throw error if not initialized', () => {
      ImagePathUtil.reset();
      expect(() => ImagePathUtil.getTaskDir('task123')).toThrow(
        /ImagePathUtil not initialized/
      );
    });
  });

  describe('getUploadsDir()', () => {
    it('should return null before initialization', () => {
      expect(ImagePathUtil.getUploadsDir()).toBeNull();
    });

    it('should return uploads directory after initialization', () => {
      ImagePathUtil.init(mockUploadsDir);
      expect(ImagePathUtil.getUploadsDir()).toBe(mockUploadsDir);
    });

    it('should return null after reset', () => {
      ImagePathUtil.init(mockUploadsDir);
      ImagePathUtil.reset();
      expect(ImagePathUtil.getUploadsDir()).toBeNull();
    });
  });

  describe('reset()', () => {
    it('should reset uploads directory to null', () => {
      ImagePathUtil.init(mockUploadsDir);
      expect(ImagePathUtil.getUploadsDir()).toBe(mockUploadsDir);
      ImagePathUtil.reset();
      expect(ImagePathUtil.getUploadsDir()).toBeNull();
    });

    it('should make getPath() throw after reset', () => {
      ImagePathUtil.init(mockUploadsDir);
      ImagePathUtil.reset();
      expect(() => ImagePathUtil.getPath('task123', 1)).toThrow();
    });

    it('should make getTaskDir() throw after reset', () => {
      ImagePathUtil.init(mockUploadsDir);
      ImagePathUtil.reset();
      expect(() => ImagePathUtil.getTaskDir('task123')).toThrow();
    });
  });

  describe('path format consistency', () => {
    beforeEach(() => {
      ImagePathUtil.init(mockUploadsDir);
    });

    it('should always use .png extension', () => {
      const result1 = ImagePathUtil.getPath('task1', 1);
      const result2 = ImagePathUtil.getPath('task2', 5);
      const result3 = ImagePathUtil.getPath('task3', 100);
      expect(result1).toMatch(/\.png$/);
      expect(result2).toMatch(/\.png$/);
      expect(result3).toMatch(/\.png$/);
    });

    it('should always use page-{N} format', () => {
      const result1 = ImagePathUtil.getPath('task1', 1);
      const result2 = ImagePathUtil.getPath('task2', 5);
      const result3 = ImagePathUtil.getPath('task3', 100);
      expect(result1).toMatch(/page-1\.png$/);
      expect(result2).toMatch(/page-5\.png$/);
      expect(result3).toMatch(/page-100\.png$/);
    });

    it('should always include task ID and split directory in path', () => {
      const result = ImagePathUtil.getPath('my-task-id', 1);
      expect(result).toContain('my-task-id');
      expect(result).toContain('split');
    });

    it('should produce platform-specific separators', () => {
      const result = ImagePathUtil.getPath('task123', 1);
      // Path should use the platform's separator
      const expectedSeparator = path.sep;
      expect(result).toContain(expectedSeparator);
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      ImagePathUtil.init(mockUploadsDir);
    });

    it('should handle empty task ID', () => {
      const result = ImagePathUtil.getPath('', 1);
      expect(result).toBe(path.join(mockUploadsDir, '', 'split', 'page-1.png'));
    });

    it('should handle task ID with special characters', () => {
      const result = ImagePathUtil.getPath('task-123_abc', 1);
      expect(result).toBe(path.join(mockUploadsDir, 'task-123_abc', 'split', 'page-1.png'));
    });

    it('should handle page 0 (even though invalid for business logic)', () => {
      const result = ImagePathUtil.getPath('task123', 0);
      expect(result).toBe(path.join(mockUploadsDir, 'task123', 'split', 'page-0.png'));
    });

    it('should handle negative page numbers (even though invalid)', () => {
      const result = ImagePathUtil.getPath('task123', -1);
      expect(result).toBe(path.join(mockUploadsDir, 'task123', 'split', 'page--1.png'));
    });
  });
});
