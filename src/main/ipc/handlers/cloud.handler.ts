import { ipcMain } from 'electron';
import cloudService from '../../../core/infrastructure/services/CloudService.js';

/**
 * Register Cloud IPC handlers
 */
export function registerCloudHandlers() {
  /**
   * Set authentication token
   */
  ipcMain.handle('cloud:setToken', async (_, token: string | null) => {
    try {
      cloudService.setToken(token);
      return { success: true };
    } catch (error) {
      console.error('[IPC] cloud:setToken error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  /**
   * Convert file via cloud
   */
  ipcMain.handle('cloud:convert', async (_, fileData: { path?: string; content?: ArrayBuffer; name: string }) => {
    try {
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
      const result = await cloudService.getTasks(params.page, params.pageSize);
      return result;
    } catch (error) {
      console.error('[IPC] cloud:getTasks error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  /**
   * Get credit history
   */
  ipcMain.handle('cloud:getCreditHistory', async (_, params: { page: number; pageSize: number }) => {
    try {
      const result = await cloudService.getCreditHistory(params.page, params.pageSize);
      return result;
    } catch (error) {
      console.error('[IPC] cloud:getCreditHistory error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  console.log('[IPC] Cloud handlers registered');
}
