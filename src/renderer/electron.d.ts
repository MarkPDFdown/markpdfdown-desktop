/**
 * Electron API 类型定义
 * 为渲染进程提供类型安全的 window.api 接口
 */

// IPC 响应类型
interface IpcResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

// Provider 相关类型
interface Provider {
  id: number;
  name: string;
  type: string;
  api_key: string | null;
  base_url: string | null;
  suffix: string | null;
  status: number;
  createdAt: Date;
  updatedAt: Date;
}

interface CreateProviderDTO {
  name: string;
  type: string;
}

interface UpdateProviderDTO {
  api_key?: string;
  base_url?: string;
  suffix?: string;
}

// Model 相关类型
interface Model {
  id: string;
  provider: number;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

interface ModelGroup {
  provider: number;
  providerName: string;
  models: Model[];
}

interface CreateModelDTO {
  id: string;
  provider: number;
  name: string;
}

// Task 相关类型
interface Task {
  id: string;
  filename: string;
  type: string;
  page_range: string;
  pages: number;
  provider: number;
  model: string;
  model_name: string;
  progress: number;
  status: number;
  completed_count: number;
  failed_count: number;
  worker_id?: string | null;
  merged_path?: string | null;
  error?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// TaskDetail 相关类型
interface TaskDetail {
  id: number;
  task: string;
  page: number;
  page_source: number;
  status: number;
  worker_id?: string | null;
  provider: number;
  model: string;
  content: string;
  error?: string | null;
  retry_count: number;
  createdAt: Date;
  updatedAt: Date;
}

interface TaskDetailWithImage extends TaskDetail {
  imagePath: string;
  imageExists: boolean;
}

// TaskEvent 相关类型
interface TaskEvent {
  type: string;
  taskId: string;
  task?: Partial<Task>;
  timestamp: number;
}

// TaskDetailEvent 相关类型
interface TaskDetailEvent {
  type: string;
  taskId: string;
  pageId: number;
  page: number;
  status: number;
  timestamp: number;
}

interface CreateTaskDTO {
  filename: string;
  type: string;
  page_range?: string;
  pages?: number;
  provider: number;
  model: string;
  model_name: string;
}

interface UpdateTaskDTO {
  status?: number;
  progress?: number;
  [key: string]: any;
}

interface TaskListResponse {
  list: Task[];
  total: number;
}

// File 相关类型
interface FileUploadResult {
  originalName: string;
  savedName: string;
  path: string;
  size: number;
  taskId: string;
}

interface FileDialogResult {
  filePaths: string[];
  canceled: boolean;
}

// 更新状态数据
interface UpdateStatusData {
  status: 'idle' | 'checking' | 'available' | 'not_available' | 'downloading' | 'downloaded' | 'error';
  version?: string;
  progress?: number;
  error?: string;
}

// Electron API 接口定义
// Provider Preset 类型
interface ProviderPreset {
  name: string;
  type: string;
  apiBase: string;
  modelListApi: string;
  modelNameField: string;
  modelIdField: string;
  defaultModels?: Array<{ id: string; name: string }>;
}

interface ElectronAPI {
  provider: {
    getAll: () => Promise<IpcResponse<Provider[]>>;
    getById: (id: number) => Promise<IpcResponse<Provider>>;
    create: (data: CreateProviderDTO) => Promise<IpcResponse<Provider>>;
    update: (
      id: number,
      data: UpdateProviderDTO,
    ) => Promise<IpcResponse<Provider>>;
    delete: (id: number) => Promise<IpcResponse<void>>;
    updateStatus: (
      id: number,
      status: number,
    ) => Promise<IpcResponse<Provider>>;
    getPresets: () => Promise<IpcResponse<ProviderPreset[]>>;
    fetchModelList: (providerId: number) => Promise<IpcResponse<Array<{ id: string; name: string }>>>;
  };

