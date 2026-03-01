import { ipcMain, dialog, app } from 'electron';
import path from 'path';
import fs from 'fs';
import cloudService from '../../../core/infrastructure/services/CloudService.js';
import { cloudSSEManager } from '../../../core/infrastructure/services/CloudSSEManager.js';

// Max upload size: 100MB
const MAX_UPLOAD_SIZE_BYTES = 100 * 1024 * 1024;

/**
 * Register Cloud IPC handlers
 */
export function registerCloudHandlers() {
  /**
   * Convert file via cloud
   */
  ipcMain.handle('cloud:convert', async (_, fileData: { path?: string; content?: ArrayBuffer; name: string; model?: string; page_range?: string }) => {
    try {
      // Validate: require either path or content, not both
      if (!fileData.path && !fileData.content) {
        return { success: false, error: 'No file content or path provided' };
      }

      // Validate file size
      if (fileData.content && fileData.content.byteLength > MAX_UPLOAD_SIZE_BYTES) {
        return { success: false, error: `File too large (max ${MAX_UPLOAD_SIZE_BYTES / 1024 / 1024}MB)` };
      }
      if (fileData.path) {
        try {
          const stat = fs.statSync(fileData.path);
          if (stat.size > MAX_UPLOAD_SIZE_BYTES) {
            return { success: false, error: `File too large (max ${MAX_UPLOAD_SIZE_BYTES / 1024 / 1024}MB)` };
          }
        } catch {
          return { success: false, error: 'File not found or not accessible' };
        }
      }

      const result = await cloudService.convert(fileData);
      return result;
    } catch (error) {
      console.error('[IPC] cloud:convert error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  /**
   * Get cloud tasks
   */
  ipcMain.handle('cloud:getTasks', async (_, params: { page: number; pageSize: number }) => {
    try {
      return await cloudService.getTasks(params.page, params.pageSize);
    } catch (error) {
      console.error('[IPC] cloud:getTasks error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  /**
   * Get task by ID
   */
  ipcMain.handle('cloud:getTaskById', async (_, id: string) => {
    try {
      return await cloudService.getTaskById(id);
    } catch (error) {
      console.error('[IPC] cloud:getTaskById error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  /**
   * Get task pages
   */
  ipcMain.handle('cloud:getTaskPages', async (_, params: { taskId: string; page?: number; pageSize?: number }) => {
    try {
      return await cloudService.getTaskPages(params.taskId, params.page, params.pageSize);
    } catch (error) {
      console.error('[IPC] cloud:getTaskPages error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  /**
   * Cancel task
   */
  ipcMain.handle('cloud:cancelTask', async (_, id: string) => {
    try {
      return await cloudService.cancelTask(id);
    } catch (error) {
      console.error('[IPC] cloud:cancelTask error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  /**
   * Retry task
   */
  ipcMain.handle('cloud:retryTask', async (_, id: string) => {
    try {
      return await cloudService.retryTask(id);
    } catch (error) {
      console.error('[IPC] cloud:retryTask error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  /**
   * Delete task (only terminal states can be deleted)
   */
  ipcMain.handle('cloud:deleteTask', async (_, id: string) => {
    try {
      return await cloudService.deleteTask(id);
    } catch (error) {
      console.error('[IPC] cloud:deleteTask error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  /**
   * Retry single page
   */
  ipcMain.handle('cloud:retryPage', async (_, params: { taskId: string; pageNumber: number }) => {
    try {
      return await cloudService.retryPage(params.taskId, params.pageNumber);
    } catch (error) {
      console.error('[IPC] cloud:retryPage error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  /**
   * Get task result
   */
  ipcMain.handle('cloud:getTaskResult', async (_, id: string) => {
    try {
      return await cloudService.getTaskResult(id);
    } catch (error) {
      console.error('[IPC] cloud:getTaskResult error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  /**
   * Download PDF — shows save dialog, writes to disk
   */
  ipcMain.handle('cloud:downloadPdf', async (_, id: string) => {
    try {
      const result = await cloudService.downloadPdf(id);
      if (!result.success || !result.data) {
        return { success: false, error: result.error || 'Download failed' };
      }

      const { buffer, fileName } = result.data;
      const downloadsPath = app.getPath('downloads');

      const saveResult = await dialog.showSaveDialog({
        defaultPath: path.join(downloadsPath, fileName),
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });

      if (saveResult.canceled || !saveResult.filePath) {
        return { success: false, error: 'Cancelled' };
      }

      fs.writeFileSync(saveResult.filePath, Buffer.from(buffer));
      return { success: true, data: { filePath: saveResult.filePath } };
    } catch (error) {
      console.error('[IPC] cloud:downloadPdf error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  /**
   * Get page image (proxy for API paths that need auth)
   */
  ipcMain.handle('cloud:getPageImage', async (_, params: { taskId: string; pageNumber: number }) => {
    try {
      return await cloudService.getPageImage(params.taskId, params.pageNumber);
    } catch (error) {
      console.error('[IPC] cloud:getPageImage error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  /**
   * Get credits info
   */
  ipcMain.handle('cloud:getCredits', async () => {
    try {
      return await cloudService.getCredits();
    } catch (error) {
      console.error('[IPC] cloud:getCredits error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  /**
   * Get credit history
   */
  ipcMain.handle('cloud:getCreditHistory', async (_, params: { page: number; pageSize: number; type?: string }) => {
    try {
      return await cloudService.getCreditHistory(params.page, params.pageSize, params.type);
    } catch (error) {
      console.error('[IPC] cloud:getCreditHistory error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  /**
   * SSE connect
   */
  ipcMain.handle('cloud:sseConnect', async () => {
    try {
      await cloudSSEManager.connect();
      return { success: true };
    } catch (error) {
      console.error('[IPC] cloud:sseConnect error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  /**
   * SSE disconnect (preserves lastEventId for resumption)
   */
  ipcMain.handle('cloud:sseDisconnect', async () => {
    try {
      cloudSSEManager.disconnect();
      return { success: true };
    } catch (error) {
      console.error('[IPC] cloud:sseDisconnect error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  /**
   * SSE full reset and disconnect (clears lastEventId, used on logout)
   */
  ipcMain.handle('cloud:sseResetAndDisconnect', async () => {
    try {
      cloudSSEManager.resetAndDisconnect();
      return { success: true };
    } catch (error) {
      console.error('[IPC] cloud:sseResetAndDisconnect error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  console.log('[IPC] Cloud handlers registered');
}
