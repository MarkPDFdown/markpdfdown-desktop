import { ipcMain, app } from "electron";

/**
 * Register app-related IPC handlers
 */
export function registerAppHandlers() {
  // Get app version from package.json
  ipcMain.handle("app:getVersion", () => {
    return app.getVersion();
  });
}
