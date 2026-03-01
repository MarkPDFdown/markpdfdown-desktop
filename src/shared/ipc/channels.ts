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

  // Auth channels
  AUTH: {
    LOGIN: 'auth:login',
    CANCEL_LOGIN: 'auth:cancelLogin',
    LOGOUT: 'auth:logout',
    GET_AUTH_STATE: 'auth:getAuthState',
  },

  // Cloud channels
  CLOUD: {
    CONVERT: 'cloud:convert',
    GET_TASKS: 'cloud:getTasks',
    GET_TASK_BY_ID: 'cloud:getTaskById',
    GET_TASK_PAGES: 'cloud:getTaskPages',
    CANCEL_TASK: 'cloud:cancelTask',
    RETRY_TASK: 'cloud:retryTask',
    RETRY_PAGE: 'cloud:retryPage',
    GET_TASK_RESULT: 'cloud:getTaskResult',
    DOWNLOAD_PDF: 'cloud:downloadPdf',
    GET_CREDITS: 'cloud:getCredits',
    GET_CREDIT_HISTORY: 'cloud:getCreditHistory',
    GET_PAGE_IMAGE: 'cloud:getPageImage',
    SSE_CONNECT: 'cloud:sseConnect',
    SSE_DISCONNECT: 'cloud:sseDisconnect',
  },

  // Event channels (for event bridge)
  EVENTS: {
    TASK: 'task:event',
    TASK_DETAIL: 'taskDetail:event',
    APP_READY: 'app:ready',
    UPDATER_STATUS: 'updater:status',
    AUTH_STATE_CHANGED: 'auth:stateChanged',
    CLOUD_TASK_EVENT: 'cloud:taskEvent',
  },

  // Updater channels
  UPDATER: {
    CHECK_FOR_UPDATES: 'updater:checkForUpdates',
    QUIT_AND_INSTALL: 'updater:quitAndInstall',
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
  | typeof IPC_CHANNELS.AUTH[keyof typeof IPC_CHANNELS.AUTH]
  | typeof IPC_CHANNELS.CLOUD[keyof typeof IPC_CHANNELS.CLOUD]
  | typeof IPC_CHANNELS.UPDATER[keyof typeof IPC_CHANNELS.UPDATER]
  | typeof IPC_CHANNELS.EVENTS[keyof typeof IPC_CHANNELS.EVENTS]
  | typeof IPC_CHANNELS.WINDOW[keyof typeof IPC_CHANNELS.WINDOW];
