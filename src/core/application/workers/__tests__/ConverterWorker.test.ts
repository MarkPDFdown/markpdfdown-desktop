import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ConverterWorker } from '../ConverterWorker.js';
import { TaskStatus } from '../../../../shared/types/TaskStatus.js';
import { PageStatus } from '../../../../shared/types/PageStatus.js';

// Mock dependencies
vi.mock('../../../infrastructure/db/index.js', () => ({
  prisma: {
    $transaction: vi.fn(),
    task: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    taskDetail: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock('../../../infrastructure/adapters/split/index.js', () => ({
  ImagePathUtil: {
    getPath: vi.fn().mockImplementation((taskId: string, page: number) => `/mock/path/${taskId}/page-${page}.png`),
  },
}));

vi.mock('../../services/ModelService.js', () => ({
  default: {
    transformImageMessage: vi.fn().mockResolvedValue([{ role: 'user', content: 'test image' }]),
    completion: vi.fn(),
  },
}));

vi.mock('../../../shared/events/EventBus.js', () => ({
  eventBus: {
    emitTaskEvent: vi.fn(),
    emitTaskDetailEvent: vi.fn(),
  },
  TaskEventType: {
    TASK_UPDATED: 'task:updated',
    TASK_STATUS_CHANGED: 'task:status_changed',
    TASK_PROGRESS_CHANGED: 'task:progress_changed',
    TASK_DETAIL_UPDATED: 'taskDetail:updated',
  },
}));

vi.mock('../../../infrastructure/config/worker.config.js', () => ({
  WORKER_CONFIG: {
    converter: {
      maxRetries: 3,
      maxContentLength: 500000,
      pollInterval: 100, // Short for tests
      retryDelayBase: 10, // Short for tests
    },
  },
}));

import { prisma } from '../../../infrastructure/db/index.js';
import modelLogic from '../../services/ModelService.js';
import { eventBus, TaskEventType } from '../../../shared/events/EventBus.js';

describe('ConverterWorker', () => {
  let worker: ConverterWorker;

  beforeEach(() => {
    worker = new ConverterWorker();
    vi.clearAllMocks();
  });

  afterEach(() => {
    worker.stop();
  });

  describe('constructor', () => {
    it('should create worker with unique ID', () => {
      expect(worker).toBeDefined();
      expect(worker.getWorkerId()).toBeTruthy();
    });

    it('should initialize with isRunning = false', () => {
      expect(worker.getIsRunning()).toBe(false);
    });

    it('should generate different IDs for different workers', () => {
      const worker2 = new ConverterWorker();
      expect(worker.getWorkerId()).not.toBe(worker2.getWorkerId());
    });
  });

  describe('run()', () => {
    it('should set isRunning to true when started', async () => {
      // Mock claimPage to return null (no pages)
      vi.mocked(prisma.taskDetail.findFirst).mockResolvedValue(null);

      const runPromise = worker.run();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(worker.getIsRunning()).toBe(true);

      worker.stop();
      await runPromise;
    });

    it('should stop when stop() is called', async () => {
      vi.mocked(prisma.taskDetail.findFirst).mockResolvedValue(null);

      const runPromise = worker.run();
      await new Promise((resolve) => setTimeout(resolve, 50));

      worker.stop();
      await runPromise;

      expect(worker.getIsRunning()).toBe(false);
    });

    it('should continue running after error in main loop', async () => {
      let callCount = 0;

      vi.mocked(prisma.taskDetail.findFirst).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Transient error');
        }
        return null;
      });

      const runPromise = worker.run();
      await new Promise((resolve) => setTimeout(resolve, 250));

      expect(callCount).toBeGreaterThan(1);

      worker.stop();
      await runPromise;
    });
  });

  describe('claimPage()', () => {
    it('should claim a PENDING page from a PROCESSING task', async () => {
      const mockPage = {
        id: 1,
        task: 'task123',
        page: 1,
        page_source: 1,
        status: PageStatus.PENDING,
        worker_id: null,
        provider: 1,
        model: 'gpt-4',
        content: '',
        error: null,
        retry_count: 0,
        input_tokens: 0,
        output_tokens: 0,
        conversion_time: 0,
        started_at: null,
        completed_at: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(prisma.taskDetail.findFirst).mockResolvedValue(mockPage as any);
      vi.mocked(prisma.task.findUnique).mockResolvedValue({ status: TaskStatus.PROCESSING } as any);
      vi.mocked(prisma.taskDetail.updateMany).mockResolvedValue({ count: 1 });
      vi.mocked(prisma.taskDetail.findUnique).mockResolvedValue({
        ...mockPage,
        status: PageStatus.PROCESSING,
        worker_id: worker.getWorkerId(),
      } as any);

      const result = await (worker as any).claimPage();

      expect(result).toBeDefined();
      expect(prisma.taskDetail.updateMany).toHaveBeenCalled();
    });

    it('should return null if no PENDING pages exist', async () => {
      vi.mocked(prisma.taskDetail.findFirst).mockResolvedValue(null);

      const result = await (worker as any).claimPage();

      expect(result).toBeNull();
    });

    it('should skip pages from tasks not in PROCESSING state', async () => {
      const mockPage = {
        id: 1,
        task: 'task123',
        status: PageStatus.PENDING,
        worker_id: null,
      };

      // First call returns a page, second call returns null
      vi.mocked(prisma.taskDetail.findFirst)
        .mockResolvedValueOnce(mockPage as any)
        .mockResolvedValueOnce(null);

      // Task is not in PROCESSING state
      vi.mocked(prisma.task.findUnique).mockResolvedValue({ status: TaskStatus.CANCELLED } as any);

      const result = await (worker as any).claimPage();

      expect(result).toBeNull();
    });

    it('should retry if another worker claims the page first', async () => {
      const mockPage = {
        id: 1,
        task: 'task123',
        status: PageStatus.PENDING,
        worker_id: null,
      };

      vi.mocked(prisma.taskDetail.findFirst)
        .mockResolvedValueOnce(mockPage as any)
        .mockResolvedValueOnce(null);
      vi.mocked(prisma.task.findUnique).mockResolvedValue({ status: TaskStatus.PROCESSING } as any);
      // First attempt fails (another worker claimed it)
      vi.mocked(prisma.taskDetail.updateMany).mockResolvedValueOnce({ count: 0 });

      const result = await (worker as any).claimPage();

      expect(result).toBeNull();
      expect(prisma.taskDetail.updateMany).toHaveBeenCalled();
    });

    it('should prioritize pages with lower retry_count', async () => {
      let queryParams: any;

      vi.mocked(prisma.taskDetail.findFirst).mockImplementation(async (params: any) => {
        queryParams = params;
        return null;
      });

      await (worker as any).claimPage();

      expect(queryParams.orderBy).toEqual([{ retry_count: 'asc' }, { page: 'asc' }]);
    });
  });

  describe('convertPage()', () => {
    const mockPage = {
      id: 1,
      task: 'task123',
      page: 1,
      provider: 1,
      model: 'gpt-4',
    };

    it('should convert page successfully', async () => {
      vi.mocked(modelLogic.completion).mockResolvedValue({
        content: '# Test Markdown',
        rawResponse: {
          usage: {
            prompt_tokens: 100,
            completion_tokens: 50,
          },
        },
      } as any);

      const result = await (worker as any).convertPage(mockPage);

      expect(result).toMatchObject({
        markdown: '# Test Markdown',
        inputTokens: 100,
        outputTokens: 50,
      });
      expect(result.conversionTime).toBeGreaterThanOrEqual(0);
    });

    it('should throw error if LLM returns empty content', async () => {
      vi.mocked(modelLogic.completion).mockResolvedValue({
        content: '',
        rawResponse: {},
      } as any);

      await expect((worker as any).convertPage(mockPage)).rejects.toThrow('LLM returned empty content');
    });

    it('should throw error if content exceeds maxContentLength', async () => {
      const longContent = 'a'.repeat(600000);
      vi.mocked(modelLogic.completion).mockResolvedValue({
        content: longContent,
        rawResponse: {},
      } as any);

      await expect((worker as any).convertPage(mockPage)).rejects.toThrow('Content exceeds maximum length');
    });
  });

  describe('cleanMarkdownContent()', () => {
    it('should remove ```markdown prefix', () => {
      const input = '```markdown\n# Test\n```';
      const result = (worker as any).cleanMarkdownContent(input);
      expect(result).toBe('# Test');
    });

    it('should remove ```md prefix', () => {
      const input = '```md\n# Test\n```';
      const result = (worker as any).cleanMarkdownContent(input);
      expect(result).toBe('# Test');
    });

    it('should remove plain ``` prefix', () => {
      const input = '```\n# Test\n```';
      const result = (worker as any).cleanMarkdownContent(input);
      expect(result).toBe('# Test');
    });

    it('should handle content without code block markers', () => {
      const input = '# Test\nSome content';
      const result = (worker as any).cleanMarkdownContent(input);
      expect(result).toBe('# Test\nSome content');
    });

    it('should trim whitespace', () => {
      const input = '  # Test  ';
      const result = (worker as any).cleanMarkdownContent(input);
      expect(result).toBe('# Test');
    });
  });

  describe('extractInputTokens()', () => {
    it('should extract OpenAI format prompt_tokens', () => {
      const response = {
        rawResponse: {
          usage: { prompt_tokens: 100 },
        },
      };
      const result = (worker as any).extractInputTokens(response);
      expect(result).toBe(100);
    });

    it('should extract Anthropic format input_tokens', () => {
      const response = {
        rawResponse: {
          usage: { input_tokens: 150 },
        },
      };
      const result = (worker as any).extractInputTokens(response);
      expect(result).toBe(150);
    });

    it('should extract Gemini format promptTokenCount', () => {
      const response = {
        rawResponse: {
          usageMetadata: { promptTokenCount: 200 },
        },
      };
      const result = (worker as any).extractInputTokens(response);
      expect(result).toBe(200);
    });

    it('should return 0 if no usage data', () => {
      const response = { rawResponse: null };
      const result = (worker as any).extractInputTokens(response);
      expect(result).toBe(0);
    });
  });

  describe('extractOutputTokens()', () => {
    it('should extract OpenAI format completion_tokens', () => {
      const response = {
        rawResponse: {
          usage: { completion_tokens: 50 },
        },
      };
      const result = (worker as any).extractOutputTokens(response);
      expect(result).toBe(50);
    });

    it('should extract Anthropic format output_tokens', () => {
      const response = {
        rawResponse: {
          usage: { output_tokens: 75 },
        },
      };
      const result = (worker as any).extractOutputTokens(response);
      expect(result).toBe(75);
    });

    it('should extract Gemini format candidatesTokenCount', () => {
      const response = {
        rawResponse: {
          usageMetadata: { candidatesTokenCount: 100 },
        },
      };
      const result = (worker as any).extractOutputTokens(response);
      expect(result).toBe(100);
    });

    it('should return 0 if no usage data', () => {
      const response = { rawResponse: {} };
      const result = (worker as any).extractOutputTokens(response);
      expect(result).toBe(0);
    });
  });

  describe('analyzeError()', () => {
    it('should identify network errors', () => {
      const networkErrors = [
        new Error('Network connection failed'),
        new Error('ECONNREFUSED'),
        new Error('ENOTFOUND'),
        new Error('ETIMEDOUT'),
        new Error('fetch failed'),
        new Error('socket hang up'),
      ];

      networkErrors.forEach((error) => {
        const result = (worker as any).analyzeError(error);
        expect(result).toBe('network_error');
      });
    });

    it('should identify rate limit errors', () => {
      const rateLimitErrors = [
        new Error('rate limit exceeded'),
        new Error('rate_limit_exceeded'),
        new Error('Too many requests'),
        new Error('HTTP 429 error'),
      ];

      rateLimitErrors.forEach((error) => {
        const result = (worker as any).analyzeError(error);
        expect(result).toBe('rate_limit_error');
      });
    });

    it('should identify quota exceeded errors', () => {
      const quotaErrors = [
        new Error('quota exceeded'),
        new Error('insufficient_quota'),
        new Error('billing issue'),
      ];

      quotaErrors.forEach((error) => {
        const result = (worker as any).analyzeError(error);
        expect(result).toBe('quota_exceeded_error');
      });
    });

    it('should identify config errors', () => {
      const configErrors = [
        new Error('invalid api key'),
        new Error('invalid_api_key'),
        new Error('unauthorized'),
        new Error('authentication failed'),
        new Error('model not found'),
      ];

      configErrors.forEach((error) => {
        const result = (worker as any).analyzeError(error);
        expect(result).toBe('config_error');
      });
    });

    it('should identify file errors', () => {
      const fileErrors = [
        new Error('ENOENT: no such file'),
        new Error('file not found'),
        new Error('no such file or directory'),
      ];

      fileErrors.forEach((error) => {
        const result = (worker as any).analyzeError(error);
        expect(result).toBe('file_error');
      });
    });

    it('should identify timeout errors', () => {
      const timeoutErrors = [
        new Error('timeout'),
        new Error('request timed out'),
      ];

      timeoutErrors.forEach((error) => {
        const result = (worker as any).analyzeError(error);
        expect(result).toBe('timeout_error');
      });
    });

    it('should return unknown_error for unrecognized errors', () => {
      const error = new Error('Something unexpected happened');
      const result = (worker as any).analyzeError(error);
      expect(result).toBe('unknown_error');
    });
  });

  describe('isRetryableError()', () => {
    it('should return true for retryable errors', () => {
      const retryableTypes = [
        'network_error',
        'llm_error',
        'rate_limit_error',
        'timeout_error',
        'unknown_error',
      ];

      retryableTypes.forEach((type) => {
        expect((worker as any).isRetryableError(type)).toBe(true);
      });
    });

    it('should return false for non-retryable errors', () => {
      const nonRetryableTypes = [
        'quota_exceeded_error',
        'config_error',
        'file_error',
      ];

      nonRetryableTypes.forEach((type) => {
        expect((worker as any).isRetryableError(type)).toBe(false);
      });
    });
  });

  describe('calculateRetryDelay()', () => {
    it('should increase delay exponentially', () => {
      const delay0 = (worker as any).calculateRetryDelay(0, 'network_error');
      const delay1 = (worker as any).calculateRetryDelay(1, 'network_error');
      const delay2 = (worker as any).calculateRetryDelay(2, 'network_error');

      // With jitter, we can only verify the base relationship
      expect(delay1).toBeGreaterThan(delay0 * 1.5);
      expect(delay2).toBeGreaterThan(delay1 * 1.5);
    });

    it('should apply extra delay for rate limit errors', () => {
      const normalDelay = (worker as any).calculateRetryDelay(1, 'network_error');
      const rateLimitDelay = (worker as any).calculateRetryDelay(1, 'rate_limit_error');

      // Rate limit delay should be roughly double (with jitter)
      expect(rateLimitDelay).toBeGreaterThan(normalDelay);
    });

    it('should cap delay at 30 seconds', () => {
      const delay = (worker as any).calculateRetryDelay(10, 'rate_limit_error');
      expect(delay).toBeLessThanOrEqual(30000);
    });
  });

  describe('formatError()', () => {
    it('should return error message', () => {
      const error = new Error('Test error message');
      const result = (worker as any).formatError(error);
      expect(result).toBe('Test error message');
    });

    it('should truncate long error messages', () => {
      const longMessage = 'a'.repeat(600);
      const error = new Error(longMessage);
      const result = (worker as any).formatError(error);
      expect(result.length).toBe(500);
      expect(result.endsWith('...')).toBe(true);
    });

    it('should handle errors without message', () => {
      const error = { toString: () => 'Custom error' };
      const result = (worker as any).formatError(error);
      expect(result).toBe('Custom error');
    });
  });

  describe('completePageSuccess()', () => {
    const mockPage = {
      id: 1,
      task: 'task123',
      page: 1,
    };

    const mockResult = {
      markdown: '# Test',
      inputTokens: 100,
      outputTokens: 50,
      conversionTime: 1000,
    };

    it('should update page status to COMPLETED', async () => {
      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        const tx = {
          taskDetail: {
            findUnique: vi.fn().mockResolvedValue({
              worker_id: worker.getWorkerId(),
              status: PageStatus.PROCESSING,
            }),
            update: vi.fn(),
          },
          task: {
            findUnique: vi.fn().mockResolvedValue({
              status: TaskStatus.PROCESSING,
              pages: 10,
              completed_count: 5,
              failed_count: 0,
            }),
            update: vi.fn().mockResolvedValue({
              completed_count: 6,
            }),
          },
        };
        return callback(tx);
      });

      vi.mocked(prisma.task.findUnique).mockResolvedValue({
        id: 'task123',
        progress: 60,
        status: TaskStatus.PROCESSING,
      } as any);

      await (worker as any).completePageSuccess(mockPage, mockResult);

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should skip if page already completed (idempotency)', async () => {
      let updateCalled = false;

      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        const tx = {
          taskDetail: {
            findUnique: vi.fn().mockResolvedValue({
              worker_id: worker.getWorkerId(),
              status: PageStatus.COMPLETED,
            }),
            update: vi.fn(() => {
              updateCalled = true;
            }),
          },
          task: {
            findUnique: vi.fn(),
            update: vi.fn(),
          },
        };
        return callback(tx);
      });

      await (worker as any).completePageSuccess(mockPage, mockResult);

      expect(updateCalled).toBe(false);
    });

    it('should throw error if page claimed by another worker', async () => {
      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        const tx = {
          taskDetail: {
            findUnique: vi.fn().mockResolvedValue({
              worker_id: 'other-worker',
              status: PageStatus.PROCESSING,
            }),
          },
          task: {
            findUnique: vi.fn(),
            update: vi.fn(),
          },
        };
        return callback(tx);
      });

      await expect((worker as any).completePageSuccess(mockPage, mockResult)).rejects.toThrow(
        'Page claimed by another worker'
      );
    });

    it('should set task to READY_TO_MERGE when all pages completed', async () => {
      const taskUpdateCalls: any[] = [];

      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        const tx = {
          taskDetail: {
            findUnique: vi.fn().mockResolvedValue({
              worker_id: worker.getWorkerId(),
              status: PageStatus.PROCESSING,
            }),
            update: vi.fn(),
          },
          task: {
            findUnique: vi.fn().mockResolvedValue({
              status: TaskStatus.PROCESSING,
              pages: 5,
              completed_count: 4,
              failed_count: 0,
            }),
            update: vi.fn().mockImplementation((params: any) => {
              taskUpdateCalls.push(params.data);
              return { completed_count: 5 };
            }),
          },
        };
        return callback(tx);
      });

      vi.mocked(prisma.task.findUnique).mockResolvedValue({
        id: 'task123',
        progress: 100,
        status: TaskStatus.READY_TO_MERGE,
      } as any);

      await (worker as any).completePageSuccess(mockPage, mockResult);

      // Find the update call that sets the status
      const statusUpdate = taskUpdateCalls.find((call) => call.status !== undefined);
      expect(statusUpdate).toBeDefined();
      expect(statusUpdate.status).toBe(TaskStatus.READY_TO_MERGE);
    });

    it('should set task to PARTIAL_FAILED when all pages finished with some failures', async () => {
      let taskUpdateData: any;

      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        const tx = {
          taskDetail: {
            findUnique: vi.fn().mockResolvedValue({
              worker_id: worker.getWorkerId(),
              status: PageStatus.PROCESSING,
            }),
            update: vi.fn(),
          },
          task: {
            findUnique: vi.fn().mockResolvedValue({
              status: TaskStatus.PROCESSING,
              pages: 5,
              completed_count: 3,
              failed_count: 1,
            }),
            update: vi.fn().mockImplementation((params: any) => {
              if (params.data.status) {
                taskUpdateData = params.data;
              }
              return { completed_count: 4 };
            }),
          },
        };
        return callback(tx);
      });

      vi.mocked(prisma.task.findUnique).mockResolvedValue({
        id: 'task123',
        status: TaskStatus.PARTIAL_FAILED,
      } as any);

      await (worker as any).completePageSuccess(mockPage, mockResult);

      expect(taskUpdateData.status).toBe(TaskStatus.PARTIAL_FAILED);
    });

    it('should emit progress event after success', async () => {
      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        const tx = {
          taskDetail: {
            findUnique: vi.fn().mockResolvedValue({
              worker_id: worker.getWorkerId(),
              status: PageStatus.PROCESSING,
            }),
            update: vi.fn(),
          },
          task: {
            findUnique: vi.fn().mockResolvedValue({
              status: TaskStatus.PROCESSING,
              pages: 10,
              completed_count: 5,
              failed_count: 0,
            }),
            update: vi.fn().mockResolvedValue({ completed_count: 6 }),
          },
        };
        return callback(tx);
      });

      vi.mocked(prisma.task.findUnique).mockResolvedValue({
        id: 'task123',
        progress: 60,
        status: TaskStatus.PROCESSING,
      } as any);

      await (worker as any).completePageSuccess(mockPage, mockResult);

      // Wait for async event emission
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(eventBus.emitTaskEvent).toHaveBeenCalledWith(
        TaskEventType.TASK_UPDATED,
        expect.objectContaining({ taskId: 'task123' })
      );
      expect(eventBus.emitTaskEvent).toHaveBeenCalledWith(
        TaskEventType.TASK_PROGRESS_CHANGED,
        expect.objectContaining({ taskId: 'task123' })
      );
    });
  });

  describe('completePageFailed()', () => {
    const mockPage = {
      id: 1,
      task: 'task123',
      page: 1,
    };

    it('should update page status to FAILED', async () => {
      let pageUpdateData: any;

      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        const tx = {
          taskDetail: {
            findUnique: vi.fn().mockResolvedValue({
              worker_id: worker.getWorkerId(),
              status: PageStatus.PROCESSING,
            }),
            update: vi.fn().mockImplementation((params: any) => {
              pageUpdateData = params.data;
            }),
          },
          task: {
            findUnique: vi.fn().mockResolvedValue({
              status: TaskStatus.PROCESSING,
              pages: 10,
              completed_count: 5,
              failed_count: 1,
            }),
            update: vi.fn().mockResolvedValue({ failed_count: 2 }),
          },
        };
        return callback(tx);
      });

      vi.mocked(prisma.task.findUnique).mockResolvedValue({
        id: 'task123',
        status: TaskStatus.PROCESSING,
      } as any);

      await (worker as any).completePageFailed(mockPage, new Error('Test error'));

      expect(pageUpdateData.status).toBe(PageStatus.FAILED);
      expect(pageUpdateData.error).toBe('Test error');
    });

    it('should set task to FAILED when all pages failed', async () => {
      const taskUpdateCalls: any[] = [];

      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        const tx = {
          taskDetail: {
            findUnique: vi.fn().mockResolvedValue({
              worker_id: worker.getWorkerId(),
              status: PageStatus.PROCESSING,
            }),
            update: vi.fn(),
          },
          task: {
            findUnique: vi.fn().mockResolvedValue({
              status: TaskStatus.PROCESSING,
              pages: 5,
              completed_count: 0,
              failed_count: 4,
            }),
            update: vi.fn().mockImplementation((params: any) => {
              taskUpdateCalls.push(params.data);
              return { failed_count: 5 };
            }),
          },
        };
        return callback(tx);
      });

      vi.mocked(prisma.task.findUnique).mockResolvedValue({
        id: 'task123',
        status: TaskStatus.FAILED,
      } as any);

      await (worker as any).completePageFailed(mockPage, new Error('Test error'));

      // Find the update call that sets the status
      const statusUpdate = taskUpdateCalls.find((call) => call.status !== undefined);
      expect(statusUpdate).toBeDefined();
      expect(statusUpdate.status).toBe(TaskStatus.FAILED);
      expect(statusUpdate.error).toBe('Test error');
    });

    it('should throw error if task is cancelled', async () => {
      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        const tx = {
          taskDetail: {
            findUnique: vi.fn().mockResolvedValue({
              worker_id: worker.getWorkerId(),
              status: PageStatus.PROCESSING,
            }),
          },
          task: {
            findUnique: vi.fn().mockResolvedValue({
              status: TaskStatus.CANCELLED,
            }),
            update: vi.fn(),
          },
        };
        return callback(tx);
      });

      await expect((worker as any).completePageFailed(mockPage, new Error('Test'))).rejects.toThrow(
        'Task has been cancelled'
      );
    });
  });

  describe('processPageWithRetry()', () => {
    const mockPage = {
      id: 1,
      task: 'task123',
      page: 1,
      provider: 1,
      model: 'gpt-4',
    };

    it('should succeed on first attempt', async () => {
      vi.mocked(modelLogic.completion).mockResolvedValue({
        content: '# Test',
        rawResponse: { usage: { prompt_tokens: 100, completion_tokens: 50 } },
      } as any);

      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        const tx = {
          taskDetail: {
            findUnique: vi.fn().mockResolvedValue({
              worker_id: worker.getWorkerId(),
              status: PageStatus.PROCESSING,
            }),
            update: vi.fn(),
          },
          task: {
            findUnique: vi.fn().mockResolvedValue({
              status: TaskStatus.PROCESSING,
              pages: 10,
              completed_count: 5,
              failed_count: 0,
            }),
            update: vi.fn().mockResolvedValue({ completed_count: 6 }),
          },
        };
        return callback(tx);
      });

      vi.mocked(prisma.task.findUnique).mockResolvedValue({ id: 'task123', progress: 60 } as any);

      await (worker as any).processPageWithRetry(mockPage);

      expect(modelLogic.completion).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable error', async () => {
      let callCount = 0;

      vi.mocked(modelLogic.completion).mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          throw new Error('Network error');
        }
        return {
          content: '# Test',
          rawResponse: { usage: { prompt_tokens: 100, completion_tokens: 50 } },
        } as any;
      });

      vi.mocked(prisma.task.findUnique).mockResolvedValue({ status: TaskStatus.PROCESSING } as any);
      vi.mocked(prisma.taskDetail.update).mockResolvedValue({} as any);

      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        const tx = {
          taskDetail: {
            findUnique: vi.fn().mockResolvedValue({
              worker_id: worker.getWorkerId(),
              status: PageStatus.PROCESSING,
            }),
            update: vi.fn(),
          },
          task: {
            findUnique: vi.fn().mockResolvedValue({
              status: TaskStatus.PROCESSING,
              pages: 10,
              completed_count: 5,
              failed_count: 0,
            }),
            update: vi.fn().mockResolvedValue({ completed_count: 6 }),
          },
        };
        return callback(tx);
      });

      await (worker as any).processPageWithRetry(mockPage);

      expect(callCount).toBe(3);
    });

    it('should not retry on non-retryable error', async () => {
      vi.mocked(modelLogic.completion).mockRejectedValue(new Error('Invalid API key'));

      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        const tx = {
          taskDetail: {
            findUnique: vi.fn().mockResolvedValue({
              worker_id: worker.getWorkerId(),
              status: PageStatus.PROCESSING,
            }),
            update: vi.fn(),
          },
          task: {
            findUnique: vi.fn().mockResolvedValue({
              status: TaskStatus.PROCESSING,
              pages: 10,
              completed_count: 0,
              failed_count: 0,
            }),
            update: vi.fn().mockResolvedValue({ failed_count: 1 }),
          },
        };
        return callback(tx);
      });

      vi.mocked(prisma.task.findUnique).mockResolvedValue({ id: 'task123' } as any);

      await (worker as any).processPageWithRetry(mockPage);

      // Should only call once (no retry for config error)
      expect(modelLogic.completion).toHaveBeenCalledTimes(1);
    });

    it('should stop retrying if task is cancelled', async () => {
      let callCount = 0;

      vi.mocked(modelLogic.completion).mockImplementation(async () => {
        callCount++;
        throw new Error('Network error');
      });

      vi.mocked(prisma.task.findUnique).mockResolvedValue({ status: TaskStatus.CANCELLED } as any);
      vi.mocked(prisma.taskDetail.update).mockResolvedValue({} as any);

      await (worker as any).processPageWithRetry(mockPage);

      // Should stop after first failure when task is cancelled
      expect(callCount).toBe(1);
    });

    it('should increment retry count on each retry', async () => {
      vi.mocked(modelLogic.completion).mockRejectedValue(new Error('Network error'));
      vi.mocked(prisma.task.findUnique).mockResolvedValue({ status: TaskStatus.PROCESSING } as any);
      vi.mocked(prisma.taskDetail.update).mockResolvedValue({} as any);

      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        const tx = {
          taskDetail: {
            findUnique: vi.fn().mockResolvedValue({
              worker_id: worker.getWorkerId(),
              status: PageStatus.PROCESSING,
            }),
            update: vi.fn(),
          },
          task: {
            findUnique: vi.fn().mockResolvedValue({
              status: TaskStatus.PROCESSING,
              pages: 10,
              completed_count: 0,
              failed_count: 0,
            }),
            update: vi.fn().mockResolvedValue({ failed_count: 1 }),
          },
        };
        return callback(tx);
      });

      await (worker as any).processPageWithRetry(mockPage);

      // Should increment retry count for each retry (maxRetries = 3)
      expect(prisma.taskDetail.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { retry_count: { increment: 1 } },
        })
      );
    });
  });

  describe('stop()', () => {
    it('should set isRunning to false', () => {
      (worker as any).isRunning = true;
      worker.stop();
      expect(worker.getIsRunning()).toBe(false);
    });

    it('should release current page if processing', async () => {
      (worker as any).isRunning = true;
      (worker as any).currentPageId = 123;

      vi.mocked(prisma.taskDetail.update).mockResolvedValue({} as any);

      worker.stop();

      // Wait for async release
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(prisma.taskDetail.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 123 },
          data: expect.objectContaining({
            status: PageStatus.PENDING,
            worker_id: null,
          }),
        })
      );
    });
  });

  describe('releaseCurrentPage()', () => {
    it('should release page back to PENDING status', async () => {
      (worker as any).currentPageId = 123;

      vi.mocked(prisma.taskDetail.update).mockResolvedValue({} as any);

      await (worker as any).releaseCurrentPage();

      expect(prisma.taskDetail.update).toHaveBeenCalledWith({
        where: { id: 123 },
        data: {
          status: PageStatus.PENDING,
          worker_id: null,
          started_at: null,
        },
      });
      expect((worker as any).currentPageId).toBeNull();
    });

    it('should do nothing if no current page', async () => {
      (worker as any).currentPageId = null;

      await (worker as any).releaseCurrentPage();

      expect(prisma.taskDetail.update).not.toHaveBeenCalled();
    });

    it('should handle release errors gracefully', async () => {
      (worker as any).currentPageId = 123;

      vi.mocked(prisma.taskDetail.update).mockRejectedValue(new Error('DB error'));

      // Should not throw
      await expect((worker as any).releaseCurrentPage()).resolves.toBeUndefined();
    });
  });

  describe('checkTaskStatus()', () => {
    it('should return task status', async () => {
      vi.mocked(prisma.task.findUnique).mockResolvedValue({ status: TaskStatus.PROCESSING } as any);

      const result = await (worker as any).checkTaskStatus('task123');

      expect(result).toBe(TaskStatus.PROCESSING);
    });

    it('should return null if task not found', async () => {
      vi.mocked(prisma.task.findUnique).mockResolvedValue(null);

      const result = await (worker as any).checkTaskStatus('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('incrementRetryCount()', () => {
    it('should increment retry count', async () => {
      vi.mocked(prisma.taskDetail.update).mockResolvedValue({} as any);

      await (worker as any).incrementRetryCount(123);

      expect(prisma.taskDetail.update).toHaveBeenCalledWith({
        where: { id: 123 },
        data: { retry_count: { increment: 1 } },
      });
    });
  });

  describe('emitProgressEvent()', () => {
    it('should emit TASK_UPDATED and TASK_PROGRESS_CHANGED events', async () => {
      vi.mocked(prisma.task.findUnique).mockResolvedValue({
        id: 'task123',
        progress: 50,
        status: TaskStatus.PROCESSING,
      } as any);

      (worker as any).emitProgressEvent('task123');

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(eventBus.emitTaskEvent).toHaveBeenCalledWith(
        TaskEventType.TASK_UPDATED,
        expect.objectContaining({ taskId: 'task123' })
      );
      expect(eventBus.emitTaskEvent).toHaveBeenCalledWith(
        TaskEventType.TASK_PROGRESS_CHANGED,
        expect.objectContaining({ taskId: 'task123' })
      );
    });

    it('should emit TASK_STATUS_CHANGED when task is completed', async () => {
      vi.mocked(prisma.task.findUnique).mockResolvedValue({
        id: 'task123',
        progress: 100,
        status: TaskStatus.READY_TO_MERGE,
      } as any);

      (worker as any).emitProgressEvent('task123');

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(eventBus.emitTaskEvent).toHaveBeenCalledWith(
        TaskEventType.TASK_STATUS_CHANGED,
        expect.objectContaining({
          taskId: 'task123',
          task: { status: TaskStatus.READY_TO_MERGE },
        })
      );
    });

    it('should emit TASK_STATUS_CHANGED when task has partial failures', async () => {
      vi.mocked(prisma.task.findUnique).mockResolvedValue({
        id: 'task123',
        progress: 80,
        status: TaskStatus.PARTIAL_FAILED,
      } as any);

      (worker as any).emitProgressEvent('task123');

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(eventBus.emitTaskEvent).toHaveBeenCalledWith(
        TaskEventType.TASK_STATUS_CHANGED,
        expect.objectContaining({
          taskId: 'task123',
          task: { status: TaskStatus.PARTIAL_FAILED },
        })
      );
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(prisma.task.findUnique).mockRejectedValue(new Error('DB error'));

      // Should not throw
      (worker as any).emitProgressEvent('task123');

      await new Promise((resolve) => setTimeout(resolve, 10));

      // No events should be emitted
      expect(eventBus.emitTaskEvent).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle transaction conflicts with retry', async () => {
      let attemptCount = 0;

      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        attemptCount++;
        if (attemptCount < 3) {
          const error = new Error('Transaction conflict');
          (error as any).code = 'P2034';
          throw error;
        }
        const tx = {
          taskDetail: {
            findUnique: vi.fn().mockResolvedValue({
              worker_id: worker.getWorkerId(),
              status: PageStatus.PROCESSING,
            }),
            update: vi.fn(),
          },
          task: {
            findUnique: vi.fn().mockResolvedValue({
              status: TaskStatus.PROCESSING,
              pages: 10,
              completed_count: 5,
              failed_count: 0,
            }),
            update: vi.fn().mockResolvedValue({ completed_count: 6 }),
          },
        };
        return callback(tx);
      });

      vi.mocked(prisma.task.findUnique).mockResolvedValue({ id: 'task123', progress: 60 } as any);

      const mockPage = { id: 1, task: 'task123', page: 1 };
      const mockResult = { markdown: '#Test', inputTokens: 100, outputTokens: 50, conversionTime: 1000 };

      await (worker as any).completePageSuccess(mockPage, mockResult);

      expect(attemptCount).toBe(3);
    });

    it('should handle whitespace-only content as empty', async () => {
      vi.mocked(modelLogic.completion).mockResolvedValue({
        content: '   \n\t   ',
        rawResponse: {},
      } as any);

      const mockPage = { id: 1, task: 'task123', page: 1, provider: 1, model: 'gpt-4' };

      await expect((worker as any).convertPage(mockPage)).rejects.toThrow('LLM returned empty content');
    });

    it('should handle page with special characters in error message', async () => {
      const specialError = new Error('Error with "quotes" and <tags> & ampersands');

      const result = (worker as any).formatError(specialError);

      expect(result).toBe('Error with "quotes" and <tags> & ampersands');
    });
  });
});
