import { ipcMain } from 'electron';
import { authManager } from '../../../core/infrastructure/services/AuthManager.js';

/**
 * Register Auth IPC handlers
 */
export function registerAuthHandlers() {
  ipcMain.handle('auth:login', async () => {
    try {
      const result = await authManager.startDeviceLogin();
      return result;
    } catch (error) {
      console.error('[IPC] auth:login error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle('auth:cancelLogin', async () => {
    try {
      authManager.cancelLogin();
      return { success: true };
    } catch (error) {
      console.error('[IPC] auth:cancelLogin error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle('auth:logout', async () => {
    try {
      await authManager.logout();
      return { success: true };
    } catch (error) {
      console.error('[IPC] auth:logout error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle('auth:getAuthState', async () => {
    try {
      const state = authManager.getAuthState();
      return { success: true, data: state };
    } catch (error) {
      console.error('[IPC] auth:getAuthState error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  console.log('[IPC] Auth handlers registered');
}
