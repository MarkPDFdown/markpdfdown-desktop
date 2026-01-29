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
    getById: (id: string) => ipcRenderer.invoke("task:getById", id),
    update: (id: string, data: any) =>
      ipcRenderer.invoke("task:update", id, data),
    delete: (id: string) => ipcRenderer.invoke("task:delete", id),
    hasRunningTasks: () => ipcRenderer.invoke("task:hasRunningTasks"),
  },

  // ==================== TaskDetail APIs ====================
  taskDetail: {
    getByPage: (taskId: string, page: number) =>
      ipcRenderer.invoke("taskDetail:getByPage", taskId, page),
    getAllByTask: (taskId: string) =>
      ipcRenderer.invoke("taskDetail:getAllByTask", taskId),
    retry: (pageId: number) =>
      ipcRenderer.invoke("taskDetail:retry", pageId),
    retryFailed: (taskId: string) =>
      ipcRenderer.invoke("taskDetail:retryFailed", taskId),
  },

  // ==================== File APIs ====================
  file: {
    selectDialog: () => ipcRenderer.invoke("file:selectDialog"),
    upload: (taskId: string, filePath: string) =>
      ipcRenderer.invoke("file:upload", taskId, filePath),
    uploadMultiple: (taskId: string, filePaths: string[]) =>
      ipcRenderer.invoke("file:uploadMultiple", taskId, filePaths),
    uploadFileContent: (taskId: string, fileName: string, fileBuffer: ArrayBuffer) =>
      ipcRenderer.invoke("file:uploadFileContent", taskId, fileName, fileBuffer),
    getImagePath: (taskId: string, page: number) =>
      ipcRenderer.invoke("file:getImagePath", taskId, page),
    downloadMarkdown: (taskId: string) =>
      ipcRenderer.invoke("file:downloadMarkdown", taskId),
  },

  // ==================== Completion APIs ====================
  completion: {
    markImagedown: (providerId: number, modelId: string, url: string) =>
      ipcRenderer.invoke("completion:markImagedown", providerId, modelId, url),
    testConnection: (providerId: number, modelId: string) =>
      ipcRenderer.invoke("completion:testConnection", providerId, modelId),
  },

  // ==================== Cloud APIs ====================
  cloud: {
    setToken: (token: string | null) => ipcRenderer.invoke("cloud:setToken", token),
    convert: (fileData: { path?: string; content?: ArrayBuffer; name: string }) =>
      ipcRenderer.invoke("cloud:convert", fileData),
    getTasks: (params: { page: number; pageSize: number }) =>
      ipcRenderer.invoke("cloud:getTasks", params),
    getCreditHistory: (params: { page: number; pageSize: number }) =>
      ipcRenderer.invoke("cloud:getCreditHistory", params),
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

  // ==================== Event APIs ====================
  events: {
    /**
     * 监听任务事件
     * @param callback 事件回调函数
     * @returns 清理函数
     */
    onTaskEvent: (callback: (event: any) => void) => {
      const handler = (_event: any, data: any) => callback(data);
      ipcRenderer.on('task:event', handler);

      // 返回清理函数
      return () => {
        ipcRenderer.removeListener('task:event', handler);
      };
    },

    /**
     * 监听任务详情（页面）事件
     * @param callback 事件回调函数
     * @returns 清理函数
     */
    onTaskDetailEvent: (callback: (event: any) => void) => {
      const handler = (_event: any, data: any) => callback(data);
      ipcRenderer.on('taskDetail:event', handler);

      // 返回清理函数
      return () => {
        ipcRenderer.removeListener('taskDetail:event', handler);
      };
    },
  },

  // ==================== Platform APIs ====================
  platform: process.platform,

  // ==================== App APIs ====================
  app: {
    getVersion: () => ipcRenderer.invoke("app:getVersion"),
  },
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
