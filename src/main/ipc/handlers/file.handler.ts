import { ipcMain, dialog } from "electron";
import path from "path";
import fs from "fs";
import taskRepository from "../../../core/domain/repositories/TaskRepository.js";
import fileLogic from "../../../core/infrastructure/services/FileService.js";
import { ImagePathUtil } from "../../../core/infrastructure/adapters/split/index.js";
import { IPC_CHANNELS } from "../../../shared/ipc/channels.js";
import type { IpcResponse } from "../../../shared/ipc/responses.js";

/**
 * Register all file-related IPC handlers
 */
export function registerFileHandlers() {
  /**
   * Get image path and status
   */
  ipcMain.handle(
    IPC_CHANNELS.FILE.GET_IMAGE_PATH,
    async (_, taskId: string, page: number): Promise<IpcResponse> => {
      try {
        if (!taskId) {
          return { success: false, error: "Task ID is required" };
        }

        if (!page || page < 1) {
          return { success: false, error: "Page number must be greater than 0" };
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
   * Download merged Markdown file
   */
  ipcMain.handle(
    IPC_CHANNELS.FILE.DOWNLOAD_MARKDOWN,
    async (_, taskId: string): Promise<IpcResponse> => {
      try {
        if (!taskId) {
          return { success: false, error: "Task ID is required" };
        }

        // Get task info
        const task = await taskRepository.findById(taskId);

        if (!task) {
          return { success: false, error: "Task not found" };
        }

        if (!task.merged_path) {
          return { success: false, error: "Merged file does not exist, task may not be completed" };
        }

        // Check if file exists
        if (!fs.existsSync(task.merged_path)) {
          return { success: false, error: "Merged file is missing" };
        }

        // Open save dialog
        const result = await dialog.showSaveDialog({
          title: "Save Markdown File",
          defaultPath: task.filename.replace(/\.[^/.]+$/, ".md"),
          filters: [
            { name: "Markdown Files", extensions: ["md"] },
            { name: "All Files", extensions: ["*"] },
          ],
        });

        // User cancelled
        if (result.canceled || !result.filePath) {
          return { success: false, error: "User cancelled save" };
        }

        // Copy file to destination
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
   * File selection dialog
   */
  ipcMain.handle(IPC_CHANNELS.FILE.SELECT_DIALOG, async (): Promise<IpcResponse> => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ["openFile", "multiSelections"],
        filters: [
          {
            name: "All Supported Files",
            extensions: [
              "pdf",
              "jpg", "jpeg", "png", "webp",
              "docx", "dotx",
              "pptx", "potx",
              "xlsx", "xltx", "csv",
            ],
          },
          { name: "PDF Documents", extensions: ["pdf"] },
          { name: "Images", extensions: ["jpg", "jpeg", "png", "webp"] },
          { name: "Word Documents", extensions: ["docx", "dotx"] },
          { name: "PowerPoint Presentations", extensions: ["pptx", "potx"] },
          { name: "Excel Spreadsheets", extensions: ["xlsx", "xltx", "csv"] },
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
   * File upload (copy from file path to task directory)
   */
  ipcMain.handle(
    IPC_CHANNELS.FILE.UPLOAD,
    async (_, taskId: string, filePath: string): Promise<IpcResponse> => {
      try {
        if (!taskId || !filePath) {
          return { success: false, error: "Task ID and file path are required" };
        }

        // Check if file exists
        if (!fs.existsSync(filePath)) {
          return { success: false, error: "File does not exist" };
        }

        const baseUploadDir = fileLogic.getUploadDir();
        const uploadDir = path.join(baseUploadDir, taskId);

        // Ensure directory exists
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }

        // Get file info
        const fileName = path.basename(filePath);
        const destPath = path.join(uploadDir, fileName);

        // Copy file
        fs.copyFileSync(filePath, destPath);

        // Get file stats
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
   * Multiple file upload
   */
  ipcMain.handle(
    IPC_CHANNELS.FILE.UPLOAD_MULTIPLE,
    async (_, taskId: string, filePaths: string[]): Promise<IpcResponse> => {
      try {
        if (!taskId || !Array.isArray(filePaths) || filePaths.length === 0) {
          return { success: false, error: "Task ID and file path list are required" };
        }

        const uploadResults = [];

        for (const filePath of filePaths) {
          // Check if file exists
          if (!fs.existsSync(filePath)) {
            continue;
          }

          const baseUploadDir = fileLogic.getUploadDir();
          const uploadDir = path.join(baseUploadDir, taskId);

          // Ensure directory exists
          if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
          }

          // Get file info
          const fileName = path.basename(filePath);
          const destPath = path.join(uploadDir, fileName);

          // Copy file
          fs.copyFileSync(filePath, destPath);

          // Get file stats
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
          data: { message: "Files uploaded successfully", files: uploadResults },
        };
      } catch (error: any) {
        console.error("[IPC] file:uploadMultiple error:", error);
        return { success: false, error: error.message };
      }
    }
  );

  /**
   * File content upload (for drag and drop)
   */
  ipcMain.handle(
    IPC_CHANNELS.FILE.UPLOAD_FILE_CONTENT,
    async (_, taskId: string, fileName: string, fileBuffer: ArrayBuffer): Promise<IpcResponse> => {
      try {
        if (!taskId || !fileName || !fileBuffer) {
          return { success: false, error: "Task ID, file name, and file content are required" };
        }

        const baseUploadDir = fileLogic.getUploadDir();
        const uploadDir = path.join(baseUploadDir, taskId);

        // Ensure directory exists
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }

        // Build destination path
        const destPath = path.join(uploadDir, fileName);

        // Convert ArrayBuffer to Buffer and write to file
        const buffer = Buffer.from(fileBuffer);
        fs.writeFileSync(destPath, buffer);

        // Get file stats
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

  console.log("[IPC] File handlers registered");
}
