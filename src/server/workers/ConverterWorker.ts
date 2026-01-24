import { WorkerBase } from './WorkerBase.js';
import { TaskStatus } from '../types/TaskStatus.js';
import { PageStatus } from '../types/PageStatus.js';
import { ImagePathUtil } from '../logic/split/ImagePathUtil.js';
import modelLogic from '../logic/Model.js';
import { eventBus, TaskEventType } from '../events/EventBus.js';
import { prisma } from '../db/index.js';
import { WORKER_CONFIG } from '../config/worker.config.js';
import type { CompletionResponse } from '../logic/llm/LLMClient.js';

/**
 * Error types for classification and retry decisions.
 */
enum ErrorType {
  NETWORK_ERROR = 'network_error',
  LLM_ERROR = 'llm_error',
  RATE_LIMIT_ERROR = 'rate_limit_error',
  QUOTA_EXCEEDED_ERROR = 'quota_exceeded_error',
  CONFIG_ERROR = 'config_error',
  FILE_ERROR = 'file_error',
  TIMEOUT_ERROR = 'timeout_error',
  UNKNOWN_ERROR = 'unknown_error',
}

/**
 * Result of a successful page conversion.
 */
interface ConversionResult {
  markdown: string;
  inputTokens: number;
  outputTokens: number;
  conversionTime: number;
}

/**
 * Page data from database with task info.
 */
interface PageWithTask {
  id: number;
  task: string;
  page: number;
  page_source: number;
  status: number;
  worker_id: string | null;
  provider: number;
  model: string;
  content: string;
  error: string | null;
  retry_count: number;
  input_tokens: number;
  output_tokens: number;
  conversion_time: number;
  started_at: Date | null;
  completed_at: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * ConverterWorker - Converts page images to Markdown via LLM.
 *
 * Workflow:
 * 1. Claim a PENDING page from a PROCESSING task
 * 2. Call LLM to convert the page image
 * 3. Update page status and task progress
 * 4. Handle retries for transient errors
 *
 * Multiple instances can run in parallel for better throughput.
 */
export class ConverterWorker extends WorkerBase {
  private readonly maxRetries: number;
  private readonly maxContentLength: number;
  private readonly pollInterval: number;
  private readonly retryDelayBase: number;
  private currentPageId: number | null = null;

  constructor() {
    super();
    this.maxRetries = WORKER_CONFIG.converter.maxRetries;
    this.maxContentLength = WORKER_CONFIG.converter.maxContentLength;
    this.pollInterval = WORKER_CONFIG.converter.pollInterval;
    this.retryDelayBase = WORKER_CONFIG.converter.retryDelayBase;
  }

  /**
   * Main worker loop.
   * Continuously polls for PENDING pages and processes them.
   */
  async run(): Promise<void> {
    this.isRunning = true;
    console.log(`[Converter-${this.workerId.slice(0, 8)}] Started. Poll interval: ${this.pollInterval}ms`);

    while (this.isRunning) {
      try {
        // Claim a PENDING page
        const page = await this.claimPage();

        if (page) {
          this.currentPageId = page.id;
          console.log(`[Converter-${this.workerId.slice(0, 8)}] Claimed page ${page.page} of task ${page.task} (provider: ${page.provider}, model: ${page.model})`);
          await this.processPageWithRetry(page);
          this.currentPageId = null;
        } else {
          // No pages available, sleep before next poll
          await this.sleep(this.pollInterval);
        }
      } catch (error) {
        console.error(`[Converter-${this.workerId.slice(0, 8)}] Unexpected error in main loop:`, error);
        // Release current page on unexpected error
        if (this.currentPageId !== null) {
          await this.releaseCurrentPage();
        }
        // Continue running even if one iteration fails
        await this.sleep(this.pollInterval);
      }
    }

    console.log(`[Converter-${this.workerId.slice(0, 8)}] Stopped.`);
  }

  /**
   * Stop the worker gracefully.
   * Releases the current page if any.
   */
  override stop(): void {
    this.isRunning = false;
    console.log(`[Converter-${this.workerId.slice(0, 8)}] Stopping...`);

    // Release current page asynchronously
    if (this.currentPageId !== null) {
      this.releaseCurrentPage().catch((error) => {
        console.error(`[Converter-${this.workerId.slice(0, 8)}] Failed to release page on stop:`, error);
      });
    }
  }

