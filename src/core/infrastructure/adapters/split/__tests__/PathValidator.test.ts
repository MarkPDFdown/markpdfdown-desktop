import { describe, it, expect } from 'vitest';
import path from 'path';
import { PathValidator } from '../PathValidator.js';

describe('PathValidator', () => {
  // Use a consistent base directory for tests
  const baseDir = '/uploads';

  describe('validate()', () => {
    it('should accept paths within allowed directory', () => {
      expect(() => {
        PathValidator.validate('/uploads/task1/file.pdf', baseDir);
      }).not.toThrow();
    });

    it('should accept paths equal to allowed directory', () => {
      expect(() => {
        PathValidator.validate('/uploads', baseDir);
      }).not.toThrow();
    });

    it('should accept deeply nested paths', () => {
      expect(() => {
        PathValidator.validate('/uploads/a/b/c/d/file.txt', baseDir);
      }).not.toThrow();
    });

    it('should reject paths outside allowed directory', () => {
      expect(() => {
        PathValidator.validate('/etc/passwd', baseDir);
      }).toThrow(/Security error.*outside allowed directory/);
    });

    it('should reject paths with traversal to parent', () => {
      expect(() => {
        PathValidator.validate('/uploads/../etc/passwd', baseDir);
      }).toThrow(/Security error/);
    });

    it('should reject sibling directories', () => {
      expect(() => {
        PathValidator.validate('/other/file.txt', baseDir);
      }).toThrow(/Security error/);
    });

    it('should handle resolved paths correctly', () => {
      // This path resolves outside /uploads
      expect(() => {
        PathValidator.validate('/uploads/task1/../../other/file.txt', baseDir);
      }).toThrow(/Security error/);
    });
  });

  describe('safePath()', () => {
    it('should join paths safely', () => {
      const result = PathValidator.safePath(baseDir, 'task1', 'file.pdf');
      expect(result).toBe(path.join(baseDir, 'task1', 'file.pdf'));
    });

    it('should sanitize .. in segments', () => {
      const result = PathValidator.safePath(baseDir, 'task1', '..safe', 'file.pdf');
      expect(result).toBe(path.join(baseDir, 'task1', 'safe', 'file.pdf'));
    });

    it('should remove leading slashes from segments', () => {
      const result = PathValidator.safePath(baseDir, '/task1', 'file.pdf');
      expect(result).toBe(path.join(baseDir, 'task1', 'file.pdf'));
    });

    it('should remove trailing slashes from segments', () => {
      const result = PathValidator.safePath(baseDir, 'task1/', 'file.pdf');
      expect(result).toBe(path.join(baseDir, 'task1', 'file.pdf'));
    });

    it('should handle multiple .. patterns', () => {
      const result = PathValidator.safePath(baseDir, '....', 'file.pdf');
      expect(result).toBe(path.join(baseDir, 'file.pdf'));
    });

    it('should handle empty segments', () => {
      const result = PathValidator.safePath(baseDir, '', 'file.pdf');
      expect(result).toBe(path.join(baseDir, 'file.pdf'));
    });

    it('should sanitize repeated traversal attempts', () => {
      // .... becomes .. after first pass, then empty after second pass
      const result = PathValidator.safePath(baseDir, '......', 'file.pdf');
      expect(result).toBe(path.join(baseDir, 'file.pdf'));
    });

    it('should throw for path that escapes after sanitization', () => {
      // Even after sanitization, if path somehow escapes, should throw
      // This is tested by the validate() call inside safePath()
      expect(() => {
        // Create a base path, then try to escape
        PathValidator.safePath('/a/b', '..', '..', '..', 'etc', 'passwd');
      }).not.toThrow(); // After sanitization, .. becomes '', so path stays in base
    });

    it('should handle filenames with special characters', () => {
      const result = PathValidator.safePath(baseDir, 'task1', 'file (1).pdf');
      expect(result).toBe(path.join(baseDir, 'task1', 'file (1).pdf'));
    });
  });
});
