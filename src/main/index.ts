import { app, BrowserWindow, ipcMain, shell, protocol, nativeImage } from "electron";

// 在 app ready 之前设置应用名称，确保 userData 路径正确
// 这必须在所有其他模块导入之前执行，因为一些模块在导入时就会读取 app.getPath('userData')
// 这对于 npx 方式运行非常重要，否则 userData 会指向 Electron 默认目录
if (!app.isPackaged) {
  app.setName('MarkPDFdown');
  // 在非打包模式下，需要手动设置 userData 路径，因为 setName 不会自动更新它
  const userDataPath = app.getPath('userData');
  // 如果路径仍然指向 Electron 默认目录，则修正它
  if (userDataPath.endsWith('Electron')) {
    const newPath = userDataPath.replace(/Electron$/, 'MarkPDFdown');
    app.setPath('userData', newPath);
  }
}

import path from "path";
import fs from "fs";

/**
 * 获取图标路径
 * npx 运行时 app.getAppPath() 返回 dist/main 目录，需要向上查找到项目根目录
 * 打包后 app.getAppPath() 返回 app.asar，图标在 resources 目录
 *
 * 注意：nativeImage 对 .icns/.ico 格式支持不佳，非打包模式下使用 PNG
 * macOS 使用专门的 PNG 图标（带透明边距，适合 Dock 放大效果）
 */
function getIconPath(): string {
  let iconName: string;

  if (app.isPackaged) {
    // 打包模式：使用原生格式
    iconName = process.platform === "darwin"
      ? "icons/mac/icon.icns"
      : process.platform === "win32"
        ? "icons/win/icon.ico"
        : "icons/png/512x512.png";
  } else {
    // 非打包模式（开发/npx）：使用 PNG，区分平台
    // macOS 使用专门的图标（带透明边距）
    iconName = process.platform === "darwin"
      ? "icons/mac/png/512x512.png"
      : "icons/png/512x512.png";
  }

  // 开发模式（有 ELECTRON_RENDERER_URL）
  if (process.env.ELECTRON_RENDERER_URL) {
    return path.join(process.cwd(), 'public', iconName);
  }

  // 打包模式
  if (app.isPackaged) {
    return path.join(process.resourcesPath, iconName);
  }

  // npx 运行模式：从 dist/main 向上查找 public/icons
  const appPath = app.getAppPath();

  // 尝试多个可能的路径
  const possiblePaths = [
    path.join(appPath, '..', '..', 'public', iconName),  // dist/main -> 根目录
    path.join(appPath, '..', 'public', iconName),        // dist -> 根目录
    path.join(appPath, 'public', iconName),              // 当前目录
    path.join(process.cwd(), 'public', iconName),        // 工作目录
  ];

  for (const iconPath of possiblePaths) {
    if (fs.existsSync(iconPath)) {
      return iconPath;
    }
  }

  // 返回默认路径（即使不存在）
  return possiblePaths[0];
}
import isDev from "electron-is-dev";
import {
  workerOrchestrator,
  presetProviderService,
} from "../core/application/services/index.js";
import { initDatabase, disconnect } from "../core/infrastructure/db/index.js";
import { registerIpcHandlers } from "./ipc/handlers.js";
import { windowManager } from './WindowManager.js';
import { eventBridge } from './ipc/eventBridge.js';
import fileLogic from "../core/infrastructure/services/FileService.js";

// 在 app ready 之前注册自定义协议的权限
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-file',
    privileges: {
      secure: true,
      supportFetchAPI: true,
      bypassCSP: false,
      corsEnabled: false,
    }
  }
]);

let mainWindow: BrowserWindow | null;

// 注册自定义协议，用于安全地加载本地文件
function registerLocalFileProtocol() {
  protocol.registerFileProtocol('local-file', (request, callback) => {
    try {
      // 从 URL 中提取文件路径
      // URL 格式: local-file:///path/to/file (Windows: local-file:///D:/path)
      let url = request.url.substring('local-file://'.length);
      // 移除开头的斜杠（Windows 路径如 /D:/... 需要变成 D:/...）
      if (url.startsWith('/') && /^\/[A-Za-z]:/.test(url)) {
        url = url.substring(1);
      }
      const decodedPath = decodeURIComponent(url);

      // 安全检查：确保路径在允许的目录内
      const uploadsDir = fileLogic.getUploadDir();
      const tempDir = fileLogic.getTempDir();
      const normalizedPath = path.normalize(decodedPath);

      const isInUploads = normalizedPath.startsWith(uploadsDir);
      const isInTemp = normalizedPath.startsWith(tempDir);

      if (!isInUploads && !isInTemp) {
        console.error('[Protocol] Attempted to access file outside allowed directories:', normalizedPath);
        callback({ error: -10 }); // ACCESS_DENIED
        return;
      }

      // 检查文件是否存在
      if (!fs.existsSync(normalizedPath)) {
        console.error('[Protocol] File not found:', normalizedPath);
        callback({ error: -6 }); // FILE_NOT_FOUND
        return;
      }

      callback({ path: normalizedPath });
    } catch (error) {
      console.error('[Protocol] Error handling local-file request:', error);
      callback({ error: -2 }); // FAILED
    }
  });
}

