import { vi } from 'vitest'

// Set test DATABASE_URL
process.env.DATABASE_URL = 'file:./test.db'

// Mock electron
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      const paths: Record<string, string> = {
        userData: '/mock/userdata',
        appData: '/mock/appdata',
        temp: '/mock/temp'
      }
      return paths[name] || '/mock/default'
    }),
    isPackaged: false
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    once: vi.fn()
  },
  dialog: {
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn(),
    showMessageBox: vi.fn()
  },
  BrowserWindow: vi.fn()
}))

// Mock electron-is-dev
vi.mock('electron-is-dev', () => ({
  default: true
}))

// Mock global fetch for LLM API calls
global.fetch = vi.fn()

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks()
})
