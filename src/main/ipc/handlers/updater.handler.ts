import { ipcMain, app } from 'electron';
import { IPC_CHANNELS } from '../../../shared/ipc/channels.js';
import { updateService } from '../../services/UpdateService.js';

export function registerUpdaterHandlers() {
  ipcMain.handle(IPC_CHANNELS.UPDATER.CHECK_FOR_UPDATES, async () => {
    if (!app.isPackaged) {
      console.log('[Updater] Skipping update check in development mode');
      return;
    }
    await updateService.checkForUpdates();
  });

  ipcMain.handle(IPC_CHANNELS.UPDATER.QUIT_AND_INSTALL, () => {
    updateService.quitAndInstall();
  });
}
