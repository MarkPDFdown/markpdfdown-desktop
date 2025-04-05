const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const isDev = require('electron-is-dev');

// 添加错误处理
let backend;
try {
  backend = require('../app/app');
} catch (error) {
  console.error('Error loading backend:', error);
  process.exit(1);
}

let mainWindow;
let backendServer;

// 启动后端服务器并确保可以获取到端口
async function startBackendServer() {
  return new Promise(async (resolve) => {
    // 确保数据库目录存在
    if (!isDev) {
      const userDataPath = app.getPath('userData');
      const dbDir = path.join(userDataPath, 'db');
      
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }
      
      // 设置数据库URL环境变量
      process.env.DATABASE_URL = `file:${path.join(dbDir, 'app.db')}`;
      console.log('Setting database path to:', process.env.DATABASE_URL);
    }
    
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

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    titleBarStyle: 'hidden',
    // expose window controlls in Windows/Linux
    ...(process.platform !== 'darwin' ? { titleBarOverlay: true } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      additionalArguments: [`--backend-port=${port}`],
    },
  });

  const startUrl = false
    ? 'http://localhost:5173'
    : `file://${path.join(__dirname, '../dist/index.html')}`;

  mainWindow.loadURL(startUrl);

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