  /**
   * Release the current page back to PENDING state.
   */
  private async releaseCurrentPage(): Promise<void> {
    if (this.currentPageId === null) return;

    try {
      await prisma.taskDetail.update({
        where: { id: this.currentPageId },
        data: {
          status: PageStatus.PENDING,
          worker_id: null,
          started_at: null,
        },
      });
      console.log(`[Converter-${this.workerId.slice(0, 8)}] Released page ${this.currentPageId}`);
      this.currentPageId = null;
    } catch (error) {
      console.error(`[Converter-${this.workerId.slice(0, 8)}] Failed to release page ${this.currentPageId}:`, error);
    }
  }

  /**
   * Claim a PENDING page for processing using optimistic locking.
   *
   * Query conditions:
   * - task.status = PROCESSING
   * - task.status != CANCELLED
   * - page.status = PENDING
   * - page.worker_id = null
   *
   * Order: retry_count ASC, page ASC (prioritize fresh pages)
   */
  private async claimPage(): Promise<PageWithTask | null> {
    const maxAttempts = 3;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        // Step 1: Find a candidate page
        const candidate = await prisma.taskDetail.findFirst({
          where: {
            status: PageStatus.PENDING,
            worker_id: null,
          },
          orderBy: [
            { retry_count: 'asc' },
            { page: 'asc' },
          ],
        });

        if (!candidate) {
          return null;
        }

        // Step 2: Verify the parent task is in PROCESSING state and not CANCELLED
        const task = await prisma.task.findUnique({
          where: { id: candidate.task },
          select: { status: true },
        });

        if (!task || task.status !== TaskStatus.PROCESSING) {
          // Task not in correct state, try next
          continue;
        }

        // Step 3: Try to claim using optimistic locking
        const result = await prisma.taskDetail.updateMany({
          where: {
            id: candidate.id,
            status: PageStatus.PENDING,
            worker_id: null,
          },
          data: {
            status: PageStatus.PROCESSING,
            worker_id: this.workerId,
            started_at: new Date(),
          },
        });

        // Step 4: Check if we successfully claimed
        if (result.count === 1) {
          // Fetch the full record
          const claimed = await prisma.taskDetail.findUnique({
            where: { id: candidate.id },
          });
          return claimed as PageWithTask;
        }

        // Someone else claimed it, try again
      } catch (error) {
        console.error(`[Converter-${this.workerId.slice(0, 8)}] Claim attempt ${attempt + 1} failed:`, error);
      }
    }

