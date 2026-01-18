import { contextBridge, ipcRenderer } from "electron";

/**
 * Preload script - 在渲染进程中暴露安全的 API
 * 使用 contextBridge 确保安全的 IPC 通信
 */

// 暴露新的 IPC API
contextBridge.exposeInMainWorld("api", {
  // ==================== Provider APIs ====================
  provider: {
    getAll: () => ipcRenderer.invoke("provider:getAll"),
    getById: (id: number) => ipcRenderer.invoke("provider:getById", id),
    create: (data: any) => ipcRenderer.invoke("provider:create", data),
    update: (id: number, data: any) =>
      ipcRenderer.invoke("provider:update", id, data),
    delete: (id: number) => ipcRenderer.invoke("provider:delete", id),
    updateStatus: (id: number, status: number) =>
      ipcRenderer.invoke("provider:updateStatus", id, status),
  },

  // ==================== Model APIs ====================
  model: {
    getAll: () => ipcRenderer.invoke("model:getAll"),
    getByProvider: (providerId: number) =>
      ipcRenderer.invoke("model:getByProvider", providerId),
    create: (data: any) => ipcRenderer.invoke("model:create", data),
    delete: (id: string, provider: number) =>
      ipcRenderer.invoke("model:delete", id, provider),
  },

  // ==================== Task APIs ====================
  task: {
    create: (tasks: any[]) => ipcRenderer.invoke("task:create", tasks),
    getAll: (params: { page: number; pageSize: number }) =>
      ipcRenderer.invoke("task:getAll", params),
    update: (id: string, data: any) =>
      ipcRenderer.invoke("task:update", id, data),
    delete: (id: string) => ipcRenderer.invoke("task:delete", id),
  },

  // ==================== File APIs ====================
  file: {
    selectDialog: () => ipcRenderer.invoke("file:selectDialog"),
    upload: (taskId: string, filePath: string) =>
      ipcRenderer.invoke("file:upload", taskId, filePath),
    uploadMultiple: (taskId: string, filePaths: string[]) =>
      ipcRenderer.invoke("file:uploadMultiple", taskId, filePaths),
  },

  // ==================== Completion APIs ====================
  completion: {
    markImagedown: (providerId: number, modelId: string, url: string) =>
      ipcRenderer.invoke("completion:markImagedown", providerId, modelId, url),
    testConnection: (providerId: number, modelId: string) =>
      ipcRenderer.invoke("completion:testConnection", providerId, modelId),
  },

  // ==================== Shell APIs ====================
  shell: {
    openExternal: (url: string) => ipcRenderer.send("open-external-link", url),
  },

  // ==================== Window APIs ====================
  window: {
    minimize: () => ipcRenderer.send("window:minimize"),
    maximize: () => ipcRenderer.send("window:maximize"),
    close: () => ipcRenderer.send("window:close"),
  },

  // ==================== Platform APIs ====================
  platform: process.platform,
});

// 保留旧的 electron 对象以兼容 Layout.tsx（仅用于 shell.openExternal）
contextBridge.exposeInMainWorld("electron", {
  ipcRenderer: {
    send: (channel: string, data: any) => {
      const validChannels = ["open-external-link"];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, data);
      }
    },
  },
});
