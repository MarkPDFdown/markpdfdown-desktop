import { contextBridge, ipcRenderer } from 'electron';

// 从命令行参数中提取端口号
const getBackendPort = (): string | null => {
  const args = process.argv || [];
  const portArg = args.find(arg => arg.startsWith('--backend-port='));
  return portArg ? portArg.split('=')[1] : null;
};

// 在window对象上暴露electron模块，允许渲染进程访问
contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    send: (channel: string, data: any) => {
      // 白名单频道
      const validChannels = ['open-external-link'];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, data);
      }
    },
    on: (channel: string, func: (...args: any[]) => void) => {
      const validChannels: string[] = [];
      if (validChannels.includes(channel)) {
        // 删除所有现有的监听器，避免重复监听
        ipcRenderer.removeAllListeners(channel);
        // 添加新的监听器
        ipcRenderer.on(channel, (event, ...args) => func(...args));
      }
    }
  },
  backendPort: getBackendPort()
}); 