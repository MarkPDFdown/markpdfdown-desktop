import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockIpcMain, initDatabase } = vi.hoisted(() => ({
  mockIpcMain: { handle: vi.fn() },
  initDatabase: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: mockIpcMain,
  app: { isPackaged: true, getVersion: () => '1.2.3' }
}))
vi.mock('../../../../core/infrastructure/db/index.js', () => ({ initDatabase }))

import { registerAppHandlers } from '../app.handler.js'

const handlerOf = (channel: string) =>
  mockIpcMain.handle.mock.calls.find(([name]) => name === channel)?.[1]

describe('app handlers', () => {
  beforeEach(() => {
    mockIpcMain.handle.mockReset()
    initDatabase.mockReset()
    registerAppHandlers()
  })

  it('returns the app version', () => {
    expect(handlerOf('app:getVersion')()).toBe('1.2.3')
  })

  it('passes on the outcome of the database initialization', async () => {
    initDatabase.mockResolvedValue({ success: false, error: 'no engine' })

    await expect(handlerOf('app:getDatabaseStatus')()).resolves.toEqual({
      success: false,
      error: 'no engine'
    })
  })
})
