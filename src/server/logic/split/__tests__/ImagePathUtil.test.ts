import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ImagePathUtil } from '../ImagePathUtil.js';
import path from 'path';

describe('ImagePathUtil', () => {
  const mockTempDir = '/mock/temp';

  beforeEach(() => {
    // Reset state before each test
    ImagePathUtil.reset();
  });

  afterEach(() => {
    // Clean up after each test
    ImagePathUtil.reset();
  });

  describe('init()', () => {
    it('should initialize with temp directory', () => {
      ImagePathUtil.init(mockTempDir);
      expect(ImagePathUtil.getTempDir()).toBe(mockTempDir);
    });

    it('should allow re-initialization', () => {
      ImagePathUtil.init('/first');
      ImagePathUtil.init('/second');
      expect(ImagePathUtil.getTempDir()).toBe('/second');
    });

    it('should handle paths with trailing slash', () => {
      ImagePathUtil.init('/mock/temp/');
      expect(ImagePathUtil.getTempDir()).toBe('/mock/temp/');
    });

    it('should handle relative paths', () => {
      ImagePathUtil.init('./temp');
      expect(ImagePathUtil.getTempDir()).toBe('./temp');
    });
  });

  describe('getPath()', () => {
    beforeEach(() => {
      ImagePathUtil.init(mockTempDir);
    });

    it('should return correct path for page 1', () => {
      const result = ImagePathUtil.getPath('task123', 1);
      expect(result).toBe(path.join(mockTempDir, 'task123', 'page-1.png'));
    });

    it('should return correct path for page 10', () => {
      const result = ImagePathUtil.getPath('task456', 10);
      expect(result).toBe(path.join(mockTempDir, 'task456', 'page-10.png'));
    });

    it('should return correct path for page 100', () => {
      const result = ImagePathUtil.getPath('task789', 100);
      expect(result).toBe(path.join(mockTempDir, 'task789', 'page-100.png'));
    });

    it('should handle different task IDs', () => {
      const result1 = ImagePathUtil.getPath('abc', 1);
      const result2 = ImagePathUtil.getPath('xyz', 1);
      expect(result1).toBe(path.join(mockTempDir, 'abc', 'page-1.png'));
      expect(result2).toBe(path.join(mockTempDir, 'xyz', 'page-1.png'));
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
      ImagePathUtil.init(mockTempDir);
    });

    it('should return correct task directory', () => {
      const result = ImagePathUtil.getTaskDir('task123');
      expect(result).toBe(path.join(mockTempDir, 'task123'));
    });

    it('should handle different task IDs', () => {
      const result1 = ImagePathUtil.getTaskDir('abc');
      const result2 = ImagePathUtil.getTaskDir('xyz');
      expect(result1).toBe(path.join(mockTempDir, 'abc'));
      expect(result2).toBe(path.join(mockTempDir, 'xyz'));
    });

    it('should throw error if not initialized', () => {
      ImagePathUtil.reset();
      expect(() => ImagePathUtil.getTaskDir('task123')).toThrow(
        /ImagePathUtil not initialized/
      );
    });
  });

  describe('getTempDir()', () => {
    it('should return null before initialization', () => {
      expect(ImagePathUtil.getTempDir()).toBeNull();
    });

    it('should return temp directory after initialization', () => {
      ImagePathUtil.init(mockTempDir);
      expect(ImagePathUtil.getTempDir()).toBe(mockTempDir);
    });

    it('should return null after reset', () => {
      ImagePathUtil.init(mockTempDir);
      ImagePathUtil.reset();
      expect(ImagePathUtil.getTempDir()).toBeNull();
    });
  });

  describe('reset()', () => {
    it('should reset temp directory to null', () => {
      ImagePathUtil.init(mockTempDir);
      expect(ImagePathUtil.getTempDir()).toBe(mockTempDir);
      ImagePathUtil.reset();
      expect(ImagePathUtil.getTempDir()).toBeNull();
    });

    it('should make getPath() throw after reset', () => {
      ImagePathUtil.init(mockTempDir);
      ImagePathUtil.reset();
      expect(() => ImagePathUtil.getPath('task123', 1)).toThrow();
    });

    it('should make getTaskDir() throw after reset', () => {
      ImagePathUtil.init(mockTempDir);
      ImagePathUtil.reset();
      expect(() => ImagePathUtil.getTaskDir('task123')).toThrow();
    });
  });

  describe('path format consistency', () => {
    beforeEach(() => {
      ImagePathUtil.init(mockTempDir);
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

    it('should always include task ID in path', () => {
      const result = ImagePathUtil.getPath('my-task-id', 1);
      expect(result).toContain('my-task-id');
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
      ImagePathUtil.init(mockTempDir);
    });

    it('should handle empty task ID', () => {
      const result = ImagePathUtil.getPath('', 1);
      expect(result).toBe(path.join(mockTempDir, '', 'page-1.png'));
    });

    it('should handle task ID with special characters', () => {
      const result = ImagePathUtil.getPath('task-123_abc', 1);
      expect(result).toBe(path.join(mockTempDir, 'task-123_abc', 'page-1.png'));
    });

    it('should handle page 0 (even though invalid for business logic)', () => {
      const result = ImagePathUtil.getPath('task123', 0);
      expect(result).toBe(path.join(mockTempDir, 'task123', 'page-0.png'));
    });

    it('should handle negative page numbers (even though invalid)', () => {
      const result = ImagePathUtil.getPath('task123', -1);
      expect(result).toBe(path.join(mockTempDir, 'task123', 'page--1.png'));
    });
  });
});
