const { contextBridge, ipcRenderer } = require('electron');

// 在window对象上暴露electron模块，允许渲染进程访问
contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    send: (channel, data) => {
      // 白名单频道
      const validChannels = ['open-external-link'];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, data);
      }
    },
    on: (channel, func) => {
      const validChannels = [];
      if (validChannels.includes(channel)) {
        // 删除所有现有的监听器，避免重复监听
        ipcRenderer.removeAllListeners(channel);
        // 添加新的监听器
        ipcRenderer.on(channel, (event, ...args) => func(...args));
      }
    }
  }
}); 