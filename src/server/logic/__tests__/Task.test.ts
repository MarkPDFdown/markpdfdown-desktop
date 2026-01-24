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

// Mock fileLogic to ensure consistent paths across platforms
vi.mock('../File.js', () => ({
  default: {
    getUploadDir: vi.fn(() => '/mock/userdata/files'),
    getTempDir: vi.fn(() => '/mock/userdata/temp'),
    getSplitDir: vi.fn((taskId: string) => `/mock/userdata/files/${taskId}/split`),
    deleteTaskFiles: vi.fn(),
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
  ConverterWorker: vi.fn().mockImplementation(() => ({
    getWorkerId: vi.fn(() => 'mock-converter-id'),
    getIsRunning: vi.fn(() => true),
    run: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
  })),
  MergerWorker: vi.fn().mockImplementation(() => ({
    getWorkerId: vi.fn(() => 'mock-merger-id'),
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

const MOCK_UPLOADS_DIR = '/mock/userdata/files';

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

      expect(ImagePathUtil.init).toHaveBeenCalledWith(MOCK_UPLOADS_DIR);
    });

    it('should create and start SplitterWorker', async () => {
      await TaskLogic.start();

      expect(SplitterWorker).toHaveBeenCalledWith(MOCK_UPLOADS_DIR);

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

      expect(info.isRunning).toBe(true);
      expect(info.splitterWorker).toMatchObject({
        id: 'mock-worker-id',
        running: true,
      });
      expect(info.converterWorkers).toHaveLength(3); // Default count from config
      expect(info.converterWorkers[0]).toMatchObject({
        id: 'mock-con', // First 8 chars of 'mock-converter-id'
        running: true,
      });
    });

    it('should return null for worker when not running', () => {
      const info = TaskLogic.getWorkerInfo();

      expect(info.isRunning).toBe(false);
      expect(info.splitterWorker).toBeNull();
      expect(info.converterWorkers).toHaveLength(0);
    });
  });

  describe('directory paths', () => {
    it('should use correct uploads directory for workers', async () => {
      await TaskLogic.start();

      expect(SplitterWorker).toHaveBeenCalledWith(MOCK_UPLOADS_DIR);
    });

    it('should initialize ImagePathUtil with uploads directory', async () => {
      await TaskLogic.start();

      expect(ImagePathUtil.init).toHaveBeenCalledWith(MOCK_UPLOADS_DIR);
    });
  });
});
