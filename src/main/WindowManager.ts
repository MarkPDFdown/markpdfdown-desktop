import { BrowserWindow } from 'electron';

class WindowManager {
  private static instance: WindowManager;
  private mainWindow: BrowserWindow | null = null;

  private constructor() {}

  static getInstance(): WindowManager {
    if (!WindowManager.instance) {
      WindowManager.instance = new WindowManager();
    }
    return WindowManager.instance;
  }

  setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window;
    if (window) {
      window.on('closed', () => {
        this.mainWindow = null;
      });
    }
  }

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  isWindowAvailable(): boolean {
    return this.mainWindow !== null && !this.mainWindow.isDestroyed();
  }

  sendToRenderer(channel: string, ...args: any[]): void {
    if (this.isWindowAvailable()) {
      this.mainWindow!.webContents.send(channel, ...args);
    } else {
      console.warn(`[WindowManager] Window not available (channel: ${channel})`);
    }
  }
}

export const windowManager = WindowManager.getInstance();
