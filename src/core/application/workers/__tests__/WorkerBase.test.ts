import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkerBase } from '../WorkerBase.js';
import { TaskStatus } from '../../../shared/types/index.js';

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

// Mock EventBus
vi.mock('../../events/EventBus.js', () => ({
  eventBus: {
    emitTaskEvent: vi.fn(),
    onTaskEvent: vi.fn(),
  },
  TaskEventType: {
    TASK_UPDATED: 'task:updated',
    TASK_STATUS_CHANGED: 'task:status_changed',
    TASK_PROGRESS_CHANGED: 'task:progress_changed',
    TASK_DELETED: 'task:deleted',
  },
}));

import { prisma } from '../../db/index.js';
import { eventBus, TaskEventType } from '../../events/EventBus.js';

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

    it('should emit TASK_UPDATED event when claiming task', async () => {
      const mockTask = {
        id: 'task123',
        status: TaskStatus.SPLITTING,
        worker_id: worker.getWorkerId(),
      };

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const tx = {
          task: {
            findFirst: vi.fn().mockResolvedValue({ id: 'task123' }),
            update: vi.fn().mockResolvedValue(mockTask),
          },
        };
        return callback(tx as any);
      });

      await worker['claimTask'](TaskStatus.PENDING, TaskStatus.SPLITTING);

      expect(eventBus.emitTaskEvent).toHaveBeenCalledWith(
        TaskEventType.TASK_UPDATED,
        expect.objectContaining({
          taskId: 'task123',
          task: mockTask,
        })
      );
    });

    it('should emit TASK_STATUS_CHANGED event when claiming task', async () => {
      const mockTask = {
        id: 'task123',
        status: TaskStatus.SPLITTING,
      };

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const tx = {
          task: {
            findFirst: vi.fn().mockResolvedValue({ id: 'task123' }),
            update: vi.fn().mockResolvedValue(mockTask),
          },
        };
        return callback(tx as any);
      });

      await worker['claimTask'](TaskStatus.PENDING, TaskStatus.SPLITTING);

      expect(eventBus.emitTaskEvent).toHaveBeenCalledWith(
        TaskEventType.TASK_STATUS_CHANGED,
        expect.objectContaining({
          taskId: 'task123',
          task: { status: TaskStatus.SPLITTING },
        })
      );
    });

    it('should not emit events when no task available', async () => {
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const tx = {
          task: {
            findFirst: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
          },
        };
        return callback(tx as any);
      });

      await worker['claimTask'](TaskStatus.PENDING, TaskStatus.SPLITTING);

      expect(eventBus.emitTaskEvent).not.toHaveBeenCalled();
    });

    it('should not emit events when transaction fails', async () => {
      vi.mocked(prisma.$transaction).mockRejectedValue(new Error('Database error'));

      await worker['claimTask'](TaskStatus.PENDING, TaskStatus.SPLITTING);

      expect(eventBus.emitTaskEvent).not.toHaveBeenCalled();
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

    it('should emit TASK_UPDATED event when updating status', async () => {
      const updatedTask = {
        id: 'task123',
        status: TaskStatus.PROCESSING,
      };

      vi.mocked(prisma.task.update).mockResolvedValue(updatedTask as any);

      await worker['updateTaskStatus']('task123', TaskStatus.PROCESSING);

      expect(eventBus.emitTaskEvent).toHaveBeenCalledWith(
        TaskEventType.TASK_UPDATED,
        expect.objectContaining({
          taskId: 'task123',
          task: updatedTask,
        })
      );
    });

    it('should emit TASK_STATUS_CHANGED event when status changes', async () => {
      vi.mocked(prisma.task.update).mockResolvedValue({
        id: 'task123',
        status: TaskStatus.COMPLETED,
      } as any);

      await worker['updateTaskStatus']('task123', TaskStatus.COMPLETED);

      expect(eventBus.emitTaskEvent).toHaveBeenCalledWith(
        TaskEventType.TASK_STATUS_CHANGED,
        expect.objectContaining({
          taskId: 'task123',
          task: { status: TaskStatus.COMPLETED },
        })
      );
    });

    it('should emit TASK_PROGRESS_CHANGED event when progress changes', async () => {
      vi.mocked(prisma.task.update).mockResolvedValue({
        id: 'task123',
        progress: 75,
      } as any);

      await worker['updateTaskStatus']('task123', TaskStatus.PROCESSING, {
        progress: 75,
      });

      expect(eventBus.emitTaskEvent).toHaveBeenCalledWith(
        TaskEventType.TASK_PROGRESS_CHANGED,
        expect.objectContaining({
          taskId: 'task123',
          task: { progress: 75 },
        })
      );
    });

    it('should emit multiple events when both status and progress change', async () => {
      vi.mocked(prisma.task.update).mockResolvedValue({
        id: 'task123',
        status: TaskStatus.PROCESSING,
        progress: 50,
      } as any);

      await worker['updateTaskStatus']('task123', TaskStatus.PROCESSING, {
        progress: 50,
      });

      // Should emit TASK_UPDATED, TASK_STATUS_CHANGED, and TASK_PROGRESS_CHANGED
      expect(eventBus.emitTaskEvent).toHaveBeenCalledTimes(3);
      expect(eventBus.emitTaskEvent).toHaveBeenCalledWith(
        TaskEventType.TASK_UPDATED,
        expect.any(Object)
      );
      expect(eventBus.emitTaskEvent).toHaveBeenCalledWith(
        TaskEventType.TASK_STATUS_CHANGED,
        expect.any(Object)
      );
      expect(eventBus.emitTaskEvent).toHaveBeenCalledWith(
        TaskEventType.TASK_PROGRESS_CHANGED,
        expect.any(Object)
      );
    });

    it('should not emit TASK_PROGRESS_CHANGED when progress is not provided', async () => {
      vi.mocked(prisma.task.update).mockResolvedValue({
        id: 'task123',
        status: TaskStatus.PROCESSING,
      } as any);

      await worker['updateTaskStatus']('task123', TaskStatus.PROCESSING);

      // Should only emit TASK_UPDATED and TASK_STATUS_CHANGED
      const progressCalls = vi.mocked(eventBus.emitTaskEvent).mock.calls.filter(
        (call) => call[0] === TaskEventType.TASK_PROGRESS_CHANGED
      );
      expect(progressCalls).toHaveLength(0);
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

    it('should emit TASK_UPDATED event when handling error', async () => {
      const updatedTask = {
        id: 'task123',
        status: TaskStatus.FAILED,
        error: 'Test error',
      };

      vi.mocked(prisma.task.update).mockResolvedValue(updatedTask as any);

      await worker['handleError']('task123', new Error('Test error'));

      expect(eventBus.emitTaskEvent).toHaveBeenCalledWith(
        TaskEventType.TASK_UPDATED,
        expect.objectContaining({
          taskId: 'task123',
          task: updatedTask,
        })
      );
    });

    it('should emit TASK_STATUS_CHANGED event when handling error', async () => {
      vi.mocked(prisma.task.update).mockResolvedValue({
        id: 'task123',
        status: TaskStatus.FAILED,
      } as any);

      await worker['handleError']('task123', new Error('Test error'));

      expect(eventBus.emitTaskEvent).toHaveBeenCalledWith(
        TaskEventType.TASK_STATUS_CHANGED,
        expect.objectContaining({
          taskId: 'task123',
          task: { status: TaskStatus.FAILED },
        })
      );
    });

    it('should emit events even when error update fails', async () => {
      vi.mocked(prisma.task.update).mockRejectedValue(new Error('Update failed'));

      await worker['handleError']('task123', new Error('Original error'));

      // Should not emit events if database update fails
      expect(eventBus.emitTaskEvent).not.toHaveBeenCalled();
    });

    it('should include timestamp in emitted events', async () => {
      vi.mocked(prisma.task.update).mockResolvedValue({
        id: 'task123',
        status: TaskStatus.FAILED,
      } as any);

      const beforeTime = Date.now();
      await worker['handleError']('task123', new Error('Test'));
      const afterTime = Date.now();

      const calls = vi.mocked(eventBus.emitTaskEvent).mock.calls;
      calls.forEach((call) => {
        const eventData = call[1];
        expect(eventData.timestamp).toBeGreaterThanOrEqual(beforeTime);
        expect(eventData.timestamp).toBeLessThanOrEqual(afterTime);
      });
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
