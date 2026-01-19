import { vi } from 'vitest'

export const createMockIpcMain = () => ({
  handle: vi.fn(),
  on: vi.fn(),
  once: vi.fn(),
  removeHandler: vi.fn(),
  removeAllListeners: vi.fn()
})

export const createMockDialog = () => ({
  showOpenDialog: vi.fn().mockResolvedValue({
    canceled: false,
    filePaths: ['/mock/file.pdf']
  }),
  showSaveDialog: vi.fn().mockResolvedValue({
    canceled: false,
    filePath: '/mock/save.md'
  }),
  showMessageBox: vi.fn().mockResolvedValue({
    response: 0
  })
})

export const createMockApp = () => ({
  getPath: vi.fn((name: string) => {
    const paths: Record<string, string> = {
      userData: '/mock/userdata',
      appData: '/mock/appdata',
      temp: '/mock/temp',
      downloads: '/mock/downloads'
    }
    return paths[name] || '/mock/default'
  }),
  isPackaged: false,
  getVersion: vi.fn(() => '1.0.0'),
  getName: vi.fn(() => 'MarkPDFdown'),
  quit: vi.fn(),
  exit: vi.fn()
})
