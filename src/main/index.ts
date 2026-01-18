import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "path";
import isDev from "electron-is-dev";
import taskLogic from "../server/logic/Task.js";
import { initDatabase, disconnect } from "../server/db/index.js";
import { registerIpcHandlers } from "./ipc/handlers.js";

let mainWindow: BrowserWindow | null;

// 启动任务
async function startTask() {
  await taskLogic.start();
}

// 停止任务
async function stopTask() {
  await taskLogic.stop();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    titleBarStyle: "hidden",
    // expose window controlls in Windows/Linux
    ...(process.platform !== "darwin" ? { titleBarOverlay: true } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "../preload/index.js"),
    },
    icon: path.join(
      process.env.ELECTRON_RENDERER_URL ? process.cwd() : app.getAppPath(),
      process.platform === "darwin"
        ? "public/icons/mac/icon.icns"
        : process.platform === "win32"
          ? "public/icons/win/icon.ico"
          : "public/icons/png/512x512.png",
    ),
  });

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

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    // 初始化数据库
    await initDatabase();

    // 注册 IPC Handlers
    registerIpcHandlers();

    // 创建窗口
    createWindow();

    // 启动任务逻辑
    await startTask();

    console.log(
      "[Main] Application started successfully with IPC architecture",
    );
  } catch (error) {
    console.error("[Main] Error starting application:", error);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    if (taskLogic.getStatus()) {
      stopTask();
    }
    disconnect();
    app.quit();
  }
});

app.on("activate", async () => {
  if (mainWindow === null) {
    try {
      createWindow();
      if (!taskLogic.getStatus()) {
        await startTask();
      }
    } catch (error) {
      console.error("[Main] Error reactivating application:", error);
      app.quit();
    }
  }
});
