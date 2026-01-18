interface ElectronAPI {
  ipcRenderer: {
    send: (channel: string, data: any) => void;
    on: (channel: string, func: (...args: any[]) => void) => void;
  };
  backendPort: string | null;
}

interface WindowAPI {
  provider: {
    getAll: () => Promise<any>;
    getById: (id: number) => Promise<any>;
    create: (data: any) => Promise<any>;
    update: (id: number, data: any) => Promise<any>;
    delete: (id: number) => Promise<any>;
    updateStatus: (id: number, status: number) => Promise<any>;
  };
  model: {
    getAll: () => Promise<any>;
    getByProvider: (providerId: number) => Promise<any>;
    create: (data: any) => Promise<any>;
    delete: (id: string, provider: number) => Promise<any>;
  };
  task: {
    create: (tasks: any[]) => Promise<any>;
    getAll: (params: { page: number; pageSize: number }) => Promise<any>;
    update: (id: string, data: any) => Promise<any>;
    delete: (id: string) => Promise<any>;
  };
  file: {
    selectDialog: () => Promise<any>;
    upload: (taskId: string, filePath: string) => Promise<any>;
    uploadMultiple: (taskId: string, filePaths: string[]) => Promise<any>;
  };
  completion: {
    markImagedown: (providerId: number, modelId: string, url: string) => Promise<any>;
    testConnection: (providerId: number, modelId: string) => Promise<any>;
  };
  shell: {
    openExternal: (url: string) => void;
  };
  window: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
  };
  platform: NodeJS.Platform;
}

declare interface Window {
  electron: ElectronAPI;
  api: WindowAPI;
} 