// 启动任务
async function startTask() {
  await workerOrchestrator.start();
}

// 停止任务
async function stopTask() {
  await workerOrchestrator.stop();
}

function createWindow() {
  const iconPath = getIconPath();
  const iconExists = fs.existsSync(iconPath);

  // 尝试加载图标为 nativeImage
  let appIcon: Electron.NativeImage | undefined;
  if (iconExists) {
    try {
      appIcon = nativeImage.createFromPath(iconPath);
      if (appIcon.isEmpty()) {
        console.warn('[Main] Icon loaded but is empty:', iconPath);
        appIcon = undefined;
      }
    } catch (err) {
      console.warn('[Main] Failed to load icon:', iconPath, err);
      appIcon = undefined;
    }
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'MarkPDFdown',
    // macOS: 使用隐藏标题栏，Windows/Linux: 使用无边框窗口
    ...(process.platform === "darwin"
      ? { titleBarStyle: "hidden" }
      : { frame: false }),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "../preload/index.js"),
    },
    // 仅在图标成功加载时设置
    ...(appIcon ? { icon: appIcon } : {}),
  });

  // macOS: 设置 Dock 图标
  if (process.platform === "darwin" && app.dock && appIcon) {
    try {
      app.dock.setIcon(appIcon);
    } catch (err) {
      console.warn('[Main] Failed to set dock icon:', err);
    }
  }

  // 注册窗口到 WindowManager
  windowManager.setMainWindow(mainWindow);

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // 处理链接在默认浏览器中打开
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith("http") && !url.includes("localhost")) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // 拦截_blank链接，让它们在外部浏览器中打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  // 注册IPC处理程序，用于从渲染进程打开链接
  ipcMain.on("open-external-link", (_, url) => {
    if (url && typeof url === "string") {
      shell.openExternal(url);
    }
  });

  // 窗口控制 IPC 处理程序
  ipcMain.on("window:minimize", () => {
    if (mainWindow) {
      mainWindow.minimize();
    }
  });

  ipcMain.on("window:maximize", () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.on("window:close", () => {
    if (mainWindow) {
      mainWindow.close();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
    windowManager.setMainWindow(null);
  });
}

app.whenReady().then(async () => {
  try {
    const startTime = Date.now();

    // 注册自定义协议（立即执行，不耗时）
    registerLocalFileProtocol();
    console.log("[Main] Custom protocol 'local-file' registered");

    // 注册 IPC Handlers（立即执行，不耗时）
    registerIpcHandlers();

    // 初始化事件桥接器（立即执行，不耗时）
    eventBridge.initialize();

    // 立即创建并显示窗口（用户体验优先）
    createWindow();
    console.log(`[Main] Window created in ${Date.now() - startTime}ms`);

    // 后台异步初始化数据库和任务（不阻塞UI）
    initializeBackgroundServices().catch(error => {
      console.error("[Main] Background services initialization failed:", error);
    });

  } catch (error) {
    console.error("[Main] Error starting application:", error);
    app.quit();
  }
});

/**
 * 后台异步初始化服务（不阻塞窗口显示）
 */
async function initializeBackgroundServices() {
  try {
    const startTime = Date.now();

    // 初始化数据库
    console.log("[Main] Initializing database in background...");
    await initDatabase();
    console.log(`[Main] Database initialized in ${Date.now() - startTime}ms`);

    // 注入预设供应商
    console.log("[Main] Injecting preset providers...");
    const presetStartTime = Date.now();
    await presetProviderService.initialize();
    console.log(`[Main] Preset providers injected in ${Date.now() - presetStartTime}ms`);

    // 启动任务逻辑
    console.log("[Main] Starting task logic in background...");
    const taskStartTime = Date.now();
    await startTask();
    console.log(`[Main] Task logic started in ${Date.now() - taskStartTime}ms`);

    console.log(
      `[Main] Background services initialized successfully in ${Date.now() - startTime}ms`,
    );

    // 通知渲染进程初始化完成
    if (mainWindow) {
      mainWindow.webContents.send('app:ready');
    }
  } catch (error) {
    console.error("[Main] Background services initialization error:", error);
    throw error;
  }
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    if (workerOrchestrator.getStatus()) {
      stopTask();
    }
    eventBridge.cleanup();
    disconnect();
    app.quit();
  }
});

app.on("activate", async () => {
  if (mainWindow === null) {
    try {
      createWindow();
      if (!workerOrchestrator.getStatus()) {
        await startTask();
      }
    } catch (error) {
      console.error("[Main] Error reactivating application:", error);
      app.quit();
    }
  }
});
