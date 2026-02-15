import { vi } from 'vitest'

export const createMockWindowApi = () => ({
  provider: {
    getAll: vi.fn().mockResolvedValue({ success: true, data: [] }),
    getById: vi.fn().mockResolvedValue({ success: true, data: null }),
    create: vi.fn().mockResolvedValue({ success: true, data: null }),
    update: vi.fn().mockResolvedValue({ success: true, data: null }),
    delete: vi.fn().mockResolvedValue({ success: true }),
    updateStatus: vi.fn().mockResolvedValue({ success: true, data: null })
  },
  model: {
    getAll: vi.fn().mockResolvedValue({ success: true, data: [] }),
    getByProvider: vi.fn().mockResolvedValue({ success: true, data: [] }),
    create: vi.fn().mockResolvedValue({ success: true, data: null }),
    delete: vi.fn().mockResolvedValue({ success: true })
  },
  task: {
    create: vi.fn().mockResolvedValue({ success: true, data: null }),
    getAll: vi.fn().mockResolvedValue({ success: true, data: [] }),
    update: vi.fn().mockResolvedValue({ success: true, data: null }),
    delete: vi.fn().mockResolvedValue({ success: true })
  },
  file: {
    selectDialog: vi.fn().mockResolvedValue({ success: true, data: ['/mock/file.pdf'] }),
    upload: vi.fn().mockResolvedValue({ success: true, data: { path: '/mock/upload.pdf' } })
  },
  completion: {
    markImagedown: vi.fn().mockResolvedValue({ success: true }),
    testConnection: vi.fn().mockResolvedValue({ success: true, data: { connected: true } })
  }
})

export const setupWindowApiMock = () => {
  const mockApi = createMockWindowApi()
  // @ts-expect-error - Mocking window.api
  global.window = { api: mockApi }
  return mockApi
}
