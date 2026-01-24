import { WorkerBase } from './WorkerBase.js';
import { Task, TaskStatus, PageStatus } from '../../../shared/types/index.js';
import { SplitterFactory } from '../../domain/split/index.js';
import { WORKER_CONFIG } from '../../infrastructure/config/worker.config.js';
import { prisma } from '../../infrastructure/db/index.js';
import type { SplitResult } from '../../domain/split/ISplitter.js';
import { eventBus, TaskEventType } from '../../shared/events/EventBus.js';

/**
 * Worker for splitting PDF/image files into individual pages.
 *
 * Workflow:
 * 1. Claim PENDING task → SPLITTING
 * 2. Create appropriate splitter (PDF/Image) via factory
 * 3. Execute split operation to generate page images
 * 4. Create TaskDetail records for each page
 * 5. Update task status to PROCESSING
 *
 * Only ONE instance should run to avoid resource contention.
 */
export class SplitterWorker extends WorkerBase {
  private readonly factory: SplitterFactory;
  private readonly pollInterval: number;

  constructor(uploadsDir: string) {
    super();
    this.factory = new SplitterFactory(uploadsDir);
    this.pollInterval = WORKER_CONFIG.splitter.pollInterval;
  }

  /**
   * Main worker loop.
   * Continuously polls for PENDING tasks and processes them.
   */
  async run(): Promise<void> {
    this.isRunning = true;
    console.log(`[Splitter-${this.workerId}] Started. Poll interval: ${this.pollInterval}ms`);

    while (this.isRunning) {
      try {
        // Claim a PENDING task
        const task = await this.claimTask(TaskStatus.PENDING, TaskStatus.SPLITTING);

        if (task) {
          console.log(`[Splitter-${this.workerId}] Processing task ${task.id}: ${task.filename}`);
          await this.splitTask(task);
        } else {
          // No tasks available, sleep before next poll
          await this.sleep(this.pollInterval);
        }
      } catch (error) {
        console.error(`[Splitter-${this.workerId}] Unexpected error in main loop:`, error);
        // Continue running even if one iteration fails
        await this.sleep(this.pollInterval);
      }
    }

    console.log(`[Splitter-${this.workerId}] Stopped.`);
  }

  /**
   * Split a single task.
   *
   * @param task - Task to process
   */
  private async splitTask(task: Task): Promise<void> {
    if (!task.id || !task.filename) {
      await this.handleError(task.id!, new Error('Task missing required fields'));
      return;
    }

    try {
      // Step 1: Create appropriate splitter based on file type
      const splitter = this.factory.createFromFilename(task.filename);

      // Step 2: Execute split operation
      console.log(`[Splitter-${this.workerId}] Splitting ${task.filename}...`);
      const result = await splitter.split(task);

      console.log(
        `[Splitter-${this.workerId}] Split complete: ${result.totalPages} pages generated`
      );

      // Step 3: Create TaskDetail records and update Task status
      await this.createTaskDetails(task, result);

      console.log(`[Splitter-${this.workerId}] Task ${task.id} completed successfully`);
    } catch (error) {
      console.error(`[Splitter-${this.workerId}] Failed to split task ${task.id}:`, error);
      await this.handleError(task.id, error);

      // Attempt cleanup on error
      try {
        const splitter = this.factory.createFromFilename(task.filename);
        await splitter.cleanup(task.id);
      } catch (cleanupError) {
        console.warn(`[Splitter-${this.workerId}] Cleanup failed for task ${task.id}:`, cleanupError);
      }
    }
  }

  /**
   * Create TaskDetail records and update Task status atomically.
   *
   * Uses a Prisma transaction to ensure:
   * 1. All TaskDetail records are created
   * 2. Task status is updated to PROCESSING
   * 3. Task.pages is set to total page count
   * 4. worker_id is released (set to null)
   *
   * @param task - Task being processed
   * @param result - Split result with page information
   */
  private async createTaskDetails(task: Task, result: SplitResult): Promise<void> {
    const taskId = task.id!;

    try {
      const updated = await prisma.$transaction(async (tx) => {
        // Step 1: Batch create TaskDetail records
        const taskDetails = result.pages.map((pageInfo) => ({
          task: taskId,
          page: pageInfo.page,
          page_source: pageInfo.pageSource,
          status: PageStatus.PENDING, // Ready for converter workers
          worker_id: null,
          provider: task.provider!,
          model: task.model!,
          content: '',
          retry_count: 0,
        }));

        await tx.taskDetail.createMany({
          data: taskDetails,
        });

        // Step 2: Update Task status and metadata
        const updatedTask = await tx.task.update({
          where: {
            id: taskId,
          },
          data: {
            status: TaskStatus.PROCESSING, // Ready for converter workers
            pages: result.totalPages,
            worker_id: null, // Release this worker
            updatedAt: new Date(),
          },
        });

        return updatedTask;
      });

      // 发射任务事件（在事务成功后）
      eventBus.emitTaskEvent(TaskEventType.TASK_UPDATED, {
        taskId,
        task: updated,
        timestamp: Date.now(),
      });

      eventBus.emitTaskEvent(TaskEventType.TASK_STATUS_CHANGED, {
        taskId,
        task: { status: TaskStatus.PROCESSING },
        timestamp: Date.now(),
      });

      console.log(
        `[Splitter-${this.workerId}] Created ${result.totalPages} TaskDetail records for task ${taskId}`
      );
    } catch (error) {
      console.error(
        `[Splitter-${this.workerId}] Failed to create TaskDetail records for task ${taskId}:`,
        error
      );
      throw error;
    }
  }
}