  model: {
    getAll: () => Promise<IpcResponse<ModelGroup[]>>;
    getByProvider: (providerId: number) => Promise<IpcResponse<Model[]>>;
    create: (data: CreateModelDTO) => Promise<IpcResponse<Model>>;
    delete: (
      id: string,
      provider: number,
    ) => Promise<IpcResponse<{ message: string }>>;
  };

  task: {
    create: (tasks: CreateTaskDTO[]) => Promise<IpcResponse<Task[]>>;
    getAll: (params: {
      page: number;
      pageSize: number;
    }) => Promise<IpcResponse<TaskListResponse>>;
    getById: (id: string) => Promise<IpcResponse<Task>>;
    update: (id: string, data: UpdateTaskDTO) => Promise<IpcResponse<Task>>;
    delete: (id: string) => Promise<IpcResponse<Task>>;
    hasRunningTasks: () => Promise<IpcResponse<{ hasRunning: boolean; count: number }>>;
  };

  taskDetail: {
    getByPage: (taskId: string, page: number) => Promise<IpcResponse<TaskDetailWithImage>>;
    getAllByTask: (taskId: string) => Promise<IpcResponse<TaskDetail[]>>;
    retry: (pageId: number) => Promise<IpcResponse<TaskDetail>>;
    retryFailed: (taskId: string) => Promise<IpcResponse<{ retried: number }>>;
  };

  file: {
    selectDialog: () => Promise<IpcResponse<FileDialogResult>>;
    upload: (
      taskId: string,
      filePath: string,
    ) => Promise<IpcResponse<FileUploadResult>>;
    getImagePath: (
      taskId: string,
      page: number,
    ) => Promise<IpcResponse<{ imagePath: string; exists: boolean }>>;
    downloadMarkdown: (
      taskId: string,
    ) => Promise<IpcResponse<{ savedPath: string }>>;
  };

  completion: {
    markImagedown: (
      providerId: number,
      modelId: string,
      url: string,
    ) => Promise<IpcResponse<string>>;
    testConnection: (
      providerId: number,
      modelId: string,
    ) => Promise<IpcResponse<string>>;
  };

  auth: {
    login: () => Promise<IpcResponse<void>>;
    cancelLogin: () => Promise<IpcResponse<void>>;
    logout: () => Promise<IpcResponse<void>>;
    getAuthState: () => Promise<IpcResponse<import('../shared/types/cloud-api').AuthState>>;
  };

  cloud: {
    convert: (fileData: { path?: string; content?: ArrayBuffer; name: string; model?: string }) => Promise<IpcResponse<any>>;
    getTasks: (params: { page: number; pageSize: number }) => Promise<IpcResponse<any>>;
    getCredits: () => Promise<IpcResponse<import('../shared/types/cloud-api').CreditsApiResponse>>;
    getCreditHistory: (params: { page: number; pageSize: number; type?: string }) => Promise<IpcResponse<any>>;
  };

  shell: {
    openExternal: (url: string) => void;
  };

  window: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
  };

  updater: {
    checkForUpdates: () => Promise<void>;
    quitAndInstall: () => Promise<void>;
  };

  events: {
    onTaskEvent: (callback: (event: TaskEvent) => void) => () => void;
    onTaskDetailEvent: (callback: (event: TaskDetailEvent) => void) => () => void;
    onAuthStateChanged: (callback: (state: import('../shared/types/cloud-api').AuthState) => void) => () => void;
    onUpdaterStatus: (callback: (data: UpdateStatusData) => void) => () => void;
  };

  platform: string;

  app: {
    getVersion: () => Promise<IpcResponse<string>>;
  };
}

// 扩展 Window 接口
declare global {
  interface Window {
    api: ElectronAPI;
    // 保留旧的 electron 对象（用于兼容）
    electron?: {
      ipcRenderer: {
        send: (channel: string, data: any) => void;
      };
    };
  }
}

export {};
