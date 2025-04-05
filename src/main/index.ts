import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import isDev from 'electron-is-dev';

// 添加错误处理
let backend: any;
try {
  // 解决模块导入问题
  if (isDev) {
    backend = require(path.join(process.cwd(), 'app/app'));
  } else {
    // 在打包环境中使用绝对路径
    backend = require(path.join(app.getAppPath(), 'app/app'));
  }
} catch (error) {
  console.error('Error loading backend:', error);
  process.exit(1);
}

let mainWindow: BrowserWindow | null;
let backendServer: any;

// 启动后端服务器并确保可以获取到端口
async function startBackendServer(): Promise<number> {
  return new Promise(async (resolve) => {
    backendServer = await backend.start();

    // 检查服务器是否已成功监听
    if (backendServer && backendServer.address()) {
      const port = backendServer.address().port;
      console.log(`Backend server is running at http://localhost:${port}`);
      resolve(port);
    } else {
      // 等待服务器启动
      backendServer.on('listening', () => {
        const port = backendServer.address().port;
        console.log(`Backend server is running at http://localhost:${port}`);
        resolve(port);
      });
    }
  });
}

function createWindow(port: number) {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    titleBarStyle: 'hidden',
    // expose window controlls in Windows/Linux
    ...(process.platform !== 'darwin' ? { titleBarOverlay: true } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/index.js'),
      additionalArguments: [`--backend-port=${port}`],
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));
  }

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // 处理链接在默认浏览器中打开
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('http') && !url.includes('localhost')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // 拦截_blank链接，让它们在外部浏览器中打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // 注册IPC处理程序，用于从渲染进程打开链接
  ipcMain.on('open-external-link', (_, url) => {
    if (url && typeof url === 'string') {
      shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    const port = await startBackendServer();
    createWindow(port);
  } catch (error) {
    console.error('Error starting backend server:', error);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (backendServer) {
      backendServer.close();
    }
    app.quit();
  }
});

app.on('activate', async () => {
  if (mainWindow === null) {
    try {
      if (!backendServer || !backendServer.listening) {
        const port = await startBackendServer();
        createWindow(port);
      } else {
        const port = backendServer.address().port;
        createWindow(port);
      }
    } catch (error) {
      console.error('Error reactivating application:', error);
      app.quit();
    }
  }
}); 