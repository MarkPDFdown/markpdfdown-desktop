import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkerBase } from '../WorkerBase.js';
import { TaskStatus } from '../../types/index.js';

// Mock Prisma
vi.mock('../../db/index.js', () => ({
  prisma: {
    $transaction: vi.fn(),
    task: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from '../../db/index.js';

// Concrete implementation for testing
class TestWorker extends WorkerBase {
  async run(): Promise<void> {
    // Test implementation
  }
}

describe('WorkerBase', () => {
  let worker: TestWorker;

  beforeEach(() => {
    worker = new TestWorker();
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should generate unique worker ID', () => {
      const worker1 = new TestWorker();
      const worker2 = new TestWorker();
      expect(worker1.getWorkerId()).not.toBe(worker2.getWorkerId());
    });

    it('should initialize isRunning to false', () => {
      expect(worker.getIsRunning()).toBe(false);
    });
  });

  describe('claimTask()', () => {
    it('should claim available task atomically', async () => {
      const mockTask = {
        id: 'task123',
        filename: 'test.pdf',
        status: TaskStatus.PENDING,
        worker_id: null,
      };

      const updatedTask = {
        ...mockTask,
        status: TaskStatus.SPLITTING,
        worker_id: worker.getWorkerId(),
      };

      // Mock transaction
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        // Mock findFirst and update inside transaction
        const tx = {
          task: {
            findFirst: vi.fn().mockResolvedValue(mockTask),
            update: vi.fn().mockResolvedValue(updatedTask),
          },
        };
        return callback(tx as any);
      });

      const result = await worker['claimTask'](TaskStatus.PENDING, TaskStatus.SPLITTING);

      expect(result).toEqual(updatedTask);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should return null if no task available', async () => {
      // Mock transaction with no task found
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const tx = {
          task: {
            findFirst: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
          },
        };
        return callback(tx as any);
      });

      const result = await worker['claimTask'](TaskStatus.PENDING, TaskStatus.SPLITTING);

      expect(result).toBeNull();
    });

    it('should query tasks in FIFO order', async () => {
      let findFirstCalled = false;

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const tx = {
          task: {
            findFirst: vi.fn((query) => {
              findFirstCalled = true;
              expect(query.orderBy).toEqual({ createdAt: 'asc' });
              return null;
            }),
            update: vi.fn(),
          },
        };
        return callback(tx as any);
      });

      await worker['claimTask'](TaskStatus.PENDING, TaskStatus.SPLITTING);
      expect(findFirstCalled).toBe(true);
    });

    it('should handle transaction errors gracefully', async () => {
      vi.mocked(prisma.$transaction).mockRejectedValue(new Error('Database error'));

      const result = await worker['claimTask'](TaskStatus.PENDING, TaskStatus.SPLITTING);

      expect(result).toBeNull();
    });

    it('should set worker_id when claiming task', async () => {
      let updateCalled = false;

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const tx = {
          task: {
            findFirst: vi.fn().mockResolvedValue({ id: 'task123' }),
            update: vi.fn((updateQuery) => {
              updateCalled = true;
              expect(updateQuery.data.worker_id).toBe(worker.getWorkerId());
              return { id: 'task123', worker_id: worker.getWorkerId() };
            }),
          },
        };
        return callback(tx as any);
      });

      await worker['claimTask'](TaskStatus.PENDING, TaskStatus.SPLITTING);
      expect(updateCalled).toBe(true);
    });
  });

  describe('updateTaskStatus()', () => {
    it('should update task status', async () => {
      vi.mocked(prisma.task.update).mockResolvedValue({
        id: 'task123',
        status: TaskStatus.PROCESSING,
      } as any);

      await worker['updateTaskStatus']('task123', TaskStatus.PROCESSING);

      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task123' },
        data: expect.objectContaining({
          status: TaskStatus.PROCESSING,
        }),
      });
    });

    it('should update task status with additional data', async () => {
      vi.mocked(prisma.task.update).mockResolvedValue({} as any);

      await worker['updateTaskStatus']('task123', TaskStatus.PROCESSING, {
        pages: 10,
        worker_id: null,
      });

      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task123' },
        data: expect.objectContaining({
          status: TaskStatus.PROCESSING,
          pages: 10,
          worker_id: null,
        }),
      });
    });

    it('should throw error if update fails', async () => {
      vi.mocked(prisma.task.update).mockRejectedValue(new Error('Update failed'));

      await expect(
        worker['updateTaskStatus']('task123', TaskStatus.PROCESSING)
      ).rejects.toThrow('Update failed');
    });
  });

  describe('handleError()', () => {
    it('should set task to FAILED with error message', async () => {
      const error = new Error('Something went wrong');
      vi.mocked(prisma.task.update).mockResolvedValue({} as any);

      await worker['handleError']('task123', error);

      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task123' },
        data: expect.objectContaining({
          status: TaskStatus.FAILED,
          error: 'Something went wrong',
          worker_id: null,
        }),
      });
    });

    it('should handle string errors', async () => {
      vi.mocked(prisma.task.update).mockResolvedValue({} as any);

      await worker['handleError']('task123', 'String error message');

      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task123' },
        data: expect.objectContaining({
          error: 'String error message',
        }),
      });
    });

    it('should release worker_id on error', async () => {
      vi.mocked(prisma.task.update).mockResolvedValue({} as any);

      await worker['handleError']('task123', new Error('Test error'));

      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task123' },
        data: expect.objectContaining({
          worker_id: null,
        }),
      });
    });

    it('should not throw if error update fails', async () => {
      vi.mocked(prisma.task.update).mockRejectedValue(new Error('Update failed'));

      // Should not throw
      await expect(
        worker['handleError']('task123', new Error('Original error'))
      ).resolves.toBeUndefined();
    });
  });

  describe('stop()', () => {
    it('should set isRunning to false', () => {
      worker['isRunning'] = true;
      worker.stop();
      expect(worker.getIsRunning()).toBe(false);
    });

    it('should be idempotent', () => {
      worker.stop();
      worker.stop();
      expect(worker.getIsRunning()).toBe(false);
    });
  });

  describe('sleep()', () => {
    it('should sleep for specified duration', async () => {
      const start = Date.now();
      await worker['sleep'](100);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(90); // Allow small variance
    });

    it('should resolve after timeout', async () => {
      const promise = worker['sleep'](50);
      await expect(promise).resolves.toBeUndefined();
    });
  });

  describe('getWorkerId()', () => {
    it('should return worker ID', () => {
      const workerId = worker.getWorkerId();
      expect(workerId).toBeTruthy();
      expect(typeof workerId).toBe('string');
    });

    it('should return same ID on multiple calls', () => {
      const id1 = worker.getWorkerId();
      const id2 = worker.getWorkerId();
      expect(id1).toBe(id2);
    });
  });

  describe('getIsRunning()', () => {
    it('should return false initially', () => {
      expect(worker.getIsRunning()).toBe(false);
    });

    it('should return true when running', () => {
      worker['isRunning'] = true;
      expect(worker.getIsRunning()).toBe(true);
    });

    it('should return false after stop', () => {
      worker['isRunning'] = true;
      worker.stop();
      expect(worker.getIsRunning()).toBe(false);
    });
  });
});
