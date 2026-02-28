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
   * @param allowOffice - If true, includes Office file types in the filter
   */
  ipcMain.handle(IPC_CHANNELS.FILE.SELECT_DIALOG, async (_, allowOffice?: boolean): Promise<IpcResponse> => {
    try {
      const pdfAndImageExtensions = ["pdf", "jpg", "jpeg", "png", "bmp", "gif"];
      const officeExtensions = ["doc", "docx", "xls", "xlsx", "ppt", "pptx"];

      // Keep the first filter as the default one shown by OS dialogs.
      const filters = allowOffice
        ? [
            {
              name: "Supported Files",
              extensions: [...pdfAndImageExtensions, ...officeExtensions],
            },
            { name: "PDF and Images", extensions: pdfAndImageExtensions },
            { name: "Office Documents", extensions: officeExtensions },
            { name: "All Files", extensions: ["*"] },
          ]
        : [
            { name: "PDF and Images", extensions: pdfAndImageExtensions },
            { name: "PDF Documents", extensions: ["pdf"] },
            { name: "Images", extensions: ["jpg", "jpeg", "png", "bmp", "gif"] },
            { name: "All Files", extensions: ["*"] },
          ];

      const result = await dialog.showOpenDialog({
        properties: ["openFile", "multiSelections"],
        filters,
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

        // Check if source file exists
        if (!fs.existsSync(filePath)) {
          console.error(`[IPC] file:upload - Source file does not exist: ${filePath}`);
          return { success: false, error: "File does not exist" };
        }

        const baseUploadDir = fileLogic.getUploadDir();
        const uploadDir = path.join(baseUploadDir, taskId);

        // Ensure directory exists
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }

        // Verify directory was created and is writable
        try {
          fs.accessSync(uploadDir, fs.constants.W_OK);
        } catch {
          console.error(`[IPC] file:upload - Upload directory is not writable: ${uploadDir}`);
          return { success: false, error: `Upload directory is not writable: ${uploadDir}` };
        }

        // Get file info
        const fileName = path.basename(filePath);
        const destPath = path.join(uploadDir, fileName);

        // Copy file
        console.log(`[IPC] file:upload - Copying file: ${filePath} -> ${destPath}`);
        fs.copyFileSync(filePath, destPath);

        // Verify copied file exists and has content
        if (!fs.existsSync(destPath)) {
          console.error(`[IPC] file:upload - File copy verification failed, destination not found: ${destPath}`);
          return { success: false, error: "File copy failed: destination file not found after copy" };
        }

        // Get file stats
        const stats = fs.statSync(destPath);

        if (stats.size === 0) {
          console.error(`[IPC] file:upload - Copied file is empty: ${destPath}`);
          return { success: false, error: "File copy failed: destination file is empty" };
        }

        console.log(`[IPC] file:upload - File copied successfully: ${destPath} (${stats.size} bytes)`);

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

        // Verify directory was created and is writable
        try {
          fs.accessSync(uploadDir, fs.constants.W_OK);
        } catch {
          console.error(`[IPC] file:uploadFileContent - Upload directory is not writable: ${uploadDir}`);
          return { success: false, error: `Upload directory is not writable: ${uploadDir}` };
        }

        // Sanitize filename to prevent path traversal
        const safeName = path.basename(fileName);
        const destPath = path.join(uploadDir, safeName);

        // Convert ArrayBuffer to Buffer and write to file
        const buffer = Buffer.from(fileBuffer);
        console.log(`[IPC] file:uploadFileContent - Writing file: ${destPath} (${buffer.length} bytes)`);
        fs.writeFileSync(destPath, buffer);

        // Verify written file exists and has content
        if (!fs.existsSync(destPath)) {
          console.error(`[IPC] file:uploadFileContent - File write verification failed, not found: ${destPath}`);
          return { success: false, error: "File write failed: file not found after write" };
        }

        // Get file stats
        const stats = fs.statSync(destPath);

        if (stats.size === 0) {
          console.error(`[IPC] file:uploadFileContent - Written file is empty: ${destPath}`);
          return { success: false, error: "File write failed: file is empty" };
        }

        console.log(`[IPC] file:uploadFileContent - File written successfully: ${destPath} (${stats.size} bytes)`);

        const fileInfo = {
          originalName: safeName,
          savedName: safeName,
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
