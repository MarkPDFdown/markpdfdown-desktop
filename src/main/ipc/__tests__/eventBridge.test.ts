import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock dependencies before importing
vi.mock('../../../server/events/EventBus.js', () => ({
  eventBus: {
    onTaskEvent: vi.fn(),
    emitTaskEvent: vi.fn(),
    removeAllListeners: vi.fn(),
  },
  TaskEventType: {
    TASK_UPDATED: 'task:updated',
    TASK_STATUS_CHANGED: 'task:status_changed',
    TASK_PROGRESS_CHANGED: 'task:progress_changed',
    TASK_DELETED: 'task:deleted',
  },
}));

vi.mock('../../WindowManager.js', () => ({
  windowManager: {
    sendToRenderer: vi.fn(),
    isWindowAvailable: vi.fn(() => true),
  },
}));

import { EventBridge } from '../eventBridge.js';
import { eventBus, TaskEventType } from '../../../server/events/EventBus.js';
import { windowManager } from '../../WindowManager.js';

describe('EventBridge', () => {
  let bridge: EventBridge;

  beforeEach(() => {
    bridge = new EventBridge();
    vi.clearAllMocks();
  });

  afterEach(() => {
    bridge.cleanup();
  });

  describe('initialize()', () => {
    it('should register wildcard task event handler', () => {
      bridge.initialize();

      expect(eventBus.onTaskEvent).toHaveBeenCalledWith(
        'task:*',
        expect.any(Function)
      );
    });

    it('should only initialize once', () => {
      bridge.initialize();
      bridge.initialize();

      // Should only register handler once
      expect(eventBus.onTaskEvent).toHaveBeenCalledTimes(1);
    });

    it('should log initialization', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      bridge.initialize();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('EventBridge')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Initialized')
      );

      consoleSpy.mockRestore();
    });

    it('should set isInitialized flag', () => {
      expect(bridge['isInitialized']).toBe(false);
      bridge.initialize();
      expect(bridge['isInitialized']).toBe(true);
    });
  });

  describe('handleTaskEvent()', () => {
    beforeEach(() => {
      bridge.initialize();
    });

    it('should forward TASK_UPDATED event to renderer', () => {
      const eventHandler = vi.mocked(eventBus.onTaskEvent).mock.calls[0][1];
      const eventData = {
        type: TaskEventType.TASK_UPDATED,
        taskId: 'task-123',
        task: { status: 'PENDING' },
        timestamp: 1234567890,
      };

      eventHandler(eventData);

      expect(windowManager.sendToRenderer).toHaveBeenCalledWith('task:event', {
        type: TaskEventType.TASK_UPDATED,
        taskId: 'task-123',
        task: { status: 'PENDING' },
        timestamp: 1234567890,
      });
    });

    it('should forward TASK_STATUS_CHANGED event to renderer', () => {
      const eventHandler = vi.mocked(eventBus.onTaskEvent).mock.calls[0][1];
      const eventData = {
        type: TaskEventType.TASK_STATUS_CHANGED,
        taskId: 'task-456',
        task: { status: 'PROCESSING' },
        timestamp: Date.now(),
      };

      eventHandler(eventData);

      expect(windowManager.sendToRenderer).toHaveBeenCalledWith(
        'task:event',
        expect.objectContaining({
          type: TaskEventType.TASK_STATUS_CHANGED,
          taskId: 'task-456',
        })
      );
    });

    it('should forward TASK_PROGRESS_CHANGED event to renderer', () => {
      const eventHandler = vi.mocked(eventBus.onTaskEvent).mock.calls[0][1];
      const eventData = {
        type: TaskEventType.TASK_PROGRESS_CHANGED,
        taskId: 'task-789',
        task: { progress: 50 },
        timestamp: Date.now(),
      };

      eventHandler(eventData);

      expect(windowManager.sendToRenderer).toHaveBeenCalledWith(
        'task:event',
        expect.objectContaining({
          type: TaskEventType.TASK_PROGRESS_CHANGED,
          taskId: 'task-789',
          task: { progress: 50 },
        })
      );
    });

    it('should forward TASK_DELETED event to renderer', () => {
      const eventHandler = vi.mocked(eventBus.onTaskEvent).mock.calls[0][1];
      const eventData = {
        type: TaskEventType.TASK_DELETED,
        taskId: 'task-999',
        timestamp: Date.now(),
      };

      eventHandler(eventData);

      expect(windowManager.sendToRenderer).toHaveBeenCalledWith(
        'task:event',
        expect.objectContaining({
          type: TaskEventType.TASK_DELETED,
          taskId: 'task-999',
        })
      );
    });

    it('should preserve all event data fields', () => {
      const eventHandler = vi.mocked(eventBus.onTaskEvent).mock.calls[0][1];
      const eventData = {
        type: TaskEventType.TASK_UPDATED,
        taskId: 'task-123',
        task: {
          status: 'COMPLETED',
          progress: 100,
          filename: 'test.pdf',
        },
        timestamp: 1234567890,
      };

      eventHandler(eventData);

      expect(windowManager.sendToRenderer).toHaveBeenCalledWith('task:event', {
        type: TaskEventType.TASK_UPDATED,
        taskId: 'task-123',
        task: {
          status: 'COMPLETED',
          progress: 100,
          filename: 'test.pdf',
        },
        timestamp: 1234567890,
      });
    });

    it('should handle events without task data', () => {
      const eventHandler = vi.mocked(eventBus.onTaskEvent).mock.calls[0][1];
      const eventData = {
        type: TaskEventType.TASK_DELETED,
        taskId: 'task-123',
        timestamp: Date.now(),
      };

      eventHandler(eventData);

      expect(windowManager.sendToRenderer).toHaveBeenCalledWith(
        'task:event',
        expect.objectContaining({
          taskId: 'task-123',
          task: undefined,
        })
      );
    });
  });

  describe('cleanup()', () => {
    it('should remove all event listeners', () => {
      bridge.initialize();
      bridge.cleanup();

      expect(eventBus.removeAllListeners).toHaveBeenCalled();
    });

    it('should reset isInitialized flag', () => {
      bridge.initialize();
      expect(bridge['isInitialized']).toBe(true);

      bridge.cleanup();
      expect(bridge['isInitialized']).toBe(false);
    });

    it('should allow re-initialization after cleanup', () => {
      bridge.initialize();
      bridge.cleanup();

      vi.clearAllMocks();

      bridge.initialize();

      expect(eventBus.onTaskEvent).toHaveBeenCalledWith(
        'task:*',
        expect.any(Function)
      );
    });

    it('should be safe to call multiple times', () => {
      bridge.cleanup();
      bridge.cleanup();

      // Should not throw
      expect(eventBus.removeAllListeners).toHaveBeenCalledTimes(2);
    });
  });

  describe('integration', () => {
    it('should properly bridge events from server to renderer', () => {
      bridge.initialize();

      // Simulate event from EventBus
      const eventHandler = vi.mocked(eventBus.onTaskEvent).mock.calls[0][1];
      eventHandler({
        type: TaskEventType.TASK_STATUS_CHANGED,
        taskId: 'integration-test',
        task: { status: 'PROCESSING' },
        timestamp: Date.now(),
      });

      // Should forward to renderer via WindowManager
      expect(windowManager.sendToRenderer).toHaveBeenCalledWith(
        'task:event',
        expect.objectContaining({
          taskId: 'integration-test',
          type: TaskEventType.TASK_STATUS_CHANGED,
        })
      );
    });

    it('should handle rapid event emission', () => {
      bridge.initialize();
      const eventHandler = vi.mocked(eventBus.onTaskEvent).mock.calls[0][1];

      // Emit 10 events rapidly
      for (let i = 0; i < 10; i++) {
        eventHandler({
          type: TaskEventType.TASK_PROGRESS_CHANGED,
          taskId: `task-${i}`,
          task: { progress: i * 10 },
          timestamp: Date.now(),
        });
      }

      expect(windowManager.sendToRenderer).toHaveBeenCalledTimes(10);
    });

    it('should handle lifecycle: init -> events -> cleanup -> reinit', () => {
      // First cycle
      bridge.initialize();
      const handler1 = vi.mocked(eventBus.onTaskEvent).mock.calls[0][1];
      handler1({
        type: TaskEventType.TASK_UPDATED,
        taskId: 'test-1',
        timestamp: Date.now(),
      });
      expect(windowManager.sendToRenderer).toHaveBeenCalledTimes(1);

      // Cleanup
      bridge.cleanup();
      vi.clearAllMocks();

      // Second cycle
      bridge.initialize();
      const handler2 = vi.mocked(eventBus.onTaskEvent).mock.calls[0][1];
      handler2({
        type: TaskEventType.TASK_UPDATED,
        taskId: 'test-2',
        timestamp: Date.now(),
      });
      expect(windowManager.sendToRenderer).toHaveBeenCalledTimes(1);
    });
  });
});
