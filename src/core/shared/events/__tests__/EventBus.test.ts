import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eventBus, TaskEventType, TaskEventData } from '../EventBus.js';

describe('EventBus', () => {
  beforeEach(() => {
    // Clear all listeners before each test
    eventBus.removeAllListeners();
  });

  describe('singleton pattern', () => {
    it('should return same instance', () => {
      const instance1 = eventBus;
      const instance2 = eventBus;
      expect(instance1).toBe(instance2);
    });
  });

  describe('emitTaskEvent()', () => {
    it('should emit specific task event', () => {
      const handler = vi.fn();
      const eventData: TaskEventData = {
        taskId: 'task-123',
        task: { status: 'PENDING' },
        timestamp: Date.now(),
      };

      eventBus.onTaskEvent(TaskEventType.TASK_UPDATED, handler);
      eventBus.emitTaskEvent(TaskEventType.TASK_UPDATED, eventData);

      expect(handler).toHaveBeenCalledWith(eventData);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should emit wildcard task:* event', () => {
      const wildcardHandler = vi.fn();
      const eventData: TaskEventData = {
        taskId: 'task-123',
        task: { status: 'PROCESSING' },
        timestamp: Date.now(),
      };

      eventBus.onTaskEvent('task:*', wildcardHandler);
      eventBus.emitTaskEvent(TaskEventType.TASK_STATUS_CHANGED, eventData);

      expect(wildcardHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: TaskEventType.TASK_STATUS_CHANGED,
          taskId: 'task-123',
        })
      );
    });

    it('should emit both specific and wildcard events', () => {
      const specificHandler = vi.fn();
      const wildcardHandler = vi.fn();
      const eventData: TaskEventData = {
        taskId: 'task-123',
        timestamp: Date.now(),
      };

      eventBus.onTaskEvent(TaskEventType.TASK_PROGRESS_CHANGED, specificHandler);
      eventBus.onTaskEvent('task:*', wildcardHandler);

      eventBus.emitTaskEvent(TaskEventType.TASK_PROGRESS_CHANGED, eventData);

      expect(specificHandler).toHaveBeenCalledTimes(1);
      expect(wildcardHandler).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple listeners for same event', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const eventData: TaskEventData = {
        taskId: 'task-123',
        timestamp: Date.now(),
      };

      eventBus.onTaskEvent(TaskEventType.TASK_DELETED, handler1);
      eventBus.onTaskEvent(TaskEventType.TASK_DELETED, handler2);

      eventBus.emitTaskEvent(TaskEventType.TASK_DELETED, eventData);

      expect(handler1).toHaveBeenCalledWith(eventData);
      expect(handler2).toHaveBeenCalledWith(eventData);
    });
  });

  describe('onTaskEvent()', () => {
    it('should register handler for specific event type', () => {
      const handler = vi.fn();
      eventBus.onTaskEvent(TaskEventType.TASK_UPDATED, handler);

      eventBus.emitTaskEvent(TaskEventType.TASK_UPDATED, {
        taskId: 'task-123',
        timestamp: Date.now(),
      });

      expect(handler).toHaveBeenCalled();
    });

    it('should register handler for wildcard events', () => {
      const handler = vi.fn();
      eventBus.onTaskEvent('task:*', handler);

      eventBus.emitTaskEvent(TaskEventType.TASK_UPDATED, {
        taskId: 'task-123',
        timestamp: Date.now(),
      });

      eventBus.emitTaskEvent(TaskEventType.TASK_STATUS_CHANGED, {
        taskId: 'task-456',
        timestamp: Date.now(),
      });

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should not trigger handler for different event type', () => {
      const handler = vi.fn();
      eventBus.onTaskEvent(TaskEventType.TASK_UPDATED, handler);

      eventBus.emitTaskEvent(TaskEventType.TASK_DELETED, {
        taskId: 'task-123',
        timestamp: Date.now(),
      });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('event data structure', () => {
    it('should include taskId in event data', () => {
      const handler = vi.fn();
      const taskId = 'task-123';

      eventBus.onTaskEvent(TaskEventType.TASK_UPDATED, handler);
      eventBus.emitTaskEvent(TaskEventType.TASK_UPDATED, {
        taskId,
        timestamp: Date.now(),
      });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ taskId })
      );
    });

    it('should include optional task data', () => {
      const handler = vi.fn();
      const taskData = { status: 'COMPLETED', progress: 100 };

      eventBus.onTaskEvent(TaskEventType.TASK_UPDATED, handler);
      eventBus.emitTaskEvent(TaskEventType.TASK_UPDATED, {
        taskId: 'task-123',
        task: taskData,
        timestamp: Date.now(),
      });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ task: taskData })
      );
    });

    it('should include timestamp in event data', () => {
      const handler = vi.fn();
      const timestamp = Date.now();

      eventBus.onTaskEvent(TaskEventType.TASK_UPDATED, handler);
      eventBus.emitTaskEvent(TaskEventType.TASK_UPDATED, {
        taskId: 'task-123',
        timestamp,
      });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ timestamp })
      );
    });

    it('should preserve all event data in wildcard events', () => {
      const handler = vi.fn();
      const eventData: TaskEventData = {
        taskId: 'task-123',
        task: { status: 'PROCESSING', progress: 50 },
        timestamp: 1234567890,
      };

      eventBus.onTaskEvent('task:*', handler);
      eventBus.emitTaskEvent(TaskEventType.TASK_PROGRESS_CHANGED, eventData);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: TaskEventType.TASK_PROGRESS_CHANGED,
          taskId: 'task-123',
          task: { status: 'PROCESSING', progress: 50 },
          timestamp: 1234567890,
        })
      );
    });
  });

  describe('max listeners', () => {
    it('should allow up to 100 listeners', () => {
      // Should not throw warning
      for (let i = 0; i < 100; i++) {
        eventBus.onTaskEvent(TaskEventType.TASK_UPDATED, () => {});
      }
      expect(eventBus.listenerCount(TaskEventType.TASK_UPDATED)).toBe(100);
    });
  });

  describe('event lifecycle', () => {
    it('should handle event removal', () => {
      const handler = vi.fn();
      eventBus.onTaskEvent(TaskEventType.TASK_UPDATED, handler);

      eventBus.removeListener(TaskEventType.TASK_UPDATED, handler);

      eventBus.emitTaskEvent(TaskEventType.TASK_UPDATED, {
        taskId: 'task-123',
        timestamp: Date.now(),
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should handle removeAllListeners', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.onTaskEvent(TaskEventType.TASK_UPDATED, handler1);
      eventBus.onTaskEvent(TaskEventType.TASK_DELETED, handler2);

      eventBus.removeAllListeners();

      eventBus.emitTaskEvent(TaskEventType.TASK_UPDATED, {
        taskId: 'task-123',
        timestamp: Date.now(),
      });
      eventBus.emitTaskEvent(TaskEventType.TASK_DELETED, {
        taskId: 'task-456',
        timestamp: Date.now(),
      });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });
  });

  describe('all task event types', () => {
    it('should support TASK_UPDATED event', () => {
      const handler = vi.fn();
      eventBus.onTaskEvent(TaskEventType.TASK_UPDATED, handler);

      eventBus.emitTaskEvent(TaskEventType.TASK_UPDATED, {
        taskId: 'task-123',
        timestamp: Date.now(),
      });

      expect(handler).toHaveBeenCalled();
    });

    it('should support TASK_STATUS_CHANGED event', () => {
      const handler = vi.fn();
      eventBus.onTaskEvent(TaskEventType.TASK_STATUS_CHANGED, handler);

      eventBus.emitTaskEvent(TaskEventType.TASK_STATUS_CHANGED, {
        taskId: 'task-123',
        timestamp: Date.now(),
      });

      expect(handler).toHaveBeenCalled();
    });

    it('should support TASK_PROGRESS_CHANGED event', () => {
      const handler = vi.fn();
      eventBus.onTaskEvent(TaskEventType.TASK_PROGRESS_CHANGED, handler);

      eventBus.emitTaskEvent(TaskEventType.TASK_PROGRESS_CHANGED, {
        taskId: 'task-123',
        timestamp: Date.now(),
      });

      expect(handler).toHaveBeenCalled();
    });

    it('should support TASK_DELETED event', () => {
      const handler = vi.fn();
      eventBus.onTaskEvent(TaskEventType.TASK_DELETED, handler);

      eventBus.emitTaskEvent(TaskEventType.TASK_DELETED, {
        taskId: 'task-123',
        timestamp: Date.now(),
      });

      expect(handler).toHaveBeenCalled();
    });
  });
});
