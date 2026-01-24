import { randomUUID } from 'crypto';
import { prisma } from '../db/index.js';
import { Task, TaskStatus } from '../../shared/types/index.js';
import { eventBus, TaskEventType } from '../events/EventBus.js';

/**
 * Abstract base class for all workers.
 *
 * Provides common functionality:
 * - Unique worker identification
 * - Atomic task claiming via Prisma transactions
 * - Status updates and error handling
 * - Graceful shutdown support
 *
 * Subclasses must implement the run() method.
 */
export abstract class WorkerBase {
  /** Unique worker identifier */
  protected readonly workerId: string;

  /** Flag to control worker execution */
  protected isRunning: boolean = false;

  constructor() {
    this.workerId = randomUUID();
  }

  /**
   * Main worker loop.
   * Must be implemented by subclasses.
   *
   * This method should:
   * 1. Claim a task using claimTask()
   * 2. Process the task
   * 3. Update status using updateTaskStatus() or handleError()
   * 4. Sleep if no tasks available
   * 5. Check isRunning flag to support graceful shutdown
   */
  abstract run(): Promise<void>;

  /**
   * Stop the worker gracefully.
   * Sets isRunning flag to false, causing run() loop to exit.
   */
  stop(): void {
    this.isRunning = false;
    console.log(`[Worker-${this.workerId}] Stopping...`);
  }

  /**
   * Atomically claim a task for processing.
   *
   * Uses Prisma transaction to ensure only one worker claims a task.
   * The transaction:
   * 1. Finds first available task matching fromStatus
   * 2. Updates it to toStatus with this worker's ID
   * 3. Returns the claimed task or null if none available
   *
   * @param fromStatus - Source status to claim from
   * @param toStatus - Target status to set
   * @returns Claimed task or null if no tasks available
   */
  protected async claimTask(fromStatus: TaskStatus, toStatus: TaskStatus): Promise<Task | null> {
    try {
      const claimed = await prisma.$transaction(async (tx) => {
        // Find first available task
        const task = await tx.task.findFirst({
          where: {
            status: fromStatus,
            worker_id: null,
          },
          orderBy: {
            createdAt: 'asc', // FIFO order
          },
        });

        if (!task) {
          return null;
        }

        // Claim the task
        const updated = await tx.task.update({
          where: {
            id: task.id,
          },
          data: {
            status: toStatus,
            worker_id: this.workerId,
            updatedAt: new Date(),
          },
        });

        return updated as Task;
      });

      // 发射任务事件（在事务成功后）
      if (claimed) {
        eventBus.emitTaskEvent(TaskEventType.TASK_UPDATED, {
          taskId: claimed.id!,
          task: claimed,
          timestamp: Date.now(),
        });

        eventBus.emitTaskEvent(TaskEventType.TASK_STATUS_CHANGED, {
          taskId: claimed.id!,
          task: { status: toStatus },
          timestamp: Date.now(),
        });
      }

      return claimed;
    } catch (error) {
      console.error(`[Worker-${this.workerId}] Failed to claim task:`, error);
      return null;
    }
  }

  /**
   * Update task status.
   *
   * @param taskId - Task ID to update
   * @param status - New status
   * @param data - Optional additional data to update
   */
  protected async updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    data?: Partial<Task>
  ): Promise<void> {
    try {
      const updated = await prisma.task.update({
        where: {
          id: taskId,
        },
        data: {
          status,
          ...data,
          updatedAt: new Date(),
        },
      });

      // 发射任务更新事件
      eventBus.emitTaskEvent(TaskEventType.TASK_UPDATED, {
        taskId,
        task: updated,
        timestamp: Date.now(),
      });

      // 如果状态变化，额外发射状态变化事件
      if (status !== undefined) {
        eventBus.emitTaskEvent(TaskEventType.TASK_STATUS_CHANGED, {
          taskId,
          task: { status },
          timestamp: Date.now(),
        });
      }

      // 如果进度变化，发射进度变化事件
      if (data?.progress !== undefined) {
        eventBus.emitTaskEvent(TaskEventType.TASK_PROGRESS_CHANGED, {
          taskId,
          task: { progress: data.progress },
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      console.error(`[Worker-${this.workerId}] Failed to update task ${taskId}:`, error);
      throw error;
    }
  }

  /**
   * Handle task error.
   * Sets task status to FAILED and stores error message.
   *
   * @param taskId - Task ID
   * @param error - Error object or message
   */
  protected async handleError(taskId: string, error: unknown): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error(`[Worker-${this.workerId}] Task ${taskId} failed:`, errorMessage);

    try {
      const updated = await prisma.task.update({
        where: {
          id: taskId,
        },
        data: {
          status: TaskStatus.FAILED,
          error: errorMessage,
          worker_id: null, // Release worker
          updatedAt: new Date(),
        },
      });

      // 发射任务更新事件
      eventBus.emitTaskEvent(TaskEventType.TASK_UPDATED, {
        taskId,
        task: updated,
        timestamp: Date.now(),
      });

      eventBus.emitTaskEvent(TaskEventType.TASK_STATUS_CHANGED, {
        taskId,
        task: { status: TaskStatus.FAILED },
        timestamp: Date.now(),
      });
    } catch (updateError) {
      console.error(
        `[Worker-${this.workerId}] Failed to update task ${taskId} error state:`,
        updateError
      );
    }
  }

  /**
   * Sleep for the specified duration.
   *
   * @param ms - Milliseconds to sleep
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get worker ID.
   */
  getWorkerId(): string {
    return this.workerId;
  }

  /**
   * Check if worker is running.
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }
}
