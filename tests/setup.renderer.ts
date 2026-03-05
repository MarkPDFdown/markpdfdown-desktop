import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock window.api for renderer process
const mockWindowApi = {
  platform: 'win32',
  provider: {
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    updateStatus: vi.fn(),
    getPresets: vi.fn(),
    fetchModelList: vi.fn(),
  },
  model: {
    getAll: vi.fn(),
    getByProvider: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
  task: {
    create: vi.fn(),
    getAll: vi.fn(),
    getById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    hasRunningTasks: vi.fn(),
  },
  taskDetail: {
    getByPage: vi.fn(),
    getAllByTask: vi.fn(),
    retry: vi.fn(),
    retryFailed: vi.fn(),
  },
  file: {
    selectDialog: vi.fn(),
    upload: vi.fn(),
    uploadFileContent: vi.fn(),
    getImagePath: vi.fn(),
    downloadMarkdown: vi.fn(),
    copyImageToClipboard: vi.fn(),
  },
  completion: {
    markImagedown: vi.fn(),
    testConnection: vi.fn(),
  },
  window: {
    minimize: vi.fn(),
    maximize: vi.fn(),
    close: vi.fn(),
  },
  shell: {
    openExternal: vi.fn(),
  },
  updater: {
    checkForUpdates: vi.fn(),
    quitAndInstall: vi.fn(),
  },
  app: {
    getVersion: vi.fn(),
  },
  auth: {
    login: vi.fn().mockResolvedValue({ success: true }),
    cancelLogin: vi.fn().mockResolvedValue({ success: true }),
    logout: vi.fn().mockResolvedValue({ success: true }),
    getAuthState: vi.fn().mockResolvedValue({
      success: true,
      data: {
        isAuthenticated: false,
        isLoading: false,
        user: null,
        deviceFlowStatus: 'idle',
        userCode: null,
        verificationUrl: null,
        error: null,
      },
    }),
  },
  cloud: {
    convert: vi.fn(),
    getTasks: vi.fn(),
    getTaskById: vi.fn(),
    getTaskPages: vi.fn(),
    cancelTask: vi.fn(),
    retryTask: vi.fn(),
    deleteTask: vi.fn(),
    retryPage: vi.fn(),
    getTaskResult: vi.fn(),
    downloadPdf: vi.fn(),
    getPageImage: vi.fn(),
    createCheckout: vi.fn(),
    getCheckoutStatus: vi.fn(),
    reconcileCheckout: vi.fn(),
    getCredits: vi.fn(),
    getCreditHistory: vi.fn(),
    getPaymentHistory: vi.fn(),
    sseConnect: vi.fn(),
    sseDisconnect: vi.fn(),
    sseResetAndDisconnect: vi.fn(),
  },
  events: {
    onTaskEvent: vi.fn(() => () => {}),
    onTaskDetailEvent: vi.fn(() => () => {}),
    onAuthStateChanged: vi.fn(() => () => {}),
    onCloudTaskEvent: vi.fn(() => () => {}),
    onPaymentCallback: vi.fn(() => () => {}),
    onUpdaterStatus: vi.fn(() => () => {}),
  },
}

Object.defineProperty(window, 'api', {
  value: mockWindowApi,
  writable: true,
  configurable: true,
})

Object.defineProperty(window, 'electron', {
  value: {
    ipcRenderer: {
      send: vi.fn(),
    },
  },
  writable: true,
  configurable: true,
})

// Mock matchMedia for Ant Design components
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock ResizeObserver for Ant Design Splitter and other components
class ResizeObserverMock {
  observe = vi.fn()

  unobserve = vi.fn()

  disconnect = vi.fn()
}
Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: ResizeObserverMock,
})

const originalGetComputedStyle = window.getComputedStyle.bind(window)

// Keep real style computation so existing style assertions continue to work.
// Fallback only when jsdom cannot handle pseudo-element/style edge cases.
Object.defineProperty(window, 'getComputedStyle', {
  writable: true,
  value: (element: Element, pseudoElt?: string | null) => {
    try {
      if (pseudoElt) {
        return originalGetComputedStyle(element)
      }
      return originalGetComputedStyle(element)
    } catch {
      return {
        getPropertyValue: () => '',
        overflow: 'auto',
        overflowX: 'auto',
        overflowY: 'auto',
        display: 'block',
        position: 'static',
      } as CSSStyleDeclaration
    }
  },
})

if (!window.URL.createObjectURL) {
  window.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
}

if (!window.URL.revokeObjectURL) {
  window.URL.revokeObjectURL = vi.fn()
}

if (!window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
}

Object.defineProperty(navigator, 'clipboard', {
  configurable: true,
  value: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
})

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks()

  // Default resolved values
  mockWindowApi.model.getAll.mockResolvedValue({ success: true, data: [] })
  mockWindowApi.provider.getPresets.mockResolvedValue({ success: true, data: [] })
  mockWindowApi.file.selectDialog.mockResolvedValue({ success: true, data: { canceled: true, filePaths: [] } })
  mockWindowApi.file.copyImageToClipboard.mockResolvedValue({ success: true, data: { copied: true } })
  mockWindowApi.task.create.mockResolvedValue({ success: true, data: [] })

  mockWindowApi.cloud.getTasks.mockResolvedValue({ success: true, data: [], pagination: { page: 1, page_size: 10, total: 0, total_pages: 0 } })
  mockWindowApi.cloud.getTaskPages.mockResolvedValue({ success: true, data: [], pagination: { page: 1, page_size: 10, total: 0, total_pages: 0 } })
  mockWindowApi.cloud.getTaskById.mockResolvedValue({ success: false, error: 'Not found' })
  mockWindowApi.cloud.getCredits.mockResolvedValue({ success: true, data: { total_available: 0, bonus: { daily_remaining: 0, daily_limit: 200, daily_used: 0, balance: 0, daily_reset_at: '', monthly_reset_at: '' }, paid: { balance: 0 } } })
})
