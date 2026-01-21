import { ipcMain, dialog } from "electron";
import providerDal from "../../server/dal/ProviderDal.js";
import modelDal from "../../server/dal/ModelDal.js";
import taskDal from "../../server/dal/TaskDal.js";
import fileLogic from "../../server/logic/File.js";
import modelLogic from "../../server/logic/Model.js";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";

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
          status: 1, // 待处理
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
      return { success: true, data: deletedTask };
    } catch (error: any) {
      console.error("[IPC] task:delete error:", error);
      return { success: false, error: error.message };
    }
  });

  // ==================== File Handlers ====================

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
        const extname = path.extname(fileName);
        const savedName = taskId + extname;
        const destPath = path.join(uploadDir, savedName);

        // 复制文件
        fs.copyFileSync(filePath, destPath);

        // 获取文件信息
        const stats = fs.statSync(destPath);

        const fileInfo = {
          originalName: fileName,
          savedName: savedName,
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
          const extname = path.extname(fileName);
          const savedName = taskId + extname;
          const destPath = path.join(uploadDir, savedName);

          // 复制文件
          fs.copyFileSync(filePath, destPath);

          // 获取文件信息
          const stats = fs.statSync(destPath);

          uploadResults.push({
            originalName: fileName,
            savedName: savedName,
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
