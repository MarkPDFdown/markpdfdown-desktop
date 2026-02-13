import { app } from 'electron';
import pkg from 'electron-updater';
const { autoUpdater } = pkg;
import { windowManager } from '../WindowManager.js';
import { IPC_CHANNELS } from '../../shared/ipc/channels.js';
import { UpdateStatus } from '../../shared/types/UpdateStatus.js';
import type { UpdateStatusData } from '../../shared/types/UpdateStatus.js';

class UpdateService {
  private static instance: UpdateService;
  private initialized = false;
  private isChecking = false;

  private constructor() {
    // 延迟初始化：仅在打包模式下配置 autoUpdater
    // 开发模式下不注册监听器，避免 electron-updater 读取不存在的 app-update.yml
  }

  static getInstance(): UpdateService {
    if (!UpdateService.instance) {
      UpdateService.instance = new UpdateService();
    }
    return UpdateService.instance;
  }

  private ensureInitialized(): void {
    if (this.initialized) return;
    if (!app.isPackaged) return;

    this.initialized = true;
    autoUpdater.autoDownload = true;
    autoUpdater.allowPrerelease = false;
    autoUpdater.autoInstallOnAppQuit = true;
    this.registerListeners();
  }

  private registerListeners(): void {
    autoUpdater.on('checking-for-update', () => {
      console.log('[UpdateService] Checking for updates...');
      this.sendStatus({ status: UpdateStatus.CHECKING });
    });

    autoUpdater.on('update-available', (info) => {
      console.log('[UpdateService] Update available:', info.version);
      this.sendStatus({ status: UpdateStatus.AVAILABLE, version: info.version });
    });

    autoUpdater.on('update-not-available', (info) => {
      console.log('[UpdateService] No update available. Current version:', info.version);
      this.sendStatus({ status: UpdateStatus.NOT_AVAILABLE, version: info.version });
    });

    autoUpdater.on('download-progress', (progress) => {
      console.log(`[UpdateService] Download progress: ${progress.percent.toFixed(1)}%`);
      this.sendStatus({ status: UpdateStatus.DOWNLOADING, progress: progress.percent });
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log('[UpdateService] Update downloaded:', info.version);
      this.sendStatus({ status: UpdateStatus.DOWNLOADED, version: info.version });
    });

    autoUpdater.on('error', (error) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const safeMessage =
        errorMessage.length > 200 ? `${errorMessage.slice(0, 200)}...` : errorMessage;
      const errorDetails = {
        message: safeMessage,
        name: error instanceof Error ? error.name : undefined,
        stack: error instanceof Error ? error.stack : undefined,
        code: (error as { code?: string | number }).code,
        statusCode: (error as { statusCode?: number }).statusCode,
      };
      console.error('[UpdateService] Error:', errorDetails);
      this.sendStatus({ status: UpdateStatus.ERROR, error: safeMessage });
    });
  }

  private sendStatus(data: UpdateStatusData): void {
    windowManager.sendToRenderer(IPC_CHANNELS.EVENTS.UPDATER_STATUS, data);
  }

  async checkForUpdates(): Promise<void> {
    this.ensureInitialized();
    if (!this.initialized) return;
    if (this.isChecking) return;

    this.isChecking = true;
    try {
      await autoUpdater.checkForUpdates();
    } finally {
      this.isChecking = false;
    }
  }

  quitAndInstall(): void {
    this.ensureInitialized();
    autoUpdater.quitAndInstall();
  }
}

export const updateService = UpdateService.getInstance();
