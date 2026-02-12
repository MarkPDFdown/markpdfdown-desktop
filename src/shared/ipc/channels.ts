/**
 * IPC Channel Constants
 *
 * Centralized definition of all IPC channel names used for communication
 * between main process and renderer process.
 */
export const IPC_CHANNELS = {
  // Provider channels
  PROVIDER: {
    GET_ALL: 'provider:getAll',
    GET_BY_ID: 'provider:getById',
    CREATE: 'provider:create',
    UPDATE: 'provider:update',
    DELETE: 'provider:delete',
    UPDATE_STATUS: 'provider:updateStatus',
    GET_PRESETS: 'provider:getPresets',
    FETCH_MODEL_LIST: 'provider:fetchModelList',
  },

  // Model channels
  MODEL: {
    GET_ALL: 'model:getAll',
    GET_BY_PROVIDER: 'model:getByProvider',
    CREATE: 'model:create',
    DELETE: 'model:delete',
  },

  // Task channels
  TASK: {
    CREATE: 'task:create',
    GET_ALL: 'task:getAll',
    GET_BY_ID: 'task:getById',
    UPDATE: 'task:update',
    DELETE: 'task:delete',
    HAS_RUNNING: 'task:hasRunningTasks',
  },

  // Task Detail channels
  TASK_DETAIL: {
    GET_BY_PAGE: 'taskDetail:getByPage',
    GET_ALL_BY_TASK: 'taskDetail:getAllByTask',
    RETRY: 'taskDetail:retry',
    RETRY_FAILED: 'taskDetail:retryFailed',
    GET_COST_STATS: 'taskDetail:getCostStats',
  },

  // File channels
  FILE: {
    GET_IMAGE_PATH: 'file:getImagePath',
    DOWNLOAD_MARKDOWN: 'file:downloadMarkdown',
    SELECT_DIALOG: 'file:selectDialog',
    UPLOAD: 'file:upload',
    UPLOAD_FILE_CONTENT: 'file:uploadFileContent',
  },

  // Completion (LLM) channels
  COMPLETION: {
    MARK_IMAGEDOWN: 'completion:markImagedown',
    TEST_CONNECTION: 'completion:testConnection',
  },

  // Event channels (for event bridge)
  EVENTS: {
    TASK: 'task:event',
    TASK_DETAIL: 'taskDetail:event',
    APP_READY: 'app:ready',
  },

  // Window control channels
  WINDOW: {
    MINIMIZE: 'window:minimize',
    MAXIMIZE: 'window:maximize',
    CLOSE: 'window:close',
  },
} as const;

// Type for IPC channel values
export type IpcChannel =
  | typeof IPC_CHANNELS.PROVIDER[keyof typeof IPC_CHANNELS.PROVIDER]
  | typeof IPC_CHANNELS.MODEL[keyof typeof IPC_CHANNELS.MODEL]
  | typeof IPC_CHANNELS.TASK[keyof typeof IPC_CHANNELS.TASK]
  | typeof IPC_CHANNELS.TASK_DETAIL[keyof typeof IPC_CHANNELS.TASK_DETAIL]
  | typeof IPC_CHANNELS.FILE[keyof typeof IPC_CHANNELS.FILE]
  | typeof IPC_CHANNELS.COMPLETION[keyof typeof IPC_CHANNELS.COMPLETION]
  | typeof IPC_CHANNELS.EVENTS[keyof typeof IPC_CHANNELS.EVENTS]
  | typeof IPC_CHANNELS.WINDOW[keyof typeof IPC_CHANNELS.WINDOW];
