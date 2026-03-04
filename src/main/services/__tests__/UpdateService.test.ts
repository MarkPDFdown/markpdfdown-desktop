import { beforeEach, describe, expect, it, vi } from 'vitest'

const handlers: Record<string, (...args: any[]) => void> = {}
const expectedUpdaterEvents = [
  'checking-for-update',
  'update-available',
  'update-not-available',
  'download-progress',
  'update-downloaded',
  'error',
]

const mockAutoUpdater = {
  autoDownload: false,
  allowPrerelease: true,
  autoInstallOnAppQuit: false,
  on: vi.fn((event: string, cb: (...args: any[]) => void) => {
    handlers[event] = cb
  }),
  checkForUpdates: vi.fn().mockResolvedValue(undefined),
  quitAndInstall: vi.fn(),
}

const mockSendToRenderer = vi.fn()
const mockIsPackaged = vi.fn(() => true)

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return mockIsPackaged()
    },
  },
}))

vi.mock('electron-updater', () => ({
  default: {
    autoUpdater: mockAutoUpdater,
  },
}))

vi.mock('../../WindowManager.js', () => ({
  windowManager: {
    sendToRenderer: mockSendToRenderer,
  },
}))

describe('UpdateService', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    Object.keys(handlers).forEach((k) => delete handlers[k])
    mockIsPackaged.mockReturnValue(true)
  })

  it('skips checks in dev mode', async () => {
    mockIsPackaged.mockReturnValue(false)
    const { updateService } = await import('../UpdateService.js')

    await updateService.checkForUpdates()

    expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled()
    expect(mockAutoUpdater.on).not.toHaveBeenCalled()
  })

  it('initializes autoUpdater once and checks updates', async () => {
    const { updateService } = await import('../UpdateService.js')

    await updateService.checkForUpdates()
    await updateService.checkForUpdates()

    const registeredEvents = mockAutoUpdater.on.mock.calls.map(([event]) => event)
    expect(registeredEvents.sort()).toEqual([...expectedUpdaterEvents].sort())
    expect(mockAutoUpdater.on).toHaveBeenCalledTimes(expectedUpdaterEvents.length)
    expect(mockAutoUpdater.autoDownload).toBe(true)
    expect(mockAutoUpdater.allowPrerelease).toBe(false)
    expect(mockAutoUpdater.autoInstallOnAppQuit).toBe(true)
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(2)
  })

  it('guards concurrent checkForUpdates calls', async () => {
    let resolveCheck: (() => void) | null = null
    mockAutoUpdater.checkForUpdates.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveCheck = resolve
        }),
    )

    const { updateService } = await import('../UpdateService.js')

    const first = updateService.checkForUpdates()
    const second = updateService.checkForUpdates()

    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(1)

    resolveCheck?.()
    await first
    await second
  })

  it('forwards updater events to renderer', async () => {
    const { updateService } = await import('../UpdateService.js')
    await updateService.checkForUpdates()

    handlers['checking-for-update']()
    handlers['update-available']({ version: '1.2.3' })
    handlers['update-not-available']({ version: '1.0.0' })
    handlers['download-progress']({ percent: 42.6 })
    handlers['update-downloaded']({ version: '1.2.3' })

    expect(mockSendToRenderer).toHaveBeenCalledWith('updater:status', { status: 'checking' })
    expect(mockSendToRenderer).toHaveBeenCalledWith('updater:status', { status: 'available', version: '1.2.3' })
    expect(mockSendToRenderer).toHaveBeenCalledWith('updater:status', { status: 'not_available', version: '1.0.0' })
    expect(mockSendToRenderer).toHaveBeenCalledWith('updater:status', { status: 'downloading', progress: 42.6 })
    expect(mockSendToRenderer).toHaveBeenCalledWith('updater:status', { status: 'downloaded', version: '1.2.3' })
  })

  it('formats updater error payloads with deterministic truncation', async () => {
    const { updateService } = await import('../UpdateService.js')
    await updateService.checkForUpdates()

    handlers.error(new Error('short'))
    expect(mockSendToRenderer.mock.calls.at(-1)?.[1]).toEqual({ status: 'error', error: 'short' })

    const exactlyLimit = 'a'.repeat(200)
    handlers.error(new Error(exactlyLimit))
    expect(mockSendToRenderer.mock.calls.at(-1)?.[1]).toEqual({ status: 'error', error: exactlyLimit })

    const overLimit = 'b'.repeat(201)
    handlers.error(new Error(overLimit))
    expect(mockSendToRenderer.mock.calls.at(-1)?.[1]).toEqual({ status: 'error', error: `${'b'.repeat(200)}...` })

    handlers.error('plain-error')
    expect(mockSendToRenderer.mock.calls.at(-1)?.[1]).toEqual({ status: 'error', error: 'plain-error' })
  })

  it('quitAndInstall delegates to autoUpdater', async () => {
    const { updateService } = await import('../UpdateService.js')
    updateService.quitAndInstall()
    expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalled()
  })
})
