// 任务事件类型
type TaskEventType =
  | 'task:updated'
  | 'task:status_changed'
  | 'task:progress_changed'
  | 'task:deleted';

// 任务类型（简化版，仅包含事件中可能用到的字段）
interface Task {
  id: string;
  status?: number;
  progress?: number;
  [key: string]: any;
}

// 任务事件数据
interface TaskEventData {
  type: TaskEventType;
  taskId: string;
  task?: Partial<Task>;
  timestamp: number;
}

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
    getById: (id: string) => Promise<any>;
    update: (id: string, data: any) => Promise<any>;
    delete: (id: string) => Promise<any>;
  };
  taskDetail: {
    getByPage: (taskId: string, page: number) => Promise<any>;
    getAllByTask: (taskId: string) => Promise<any>;
  };
  file: {
    selectDialog: () => Promise<any>;
    upload: (taskId: string, filePath: string) => Promise<any>;
    uploadMultiple: (taskId: string, filePaths: string[]) => Promise<any>;
    uploadFileContent: (taskId: string, fileName: string, fileBuffer: ArrayBuffer) => Promise<any>;
    getImagePath: (taskId: string, page: number) => Promise<any>;
    downloadMarkdown: (taskId: string) => Promise<any>;
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
  // 事件监听 API
  events: {
    onTaskEvent: (callback: (event: TaskEventData) => void) => () => void;
  };
  platform: NodeJS.Platform;
}

declare interface Window {
  electron: ElectronAPI;
  api: WindowAPI;
} 