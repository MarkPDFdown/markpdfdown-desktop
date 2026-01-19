import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock window.api for renderer process
const mockWindowApi = {
  provider: {
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    updateStatus: vi.fn()
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
    update: vi.fn(),
    delete: vi.fn()
  },
  file: {
    selectDialog: vi.fn(),
    upload: vi.fn(),
    uploadMultiple: vi.fn()
  },
  completion: {
    markImagedown: vi.fn(),
    testConnection: vi.fn()
  }
}

// @ts-expect-error - Mocking window.api
global.window = {
  api: mockWindowApi
}

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks()
})