    return null;
  }

  /**
   * Process a page with retry logic.
   */
  private async processPageWithRetry(page: PageWithTask): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        // Convert the page
        const result = await this.convertPage(page);

        // Success - update page and task
        await this.completePageSuccess(page, result);
        console.log(`[Converter-${this.workerId.slice(0, 8)}] Page ${page.page} of task ${page.task} completed (model: ${page.model})`);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorType = this.analyzeError(lastError);

        console.error(
          `[Converter-${this.workerId.slice(0, 8)}] Page ${page.page} attempt ${attempt + 1} failed (${errorType}, model: ${page.model}):`,
          lastError.message
        );

        // Check if error is retryable
        if (!this.isRetryableError(errorType)) {
          console.log(`[Converter-${this.workerId.slice(0, 8)}] Non-retryable error, marking as failed`);
          break;
        }

        // Check if we have retries left
        if (attempt < this.maxRetries) {
          // Increment retry count in database
          await this.incrementRetryCount(page.id);

          // Calculate delay and wait
          const delay = this.calculateRetryDelay(attempt, errorType);
          console.log(`[Converter-${this.workerId.slice(0, 8)}] Retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    // All retries exhausted or non-retryable error
    await this.completePageFailed(page, lastError!);
    console.log(`[Converter-${this.workerId.slice(0, 8)}] Page ${page.page} of task ${page.task} failed (model: ${page.model})`);
  }

  /**
   * Convert a page image to Markdown using LLM.
   */
  private async convertPage(page: PageWithTask): Promise<ConversionResult> {
    const startTime = Date.now();

    // Step 1: Get image path
    const imagePath = ImagePathUtil.getPath(page.task, page.page);

    // Step 2: Build message for LLM
    const messages = await modelLogic.transformImageMessage(imagePath);

    // Step 3: Call LLM (stream: false for accurate token counting)
    const response: CompletionResponse = await modelLogic.completion(page.provider, {
      model: page.model,
      messages,
      stream: false, // Critical: disabled for token tracking
    });

    // Step 4: Extract tokens (adapt to multiple providers)
    const inputTokens = this.extractInputTokens(response);
    const outputTokens = this.extractOutputTokens(response);

    // Step 5: Validate content
    if (!response.content || response.content.trim().length === 0) {
      throw new Error('LLM returned empty content');
    }

    // Step 6: Clean markdown content
    const markdown = this.cleanMarkdownContent(response.content);

    // Step 7: Check content length
    if (markdown.length > this.maxContentLength) {
      throw new Error(`Content exceeds maximum length: ${markdown.length} > ${this.maxContentLength}`);
    }

    const conversionTime = Date.now() - startTime;

    return {
      markdown,
      inputTokens,
      outputTokens,
      conversionTime,
    };
  }

  /**
   * Mark page as successfully completed and update task progress.
   */
  private async completePageSuccess(page: PageWithTask, result: ConversionResult): Promise<void> {
    const maxAttempts = 3;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        await prisma.$transaction(
          async (tx) => {
            // Step 1: Idempotency check - verify we still own this page
            const currentPage = await tx.taskDetail.findUnique({
              where: { id: page.id },
              select: { worker_id: true, status: true },
            });

            if (!currentPage || currentPage.worker_id !== this.workerId) {
              throw new Error('Page claimed by another worker');
            }

            if (currentPage.status === PageStatus.COMPLETED) {
              // Already completed, skip
              return;
            }

            // Step 2: Check task is not cancelled
            const task = await tx.task.findUnique({
              where: { id: page.task },
              select: { status: true, pages: true, completed_count: true, failed_count: true },
            });

            if (!task) {
              throw new Error('Task not found');
            }

            if (task.status === TaskStatus.CANCELLED) {
              throw new Error('Task has been cancelled');
            }

            // Step 3: Update page status
            await tx.taskDetail.update({
              where: { id: page.id },
              data: {
                status: PageStatus.COMPLETED,
                content: result.markdown,
                input_tokens: result.inputTokens,
                output_tokens: result.outputTokens,
                conversion_time: result.conversionTime,
                completed_at: new Date(),
                worker_id: null, // Release worker
                error: null,
              },
            });

            // Step 4: Atomically increment completed_count
            const updatedTask = await tx.task.update({
              where: { id: page.task },
              data: {
                completed_count: { increment: 1 },
              },
            });

            // Step 5: Check if task is complete
            const finishedCount = updatedTask.completed_count + task.failed_count;
            if (finishedCount >= task.pages) {
              // All pages finished
              const newStatus = task.failed_count > 0 ? TaskStatus.PARTIAL_FAILED : TaskStatus.READY_TO_MERGE;
              await tx.task.update({
                where: { id: page.task },
                data: {
                  status: newStatus,
                  worker_id: null,
                },
              });
            }

            // Step 6: Update progress
            const progress = Math.round((finishedCount / task.pages) * 100);
            await tx.task.update({
              where: { id: page.task },
              data: { progress },
            });
          },
          {
            isolationLevel: 'Serializable',
          }
        );

        // Success - emit events outside transaction
        this.emitProgressEvent(page.task);
        return;
      } catch (error: any) {
        if (error.code === 'P2034' && attempt < maxAttempts - 1) {
          // Transaction conflict, retry
          console.warn(`[Converter-${this.workerId.slice(0, 8)}] Transaction conflict, retrying...`);
          await this.sleep(100 * (attempt + 1));
          continue;
        }
        throw error;
      }
    }
  }

  /**
   * Mark page as failed and update task progress.
   */
  private async completePageFailed(page: PageWithTask, error: Error): Promise<void> {
    const maxAttempts = 3;
    const errorMessage = this.formatError(error);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        await prisma.$transaction(
          async (tx) => {
            // Step 1: Idempotency check
            const currentPage = await tx.taskDetail.findUnique({
              where: { id: page.id },
              select: { worker_id: true, status: true },
            });

            if (!currentPage || currentPage.worker_id !== this.workerId) {
              throw new Error('Page claimed by another worker');
            }

            if (currentPage.status === PageStatus.FAILED) {
              // Already failed, skip
              return;
            }

            // Step 2: Check task is not cancelled
            const task = await tx.task.findUnique({
              where: { id: page.task },
              select: { status: true, pages: true, completed_count: true, failed_count: true },
            });

            if (!task) {
              throw new Error('Task not found');
            }

            if (task.status === TaskStatus.CANCELLED) {
              throw new Error('Task has been cancelled');
            }

            // Step 3: Update page status
            await tx.taskDetail.update({
              where: { id: page.id },
              data: {
                status: PageStatus.FAILED,
                error: errorMessage,
                completed_at: new Date(),
                worker_id: null, // Release worker
              },
            });

            // Step 4: Atomically increment failed_count
            const updatedTask = await tx.task.update({
              where: { id: page.task },
              data: {
                failed_count: { increment: 1 },
              },
            });

            // Step 5: Check if task is complete
            const finishedCount = task.completed_count + updatedTask.failed_count;
            if (finishedCount >= task.pages) {
              // All pages finished
              const newStatus = TaskStatus.PARTIAL_FAILED;
              await tx.task.update({
                where: { id: page.task },
                data: {
                  status: newStatus,
                  worker_id: null,
                },
              });
            }

            // Step 6: Update progress
            const progress = Math.round((finishedCount / task.pages) * 100);
            await tx.task.update({
              where: { id: page.task },
              data: { progress },
            });
          },
          {
            isolationLevel: 'Serializable',
          }
        );

        // Success - emit events outside transaction
        this.emitProgressEvent(page.task);
        return;
      } catch (error: any) {
        if (error.code === 'P2034' && attempt < maxAttempts - 1) {
          // Transaction conflict, retry
          console.warn(`[Converter-${this.workerId.slice(0, 8)}] Transaction conflict, retrying...`);
          await this.sleep(100 * (attempt + 1));
          continue;
        }
        throw error;
      }
    }
  }

  /**
   * Increment retry count for a page.
   */
  private async incrementRetryCount(pageId: number): Promise<void> {
    await prisma.taskDetail.update({
      where: { id: pageId },
      data: {
        retry_count: { increment: 1 },
      },
    });
  }

  /**
   * Emit task progress event.
   */
  private emitProgressEvent(taskId: string): void {
    // Fetch updated task and emit event
    prisma.task
      .findUnique({
        where: { id: taskId },
      })
      .then((task) => {
        if (task) {
          eventBus.emitTaskEvent(TaskEventType.TASK_UPDATED, {
            taskId,
            task,
            timestamp: Date.now(),
          });

          eventBus.emitTaskEvent(TaskEventType.TASK_PROGRESS_CHANGED, {
            taskId,
            task: { progress: task.progress },
            timestamp: Date.now(),
          });

          // Emit status change if task completed
          if (
            task.status === TaskStatus.READY_TO_MERGE ||
            task.status === TaskStatus.PARTIAL_FAILED
          ) {
            eventBus.emitTaskEvent(TaskEventType.TASK_STATUS_CHANGED, {
              taskId,
              task: { status: task.status },
              timestamp: Date.now(),
            });
          }
        }
      })
      .catch((error) => {
        console.error(`[Converter-${this.workerId.slice(0, 8)}] Failed to emit progress event:`, error);
      });
  }

  /**
   * Extract input tokens from LLM response.
   * Adapts to different provider response formats.
   */
  private extractInputTokens(response: CompletionResponse): number {
    const raw = response.rawResponse;
    if (!raw) return 0;

    // OpenAI format
    if (raw.usage?.prompt_tokens !== undefined) {
      return raw.usage.prompt_tokens;
    }

    // Anthropic format
    if (raw.usage?.input_tokens !== undefined) {
      return raw.usage.input_tokens;
    }

    // Gemini format
    if (raw.usageMetadata?.promptTokenCount !== undefined) {
      return raw.usageMetadata.promptTokenCount;
    }

    return 0;
  }

  /**
   * Extract output tokens from LLM response.
   * Adapts to different provider response formats.
   */
  private extractOutputTokens(response: CompletionResponse): number {
    const raw = response.rawResponse;
    if (!raw) return 0;

    // OpenAI format
    if (raw.usage?.completion_tokens !== undefined) {
      return raw.usage.completion_tokens;
    }

    // Anthropic format
    if (raw.usage?.output_tokens !== undefined) {
      return raw.usage.output_tokens;
    }

    // Gemini format
    if (raw.usageMetadata?.candidatesTokenCount !== undefined) {
      return raw.usageMetadata.candidatesTokenCount;
    }

    return 0;
  }

  /**
   * Clean markdown content by removing code block markers.
   */
  private cleanMarkdownContent(content: string): string {
    let cleaned = content.trim();

    // Remove ```markdown at the start
    if (cleaned.startsWith('```markdown')) {
      cleaned = cleaned.slice('```markdown'.length);
    } else if (cleaned.startsWith('```md')) {
      cleaned = cleaned.slice('```md'.length);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.slice('```'.length);
    }

    // Remove ``` at the end
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }

    return cleaned.trim();
  }

  /**
   * Format error message for storage (truncate to 500 chars).
   */
  private formatError(error: Error): string {
    const message = error.message || String(error);
    if (message.length > 500) {
      return message.slice(0, 497) + '...';
    }
    return message;
  }

  /**
   * Analyze error to determine type.
   */
  private analyzeError(error: Error): ErrorType {
    const message = error.message.toLowerCase();

    // Network errors
    if (
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('etimedout') ||
      message.includes('fetch failed') ||
      message.includes('socket hang up')
    ) {
      return ErrorType.NETWORK_ERROR;
    }

    // Rate limit errors
    if (
      message.includes('rate limit') ||
      message.includes('rate_limit') ||
      message.includes('too many requests') ||
      message.includes('429')
    ) {
      return ErrorType.RATE_LIMIT_ERROR;
    }

    // Quota exceeded
    if (
      message.includes('quota') ||
      message.includes('insufficient_quota') ||
      message.includes('billing')
    ) {
      return ErrorType.QUOTA_EXCEEDED_ERROR;
    }

    // Config errors (API key, model not found, etc.)
    if (
      message.includes('api key') ||
      message.includes('apikey') ||
      message.includes('invalid_api_key') ||
      message.includes('unauthorized') ||
      message.includes('authentication') ||
      message.includes('model not found') ||
      message.includes('not exist')
    ) {
      return ErrorType.CONFIG_ERROR;
    }

    // File errors
    if (
      message.includes('enoent') ||
      message.includes('file not found') ||
      message.includes('no such file')
    ) {
      return ErrorType.FILE_ERROR;
    }

    // Timeout errors
    if (message.includes('timeout') || message.includes('timed out')) {
      return ErrorType.TIMEOUT_ERROR;
    }

    // LLM specific errors
    if (
      message.includes('llm') ||
      message.includes('api') ||
      message.includes('openai') ||
      message.includes('anthropic') ||
      message.includes('gemini')
    ) {
      return ErrorType.LLM_ERROR;
    }

    return ErrorType.UNKNOWN_ERROR;
  }

  /**
   * Determine if an error type is retryable.
   */
  private isRetryableError(errorType: ErrorType): boolean {
    switch (errorType) {
      case ErrorType.NETWORK_ERROR:
      case ErrorType.LLM_ERROR:
      case ErrorType.RATE_LIMIT_ERROR:
      case ErrorType.TIMEOUT_ERROR:
      case ErrorType.UNKNOWN_ERROR:
        return true;

      case ErrorType.QUOTA_EXCEEDED_ERROR:
      case ErrorType.CONFIG_ERROR:
      case ErrorType.FILE_ERROR:
        return false;

      default:
        return false;
    }
  }

  /**
   * Calculate retry delay with exponential backoff and jitter.
   */
  private calculateRetryDelay(attempt: number, errorType: ErrorType): number {
    // Base delay with exponential backoff
    let delay = this.retryDelayBase * Math.pow(2, attempt);

    // Extra delay for rate limit errors
    if (errorType === ErrorType.RATE_LIMIT_ERROR) {
      delay *= 2;
    }

    // Add jitter (0-25% of delay)
    const jitter = Math.random() * delay * 0.25;
    delay += jitter;

    // Cap at 30 seconds
    return Math.min(delay, 30000);
  }
}
