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
    fetchModelList: vi.fn()
  },
  model: {
    getAll: vi.fn(),
    getByProvider: vi.fn(),
    create: vi.fn(),
    delete: vi.fn()
  },
  task: {
    create: vi.fn(),
    getAll: vi.fn(),
    getById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    hasRunningTasks: vi.fn()
  },
  taskDetail: {
    getByPage: vi.fn(),
    getAllByTask: vi.fn(),
    retry: vi.fn(),
    retryFailed: vi.fn()
  },
  file: {
    selectDialog: vi.fn(),
    upload: vi.fn(),
    downloadMarkdown: vi.fn()
  },
  completion: {
    markImagedown: vi.fn(),
    testConnection: vi.fn()
  },
  window: {
    minimize: vi.fn(),
    maximize: vi.fn(),
    close: vi.fn()
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
        error: null
      }
    })
  },
  events: {
    onTaskEvent: vi.fn(() => () => {}),
    onTaskDetailEvent: vi.fn(() => () => {}),
    onAuthStateChanged: vi.fn(() => () => {})
  }
}

// Only add the api property to window, don't overwrite the entire window object
Object.defineProperty(window, 'api', {
  value: mockWindowApi,
  writable: true,
  configurable: true
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

// Mock getComputedStyle for rc-util/getScrollBarSize
const originalGetComputedStyle = window.getComputedStyle
Object.defineProperty(window, 'getComputedStyle', {
  writable: true,
  value: (elt: Element, pseudoElt?: string | null) => {
    try {
      return originalGetComputedStyle(elt, pseudoElt)
    } catch {
      // Return a minimal mock for elements that don't work in jsdom
      return {
        getPropertyValue: () => '',
        overflow: 'auto',
        overflowX: 'auto',
        overflowY: 'auto',
      } as CSSStyleDeclaration
    }
  },
})

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks()
  // Reset mock implementations with default resolved values
  mockWindowApi.model.getAll.mockResolvedValue({ success: true, data: [] })
  mockWindowApi.provider.getPresets.mockResolvedValue({ success: true, data: [] })
  mockWindowApi.file.selectDialog.mockResolvedValue({ success: true, data: { canceled: true, filePaths: [] } })
  mockWindowApi.task.create.mockResolvedValue({ success: true, data: [] })
})
