import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SplitterWorker } from '../SplitterWorker.js';
import { TaskStatus, PageStatus } from '../../types/index.js';

// Mock dependencies
vi.mock('../../db/index.js', () => ({
  prisma: {
    $transaction: vi.fn(),
    task: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../../logic/split/SplitterFactory.js', () => ({
  SplitterFactory: vi.fn().mockImplementation(() => ({
    createFromFilename: vi.fn(),
  })),
}));

import { prisma } from '../../db/index.js';

describe('SplitterWorker', () => {
  const uploadsDir = '/mock/uploads';
  let worker: SplitterWorker;

  beforeEach(() => {
    worker = new SplitterWorker(uploadsDir);
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create worker with uploads directory', () => {
      expect(worker).toBeDefined();
      expect(worker.getWorkerId()).toBeTruthy();
    });

    it('should initialize with isRunning = false', () => {
      expect(worker.getIsRunning()).toBe(false);
    });
  });

  describe('run()', () => {
    it('should set isRunning to true when started', async () => {
      // Mock claimTask to return null (no tasks)
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const tx = {
          task: {
            findFirst: vi.fn().mockResolvedValue(null),
          },
        };
        return callback(tx as any);
      });

      // Start worker in background
      const runPromise = worker.run();

      // Give it a moment to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(worker.getIsRunning()).toBe(true);

      // Stop worker
      worker.stop();
      await runPromise;
    });

    it('should stop when stop() is called', async () => {
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const tx = {
          task: {
            findFirst: vi.fn().mockResolvedValue(null),
          },
        };
        return callback(tx as any);
      });

      const runPromise = worker.run();
      await new Promise((resolve) => setTimeout(resolve, 10));

      worker.stop();
      await runPromise;

      expect(worker.getIsRunning()).toBe(false);
    });

    it('should continue running after error', async () => {
      let callCount = 0;

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Transient error');
        }
        const tx = {
          task: {
            findFirst: vi.fn().mockResolvedValue(null),
          },
        };
        return callback(tx as any);
      });

      const runPromise = worker.run();
      // Wait for more than one poll interval (2000ms) to allow second iteration
      await new Promise((resolve) => setTimeout(resolve, 2100));

      expect(callCount).toBeGreaterThan(1);

      worker.stop();
      await runPromise;
    });
  });

  describe('splitTask() integration', () => {
    it('should process task successfully', async () => {
      const mockTask = {
        id: 'task123',
        filename: 'test.pdf',
        provider: 1,
        model: 'gpt-4',
      };

      const mockSplitResult = {
        pages: [
          { page: 1, pageSource: 1, imagePath: '/mock/temp/task123/page-1.png' },
          { page: 2, pageSource: 2, imagePath: '/mock/temp/task123/page-2.png' },
        ],
        totalPages: 2,
      };

      const mockSplitter = {
        split: vi.fn().mockResolvedValue(mockSplitResult),
        cleanup: vi.fn(),
      };

      // Mock factory to return mock splitter
      const mockFactory = (worker as any).factory;
      mockFactory.createFromFilename = vi.fn().mockReturnValue(mockSplitter);

      // Mock Prisma transaction for createTaskDetails
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const tx = {
          taskDetail: {
            createMany: vi.fn(),
          },
          task: {
            update: vi.fn(),
          },
        };
        return callback(tx as any);
      });

      // Call splitTask directly (private method, so we use bracket notation)
      await (worker as any).splitTask(mockTask);

      expect(mockFactory.createFromFilename).toHaveBeenCalledWith('test.pdf');
      expect(mockSplitter.split).toHaveBeenCalledWith(mockTask);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should handle split errors', async () => {
      const mockTask = {
        id: 'task123',
        filename: 'test.pdf',
      };

      const mockSplitter = {
        split: vi.fn().mockRejectedValue(new Error('Split failed')),
        cleanup: vi.fn(),
      };

      const mockFactory = (worker as any).factory;
      mockFactory.createFromFilename = vi.fn().mockReturnValue(mockSplitter);

      vi.mocked(prisma.task.update).mockResolvedValue({} as any);

      await (worker as any).splitTask(mockTask);

      // Should update task to FAILED
      expect(prisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'task123' },
          data: expect.objectContaining({
            status: TaskStatus.FAILED,
          }),
        })
      );

      // Should attempt cleanup
      expect(mockSplitter.cleanup).toHaveBeenCalledWith('task123');
    });

    it('should handle missing task fields', async () => {
      const mockTask = {
        id: 'task123',
        // Missing filename
      };

      vi.mocked(prisma.task.update).mockResolvedValue({} as any);

      await (worker as any).splitTask(mockTask);

      expect(prisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TaskStatus.FAILED,
          }),
        })
      );
    });
  });

  describe('createTaskDetails()', () => {
    it('should create TaskDetail records in transaction', async () => {
      const mockTask = {
        id: 'task123',
        provider: 1,
        model: 'gpt-4',
      };

      const mockResult = {
        pages: [
          { page: 1, pageSource: 1, imagePath: '/path/page-1.png' },
          { page: 2, pageSource: 2, imagePath: '/path/page-2.png' },
        ],
        totalPages: 2,
      };

      let createManyCalled = false;
      let taskUpdateCalled = false;

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const tx = {
          taskDetail: {
            createMany: vi.fn((data) => {
              createManyCalled = true;
              expect(data.data).toHaveLength(2);
              expect(data.data[0]).toMatchObject({
                task: 'task123',
                page: 1,
                page_source: 1,
                status: PageStatus.PENDING,
                provider: 1,
                model: 'gpt-4',
              });
            }),
          },
          task: {
            update: vi.fn((updateData) => {
              taskUpdateCalled = true;
              expect(updateData.data).toMatchObject({
                status: TaskStatus.PROCESSING,
                pages: 2,
                worker_id: null,
              });
            }),
          },
        };
        return callback(tx as any);
      });

      await (worker as any).createTaskDetails(mockTask, mockResult);

      expect(createManyCalled).toBe(true);
      expect(taskUpdateCalled).toBe(true);
    });

    it('should set correct initial status for TaskDetails', async () => {
      const mockTask = {
        id: 'task123',
        provider: 1,
        model: 'gpt-4',
      };

      const mockResult = {
        pages: [{ page: 1, pageSource: 1, imagePath: '/path/page-1.png' }],
        totalPages: 1,
      };

      let detailsData: any[] = [];

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const tx = {
          taskDetail: {
            createMany: vi.fn((data) => {
              detailsData = data.data;
            }),
          },
          task: {
            update: vi.fn(),
          },
        };
        return callback(tx as any);
      });

      await (worker as any).createTaskDetails(mockTask, mockResult);

      expect(detailsData[0].status).toBe(PageStatus.PENDING);
      expect(detailsData[0].worker_id).toBeNull();
      expect(detailsData[0].content).toBe('');
      expect(detailsData[0].retry_count).toBe(0);
    });

    it('should release worker_id after creating details', async () => {
      const mockTask = {
        id: 'task123',
        provider: 1,
        model: 'gpt-4',
      };

      const mockResult = {
        pages: [{ page: 1, pageSource: 1, imagePath: '/path/page-1.png' }],
        totalPages: 1,
      };

      let taskUpdateData: any;

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const tx = {
          taskDetail: {
            createMany: vi.fn(),
          },
          task: {
            update: vi.fn((data) => {
              taskUpdateData = data.data;
            }),
          },
        };
        return callback(tx as any);
      });

      await (worker as any).createTaskDetails(mockTask, mockResult);

      expect(taskUpdateData.worker_id).toBeNull();
    });

    it('should throw error if transaction fails', async () => {
      const mockTask = {
        id: 'task123',
        provider: 1,
        model: 'gpt-4',
      };

      const mockResult = {
        pages: [{ page: 1, pageSource: 1, imagePath: '/path/page-1.png' }],
        totalPages: 1,
      };

      vi.mocked(prisma.$transaction).mockRejectedValue(new Error('Transaction failed'));

      await expect((worker as any).createTaskDetails(mockTask, mockResult)).rejects.toThrow(
        'Transaction failed'
      );
    });
  });

  describe('edge cases', () => {
    it('should handle empty page range result', async () => {
      const mockTask = {
        id: 'task123',
        provider: 1,
        model: 'gpt-4',
      };

      const mockResult = {
        pages: [],
        totalPages: 0,
      };

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const tx = {
          taskDetail: {
            createMany: vi.fn((data) => {
              expect(data.data).toHaveLength(0);
            }),
          },
          task: {
            update: vi.fn((data) => {
              expect(data.data.pages).toBe(0);
            }),
          },
        };
        return callback(tx as any);
      });

      await (worker as any).createTaskDetails(mockTask, mockResult);
    });

    it('should handle large number of pages', async () => {
      const mockTask = {
        id: 'task123',
        provider: 1,
        model: 'gpt-4',
      };

      const pages = Array.from({ length: 100 }, (_, i) => ({
        page: i + 1,
        pageSource: i + 1,
        imagePath: `/path/page-${i + 1}.png`,
      }));

      const mockResult = {
        pages,
        totalPages: 100,
      };

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const tx = {
          taskDetail: {
            createMany: vi.fn((data) => {
              expect(data.data).toHaveLength(100);
            }),
          },
          task: {
            update: vi.fn(),
          },
        };
        return callback(tx as any);
      });

      await (worker as any).createTaskDetails(mockTask, mockResult);
    });
  });
});
