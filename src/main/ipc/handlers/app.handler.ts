import { ipcMain, app } from "electron";
import { createRequire } from "module";
import path from "path";

// 使用 createRequire 来支持在 ESM 中导入 JSON
const requireJson = createRequire(import.meta.url);

/**
 * Get app version from package.json
 * In development mode, app.getVersion() returns Electron's version,
 * so we need to read from package.json directly
 */
function getAppVersion(): string {
  if (app.isPackaged) {
    // In production, app.getVersion() correctly returns package.json version
    return app.getVersion();
  }

  // In development mode, read from package.json
  try {
    const packageJsonPath = path.join(process.cwd(), "package.json");
    const packageJson = requireJson(packageJsonPath);
    return packageJson.version || "0.0.0";
  } catch {
    // Fallback to app.getVersion() if package.json cannot be read
    return app.getVersion();
  }
}

/**
 * Register app-related IPC handlers
 */
export function registerAppHandlers() {
  // Get app version from package.json
  ipcMain.handle("app:getVersion", () => {
    return getAppVersion();
  });
}
