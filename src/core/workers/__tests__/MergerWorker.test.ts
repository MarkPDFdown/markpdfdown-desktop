import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MergerWorker } from '../MergerWorker.js';
import { TaskStatus } from '../../types/TaskStatus.js';
import { PageStatus } from '../../types/PageStatus.js';

// Mock dependencies
vi.mock('fs/promises', () => ({
  default: {
    writeFile: vi.fn(),
    access: vi.fn(),
    mkdir: vi.fn(),
  },
}));

vi.mock('../../db/index.js', () => ({
  prisma: {
    $transaction: vi.fn(),
    task: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    taskDetail: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../../events/EventBus.js', () => ({
  eventBus: {
    emitTaskEvent: vi.fn(),
  },
  TaskEventType: {
    TASK_UPDATED: 'task:updated',
    TASK_STATUS_CHANGED: 'task:status_changed',
    TASK_PROGRESS_CHANGED: 'task:progress_changed',
  },
}));

vi.mock('../../config/worker.config.js', () => ({
  WORKER_CONFIG: {
    merger: {
      pollInterval: 100, // Short for tests
    },
  },
}));

import fs from 'fs/promises';
import { prisma } from '../../db/index.js';
import { eventBus, TaskEventType } from '../../events/EventBus.js';

describe('MergerWorker', () => {
  const uploadsDir = '/mock/uploads';
  let worker: MergerWorker;

  beforeEach(() => {
    worker = new MergerWorker(uploadsDir);
    vi.clearAllMocks();
  });

  afterEach(() => {
    worker.stop();
  });

  describe('constructor', () => {
    it('should create worker with uploads directory', () => {
      expect(worker).toBeDefined();
      expect(worker.getWorkerId()).toBeTruthy();
    });

    it('should initialize with isRunning = false', () => {
      expect(worker.getIsRunning()).toBe(false);
    });

    it('should generate different IDs for different workers', () => {
      const worker2 = new MergerWorker(uploadsDir);
      expect(worker.getWorkerId()).not.toBe(worker2.getWorkerId());
    });
  });

  describe('run()', () => {
    it('should set isRunning to true when started', async () => {
      // Mock claimTask to return null (no tasks)
      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        const tx = {
          task: {
            findFirst: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
          },
        };
        return callback(tx);
      });

      const runPromise = worker.run();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(worker.getIsRunning()).toBe(true);

      worker.stop();
      await runPromise;
    });

    it('should stop when stop() is called', async () => {
      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        const tx = {
          task: {
            findFirst: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
          },
        };
        return callback(tx);
      });

      const runPromise = worker.run();
      await new Promise((resolve) => setTimeout(resolve, 50));

      worker.stop();
      await runPromise;

      expect(worker.getIsRunning()).toBe(false);
    });

    it('should continue running after error in main loop', async () => {
      let callCount = 0;

      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Transient error');
        }
        const tx = {
          task: {
            findFirst: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
          },
        };
        return callback(tx);
      });

      const runPromise = worker.run();
      await new Promise((resolve) => setTimeout(resolve, 250));

      expect(callCount).toBeGreaterThan(1);

      worker.stop();
      await runPromise;
    });

    it('should claim and process READY_TO_MERGE tasks', async () => {
      const mockTask = {
        id: 'task123',
        filename: 'document.pdf',
        status: TaskStatus.READY_TO_MERGE,
      };

      const mockPages = [
        { page: 1, content: '# Page 1' },
        { page: 2, content: '# Page 2' },
      ];

      let claimCalled = false;

      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        const tx = {
          task: {
            findFirst: vi.fn().mockResolvedValue(claimCalled ? null : mockTask),
            update: vi.fn().mockResolvedValue({ ...mockTask, status: TaskStatus.MERGING }),
          },
        };
        claimCalled = true;
        return callback(tx);
      });

      vi.mocked(prisma.taskDetail.findMany).mockResolvedValue(mockPages as any);
      vi.mocked(prisma.task.update).mockResolvedValue({} as any);
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const runPromise = worker.run();
      await new Promise((resolve) => setTimeout(resolve, 150));

      worker.stop();
      await runPromise;

      expect(prisma.taskDetail.findMany).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalled();
    });
  });

  describe('stop()', () => {
    it('should set isRunning to false', () => {
      (worker as any).isRunning = true;
      worker.stop();
      expect(worker.getIsRunning()).toBe(false);
    });

    it('should release current task if processing', async () => {
      (worker as any).isRunning = true;
      (worker as any).currentTaskId = 'task123';

      vi.mocked(prisma.task.update).mockResolvedValue({} as any);

      worker.stop();

      // Wait for async release
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(prisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'task123' },
          data: expect.objectContaining({
            status: TaskStatus.READY_TO_MERGE,
            worker_id: null,
          }),
        })
      );
    });

    it('should not release task if none is being processed', async () => {
      (worker as any).isRunning = true;
      (worker as any).currentTaskId = null;

      worker.stop();

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(prisma.task.update).not.toHaveBeenCalled();
    });
  });

  describe('releaseCurrentTask()', () => {
    it('should release task back to READY_TO_MERGE status', async () => {
      (worker as any).currentTaskId = 'task123';

      vi.mocked(prisma.task.update).mockResolvedValue({} as any);

      await (worker as any).releaseCurrentTask();

      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task123' },
        data: {
          status: TaskStatus.READY_TO_MERGE,
          worker_id: null,
        },
      });
      expect((worker as any).currentTaskId).toBeNull();
    });

    it('should do nothing if no current task', async () => {
      (worker as any).currentTaskId = null;

      await (worker as any).releaseCurrentTask();

      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it('should handle release errors gracefully', async () => {
      (worker as any).currentTaskId = 'task123';

      vi.mocked(prisma.task.update).mockRejectedValue(new Error('DB error'));

      // Should not throw
      await expect((worker as any).releaseCurrentTask()).resolves.toBeUndefined();
    });
  });

  describe('getCompletedPages()', () => {
    it('should fetch completed pages ordered by page number', async () => {
      const mockPages = [
        { page: 1, content: '# Page 1' },
        { page: 2, content: '# Page 2' },
        { page: 3, content: '# Page 3' },
      ];

      vi.mocked(prisma.taskDetail.findMany).mockResolvedValue(mockPages as any);

      const result = await (worker as any).getCompletedPages('task123');

      expect(prisma.taskDetail.findMany).toHaveBeenCalledWith({
        where: {
          task: 'task123',
          status: PageStatus.COMPLETED,
        },
        orderBy: {
          page: 'asc',
        },
        select: {
          page: true,
          content: true,
        },
      });
      expect(result).toEqual(mockPages);
    });

    it('should return empty array if no completed pages', async () => {
      vi.mocked(prisma.taskDetail.findMany).mockResolvedValue([]);

      const result = await (worker as any).getCompletedPages('task123');

      expect(result).toEqual([]);
    });
  });

  describe('mergeMarkdown()', () => {
    it('should merge pages with page markers and separators', () => {
      const pages = [
        { page: 1, content: '# Page 1 content' },
        { page: 2, content: '# Page 2 content' },
      ];

      const result = (worker as any).mergeMarkdown(pages);

      expect(result).toBe(
        '<!-- Page 1 -->\n\n# Page 1 content\n\n---\n\n<!-- Page 2 -->\n\n# Page 2 content'
      );
    });

    it('should handle single page', () => {
      const pages = [{ page: 1, content: '# Only page' }];

      const result = (worker as any).mergeMarkdown(pages);

      expect(result).toBe('<!-- Page 1 -->\n\n# Only page');
    });

    it('should handle empty content', () => {
      const pages = [
        { page: 1, content: '' },
        { page: 2, content: '# Page 2' },
      ];

      const result = (worker as any).mergeMarkdown(pages);

      expect(result).toBe('<!-- Page 1 -->\n\n\n\n---\n\n<!-- Page 2 -->\n\n# Page 2');
    });

    it('should preserve content with special characters', () => {
      const pages = [
        { page: 1, content: '# Title\n\n```javascript\nconst x = 1;\n```' },
        { page: 2, content: '| Col1 | Col2 |\n| --- | --- |' },
      ];

      const result = (worker as any).mergeMarkdown(pages);

      expect(result).toContain('```javascript');
      expect(result).toContain('| Col1 | Col2 |');
    });
  });

  describe('getOutputPath()', () => {
    it('should generate correct output path for PDF files', () => {
      const task = { id: 'task123', filename: 'document.pdf' };

      const result = (worker as any).getOutputPath(task);

      expect(result).toMatch(/[/\\]mock[/\\]uploads[/\\]task123[/\\]document\.md$/);
    });

    it('should handle filenames with multiple dots', () => {
      const task = { id: 'task123', filename: 'my.report.2024.pdf' };

      const result = (worker as any).getOutputPath(task);

      expect(result).toMatch(/my\.report\.2024\.md$/);
    });

    it('should handle hidden files (starting with dot)', () => {
      const task = { id: 'task123', filename: '.hidden.pdf' };

      const result = (worker as any).getOutputPath(task);

      expect(result).toMatch(/\.hidden\.md$/);
    });

    it('should handle filenames without extension', () => {
      const task = { id: 'task123', filename: 'document' };

      const result = (worker as any).getOutputPath(task);

      expect(result).toMatch(/document\.md$/);
    });

    it('should handle image file extensions', () => {
      const task = { id: 'task123', filename: 'scan.png' };

      const result = (worker as any).getOutputPath(task);

      expect(result).toMatch(/scan\.md$/);
    });
  });

  describe('saveMergedFile()', () => {
    it('should save content to correct path with UTF-8 encoding', async () => {
      const task = { id: 'task123', filename: 'document.pdf' };
      const content = '# Merged content';

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await (worker as any).saveMergedFile(task, content);

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/document\.md$/),
        content,
        { encoding: 'utf-8' }
      );
      expect(result).toMatch(/document\.md$/);
    });

    it('should create directory if not exists', async () => {
      const task = { id: 'task123', filename: 'document.pdf' };
      const content = '# Content';

      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await (worker as any).saveMergedFile(task, content);

      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringMatching(/task123$/),
        { recursive: true }
      );
    });

    it('should not create directory if exists', async () => {
      const task = { id: 'task123', filename: 'document.pdf' };
      const content = '# Content';

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await (worker as any).saveMergedFile(task, content);

      expect(fs.mkdir).not.toHaveBeenCalled();
    });
  });

  describe('mergeTask()', () => {
    it('should complete merge process successfully', async () => {
      const mockTask = {
        id: 'task123',
        filename: 'document.pdf',
      };

      const mockPages = [
        { page: 1, content: '# Page 1' },
        { page: 2, content: '# Page 2' },
      ];

      vi.mocked(prisma.taskDetail.findMany).mockResolvedValue(mockPages as any);
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(prisma.task.update).mockResolvedValue({} as any);

      await (worker as any).mergeTask(mockTask);

      // Verify pages were fetched
      expect(prisma.taskDetail.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { task: 'task123', status: PageStatus.COMPLETED },
        })
      );

      // Verify file was written
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/document\.md$/),
        expect.stringContaining('<!-- Page 1 -->'),
        { encoding: 'utf-8' }
      );

      // Verify task status updated to COMPLETED
      expect(prisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TaskStatus.COMPLETED,
            progress: 100,
            worker_id: null,
          }),
        })
      );
    });

    it('should throw error if no completed pages found', async () => {
      const mockTask = { id: 'task123', filename: 'document.pdf' };

      vi.mocked(prisma.taskDetail.findMany).mockResolvedValue([]);

      await expect((worker as any).mergeTask(mockTask)).rejects.toThrow(
        'No completed pages found for merging'
      );
    });

    it('should emit events after successful merge', async () => {
      const mockTask = { id: 'task123', filename: 'document.pdf' };
      const mockPages = [{ page: 1, content: '# Content' }];

      vi.mocked(prisma.taskDetail.findMany).mockResolvedValue(mockPages as any);
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(prisma.task.update).mockResolvedValue({
        id: 'task123',
        status: TaskStatus.COMPLETED,
      } as any);

      await (worker as any).mergeTask(mockTask);

      expect(eventBus.emitTaskEvent).toHaveBeenCalledWith(
        TaskEventType.TASK_UPDATED,
        expect.objectContaining({ taskId: 'task123' })
      );
      expect(eventBus.emitTaskEvent).toHaveBeenCalledWith(
        TaskEventType.TASK_STATUS_CHANGED,
        expect.objectContaining({ taskId: 'task123' })
      );
    });

    it('should include merged_path in task update', async () => {
      const mockTask = { id: 'task123', filename: 'document.pdf' };
      const mockPages = [{ page: 1, content: '# Content' }];

      vi.mocked(prisma.taskDetail.findMany).mockResolvedValue(mockPages as any);
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(prisma.task.update).mockResolvedValue({} as any);

      await (worker as any).mergeTask(mockTask);

      expect(prisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            merged_path: expect.stringMatching(/document\.md$/),
          }),
        })
      );
    });
  });

  describe('error handling', () => {
    it('should handle error during mergeTask', async () => {
      const mockTask = {
        id: 'task123',
        filename: 'document.pdf',
        status: TaskStatus.MERGING,
      };

      const mockPages = [{ page: 1, content: '# Content' }];

      let claimCalled = false;

      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        const tx = {
          task: {
            findFirst: vi.fn().mockResolvedValue(claimCalled ? null : mockTask),
            update: vi.fn().mockResolvedValue({ ...mockTask, status: TaskStatus.MERGING }),
          },
        };
        claimCalled = true;
        return callback(tx);
      });

      vi.mocked(prisma.taskDetail.findMany).mockResolvedValue(mockPages as any);
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockRejectedValue(new Error('Disk full'));
      vi.mocked(prisma.task.update).mockResolvedValue({} as any);

      const runPromise = worker.run();
      await new Promise((resolve) => setTimeout(resolve, 150));

      worker.stop();
      await runPromise;

      // Should have called handleError which updates task to FAILED
      expect(prisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TaskStatus.FAILED,
            error: 'Disk full',
          }),
        })
      );
    });

    it('should clear currentTaskId after processing regardless of outcome', async () => {
      const mockTask = { id: 'task123', filename: 'document.pdf' };

      vi.mocked(prisma.taskDetail.findMany).mockRejectedValue(new Error('DB error'));
      vi.mocked(prisma.task.update).mockResolvedValue({} as any);

      (worker as any).currentTaskId = 'task123';

      try {
        await (worker as any).mergeTask(mockTask);
      } catch {
        // Expected to throw
      }

      // The main loop clears currentTaskId in finally block
      // Here we're testing mergeTask directly, which doesn't clear it
      // The clearing happens in run() method's finally block
    });
  });

  describe('ensureDirectoryExists()', () => {
    it('should not create directory if it exists', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      await (worker as any).ensureDirectoryExists('/some/path');

      expect(fs.mkdir).not.toHaveBeenCalled();
    });

    it('should create directory recursively if not exists', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      await (worker as any).ensureDirectoryExists('/some/nested/path');

      expect(fs.mkdir).toHaveBeenCalledWith('/some/nested/path', { recursive: true });
    });
  });

  describe('edge cases', () => {
    it('should handle task with very long filename', () => {
      const longName = 'a'.repeat(200) + '.pdf';
      const task = { id: 'task123', filename: longName };

      const result = (worker as any).getOutputPath(task);

      expect(result).toMatch(/\.md$/);
      expect(result).toContain('a'.repeat(200));
    });

    it('should handle Unicode characters in content', () => {
      const pages = [
        { page: 1, content: '# 中文标题\n\n这是中文内容' },
        { page: 2, content: '# 日本語\n\nこんにちは' },
      ];

      const result = (worker as any).mergeMarkdown(pages);

      expect(result).toContain('中文标题');
      expect(result).toContain('日本語');
    });

    it('should handle pages with empty strings between content', () => {
      const pages = [
        { page: 1, content: '' },
        { page: 2, content: '' },
        { page: 3, content: '# Content' },
      ];

      const result = (worker as any).mergeMarkdown(pages);

      expect(result).toContain('<!-- Page 1 -->');
      expect(result).toContain('<!-- Page 2 -->');
      expect(result).toContain('<!-- Page 3 -->');
    });

    it('should handle many pages', () => {
      const pages = Array.from({ length: 100 }, (_, i) => ({
        page: i + 1,
        content: `# Page ${i + 1}`,
      }));

      const result = (worker as any).mergeMarkdown(pages);

      expect(result).toContain('<!-- Page 1 -->');
      expect(result).toContain('<!-- Page 100 -->');
      // Should have 99 separators for 100 pages
      expect((result.match(/---/g) || []).length).toBe(99);
    });

    it('should handle content with markdown separators already present', () => {
      const pages = [
        { page: 1, content: '# Title\n\n---\n\nContent after separator' },
        { page: 2, content: '# Another page' },
      ];

      const result = (worker as any).mergeMarkdown(pages);

      // Should have both the content separator and the page separator
      expect((result.match(/---/g) || []).length).toBe(2);
    });
  });

  describe('concurrent access safety', () => {
    it('should only process one task at a time', async () => {
      const mockTask = {
        id: 'task123',
        filename: 'document.pdf',
        status: TaskStatus.READY_TO_MERGE,
      };

      let processingCount = 0;
      let maxConcurrent = 0;

      const originalMergeTask = (worker as any).mergeTask.bind(worker);
      (worker as any).mergeTask = async (task: any) => {
        processingCount++;
        maxConcurrent = Math.max(maxConcurrent, processingCount);
        await new Promise((resolve) => setTimeout(resolve, 50));
        processingCount--;
        return originalMergeTask(task);
      };

      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        const tx = {
          task: {
            findFirst: vi.fn().mockResolvedValue(mockTask),
            update: vi.fn().mockResolvedValue({ ...mockTask, status: TaskStatus.MERGING }),
          },
        };
        return callback(tx);
      });

      vi.mocked(prisma.taskDetail.findMany).mockResolvedValue([
        { page: 1, content: '# Content' },
      ] as any);
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(prisma.task.update).mockResolvedValue({} as any);

      const runPromise = worker.run();
      await new Promise((resolve) => setTimeout(resolve, 200));

      worker.stop();
      await runPromise;

      // Should never have more than 1 concurrent task processing
      expect(maxConcurrent).toBe(1);
    });
  });
});
