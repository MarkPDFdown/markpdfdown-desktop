import { beforeEach, describe, expect, it, vi } from 'vitest'

const handlers = new Map<string, (...args: any[]) => any>()
const AUTH_CHANNELS = ['auth:login', 'auth:cancelLogin', 'auth:logout', 'auth:getAuthState']

const mockIpcMain = {
  handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
    if (handlers.has(channel)) {
      throw new Error(`Attempted to register a second handler for '${channel}'`)
    }
    handlers.set(channel, handler)
  }),
}

const mockAuthManager = {
  startDeviceLogin: vi.fn(),
  cancelLogin: vi.fn(),
  logout: vi.fn(),
  getAuthState: vi.fn(),
}

vi.mock('electron', () => ({
  ipcMain: mockIpcMain,
}))

vi.mock('../../../../core/infrastructure/services/AuthManager.js', () => ({
  authManager: mockAuthManager,
}))

describe('auth.handler', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    handlers.clear()

    const mod = await import('../auth.handler.js')
    mod.registerAuthHandlers()
  })

  it('registers auth handlers', () => {
    expect(Array.from(handlers.keys()).sort()).toEqual([...AUTH_CHANNELS].sort())
    expect(mockIpcMain.handle).toHaveBeenCalledTimes(AUTH_CHANNELS.length)
  })

  it('throws when registering auth handlers twice', async () => {
    const mod = await import('../auth.handler.js')
    expect(() => mod.registerAuthHandlers()).toThrow("Attempted to register a second handler for 'auth:login'")
  })

  it('auth:login returns manager result on success', async () => {
    mockAuthManager.startDeviceLogin.mockResolvedValueOnce({ success: true, data: { status: 'started' } })
    const result = await handlers.get('auth:login')!({}, undefined)
    expect(result).toEqual({ success: true, data: { status: 'started' } })
  })

  it('auth:login wraps thrown error', async () => {
    mockAuthManager.startDeviceLogin.mockRejectedValueOnce(new Error('login failed'))
    const result = await handlers.get('auth:login')!({}, undefined)
    expect(result).toEqual({ success: false, error: 'login failed' })
  })

  it('auth:cancelLogin succeeds', async () => {
    const result = await handlers.get('auth:cancelLogin')!({}, undefined)
    expect(mockAuthManager.cancelLogin).toHaveBeenCalled()
    expect(result).toEqual({ success: true })
  })

  it('auth:cancelLogin wraps thrown error', async () => {
    mockAuthManager.cancelLogin.mockImplementationOnce(() => {
      throw new Error('cancel failed')
    })
    const result = await handlers.get('auth:cancelLogin')!({}, undefined)
    expect(result).toEqual({ success: false, error: 'cancel failed' })
  })

  it('auth:logout succeeds', async () => {
    mockAuthManager.logout.mockResolvedValueOnce(undefined)
    const result = await handlers.get('auth:logout')!({}, undefined)
    expect(mockAuthManager.logout).toHaveBeenCalled()
    expect(result).toEqual({ success: true })
  })

  it('auth:logout wraps thrown error', async () => {
    mockAuthManager.logout.mockRejectedValueOnce(new Error('logout failed'))
    const result = await handlers.get('auth:logout')!({}, undefined)
    expect(result).toEqual({ success: false, error: 'logout failed' })
  })

  it('auth:getAuthState returns state payload', async () => {
    mockAuthManager.getAuthState.mockReturnValueOnce({
      isAuthenticated: true,
      isLoading: false,
      deviceFlowStatus: 'idle',
      userCode: null,
      verificationUrl: null,
      error: null,
      user: { id: 1, email: 'u@example.com', name: 'U', avatar_url: null },
    })

    const result = await handlers.get('auth:getAuthState')!({}, undefined)
    expect(result.success).toBe(true)
    expect(result.data?.isAuthenticated).toBe(true)
  })

  it('auth:getAuthState wraps thrown error', async () => {
    mockAuthManager.getAuthState.mockImplementationOnce(() => {
      throw new Error('state failed')
    })
    const result = await handlers.get('auth:getAuthState')!({}, undefined)
    expect(result).toEqual({ success: false, error: 'state failed' })
  })
})
