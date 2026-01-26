import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { TempFileManager } from '../TempFileManager.js';

describe('TempFileManager', () => {
  let manager: TempFileManager;

  beforeEach(() => {
    manager = new TempFileManager();
  });

  afterEach(async () => {
    // Clean up any remaining temp files
    await manager.cleanup();
  });

  describe('createHtmlFile()', () => {
    it('should create a temp HTML file', async () => {
      const html = '<html><body>Test</body></html>';
      const filepath = await manager.createHtmlFile(html);

      expect(filepath).toContain('markpdfdown-render-');
      expect(filepath).toMatch(/\.html$/);

      // Verify file exists
      const stat = await fs.stat(filepath);
      expect(stat.isFile()).toBe(true);

      // Verify content
      const content = await fs.readFile(filepath, 'utf-8');
      expect(content).toBe(html);
    });

    it('should create unique files for each call', async () => {
      const filepath1 = await manager.createHtmlFile('<html>1</html>');
      const filepath2 = await manager.createHtmlFile('<html>2</html>');

      expect(filepath1).not.toBe(filepath2);
    });

    it('should track created files', async () => {
      expect(manager.getTrackedFileCount()).toBe(0);

      await manager.createHtmlFile('<html>1</html>');
      expect(manager.getTrackedFileCount()).toBe(1);

      await manager.createHtmlFile('<html>2</html>');
      expect(manager.getTrackedFileCount()).toBe(2);
    });

    it('should handle special characters in HTML', async () => {
      const html = '<html><body>测试 éàü 🎉</body></html>';
      const filepath = await manager.createHtmlFile(html);

      const content = await fs.readFile(filepath, 'utf-8');
      expect(content).toBe(html);
    });
  });

  describe('deleteFile()', () => {
    it('should delete a specific file', async () => {
      const filepath = await manager.createHtmlFile('<html>Test</html>');
      expect(manager.getTrackedFileCount()).toBe(1);

      await manager.deleteFile(filepath);
      expect(manager.getTrackedFileCount()).toBe(0);

      // Verify file no longer exists
      await expect(fs.access(filepath)).rejects.toThrow();
    });

    it('should not throw for non-existent file', async () => {
      await expect(
        manager.deleteFile('/non/existent/file.html')
      ).resolves.not.toThrow();
    });

    it('should not throw for already deleted file', async () => {
      const filepath = await manager.createHtmlFile('<html>Test</html>');
      await manager.deleteFile(filepath);
      await expect(manager.deleteFile(filepath)).resolves.not.toThrow();
    });
  });

  describe('cleanup()', () => {
    it('should delete all tracked files', async () => {
      const filepaths = await Promise.all([
        manager.createHtmlFile('<html>1</html>'),
        manager.createHtmlFile('<html>2</html>'),
        manager.createHtmlFile('<html>3</html>'),
      ]);

      expect(manager.getTrackedFileCount()).toBe(3);

      await manager.cleanup();

      expect(manager.getTrackedFileCount()).toBe(0);

      // Verify all files deleted
      for (const filepath of filepaths) {
        await expect(fs.access(filepath)).rejects.toThrow();
      }
    });

    it('should be safe to call multiple times', async () => {
      await manager.createHtmlFile('<html>Test</html>');
      await manager.cleanup();
      await expect(manager.cleanup()).resolves.not.toThrow();
    });

    it('should handle partially deleted files gracefully', async () => {
      const filepath = await manager.createHtmlFile('<html>Test</html>');

      // Manually delete the file
      await fs.unlink(filepath);

      // Cleanup should not throw
      await expect(manager.cleanup()).resolves.not.toThrow();
    });
  });

  describe('getTrackedFileCount()', () => {
    it('should return correct count after operations', async () => {
      expect(manager.getTrackedFileCount()).toBe(0);

      const f1 = await manager.createHtmlFile('<html>1</html>');
      expect(manager.getTrackedFileCount()).toBe(1);

      await manager.createHtmlFile('<html>2</html>');
      expect(manager.getTrackedFileCount()).toBe(2);

      await manager.deleteFile(f1);
      expect(manager.getTrackedFileCount()).toBe(1);

      await manager.cleanup();
      expect(manager.getTrackedFileCount()).toBe(0);
    });
  });
});
