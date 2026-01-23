import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock electron-is-dev to force production mode
vi.mock('electron-is-dev', () => ({
  default: false,
}));

// Mock electron
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/userdata'),
  },
}));

// Mock workers
vi.mock('../../workers/index.js', () => ({
  SplitterWorker: vi.fn().mockImplementation(() => ({
    getWorkerId: vi.fn(() => 'mock-worker-id'),
    getIsRunning: vi.fn(() => true),
    run: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
  })),
}));

// Mock ImagePathUtil
vi.mock('../split/index.js', () => ({
  ImagePathUtil: {
    init: vi.fn(),
    getPath: vi.fn(),
    getTaskDir: vi.fn(),
  },
}));

import TaskLogic from '../Task.js';
import { SplitterWorker } from '../../workers/index.js';
import { ImagePathUtil } from '../split/index.js';

describe('TaskLogic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset TaskLogic state
    if (TaskLogic.getStatus()) {
      TaskLogic.stop();
    }
  });

  describe('start()', () => {
    it('should initialize ImagePathUtil with uploads directory', async () => {
      await TaskLogic.start();

      expect(ImagePathUtil.init).toHaveBeenCalledWith('/mock/userdata/files');
    });

    it('should create and start SplitterWorker', async () => {
      await TaskLogic.start();

      expect(SplitterWorker).toHaveBeenCalledWith('/mock/userdata/files');

      const mockWorkerInstance = vi.mocked(SplitterWorker).mock.results[0].value;
      expect(mockWorkerInstance.run).toHaveBeenCalled();
    });

    it('should set isRunning to true', async () => {
      await TaskLogic.start();

      expect(TaskLogic.getStatus()).toBe(true);
    });

    it('should not start if already running', async () => {
      await TaskLogic.start();

      // Clear mocks
      vi.clearAllMocks();

      // Try to start again
      await TaskLogic.start();

      // Should not create new worker
      expect(SplitterWorker).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      // Mock ImagePathUtil to throw error
      vi.mocked(ImagePathUtil.init).mockImplementationOnce(() => {
        throw new Error('Init failed');
      });

      await expect(TaskLogic.start()).rejects.toThrow('Init failed');
      expect(TaskLogic.getStatus()).toBe(false);
    });
  });

  describe('stop()', () => {
    it('should stop SplitterWorker', async () => {
      await TaskLogic.start();

      const mockWorkerInstance = vi.mocked(SplitterWorker).mock.results[0].value;

      await TaskLogic.stop();

      expect(mockWorkerInstance.stop).toHaveBeenCalled();
    });

    it('should set isRunning to false', async () => {
      await TaskLogic.start();
      await TaskLogic.stop();

      expect(TaskLogic.getStatus()).toBe(false);
    });

    it('should not error if not running', async () => {
      await expect(TaskLogic.stop()).resolves.toBeUndefined();
    });
  });

  describe('getStatus()', () => {
    it('should return false initially', () => {
      expect(TaskLogic.getStatus()).toBe(false);
    });

    it('should return true after start', async () => {
      await TaskLogic.start();
      expect(TaskLogic.getStatus()).toBe(true);
    });

    it('should return false after stop', async () => {
      await TaskLogic.start();
      await TaskLogic.stop();
      expect(TaskLogic.getStatus()).toBe(false);
    });
  });

  describe('getWorkerInfo()', () => {
    it('should return worker information when running', async () => {
      await TaskLogic.start();

      const info = TaskLogic.getWorkerInfo();

      expect(info).toMatchObject({
        isRunning: true,
        splitterWorker: {
          id: 'mock-worker-id',
          running: true,
        },
        directories: {
          uploads: '/mock/userdata/files',
        },
      });
    });

    it('should return null for worker when not running', () => {
      const info = TaskLogic.getWorkerInfo();

      expect(info).toMatchObject({
        isRunning: false,
        splitterWorker: null,
        directories: {
          uploads: '/mock/userdata/files',
        },
      });
    });
  });

  describe('directory paths', () => {
    it('should use correct uploads directory for workers', async () => {
      await TaskLogic.start();

      expect(SplitterWorker).toHaveBeenCalledWith('/mock/userdata/files');
    });

    it('should initialize ImagePathUtil with uploads directory', async () => {
      await TaskLogic.start();

      expect(ImagePathUtil.init).toHaveBeenCalledWith('/mock/userdata/files');
    });
  });
});
