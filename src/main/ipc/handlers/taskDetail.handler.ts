import { ipcMain } from "electron";
import fs from "fs";
import taskDetailRepository from "../../../core/repositories/TaskDetailRepository.js";
import { ImagePathUtil } from "../../../core/logic/split/ImagePathUtil.js";
import { eventBus, TaskEventType } from '../../../core/events/EventBus.js';
import { prisma } from '../../../core/db/index.js';
import { TaskStatus } from '../../../shared/types/TaskStatus.js';
import { PageStatus } from '../../../shared/types/PageStatus.js';
import { IPC_CHANNELS } from "../../../shared/ipc/channels.js";
import type { IpcResponse } from "../../../shared/ipc/responses.js";

/**
 * Register all task detail-related IPC handlers
 */
export function registerTaskDetailHandlers() {
  /**
   * Get task detail by page
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_DETAIL.GET_BY_PAGE,
    async (_, taskId: string, page: number): Promise<IpcResponse> => {
      try {
        if (!taskId) {
          return { success: false, error: "Task ID is required" };
        }

        if (!page || page < 1) {
          return { success: false, error: "Page number must be greater than 0" };
        }

        const taskDetail = await taskDetailRepository.findByTaskAndPage(taskId, page);

        if (!taskDetail) {
          return { success: false, error: "Page detail not found" };
        }

        // Get image path
        const imagePath = ImagePathUtil.getPath(taskId, page);
        const imageExists = fs.existsSync(imagePath);

        // Return detail with image info
        const taskDetailWithImage = {
          ...taskDetail,
          imagePath,
          imageExists,
        };

        return { success: true, data: taskDetailWithImage };
      } catch (error: any) {
        console.error("[IPC] taskDetail:getByPage error:", error);
        return { success: false, error: error.message };
      }
    }
  );

  /**
   * Get all task details by task
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_DETAIL.GET_ALL_BY_TASK,
    async (_, taskId: string): Promise<IpcResponse> => {
      try {
        if (!taskId) {
          return { success: false, error: "Task ID is required" };
        }

        const taskDetails = await taskDetailRepository.findByTaskId(taskId);

        return { success: true, data: taskDetails };
      } catch (error: any) {
        console.error("[IPC] taskDetail:getAllByTask error:", error);
        return { success: false, error: error.message };
      }
    }
  );

  /**
   * Retry single page
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_DETAIL.RETRY,
    async (_, pageId: number): Promise<IpcResponse> => {
      try {
        if (!pageId) {
          return { success: false, error: "Page ID is required" };
        }

        const result = await prisma.$transaction(async (tx) => {
          // Step 1: Find the page
          const page = await tx.taskDetail.findUnique({
            where: { id: pageId },
          });

          if (!page) {
            throw new Error("Page not found");
          }

          // Step 2: Check page status must be FAILED or COMPLETED
          if (page.status !== PageStatus.FAILED && page.status !== PageStatus.COMPLETED) {
            throw new Error("Can only retry failed or completed pages");
          }

          // Step 3: Check task status
          const task = await tx.task.findUnique({
            where: { id: page.task },
          });

          if (!task) {
            throw new Error("Task not found");
          }

          if (task.status === TaskStatus.CANCELLED) {
            throw new Error("Task is cancelled, cannot retry");
          }

          // Step 4: Update page status
          const updatedPage = await tx.taskDetail.update({
            where: { id: pageId },
            data: {
              status: PageStatus.PENDING,
              retry_count: 0,
              error: null,
              worker_id: null,
              started_at: null,
              completed_at: null,
              input_tokens: 0,
              output_tokens: 0,
              conversion_time: 0,
              content: "",
            },
          });

          // Step 5: Update task counters and status
          const decrementField = page.status === PageStatus.FAILED ? 'failed_count' : 'completed_count';
          const updatedTask = await tx.task.update({
            where: { id: page.task },
            data: {
              [decrementField]: { decrement: 1 },
              status: TaskStatus.PROCESSING,
              progress: Math.max(0, task.progress - Math.round(100 / task.pages)),
            },
          });

          return { page: updatedPage, task: updatedTask };
        }, {
          isolationLevel: 'Serializable',
        });

        // Emit task update events
        eventBus.emitTaskEvent(TaskEventType.TASK_UPDATED, {
          taskId: result.task.id,
          task: result.task,
          timestamp: Date.now(),
        });

        eventBus.emitTaskEvent(TaskEventType.TASK_STATUS_CHANGED, {
          taskId: result.task.id,
          task: { status: result.task.status },
          timestamp: Date.now(),
        });

        return { success: true, data: result.page };
      } catch (error: any) {
        console.error("[IPC] taskDetail:retry error:", error);
        return { success: false, error: error.message };
      }
    }
  );

  /**
   * Retry all failed pages
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_DETAIL.RETRY_FAILED,
    async (_, taskId: string): Promise<IpcResponse> => {
      try {
        if (!taskId) {
          return { success: false, error: "Task ID is required" };
        }

        const result = await prisma.$transaction(async (tx) => {
          // Step 1: Check task exists and status is valid
          const task = await tx.task.findUnique({
            where: { id: taskId },
          });

          if (!task) {
            throw new Error("Task not found");
          }

          if (task.status === TaskStatus.CANCELLED) {
            throw new Error("Task is cancelled, cannot retry");
          }

          // Step 2: Count failed pages
          const failedCount = await tx.taskDetail.count({
            where: {
              task: taskId,
              status: PageStatus.FAILED,
            },
          });

          if (failedCount === 0) {
            throw new Error("No failed pages to retry");
          }

          // Step 3: Update all failed pages
          await tx.taskDetail.updateMany({
            where: {
              task: taskId,
              status: PageStatus.FAILED,
            },
            data: {
              status: PageStatus.PENDING,
              retry_count: 0,
              error: null,
              worker_id: null,
              started_at: null,
              completed_at: null,
              input_tokens: 0,
              output_tokens: 0,
              conversion_time: 0,
              content: "",
            },
          });

          // Step 4: Update task
          const updatedTask = await tx.task.update({
            where: { id: taskId },
            data: {
              failed_count: 0,
              status: TaskStatus.PROCESSING,
              progress: Math.round((task.completed_count / task.pages) * 100),
            },
          });

          return { updatedCount: failedCount, task: updatedTask };
        }, {
          isolationLevel: 'Serializable',
        });

        // Emit task update events
        eventBus.emitTaskEvent(TaskEventType.TASK_UPDATED, {
          taskId: result.task.id,
          task: result.task,
          timestamp: Date.now(),
        });

        eventBus.emitTaskEvent(TaskEventType.TASK_STATUS_CHANGED, {
          taskId: result.task.id,
          task: { status: result.task.status },
          timestamp: Date.now(),
        });

        return { success: true, data: { retried: result.updatedCount } };
      } catch (error: any) {
        console.error("[IPC] taskDetail:retryFailed error:", error);
        return { success: false, error: error.message };
      }
    }
  );

  /**
   * Get task cost statistics
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_DETAIL.GET_COST_STATS,
    async (_, taskId: string): Promise<IpcResponse> => {
      try {
        if (!taskId) {
          return { success: false, error: "Task ID is required" };
        }

        // Get aggregated stats
        const aggregate = await prisma.taskDetail.aggregate({
          where: { task: taskId },
          _sum: {
            input_tokens: true,
            output_tokens: true,
            conversion_time: true,
          },
          _avg: {
            conversion_time: true,
          },
          _count: {
            id: true,
          },
        });

        // Get stats by status
        const byStatus = await prisma.taskDetail.groupBy({
          by: ['status'],
          where: { task: taskId },
          _count: {
            id: true,
          },
          _sum: {
            input_tokens: true,
            output_tokens: true,
          },
        });

        // Format result
        const statusMap: Record<number, string> = {
          [-1]: 'failed',
          [0]: 'pending',
          [1]: 'processing',
          [2]: 'completed',
          [3]: 'retrying',
        };

        const byStatusFormatted = byStatus.reduce((acc, item) => {
          const statusName = statusMap[item.status] || `status_${item.status}`;
          acc[statusName] = {
            count: item._count.id,
            input_tokens: item._sum.input_tokens || 0,
            output_tokens: item._sum.output_tokens || 0,
          };
          return acc;
        }, {} as Record<string, { count: number; input_tokens: number; output_tokens: number }>);

        return {
          success: true,
          data: {
            total: {
              pages: aggregate._count.id,
              input_tokens: aggregate._sum.input_tokens || 0,
              output_tokens: aggregate._sum.output_tokens || 0,
              total_tokens: (aggregate._sum.input_tokens || 0) + (aggregate._sum.output_tokens || 0),
              total_conversion_time: aggregate._sum.conversion_time || 0,
              avg_conversion_time: Math.round(aggregate._avg.conversion_time || 0),
            },
            byStatus: byStatusFormatted,
          },
        };
      } catch (error: any) {
        console.error("[IPC] taskDetail:getCostStats error:", error);
        return { success: false, error: error.message };
      }
    }
  );

  console.log("[IPC] TaskDetail handlers registered");
}
