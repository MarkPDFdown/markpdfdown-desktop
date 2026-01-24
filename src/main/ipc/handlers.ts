import { ipcMain, dialog } from "electron";
import providerDal from "../../server/dal/ProviderDal.js";
import modelDal from "../../server/dal/ModelDal.js";
import taskDal from "../../server/dal/TaskDal.js";
import taskDetailDal from "../../server/dal/TaskDetailDal.js";
import fileLogic from "../../server/logic/File.js";
import modelLogic from "../../server/logic/Model.js";
import { ImagePathUtil } from "../../server/logic/split/ImagePathUtil.js";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { eventBus, TaskEventType } from '../../server/events/EventBus.js';
import { prisma } from '../../server/db/index.js';
import { TaskStatus } from '../../server/types/TaskStatus.js';
import { PageStatus } from '../../server/types/PageStatus.js';

// IPC Response 类型
interface IpcResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * 注册所有 IPC handlers
 */
export function registerIpcHandlers() {
  // ==================== Provider Handlers ====================

  /**
   * 获取所有服务商
   */
  ipcMain.handle("provider:getAll", async (): Promise<IpcResponse> => {
    try {
      const providers = await providerDal.findAll();
      return { success: true, data: providers };
    } catch (error: any) {
      console.error("[IPC] provider:getAll error:", error);
      return { success: false, error: error.message };
    }
  });

  /**
   * 根据 ID 获取服务商
   */
  ipcMain.handle(
    "provider:getById",
    async (_, id: number): Promise<IpcResponse> => {
      try {
        const provider = await providerDal.findById(id);

        if (!provider) {
          return { success: false, error: "服务商不存在" };
        }

        return { success: true, data: provider };
      } catch (error: any) {
        console.error("[IPC] provider:getById error:", error);
        return { success: false, error: error.message };
      }
    }
  );

  /**
   * 创建服务商
   */
  ipcMain.handle(
    "provider:create",
    async (_, data: any): Promise<IpcResponse> => {
      try {
        const { name, type } = data;

        if (!name || !type) {
          return { success: false, error: "名称和协议类型为必填项" };
        }

        const newProvider = await providerDal.create({
          name,
          type,
          api_key: "",
          base_url: "",
          suffix: "",
          status: 0,
        });

        return { success: true, data: newProvider };
      } catch (error: any) {
        console.error("[IPC] provider:create error:", error);
        return { success: false, error: error.message };
      }
    }
  );

  /**
   * 更新服务商
   */
  ipcMain.handle(
    "provider:update",
    async (_, id: number, data: any): Promise<IpcResponse> => {
      try {
        const existingProvider = await providerDal.findById(id);
        if (!existingProvider) {
          return { success: false, error: "服务商不存在" };
        }

        const updateData: any = {};
        if (data.api_key !== undefined) updateData.api_key = data.api_key;
        if (data.base_url !== undefined) updateData.base_url = data.base_url;
        if (data.suffix !== undefined) updateData.suffix = data.suffix;

        const updatedProvider = await providerDal.update(id, updateData);
        return { success: true, data: updatedProvider };
      } catch (error: any) {
        console.error("[IPC] provider:update error:", error);
        return { success: false, error: error.message };
      }
    }
  );

  /**
   * 删除服务商
   */
  ipcMain.handle(
    "provider:delete",
    async (_, id: number): Promise<IpcResponse> => {
      try {
        const existingProvider = await providerDal.findById(id);
        if (!existingProvider) {
          return { success: false, error: "服务商不存在" };
        }

        await providerDal.remove(id);
        return { success: true };
      } catch (error: any) {
        console.error("[IPC] provider:delete error:", error);
        return { success: false, error: error.message };
      }
    }
  );

  /**
   * 更新服务商状态
   */
  ipcMain.handle(
    "provider:updateStatus",
    async (_, id: number, status: number): Promise<IpcResponse> => {
      try {
        if (status === undefined) {
          return { success: false, error: "状态值不合法" };
        }

        const existingProvider = await providerDal.findById(id);
        if (!existingProvider) {
          return { success: false, error: "服务商不存在" };
        }

        const updatedProvider = await providerDal.updateStatus(id, status);
        return { success: true, data: updatedProvider };
      } catch (error: any) {
        console.error("[IPC] provider:updateStatus error:", error);
        return { success: false, error: error.message };
      }
    }
  );

  // ==================== Model Handlers ====================

  /**
   * 获取所有模型（按服务商分组）
   */
  ipcMain.handle("model:getAll", async (): Promise<IpcResponse> => {
    try {
      const providers = await providerDal.findAll();
      const models = await modelDal.findAll();

      const groupedModels = providers.map((provider: any) => ({
        provider: provider.id,
        providerName: provider.name,
        models: models.filter((model: any) => model.provider === provider.id),
      }));

      return { success: true, data: groupedModels };
    } catch (error: any) {
      console.error("[IPC] model:getAll error:", error);
      return { success: false, error: error.message };
    }
  });

  /**
   * 获取指定服务商的模型
   */
  ipcMain.handle(
    "model:getByProvider",
    async (_, providerId: number): Promise<IpcResponse> => {
      try {
        const models = await modelDal.findByProviderId(providerId);
        return { success: true, data: models };
      } catch (error: any) {
        console.error("[IPC] model:getByProvider error:", error);
        return { success: false, error: error.message };
      }
    }
  );

  /**
   * 创建模型
   */
  ipcMain.handle("model:create", async (_, data: any): Promise<IpcResponse> => {
    try {
      const { id, provider, name } = data;

      if (!id || !provider || !name) {
        return { success: false, error: "模型ID、服务商ID、名称为必填项" };
      }

      const newModel = await modelDal.create({ id, provider, name });
      return { success: true, data: newModel };
    } catch (error: any) {
      console.error("[IPC] model:create error:", error);
      return { success: false, error: error.message };
    }
  });

  /**
   * 删除模型
   */
  ipcMain.handle(
    "model:delete",
    async (_, id: string, provider: number): Promise<IpcResponse> => {
      try {
        if (!id || !provider) {
          return { success: false, error: "模型ID和服务商ID为必填项" };
        }

        await modelDal.remove(id, provider);
        return { success: true, data: { message: "模型删除成功" } };
      } catch (error: any) {
        console.error("[IPC] model:delete error:", error);
        return { success: false, error: error.message };
      }
    }
  );

  // ==================== Task Handlers ====================

  /**
   * 批量创建任务
   */
  ipcMain.handle(
    "task:create",
    async (_, tasks: any[]): Promise<IpcResponse> => {
      try {
        if (!Array.isArray(tasks) || tasks.length === 0) {
          return { success: false, error: "任务列表不能为空" };
        }

        // 为每个任务生成 UUID
        const tasksWithId = tasks.map((task) => ({
          ...task,
          id: uuidv4(),
          progress: 0,
          status: -1, // CREATED - 等待文件上传
        }));

        const createdTasks = await taskDal.createTasks(tasksWithId);
        return { success: true, data: createdTasks };
      } catch (error: any) {
        console.error("[IPC] task:create error:", error);
        return { success: false, error: error.message };
      }
    }
  );

  /**
   * 获取任务列表（分页）
   */
  ipcMain.handle(
    "task:getAll",
    async (
      _,
      params: { page: number; pageSize: number }
    ): Promise<IpcResponse> => {
      try {
        const { page = 1, pageSize = 10 } = params || {};

        const tasks = await taskDal.findAll(page, pageSize);
        const total = await taskDal.getTotal();

        return { success: true, data: { list: tasks, total } };
      } catch (error: any) {
        console.error("[IPC] task:getAll error:", error);
        return { success: false, error: error.message };
      }
    }
  );

  /**
   * 更新任务
   */
  ipcMain.handle(
    "task:update",
    async (_, id: string, data: any): Promise<IpcResponse> => {
      try {
        const updatedTask = await taskDal.update(id, data);

        // 发射任务更新事件
        eventBus.emitTaskEvent(TaskEventType.TASK_UPDATED, {
          taskId: id,
          task: updatedTask,
          timestamp: Date.now(),
        });

        // 如果状态变化，额外发射状态变化事件
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
   * 删除任务
   */
  ipcMain.handle("task:delete", async (_, id: string): Promise<IpcResponse> => {
    try {
      // 删除任务文件
      await fileLogic.deleteTaskFiles(id);

      // 删除任务记录
      const deletedTask = await taskDal.remove(id);

      // 发射任务删除事件
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
   * 根据 ID 获取任务
   */
  ipcMain.handle("task:getById", async (_, id: string): Promise<IpcResponse> => {
    try {
      if (!id) {
        return { success: false, error: "任务ID不能为空" };
      }

      const task = await taskDal.findById(id);

      if (!task) {
        return { success: false, error: "任务不存在" };
      }

      return { success: true, data: task };
    } catch (error: any) {
      console.error("[IPC] task:getById error:", error);
      return { success: false, error: error.message };
    }
  });

  // ==================== TaskDetail Handlers ====================

  /**
   * 获取任务指定页面的详情
   */
  ipcMain.handle(
    "taskDetail:getByPage",
    async (_, taskId: string, page: number): Promise<IpcResponse> => {
      try {
        if (!taskId) {
          return { success: false, error: "任务ID不能为空" };
        }

        if (!page || page < 1) {
          return { success: false, error: "页码必须大于0" };
        }

        const taskDetail = await taskDetailDal.findByTaskAndPage(taskId, page);

        if (!taskDetail) {
          return { success: false, error: "页面详情不存在" };
        }

        // 获取图片路径
        const imagePath = ImagePathUtil.getPath(taskId, page);
        const imageExists = fs.existsSync(imagePath);

        // 返回包含图片信息的详情
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
   * 获取任务的所有页面详情
   */
  ipcMain.handle(
    "taskDetail:getAllByTask",
    async (_, taskId: string): Promise<IpcResponse> => {
      try {
        if (!taskId) {
          return { success: false, error: "任务ID不能为空" };
        }

        const taskDetails = await taskDetailDal.findByTaskId(taskId);

        return { success: true, data: taskDetails };
      } catch (error: any) {
        console.error("[IPC] taskDetail:getAllByTask error:", error);
        return { success: false, error: error.message };
      }
    }
  );

  /**
   * 重试单个页面
   */
  ipcMain.handle(
    "taskDetail:retry",
    async (_, pageId: number): Promise<IpcResponse> => {
      try {
        if (!pageId) {
          return { success: false, error: "页面ID不能为空" };
        }

        const result = await prisma.$transaction(async (tx) => {
          // Step 1: Find the page
          const page = await tx.taskDetail.findUnique({
            where: { id: pageId },
          });

          if (!page) {
            throw new Error("页面不存在");
          }

          // Step 2: Check page status must be FAILED or COMPLETED
          if (page.status !== PageStatus.FAILED && page.status !== PageStatus.COMPLETED) {
            throw new Error("只能重试失败或已完成的页面");
          }

          // Step 3: Check task status
          const task = await tx.task.findUnique({
            where: { id: page.task },
          });

          if (!task) {
            throw new Error("任务不存在");
          }

          if (task.status === TaskStatus.CANCELLED || task.status === TaskStatus.COMPLETED) {
            throw new Error("任务已取消或已完成，无法重试");
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
   * 批量重试失败的页面
   */
  ipcMain.handle(
    "taskDetail:retryFailed",
    async (_, taskId: string): Promise<IpcResponse> => {
      try {
        if (!taskId) {
          return { success: false, error: "任务ID不能为空" };
        }

        const result = await prisma.$transaction(async (tx) => {
          // Step 1: Check task exists and status is valid
          const task = await tx.task.findUnique({
            where: { id: taskId },
          });

          if (!task) {
            throw new Error("任务不存在");
          }

          if (task.status === TaskStatus.CANCELLED || task.status === TaskStatus.COMPLETED) {
            throw new Error("任务已取消或已完成，无法重试");
          }

          // Step 2: Count failed pages
          const failedCount = await tx.taskDetail.count({
            where: {
              task: taskId,
              status: PageStatus.FAILED,
            },
          });

          if (failedCount === 0) {
            throw new Error("没有失败的页面需要重试");
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
   * 获取任务成本统计
   */
  ipcMain.handle(
    "taskDetail:getCostStats",
    async (_, taskId: string): Promise<IpcResponse> => {
      try {
        if (!taskId) {
          return { success: false, error: "任务ID不能为空" };
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

  // ==================== File Handlers ====================

  /**
   * 获取图片路径和状态
   */
  ipcMain.handle(
    "file:getImagePath",
    async (_, taskId: string, page: number): Promise<IpcResponse> => {
      try {
        if (!taskId) {
          return { success: false, error: "任务ID不能为空" };
        }

        if (!page || page < 1) {
          return { success: false, error: "页码必须大于0" };
        }

        const imagePath = ImagePathUtil.getPath(taskId, page);
        const exists = fs.existsSync(imagePath);

        return {
          success: true,
          data: { imagePath, exists },
        };
      } catch (error: any) {
        console.error("[IPC] file:getImagePath error:", error);
        return { success: false, error: error.message };
      }
    }
  );

  /**
   * 下载合并后的 Markdown 文件
   */
  ipcMain.handle(
    "file:downloadMarkdown",
    async (_, taskId: string): Promise<IpcResponse> => {
      try {
        if (!taskId) {
          return { success: false, error: "任务ID不能为空" };
        }

        // 获取任务信息
        const task = await taskDal.findById(taskId);

        if (!task) {
          return { success: false, error: "任务不存在" };
        }

        if (!task.merged_path) {
          return { success: false, error: "合并文件不存在，任务可能尚未完成" };
        }

        // 检查文件是否存在
        if (!fs.existsSync(task.merged_path)) {
          return { success: false, error: "合并文件已丢失" };
        }

        // 打开保存对话框
        const result = await dialog.showSaveDialog({
          title: "保存 Markdown 文件",
          defaultPath: task.filename.replace(/\.[^/.]+$/, ".md"),
          filters: [
            { name: "Markdown Files", extensions: ["md"] },
            { name: "All Files", extensions: ["*"] },
          ],
        });

        // 用户取消
        if (result.canceled || !result.filePath) {
          return { success: false, error: "用户取消保存" };
        }

        // 复制文件到目标位置
        fs.copyFileSync(task.merged_path, result.filePath);

        return {
          success: true,
          data: { savedPath: result.filePath },
        };
      } catch (error: any) {
        console.error("[IPC] file:downloadMarkdown error:", error);
        return { success: false, error: error.message };
      }
    }
  );

  /**
   * 文件选择对话框
   */
  ipcMain.handle("file:selectDialog", async (): Promise<IpcResponse> => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ["openFile", "multiSelections"],
        filters: [
          {
            name: "PDF and Images",
            extensions: ["pdf", "jpg", "jpeg", "png", "bmp", "gif"],
          },
          { name: "PDF Documents", extensions: ["pdf"] },
          { name: "Images", extensions: ["jpg", "jpeg", "png", "bmp", "gif"] },
          { name: "All Files", extensions: ["*"] },
        ],
      });

      return {
        success: true,
        data: { filePaths: result.filePaths, canceled: result.canceled },
      };
    } catch (error: any) {
      console.error("[IPC] file:selectDialog error:", error);
      return { success: false, error: error.message };
    }
  });

  /**
   * 文件上传（从文件路径复制到任务目录）
   */
  ipcMain.handle(
    "file:upload",
    async (_, taskId: string, filePath: string): Promise<IpcResponse> => {
      try {
        if (!taskId || !filePath) {
          return { success: false, error: "任务ID和文件路径不能为空" };
        }

        // 检查文件是否存在
        if (!fs.existsSync(filePath)) {
          return { success: false, error: "文件不存在" };
        }

        const baseUploadDir = fileLogic.getUploadDir();
        const uploadDir = path.join(baseUploadDir, taskId);

        // 确保目录存在
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }

        // 获取文件信息
        const fileName = path.basename(filePath);
        const destPath = path.join(uploadDir, fileName);

        // 复制文件
        fs.copyFileSync(filePath, destPath);

        // 获取文件信息
        const stats = fs.statSync(destPath);

        const fileInfo = {
          originalName: fileName,
          savedName: fileName,
          path: destPath,
          size: stats.size,
          taskId: taskId,
        };

        return { success: true, data: fileInfo };
      } catch (error: any) {
        console.error("[IPC] file:upload error:", error);
        return { success: false, error: error.message };
      }
    }
  );

  /**
   * 批量文件上传（支持多文件）
   */
  ipcMain.handle(
    "file:uploadMultiple",
    async (_, taskId: string, filePaths: string[]): Promise<IpcResponse> => {
      try {
        if (!taskId || !Array.isArray(filePaths) || filePaths.length === 0) {
          return { success: false, error: "任务ID和文件路径列表不能为空" };
        }

        const uploadResults = [];

        for (const filePath of filePaths) {
          // 检查文件是否存在
          if (!fs.existsSync(filePath)) {
            continue;
          }

          const baseUploadDir = fileLogic.getUploadDir();
          const uploadDir = path.join(baseUploadDir, taskId);

          // 确保目录存在
          if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
          }

          // 获取文件信息
          const fileName = path.basename(filePath);
          const destPath = path.join(uploadDir, fileName);

          // 复制文件
          fs.copyFileSync(filePath, destPath);

          // 获取文件信息
          const stats = fs.statSync(destPath);

          uploadResults.push({
            originalName: fileName,
            savedName: fileName,
            path: destPath,
            size: stats.size,
            taskId: taskId,
          });
        }

        return {
          success: true,
          data: { message: "文件上传成功", files: uploadResults },
        };
      } catch (error: any) {
        console.error("[IPC] file:uploadMultiple error:", error);
        return { success: false, error: error.message };
      }
    }
  );

  /**
   * 文件内容上传（用于拖放上传）
   */
  ipcMain.handle(
    "file:uploadFileContent",
    async (_, taskId: string, fileName: string, fileBuffer: ArrayBuffer): Promise<IpcResponse> => {
      try {
        if (!taskId || !fileName || !fileBuffer) {
          return { success: false, error: "任务ID、文件名和文件内容不能为空" };
        }

        const baseUploadDir = fileLogic.getUploadDir();
        const uploadDir = path.join(baseUploadDir, taskId);

        // 确保目录存在
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }

        // 构建目标路径
        const destPath = path.join(uploadDir, fileName);

        // 将 ArrayBuffer 转换为 Buffer 并写入文件
        const buffer = Buffer.from(fileBuffer);
        fs.writeFileSync(destPath, buffer);

        // 获取文件信息
        const stats = fs.statSync(destPath);

        const fileInfo = {
          originalName: fileName,
          savedName: fileName,
          path: destPath,
          size: stats.size,
          taskId: taskId,
        };

        return { success: true, data: fileInfo };
      } catch (error: any) {
        console.error("[IPC] file:uploadFileContent error:", error);
        return { success: false, error: error.message };
      }
    }
  );

  // ==================== Task Status Handlers ====================

  /**
   * 检查是否有进行中的任务
   * 进行中的任务状态：PENDING, SPLITTING, PROCESSING, READY_TO_MERGE, MERGING
   */
  ipcMain.handle("task:hasRunningTasks", async (): Promise<IpcResponse> => {
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

  // ==================== Completion Handlers ====================

  /**
   * 图片转 Markdown
   */
  ipcMain.handle(
    "completion:markImagedown",
    async (
      _,
      providerId: number,
      modelId: string,
      url: string
    ): Promise<IpcResponse> => {
      try {
        if (!providerId || !modelId || !url) {
          return { success: false, error: "providerId, modelId, url 为必填项" };
        }

        const result = await modelLogic.completion(providerId, {
          model: modelId,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: { url },
                },
                {
                  type: "text",
                  text: "Convert this image to markdown.",
                },
              ],
            },
          ],
        });

        return { success: true, data: result };
      } catch (error: any) {
        console.error("[IPC] completion:markImagedown error:", error);
        return { success: false, error: error.message };
      }
    }
  );

  /**
   * 测试模型连接
   */
  ipcMain.handle(
    "completion:testConnection",
    async (_, providerId: number, modelId: string): Promise<IpcResponse> => {
      try {
        if (!providerId || !modelId) {
          return { success: false, error: "providerId, modelId 为必填项" };
        }

        // 使用一个简单的 base64 图片进行测试
        const testImageBase64 =
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

        const result = await modelLogic.completion(providerId, {
          model: modelId,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: {
                    url: `data:image/png;base64,${testImageBase64}`,
                  },
                },
                {
                  type: "text",
                  text: "Test connection.",
                },
              ],
            },
          ],
        });

        return { success: true, data: result };
      } catch (error: any) {
        console.error("[IPC] completion:testConnection error:", error);
        return { success: false, error: error.message };
      }
    }
  );

  console.log("[IPC] All handlers registered successfully");
}
