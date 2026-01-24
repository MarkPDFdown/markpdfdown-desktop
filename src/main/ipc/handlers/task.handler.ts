import { ipcMain } from "electron";
import { v4 as uuidv4 } from "uuid";
import taskRepository from "../../../core/domain/repositories/TaskRepository.js";
import fileLogic from "../../../core/infrastructure/services/FileService.js";
import { eventBus, TaskEventType } from '../../../core/shared/events/EventBus.js';
import { prisma } from '../../../core/infrastructure/db/index.js';
import { TaskStatus } from '../../../shared/types/TaskStatus.js';
import { IPC_CHANNELS } from "../../../shared/ipc/channels.js";
import type { IpcResponse } from "../../../shared/ipc/responses.js";

/**
 * Register all task-related IPC handlers
 */
export function registerTaskHandlers() {
  /**
   * Create tasks (batch)
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK.CREATE,
    async (_, tasks: any[]): Promise<IpcResponse> => {
      try {
        if (!Array.isArray(tasks) || tasks.length === 0) {
          return { success: false, error: "Task list cannot be empty" };
        }

        // Generate UUID for each task
        const tasksWithId = tasks.map((task) => ({
          ...task,
          id: uuidv4(),
          progress: 0,
          status: -1, // CREATED - waiting for file upload
        }));

        const createdTasks = await taskRepository.createTasks(tasksWithId);
        return { success: true, data: createdTasks };
      } catch (error: any) {
        console.error("[IPC] task:create error:", error);
        return { success: false, error: error.message };
      }
    }
  );

  /**
   * Get all tasks (paginated)
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK.GET_ALL,
    async (
      _,
      params: { page: number; pageSize: number }
    ): Promise<IpcResponse> => {
      try {
        const { page = 1, pageSize = 10 } = params || {};

        const tasks = await taskRepository.findAll(page, pageSize);
        const total = await taskRepository.getTotal();

        return { success: true, data: { list: tasks, total } };
      } catch (error: any) {
        console.error("[IPC] task:getAll error:", error);
        return { success: false, error: error.message };
      }
    }
  );

  /**
   * Get task by ID
   */
  ipcMain.handle(IPC_CHANNELS.TASK.GET_BY_ID, async (_, id: string): Promise<IpcResponse> => {
    try {
      if (!id) {
        return { success: false, error: "Task ID is required" };
      }

      const task = await taskRepository.findById(id);

      if (!task) {
        return { success: false, error: "Task not found" };
      }

      return { success: true, data: task };
    } catch (error: any) {
      console.error("[IPC] task:getById error:", error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Update task
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK.UPDATE,
    async (_, id: string, data: any): Promise<IpcResponse> => {
      try {
        const updatedTask = await taskRepository.update(id, data);

        // Emit task update event
        eventBus.emitTaskEvent(TaskEventType.TASK_UPDATED, {
          taskId: id,
          task: updatedTask,
          timestamp: Date.now(),
        });

        // If status changed, also emit status change event
        if (data.status !== undefined) {
          eventBus.emitTaskEvent(TaskEventType.TASK_STATUS_CHANGED, {
            taskId: id,
            task: { status: data.status },
            timestamp: Date.now(),
          });
        }

        return { success: true, data: updatedTask };
      } catch (error: any) {
        console.error("[IPC] task:update error:", error);
        return { success: false, error: error.message };
      }
    }
  );

  /**
   * Delete task
   */
  ipcMain.handle(IPC_CHANNELS.TASK.DELETE, async (_, id: string): Promise<IpcResponse> => {
    try {
      // Delete task files
      await fileLogic.deleteTaskFiles(id);

      // Delete task record
      const deletedTask = await taskRepository.remove(id);

      // Emit task delete event
      eventBus.emitTaskEvent(TaskEventType.TASK_DELETED, {
        taskId: id,
        timestamp: Date.now(),
      });

      return { success: true, data: deletedTask };
    } catch (error: any) {
      console.error("[IPC] task:delete error:", error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Check if there are running tasks
   */
  ipcMain.handle(IPC_CHANNELS.TASK.HAS_RUNNING, async (): Promise<IpcResponse> => {
    try {
      const runningStatuses = [
        TaskStatus.PENDING,
        TaskStatus.SPLITTING,
        TaskStatus.PROCESSING,
        TaskStatus.READY_TO_MERGE,
        TaskStatus.MERGING,
      ];

      const count = await prisma.task.count({
        where: {
          status: {
            in: runningStatuses,
          },
        },
      });

      return { success: true, data: { hasRunning: count > 0, count } };
    } catch (error: any) {
      console.error("[IPC] task:hasRunningTasks error:", error);
      return { success: false, error: error.message };
    }
  });

  console.log("[IPC] Task handlers registered");
}
